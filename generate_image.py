#!/usr/bin/env python3
"""
Generate images using the Pollinations.ai free API.

No API key required — Pollinations provides free image generation
via a simple HTTP endpoint.

Usage:
  python generate_image.py "a cat surfing on the moon"
  python generate_image.py "futuristic city at sunset" --model flux --width 1280 --height 720
  python generate_image.py "portrait photo" --model zimage --out my_image.png

Available free models: flux (default), zimage, klein, kontext
"""
import argparse
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL = "https://image.pollinations.ai/prompt"
DEFAULT_MODEL = "flux"
DEFAULT_WIDTH = 1024
DEFAULT_HEIGHT = 1024


def generate(prompt: str, model: str, width: int, height: int, out: str | None) -> Path:
    encoded = urllib.parse.quote(prompt)
    params = f"model={model}&width={width}&height={height}&nologo=true&enhance=false"
    url = f"{BASE_URL}/{encoded}?{params}"

    out_path = Path(out) if out else Path(f"output_{model}.png")

    print(f"Generating: {prompt!r} ({model}, {width}x{height})", flush=True)
    print(f"URL: {url}", flush=True)

    req = urllib.request.Request(url, headers={"User-Agent": "pollinations-image-demo/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()

    out_path.write_bytes(data)
    print(f"Saved → {out_path.resolve()}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Generate images via Pollinations.ai (free, no key needed)")
    parser.add_argument("prompt", help="Text description of the image")
    parser.add_argument("--model", default=DEFAULT_MODEL, choices=["flux", "zimage", "klein", "kontext"],
                        help="Image model (default: flux)")
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    parser.add_argument("--out", help="Output file path (default: output_<model>.png)")
    args = parser.parse_args()

    try:
        generate(args.prompt, args.model, args.width, args.height, args.out)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
