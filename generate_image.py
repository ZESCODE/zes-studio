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
  python generate_image.py "epic landscape" --count 10 --out-dir ./output_images

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
DEFAULT_OUTPUT_DIR = Path("/storage/emulated/0/Pictures/agora")


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
    proxy: str | None = None,
) -> Path:
    headers = {"User-Agent": USER_AGENT}
    if api_key:
        url = build_url(GEN_BASE, prompt, model, width, height)
        headers["Authorization"] = f"Bearer {api_key}"
        tier = "registered (gen.pollinations.ai)"
    else:
        url = build_url(ANON_BASE, prompt, model, width, height)
        tier = "anonymous fallback (image.pollinations.ai)"

    out_path = Path(out) if out else DEFAULT_OUTPUT_DIR / f"output_{model}.png"

    print(f"Generating: {prompt!r} ({model}, {width}x{height}) [{tier}]", flush=True)
    print(f"URL: {url}", flush=True)

    req = urllib.request.Request(url, headers=headers)
    if proxy:
        proxy_handler = urllib.request.ProxyHandler({'https': proxy})
        opener = urllib.request.build_opener(proxy_handler)
        resp = opener.open(req, timeout=180)
    else:
        resp = urllib.request.urlopen(req, timeout=180)
    with resp:
        data = resp.read()

    out_path.write_bytes(data)
    print(f"Saved -> {out_path.resolve()}")
    return out_path


def generate_batch(
    prompts: list[str], model: str, width: int, height: int,
    out_dir: str | None, api_key: str | None,
    proxy: str | None = None,
) -> list[Path]:
    output_dir = Path(out_dir) if out_dir else DEFAULT_OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    saved_paths = []
    for i, prompt in enumerate(prompts):
        out_path = output_dir / f"image_{i+1:02d}_{model}.png"
        try:
            saved_path = generate(prompt, model, width, height, str(out_path), api_key, proxy)
            saved_paths.append(saved_path)
        except Exception as e:
            print(f"Failed to generate image {i+1}: {e}", file=sys.stderr)
    return saved_paths


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
    parser.add_argument("--out", help="Output file path (default: /storage/emulated/0/Pictures/agora/output_<model>.png)")
    parser.add_argument(
        "--out-dir",
        help="Output directory for batch generation (default: /storage/emulated/0/Pictures/agora)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=1,
        help="Number of images to generate (default: 1). Ignored if --batch-prompts is provided.",
    )
    parser.add_argument(
        "--batch-prompts",
        help="Path to a text file containing one prompt per line for batch generation.",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("POLLINATIONS_API_KEY"),
        help="Pollinations API key (or set POLLINATIONS_API_KEY env var). "
             "Get one at https://enter.pollinations.ai",
    )
    parser.add_argument(
        "--proxy",
        help="HTTPS proxy URL (e.g., http://user:pass@host:port)",
    )
    args = parser.parse_args()

    if args.batch_prompts:
        with open(args.batch_prompts, 'r') as f:
            prompts = [line.strip() for line in f if line.strip()]
    else:
        prompts = [args.prompt] * args.count

    try:
        saved_paths = generate_batch(prompts, args.model, args.width, args.height, args.out_dir, args.api_key, args.proxy)
        print(f"\nGenerated {len(saved_paths)} images.")
        for path in saved_paths:
            print(f"  - {path}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
