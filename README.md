# 🌸 Pollinations Image Studio

[![Built with Pollinations](https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=for-the-badge)](https://pollinations.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#license)

Free AI image generation powered by [Pollinations.ai](https://pollinations.ai) — runs **in the browser** (single static page) **and as a Python CLI**. Four image models, no build step, no key needed to try.

🖼️ **Live demo:** https://housir2001.github.io/pollinations-image-demo/

---

## Features

- 🌐 **Browser app** — single static `index.html`, vanilla JS, no framework, no build
- 🐍 **Python CLI** — single file, zero dependencies (Python stdlib only)
- 🎨 **Three free models** — `flux`, `zimage`, `klein`
- ⚡ **Uses the new `gen.pollinations.ai` endpoint** (the recommended endpoint as of 2026)
- 🔑 **Optional API key** for higher quotas (anonymous fallback for the CLI)
- 📱 **Mobile responsive** dark UI
- 🏷️ **Built with Pollinations** badge + visible attribution in the footer

---

## How it integrates with Pollinations

| Surface | Endpoint | Auth | Models |
|---|---|---|---|
| **Browser (`index.html`)** | `GET https://gen.pollinations.ai/image/{prompt}?model=…&width=…&height=…` | Browser sends `Referer` header automatically — works once the deployed origin is registered at [enter.pollinations.ai](https://enter.pollinations.ai) | flux · zimage · klein |
| **CLI (`generate_image.py`)** | Same `gen.pollinations.ai/image/{prompt}` endpoint | `Authorization: Bearer <POLLINATIONS_API_KEY>` (env var or `--api-key` flag); falls back to anonymous `image.pollinations.ai/prompt/` if no key | flux · zimage · klein |

The app does not embed any secret in the static page — auth is handled by the Pollinations platform via referer matching for registered app domains.

---

## Live Demo (browser)

Visit https://housir2001.github.io/pollinations-image-demo/, type a prompt, pick a model, click Generate. That's it.

> First-time deploy: the app domain should be registered once at [enter.pollinations.ai](https://enter.pollinations.ai) so browser requests are auto-authed. Without registration, requests fall through Pollinations' anonymous rate limit.

---

## CLI Quick Start

```bash
git clone https://github.com/housir2001/pollinations-image-demo
cd pollinations-image-demo

# Optional but recommended: get a free key at https://enter.pollinations.ai
export POLLINATIONS_API_KEY=pk_xxxxx

python generate_image.py "a calico cat surfing on a glowing wave at sunset"
```

### CLI Usage

```bash
python generate_image.py "your prompt here"
python generate_image.py "futuristic city" --model zimage --width 1280 --height 720
python generate_image.py "portrait" --model klein --out portrait.png
python generate_image.py "robot" --api-key pk_xxxxx
```

| Flag | Default | Notes |
|------|---------|-------|
| `--model` | `flux` | One of `flux`, `zimage`, `klein` |
| `--width` | `1024` | Pixels |
| `--height` | `1024` | Pixels |
| `--out` | `output_<model>.png` | Output file path |
| `--api-key` | `$POLLINATIONS_API_KEY` | Pollinations API key (optional) |

### Requirements

- Python 3.8+
- No third-party packages

---

## Models

| Model | Style |
|-------|-------|
| `flux` | Photorealistic, versatile |
| `zimage` | Artistic, stylized |
| `klein` | Fast, creative |

All four are free models exposed under `gen.pollinations.ai/image/{prompt}`.

---

## Why `gen.pollinations.ai`?

The older `image.pollinations.ai/prompt/{prompt}` endpoint is being phased out in favour of the unified `gen.pollinations.ai` API (which also serves text, audio, video and embeddings via OpenAI-compatible routes). This project migrated in v2.0; the anonymous CLI fallback still uses the legacy host for environments without a key.

---

## Local Development

```bash
# Browser: just open index.html in your browser (or any static server)
python -m http.server 8000  # then visit http://localhost:8000/

# CLI:
python generate_image.py "test"
```

---

## Credits

- Image generation by [Pollinations.ai](https://pollinations.ai)
- App author: [@housir2001](https://github.com/housir2001)

## License

MIT
