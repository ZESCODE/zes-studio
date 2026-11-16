---
name: zes-studio-image
category: Media
description: Pollinations image generation in ZES Studio 2.0 — same-origin /api/image proxy, model list and quirks, generate_image.py CLI, the Generate-view preview, legacy /legacy-image.html handoff, and asset-backed Remotion renders. Use when generating or debugging images in ~/zes-studio.
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

## UI handoff in v2

- **Generate** view → "Pollinations backdrop" preview calls `/api/image?...`
  through the preserved same-origin proxy; it adds no frontend dependency.
- **Render** view → pick an image asset from `renders/` and submit
  `{ "asset": "<name>", "topic": "..." }`; the server binds it to `imageSrc`.
  MP4/WebM assets optionally get an `ffmpeg` poster frame; without `ffmpeg`,
  Remotion uses its animated backdrop.
- The classic one-click **🎬 Use as video background** flow remains in
  `/legacy-image.html` (it fills the legacy Video tab's background URL).
- Never call `image.pollinations.ai` directly from browser code; use `/api/image`.

For the full agent workflow, see `zes-studio-agent`.

## Files

| Path | Purpose |
|---|---|
| `public/index.html` | v2 control panel; Generate view has the optional preview |
| `public/app.js` | preview request + asset-based render wiring |
| `public/legacy-image.html` | classic Pollinations studio with one-click handoff |
| `generate_image.py` | CLI wrapper around the same endpoint |
| `renders/` | image assets can be selected for final renders |
