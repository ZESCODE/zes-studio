#!/usr/bin/env python3
"""
Generate images using the Pollinations.ai free API (gen.pollinations.ai).

Pollinations provides free image generation for registered apps. Sign up at
https://enter.pollinations.ai (GitHub login) to get an API key. Pass it via
the POLLINATIONS_API_KEY env var or the --api-key flag.

Without a key the script falls back to the public anonymous mirror at
image.pollinations.ai (lower priority, no SLA).

A matching browser UI lives in public/index.html, served by server.mjs
(the same studio also renders Remotion videos from generated images).

Usage:
  POLLINATIONS_API_KEY=pk_xxx python generate_image.py "a cat surfing on the moon"
  python generate_image.py "futuristic city at sunset" --model flux --width 1280 --height 720
  python generate_image.py "portrait photo" --model zimage --out my_image.png --api-key pk_xxx

Available free models: flux (default), zimage, klein
"""
import argparse
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

GEN_BASE = "https://gen.pollinations.ai/image"
ANON_BASE = "https://image.pollinations.ai/prompt"
REFERRER = "zes-studio"
USER_AGENT = (
    "zes-studio/1.0 "
    "(+https://github.com/housir2001/pollinations-image-demo)"
)
DEFAULT_MODEL = "flux"
DEFAULT_WIDTH = 1024
DEFAULT_HEIGHT = 1024


def build_url(base: str, prompt: str, model: str, width: int, height: int) -> str:
    encoded = urllib.parse.quote(prompt)
    params = urllib.parse.urlencode({
        "model": model,
        "width": width,
        "height": height,
        "nologo": "true",
        "enhance": "false",
        "referrer": REFERRER,
    })
    return f"{base}/{encoded}?{params}"


def generate(
    prompt: str, model: str, width: int, height: int,
    out: str | None, api_key: str | None,
) -> Path:
    headers = {"User-Agent": USER_AGENT}
    if api_key:
        url = build_url(GEN_BASE, prompt, model, width, height)
        headers["Authorization"] = f"Bearer {api_key}"
        tier = "registered (gen.pollinations.ai)"
    else:
        url = build_url(ANON_BASE, prompt, model, width, height)
        tier = "anonymous fallback (image.pollinations.ai)"

    out_path = Path(out) if out else Path(f"output_{model}.png")

    print(f"Generating: {prompt!r} ({model}, {width}x{height}) [{tier}]", flush=True)
    print(f"URL: {url}", flush=True)

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = resp.read()

    out_path.write_bytes(data)
    print(f"Saved -> {out_path.resolve()}")
    return out_path


def main():
    parser = argparse.ArgumentParser(
        description="Generate images via Pollinations.ai (free for registered apps, anonymous fallback)"
    )
    parser.add_argument("prompt", help="Text description of the image")
    parser.add_argument(
        "--model", default=DEFAULT_MODEL,
        choices=["flux", "zimage", "klein"],
        help="Image model (default: flux)",
    )
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    parser.add_argument("--out", help="Output file path (default: output_<model>.png)")
    parser.add_argument(
        "--api-key",
        default=os.environ.get("POLLINATIONS_API_KEY"),
        help="Pollinations API key (or set POLLINATIONS_API_KEY env var). "
             "Get one at https://enter.pollinations.ai",
    )
    args = parser.parse_args()

    try:
        generate(args.prompt, args.model, args.width, args.height, args.out, args.api_key)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
