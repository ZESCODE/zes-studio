# ZES Studio — Termux setup

This upgrade keeps `server.mjs` at **zero npm dependencies**. The control panel, job queue, Python workers, Pollinations proxy and Remotion trigger all run with Node built-ins plus the Python/Blender tools below. The existing `video/` Remotion project is untouched and keeps its own dependency setup (or your existing `node_modules` symlink).

## 1. Base Termux packages

```sh
pkg update && pkg upgrade -y
pkg install -y git nodejs python proot-distro ffmpeg termux-api
termux-setup-storage
cd ~/zes-studio
node --version          # Node 18+ works; Node 22 recommended
python --version        # Python 3.10+ required by qwen-reverse
```

`termux-setup-storage` lets finished MP4s also be copied to `/storage/emulated/0/Movies` (gallery-visible). Set `NO_MOVIE_EXPORT=1` to disable that copy, or `MOVIES_DIR=/path` to override it.

## 2. Install `qwen-reverse`

```sh
python -m pip install --upgrade pip
python -m pip install -U qwen-reverse
python -c "from qwen_reverse import Video, DEFAULT_MODEL; print('qwen-reverse OK', DEFAULT_MODEL)"
```

### Qwen authentication (no secrets in Git)

`qwen_video.py` reads credentials in this order:

1. `QWEN_TOKEN`, `QWEN_PROXY`, `QWEN_MODEL`, `QWEN_COOKIES` from `process.env`;
2. the same keys (or lowercase aliases) from a **gitignored** `config.json` at the repo root;
3. qwen-reverse's cached OAuth credentials via `SharedTokenManager` (`~/.qwen/oauth_creds.json`).

Video `t2v` generation is disabled for anonymous chat.qwen.ai access, so provide either a token or cached OAuth credentials. Example `config.json` (never commit it):

```json
{
  "QWEN_TOKEN": "paste-your-token-here",
  "QWEN_PROXY": "",
  "QWEN_MODEL": "qwen3.8-max",
  "QWEN_COOKIES": ""
}
```

Or export the token for one shell session:

```sh
export QWEN_TOKEN="paste-your-token-here"
export QWEN_PROXY=""          # optional
export QWEN_MODEL=""          # optional; defaults to qwen_reverse.DEFAULT_MODEL
```

To create qwen-reverse's OAuth cache with the library's device-login helpers, run:

```sh
python - <<'PY'
import asyncio
from qwen_reverse import start_device_login, complete_device_login

async def main():
    client, data = await start_device_login()
    print("Open the verification URL printed below and enter the user code.")
    print(data)
    token = await complete_device_login(client, data)
    print("Saved OAuth credentials to ~/.qwen/oauth_creds.json; token length:", len(token))

asyncio.run(main())
PY
```

`qwen_video.py` also honors `QWEN_BROWSER=1` (qwen-reverse browser transport) and `QWEN_ALLOW_ANONYMOUS=1` (try a guest request anyway). On headless Termux, a token or cached OAuth credential is the reliable path.

## 3. Install Blender inside `proot-distro` Debian

Blender's glibc build runs inside Debian proot; the Node server stays in Termux and invokes it through `BLENDER_BIN`.

```sh
proot-distro install debian
proot-distro login debian -- bash -lc "apt update && apt install -y blender ffmpeg"
proot-distro login debian -- blender --version
```

Set the wrapper so `server.mjs` can spawn it with `child_process.spawn` (no shell):

```sh
export BLENDER_BIN="proot-distro login debian -- blender"
# Optional: make it persistent
echo 'export BLENDER_BIN="proot-distro login debian -- blender"' >> ~/.bashrc
```

The server tokenizes `BLENDER_BIN`, so both of these work:

```sh
export BLENDER_BIN="blender"
export BLENDER_BIN="proot-distro login debian -- blender"
# or a literal absolute binary path:
# export BLENDER_BIN="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/debian/usr/bin/blender"
```

