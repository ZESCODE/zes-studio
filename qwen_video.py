#!/usr/bin/env python3
"""ZES Studio Qwen video worker.

Generates a text-to-video clip by talking to chat.qwen.ai's web API directly
(the same endpoints used by https://github.com/wwwzhouhui/qwen3-reverse), then
streams the first CDN URL into ``renders/qwen_<timestamp>.mp4`` via a
temporary ``.part`` file and prints structured progress lines for the Node
job queue:

    PROGRESS 5
    PROGRESS 40
    OUTPUT /absolute/path/renders/qwen_<timestamp>.mp4
    PROGRESS 100

Why not ``qwen_reverse.Video``? Version 0.1.6 only emits ``image_gen`` SSE
events, so ``video_gen`` chunks (where the t2v URL lives) are dropped. The
direct implementation below keeps every URL-bearing chunk, and unlike the
library it forwards your real browser ``QWEN_COOKIES`` alongside the token —
which is what the qwen3-reverse project does to get past Aliyun's WAF.

Secrets are never stored in this repository. The worker reads them from the
environment first, then an optional gitignored ``config.json`` at the repo
root, then qwen-reverse's cached OAuth credentials (SharedTokenManager).

Environment / config.json keys (case-insensitive aliases supported):
    QWEN_TOKEN       logged-in chat.qwen.ai bearer token; if omitted it is
                     read from the ``token`` cookie inside QWEN_COOKIES
    QWEN_COOKIES     full browser Cookie header copied from DevTools
    QWEN_PROXY       optional HTTP(S) proxy
    QWEN_MODEL       chat.qwen.ai model override
    QWEN_TIMEOUT     generation timeout in seconds (default 600)
    QWEN_ALLOW_ANONYMOUS=1  allow a guest request without a token
"""

from __future__ import annotations

import argparse
import asyncio
import html
import json
import os
import re
import sys
import threading
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
RENDERS_DIR = ROOT / "renders"
QWEN_URL = "https://chat.qwen.ai"
URL_RE = re.compile(r"https?://[^\s<>\]\)}'\"]+", re.IGNORECASE)
PROGRESS_LOCK = threading.Lock()
LAST_PROGRESS = -1

# Mirrors qwen_reverse.client.DEFAULT_HEADERS plus the anti-bot cookies that
# the qwen3-reverse project sends. Kept local so a library upgrade cannot
# silently change the transport out from under the worker.
WEB_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": QWEN_URL,
    "Referer": f"{QWEN_URL}/",
    "Content-Type": "application/json",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Connection": "keep-alive",
    "X-Requested-With": "XMLHttpRequest",
    "source": "web",
    "version": "0.2.84",
    "X-Accel-Buffering": "no",
    "bx-v": "2.5.37",
}


def emit(line: str) -> None:
    print(line, flush=True)


def emit_progress(value: int) -> None:
    global LAST_PROGRESS
    pct = max(0, min(100, int(value)))
    with PROGRESS_LOCK:
        if pct <= LAST_PROGRESS:
            return
        LAST_PROGRESS = pct
    emit(f"PROGRESS {pct}")


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def first_nonempty(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def load_config() -> dict[str, Any]:
    candidates = [ROOT / "config.json", Path.cwd() / "config.json"]
    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved in seen or not candidate.is_file():
            continue
        seen.add(resolved)
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Cannot read {candidate.name}: {exc}") from exc
    return {}


def secret(cfg: dict[str, Any], env_name: str, *aliases: str) -> str:
    from_env = os.environ.get(env_name, "").strip()
    if from_env:
        return from_env
    keys = [env_name, env_name.lower(), *aliases]
    for key in keys:
        value = cfg.get(key)
        if isinstance(value, (str, int, float)) and str(value).strip():
            return str(value).strip()
    return ""


async def shared_token_fallback() -> str:
    """Use qwen-reverse's cached OAuth credentials (see SETUP.md)."""
    try:
        from qwen_reverse.auth import QwenOAuth2Client  # type: ignore

        token = await asyncio.wait_for(QwenOAuth2Client().get_access_token(), timeout=12)
        if isinstance(token, str) and token.strip():
            return token.strip()
    except Exception:
        pass

    # Direct read of the same cache handles an unexpired token even when the
    # refresh helper cannot reach the network (e.g. offline phone).
    try:
        creds_path = Path.home() / ".qwen" / "oauth_creds.json"
        creds = json.loads(creds_path.read_text(encoding="utf-8"))
        token = str(creds.get("access_token") or "").strip()
        expiry = float(creds.get("expiry_date") or 0)
        if token and (not expiry or expiry > time.time() * 1000 + 30_000):
            return token
    except Exception:
        pass
    return ""


def build_proxy_opener(proxy: str):
    if not proxy:
        return urllib.request.build_opener()
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    )


