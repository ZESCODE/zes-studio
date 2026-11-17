#!/usr/bin/env python3
"""Capture and save chat.qwen.ai credentials for ZES Studio.

Reads a browser ``Cookie`` header (and/or bearer token), validates it against
chat.qwen.ai, and writes the result to the gitignored ``config.json`` used by
``qwen_video.py``. Secrets are never printed; add ``--show`` to display only
masked metadata.

Examples (Termux):
    # copy the Cookie header in Chrome DevTools, then:
    termux-clipboard-get | python qwen_auth.py --clipboard

    python qwen_auth.py --cookie "cnaui=...; aui=...; token=..." --validate
    python qwen_auth.py --token "eyJ..." --cookie "aui=..."
    python qwen_auth.py --check          # validate what is already saved
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import stat
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = ROOT / "config.json"
QWEN_URL = "https://chat.qwen.ai"
CRITICAL_COOKIES = ("cnaui", "aui", "token")


def parse_cookies(raw: str) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for part in (raw or "").split(";"):
        if "=" not in part:
            continue
        key, value = part.strip().split("=", 1)
        if key:
            pairs[key] = value
    return pairs


def looks_like_token(raw: str) -> bool:
    text = (raw or "").strip()
    return bool(text) and ";" not in text and "=" not in text and len(text) > 40


def read_clipboard() -> str:
    for cmd in (["termux-clipboard-get"], ["pbpaste"], ["xclip", "-selection", "clipboard", "-o"]):
        if shutil.which(cmd[0]):
            try:
                out = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                if out.returncode == 0 and out.stdout.strip():
                    return out.stdout.strip()
            except (OSError, subprocess.SubprocessError):
                continue
    return ""


def load_config(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Cannot read {path}: {exc}")


def save_config(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)
    os.replace(tmp, path)


def validate(token: str, cookies: str) -> tuple[bool, str]:
    headers = {
        "user-agent": "Mozilla/5.0 (Linux; Android 13) ZES-Studio/2.0",
        "accept": "application/json",
        "source": "web",
        "origin": QWEN_URL,
        "referer": f"{QWEN_URL}/",
    }
    if cookies:
        headers["cookie"] = cookies
    if token:
        headers["authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{QWEN_URL}/api/v1/auths/", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code} (refresh the cookie from a logged-in browser)"
    except (urllib.error.URLError, TimeoutError) as exc:
        return False, f"network error: {exc}"
    if body.lstrip().startswith("<"):
        return False, "server returned HTML (WAF/login page; cookie invalid)"
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return False, f"unexpected response: {body[:120]}"
    if isinstance(data, dict) and (data.get("email") or data.get("username") or data.get("id")):
        who = data.get("email") or data.get("username") or data.get("id")
        return True, f"logged in as {who}"
    return True, "endpoint accepted the credentials"


def gather(args: argparse.Namespace) -> tuple[str, str]:
    cookie = (args.cookie or "").strip()
    token = (args.token or "").strip()

    if args.clipboard and not cookie:
        clip = read_clipboard()
        if not clip:
            raise SystemExit("Clipboard is empty or no clipboard tool found.")
        if looks_like_token(clip) and not token:
            token = clip
        else:
            cookie = clip

    saved = load_config(Path(args.config).expanduser()) if args.check else {}
    if args.check:
        cookie = cookie or str(saved.get("QWEN_COOKIES") or saved.get("qwen_cookies") or "")
        token = token or str(saved.get("QWEN_TOKEN") or saved.get("qwen_token") or saved.get("token") or "")

    if not cookie and not token and not args.check:
        print("Paste the Cookie header from chat.qwen.ai (DevTools > Network), or press Enter to skip:")
        try:
            cookie = input("> ").strip()
        except EOFError:
            cookie = ""

    if token and not cookie:
        print("Paste the Cookie header (optional, press Enter to save token only):")
        try:
            cookie = input("> ").strip()
        except EOFError:
            cookie = ""

    if not token and cookie:
        token = parse_cookies(cookie).get("token", "").strip()
    cookie = " ".join(cookie.split())
    return cookie, token


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Save Qwen credentials to config.json")
    parser.add_argument("--cookie", help="full browser Cookie header")
    parser.add_argument("--token", help="bearer token (optional; derived from cookie)")
    parser.add_argument("--clipboard", action="store_true", help="read cookie/token from clipboard")
    parser.add_argument("--check", action="store_true", help="validate saved config and exit")
    parser.add_argument("--no-validate", action="store_true", help="skip the live login check")
    parser.add_argument("--show", action="store_true", help="print masked metadata")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="config.json path")
    parser.add_argument("--model", help="optional QWEN_MODEL to store")
    args = parser.parse_args(argv)

    config_path = Path(args.config).expanduser().resolve()
    cookie, token = gather(args)

    if not cookie and not token:
        print("Nothing to save: no cookie or token provided.", file=sys.stderr)
        return 2

    cookie_map = parse_cookies(cookie)
    missing = [name for name in CRITICAL_COOKIES if not (cookie_map.get(name) or (name == "token" and token))]
    if missing:
        print(f"Warning: cookie is missing critical fields: {', '.join(missing)}", file=sys.stderr)

    if not args.no_validate:
        ok, detail = validate(token, cookie)
        print(("Validated: " if ok else "Validation failed: ") + detail)
        if not ok:
            if args.check:
                print(f"{config_path}: credentials are invalid.", file=sys.stderr)
            else:
                print("Not saved. Retry with a fresh cookie, or pass --no-validate to save anyway.", file=sys.stderr)
            return 1
    else:
        print("Skipped live validation.")

    if args.check:
        print(f"{config_path}: credentials are valid.")
        return 0

    data = load_config(config_path)
    if cookie:
        data["QWEN_COOKIES"] = cookie
    if token:
        data["QWEN_TOKEN"] = token
        data.pop("token", None)
    if args.model:
        data["QWEN_MODEL"] = args.model
    save_config(config_path, data)

    print(f"Saved to {config_path} (mode 600, gitignored).")
    if args.show:
        print(f"  cookie fields: {', '.join(sorted(cookie_map)) or '(none)'}")
        print(f"  token: {'present' if token else 'missing'} ({len(token)} chars)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
