# Pollinations Image Demo

A minimal Python script for free AI image generation using the [Pollinations.ai](https://pollinations.ai) API.

**No API key required.** Pollinations provides free image generation for open-source projects.

## Features

- Free image generation (no account or key needed)
- Multiple models: `flux`, `zimage`, `klein`, `kontext`
- Single file, zero dependencies (Python stdlib only)
- CLI interface with customizable resolution

## Quick Start

```bash
# Clone and run
git clone https://github.com/housir2001/pollinations-image-demo
cd pollinations-image-demo
python generate_image.py "a cat surfing on the moon"
```

## Usage

```bash
python generate_image.py "your prompt here"
python generate_image.py "futuristic city" --model zimage --width 1280 --height 720
python generate_image.py "portrait" --model klein --out portrait.png
```

| Flag | Default | Options |
|------|---------|---------|
| `--model` | `flux` | `flux`, `zimage`, `klein`, `kontext` |
| `--width` | `1024` | any integer |
| `--height` | `1024` | any integer |
| `--out` | `output_<model>.png` | any path |

## Models

| Model | Style |
|-------|-------|
| `flux` | Photorealistic, versatile |
| `zimage` | Artistic, stylized |
| `klein` | Fast, creative |
| `kontext` | Context-aware |

## How It Works

The script calls the Pollinations public image endpoint:
```
https://image.pollinations.ai/prompt/{YOUR_PROMPT}?model=flux&width=1024&height=1024
```

No authentication required — Pollinations provides free access for open projects built on their platform.

## Requirements

- Python 3.8+
- No external packages needed

## License

MIT