def stream_download(url: str, part_path: Path, proxy: str) -> int:
    """Stream a CDN URL to disk in a worker thread, reporting 70..95%."""
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Linux; Android) ZES-Studio/2.0",
            "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8",
        },
    )
    opener = build_proxy_opener(proxy)
    last_reported = 69

    with opener.open(request, timeout=90) as response, part_path.open("wb") as handle:
        status = getattr(response, "status", None) or response.getcode()
        if status and int(status) >= 400:
            raise RuntimeError(f"CDN returned HTTP {status}")
        content_length = 0
        try:
            content_length = int(response.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            content_length = 0

        written = 0
        while True:
            chunk = response.read(256 * 1024)
            if not chunk:
                break
            handle.write(chunk)
            written += len(chunk)
            if content_length > 0:
                pct = 70 + int((written / content_length) * 25)
                pct = min(95, pct)
                if pct > last_reported:
                    emit_progress(pct)
                    last_reported = pct
            elif written // (2 * 1024 * 1024) > last_reported - 70:
                # Unknown length: advance gently every ~2 MB, capped at 90.
                pct = min(90, 70 + written // (2 * 1024 * 1024))
                if pct > last_reported:
                    emit_progress(pct)
                    last_reported = pct

    if not part_path.is_file() or part_path.stat().st_size < 1024:
        raise RuntimeError("Downloaded clip is empty or too small to be a valid MP4")
    return part_path.stat().st_size


def parse_cookies(raw: str) -> dict[str, str]:
    """Parse a DevTools ``Cookie`` header into a name->value mapping."""
    pairs: dict[str, str] = {}
    for part in (raw or "").split(";"):
        if "=" not in part:
            continue
        key, value = part.strip().split("=", 1)
        if key:
            pairs[key] = value
    return pairs


def build_cookie_header(user_cookies: str) -> str:
    """Merge real browser cookies with qwen-reverse's anti-bot cookies."""
    merged = parse_cookies(user_cookies)
    try:
        from qwen_reverse.cookies import generate_cookies  # type: ignore

        generated = generate_cookies()
        for key in ("ssxmod_itna", "ssxmod_itna2"):
            merged.setdefault(key, str(generated.get(key, "")))
    except Exception:
        pass
    return "; ".join(f"{k}={v}" for k, v in merged.items() if v)


async def build_headers(token: str, cookies: str, proxy: str) -> dict[str, str]:
    headers = dict(WEB_HEADERS)
    cookie_header = build_cookie_header(cookies)
    if cookie_header:
        headers["Cookie"] = cookie_header
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        from qwen_reverse.client import _attach_extra_headers  # type: ignore

        await _attach_extra_headers(headers, proxy or None)
    except Exception:
        pass
    headers["x-request-id"] = str(uuid.uuid4())
    return headers


def collect_urls(value: Any, out: list[str], seen: set[str]) -> None:
    """Recursively pull every http(s) URL out of an SSE payload fragment."""
    if isinstance(value, str):
        for match in URL_RE.finditer(html.unescape(value)):
            url = match.group(0).rstrip(").,;]}>'\"")
            if url not in seen:
                seen.add(url)
                out.append(url)
    elif isinstance(value, dict):
        for item in value.values():
            collect_urls(item, out, seen)
    elif isinstance(value, (list, tuple)):
        for item in value:
            collect_urls(item, out, seen)


async def iter_sse(response: Any):
    """Yield decoded JSON objects from an aiohttp SSE response."""
    while True:
        raw = await response.content.readline()
        if not raw:
            return
        line = raw.decode("utf-8", errors="replace").strip()
        if not line or not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            return
        try:
            yield json.loads(payload)
        except json.JSONDecodeError:
            continue


async def generate_urls_direct(
    prompt: str,
    aspect_ratio: str,
    token: str,
    cookies: str,
    model: str,
    proxy: str,
    timeout: int,
) -> list[str]:
    """Create a t2v chat and collect video URLs from the SSE stream."""
    try:
        import aiohttp  # type: ignore
    except Exception as exc:  # pragma: no cover - aiohttp ships with qwen-reverse
        raise RuntimeError(
            "aiohttp is required for Qwen t2v. In Termux run: pip install aiohttp"
        ) from exc

    headers = await build_headers(token, cookies, proxy)
    now = int(time.time() * 1000)
    chat_mode = "guest" if not token else "normal"
    client_timeout = aiohttp.ClientTimeout(total=timeout)

    async with aiohttp.ClientSession(headers=headers, timeout=client_timeout) as session:
        chat_payload = {
            "title": "ZES Studio t2v",
            "models": [model],
            "chat_mode": chat_mode,
            "chat_type": "t2v",
            "timestamp": now,
            "project_id": "",
        }
        async with session.post(
            f"{QWEN_URL}/api/v2/chats/new",
            json=chat_payload,
            proxy=proxy or None,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            text = await resp.text()
            if text.strip().startswith("<"):
                raise RuntimeError("WAF blocked chat creation (HTML response)")
            if resp.status != 200:
                raise RuntimeError(f"chat creation failed: HTTP {resp.status} {text[:160]}")
            try:
                data = json.loads(text)
            except json.JSONDecodeError as exc:
                raise RuntimeError(f"chat creation returned non-JSON: {text[:160]}") from exc
            chat_id = (data.get("data") or {}).get("id")
            if not (data.get("success") and chat_id):
                raise RuntimeError(f"chat creation rejected: {text[:200]}")

        emit(f"Created Qwen t2v chat {chat_id}")
        emit_progress(15)

        message_id = str(uuid.uuid4())
        msg_payload = {
            "stream": True,
            "version": "2.1",
            "incremental_output": True,
            "chat_id": chat_id,
            "chat_mode": chat_mode,
            "model": model,
            "parent_id": None,
            "messages": [
                {
                    "fid": message_id,
                    "parentId": None,
                    "childrenIds": [],
                    "role": "user",
                    "content": prompt,
                    "user_action": "chat",
                    "files": [],
                    "timestamp": now,
                    "models": [model],
                    "chat_type": "t2v",
                    "feature_config": {
                        "thinking_enabled": False,
                        "output_schema": "phase",
                    },
                    "extra": {"meta": {"subChatType": "t2v"}},
                    "sub_chat_type": "t2v",
                }
            ],
            "timestamp": now,
            "size": aspect_ratio,
        }

        urls: list[str] = []
        seen: set[str] = set()
        started = time.monotonic()
        last_beat = 15.0
        rendering_noted = False
        async with session.post(
            f"{QWEN_URL}/api/v2/chat/completions?chat_id={chat_id}",
            json=msg_payload,
            proxy=proxy or None,
        ) as resp:
            if resp.status >= 400:
                body = await resp.text()
                if resp.status == 401:
                    raise RuntimeError(
                        "Qwen rejected the token (401). Refresh QWEN_COOKIES/QWEN_TOKEN "
                        "from a logged-in chat.qwen.ai session."
                    )
                raise RuntimeError(f"completions failed: HTTP {resp.status} {body[:200]}")
            async for chunk in iter_sse(resp):
                if chunk.get("error"):
                    err = chunk["error"]
                    raise RuntimeError(f"Qwen error: {err.get('code')}: {err.get('details', err)}")
                choices = chunk.get("choices") or [{}]
                delta = choices[0].get("delta") or {}
                phase = delta.get("phase") or ""
                if phase:
                    collect_urls(delta.get("content"), urls, seen)
                collect_urls(delta.get("extra"), urls, seen)
                if phase == "video_gen" and not rendering_noted:
                    rendering_noted = True
                    emit("Qwen is rendering the video...")

                elapsed = time.monotonic() - started
                pct = min(62.0, 15.0 + elapsed / 8.0)
                if pct - last_beat >= 2:
                    last_beat = pct
                    emit_progress(int(pct))
        return urls


async def generate_urls(prompt: str, aspect_ratio: str, cfg: dict[str, Any]) -> list[str]:
    token = secret(cfg, "QWEN_TOKEN", "qwen_token", "token")
    proxy = secret(cfg, "QWEN_PROXY", "qwen_proxy", "proxy")
    cookies = secret(cfg, "QWEN_COOKIES", "qwen_cookies", "cookies")
    model = secret(cfg, "QWEN_MODEL", "qwen_model", "model") or "qwen3.8-max"
    timeout_raw = secret(cfg, "QWEN_TIMEOUT", "qwen_timeout", "timeout") or "600"
    try:
        timeout = max(60, min(1800, int(timeout_raw)))
    except ValueError:
        timeout = 600

    # qwen3-reverse derives the bearer token from the ``token`` cookie when a
    # separate QWEN_TOKEN is not supplied; do the same here.
    if not token and cookies:
        token = parse_cookies(cookies).get("token", "").strip()
    if not token:
        token = await shared_token_fallback()

    allow_anonymous = env_flag("QWEN_ALLOW_ANONYMOUS")
    if not token and not cookies and not allow_anonymous:
        raise RuntimeError(
            "No Qwen credentials found. Log in at chat.qwen.ai, copy the request "
            "Cookie header (and/or the localStorage token) into QWEN_COOKIES / "
            "QWEN_TOKEN in the environment or the gitignored config.json. Video "
            "generation (t2v) is disabled for anonymous access."
        )
    if not token:
        raise RuntimeError(
            "Qwen t2v requires a logged-in token. QWEN_COOKIES was provided but "
            "no token could be extracted, and no QWEN_TOKEN was set."
        )

    emit(f"Starting Qwen t2v ({aspect_ratio}, model={model})")
    emit_progress(10)
    urls = await generate_urls_direct(
        prompt, aspect_ratio, token, cookies, model, proxy, timeout
    )
    if not urls:
        raise RuntimeError(
            "Qwen finished without returning a video URL. The clip may still be "
            "rendering server-side; retry, or confirm the account can use video "
            "generation at chat.qwen.ai."
        )
    emit_progress(65)
    emit(f"Received {len(urls)} CDN URL(s); downloading the first clip")
    return urls


async def run(args: argparse.Namespace) -> int:
    cfg = load_config()
    prompt = args.prompt.strip()
    if not prompt:
        raise RuntimeError("prompt must not be empty")

    emit_progress(5)
    urls = await generate_urls(prompt, args.aspect_ratio, cfg)
    proxy = secret(cfg, "QWEN_PROXY", "qwen_proxy", "proxy")

    out_path = Path(args.out).expanduser() if args.out else None
    if out_path is None:
        stamp = f"{time.strftime('%Y%m%d_%H%M%S')}_{int(time.time() * 1000) % 1000:03d}"
        out_path = RENDERS_DIR / f"qwen_{stamp}.mp4"
    if not out_path.is_absolute():
        out_path = (ROOT / out_path).resolve()
    else:
        out_path = out_path.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    part_path = out_path.with_name(out_path.name + ".part")
    try:
        if part_path.exists():
            part_path.unlink()
        size = await asyncio.to_thread(stream_download, urls[0], part_path, proxy)
        emit_progress(96)
        os.replace(part_path, out_path)
        emit(f"OUTPUT {out_path}")
        emit(f"Saved {size} bytes to {out_path.name}")
        emit_progress(100)
        return 0
    finally:
        try:
            if part_path.exists():
                part_path.unlink()
        except OSError:
            pass


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a Qwen video into renders/")
    parser.add_argument("--prompt", required=True, help="Text-to-video prompt")
    parser.add_argument(
        "--aspect-ratio",
        default="9:16",
        choices=["9:16", "16:9", "1:1", "4:3", "3:4"],
        help="Output aspect ratio (default: 9:16)",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Absolute or repo-relative output .mp4 path",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(sys.argv[1:] if argv is None else argv)
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        print("ERROR: interrupted by user", file=sys.stderr, flush=True)
        return 130
    except Exception as exc:
        detail = str(exc).strip() or exc.__class__.__name__
        print(f"ERROR: {detail}", file=sys.stderr, flush=True)
        if env_flag("ZES_DEBUG"):
            import traceback

            traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
