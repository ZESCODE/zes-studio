#!/usr/bin/env node
// zes-studio server — Image + Video Studio (zero external deps)
//   GET  /api/status              health
//   GET  /api/image               proxy -> image.pollinations.ai (avoids browser Origin 403)
//   POST /api/render              start a Remotion render job (FactsVideo props or a
//                                 kinetic-typography payload — see below)
//   GET  /api/render/:id          poll job status / progress
//   GET  /api/renders             list finished renders
//   GET  /renders/:file           serve rendered mp4
// Finished renders are auto-copied to Android's Movies dir (gallery-visible).
// Set NO_MOVIE_EXPORT=1 to disable, or MOVIES_DIR to override the target.
//   *                             static files from ./public (SPA fallback)
//
// Kinetic payloads (KineticVideo composition) look like:
//   {videoTitle, fps?, durationInFrames, scenes: [{id, startFrame, durationInFrames,
//    backgroundImage, camera?, textLayers[{text, position?, style?, animation}],
//    transitionOut?}]}
// Remote http(s) backgroundImage URLs are downloaded into video/public/kinetic/
// before rendering; other values are treated as staticFile() paths.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8090);
const PUBLIC_DIR = path.join(__dirname, "public");
const VIDEO_DIR = path.join(__dirname, "video");
const RENDERS_DIR = path.join(__dirname, "renders");
const PROPS_DIR = path.join(VIDEO_DIR, ".props");
const MOVIES_DIR = process.env.MOVIES_DIR || "/storage/emulated/0/Movies";
const MOVIE_EXPORT = process.env.NO_MOVIE_EXPORT !== "1";
const VERSION = "1.0.0";

fs.mkdirSync(RENDERS_DIR, { recursive: true });
fs.mkdirSync(PROPS_DIR, { recursive: true });
try { fs.mkdirSync(MOVIES_DIR, { recursive: true }); } catch {}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/* ------------------------------- helpers ------------------------------- */

function sendJson(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function serveFile(res, file, { download = false } = {}) {
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const headers = {
    "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-cache",
    "Content-Length": stat.size,
  };
  if (download) headers["Content-Disposition"] = `attachment; filename="${path.basename(file)}"`;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
  return true;
}


function serveVideo(req, res, file, { download = false } = {}) {
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const total = stat.size;
  const headers = {
    "Content-Type": "video/mp4",
    "Cache-Control": "no-cache",
    "Accept-Ranges": "bytes",
  };
  if (download) headers["Content-Disposition"] = `attachment; filename="${path.basename(file)}"`;

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] !== "" || m[2] !== "")) {
      let start, end;
      if (m[1] === "") { end = total - 1; start = Math.max(0, total - Number(m[2])); }
      else { start = Number(m[1]); end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1); }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        res.writeHead(416, { "Content-Range": `bytes */${total}` });
        res.end();
        return true;
      }
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
      return true;
    }
  }

  res.writeHead(200, { ...headers, "Content-Length": total });
  fs.createReadStream(file).pipe(res);
  return true;
}

function serveStatic(res, urlPath) {
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) file = path.join(PUBLIC_DIR, "index.html");
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(PUBLIC_DIR, "index.html");
  }
  if (!serveFile(res, file)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
}

/* --------------------------- image proxy ------------------------------ */

async function handleImage(url, res) {
  const prompt = url.searchParams.get("prompt") || "";
  const model = url.searchParams.get("model") || "flux";
  const width = url.searchParams.get("width") || "1024";
  const height = url.searchParams.get("height") || "1024";
  if (!prompt.trim()) return sendJson(res, 400, { error: "bad_request", detail: "prompt required" });

  const target = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
    + `?model=${encodeURIComponent(model)}&width=${encodeURIComponent(width)}`
    + `&height=${encodeURIComponent(height)}&nologo=true&enhance=false`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120000);
    const r = await fetch(target, { signal: ctrl.signal, headers: { Accept: "image/*" } });
    clearTimeout(t);
    if (!r.ok) return sendJson(res, r.status === 429 ? 429 : 502, { error: "upstream_error", status: r.status });
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": r.headers.get("content-type") || "image/png",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(buf);
  } catch (e) {
    sendJson(res, 502, { error: "upstream_unreachable", detail: String(e.message || e).slice(0, 200) });
  }
}

