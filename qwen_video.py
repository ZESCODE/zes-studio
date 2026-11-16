#!/usr/bin/env python3
"""ZES Studio Qwen video worker.

Generates a text-to-video clip with ``qwen_reverse.Video``, streams the first
CDN URL into ``renders/qwen_<timestamp>.mp4`` via a temporary ``.part`` file,
and prints structured progress lines for the Node job queue:

    PROGRESS 5
    PROGRESS 40
    OUTPUT /absolute/path/renders/qwen_<timestamp>.mp4
    PROGRESS 100

Secrets are never stored in this repository. The worker reads them from the
environment first, then an optional gitignored ``config.json`` at the repo
root, then qwen-reverse's cached OAuth credentials (SharedTokenManager).

Environment / config.json keys (case-insensitive aliases supported):
    QWEN_TOKEN       logged-in chat.qwen.ai bearer token
    QWEN_PROXY       optional HTTP(S) proxy
    QWEN_MODEL       qwen-reverse model override
    QWEN_COOKIES     optional cookie string, forwarded to qwen-reverse
    QWEN_BROWSER     set to 1 to use qwen-reverse's browser transport
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
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
RENDERS_DIR = ROOT / "renders"
URL_RE = re.compile(r"https?://[^\s<>\]\)}'\"]+", re.IGNORECASE)
PROGRESS_LOCK = threading.Lock()
LAST_PROGRESS = -1


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


def normalize_url(raw: Any) -> str | None:
    text = html.unescape(str(raw or "")).strip()
    match = URL_RE.search(text)
    if not match:
        return None
    url = match.group(0).rstrip(").,;]}>'\"")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return None
    return url


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


async def generate_urls(prompt: str, aspect_ratio: str, cfg: dict[str, Any]) -> list[str]:
    try:
        import qwen_reverse  # type: ignore
        from qwen_reverse import Video  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "qwen-reverse is not importable. In Termux run: "
            "pip install -U qwen-reverse  (or: pkg install python && pip install qwen-reverse)"
        ) from exc

    token = secret(cfg, "QWEN_TOKEN", "qwen_token", "token")
    proxy = secret(cfg, "QWEN_PROXY", "qwen_proxy", "proxy")
    cookies = secret(cfg, "QWEN_COOKIES", "qwen_cookies", "cookies")
    model = secret(cfg, "QWEN_MODEL", "qwen_model", "model") or getattr(
        qwen_reverse, "DEFAULT_MODEL", "qwen3.8-max"
    )
    timeout_raw = secret(cfg, "QWEN_TIMEOUT", "qwen_timeout", "timeout") or "600"
    try:
        timeout = max(60, min(1800, int(timeout_raw)))
    except ValueError:
        timeout = 600

    if not token:
        token = await shared_token_fallback()

    browser = env_flag("QWEN_BROWSER")
    allow_anonymous = env_flag("QWEN_ALLOW_ANONYMOUS")
    if not token and not cookies and not browser and not allow_anonymous:
        raise RuntimeError(
            "No Qwen credentials found. Run the qwen-reverse device-login helper (see SETUP.md), or set "
            "QWEN_TOKEN in the environment / gitignored config.json. Video "
            "generation (t2v) is disabled for anonymous chat.qwen.ai access."
        )

    # Expose optional values to qwen-reverse without printing them.
    if cookies:
        os.environ.setdefault("QWEN_COOKIES", cookies)
    if browser:
        os.environ.setdefault("QWEN_BROWSER_HEADLESS", "1")

    video = Video(token=token or None, proxy=proxy or None, model=model, timeout=timeout)
    emit(f"Starting Qwen t2v ({aspect_ratio}, model={model})")
    emit_progress(10)

    kwargs: dict[str, Any] = {"aspect_ratio": aspect_ratio}
    if browser:
        kwargs["browser"] = True
    if cookies:
        # qwen-reverse >= 0.2 ignores unknown kwargs; newer versions may use it.
        kwargs["cookies"] = cookies

    task = asyncio.create_task(video.generate(prompt, **kwargs))
    heartbeat = 10
    while not task.done():
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=4.0)
        except asyncio.TimeoutError:
            heartbeat = min(60, heartbeat + 2)
            emit_progress(heartbeat)
            emit("Waiting for Qwen to finish the clip...")
    result = task.result()

    raw_items = result if isinstance(result, (list, tuple)) else [result]
    urls: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        url = normalize_url(item)
        if url and url not in seen:
            seen.add(url)
            urls.append(url)
    if not urls:
        raise RuntimeError("Qwen returned no downloadable video URL")
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
