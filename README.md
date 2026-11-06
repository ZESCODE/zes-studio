# 🎬 ZES Studio — Image + Video

One local studio for **free AI image generation** and **short-form vertical video rendering**.
No build step, no framework, no external npm dependencies at the server layer.

- **Image Studio** — Pollinations (`flux`, `zimage`, `klein`, `kontext`), any size, download, and
  one-click “use as video background”.
- **Video Studio** — Remotion `FactsVideo` composition (1080×1920, 30 fps, 5 facts, ~45 s),
  rendered on demand from the browser with live progress and an in-page player.

---

## Quick start

```bash
cd ~/zes-studio
node server.mjs          # http://localhost:8090
```

Or via the ZES stack: `~/zes-os/up.sh` starts it on **:8090** alongside the dashboard (:7070).

Health check: `curl -s localhost:8090/api/status`

---

## What's inside

```
zes-studio/
├── server.mjs            # zero-dep HTTP server: static + image proxy + render jobs
├── package.json          # scripts: start / render / still / image
├── generate_image.py     # standalone CLI image generator
├── public/
│   ├── index.html        # combined UI (Image + Video tabs)
│   ├── legacy-image.html # classic single-page image UI (proxied)
│   ├── arena/            # image model arena
│   └── tw-writer.html    # thread writer
├── video/                # Remotion project (FactsVideo)
│   ├── src/              # Root.tsx, FactsVideo.tsx, data.ts, components/
│   ├── public/fonts/     # Anton + Inter
│   ├── remotion.config.ts
│   └── node_modules -> ~/shorts-studio/node_modules   (symlink, not duplicated)
├── renders/              # generated .mp4 files (served at /renders/, copied to Movies)
├── skills/               # agent skills (SKILL.md per topic)
└── logs/studio.log
```

The Remotion dependencies are **symlinked** from `~/shorts-studio/node_modules` (≈840 MB), so the
video project costs almost no extra disk.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/status` | service health |
| `GET` | `/api/image?prompt=&model=&width=&height=` | server-side proxy to `image.pollinations.ai`; returns image bytes |
| `POST` | `/api/render` | start a render job (JSON body = composition props; optional `frames`, `concurrency`) |
| `GET` | `/api/render/:id` | job status, `progress` 0–100, `message`, `file` |
| `DELETE` | `/api/render/:id` | cancel a running job |
| `GET` | `/api/renders` | list finished renders |

Finished renders are automatically copied to `/storage/emulated/0/Movies`
(photo-gallery visible). Disable with `NO_MOVIE_EXPORT=1` or redirect with
`MOVIES_DIR=<path>`.
| `GET` | `/renders/:file.mp4` | stream video (supports HTTP `Range`, `?download=1`) |

Render response:

```json
{ "id": "f85e821c", "status": "running", "progress": 0, "file": null }
```

Poll until `status` is `done` (then `file` is `/renders/<id>.mp4`) or `error`.

### Props schema (`video/src/data.ts`)

```jsonc
{
  "kicker": "AMAZING FACTS",
  "topic": "THE OCEAN",
  "accent": "#4DD8FF",
  "accent2": "#FFC94D",
  "handle": "@yourchannel",
  "audioSrc": "",
  "imageSrc": "https://…/optional-background.jpg",   // optional
  "facts": [ /* exactly 5 */ { "emoji": "🌊", "headline": "…", "detail": "…", "stat": "71%", "statLabel": "OF THE PLANET" } ]
}
```

`imageSrc` adds a photographic backdrop under the animated gradient; the generated image from the
Image tab is passed in automatically via **“Use as video background”**.

---

## Why the image proxy?

Browsers send an `Origin` header on `fetch()`; `image.pollinations.ai` rejects unknown origins with
**403**. The server fetches the same URL without an `Origin` header and streams the bytes back, so
the browser only ever talks to the same origin (`/api/image`). Anonymous tier still rate-limits —
try another model or a shorter prompt.

---

## Skills

`skills/` holds the agent-facing knowledge for working on this project:

| Skill | Covers |
|---|---|
| `zes-studio` | server layout, endpoints, env config (`PORT`, `NO_MOVIE_EXPORT`, `MOVIES_DIR`, …) |
| `zes-studio-video` | Remotion compositions, the mandatory proot-Debian render path, narration regeneration via 9Router TTS, music swaps, duration re-padding |
| `zes-studio-image` | `/api/image` proxy usage, model list and quirks, `generate_image.py`, the “use as video background” handoff |

---

## Rendering on Termux (this device)

Remotion cannot render natively on Android/bionic, so jobs run inside the installed **Debian proot**
where node, the Rust compositor and Chromium are all glibc/arm64:

- **Compositor:** `@remotion/compositor-linux-arm64-gnu@4.0.540` (inside the shared `node_modules`)
- **Browser:** Remotion’s bundled `chrome-headless-shell/linux-arm64`
- **GL backend:** `Config.setChromiumOpenGlRenderer("swiftshader")` — `swangle` crashes the GPU
  process under proot
  
`server.mjs` spawns:

```bash
proot-distro login debian -- bash -lc \
  'cd ~/zes-studio/video && CI=1 node node_modules/@remotion/cli/remotion-cli.js render \
     src/index.ts FactsVideo ../renders/<id>.mp4 --props="..." --concurrency=4 --log=info'
```

Tunable env vars:

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8090` | HTTP port |
| `RENDER_CONCURRENCY` | `4` | Remotion frame concurrency |
| `RENDER_INSIDE_PROOT` | on | set `0` to render natively (non-Android hosts) |
| `REMOTION_BROWSER_EXECUTABLE` | bundled | override the Chromium binary |

Approximate throughput on this device: **~1.2 s/frame at concurrency 2** → a full 1350-frame video
takes roughly 25–30 min. Render short `frames` ranges while iterating:

```bash
curl -s -X POST localhost:8090/api/render -H 'Content-Type: application/json' -d @props.json
# props.json may include "frames": "0-90" and "concurrency": 2
```

### Termux gotchas solved here

- `/usr/bin/env` does not exist → invoke the Remotion CLI through `node` explicitly, not
  `./node_modules/.bin/remotion` or `npx`.
- esbuild needs `@esbuild/android-arm64`; the shared `node_modules` originally had
  `@esbuild/linux-arm64` for proot. The Termux-side shell still cannot render (native Chromium works,
  compositor does not) — hence proot for all renders.
- `/tmp` does not exist on this device; use `~/.zes/tmp`.

---

## Image CLI

```bash
python generate_image.py "a calico cat surfing on a glowing wave at sunset"
python generate_image.py "futuristic city" --model zimage --width 1280 --height 720
POLLINATIONS_API_KEY=pk_xxx python generate_image.py "portrait" --model klein --out portrait.png
```

No key → anonymous `image.pollinations.ai` (lower priority). A key from
[enter.pollinations.ai](https://enter.pollinations.ai) unlocks the higher-quota `gen.pollinations.ai`
endpoint.

---

## Attribution

Images by [Pollinations.ai](https://pollinations.ai) · Video by [Remotion](https://remotion.dev).