If your Python command is not `python`, set `PYTHON_BIN=python3` before starting the server. The Previs worker defaults to **Cycles CPU / 16 samples**, so it does not need X11 or EGL inside proot.

## 4. Start the server

From the repo root (all paths resolve relative to `process.cwd()` when it contains `public/`):

```sh
cd ~/zes-studio
node server.mjs
# default: http://localhost:8090  (kept for ~/zes-os/up.sh compatibility)
```

To use the port from `BUILD-PROMPT.md`:

```sh
PORT=3000 node server.mjs
# http://localhost:3000
```

Equivalent start script (still zero dependencies):

```sh
npm start
```

No `npm install` is needed for `server.mjs`. Leave the existing `video/` Remotion project and its dependency/symlink setup unchanged; `/api/render` still triggers it inside proot by default (`RENDER_INSIDE_PROOT=0` runs natively).

## 5. How to test on phone

1. Start the server in Termux:
   ```sh
   cd ~/zes-studio
   PORT=3000 node server.mjs
   ```
2. Open the dashboard in the phone browser:
   ```sh
   termux-open-url http://localhost:3000
   ```
   Or open `http://localhost:3000` manually. If you used the default port, open `http://localhost:8090`.
3. Verify the hamburger drawer:
   - tap the 44×44px **Menu** button: the drawer slides in from the left;
   - tap the dim backdrop, press **Escape** with a keyboard, or swipe left on the drawer to close it;
   - confirm the page behind cannot scroll while the drawer is open;
   - confirm focus stays inside the drawer when tabbing.
4. Verify the pipeline:
   - **Dashboard → New Generation** opens the bottom sheet; choose `9:16`, `16:9` or `1:1`, enter a prompt, tap **Generate**; the job appears with a 2-second active-only poll.
   - **Previs → Build Previs** spawns `$BLENDER_BIN -b --python-exit-code 1 -P previs_build.py -- tmp/shot_<id>.json renders/previs_<timestamp>.mp4`; check **Logs** for Blender output.
   - **Render** picks an asset and calls the preserved `POST /api/render`; **Assets** streams and deletes local files.
   - **Settings → Test Blender** runs `BLENDER_BIN --version` and shows the command, exit code and output.
5. Confirm at 360px width there is no horizontal scroll and no browser console errors.

## 6. Quick API smoke test

```sh
curl -s http://localhost:3000/api/status
curl -s http://localhost:3000/api/settings
curl -s http://localhost:3000/api/jobs
curl -s http://localhost:3000/api/assets
curl -s -X POST http://localhost:3000/api/blender-test

curl -s -X POST http://localhost:3000/api/previs \
  -H 'Content-Type: application/json' \
  -d '{"shot_spec":{"name":"smoke","frame_end":12,"camera":{"location":[0,-9,3.2],"look_at":[0,0,1],"lens":35}}}'

curl -s "http://localhost:3000/api/image?prompt=frosted%20blue%20glass&width=512&height=512" -o /sdcard/Download/zes-image.jpg
```

Generated files land in `renders/`; temporary shot specs and poster frames land in `tmp/`. Both directories are gitkept and their contents are ignored.

## 7. Agent operators

Load `skills/zes-studio-agent/SKILL.md` for the full agent runbook. It includes a
zero-dependency API CLI:

```sh
cd ~/zes-studio
export ZES_BASE=http://localhost:3000
node skills/zes-studio-agent/scripts/zes_api.mjs status
node skills/zes-studio-agent/scripts/zes_api.mjs settings
node skills/zes-studio-agent/scripts/zes_api.mjs blender-test
node skills/zes-studio-agent/scripts/zes_api.mjs jobs
node skills/zes-studio-agent/scripts/zes_api.mjs qwen "frosted blue studio dolly" 9:16 --watch
```

The skill documents safe polling, log inspection, cancellation, asset deletion,
secret handling, and troubleshooting. Do not add npm dependencies to use it.
