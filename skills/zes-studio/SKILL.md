---
name: zes-studio
category: Media
description: Entry point for ZES Studio 2.0 — local zero-dependency server, mobile Frost-Card control panel, unified job queue, Blender previs, Qwen video, Remotion renders, Pollinations image proxy, env config and API routes. Use when running, modifying, or locating anything in ~/zes-studio.
---

# ZES Studio — Entry Point

ZES Studio 2.0 is one local Node ESM server plus a phone-first control panel:

```text
Previs (Blender headless) → AI Gen (qwen-reverse) → Final Render (Remotion)
```

The root server has **zero npm dependencies**. It serves the Frost-Card SPA,
proxies Pollinations images, keeps an in-memory `Map<jobId, Job>` queue, and
spawns three workers with `child_process.spawn` / `stdio: "pipe"` and no shell.

> **Agent operators:** load `zes-studio-agent` first. It is the authoritative
> runbook for starting the server, queueing jobs, polling `/api/jobs`, reading
> logs, managing assets, and troubleshooting; it also bundles
> `scripts/zes_api.mjs`, a zero-dependency API CLI.

## Layout

| Path | Purpose |
|---|---|
| `server.mjs` | extended zero-dep HTTP server, static files, image proxy, unified queue |
| `qwen_video.py` | async `qwen_reverse.Video` worker → `renders/qwen_<timestamp>.mp4` |
| `previs_build.py` | headless `bpy` worker → 640×360 `renders/previs_<timestamp>.mp4` |
| `public/index.html` | v2 control panel SPA (7 views) |
| `public/app.js` | vanilla ES module: drawer, sheets, polling, forms |
| `public/style.css` | mobile-first blue Frost-Card dark theme |
| `public/legacy-image.html` | classic Pollinations image UI (preserved) |
| `public/arena/`, `public/tw-writer.html` | extra preserved pages |
| `video/` | untouched Remotion 4.0.540 project (`FactsVideo`, country facts, `KineticVideo`) |
| `renders/` | generated MP4s/images; contents ignored, `.gitkeep` tracked |
| `tmp/` | `shot_<id>.json`, poster frames; contents ignored, `.gitkeep` tracked |
| `config.json` | gitignored local secrets, never commit |
| `SETUP.md` | exact Termux install, Blender proot, Qwen auth, phone tests |
| `README.md` | complete v2 architecture and API documentation |
| `BUILD-PROMPT.md` | original v2 upgrade specification |
| `skills/` | this entry point + `zes-studio-agent`, `zes-studio-video`, `zes-studio-image`, `yt-research` |

`video/node_modules` is a symlink on the original Termux device. Never run
`npm install` at the root or replace that symlink.

## Run

```bash
cd ~/zes-studio
node server.mjs            # http://localhost:8090 (backward-compatible default)
PORT=3000 node server.mjs  # http://localhost:3000 (BUILD-PROMPT phone test)
npm start                  # equivalent
```

For long-lived background use by agents on Termux:

```bash
setsid nohup env PORT=3000 node server.mjs >> logs/studio.log 2>&1 < /dev/null &
```

A plain `nohup … &` can be killed when the launching shell times out; use
`setsid`. In sandbox/agent runtimes, prefer a managed long-lived process bound
to `0.0.0.0` and use relative URLs from the browser.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/status` | health + version `2.0.0` |
| `GET` | `/api/image?prompt&model&width&height` | preserved Pollinations proxy |
| `POST` | `/api/qwen-video` | queue `qwen_video.py`, returns `{ jobId }` |
| `POST` | `/api/previs` | write `tmp/shot_<id>.json`, queue Blender, returns `{ jobId }` |
| `POST` | `/api/render` | preserved Remotion route; explicit props, kinetic payload, or `{ asset }` |
| `GET` | `/api/render/:id` | legacy render status / progress |
| `DELETE` | `/api/render/:id` | legacy cancel |
| `GET` | `/api/renders` | legacy MP4 list |
| `GET` | `/api/jobs` | all jobs newest first |
| `GET` | `/api/jobs/:id` | single job incl. long log tail |
| `DELETE` | `/api/jobs/:id` | cancel active job |
| `GET` | `/api/assets` | files with size, mtime, kind, stage |
| `DELETE` | `/api/assets/:name` | path-sanitized deletion |
| `GET` | `/api/settings` | read-only env readout, no secret values |
| `POST`/`GET` | `/api/blender-test` | run `BLENDER_BIN --version` |
| `GET` | `/renders/:file` | stream with HTTP `Range`, `?download=1` |
| `*` | static | `./public`, SPA fallback to `index.html` |

The dashboard polls `/api/jobs` every **2000 ms only while a job is `queued` or
`running`**. `MAX_CONCURRENT_JOBS` defaults to 2, so extra jobs may briefly show
as `queued` before `running`.

## Environment

| Var | Default | Effect |
|---|---|---|
| `PORT` | `8090` | HTTP port |
| `BLENDER_BIN` | `blender` | use `proot-distro login debian -- blender` on Termux |
| `PYTHON_BIN` | `python` | Python used for `qwen_video.py` |
| `MAX_CONCURRENT_JOBS` | `2` | unified queue bound |
| `QWEN_TOKEN` / `config.json` | — | Qwen credentials; never commit |
| `QWEN_PROXY`, `QWEN_MODEL`, `QWEN_COOKIES` | — | optional qwen-reverse overrides |
| `NO_MOVIE_EXPORT` | off | set `1` to skip Android Movies copy |
| `MOVIES_DIR` | `/storage/emulated/0/Movies` | gallery export target |
| `RENDER_CONCURRENCY` | `4` | Remotion frame concurrency |
| `RENDER_INSIDE_PROOT` | on | set `0` only on non-Android hosts |
| `REMOTION_BROWSER_EXECUTABLE` | bundled / Termux headless shell | Chromium override |

Finished Qwen, previs, and Remotion MP4s are copied to `MOVIES_DIR` unless
`NO_MOVIE_EXPORT=1`.

## Guardrails

- No root npm dependencies, no frontend framework, no CDN `<script>`.
- Do not break `/api/render` or `/api/image`; extend them.
- Do not edit `video/src/*` unless the user explicitly requests a Remotion change.
- Read secrets from `process.env` or gitignored `config.json`; never print them.
- Spawn children with `stdio: "pipe"` and never `shell: true`.
- Resolve paths relative to `process.cwd()`; start the server from the repo root.
- Keep the server on `localhost` or a trusted LAN; it has no authentication.

## Handoff

- `zes-studio-agent` — full agent operating procedure + bundled API CLI.
- `zes-studio-video` — compositions, kinetic payloads, narration, music, uploads.
- `zes-studio-image` — Pollinations proxy details and legacy image UI.
- `yt-research` — Shorts topic research before generation.
- `README.md` / `SETUP.md` / `BUILD-PROMPT.md` — docs, install, spec.
