---
name: zes-studio-agent
category: Media
description: Agent operating procedure for ZES Studio 2.0 — start the zero-dependency server, drive the mobile control panel through its local API, queue Blender Previs, Qwen AI Gen and Remotion Final Render jobs, poll /api/jobs, inspect Logs, manage Assets and troubleshoot. Use when an AI agent needs to run, operate, debug or programmatically use ~/zes-studio.
---

# ZES Studio — Agent Operator Skill

## Purpose

Give an AI agent a deterministic, safe runbook for **ZES Studio 2.0**: the local
Termux/Node control panel that orchestrates

```text
Previs (Blender headless) → AI Gen (qwen-reverse) → Final Render (Remotion)
```

This is the authoritative agent skill for **operating** the studio. Use
[`README.md`](../../README.md) for architecture, [`SETUP.md`](../../SETUP.md) for
installation, and [`BUILD-PROMPT.md`](../../BUILD-PROMPT.md) for the original
upgrade contract. For Remotion composition internals use `zes-studio-video`;
for Pollinations model quirks use `zes-studio-image`; for topic ideation use
`yt-research`.

## When to use this skill

Use it when a user or another agent asks to:

- start, stop, health-check, or configure `node server.mjs`;
- generate a Qwen text-to-video clip;
- build a Blender previs from a shot-spec JSON;
- render a final Remotion MP4 from an asset or explicit props;
- list, open, play, download, or delete files in `renders/`;
- poll jobs, read Logs, cancel work, or test Blender;
- drive the phone dashboard through its same-origin API;
- diagnose why a pipeline job failed.

Do **not** use it to change React/Remotion compositions, upload to YouTube, or
research Shorts topics — hand those tasks to the specialized skills above.

## Input required

| Task | Minimum input |
|---|---|
| Any API call | `ZES_BASE` (default `http://localhost:8090`; use `:3000` when started with `PORT=3000`) |
| Qwen generation | `prompt`, optional `aspect_ratio` (`9:16`, `16:9`, `1:1`, `4:3`, `3:4`) |
| Previs | shot-spec JSON object or a path to a `.json` file |
| Final render | asset filename from `/api/assets`, or `-` for the animated-backdrop default facts, plus optional `topic` |
| Existing job | `jobId` returned by a `POST` route |
| Asset operation | single filename from `/api/assets`, never a path |

## Agent contract

1. **Work from the repo root.** `server.mjs` resolves paths relative to
   `process.cwd()` when `public/` is present; otherwise it falls back to its own
   module directory. Start there for predictable behavior.
2. **Never add root npm dependencies.** `server.mjs` uses Node built-ins only.
   Do not run `npm install` at the repo root. The `video/` project has its own
   dependencies or the Termux `node_modules` symlink; leave it untouched.
3. **Prefer the API over manual child processes.** Use `/api/previs`,
   `/api/qwen-video`, and `/api/render`; do not invoke `blender`, `python`, or
   the Remotion CLI directly unless debugging the workers themselves.
4. **Use same-origin URLs.** Browser code must call `/api/*` and `/renders/*`,
   never `image.pollinations.ai` or `localhost` from a different host.
5. **Use the unified queue.** `GET /api/jobs` and `GET /api/jobs/:id` are the
   source of truth. `GET /api/render/:id` is preserved only for legacy clients
   and has no full log tail.
6. **Poll only while active.** After queueing, poll `/api/jobs/:id` every
   **2000 ms** while `status` is `queued` or `running`. Stop on `done` or
   `error`. Do not poll when idle.
7. **Never print or commit secrets.** `QWEN_TOKEN`, `QWEN_COOKIES`, proxies, and
   `config.json` values stay server-side. `/api/settings` exposes only
   `qwenAuthConfigured` as a boolean.
8. **Sanitize asset names.** Pass a single filename to `/api/assets/:name` and
   `/renders/:file`; never construct `..`, absolute paths, or dotfiles. The
   server rejects them.
9. **Confirm destructive actions.** Ask before `DELETE /api/jobs/:id` (cancel)
   or `DELETE /api/assets/:name`. The bundled CLI requires `--yes`.
10. **Surface errors from Logs.** On `status: "error"`, read
    `GET /api/jobs/:id`, quote the last stderr lines, and give the matching
    remediation from the troubleshooting table below.
11. **Keep worker spawning safe.** When editing server/worker code, use
    `child_process.spawn` with `stdio: "pipe"` and never `shell: true`.
12. **Local only.** The server binds `0.0.0.0` with no authentication. Do not
    expose it publicly; keep it on `localhost` or a trusted LAN.