/* --------------------------- render jobs ------------------------------ */

/** id -> { id, status, progress, message, file?, error?, createdAt, updatedAt } */
const jobs = new Map();

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    file: job.file ? `/renders/${job.file}` : null,
    movieFile: job.movieFile || null,
    error: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/** Copy a finished render into Android's Movies dir so it shows in the gallery. */
function exportToMovies(srcFile) {
  try {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
    const dest = path.join(MOVIES_DIR, path.basename(srcFile));
    fs.copyFileSync(srcFile, dest);
    return dest;
  } catch (e) {
    console.warn(`[export] ${path.basename(srcFile)} -> ${MOVIES_DIR} failed: ${e.message}`);
    return null;
  }
}

function sanitizeProps(input) {
  const facts = Array.isArray(input.facts) ? input.facts : [];
  if (facts.length !== 5) throw new Error("exactly 5 facts are required");
  const cleanFact = (f) => ({
    emoji: String(f?.emoji ?? "\u2728").slice(0, 16),
    headline: String(f?.headline ?? "").slice(0, 200),
    detail: String(f?.detail ?? "").slice(0, 400),
    stat: String(f?.stat ?? "").slice(0, 40),
    statLabel: String(f?.statLabel ?? "").slice(0, 60),
  });
  return {
    kicker: String(input.kicker ?? "AMAZING FACTS").slice(0, 60),
    topic: String(input.topic ?? "THE TOPIC").slice(0, 80),
    accent: String(input.accent ?? "#4DD8FF").slice(0, 20),
    accent2: String(input.accent2 ?? "#FFC94D").slice(0, 20),
    handle: String(input.handle ?? "@yourchannel").slice(0, 60),
    audioSrc: String(input.audioSrc ?? "").slice(0, 2000),
    imageSrc: String(input.imageSrc ?? "").slice(0, 4000),
    facts: facts.map(cleanFact),
  };
}

/** True when a body looks like a KineticVideo (kinetic typography) payload. */
function isKineticPayload(body) {
  return Array.isArray(body?.scenes) && body.scenes.some((s) => Array.isArray(s?.textLayers));
}

const str = (v, max, fb = "") => (v === undefined || v === null ? fb : String(v).slice(0, max));
const num = (v, min, max, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fb;
};

