---
name: zes-studio-video
category: Media
description: Remotion video rendering for zes-studio — compositions, the mandatory proot-Debian render path, narration regeneration via 9Router TTS, background-music swaps, duration re-padding, and ffprobe verification. Use when rendering, fixing, or changing any video in ~/zes-studio/video.
---

# zes-studio — Video rendering (Remotion)

Project at `~/zes-studio/video`. Remotion 4.0.540, 1080×1920 @ 30 fps.

## Compositions

| id | Source | Notes |
|---|---|---|
| `FactsVideo` | `FactsVideo.tsx` + `data.ts` | props-driven (5 facts); what `/api/render` renders |
| `EarthFacts` | `EarthFacts.tsx` + `earthScript.ts` | fixed script |
| `USFacts` | `USFacts.tsx` + `usScript.ts` | fixed script; 2239 frames ≈ 74.6 s |
| `RussiaFacts` | `RussiaFacts.tsx` + `russiaScript.ts` | same template as USFacts, navy/gold accents; 2274 frames ≈ 75.8 s; uses `audio-ru/` narration + `kinetic/ru-*.jpg` backgrounds |
| `AustraliaFacts` | `AustraliaFacts.tsx` + `australiaScript.ts` | same template, green/gold accents; 2359 frames ≈ 78.6 s; uses `audio-au/` narration + `kinetic/au-*.jpg` backgrounds |
| `OctopusFacts` | `OctopusFacts.tsx` + `octopusScript.ts` | same template, violet/coral accents; 2401 frames ≈ 80 s; uses `audio-oc/` narration + `kinetic/oc-*.jpg` backgrounds |
| `OceanFacts` | `OceanFacts.tsx` + `oceanScript.ts` | same template, teal/cyan accents; 2461 frames ≈ 82 s; `audio-ocean/` narration + `geography.mp3` music + `kinetic/o-*.jpg` backgrounds |
| `AmazonFacts` | `AmazonFacts.tsx` + `amazonScript.ts` | same template, forest-green/gold accents; 2389 frames ≈ 80 s; `audio-am/` narration + `kinetic/am-*.jpg` backgrounds |
| `JapanFacts` | `JapanFacts.tsx` + `japanScript.ts` | same template, imperial red/gold accents; 2303 frames ≈ 77 s; `audio-jp/` narration + `kinetic/jp-*.jpg` backgrounds |
| `BrazilFacts` | `BrazilFacts.tsx` + `brazilScript.ts` | same template, green/yellow accents; 2383 frames ≈ 79 s; `audio-br/` narration + `kinetic/br-*.jpg` backgrounds |
| `EgyptFacts` | `EgyptFacts.tsx` + `egyptScript.ts` | same template, sandstone gold/lapis accents; 2869 frames ≈ 96 s; `audio-eg/` narration + `kinetic/eg-*.jpg` backgrounds |
| `KineticVideo` | `KineticVideo.tsx` + `kinetic.ts` | props-driven kinetic typography (JSON payload); what `/api/render` auto-detects via `textLayers` |

`video/node_modules` is a **symlink** to `~/shorts-studio/node_modules` (~840 MB).
Never run `npm install` in `video/` — it would replace the symlink and duplicate
840 MB.

## Render (must use proot Debian)

The Rust compositor ships only for glibc/linux-arm64; Termux-native renders die
on the esbuild `@esbuild/android-arm64` mismatch:

```bash
proot-distro login debian -- bash -lc 'cd "/data/data/com.termux/files/home/zes-studio/video" \
  && CI=1 node node_modules/@remotion/cli/remotion-cli.js render src/index.ts USFacts \
  ../renders/US-Top5-Facts.mp4 --concurrency=4 --log=info'
```

- Run in the **foreground** with a ≥45 min timeout — ~0.3–0.8 s/frame on this
  device, so a full 2239-frame render takes 20–30 min.
- With `--log=info` in a detached/log file context progress can look frozen at
  "Getting composition" and chrome never appears; use foreground + verbose logs
  if anything looks stuck. Remotion finds its own
  `node_modules/.remotion/chrome-headless-shell/…/headless_shell` — no
  `REMOTION_BROWSER_EXECUTABLE` needed.