## Start / discover

### Start the server

Agent runtimes with long-lived process tools:

```bash
# cwd = /home/user/zes-studio (or ~/zes-studio on Termux)
PORT=3000 NO_MOVIE_EXPORT=1 node server.mjs
# bind 0.0.0.0:3000, relative URLs, no Android Movies writes in sandboxes
```

Termux foreground:

```bash
cd ~/zes-studio
PORT=3000 node server.mjs
# or: node server.mjs  →  http://localhost:8090
```

Termux detached (agents):

```bash
cd ~/zes-studio
setsid nohup env PORT=3000 node server.mjs >> logs/studio.log 2>&1 < /dev/null &
```

A plain `nohup … &` can be killed when the launching shell times out; use
`setsid`. `npm start` is equivalent to `node server.mjs`.

### Discover capabilities

```bash
export ZES_BASE=http://localhost:3000
node skills/zes-studio-agent/scripts/zes_api.mjs status
node skills/zes-studio-agent/scripts/zes_api.mjs settings
node skills/zes-studio-agent/scripts/zes_api.mjs blender-test
node skills/zes-studio-agent/scripts/zes_api.mjs jobs
node skills/zes-studio-agent/scripts/zes_api.mjs assets
```

`settings` reports `blenderBin`, `resolvedBlenderBin`, `outputDir`, `tmpDir`,
`qwenAuthConfigured`, `maxConcurrentJobs`, `port`, and render/proot flags.
`blender-test` returns `ok:false` with an actionable message when Blender is not
installed; that is expected in a bare sandbox.

## Bundled API CLI

`scripts/zes_api.mjs` is a zero-dependency Node ESM helper. It prints JSON to
stdout and progress/errors to stderr. Set `ZES_BASE` to override the base URL;
set `ZES_WATCH_TIMEOUT_MS` to override the 15-minute watch timeout.

| Command | API action |
|---|---|
| `status` | `GET /api/status` |
| `settings` | `GET /api/settings` |
| `blender-test` | `POST /api/blender-test` |
| `jobs` | `GET /api/jobs` |
| `job <id>` | `GET /api/jobs/:id` incl. log tail |
| `watch <id>` | poll every 2 s until terminal, then print final job |
| `qwen "<prompt>" [aspect] [--watch]` | `POST /api/qwen-video` |
| `previs <shot.json\|inline-json> [--watch]` | `POST /api/previs` |
| `render <asset\|-> [topic] [--watch]` | `POST /api/render` |
| `assets` | `GET /api/assets` |
| `renders` | `GET /api/renders` (legacy list) |
| `image "<prompt>" <out> [width] [height] [model]` | `GET /api/image` → binary file |
| `cancel <id> --yes` | `DELETE /api/jobs/:id` |
| `delete <asset> --yes` | `DELETE /api/assets/:name` |
| `help` | usage |

Examples:

```bash
export ZES_BASE=http://localhost:3000
CLI=skills/zes-studio-agent/scripts/zes_api.mjs

node "$CLI" qwen "Frosted blue studio dolly shot at dawn" 9:16 --watch
node "$CLI" previs '{"name":"smoke","frame_end":12,"camera":{"look_at":[0,0,1]}}' --watch
node "$CLI" assets
node "$CLI" render qwen_20261116_081500_123.mp4 "ZES PIPELINE" --watch
node "$CLI" job ae127d32
node "$CLI" cancel ae127d32 --yes
node "$CLI" delete old_clip.mp4 --yes
```

`render -` sends five default facts with the animated backdrop; `render <asset>`
uses the server's asset shortcut. For explicit `FactsVideo` props or a
`KineticVideo` payload, call `POST /api/render` directly with the full JSON body
(see `zes-studio-video`).

## Operating procedures

### 1. Health gate

1. `GET /api/status` → `ok:true`, `version:"2.0.0"`.
2. `GET /api/settings` → record `port`, `blenderBin`, `outputDir`,
   `qwenAuthConfigured`, `maxConcurrentJobs`.
3. For Previs, run `POST /api/blender-test` first; if `ok:false`, warn the user
   and quote the output instead of queueing a guaranteed failure.
4. For Qwen, if `qwenAuthConfigured` is false, remind the user to set
   `QWEN_TOKEN`, create gitignored `config.json`, or populate qwen-reverse's
   OAuth cache.

### 2. Queue a Qwen video

