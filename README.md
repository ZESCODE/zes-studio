# 🎬 ZES Studio — Mobile Control Panel & Local Video Pipeline

**ZES Studio 2.0** is a local, zero-dependency-at-the-server-layer control panel for making short-form video on **Termux / Android**:

```text
Previs (Blender headless) → AI Gen (qwen-reverse) → Final Render (Remotion)
```

Open one Frost-Card dashboard on your phone, queue a job, watch progress, read logs, and play or delete the MP4 — all without a cloud queue, Docker, React, Express, or a root-level `npm install`.

- **Mobile-first dashboard** — dark blue Frost-Card glass UI, 7 views, animated drawer, bottom sheets, fullscreen player, and active-only polling.
- **Unified in-memory job queue** — `Map<jobId, Job>` for `qwen`, `previs`, and `render` workers with bounded concurrency and structured logs.
- **Headless Blender previs** — 640×360 H.264 MP4 built from a shot-spec JSON using `bpy` inside Debian proot.
- **Qwen text-to-video** — async `qwen_reverse.Video` worker streams the first CDN URL into `renders/`.
- **Remotion final render** — preserved `FactsVideo` and `KineticVideo` behavior, plus an asset shortcut for the dashboard.
- **Pollinations image proxy** — still available for same-origin image generation; legacy image tools remain reachable.
- **No secrets in Git** — tokens/cookies come from `process.env` or gitignored `config.json`.

> **Source of truth:** this README documents the current v2 control panel. The full upgrade contract is in [`BUILD-PROMPT.md`](BUILD-PROMPT.md); exact Termux commands and phone-test steps are in [`SETUP.md`](SETUP.md). For agent operations, load the `zes-studio-agent` skill; older specialized notes in `skills/` may describe the previous combined Image + Video UI.

---

## Table of contents