- Verify with:
  `ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of default=noprint_wrappers=1 out.mp4`

## Narration (per-scene voice)

Narration lives in `video/public/audio-us/` (US) or `video/public/audio/`
(Earth) as one MP3 per scene, referenced from `usScript.ts` (`audio:` fields),
played at volume 1 in `USFacts.tsx`.

To regenerate (e.g. transcript missing "Fact number N") via 9Router TTS:

```bash
curl -X POST "$GATEWAY_URL/v1/audio/speech" -H "Content-Type: application/json" \
  -d '{"model":"edge-tts/en-US-ChristopherNeural","input":"Fact number one. …"}' \
  --output fact1.mp3
```

- The **`edge-tts/` prefix is required** — a bare voice id gets routed to OpenAI
  and fails with `Incorrect API key provided` (502). Requires the 9Router skill
  (`zes-9router-tts`) for `GATEWAY_URL`.
- Keep the old files in `video/public/audio-us-old/` (gitignored backup).
- After swapping audio, re-pad scene durations in `usScript.ts`:
  `duration = round((narration_seconds + 1.5) × 30)` so speech never clips.

## Background music

`USFacts.tsx` plays `staticFile("audio-us/music.mp3")` at volume 0.2 for the
whole video. Swap tracks by overwriting that file (a longer track than
the video is fine — it just cuts off at the end).

## Kinetic typography payloads

`POST /api/render` with a body whose scenes contain `textLayers` renders `KineticVideo`
(schema: `video/src/kinetic.ts`, mirrors the JSON KineticTypographySchema):

- `camera`: `static|kenBurns|parallax|punchIn`, plus `shake`, `panDistance`, `motionBlur`
  (approximated as a speed blur — frames render independently, so true shutter
  accumulation is impossible)
- `animation`: `springScale|wordByWord|typewriter|maskReveal|bounceIn|springPop|staggeredSlide`
  with `springConfig` (damping/stiffness/mass) and optional `bezier()` easing
- `style.textureEffect`: `none|goldLeaf|distressed|inkSplatter` (gradient clip / SVG
  feDisplacementMap filters)
- `transitionOut`: `none|fade|inkWipe|canvasTear`
- **Remote `http(s)` `backgroundImage` URLs are downloaded server-side into
  `video/public/kinetic/` and rewritten to static paths** — Remotion only bundles local
  assets. Local `*.jpg/*.png` paths pass through as-is.
- Only fonts `Anton` and `Inter` are registered; other `fontFamily` values fall back.
- **Audio:** scene-level `audioSrc` (narration mp3) + optional top-level `music` /
  `musicVolume`. This repo's narration uses ElevenLabs via 9Router:
  `POST :20128/v1/audio/speech` with `{"model":"el/<model>/<voiceId>","input":...}` and a
  gateway key; scripts live in `video/public/audio-ru/` (Russia set, generated 2026-11-06.
  Re-pad scene durations to `round((narration + 1.5s) × 30)` frames after swapping audio.

Render standalone (demo props ship in `kineticDefaultProps`):

```bash
cd video && node node_modules/@remotion/cli/remotion-cli.js render src/index.ts KineticVideo ../renders/out.mp4
```

## Gotchas

**New topic videos** are now 3 files: copy `australiaScript.ts` → `<topic>Script.ts`
(new scenes/durations), a 3-line `<Topic>Facts.tsx` wrapper around `TopNFacts`, and a
`<Composition>` row in `Root.tsx`. The template (`TopNFacts.tsx`) holds all visuals —
never copy the whole component again.

- zod version warning ("installed 3.25.76, required 4.6.7") is noise from the
  symlinked deps — renders still work.
- `remotion.config.ts` targets the Termux `headless_shell` only when
  `platform === "android"`; under Debian it resolves the bundled shell.
- API jobs (`/api/render`) always target `FactsVideo` and need exactly 5 facts
  in the body.