/** Bound a kinetic payload; the authoritative validation is the Remotion zod schema. */
function sanitizeKinetic(input) {
  if (!Array.isArray(input.scenes) || input.scenes.length < 1) throw new Error("scenes[] required");
  if (input.scenes.length > 20) throw new Error("too many scenes (max 20)");
  const scenes = input.scenes.map((s, i) => {
    if (!Array.isArray(s?.textLayers)) throw new Error(`scenes[${i}].textLayers[] required`);
    if (s.textLayers.length > 20) throw new Error(`scenes[${i}] too many textLayers (max 20)`);
    const bg = str(s.backgroundImage, 2000).trim();
    if (!/^(https?:\/\/|[\w./-]+\.(jpg|jpeg|png|webp)$)/i.test(bg)) {
      throw new Error(`scenes[${i}].backgroundImage must be a URL or static .jpg/.png path`);
    }
    return {
      id: str(s.id, 40) || `scene-${i}`,
      startFrame: num(s.startFrame, 0, 100000, 0),
      durationInFrames: num(s.durationInFrames, 1, 100000, 90),
      backgroundImage: bg,
      audioSrc: /^[\w./-]+\.mp3$/.test(str(s.audioSrc, 120)) ? str(s.audioSrc, 120) : undefined,
      camera: {
        type: ["static", "kenBurns", "parallax", "punchIn"].includes(s.camera?.type)
          ? s.camera.type : "kenBurns",
        startScale: num(s.camera?.startScale, 0.2, 4, 1),
        endScale: num(s.camera?.endScale, 0.2, 4, 1.15),
        panDistance: num(s.camera?.panDistance, 0, 2000, 0),
        shake: Boolean(s.camera?.shake),
        motionBlur: num(s.camera?.motionBlur, 0, 720, 180),
      },
      textLayers: s.textLayers.map((l) => ({
        text: str(l?.text, 400),
        position: l?.position
          ? {
              top: str(l.position.top, 40, undefined) || undefined,
              left: str(l.position.left, 40, undefined) || undefined,
              transform: str(l.position.transform, 80, undefined) || undefined,
            }
          : undefined,
        style: {
          fontFamily: str(l?.style?.fontFamily, 60, "Anton"),
          fontSize: num(l?.style?.fontSize, 8, 400, 90),
          color: str(l?.style?.color, 40, "#FFFFFF"),
          textShadow: str(l?.style?.textShadow, 120, "0 8px 40px rgba(0,0,0,0.65)"),
          textureEffect: ["none", "goldLeaf", "distressed", "inkSplatter"].includes(l?.style?.textureEffect)
            ? l.style.textureEffect : "none",
        },
        animation: {
          type: ["springScale", "wordByWord", "typewriter", "maskReveal", "bounceIn", "springPop", "staggeredSlide"]
            .includes(l?.animation?.type) ? l.animation.type : "springScale",
          startFrame: num(l?.animation?.startFrame, 0, 100000, 0),
          durationInFrames: num(l?.animation?.durationInFrames, 1, 100000, 30),
          springConfig: l?.animation?.springConfig
            ? {
                damping: num(l.animation.springConfig.damping, 1, 100, 12),
                stiffness: num(l.animation.springConfig.stiffness, 1, 1000, 120),
                mass: num(l.animation.springConfig.mass, 0.1, 10, 1),
              }
            : undefined,
          easing: str(l?.animation?.easing, 60, undefined) || undefined,
        },
      })),
      transitionOut: s?.transitionOut
        ? {
            type: ["none", "fade", "inkWipe", "canvasTear"].includes(s.transitionOut.type)
              ? s.transitionOut.type : "none",
            durationInFrames: num(s.transitionOut.durationInFrames, 0, 120, 10),
          }
        : undefined,
    };
  });
  return {
    videoTitle: str(input.videoTitle, 200, "UNTITLED"),
    fps: num(input.fps, 15, 60, 30),
    durationInFrames: num(input.durationInFrames, 1, 100000, scenes.reduce((m, s) => Math.max(m, s.startFrame + s.durationInFrames), 0)),
    music: /^[\w./-]+\.mp3$/.test(str(input.music, 120)) ? str(input.music, 120) : undefined,
    musicVolume: num(input.musicVolume, 0, 1, 0.12),
    scenes,
  };
}

/**
 * Download remote scene backgrounds into video/public/kinetic/ and rewrite the
 * scene entries to staticFile paths (Remotion only bundles local assets).
 */