- [Quick start](#quick-start)
- [What's new in 2.0](#whats-new-in-20)
- [Architecture](#architecture)
- [File tree](#file-tree)
- [Dashboard UI](#dashboard-ui)
- [Pipeline workers](#pipeline-workers)
- [Job queue](#job-queue)
- [API reference](#api-reference)
- [Request examples](#request-examples)
- [Shot-spec reference](#shot-spec-reference)
- [Qwen authentication](#qwen-authentication)
- [Remotion integration](#remotion-integration)
- [Pollinations image tools](#pollinations-image-tools)
- [Environment variables](#environment-variables)
- [Security and path handling](#security-and-path-handling)
- [Termux setup](#termux-setup)
- [How to test on phone](#how-to-test-on-phone)
- [Verification and smoke tests](#verification-and-smoke-tests)
- [Troubleshooting](#troubleshooting)
- [Legacy compatibility](#legacy-compatibility)
- [KineticVideo payloads](#kineticvideo-payloads)
- [YouTube upload scripts](#youtube-upload-scripts)
- [Image CLI](#image-cli)
- [Agent skills](#agent-skills)
- [Definition of done](#definition-of-done)
- [Attribution](#attribution)

---

## Quick start

```bash
cd ~/zes-studio
node server.mjs
# http://localhost:8090
```

`8090` is the backward-compatible default used by `~/zes-os/up.sh`. To use the phone-test URL from `BUILD-PROMPT.md`:

```bash
PORT=3000 node server.mjs
# http://localhost:3000
```

Equivalent root script:

```bash
npm start
```

The HTTP server needs **zero root npm dependencies**. It uses Node built-ins and starts from a fresh clone. Final Remotion renders still require the existing `video/` project dependencies or the Termux `node_modules` symlink.

Health check:

```bash
curl -s localhost:8090/api/status
# {"ok":true,"service":"zes-studio","version":"2.0.0","port":8090,"ts":"…"}
```

Open the dashboard at `/`. Legacy pages are still served directly:

| URL | Purpose |
|---|---|
| `/` | v2 control panel SPA |
| `/legacy-image.html` | classic Pollinations image studio |
| `/arena/index.html` | image model arena |
| `/tw-writer.html` | thread writer |

---

## What's new in 2.0

| Area | v1 | v2 |
|---|---|---|
| Frontend | Combined Image + Video tabs in `public/index.html` | Mobile-first 7-view `public/index.html` + `public/app.js` + `public/style.css` |
| Styling | Dark studio theme | Blue Frost-Card glassmorphism from [ZESCODE/frost-cards](https://github.com/ZESCODE/frost-cards) |
| Jobs | Render-only `Map` | Unified `qwen` / `previs` / `render` queue with `queued → running → done/error` |
| Previs | — | `previs_build.py` headless Blender worker |
| AI video | — | `qwen_video.py` async qwen-reverse worker |
| Final render | `/api/render` with explicit props | Same route preserved, plus `{ asset }` shortcut with five default facts |
| Diagnostics | `/api/status` | `/api/settings`, `/api/blender-test`, `/api/jobs/:id`, live Logs view |
| Assets | `/api/renders` + `/renders/:file` | `/api/assets` with size/mtime/kind/stage and safe deletion |
| Setup | README notes | Dedicated [`SETUP.md`](SETUP.md) with Termux, proot, Qwen auth, and phone tests |

---

## Architecture

```text
Phone browser
   │  same-origin fetch, /api/*, /renders/*
   ▼
server.mjs  (Node ESM, zero deps, 0.0.0.0:PORT)
   │
   ├── static ./public  → Frost-Card SPA + legacy pages
   ├── /api/image       → server-side Pollinations proxy (avoids Origin 403)
   │
   └── unified Map<jobId, Job> queue  (MAX_CONCURRENT_JOBS, default 2)
          │
          ├── spawn python qwen_video.py
          │      └── qwen_reverse.Video → CDN URL → renders/qwen_<timestamp>.mp4
          │
          ├── spawn $BLENDER_BIN -b --python-exit-code 1 -P previs_build.py -- shot.json out.mp4
          │      └── bpy empty scene → cubes/ground/lights/camera → 640×360 MP4
          │
          └── spawn Remotion CLI (inside Debian proot by default)
                 └── video/src/index.ts FactsVideo | KineticVideo → renders/<jobId>.mp4
```

Design constraints:

- **Root server dependencies:** none. No Express, React, Vue, Svelte, HTMX, Alpine, Tailwind, bundler, or CDN `<script>`.
- **Frontend:** one vanilla ES module, one stylesheet, one HTML file.
- **Child processes:** `child_process.spawn` with `stdio: "pipe"`, stdin closed, stdout/stderr captured, and never `shell: true`.
- **Paths:** resolved against `process.cwd()` when it contains `public/`; otherwise the server falls back to its own module directory. Start from the repo root for predictable behavior.
- **State:** jobs live in memory and reset on server restart. Assets persist in `renders/`.
- **Network:** intended for `localhost` on the device or a trusted LAN. There is no authentication layer.

---

## File tree

```text
zes-studio/
├── server.mjs                  # extended zero-dep HTTP server + unified job queue
├── qwen_video.py               # async qwen_reverse.Video download worker
├── previs_build.py             # headless Blender bpy shot worker
├── public/
│   ├── index.html              # mobile-first control panel SPA
│   ├── app.js                  # vanilla ES module: views, drawer, sheets, polling
│   ├── style.css               # Frost-Card dark mobile-first CSS
│   ├── legacy-image.html       # classic Pollinations image UI (preserved)
│   ├── arena/index.html        # image model arena (preserved)
│   └── tw-writer.html          # thread writer (preserved)
├── renders/
│   └── .gitkeep                # generated MP4s/images live here; contents ignored
├── tmp/
│   └── .gitkeep                # shot_<id>.json, poster_<id>.jpg; contents ignored
├── video/                      # untouched Remotion 4.0.540 project
│   ├── src/                    # FactsVideo, country facts, KineticVideo, components
│   ├── public/fonts/           # Anton + Inter
│   ├── public/kinetic/         # downloaded kinetic backgrounds (generated)
│   ├── .props/                 # per-render props JSON (generated, ignored)
│   ├── remotion.config.ts
│   ├── authorize.py / upload.py
│   └── node_modules -> ~/shorts-studio/node_modules   # original Termux symlink
├── skills/                     # agent-facing skills
│   ├── zes-studio-agent/       # authoritative agent runbook + bundled API CLI
│   │   ├── SKILL.md
│   │   └── scripts/zes_api.mjs
│   ├── zes-studio/             # v2 entry point and file map
│   ├── zes-studio-video/       # Remotion composition details
│   ├── zes-studio-image/       # Pollinations proxy details
│   └── yt-research/            # Shorts topic research
├── generate_image.py           # standalone Pollinations CLI
├── package.json                # root scripts; no dependencies field
├── .gitignore                  # config.json, renders/*, tmp/*, logs/, video/.props/, …
├── BUILD-PROMPT.md             # v2 upgrade specification
├── SETUP.md                    # exact Termux install + phone test guide
└── README.md                   # this file
```

The Remotion `node_modules` symlink on the original device avoids duplicating roughly 840 MB of dependencies. The root server does not depend on it; only final renders do.

---

## Dashboard UI

The control panel is designed for **360–430 px** first and enhanced at `min-width: 768px`.

### Theme

```css
--bg:#0b0d10; --surface:#15181d; --surface-2:#1e222a;
--text:#e8eaed; --muted:#9aa0a6; --accent:#6ee7ff;
--danger:#ff5c5c; --ok:#3ddc84;
```

Cards use blue Frost-Card gradients:

```css
background: linear-gradient(135deg, rgba(59,130,246,.35), rgba(37,99,235,.20));
border: 1px solid rgba(59,130,246,.50);
backdrop-filter: blur(18px);
box-shadow: 0 4px 24px rgba(59,130,246,.15),
            0 0 40px rgba(59,130,246,.06),
            inset 0 1px 0 rgba(59,130,246,.18);
```

Semantic green / orange / red variants represent running / queued / error states.

### App bar and drawer

- Fixed **56 px** top bar with `env(safe-area-inset-top)`.
- Left: **44×44 px** hamburger, `aria-label="Menu"`, `aria-expanded`, `aria-controls="drawer"`, three 2×20 px bars with 5 px gap, animating to an X in **180 ms**.
- Center: **ZES Studio**.
- Right: status dot — grey idle, green pulsing while jobs are active, red after an error.
- Drawer: `min(78vw, 300px)`, slides from the left over `rgba(0,0,0,.55)` with `blur(2px)`.
- Body scroll is locked while open; focus is trapped; Escape, backdrop tap, and swipe-left close it.
- Close animation completes before the drawer is hidden.
- Nav rows: **Dashboard**, **Generate (Qwen)**, **Previs (Blender)**, **Render**, **Assets**, **Logs**, **Settings** — min-height 48 px, 16 px padding, active left accent bar.

### Views

| View | Contents |
|---|---|
| Dashboard | Pipeline strip `Previs → Generate → Render` with tap-to-filter counts; **New Generation** bottom sheet; active jobs with progress, log tail and Cancel; 2-column recent `<video>` thumbnails opening a fullscreen player sheet |
| Generate | Qwen prompt form, `9:16` / `16:9` / `1:1` segmented control, prior Qwen jobs, optional Pollinations backdrop preview through `/api/image` |
| Previs | Monospace shot-spec JSON editor, **Build Previs**, sample loader, JSON formatter, resolved `BLENDER_BIN` note |
| Render | Asset dropdown, optional topic, **Render Final** calling preserved `POST /api/render`, render job list |
| Assets | Full file list with size, mtime, kind, stage, open/download, fullscreen play, and delete-with-confirm |
| Logs | Job selector, live tail, metadata, and Cancel job |
| Settings | Read-only env readout and **Test Blender** (`BLENDER_BIN --version`) |

### Interaction rules

- No hover-only interactions; everything works on tap.
- All buttons and nav links are at least **44×44 px**.
- Buttons are `<button type="button">`; navigation uses `<a>`; there are **zero `div` click handlers**.
- Mobile text inputs use `font-size: 16px` to prevent iOS zoom. The JSON editor becomes 14 px only on tablet/desktop.
- `viewport-fit=cover`, safe-area insets, no horizontal scroll at 360 px, custom `:active` states, and no console errors on load.
- Frontend polls `/api/jobs` every **2000 ms only while any job is `queued` or `running`**, then stops.

---

## Pipeline workers

### 1. Previs — `previs_build.py`

Invoked by the server as:

```bash
$BLENDER_BIN -b --python-exit-code 1 -P previs_build.py -- \
  /abs/path/tmp/shot_<jobId>.json /abs/path/renders/previs_<timestamp>.mp4
```

The worker:

1. Calls `bpy.ops.wm.read_factory_settings(use_empty=True)` first.
2. Reads the shot-spec JSON.
3. Builds a World, ground plane, placeholder cubes, Sun + Fill lights, and one camera.
4. Supports camera `location`, `end_location`, `look_at` or `rotation`, `rotation_end`, and `lens`.
5. Renders **640×360**, H.264/MPEG4 MP4 at the spec's `fps`.
6. Defaults to **Cycles CPU / 16 samples / no denoising** so Debian proot works without X11 or EGL.
7. Uses only Blender 3.x + 4.x-compatible Principled inputs (`Base Color`, `Roughness`) and `ffmpeg_preset="GOOD"`.
8. Emits `PROGRESS <n>` per rendered frame and `OUTPUT <absolute path>` on success.
9. Exits non-zero and writes `ERROR: …` to stderr on any failure.

### 2. AI Gen — `qwen_video.py`

Invoked by the server as:

```bash
python qwen_video.py --prompt "…" --aspect-ratio 9:16 --out /abs/path/renders/qwen_<timestamp>.mp4
```

The worker:

- Is `asyncio`-based and uses `qwen_reverse.Video.generate(prompt, aspect_ratio=…)`.
- Accepts `9:16`, `16:9`, `1:1`, `4:3`, `3:4` at the API level; the UI offers `9:16`, `16:9`, `1:1`.
- Reads credentials from env → gitignored `config.json` → qwen-reverse OAuth cache (`SharedTokenManager`).
- Streams the first returned CDN URL into `<output>.part`, reports `PROGRESS 5…100`, then atomically renames to the final MP4.
- Prints `OUTPUT <absolute path>`; never prints the token.
- Exits non-zero with an actionable stderr message when qwen-reverse, credentials, or the CDN download fail.

### 3. Final Render — Remotion

`POST /api/render` still launches the untouched `video/` project inside Debian proot by default:

```bash
proot-distro login debian -- bash -lc \
  'cd ~/zes-studio/video && CI=1 node node_modules/@remotion/cli/remotion-cli.js render \
     src/index.ts FactsVideo ../renders/<id>.mp4 --props=".props/<id>.json" \
     --concurrency=4 --log=info'
```

Registered compositions include `FactsVideo`, `EarthFacts`, `USFacts`, `RussiaFacts`, `AustraliaFacts`, `OctopusFacts`, `OceanFacts`, `AmazonFacts`, `JapanFacts`, `BrazilFacts`, `EgyptFacts`, and `KineticVideo`. The API renders `FactsVideo` by default and auto-detects kinetic payloads.

The dashboard also accepts a simple asset shortcut:

```json
{ "asset": "qwen_20261116_081500_123.mp4", "topic": "ZES STUDIO PIPELINE" }
```

When no explicit `facts` array is supplied, the server fills five pipeline-themed facts. For image assets it wires `imageSrc`; for MP4/WebM assets it optionally extracts a poster frame with `ffmpeg`. If `ffmpeg` is unavailable, Remotion still renders with its animated backdrop.

Finished Qwen, previs, and Remotion MP4s are copied to `/storage/emulated/0/Movies` when `NO_MOVIE_EXPORT` is not `1`.

---

## Job queue

Internal shape:

```js
{
  id, type: "qwen" | "previs" | "render",
  status: "queued" | "running" | "done" | "error",
  progress: 0,           // 0–100
  log: [],               // bounded to 500 timestamped lines
  output: null,          // "/renders/<encoded file>" when done
  createdAt: 1730000000000,
  finishedAt: null
}
```

Extra fields kept for compatibility and diagnostics: `message`, `file`, `movieFile`, `error`, `updatedAt`, and `meta`.

Queue behavior:

- `MAX_CONCURRENT_JOBS` defaults to **2**; extra jobs remain visibly `queued` before transitioning to `running`.
- Worker stdout/stderr are captured line-by-line as `[HH:MM:SS OUT|ERR] …`.
- `PROGRESS <n>` lines set `job.progress`; `OUTPUT <path>` sets `job.file` / `job.output`.
- Remotion progress is also parsed from `NN%`, `Rendered n/m`, and `Encoded n/m` output.
- `DELETE /api/jobs/:id` sends `SIGTERM`, escalates to `SIGKILL` after 2 s, and marks the job `error` with `canceled by user`.
- `DELETE /api/render/:id` remains the legacy cancel route and returns `status: "canceled"`.
- `GET /api/jobs` returns newest-first jobs with a 10-line log tail; `GET /api/jobs/:id` returns a 400-line tail.
- Jobs are in memory only; restart the server and the queue is empty.

Example serialized job:

```json
{
  "id": "ae127d32",
  "type": "qwen",
  "status": "done",
  "progress": 100,
  "log": ["[08:13:42 OUT] PROGRESS 100", "[08:13:42 OUT] Completed: /renders/qwen_…mp4"],
  "logCount": 14,
  "output": "/renders/qwen_20261116_081500_123.mp4",
  "createdAt": 1794816822000,
  "finishedAt": 1794816831000,
  "message": "qwen video saved + exported to /storage/emulated/0/Movies",
  "error": null,
  "movieFile": "qwen_20261116_081500_123.mp4",
  "meta": { "prompt": "A frosted blue studio dolly shot", "aspect_ratio": "9:16" }
}
```

---

## API reference

| Method | Path | Body / params | Behavior |
|---|---|---|---|
| `GET` | `/api/status` | — | Health, version `2.0.0`, port, timestamp |
| `GET` | `/api/image` | `prompt`, `model`, `width`, `height` | Preserved Pollinations image proxy; returns image bytes |
| `POST` | `/api/qwen-video` | `{ prompt, aspect_ratio }` | Queue `qwen_video.py`; returns `{ jobId, job }` |
| `POST` | `/api/previs` | `{ shot_spec }` | Write `tmp/shot_<id>.json`, queue Blender; returns `{ jobId, job }` |
| `POST` | `/api/render` | FactsVideo props, KineticVideo payload, or `{ asset }` | Queue Remotion; legacy response fields preserved plus `jobId` |
| `GET` | `/api/render/:id` | — | Legacy render status / progress / file |
| `DELETE` | `/api/render/:id` | — | Legacy cancel route |
| `GET` | `/api/renders` | — | Preserved list of finished `.mp4` renders |
| `GET` | `/api/jobs` | — | All jobs, newest first |
| `GET` | `/api/jobs/:id` | — | Single job incl. long log tail |
| `DELETE` | `/api/jobs/:id` | — | Cancel a queued/running job |
| `GET` | `/api/assets` | — | Files in `renders/` with `size`, `bytes`, `mtime`, `mtimeMs`, `kind`, `stage`, `url` |
| `DELETE` | `/api/assets/:name` | — | Path-sanitized asset deletion |
| `GET` | `/api/settings` | — | Read-only env/config; never returns secret values |
| `POST` or `GET` | `/api/blender-test` | — | Runs `BLENDER_BIN --version`, returns ok / command / exitCode / durationMs / output |
| `GET` | `/renders/:file` | `?download=1`, HTTP `Range` | Streams MP4/WebM with Range; also serves PNG/JPG/JPEG/WebP |
| `*` | static | — | Serves `./public`; unknown paths fall back to `index.html` |

`/api/qwen-video` validates a non-empty prompt up to 4000 chars. `/api/previs` accepts a JSON object, a top-level object, or a JSON string in `shot_spec`. `/api/assets` excludes dotfiles and unfinished `.part` downloads.

---

## Request examples

Use `:3000` below if you started with `PORT=3000`; otherwise replace with `:8090`.

### Start a Qwen generation

```bash
curl -s -X POST http://localhost:3000/api/qwen-video \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A cinematic dolly shot across a frosted-blue studio at dawn","aspect_ratio":"9:16"}'
```

```json
{ "jobId": "ae127d32", "job": { "id": "ae127d32", "type": "qwen", "status": "queued", "progress": 0 } }
```

### Start a Blender previs

```bash
cat > shot.json <<'JSON'
{
  "name": "Frost card dolly",
  "frame_start": 1,
  "frame_end": 48,
  "fps": 24,
  "samples": 16,
  "engine": "CYCLES",
  "camera": {
    "location": [0, -9, 3.2],
    "end_location": [3.5, -7.5, 2.6],
    "look_at": [0, 0, 1],
    "lens": 35
  }
}
JSON

curl -s -X POST http://localhost:3000/api/previs \
  -H 'Content-Type: application/json' \
  -d @shot.json
```

The server rewrites the spec to `tmp/shot_<jobId>.json` and passes an absolute output path to Blender.

### Render from an asset shortcut

```bash
curl -s -X POST http://localhost:3000/api/render \
  -H 'Content-Type: application/json' \
  -d '{"asset":"qwen_20261116_081500_123.mp4","topic":"ZES STUDIO PIPELINE"}'
```

### Poll jobs

```bash
curl -s http://localhost:3000/api/jobs
curl -s http://localhost:3000/api/jobs/ae127d32
curl -s -X DELETE http://localhost:3000/api/jobs/ae127d32
```

### Assets and diagnostics

```bash
curl -s http://localhost:3000/api/assets
curl -s -X DELETE http://localhost:3000/api/assets/qwen_20261116_081500_123.mp4
curl -s http://localhost:3000/api/settings
curl -s -X POST http://localhost:3000/api/blender-test
curl -s "http://localhost:3000/api/image?prompt=frosted%20blue%20glass&width=512&height=512" -o backdrop.jpg
```

### Explicit FactsVideo props

```jsonc
{
  "kicker": "ZES STUDIO",
  "topic": "THE OCEAN",
  "accent": "#4DD8FF",
  "accent2": "#FFC94D",
  "handle": "@yourchannel",
  "audioSrc": "",
  "imageSrc": "https://…/optional-background.jpg",
  "facts": [
    /* exactly 5 */
    { "emoji": "🌊", "headline": "The ocean covers 71% of Earth",
      "detail": "Only a fraction of the seafloor is mapped in high detail.",
      "stat": "71%", "statLabel": "OF THE PLANET" }
  ],
  "frames": "0-90",
  "concurrency": 2
}
```

`imageSrc` adds a photographic backdrop under the animated gradient. The schema is enforced by `video/src/data.ts` and the server requires exactly five facts unless `{ asset }` is used.

---

## Shot-spec reference

`previs_build.py` accepts a flexible JSON object. All fields are optional; defaults build a three-cube studio shot.

| Field | Type | Default / meaning |
|---|---|---|
| `name`, `shot` | string | Display name used in job metadata and logs |
| `frame_start`, `frame_end`, `frames` | number | `1`, `48`; `frames` is used as `frame_end` when set |
| `fps` | number | `24`, clamped to 1–60 |
| `samples` | number | `16` Cycles CPU samples |
| `engine` | string | `CYCLES`; also accepts `BLENDER_EEVEE_NEXT` or `BLENDER_WORKBENCH` |
| `world` | object | `{ color, strength }` background color and strength |
| `ground` | object | `{ name, size, location, color, roughness }` |
| `camera` | object | `location`, `end_location`, `look_at`, `look_at_end`, `rotation`, `rotation_end`, `lens`, `clip_start`, `clip_end`, `sensor_width` |
| `sun` / `lights.sun` | object | Sun light `energy`, `location`, `look_at`, `color` |
| `fill` / `lights.fill` | object | Area light `energy`, `size`, `location`, `look_at`, `color` |
| `cubes` / `objects` | array | Each item supports `name`, `location`, `size`, `scale`, `rotation`, `rotation_end`, `spin`, `color`, `roughness` |

Colors accept `#RRGGBB`, `#RRGGBBAA`, or RGB/RGBA arrays. Rotation and spin values are interpreted in degrees. Camera `look_at` creates a tracked empty; `end_location` and `look_at_end` animate the move.

Full sample with cubes, lights, and world:

```json
{
  "name": "Frost card dolly",
  "frame_start": 1,
  "frame_end": 48,
  "fps": 24,
  "samples": 16,
  "engine": "CYCLES",
  "world": { "color": "#0b1220", "strength": 0.8 },
  "ground": { "size": 20, "color": "#202632", "roughness": 0.82 },
  "camera": {
    "location": [0, -9, 3.2],
    "end_location": [3.5, -7.5, 2.6],
    "look_at": [0, 0, 1],
    "lens": 35
  },
  "sun": { "energy": 2.4, "location": [4, -6, 9], "look_at": [0, 0, 1], "color": "#fff3d6" },
  "fill": { "energy": 700, "size": 6, "location": [-5, -2, 5], "look_at": [0, 0, 1], "color": "#6ee7ff" },
  "cubes": [
    { "name": "Subject_A", "location": [-2.4, 0, 1], "scale": [0.8, 0.8, 0.8], "color": "#6ee7ff", "spin": [0, 0, 180] },
    { "name": "Subject_B", "location": [0, 0.2, 1.15], "scale": [1, 1, 1], "color": "#4d8dff", "spin": [0, 0, -180] },
    { "name": "Subject_C", "location": [2.4, -0.1, 0.9], "scale": [0.7, 0.7, 0.7], "color": "#ffc94d", "spin": [0, 0, 180] }
  ]
}
```

---

## Qwen authentication

`qwen_video.py` resolves credentials in this order:

1. `QWEN_TOKEN`, `QWEN_PROXY`, `QWEN_MODEL`, `QWEN_COOKIES` from the environment.
2. Uppercase or lowercase aliases in gitignored `config.json`: `QWEN_TOKEN` / `qwen_token` / `token`, `QWEN_PROXY` / `qwen_proxy` / `proxy`, `QWEN_MODEL` / `qwen_model` / `model`, `QWEN_COOKIES` / `qwen_cookies` / `cookies`.
3. Cached qwen-reverse OAuth credentials via `SharedTokenManager` / `~/.qwen/oauth_creds.json`.

Video `t2v` is disabled for anonymous chat.qwen.ai access, so provide a logged-in token or cached OAuth credentials. Example `config.json`:

```json
{
  "QWEN_TOKEN": "paste-your-token-here",
  "QWEN_PROXY": "",
  "QWEN_MODEL": "qwen3.8-max",
  "QWEN_COOKIES": ""
}
```

Never commit `config.json`; `.gitignore` already excludes it. `/api/settings` exposes only a `qwenAuthConfigured` boolean, never token values. See [`SETUP.md`](SETUP.md) for the exact device-login snippet and `pip install` steps.

---

## Remotion integration

The `video/` directory is intentionally untouched. It remains a Remotion 4.0.540 project with its own `package.json`, `remotion.config.ts`, fonts, compositions, and optional `node_modules` symlink.

On Termux, Remotion cannot reliably render natively against Android/bionic, so `/api/render` uses Debian proot by default:

- Compositor: `@remotion/compositor-linux-arm64-gnu@4.0.540` inside shared `node_modules`.
- Browser: Remotion's bundled `chrome-headless-shell/linux-arm64`, or `REMOTION_BROWSER_EXECUTABLE`.
- GL backend: `Config.setChromiumOpenGlRenderer("swiftshader")`; `swangle` crashes under proot.
- CLI is invoked through `node`, not `npx` or `./node_modules/.bin/remotion`, because `/usr/bin/env` is unavailable on this device.
- Historic throughput: about **1.2 s/frame at concurrency 2**; a 1350-frame `FactsVideo` can take 25–30 minutes. Use `"frames": "0-90"` while iterating.
- Avoid Android's missing `/tmp`; this repo uses its own `tmp/` for shot specs and poster frames.

Set `RENDER_INSIDE_PROOT=0` on non-Android hosts to run the Remotion CLI natively.

---

## Pollinations image tools

Browsers send an `Origin` header on `fetch()`; `image.pollinations.ai` rejects unknown origins with **403**. `/api/image` fetches the same URL without an `Origin` header and streams the bytes back, so the browser only talks to the same origin.

- The v2 **Generate** view includes an optional Pollinations backdrop preview.
- `/legacy-image.html` preserves the classic model picker: `flux`, `zimage`, `klein`, `kontext`.
- `/arena/index.html` preserves the image-model arena.
- `generate_image.py` remains a standalone CLI.
- Anonymous tier still rate-limits; try another model or a shorter prompt.

---

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8090` | HTTP port; `PORT=3000` matches `BUILD-PROMPT.md` phone tests |
| `BLENDER_BIN` | `blender` | Blender binary or wrapper, e.g. `proot-distro login debian -- blender` |
| `PYTHON_BIN` | `python` | Python command used for `qwen_video.py` |
| `MAX_CONCURRENT_JOBS` | `2` | Bound for the unified in-memory queue |
| `MOVIES_DIR` | `/storage/emulated/0/Movies` | Gallery-visible copy destination |
| `NO_MOVIE_EXPORT` | unset | Set to `1` to disable finished-MP4 export |
| `RENDER_CONCURRENCY` | `4` | Remotion frame concurrency |
| `RENDER_INSIDE_PROOT` | on | Set to `0` to render natively |
| `REMOTION_BROWSER_EXECUTABLE` | bundled / Termux `headless_shell` | Override Chromium binary |
| `QWEN_TOKEN` | — | Logged-in chat.qwen.ai bearer token |
| `QWEN_PROXY` | — | Optional HTTP(S) proxy |
| `QWEN_MODEL` | `qwen_reverse.DEFAULT_MODEL` | Optional model override |
| `QWEN_COOKIES` | — | Optional cookie string for qwen-reverse versions that use it |
| `QWEN_TIMEOUT` | `600` | Generation timeout seconds, clamped to 60–1800 |
| `QWEN_BROWSER` | unset | `1` enables qwen-reverse browser transport |
| `QWEN_ALLOW_ANONYMOUS` | unset | `1` attempts guest t2v anyway; usually rejected upstream |
| `ZES_DEBUG` | unset | `1` prints Python tracebacks to stderr |

`BLENDER_BIN` is tokenized safely into `[bin, ...prefixArgs]` when it is a wrapper string. A literal existing absolute path is used directly. Quoted tokens are supported. All spawns use pipes and no shell.

---

## Security and path handling

- **No secrets in the repo:** `config.json`, `.env`, `renders/*`, `tmp/*`, `video/.props/`, `logs/`, and `video/node_modules` are ignored.
- `config.json` is read server-side and forwarded to the Python worker as environment variables; values are not shown in Settings or printed in logs.
- `DELETE /api/assets/:name` and `/renders/:file` use a strict single-filename sanitizer: decode, trim, reject `..`, `/`, `\`, NUL, dotfiles, overlong names, and any path that escapes `renders/`.
- `serveStatic` normalizes paths and falls back to `public/index.html`.
- `child_process.spawn` is called without `shell: true`; `BLENDER_BIN` wrapper strings are tokenized rather than concatenated into a shell command.
- API responses are CORS-open for same-device tooling. The server binds `0.0.0.0` and has **no authentication**; do not expose it publicly without adding an auth layer.
- Worker stderr is surfaced in Logs so missing Blender, missing qwen-reverse, and missing credentials produce actionable errors rather than silent failures.

---

## Termux setup

Full commands are in [`SETUP.md`](SETUP.md). Condensed:

```bash
pkg update && pkg upgrade -y
pkg install -y git nodejs python proot-distro ffmpeg termux-api
termux-setup-storage
cd ~/zes-studio

# qwen-reverse
python -m pip install --upgrade pip
python -m pip install -U qwen-reverse
python -c "from qwen_reverse import Video, DEFAULT_MODEL; print('qwen-reverse OK', DEFAULT_MODEL)"

# Blender inside Debian proot
proot-distro install debian
proot-distro login debian -- bash -lc "apt update && apt install -y blender ffmpeg"
export BLENDER_BIN="proot-distro login debian -- blender"

# Optional token (or use config.json / cached OAuth credentials)
export QWEN_TOKEN="paste-your-token-here"

# Start
PORT=3000 node server.mjs
```

If your Python executable is `python3` rather than `python`, export `PYTHON_BIN=python3`. Previs uses Cycles CPU, so no X11/EGL server is needed. Final Remotion renders still require the existing `video/` dependency setup or symlink.

---

## How to test on phone

1. Start the server in Termux:
   ```bash
   cd ~/zes-studio
   PORT=3000 node server.mjs
   ```
2. Open the dashboard:
   ```bash
   termux-open-url http://localhost:3000
   ```
   Or open `http://localhost:3000` manually; use `http://localhost:8090` for the default port.
3. Test the drawer:
   - tap the 44×44 px **Menu** button; the drawer slides in from the left;
   - tap the backdrop, press **Escape** with a keyboard, or swipe left to close;
   - confirm background scrolling is locked and keyboard focus stays in the drawer.
4. Test the pipeline:
   - **Dashboard → New Generation**: choose `9:16`, `16:9`, or `1:1`, enter a prompt, tap **Generate**; the job appears with a 2-second active-only poll.
   - **Previs → Build Previs**: check **Logs** for Blender stdout/stderr.
   - **Render**: select a generated asset and tap **Render Final**.
   - **Assets**: play, open, download, or delete a file.
   - **Settings → Test Blender**: verify `BLENDER_BIN --version`.
5. At 360 px width, confirm there is no horizontal scroll and no browser console errors.

---

## Verification and smoke tests

```bash
# Syntax
node --check server.mjs
node --check public/app.js
python3 -m py_compile qwen_video.py previs_build.py
git diff --check

# Start with zero root npm dependencies
node server.mjs

# API smoke
curl -s http://localhost:3000/api/status
curl -s http://localhost:3000/api/settings
curl -s http://localhost:3000/api/jobs
curl -s http://localhost:3000/api/assets
curl -s http://localhost:3000/api/renders
curl -s -X POST http://localhost:3000/api/blender-test

# Path traversal must be rejected
curl -s -X DELETE 'http://localhost:3000/api/assets/..%2Fpackage.json'

# Pollinations proxy
curl -s "http://localhost:3000/api/image?prompt=frosted%20blue%20glass&width=512&height=512" -o /sdcard/Download/zes-image.jpg
```

Verified behavior includes: static SPA serving, all legacy route shapes, validation errors, unified queue transitions, `PROGRESS` parsing, `OUTPUT` binding, worker failure paths, cancel, asset Range streaming, dotfile/traversal blocking, and Blender diagnostics. Real Blender, qwen-reverse, and Remotion runs require the tools installed per `SETUP.md`; absent tools fail cleanly with stderr messages in Logs.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `spawn blender ENOENT` / Test Blender fails | Install Blender in Debian proot and export `BLENDER_BIN="proot-distro login debian -- blender"` |
| `Blender binary not found` in a Previs log | Run **Settings → Test Blender**, then restart the server after exporting `BLENDER_BIN` |
| `qwen-reverse is not importable` | `python -m pip install -U qwen-reverse`; ensure `PYTHON_BIN` points at the same Python |
| `No Qwen credentials found` | Set `QWEN_TOKEN`, create gitignored `config.json`, or populate `~/.qwen/oauth_creds.json` |
| `Video generation (t2v) is disabled…` | Anonymous t2v is blocked upstream; use a logged-in token |
| `spawn proot-distro ENOENT` on Remotion | `pkg install proot-distro && proot-distro install debian`; log in once to finish setup |
| Pollinations preview fails / 429 | Anonymous tier is rate-limited; try another model or a shorter prompt |
| Final render has no poster image | `ffmpeg` is optional; install it or let Remotion use its animated backdrop |
| Phone feels slow or hot | Lower `MAX_CONCURRENT_JOBS`, `RENDER_CONCURRENCY`, Previs `samples`, or `frame_end` |
| Jobs disappear after restart | Expected: the queue is in memory; finished files remain in `renders/` |
| Cannot reach from another device | Use the phone's LAN IP and `PORT`; keep the server on a trusted network only |

---

## Legacy compatibility

The v2 upgrade preserves:

- `GET /api/status`, `GET /api/image`, `POST /api/render`, `GET /api/render/:id`, `DELETE /api/render/:id`, `GET /api/renders`, and `GET /renders/:file`.
- Exact `FactsVideo` validation: exactly five facts unless `{ asset }` is supplied.
- Automatic `KineticVideo` detection when `scenes[].textLayers` is present.
- Remote kinetic background download into `video/public/kinetic/`.
- Remotion proot invocation, `RENDER_CONCURRENCY`, `frames`, and `concurrency`.
- Auto-export to Android Movies unless `NO_MOVIE_EXPORT=1`.
- Pollinations proxy query parameters and byte streaming.
- `public/legacy-image.html`, `public/arena/index.html`, `public/tw-writer.html`, `generate_image.py`, `skills/`, and every file in `video/`.

Migration notes:

- `public/index.html` is now the control panel. Bookmark `/legacy-image.html` for the old image UI.
- `POST /api/render` still returns the original fields and additionally includes `jobId`.
- `GET /api/render/:id` keeps the original response shape; use `GET /api/jobs/:id` for full logs and metadata.
- Cancel through `DELETE /api/jobs/:id` yields `status: "error"` with `error: "canceled by user"`; the legacy `DELETE /api/render/:id` still yields `status: "canceled"`.
- `renders/` and `tmp/` are gitkept but their contents are ignored.

---

## KineticVideo payloads

`KineticVideo` renders code-driven kinetic text with per-scene 2.5D camera motion and sprung / word-by-word / typewriter animations. `POST /api/render` detects any body whose scenes contain `textLayers` and switches composition automatically.

```json
{
  "videoTitle": "Did Vikings Really Wear Horned Helmets?",
  "fps": 30,
  "durationInFrames": 240,
  "scenes": [
    {
      "id": "hook",
      "startFrame": 0,
      "durationInFrames": 90,
      "backgroundImage": "https://example.com/viking-helmet.jpg",
      "camera": { "type": "punchIn", "startScale": 1.0, "endScale": 1.3, "shake": true, "motionBlur": 270 },
      "textLayers": [
        {
          "text": "BIGGEST HISTORY LIE?",
          "position": { "top": "50%", "left": "5%" },
          "style": {
            "fontFamily": "Anton", "fontSize": 110, "color": "#FFD700",
            "textShadow": "4px 4px 8px rgba(0,0,0,0.8)", "textureEffect": "goldLeaf"
          },
          "animation": {
            "type": "staggeredSlide", "startFrame": 0, "durationInFrames": 45,
            "springConfig": { "damping": 12, "stiffness": 120, "mass": 0.8 }
          }
        }
      ],
      "transitionOut": { "type": "inkWipe", "durationInFrames": 15 }
    }
  ]
}
```

| Field | Values |
|---|---|
| `camera.type` | `static`, `kenBurns`, `parallax`, `punchIn` (+ `shake`, `panDistance`, `motionBlur`) |
| `animation.type` | `springScale`, `wordByWord`, `typewriter`, `maskReveal`, `bounceIn`, `springPop`, `staggeredSlide` |
| `style.textureEffect` | `none`, `goldLeaf`, `distressed`, `inkSplatter` |
| `transitionOut.type` | `none`, `fade`, `inkWipe`, `canvasTear` |

Notes:

- Remote `http(s)` backgrounds are downloaded into `video/public/kinetic/` and rewritten to static paths; local `kinetic/x.png` paths pass through.
- Each scene may carry a `staticFile`-style `.mp3` `audioSrc`; the payload may set `music` and `musicVolume`.
- Only `Anton` and `Inter` fonts are registered in `video/public/fonts`.
- `motionBlur` is a speed-blur approximation because frames render independently.
- Standalone demo:
  ```bash
  cd video && node node_modules/@remotion/cli/remotion-cli.js render src/index.ts KineticVideo ../renders/demo.mp4
  ```

---

## YouTube upload scripts

Uploads use YouTube's official Data API v3 — no third-party relay. Credentials live in `~/.secure-credentials/master.env`, never in this repo.

One-time setup in Google Cloud Console:

1. Create a project → Library → enable **YouTube Data API v3**.
2. OAuth consent screen → External → add `.../auth/youtube.upload` → set Publishing status **In production**.
3. Create an OAuth client ID of type **Desktop app**; put `YT_CLIENT_ID` and `YT_CLIENT_SECRET` into `master.env`.
4. On the device:
   ```bash
   cd ~/zes-studio/video
   python3 authorize.py        # prints a URL — approve in the phone browser
   ```

Upload commands:

```bash
python3 upload.py ../renders/Brazil-Top5-Facts.mp4 --meta meta/brazil.json --dry-run
python3 upload.py ../renders/Brazil-Top5-Facts.mp4 --meta meta/brazil.json --privacy public
python3 upload.py clip.mp4 --meta meta/brazil.json --schedule 2026-11-10T18:00
```

Meta JSON contains `title / description / tags / categoryId / privacy / publishAt`. `--dry-run` validates length limits, 9:16, and ≤180 s without touching the API. Uploads use 8 MB resumable chunks and print `youtu.be/<id>` on success. Quota: 10,000 units/day; one upload costs 1,600 units.

---

## Image CLI

```bash
python generate_image.py "a calico cat surfing on a glowing wave at sunset"
python generate_image.py "futuristic city" --model zimage --width 1280 --height 720
POLLINATIONS_API_KEY=pk_xxx python generate_image.py "portrait" --model klein --out portrait.png
```

Without a key the CLI falls back to anonymous `image.pollinations.ai` with lower priority. A key from [enter.pollinations.ai](https://enter.pollinations.ai) unlocks the higher-quota `gen.pollinations.ai` endpoint. The classic browser UI remains at `/legacy-image.html`.

---

## Agent skills

`skills/` holds agent-facing notes in the repo's `SKILL.md` frontmatter format:

| Skill | Covers |
|---|---|
| `zes-studio-agent` | **Authoritative agent runbook**: start server, queue/poll jobs, inspect logs, manage assets, troubleshoot; includes `scripts/zes_api.mjs`, a zero-dependency API CLI |
| `zes-studio` | v2 entry point, file map, routes, env vars, and guardrails |
| `zes-studio-video` | Remotion compositions, proot-Debian render path, kinetic payloads, narration, music, uploads |
| `zes-studio-image` | `/api/image` proxy, model quirks, `generate_image.py`, Generate-view preview, legacy handoff |
| `yt-research` | YouTube Shorts topic research and idea dossiers |

`zes-studio-agent` is authoritative for **operating** the studio; this README and
`BUILD-PROMPT.md` are authoritative for architecture and acceptance criteria.
The specialized skills were updated with v2 pointers while preserving their
Remotion/Pollinations depth.

---

## Definition of done

- `node server.mjs` starts with zero root npm dependencies installed.
- Dashboard loads at `/`; hamburger opens/closes with animation; focus trap, ESC, backdrop, body scroll lock, and swipe-left work.
- All interactive elements are at least 44×44 px; inputs are 16 px on mobile; no horizontal scroll at 360 px; no console errors.
- Submitting a Qwen generation creates a job, polls progress while active, and the finished MP4 appears in **Assets**.
- **Build Previs** spawns Blender headlessly and returns a job; errors surface in **Logs**.
- Existing `/api/render` and Pollinations `/api/image` behavior still work.
- `/api/jobs`, `/api/jobs/:id`, `/api/assets`, `/api/assets/:name`, `/api/settings`, and `/api/blender-test` are available.
- `config.json`, generated assets, and temporary files are ignored by Git.

---

## Attribution

- Design: [ZESCODE/frost-cards](https://github.com/ZESCODE/frost-cards)
- Images: [Pollinations.ai](https://pollinations.ai)
- Video: [Remotion](https://remotion.dev)
- 3D previs: [Blender](https://www.blender.org)
- Text-to-video client: [AnonymoDGH/Qwen-Reverse](https://github.com/AnonymoDGH/Qwen-Reverse)
- Local runtime: [Termux](https://termux.dev) + `proot-distro` Debian
