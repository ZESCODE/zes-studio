---
name: zes-studio-image
category: Media
description: Pollinations image generation in zes-studio — same-origin /api/image proxy, model list and quirks, generate_image.py CLI, and the "use as video background" handoff into the Remotion video tab. Use when generating or debugging images in ~/zes-studio.
---

# zes-studio — Image generation

Images come from `image.pollinations.ai` through the studio's own proxy — never
call the upstream directly from the browser (browser `Origin` header gets 403).

## Proxy endpoint

```
GET /api/image?prompt=<url-encoded>&model=flux&width=1024&height=1024
```

Returns the raw image bytes (`Cache-Control: no-cache`). Server-side fetch with
a 120 s abort. Upstream `!ok` → 502, `429` → 429.

## Models

| Model | Notes |
|---|---|
| `flux` | default, reliable |
| `zimage` | reliable |
| `klein` | reliable |
| `kontext` | listed in UI; occasionally flaky — git history records HTTP 500s on both endpoints |

Anonymous requests work; 402s are transient rate limiting, not a hard per-45s
quota.

## CLI

```bash
cd /data/data/com.termux/files/home/zes-studio
python3 generate_image.py            # writes output_<model>.png
```

Environment notes: `python3`, `node v24`, `npx` available; `file` and `conda`
are **not** available in this Termux.

## UI handoff to video

1. Image tab → generate → **download** or
2. **🎬 Use as video background** — fills the Video tab's `Background image URL`
   field with the generated image, which is passed to the render as `imageSrc`
   (schema + `Background.tsx` view support it).

## Files

| Path | Purpose |
|---|---|
| `public/index.html` | combined UI (Image + Video tabs) |
| `public/legacy-image.html` | old standalone demo, already patched to `/api/image` |
| `generate_image.py` | CLI wrapper around the same endpoint |