async function downloadBackgroundImages(scenes) {
  const dir = path.join(VIDEO_DIR, "public", "kinetic");
  fs.mkdirSync(dir, {recursive: true});
  for (let i = 0; i < scenes.length; i++) {
    const url = scenes[i].backgroundImage;
    if (!/^https?:\/\//i.test(url)) continue;
    const ext = (m) => ({
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
    }[m] || ".jpg");
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120000);
      const r = await fetch(url, {signal: ctrl.signal, headers: {Accept: "image/*"}});
      clearTimeout(t);
      if (!r.ok) throw new Error(`upstream HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 12_000_000) throw new Error("image too large (12MB)");
      const name = `bg-${scenes[i].id.replace(/[^\w-]/g, "") || i}-${i}${ext(r.headers.get("content-type") || "")}`;
      fs.writeFileSync(path.join(dir, name), buf);
      scenes[i].backgroundImage = `kinetic/${name}`;
      console.log(`[kinetic] scene ${i} background -> ${name} (${buf.length} bytes)`);
    } catch (e) {
      throw new Error(`background download failed for scene ${i} (${url.slice(0, 80)}): ${String(e.message || e).slice(0, 120)}`);
    }
  }
  return scenes;
}

function startRender(props, opts = {}) {
  const id = randomUUID().slice(0, 8);
  const outFile = `${id}.mp4`;
  const outPath = path.join(RENDERS_DIR, outFile);
  const propsFile = path.join(PROPS_DIR, `${id}.json`);
  fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));

  const job = {
    id, status: "running", progress: 0, message: "starting renderer",
    file: null, error: null, createdAt: Date.now(), updatedAt: Date.now(),
  };
  job.child = null;
  jobs.set(id, job);

  // Remotion's Rust compositor ships only for glibc/Linux-arm64 on this
  // device, so renders execute inside the Debian proot (node + compositor +
  // chromium all glibc). Set RENDER_INSIDE_PROOT=0 to run natively instead.
  const relOut = path.relative(VIDEO_DIR, outPath);
  const relProps = path.relative(VIDEO_DIR, propsFile);
  const composition = opts.composition || "FactsVideo";
  const concurrency = Number(opts.concurrency || process.env.RENDER_CONCURRENCY || 4);
  const frames = typeof opts.frames === "string" && /^\d+(-\d+)?$/.test(opts.frames) ? opts.frames : null;
  const renderArgs = [
    `CI=1 node node_modules/@remotion/cli/remotion-cli.js render src/index.ts ${composition} ${JSON.stringify(relOut)}`,
    `--props=${JSON.stringify(relProps)}`,
    `--concurrency=${concurrency}`,
    frames ? `--frames=${frames}` : "",
    "--log=info",
  ].filter(Boolean).join(" ");
  const inner = `cd ${JSON.stringify(VIDEO_DIR)} && ${renderArgs}`;

  const useProot = process.env.RENDER_INSIDE_PROOT !== "0";
  const cmd = useProot ? "proot-distro" : "bash";
  const args = useProot
    ? ["login", "debian", "--", "bash", "-lc", inner]
    : ["-lc", inner];

  console.log(`[render ${id}] ${cmd} ${args.join(" ")}`);

  let child;
  try {
    child = spawn(cmd, args, {
      cwd: VIDEO_DIR,
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    job.status = "error"; job.error = String(e.message || e); job.updatedAt = Date.now();
    return job;
  }

  job.child = child;

  const onLine = (line) => {
    if (!line.trim()) return;
    job.message = line.trim().slice(0, 240);
    // Remotion prints "Rendering frames... 42%" / "Rendered 12/50"
    const pct = line.match(/(\d{1,3})%/);
    if (pct) job.progress = Math.min(99, Number(pct[1]));
    const frac = line.match(/(?:Rendered|Encoded)\s+(\d+)\/(\d+)/i);
    if (frac && Number(frac[2]) > 0) job.progress = Math.min(99, Math.round((Number(frac[1]) / Number(frac[2])) * 100));
    if (/Bundling/i.test(line) && !pct && !frac) job.progress = Math.max(job.progress, 5);
    job.updatedAt = Date.now();
  };

  let bufOut = "";
  let bufErr = "";
  child.stdout.on("data", (d) => {
    bufOut += d.toString();
    const lines = bufOut.split(/\r\n|\r|\n/);
    bufOut = lines.pop() || "";
    lines.forEach(onLine);
  });
  child.stderr.on("data", (d) => {
    bufErr += d.toString();
    const lines = bufErr.split(/\r\n|\r|\n/);
    bufErr = lines.pop() || "";
    lines.forEach(onLine);
  });

  child.on("error", (e) => {
    job.status = "error"; job.error = String(e.message || e); job.updatedAt = Date.now();
  });
  child.on("close", (code) => {
    job.updatedAt = Date.now();
    if (code === 0 && fs.existsSync(outPath)) {
      job.status = "done";
      job.progress = 100;
      job.file = outFile;
      job.message = "render complete";
      let dest = null;
      if (MOVIE_EXPORT) dest = exportToMovies(outPath);
      if (dest) {
        job.movieFile = path.basename(dest);
        job.message = `render complete + exported to ${MOVIES_DIR}`;
        console.log(`[render ${id}] exported to ${dest}`);
      }
    } else {
      job.status = "error";
      job.error = `renderer exited with code ${code}`;
      if (bufErr.trim()) job.message = bufErr.trim().split("\n").slice(-3).join(" ").slice(0, 240);
    }
  });

  return job;
}

function listRenders() {
  try {
    return fs.readdirSync(RENDERS_DIR)
      .filter((f) => f.endsWith(".mp4"))
      .map((f) => {
        const st = fs.statSync(path.join(RENDERS_DIR, f));
        return { file: f, url: `/renders/${f}`, bytes: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  } catch { return []; }
}

/* ------------------------------ router -------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    return res.end();
  }

  try {
    if (p === "/api/status") {
      return sendJson(res, 200, { ok: true, service: "zes-studio", version: VERSION, port: PORT, ts: new Date().toISOString() });
    }

    if (p === "/api/image" && req.method === "GET") return await handleImage(url, res);

    if (p === "/api/render" && req.method === "POST") {
      const body = await readBody(req);
      if (isKineticPayload(body)) {
        let props;
        try { props = sanitizeKinetic(body); }
        catch (e) { return sendJson(res, 400, { error: "bad_request", detail: String(e.message || e) }); }
        try { await downloadBackgroundImages(props.scenes); }
        catch (e) { return sendJson(res, 400, { error: "background_failed", detail: String(e.message || e) }); }
        const job = startRender(props, {
          composition: "KineticVideo",
          frames: body.frames,
          concurrency: body.concurrency,
        });
        return sendJson(res, 202, publicJob(job));
      }
      let props;
      try { props = sanitizeProps(body); }
      catch (e) { return sendJson(res, 400, { error: "bad_request", detail: String(e.message || e) }); }
      const job = startRender(props, { frames: body.frames, concurrency: body.concurrency });
      return sendJson(res, 202, publicJob(job));
    }

    if (p.startsWith("/api/render/") && req.method === "DELETE") {
      const id = p.slice("/api/render/".length);
      const job = jobs.get(id);
      if (!job) return sendJson(res, 404, { error: "not_found" });
      try { if (job.child) job.child.kill("SIGTERM"); } catch {}
      job.status = "canceled"; job.error = "canceled by user"; job.updatedAt = Date.now();
      return sendJson(res, 200, publicJob(job));
    }

    if (p.startsWith("/api/render/") && req.method === "GET") {
      const id = p.slice("/api/render/".length);
      const job = jobs.get(id);
      if (!job) return sendJson(res, 404, { error: "not_found" });
      return sendJson(res, 200, publicJob(job));
    }

    if (p === "/api/renders" && req.method === "GET") {
      return sendJson(res, 200, { renders: listRenders() });
    }

    if (p.startsWith("/renders/")) {
      const name = path.basename(p.slice("/renders/".length));
      const file = path.join(RENDERS_DIR, name);
      if (name.endsWith(".mp4") && serveVideo(req, res, file, { download: url.searchParams.has("download") })) return;
      return sendJson(res, 404, { error: "not_found" });
    }

    return serveStatic(res, p === "/" ? "/index.html" : p);
  } catch (e) {
    return sendJson(res, 500, { error: "server_error", detail: String(e.message || e).slice(0, 300) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[zes-studio] listening on http://0.0.0.0:${PORT}`);
  console.log(`[zes-studio] public=${PUBLIC_DIR}`);
  console.log(`[zes-studio] renders=${RENDERS_DIR}`);
  console.log(`[zes-studio] exports -> ${MOVIE_EXPORT ? MOVIES_DIR : "disabled"}`);
  console.log(`[zes-studio] video project=${VIDEO_DIR}`);
});