```bash
curl -s -X POST "$ZES_BASE/api/qwen-video" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A cinematic dolly shot across a frosted-blue studio at dawn","aspect_ratio":"9:16"}'
```

Response: `{ "jobId": "…", "job": { "status": "queued", … } }`.

Then:

```text
repeat every 2 s:
  GET /api/jobs/<jobId>
  until status ∈ {done, error}
```

On `done`, verify the file appears in `GET /api/assets` and report
`job.output` (`/renders/<encoded-name>`). On `error`, report `job.error` plus the
last `ERR` log lines.

### 3. Build a Blender previs

Use the UI's default shot spec or a minimal object:

```json
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
```

`POST /api/previs` writes `tmp/shot_<jobId>.json` and spawns
`$BLENDER_BIN -b --python-exit-code 1 -P previs_build.py -- <absolute shot> <absolute output>`.
Default output is `renders/previs_<timestamp>.mp4` at 640×360, H.264, Cycles CPU.
Poll and verify exactly like a Qwen job. If Blender is missing, the log contains
`Blender binary not found` and the Settings fix.

### 4. Render the final MP4

Preferred dashboard shortcut:

```bash
curl -s -X POST "$ZES_BASE/api/render" \
  -H 'Content-Type: application/json' \
  -d '{"asset":"qwen_20261116_081500_123.mp4","topic":"ZES STUDIO PIPELINE"}'
```

The server supplies five default facts. Image assets are wired into `imageSrc`;
MP4/WebM assets optionally get an `ffmpeg` poster frame. If `ffmpeg` is absent,
Remotion uses its animated backdrop. Explicit bodies with exactly five `facts`
and bodies containing `scenes[].textLayers` still render `FactsVideo` and
`KineticVideo` exactly as before.

Poll `/api/jobs/:id`. Remotion progress is parsed from `NN%`,
`Rendered n/m`, and `Encoded n/m` lines.

### 5. Images (optional)

```bash
curl -s "$ZES_BASE/api/image?prompt=frosted%20blue%20glass&model=flux&width=768&height=768" -o backdrop.jpg
```

Never call `image.pollinations.ai` directly from browser code. The Generate view
uses the proxy for a preview; `/legacy-image.html` preserves the classic
one-click background handoff.

### 6. Assets, Logs, cancellation

- `GET /api/assets` → `name`, `url`, `size`, `mtime`, `kind`, `stage`.
- Open with `/renders/<encoded-name>`; add `?download=1` for a download.
- Video and image files stream directly; video supports HTTP `Range`.
- `GET /api/jobs/:id` returns up to 400 log lines. Logs are bounded to 500
  internally and formatted `[HH:MM:SS OUT|ERR] …`.
- `DELETE /api/jobs/:id` cancels active jobs and returns `error:"canceled by user"`.
  The legacy `DELETE /api/render/:id` returns `status:"canceled"`.
- `DELETE /api/assets/:name` rejects `..`, `/`, `\`, NUL bytes, dotfiles, and
  overlong names.

### 7. Drive the dashboard UI

Hash routes: `#dashboard`, `#generate`, `#previs`, `#render`, `#assets`,
`#logs`, `#settings`. Nav links are `<a>`; actions are `<button>`; there are no
`div` click handlers. The 44×44 px hamburger has `aria-label="Menu"`,
`aria-expanded`, and `aria-controls="drawer"`. Escape, backdrop tap, and
swipe-left close the drawer; body scroll is locked and focus is trapped while
open. **New Generation** opens a bottom sheet; recent video thumbnails open a
fullscreen player sheet. All touch targets are ≥44×44 px, inputs are 16 px on
mobile, and there is no horizontal scroll at 360 px.

For browser automation, use relative URLs and tap/click real controls. Do not
rely on hover states.

## Job state machine

```text
POST /api/{qwen-video|previs|render}
        │
        ▼
     queued ──► running ──► done  (progress 100, output set)
        │            │
        │            └────► error (error + stderr log tail)
        └────────────────► error (canceled by user)
```

Unified job fields: `id`, `type`, `status`, `progress`, `log`, `logCount`,
`output`, `createdAt`, `finishedAt`, `message`, `error`, `movieFile`, `meta`.
`MAX_CONCURRENT_JOBS` defaults to 2, so a second simultaneous job may legitimately
remain `queued` before it transitions to `running`. Jobs are in memory and vanish
on server restart; assets persist.

## API quick reference

