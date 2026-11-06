---
name: zes-studio
category: Media
description: Entry point for ZES Studio — local zero-dep server merging Pollinations image generation with Remotion short-video rendering. Use when running or modifying the studio, its server, endpoints, env config, or when asked to render/generate something in zes-studio.
---

# ZES Studio — Image + Video

One local server (`server.mjs`, zero external npm deps) that serves:

- **Image Studio** — Pollinations image generation through a same-origin proxy
- **Video Studio** — Remotion vertical shorts (1080×1920, 30 fps) rendered on demand

## Layout

| Path | Purpose |
|---|---|
| `server.mjs` | the whole server (image proxy + render job runner) |
| `public/index.html` | combined UI — Image / Video tabs |
| `public/legacy-image.html` | old Pollinations demo page (patched to `/api/image`) |
| `public/arena/`, `public/tw-writer.html` | extra pages |
| `video/` | Remotion project (compositions `FactsVideo`, `EarthFacts`, `USFacts`) |
| `renders/` | finished MP4s (gitignored) |
| `skills/` | project skills (this one + `zes-studio-video`, `zes-studio-image`) |

## Run

```bash
cd /data/data/com.termux/files/home/zes-studio
node server.mjs            # listens on 0.0.0.0:8090
```

For long-lived background use (agents):

```bash
setsid nohup node server.mjs >> logs/studio.log 2>&1 < /dev/null &
```

A plain `nohup … &` gets killed when the launching bash command times out
(process-group kill) — always use `setsid`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/status` | health + version |
| `GET` | `/api/image?prompt&model&width&height` | image proxy → `image.pollinations.ai` |
| `POST` | `/api/render` | start a render job (JSON body = `FactsVideo` props; optional `frames`, `concurrency`) |
| `GET` | `/api/render/:id` | job status: `progress`, `message`, `file`, `movieFile` |
| `DELETE` | `/api/render/:id` | cancel a running job |
| `GET` | `/api/renders` | list finished renders |
| `GET` | `/renders/:file.mp4` | stream video (HTTP `Range`, `?download=1`) |
| `*` | static | files from `./public` (SPA fallback) |

**Finished renders are auto-copied to `/storage/emulated/0/Movies`** so they show
in the phone gallery. Env overrides:

| Env | Default | Effect |
|---|---|---|
| `PORT` | `8090` | listen port |
| `RENDER_INSIDE_PROOT` | proot debian | set `0` to render natively (broken — see video skill) |
| `RENDER_CONCURRENCY` | `4` | Remotion concurrency |
| `NO_MOVIE_EXPORT` | off | set `1` to skip the Movies copy |
| `MOVIES_DIR` | `/storage/emulated/0/Movies` | export target |

The API render endpoint always renders composition `FactsVideo` with props from
the request body. To render `USFacts` / `EarthFacts` (fixed scripts), use the CLI
— see the `zes-studio-video` skill.