| Method | Path | Use |
|---|---|---|
| `GET` | `/api/status` | health |
| `GET` | `/api/settings` | env readout, no secrets |
| `POST`/`GET` | `/api/blender-test` | Blender version diagnostics |
| `GET` | `/api/image` | Pollinations proxy |
| `POST` | `/api/qwen-video` | queue Qwen worker |
| `POST` | `/api/previs` | queue Blender worker |
| `POST` | `/api/render` | queue Remotion worker (legacy route preserved) |
| `GET` | `/api/jobs` | all jobs newest first |
| `GET` | `/api/jobs/:id` | one job, full log tail |
| `DELETE` | `/api/jobs/:id` | cancel |
| `GET` | `/api/assets` | list assets |
| `DELETE` | `/api/assets/:name` | delete asset |
| `GET` | `/api/render/:id` | legacy render status |
| `DELETE` | `/api/render/:id` | legacy cancel |
| `GET` | `/api/renders` | legacy MP4 list |
| `GET` | `/renders/:file` | stream/download with Range |

## Environment cheat sheet

| Variable | Default | Agent note |
|---|---|---|
| `ZES_BASE` | `http://localhost:<PORT>` | base URL for the bundled CLI |
| `PORT` | `8090` | use `3000` for BUILD-PROMPT phone tests |
| `BLENDER_BIN` | `blender` | set to `proot-distro login debian -- blender` on Termux |
| `PYTHON_BIN` | `python` | override to `python3` if needed |
| `MAX_CONCURRENT_JOBS` | `2` | explains `queued` jobs |
| `QWEN_TOKEN` / `config.json` | — | never print; check `qwenAuthConfigured` |
| `NO_MOVIE_EXPORT` | unset | set `1` in sandboxes to skip Android Movies copy |
| `MOVIES_DIR` | `/storage/emulated/0/Movies` | gallery export target |
| `RENDER_CONCURRENCY` | `4` | Remotion frame concurrency |
| `RENDER_INSIDE_PROOT` | on | set `0` only on non-Android hosts |

## Troubleshooting

| Symptom | Agent response |
|---|---|
| `spawn blender ENOENT` / `Blender binary not found` | Quote Settings, install Blender in Debian proot, export `BLENDER_BIN`, rerun `blender-test` |
| `qwen-reverse is not importable` | Tell user to `python -m pip install -U qwen-reverse`; verify `PYTHON_BIN` |
| `No Qwen credentials found` / `t2v is disabled` | Set `QWEN_TOKEN`, gitignored `config.json`, or qwen-reverse OAuth cache; see `SETUP.md` |
| `spawn proot-distro ENOENT` | Install `proot-distro` and Debian; Remotion needs it on Termux |
| `exactly 5 facts are required` | Use `{ asset }`, supply five facts, or send a valid `KineticVideo` payload |
| `invalid asset filename` | Use one plain filename from `/api/assets`; no `..`, `/`, or dotfiles |
| `upstream_unreachable` / image 429 | Pollinations is rate-limited; retry later or change model/prompt |
| Job stuck `running` | Read `/api/jobs/:id`; cancel only after user confirmation; check worker stderr |
| `queued` for a long time | Expected when `MAX_CONCURRENT_JOBS` is reached; check `/api/jobs` before assuming a hang |
| Jobs vanish after restart | Expected in-memory behavior; verify files with `/api/assets` |

## Output format to the user

After any job, report a compact structured result:

```text
ZES Studio <type> job <id>: <status> (<progress>%).
Output: /renders/<file>  |  none yet
Logs: <last 2–3 meaningful lines>
Next: <verify asset / open player / fix X / cancel?>
```

On failure, include the exact `job.error` and the matching remediation. Never
include token values, cookie strings, or the contents of `config.json`.

## Quality gates

- `GET /api/status` is `ok:true` before any operation.
- No root `npm install`, no new frontend dependency, no CDN script.
- No secret is printed, logged, committed, or echoed in the final answer.
- Polling is 2000 ms and stops immediately on `done` / `error`.
- A successful job's `output` also appears in `GET /api/assets`.
- Destructive actions are confirmed and use a single sanitized filename.
- Errors are quoted from `/api/jobs/:id` with an actionable next step.
- `video/src/*` and `video/node_modules` are untouched unless the user explicitly
  asked for a Remotion code change.

## Handoff

- `zes-studio` — short v2 entry point and file map.
- `zes-studio-video` — Remotion compositions, kinetic payloads, narration, uploads.
- `zes-studio-image` — Pollinations proxy details and legacy image UI.
- `yt-research` — topic/idea dossiers before generation.
- `README.md`, `SETUP.md`, `BUILD-PROMPT.md` — architecture, install, and spec.
