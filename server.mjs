#!/usr/bin/env node
// zes-studio server — Control Panel + Pipeline Orchestrator (zero external deps)
//   GET    /api/status              health
//   GET    /api/image               proxy -> image.pollinations.ai (avoids browser Origin 403)
//   GET    /image                   standalone Image Studio (public/image-studio.html)
//   GET    /connect                 Qwen bookmarklet callback (public/connect.html)
//   POST   /api/qwen-video          spawn python qwen_video.py -> { jobId }
//   POST   /api/previs              write tmp/shot_<id>.json, spawn blender -b -P previs_build.py -> { jobId }
//   POST   /api/render              start a Remotion render job (FactsVideo props, KineticVideo, or { asset })
//   GET    /api/render/:id          poll legacy render job status / progress
//   DELETE /api/render/:id          cancel legacy render job
//   GET    /api/renders             list finished renders (legacy shape)
//   GET    /api/jobs                list all pipeline jobs (newest first)
//   GET    /api/jobs/:id            get single job incl. log tail
//   DELETE /api/jobs/:id            cancel a queued or running job
//   GET    /api/assets              list files in renders/ with size + mtime
//   DELETE /api/assets/:name        delete an asset in renders/ (path-sanitized)
//   GET    /api/settings            read-only env + directory configuration
//   GET    /api/account             Qwen account status (no secrets)
//   POST   /api/account             validate + save cookie/token to config.json
//   POST   /api/account/check       re-validate saved Qwen credentials
//   DELETE /api/account             remove saved Qwen credentials
//   POST   /api/blender-test        run `${BLENDER_BIN} --version` asynchronously
//   GET    /renders/:file           stream rendered media (HTTP Range supported)
//   *                               static files from ./public (SPA fallback)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = fs.existsSync(path.resolve(process.cwd(), "public"))
  ? process.cwd()
  : __dirname;

const PORT = Number(process.env.PORT || 8090);
const PUBLIC_DIR = path.resolve(ROOT_DIR, "public");
const VIDEO_DIR = path.resolve(ROOT_DIR, "video");
const RENDERS_DIR = path.resolve(ROOT_DIR, "renders");
const TMP_DIR = path.resolve(ROOT_DIR, "tmp");
const PROPS_DIR = path.resolve(VIDEO_DIR, ".props");
const CONFIG_FILE = path.resolve(ROOT_DIR, "config.json");
const QWEN_SCRIPT = path.resolve(ROOT_DIR, "qwen_video.py");
const PREVIS_SCRIPT = path.resolve(ROOT_DIR, "previs_build.py");
const NARRATION_SCRIPT = path.resolve(ROOT_DIR, "narration.py");
const KOKORO_DIR = path.resolve(process.env.KOKORO_DIR || path.join(path.dirname(ROOT_DIR), "kokoro-tts"));
const MUSIC_FILE = process.env.MUSIC_FILE || path.resolve(VIDEO_DIR, "public", "audio", "music.mp3");
const RENDER_SECONDS = 45;

const MOVIES_DIR = process.env.MOVIES_DIR || "/storage/emulated/0/Movies";
const MOVIE_EXPORT = process.env.NO_MOVIE_EXPORT !== "1";
const PYTHON_BIN = (process.env.PYTHON_BIN || "python").trim();
const MAX_CONCURRENT_JOBS = Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS || 2));
const MAX_LOG_LINES = 500;
const VERSION = "2.0.0";

fs.mkdirSync(RENDERS_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });
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
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/* ------------------------------- helpers ------------------------------- */

function sendJson(res, code, data) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
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

/**
 * Spawn a non-blocking child with all stdio pipes, then close stdin so no
 * worker can wait for input. stdout/stderr are always captured by the caller.
 */
function spawnPiped(bin, args, options = {}) {
  const child = spawn(bin, args, { ...options, stdio: "pipe" });
  if (child.stdin) {
    child.stdin.on("error", () => {});
    child.stdin.end();
  }
  return child;
}

function loadLocalConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeQwenToken(raw) {
  return String(raw || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function parseCookiePairs(raw) {
  const pairs = {};
  for (const part of String(raw || "").split(";")) {
    if (!part.includes("=")) continue;
    const idx = part.indexOf("=");
    const key = part.slice(0, idx).trim();
    if (key) pairs[key] = part.slice(idx + 1).trim();
  }
  return pairs;
}

function normalizeCookieHeader(raw) {
  return String(raw || "")
    .replace(/\s*\r?\n\s*/g, "")
    .trim();
}

function mergeCookieHeader(cookie, patch) {
  const map = parseCookiePairs(cookie);
  for (const [key, value] of Object.entries(patch || {})) {
    if (value) map[key] = value;
  }
  return Object.entries(map).map(([key, value]) => `${key}=${value}`).join("; ");
}

function tokenExpiresSoon(token, withinMs = 10 * 60 * 1000) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return false;
    const payload = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    if (!payload?.exp) return false;
    return payload.exp * 1000 - Date.now() < withinMs;
  } catch {
    return false;
  }
}

async function refreshQwenAccessToken(cookies) {
  const cookie = normalizeCookieHeader(cookies);
  const cookieMap = parseCookiePairs(cookie);
  if (!cookieMap.refresh_token) {
    return { ok: false, detail: "Cookie contains no refresh_token." };
  }
  const headers = {
    accept: "application/json",
    "accept-language": "en-US,en;q=0.9",
    version: "0.3.45",
    source: "web",
    "x-request-id": (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    timezone: new Date().toString().replace(/\s*\(.+\)$/, ""),
    "x-request-origin": "https://chat.qwen.ai",
    origin: "https://chat.qwen.ai",
    referer: "https://chat.qwen.ai/",
    "user-agent": "Mozilla/5.0 (Linux; Android 13) ZES-Studio/2.0",
    cookie,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch("https://auth.qwen.ai/api/v2/auths/refresh", { headers, signal: ctrl.signal });
    const text = await r.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    if (r.status === 401 || r.status === 403) {
      return { ok: false, status: r.status, detail: "Refresh token rejected (signed out or expired)." };
    }
    if (!r.ok) {
      return { ok: false, status: r.status, detail: `auth.qwen.ai refresh returned HTTP ${r.status}.` };
    }
    const payload = body?.data?.data && typeof body.data.data === "object" ? body.data.data : body?.data;
    const token = normalizeQwenToken(payload?.access_token || payload?.token);
    if (!token) {
      const reason = body?.data?.details || body?.details || "refresh response contained no access_token";
      return { ok: false, status: r.status, detail: `Token refresh failed: ${reason}.` };
    }
    const nextCookies = mergeCookieHeader(cookie, { refresh_token: payload?.refresh_token || "" });
    return { ok: true, status: r.status, token, cookies: nextCookies, expiresAt: payload?.expires_at || null };
  } catch (e) {
    const aborted = e && (e.name === "AbortError" || e.name === "TimeoutError");
    return { ok: false, detail: aborted ? "Token refresh timed out after 20s." : `Refresh network error: ${String(e.message || e).slice(0, 160)}` };
  } finally {
    clearTimeout(timer);
  }
}

function readQwenCreds() {
  const cfg = loadLocalConfig();
  const envToken = String(process.env.QWEN_TOKEN || "").trim();
  const envCookies = String(process.env.QWEN_COOKIES || "").trim();
  const cfgToken = String(cfg.QWEN_TOKEN || cfg.qwen_token || cfg.token || "").trim();
  const cfgCookies = String(cfg.QWEN_COOKIES || cfg.qwen_cookies || cfg.cookies || "").trim();
  const cookies = normalizeCookieHeader(envCookies || cfgCookies);
  const cookieMap = parseCookiePairs(cookies);
  const token = normalizeQwenToken(envToken || cfgToken || cookieMap.token);
  const source = (envToken || envCookies) ? "env" : (cfgToken || cfgCookies) ? "config" : "none";
  return {
    token,
    cookies,
    source,
    configured: Boolean(token || cookies),
    tokenPresent: Boolean(token),
    hasCookies: Boolean(cookies),
    cookieFields: Object.keys(cookieMap),
    account: cfg.QWEN_ACCOUNT || null,
    lastChecked: cfg.QWEN_LAST_CHECKED || null,
    model: String(cfg.QWEN_MODEL || cfg.qwen_model || "qwen3.8-max"),
  };
}

function publicAccountStatus() {
  const c = readQwenCreds();
  return {
    configured: c.configured,
    connected: c.configured,
    source: c.source,
    tokenPresent: c.tokenPresent,
    hasCookies: c.hasCookies,
    cookieFields: c.cookieFields,
    account: c.account,
    lastChecked: c.lastChecked,
    model: c.model,
    envOverride: c.source === "env",
  };
}

function writeLocalConfig(mutate) {
  const data = loadLocalConfig();
  mutate(data);
  const tmp = `${CONFIG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, CONFIG_FILE);
  try { fs.chmodSync(CONFIG_FILE, 0o600); } catch { /* best effort */ }
  return data;
}

async function validateQwenCreds(token, cookies) {
  const cookieMap = parseCookiePairs(cookies);
  const bearer = normalizeQwenToken(token || cookieMap.token);
  if (!bearer && !cookies) {
    return { ok: false, detail: "No cookie or token provided." };
  }
  const headers = {
    "user-agent": "Mozilla/5.0 (Linux; Android 13) ZES-Studio/2.0",
    accept: "application/json",
    source: "web",
    origin: "https://chat.qwen.ai",
    referer: "https://chat.qwen.ai/",
  };
  if (cookies) headers.cookie = cookies;
  if (bearer) headers.authorization = `Bearer ${bearer}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch("https://chat.qwen.ai/api/v1/auths/", { headers, signal: ctrl.signal });
    const text = await r.text();
    if (r.status === 401 || r.status === 403) {
      return { ok: false, status: r.status, detail: "Token/cookie rejected (expired or logged out)." };
    }
    if (!r.ok) {
      return { ok: false, status: r.status, detail: `chat.qwen.ai returned HTTP ${r.status}.` };
    }
    if (text.trim().startsWith("<")) {
      return { ok: false, status: r.status, detail: "chat.qwen.ai returned an HTML login/WAF page." };
    }
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!data || typeof data !== "object") {
      return { ok: false, status: r.status, detail: "Unexpected response from chat.qwen.ai." };
    }
    const account = String(data.email || data.username || data.name || data.id || "").trim() || null;
    return { ok: true, status: r.status, account, detail: account ? `Signed in as ${account}.` : "Credentials accepted by chat.qwen.ai." };
  } catch (e) {
    const aborted = e && (e.name === "AbortError" || e.name === "TimeoutError");
    return { ok: false, detail: aborted ? "Validation timed out after 20s." : `Network error: ${String(e.message || e).slice(0, 160)}` };
  } finally {
    clearTimeout(timer);
  }
}

function hasQwenAuth() {
  return readQwenCreds().tokenPresent;
}

/**
 * Resolve BLENDER_BIN into { bin, args, display } safely without a shell.
 * Supports both direct binary paths ("/usr/bin/blender") and proot wrappers
 * such as "proot-distro login debian -- blender".
 */
function resolveBlenderCmd(extraArgs = []) {
  const cfg = loadLocalConfig();
  const configured = process.env.BLENDER_BIN ?? cfg.BLENDER_BIN ?? cfg.blender_bin;
  const raw = String(configured ?? "").trim() || "blender";
  if (fs.existsSync(raw)) {
    return { bin: raw, args: [...extraArgs], display: raw };
  }
  const parts = [];
  const tokenRe = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = tokenRe.exec(raw)) !== null) {
    parts.push(match[1] ?? match[2] ?? match[3]);
  }
  const [bin, ...prefixArgs] = parts.length ? parts : ["blender"];
  return { bin, args: [...prefixArgs, ...extraArgs], display: raw };
}

let lastStamp = 0;
function uniqueTimestamp() {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}

/** Strict single-filename sanitizer for renders/ assets (blocks '..', '/', dotfiles). */
function sanitizeAssetName(rawName) {
  let decoded;
  try { decoded = decodeURIComponent(String(rawName || "")); }
  catch { return null; }
  const trimmed = decoded.trim();
  if (!trimmed || trimmed.length > 200) return null;
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) {
    return null;
  }
  if (trimmed.startsWith(".")) return null;
  if (path.basename(trimmed) !== trimmed) return null;
  const resolved = path.resolve(RENDERS_DIR, trimmed);
  if (!resolved.startsWith(RENDERS_DIR + path.sep)) return null;
  return { name: trimmed, fullPath: resolved };
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
  const ext = path.extname(file).toLowerCase();
  const headers = {
    "Content-Type": MIME[ext] || "video/mp4",
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
      res.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": end - start + 1,
      });
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
  const prompt = (url.searchParams.get("prompt") || "").trim();
  const model = (url.searchParams.get("model") || "flux").trim() || "flux";
  const clampDim = (raw, fallback) => {
    const n = Number.parseInt(raw, 10);
    return String(Number.isFinite(n) ? Math.max(64, Math.min(2048, n)) : fallback);
  };
  const width = clampDim(url.searchParams.get("width"), 1024);
  const height = clampDim(url.searchParams.get("height"), 1024);
  if (!prompt) return sendJson(res, 400, { error: "bad_request", detail: "prompt required" });
  if (prompt.length > 1200) return sendJson(res, 400, { error: "bad_request", detail: "prompt too long (max 1200 chars)" });

  const seed = url.searchParams.get("seed");
  const target = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  target.searchParams.set("model", model);
  target.searchParams.set("width", width);
  target.searchParams.set("height", height);
  target.searchParams.set("nologo", url.searchParams.get("nologo") === "0" ? "false" : "true");
  target.searchParams.set("enhance", url.searchParams.get("enhance") === "1" ? "true" : "false");
  if (seed && /^\d{1,12}$/.test(seed)) target.searchParams.set("seed", seed);

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120000);
    const r = await fetch(target, { signal: ctrl.signal, headers: { Accept: "image/*" } });
    clearTimeout(t);
    if (!r.ok) {
      let detail = "";
      try { detail = (await r.text()).slice(0, 200); } catch { detail = ""; }
      return sendJson(res, r.status === 429 ? 429 : 502, {
        error: "upstream_error",
        status: r.status,
        detail: detail || "image upstream rejected the request",
      });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": r.headers.get("content-type") || "image/png",
      "Content-Length": buf.length,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(buf);
  } catch (e) {
    sendJson(res, 502, { error: "upstream_unreachable", detail: String(e.message || e).slice(0, 200) });
  }
}

/* ------------------------ unified job queue --------------------------- */

/**
 * Map<jobId, Job>
 * Job shape:
 * { id, type: 'qwen'|'previs'|'render', status: 'queued'|'running'|'done'|'error',
 *   progress: 0-100, log: [], output: null, createdAt, finishedAt,
 *   message, file, movieFile, error, updatedAt, meta, child, startFn }
 */
const jobs = new Map();
const pendingQueue = [];
let activeCount = 0;

function stripAnsi(s) {
  return String(s || "").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function appendJobLog(job, rawLine, stream = "stdout") {
  const clean = stripAnsi(rawLine).trim();
  if (!clean) return;

  // Parse structured worker progress lines ("PROGRESS 40")
  const progMatch = /^PROGRESS\s+(\d{1,3})\b/i.exec(clean);
  if (progMatch) {
    job.progress = Math.max(0, Math.min(100, Number(progMatch[1])));
    job.updatedAt = Date.now();
  }

  // Parse structured worker output path lines ("OUTPUT renders/qwen_123.mp4")
  const outMatch = /^OUTPUT\s+(.+)$/i.exec(clean);
  if (outMatch) {
    const reportedName = path.basename(outMatch[1].trim());
    if (reportedName) {
      job.file = reportedName;
      job.output = `/renders/${encodeURIComponent(reportedName)}`;
    }
  }

  const ts = new Date().toISOString().slice(11, 19);
  const tag = stream === "stderr" ? "ERR" : "OUT";
  const formatted = `[${ts} ${tag}] ${clean}`;
  job.log.push(formatted);
  if (job.log.length > MAX_LOG_LINES) {
    job.log.splice(0, job.log.length - MAX_LOG_LINES);
  }
  if (!progMatch) {
    job.message = clean.slice(0, 240);
  }
  job.updatedAt = Date.now();
}

function wireChildStreams(job, child, onCustomLine) {
  let outBuf = "";
  let errBuf = "";
  const errLines = [];

  child.stdout.on("data", (chunk) => {
    outBuf += chunk.toString("utf8");
    const lines = outBuf.split(/\r\n|\r|\n/);
    outBuf = lines.pop() || "";
    for (const line of lines) {
      appendJobLog(job, line, "stdout");
      if (onCustomLine) onCustomLine(line, "stdout");
    }
  });

  child.stderr.on("data", (chunk) => {
    errBuf += chunk.toString("utf8");
    const lines = errBuf.split(/\r\n|\r|\n/);
    errBuf = lines.pop() || "";
    for (const line of lines) {
      const clean = stripAnsi(line).trim();
      if (clean) errLines.push(clean);
      appendJobLog(job, line, "stderr");
      if (onCustomLine) onCustomLine(line, "stderr");
    }
  });

  const flushRemaining = () => {
    if (outBuf.trim()) {
      appendJobLog(job, outBuf, "stdout");
      if (onCustomLine) onCustomLine(outBuf, "stdout");
      outBuf = "";
    }
    if (errBuf.trim()) {
      const clean = stripAnsi(errBuf).trim();
      if (clean) errLines.push(clean);
      appendJobLog(job, errBuf, "stderr");
      if (onCustomLine) onCustomLine(errBuf, "stderr");
      errBuf = "";
    }
    return errLines;
  };

  return { flushRemaining, errLines };
}

function createJob(type, meta = {}) {
  const id = randomUUID().slice(0, 8);
  const now = Date.now();
  const job = {
    id,
    type,
    status: "queued",
    progress: 0,
    log: [],
    output: null,
    createdAt: now,
    finishedAt: null,
    message: "queued",
    file: null,
    movieFile: null,
    error: null,
    updatedAt: now,
    meta,
    child: null,
    canceled: false,
    startFn: null,
  };
  jobs.set(id, job);
  return job;
}

function enqueueJob(job, startFn) {
  job.startFn = startFn;
  appendJobLog(job, `Queued ${job.type} job #${job.id}`);
  pendingQueue.push(job);
  drainQueue();
  return job;
}

function drainQueue() {
  while (activeCount < MAX_CONCURRENT_JOBS && pendingQueue.length > 0) {
    const next = pendingQueue.shift();
    if (!next || next.canceled || next.status !== "queued") continue;
    activeCount += 1;
    next.status = "running";
    next.message = `starting ${next.type} worker`;
    next.updatedAt = Date.now();
    Promise.resolve()
      .then(() => next.startFn(next))
      .catch((err) => {
        finishJobError(next, String(err?.message || err));
      });
  }
}

function finishJobDone(job, outFile, extraMsg = "") {
  if (job.finishedAt !== null) return;
  job.status = "done";
  job.progress = 100;
  job.file = outFile;
  job.output = `/renders/${encodeURIComponent(outFile)}`;
  job.finishedAt = Date.now();
  job.updatedAt = job.finishedAt;
  job.child = null;
  job.message = extraMsg || `${job.type} complete -> ${outFile}`;
  appendJobLog(job, `Completed: ${job.output}`);
  activeCount = Math.max(0, activeCount - 1);
  drainQueue();
}

function finishJobError(job, errMsg) {
  if (job.finishedAt !== null) return;
  job.status = "error";
  job.error = String(errMsg || "worker failed").slice(0, 400);
  job.message = job.error;
  job.finishedAt = Date.now();
  job.updatedAt = job.finishedAt;
  job.child = null;
  appendJobLog(job, `Failed: ${job.error}`, "stderr");
  activeCount = Math.max(0, activeCount - 1);
  drainQueue();
}

function cancelJob(job, legacyStatus = null) {
  if (job.status === "done" || job.status === "error" || job.status === "canceled") {
    return job;
  }
  job.canceled = true;
  const wasRunning = job.status === "running";
  const qIdx = pendingQueue.indexOf(job);
  if (qIdx >= 0) pendingQueue.splice(qIdx, 1);

  if (job.child) {
    const proc = job.child;
    try { proc.kill("SIGTERM"); } catch {}
    setTimeout(() => {
      try { if (!proc.killed) proc.kill("SIGKILL"); } catch {}
    }, 2000).unref?.();
  }

  job.status = legacyStatus || "error";
  job.error = "canceled by user";
  job.message = "canceled by user";
  job.finishedAt = Date.now();
  job.updatedAt = job.finishedAt;
  job.child = null;
  appendJobLog(job, "Job canceled by user", "stderr");

  if (wasRunning) {
    activeCount = Math.max(0, activeCount - 1);
    drainQueue();
  }
  return job;
}

function serializeJob(job, { logLimit = 12 } = {}) {
  return {
    id: job.id,
    type: job.type,
    status: job.status === "canceled" ? "error" : job.status,
    progress: job.progress,
    log: job.log.slice(-logLimit),
    logCount: job.log.length,
    output: job.output || (job.file ? `/renders/${encodeURIComponent(job.file)}` : null),
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    message: job.message,
    error: job.error || null,
    movieFile: job.movieFile || null,
    meta: job.meta || {},
  };
}

/** Legacy shape preserved verbatim for /api/render and /api/render/:id */
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

/* --------------------- worker 1: qwen_video.py ------------------------ */

const VALID_ASPECTS = new Set(["9:16", "16:9", "1:1", "4:3", "3:4"]);

function startQwenVideoJob(prompt, aspectRatio) {
  const stamp = uniqueTimestamp();
  const outFile = `qwen_${stamp}.mp4`;
  const outPath = path.resolve(RENDERS_DIR, outFile);
  const job = createJob("qwen", { prompt: prompt.slice(0, 240), aspect_ratio: aspectRatio });

  return enqueueJob(job, async (j) => {
    const cfg = loadLocalConfig();
    const workerEnv = {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    };
    const envHasCreds = Boolean(process.env.QWEN_TOKEN || process.env.QWEN_COOKIES);
    let token = normalizeQwenToken(process.env.QWEN_TOKEN || cfg.QWEN_TOKEN || cfg.qwen_token || cfg.token);
    let cookies = normalizeCookieHeader(process.env.QWEN_COOKIES || cfg.QWEN_COOKIES || cfg.qwen_cookies || cfg.cookies);

    if (cookies && (!token || tokenExpiresSoon(token))) {
      const refreshed = await refreshQwenAccessToken(cookies);
      if (refreshed.ok) {
        token = refreshed.token;
        cookies = refreshed.cookies;
        appendJobLog(j, "Refreshed Qwen access token from saved cookie.");
        if (!envHasCreds) {
          writeLocalConfig((data) => {
            data.QWEN_COOKIES = cookies;
            data.qwen_cookies = cookies;
            data.QWEN_TOKEN = token;
            data.qwen_token = token;
            const refreshToken = parseCookiePairs(cookies).refresh_token;
            if (refreshToken) data.QWEN_REFRESH_TOKEN = refreshToken;
          });
        }
      } else {
        appendJobLog(j, `Qwen token refresh failed: ${refreshed.detail}`);
      }
    }

    if (token) workerEnv.QWEN_TOKEN = token;
    if (cookies) workerEnv.QWEN_COOKIES = cookies;
    if (!workerEnv.QWEN_PROXY && (cfg.QWEN_PROXY || cfg.qwen_proxy || cfg.proxy)) {
      workerEnv.QWEN_PROXY = String(cfg.QWEN_PROXY || cfg.qwen_proxy || cfg.proxy);
    }
    if (!workerEnv.QWEN_MODEL && (cfg.QWEN_MODEL || cfg.qwen_model)) {
      workerEnv.QWEN_MODEL = String(cfg.QWEN_MODEL || cfg.qwen_model);
    }

    const args = [
      QWEN_SCRIPT,
      "--prompt",
      prompt,
      "--aspect-ratio",
      aspectRatio,
      "--out",
      outPath,
    ];
    appendJobLog(j, `Spawning: ${PYTHON_BIN} qwen_video.py --aspect-ratio ${aspectRatio}`);

    let child;
    try {
      child = spawnPiped(PYTHON_BIN, args, {
        cwd: ROOT_DIR,
        env: workerEnv,
      });
    } catch (e) {
      finishJobError(j, `Failed to spawn ${PYTHON_BIN}: ${e.message || e}`);
      return;
    }

    j.child = child;
    const { flushRemaining } = wireChildStreams(j, child);

    child.on("error", (e) => {
      if (j.canceled) return;
      finishJobError(j, `Python worker error (${PYTHON_BIN}): ${e.message || e}`);
    });

    child.on("close", (code) => {
      if (j.canceled) return;
      const errLines = flushRemaining();
      const resolvedFile = j.file || outFile;
      const resolvedPath = path.resolve(RENDERS_DIR, resolvedFile);
      if (code === 0 && fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).size > 0) {
        let extra = "";
        if (MOVIE_EXPORT) {
          const dest = exportToMovies(resolvedPath);
          if (dest) {
            j.movieFile = path.basename(dest);
            extra = `qwen video saved + exported to ${MOVIES_DIR}`;
          }
        }
        finishJobDone(j, resolvedFile, extra);
      } else {
        const tail = errLines.slice(-3).join(" | ");
        finishJobError(j, tail || `qwen_video.py exited with code ${code}`);
      }
    });
  });
}

/* --------------------- worker 2: previs_build.py ---------------------- */

function startPrevisJob(shotSpec) {
  const stamp = uniqueTimestamp();
  const outFile = `previs_${stamp}.mp4`;
  const outPath = path.resolve(RENDERS_DIR, outFile);
  const job = createJob("previs", {
    shotName: String(shotSpec.name || shotSpec.shot || `shot_${stamp}`).slice(0, 80),
    frames: Number(shotSpec.frame_end || shotSpec.frames || 48),
  });

  const shotPath = path.resolve(TMP_DIR, `shot_${job.id}.json`);
  fs.writeFileSync(shotPath, JSON.stringify(shotSpec, null, 2), "utf8");

  return enqueueJob(job, (j) => {
    const blenderCmd = resolveBlenderCmd([
      "-b",
      "--python-exit-code",
      "1",
      "-P",
      PREVIS_SCRIPT,
      "--",
      shotPath,
      outPath,
    ]);
    appendJobLog(
      j,
      `Spawning: ${blenderCmd.display} -b --python-exit-code 1 -P previs_build.py -- tmp/shot_${j.id}.json renders/${outFile}`
    );

    let child;
    try {
      child = spawnPiped(blenderCmd.bin, blenderCmd.args, {
        cwd: ROOT_DIR,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });
    } catch (e) {
      finishJobError(j, `Failed to spawn Blender (${blenderCmd.display}): ${e.message || e}`);
      return;
    }

    j.child = child;
    const { flushRemaining } = wireChildStreams(j, child);

    child.on("error", (e) => {
      if (j.canceled) return;
      const hint = e.code === "ENOENT"
        ? `Blender binary not found ("${blenderCmd.bin}"). Install Blender in proot Debian and set BLENDER_BIN (see SETUP.md).`
        : String(e.message || e);
      finishJobError(j, hint);
    });

    child.on("close", (code) => {
      if (j.canceled) return;
      const errLines = flushRemaining();
      const resolvedFile = j.file || outFile;
      const resolvedPath = path.resolve(RENDERS_DIR, resolvedFile);
      if (code === 0 && fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).size > 0) {
        let extra = "";
        if (MOVIE_EXPORT) {
          const dest = exportToMovies(resolvedPath);
          if (dest) {
            j.movieFile = path.basename(dest);
            extra = `previs complete + exported to ${MOVIES_DIR}`;
          }
        }
        finishJobDone(j, resolvedFile, extra);
      } else {
        const tail = errLines.slice(-4).join(" | ");
        finishJobError(j, tail || `Blender exited with code ${code}`);
      }
    });
  });
}

/* --------------------- worker 3: Remotion render ---------------------- */

const DEFAULT_RENDER_FACTS = [
  { emoji: "🎬", headline: "Shot blocked in headless Blender", detail: "Camera lens, staging, and timing are validated in 640x360 3D previs first.", stat: "STAGE 1", statLabel: "BLENDER PREVIS" },
  { emoji: "⚡", headline: "AI motion synthesized with Qwen", detail: "Prompt-driven t2v generation downloads high-res clips directly into renders/.", stat: "STAGE 2", statLabel: "QWEN VIDEO" },
  { emoji: "📱", headline: "Orchestrated locally on Android", detail: "Zero external npm server dependencies keep memory tiny inside Termux.", stat: "0 DEPS", statLabel: "NODE ESM" },
  { emoji: "🧊", headline: "Composited with Remotion", detail: "Typography, transitions, and sound beds render cleanly inside Debian proot.", stat: "30 FPS", statLabel: "REMOTION" },
  { emoji: "🚀", headline: "Ready for vertical publishing", detail: "Finished MP4 files stream with HTTP Range and auto-export to Android Movies.", stat: "1080P", statLabel: "FINAL MASTER" },
];

function extractVideoPosterFrame(videoPath, outJpgPath) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (!settled) { settled = true; resolve(ok); }
    };
    let child;
    try {
      child = spawnPiped("ffmpeg", ["-y", "-ss", "0.1", "-i", videoPath, "-frames:v", "1", "-q:v", "3", outJpgPath], {
        cwd: ROOT_DIR,
      });
    } catch {
      return done(false);
    }
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
      done(false);
    }, 10000);
    child.on("error", () => { clearTimeout(timer); done(false); });
    child.on("close", (code) => {
      clearTimeout(timer);
      done(code === 0 && fs.existsSync(outJpgPath) && fs.statSync(outJpgPath).size > 0);
    });
  });
}

function sanitizeProps(input) {
  const hasAssetShortcut = typeof input.asset === "string" && input.asset.trim().length > 0;
  const rawFacts = Array.isArray(input.facts)
    ? input.facts
    : (hasAssetShortcut ? DEFAULT_RENDER_FACTS : []);
  if (rawFacts.length !== 5) throw new Error("exactly 5 facts are required");
  const cleanFact = (f) => ({
    emoji: String(f?.emoji ?? "\u2728").slice(0, 16),
    headline: String(f?.headline ?? "").slice(0, 200),
    detail: String(f?.detail ?? "").slice(0, 400),
    stat: String(f?.stat ?? "").slice(0, 40),
    statLabel: String(f?.statLabel ?? "").slice(0, 60),
  });
  const fallbackTopic = hasAssetShortcut
    ? path.basename(input.asset, path.extname(input.asset)).replace(/[_-]+/g, " ").toUpperCase()
    : "THE TOPIC";
  return {
    kicker: String(input.kicker ?? "ZES STUDIO").slice(0, 60),
    topic: String(input.topic || fallbackTopic).slice(0, 80),
    accent: String(input.accent ?? "#4DD8FF").slice(0, 20),
    accent2: String(input.accent2 ?? "#FFC94D").slice(0, 20),
    handle: String(input.handle ?? "@yourchannel").slice(0, 60),
    audioSrc: String(input.audioSrc ?? "").slice(0, 2000),
    imageSrc: String(input.imageSrc ?? "").slice(0, 500_000),
    facts: rawFacts.map(cleanFact),
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
  fs.mkdirSync(dir, { recursive: true });
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
      const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "image/*" } });
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

/**
 * Run a child process inside the active job, streaming its log into the queue.
 * Resolves on exit code 0, rejects with the last stderr lines otherwise.
 */
function runJobChild(job, bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnPiped(bin, args, { cwd: ROOT_DIR, env: { ...process.env }, ...options });
    } catch (e) {
      reject(e);
      return;
    }
    job.child = child;
    const { flushRemaining } = wireChildStreams(job, child);
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      const errs = flushRemaining();
      job.child = null;
      if (code === 0) resolve();
      else reject(new Error(errs.slice(-2).join(" ").slice(0, 240) || `exited with code ${code}`));
    });
  });
}

function prootInnerCommand(inner) {
  const useProot = process.env.RENDER_INSIDE_PROOT !== "0";
  return useProot
    ? { bin: "proot-distro", args: ["login", "debian", "--", "bash", "-lc", inner] }
    : { bin: "bash", args: ["-lc", inner] };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runQuiet(bin, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.on("data", (d) => { if (err.length < 4000) err += String(d); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(err.trim().split("\n").slice(-2).join(" ").slice(0, 240) || `exit ${code}`));
    });
  });
}

async function fetchImageBuffer(url, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { Accept: "image/*", "User-Agent": "ZES-Studio/2.0 (Termux; personal video tool)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = String(res.headers.get("content-type") || "");
    if (!type.startsWith("image/")) throw new Error(`unexpected content-type ${type || "?"}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4096) throw new Error("image payload too small");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

function pollinationsUrl(prompt, seed) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1920&model=flux&nologo=true&seed=${seed}`;
}

const WIKIMEDIA_STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "with", "no", "text", "cinematic", "photography",
  "documentary", "dramatic", "lighting", "clouds", "cloud", "golden", "hour",
  "view", "aerial", "scene", "scenic", "style", "background", "4k", "hd", "hdr",
  "image", "image of the", "cinematically", "sunset", "sunrise", "moody",
]);

function wikimediaSearchTerms(prompt) {
  const words = String(prompt)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !WIKIMEDIA_STOPWORDS.has(w));
  const seen = [];
  for (const w of words) if (!seen.includes(w)) seen.push(w);
  return seen.slice(0, 8);
}

async function wikimediaQuery(terms) {
  const query = encodeURIComponent(`filetype:bitmap ${terms.join(" ")}`);
  const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrlimit=6&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=1080&format=json`;
  const res = await fetch(api, {
    headers: { Accept: "application/json", "User-Agent": "ZES-Studio/2.0 (Termux; personal video tool)" },
  });
  if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
  const data = await res.json();
  for (const page of Object.values(data?.query?.pages || {})) {
    const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
    const url = info?.thumburl || info?.url;
    if (url && /\.(jpe?g|png|webp)$/i.test(url.split("?")[0])) return { url, title: page.title };
  }
  return null;
}

async function wikimediaImage(job, prompt) {
  const words = wikimediaSearchTerms(prompt);
  const attempts = [];
  if (words.length) attempts.push(words);
  if (words.length > 3) attempts.push(words.slice(0, 3));
  if (words.length > 1) attempts.push([words[0]]);
  for (const terms of attempts) {
    try {
      const hit = await wikimediaQuery(terms);
      if (hit) return hit;
      appendJobLog(job, `Wikimedia search "${terms.join(" ")}" returned no images`, "stderr");
    } catch (e) {
      appendJobLog(job, `Wikimedia search failed: ${String(e.message || e)}`, "stderr");
    }
  }
  return null;
}

/** Fetch a backdrop image (Pollinations, then Wikimedia fallback) into renders/. */
async function generateBackdrop(job, prompt) {
  const text = String(prompt || "").trim();
  if (!text) return null;
  appendJobLog(job, `Generating backdrop image: ${text.slice(0, 100)}`);

  let buf = null;
  let source = "";
  for (let attempt = 0; attempt < 2 && !buf; attempt++) {
    try {
      buf = await fetchImageBuffer(pollinationsUrl(text, Date.now() % 100000), 110000);
      source = "pollinations";
    } catch (e) {
      appendJobLog(job, `Pollinations attempt ${attempt + 1} failed: ${String(e.message || e)}`, "stderr");
      if (attempt === 0) await sleep(2500);
    }
  }
  if (!buf) {
    try {
      const hit = await wikimediaImage(job, text);
      if (hit) {
        buf = await fetchImageBuffer(hit.url, 90000);
        source = `wikimedia:${hit.title}`;
      }
    } catch (e) {
      appendJobLog(job, `Wikimedia fallback failed: ${String(e.message || e)}`, "stderr");
    }
  }
  if (!buf) {
    appendJobLog(job, "Backdrop skipped (all image sources failed); using animated backdrop", "stderr");
    return null;
  }

  fs.mkdirSync(TMP_DIR, { recursive: true });
  const rawFile = path.join(TMP_DIR, `bg_raw_${job.id}`);
  const name = `bg_${job.id}.jpg`;
  const outFile = path.join(RENDERS_DIR, name);
  fs.writeFileSync(rawFile, buf);
  try {
    await runQuiet("ffmpeg", [
      "-y", "-loglevel", "error", "-i", rawFile,
      "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
      "-frames:v", "1", "-q:v", "3", outFile,
    ]);
  } finally {
    fs.rmSync(rawFile, { force: true });
  }
  if (!fs.existsSync(outFile)) throw new Error("Backdrop normalization failed");
  appendJobLog(job, `Backdrop saved from ${source.split(":")[0]}: ${name} (${Math.round(fs.statSync(outFile).size / 1024)} KB)`);
  return `http://127.0.0.1:${PORT}/renders/${encodeURIComponent(name)}`;
}

/** Synthesize a Kokoro voiceover track aligned to the FactsVideo timeline. */
async function generateNarration(job, propsFile, voice) {
  if (!fs.existsSync(KOKORO_DIR) || !fs.existsSync(path.join(KOKORO_DIR, ".venv"))) {
    throw new Error(`Kokoro venv not found in ${KOKORO_DIR} (install Kokoro-TTS-Local there)`);
  }
  const wavFile = path.join(TMP_DIR, `narration_${job.id}.wav`);
  const inner = [
    `cd ${JSON.stringify(KOKORO_DIR)} &&`,
    `.venv/bin/python ${JSON.stringify(NARRATION_SCRIPT)}`,
    `--props ${JSON.stringify(propsFile)}`,
    `--out ${JSON.stringify(wavFile)}`,
    `--voice ${JSON.stringify(voice || "af_bella")}`,
  ].join(" ");
  const { bin, args } = prootInnerCommand(inner);
  appendJobLog(job, `Synthesizing voiceover with Kokoro (${voice || "af_bella"})`);
  await runJobChild(job, bin, args, { cwd: KOKORO_DIR });
  if (!fs.existsSync(wavFile)) throw new Error("Narration worker produced no WAV file");
  appendJobLog(job, `Voiceover ready: ${path.basename(wavFile)}`);
  return wavFile;
}

/** Mix the voiceover with the looped music bed into a single AAC track. */
async function mixNarrationMusic(job, voiceWav, withMusic) {
  const outName = `audio_${job.id}.m4a`;
  const outPath = path.join(RENDERS_DIR, outName);
  const args = ["-y", "-loglevel", "error"];
  if (withMusic && fs.existsSync(MUSIC_FILE)) {
    args.push("-stream_loop", "-1", "-i", MUSIC_FILE);
  }
  args.push("-i", voiceWav);
  const filter = withMusic && fs.existsSync(MUSIC_FILE)
    ? "[0:a]volume=0.16,afade=t=out:st=41:d=4[music];[1:a]volume=1.0[voice];[music][voice]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]"
    : "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]";
  args.push("-filter_complex", filter, "-map", "[a]", "-t", String(RENDER_SECONDS), "-c:a", "aac", "-b:a", "160k", outPath);
  appendJobLog(job, withMusic ? "Mixing voiceover + music bed" : "Mixing voiceover");
  await runJobChild(job, "ffmpeg", args);
  if (!fs.existsSync(outPath)) throw new Error("ffmpeg produced no mixed audio");
  return outName;
}

function startRender(props, opts = {}) {
  const composition = opts.composition || "FactsVideo";
  const job = createJob("render", {
    composition,
    topic: props.topic || props.videoTitle || composition,
    asset: opts.asset || null,
    frames: opts.frames || null,
  });

  const outFile = `${job.id}.mp4`;
  const outPath = path.join(RENDERS_DIR, outFile);
  const propsFile = path.join(PROPS_DIR, `${job.id}.json`);

  return enqueueJob(job, async (j) => {
    // If an asset from renders/ was selected and no explicit imageSrc was set,
    // bind image assets directly or extract a poster frame from MP4 assets via ffmpeg.
    if (opts.asset && composition === "FactsVideo" && !props.imageSrc) {
      const safeAsset = sanitizeAssetName(opts.asset);
      if (safeAsset && fs.existsSync(safeAsset.fullPath)) {
        const ext = path.extname(safeAsset.name).toLowerCase();
        if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
          props.imageSrc = `http://127.0.0.1:${PORT}/renders/${encodeURIComponent(safeAsset.name)}`;
          appendJobLog(j, `Bound image asset backdrop: ${safeAsset.name}`);
        } else if ([".mp4", ".webm"].includes(ext)) {
          const posterPath = path.resolve(TMP_DIR, `poster_${j.id}.jpg`);
          const extracted = await extractVideoPosterFrame(safeAsset.fullPath, posterPath);
          if (extracted) {
            const b64 = fs.readFileSync(posterPath).toString("base64");
            props.imageSrc = `data:image/jpeg;base64,${b64}`;
            appendJobLog(j, `Extracted poster frame from ${safeAsset.name} via ffmpeg`);
          } else {
            appendJobLog(j, `Selected asset: ${safeAsset.name} (using animated backdrop; ffmpeg poster optional)`);
          }
        }
      }
    }

    const media = opts.media && typeof opts.media === "object" ? opts.media : null;
    if (media && composition === "FactsVideo") {
      try {
        if (media.imagePrompt && !props.imageSrc) {
          j.progress = Math.max(j.progress, 2); j.updatedAt = Date.now();
          props.imageSrc = await generateBackdrop(j, media.imagePrompt);
        }
        if (media.voice !== false) {
          fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));
          j.progress = Math.max(j.progress, 5); j.updatedAt = Date.now();
          const wavFile = await generateNarration(j, propsFile, media.voice || "af_bella");
          const audioName = await mixNarrationMusic(j, wavFile, media.music !== false);
          props.audioSrc = `http://127.0.0.1:${PORT}/renders/${encodeURIComponent(audioName)}`;
          appendJobLog(j, `Audio track attached: ${audioName}`);
        }
      } catch (e) {
        finishJobError(j, `media prep failed: ${String(e.message || e)}`);
        return;
      }
    }

    fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));

    // Remotion's Rust compositor ships only for glibc/Linux-arm64 on Android,
    // so renders execute inside the Debian proot unless RENDER_INSIDE_PROOT=0.
    const relOut = path.relative(VIDEO_DIR, outPath);
    const relProps = path.relative(VIDEO_DIR, propsFile);
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

    console.log(`[render ${j.id}] ${cmd} ${args.join(" ")}`);
    appendJobLog(j, `Spawning Remotion (${composition}) via ${cmd}`);

    let child;
    try {
      child = spawnPiped(cmd, args, {
        cwd: fs.existsSync(VIDEO_DIR) ? VIDEO_DIR : ROOT_DIR,
        env: { ...process.env, CI: "1" },
      });
    } catch (e) {
      finishJobError(j, String(e.message || e));
      return;
    }

    j.child = child;

    const onRemotionLine = (rawLine) => {
      const line = stripAnsi(rawLine).trim();
      if (!line) return;
      const pct = line.match(/(\d{1,3})%/);
      if (pct) j.progress = Math.min(99, Number(pct[1]));
      const frac = line.match(/(?:Rendered|Encoded)\s+(\d+)\/(\d+)/i);
      if (frac && Number(frac[2]) > 0) {
        j.progress = Math.min(99, Math.round((Number(frac[1]) / Number(frac[2])) * 100));
      }
      if (/Bundling/i.test(line) && !pct && !frac) j.progress = Math.max(j.progress, 5);
      j.updatedAt = Date.now();
    };

    const { flushRemaining } = wireChildStreams(j, child, onRemotionLine);

    child.on("error", (e) => {
      if (j.canceled) return;
      finishJobError(j, String(e.message || e));
    });

    child.on("close", (code) => {
      if (j.canceled) return;
      const errLines = flushRemaining();
      if (code === 0 && fs.existsSync(outPath)) {
        let extraMsg = "render complete";
        if (MOVIE_EXPORT) {
          const dest = exportToMovies(outPath);
          if (dest) {
            j.movieFile = path.basename(dest);
            extraMsg = `render complete + exported to ${MOVIES_DIR}`;
            console.log(`[render ${j.id}] exported to ${dest}`);
          }
        }
        finishJobDone(j, outFile, extraMsg);
      } else {
        const tail = errLines.slice(-3).join(" ").slice(0, 240);
        finishJobError(j, tail || `renderer exited with code ${code}`);
      }
    });
  });
}

/* ------------------------ assets & diagnostics ------------------------ */

function listAssets() {
  try {
    return fs.readdirSync(RENDERS_DIR)
      .filter((name) => !name.startsWith(".") && !name.endsWith(".part"))
      .map((name) => {
        const full = path.join(RENDERS_DIR, name);
        let st;
        try { st = fs.statSync(full); } catch { return null; }
        if (!st.isFile()) return null;
        const ext = path.extname(name).toLowerCase();
        const kind = [".mp4", ".webm"].includes(ext)
          ? "video"
          : ([".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? "image" : "file");
        const stage = name.startsWith("previs_")
          ? "previs"
          : (name.startsWith("qwen_") ? "qwen" : "render");
        return {
          name,
          file: name,
          url: `/renders/${encodeURIComponent(name)}`,
          size: st.size,
          bytes: st.size,
          mtime: st.mtime.toISOString(),
          mtimeMs: st.mtimeMs,
          kind,
          stage,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
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

function testBlenderVersion() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const blenderCmd = resolveBlenderCmd(["--version"]);
    const cmdString = `${blenderCmd.display} --version`;
    let settled = false;
    const finish = (payload) => {
      if (!settled) { settled = true; resolve(payload); }
    };

    let child;
    try {
      child = spawnPiped(blenderCmd.bin, blenderCmd.args, {
        cwd: ROOT_DIR,
        env: process.env,
      });
    } catch (e) {
      return finish({
        ok: false,
        command: cmdString,
        exitCode: null,
        durationMs: Date.now() - t0,
        output: `Failed to spawn "${blenderCmd.bin}": ${e.message || e}`,
      });
    }

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
      finish({
        ok: false,
        command: cmdString,
        exitCode: null,
        durationMs: Date.now() - t0,
        output: `Timed out after 15s running: ${cmdString}\n${stdout}\n${stderr}`.trim(),
      });
    }, 15000);

    child.stdout.on("data", (d) => { stdout += d.toString("utf8").slice(0, 8000); });
    child.stderr.on("data", (d) => { stderr += d.toString("utf8").slice(0, 8000); });

    child.on("error", (e) => {
      clearTimeout(timer);
      const detail = e.code === "ENOENT"
        ? `spawn ${blenderCmd.bin} ENOENT — Blender not found on PATH.\nOn Termux, install Blender inside Debian proot and export BLENDER_BIN="proot-distro login debian -- blender" (see SETUP.md).`
        : String(e.message || e);
      finish({
        ok: false,
        command: cmdString,
        exitCode: null,
        durationMs: Date.now() - t0,
        output: detail,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
      finish({
        ok: code === 0,
        command: cmdString,
        exitCode: code,
        durationMs: Date.now() - t0,
        output: combined || `(exited with code ${code})`,
      });
    });
  });
}

/* ------------------------------ router -------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  try {
    if (p === "/api/status") {
      return sendJson(res, 200, {
        ok: true,
        service: "zes-studio",
        version: VERSION,
        port: PORT,
        ts: new Date().toISOString(),
      });
    }

    if (p === "/api/settings" && req.method === "GET") {
      const blender = resolveBlenderCmd([]);
      const cfgLocal = loadLocalConfig();
      const cfgBlender = cfgLocal.BLENDER_BIN || cfgLocal.blender_bin;
      return sendJson(res, 200, {
        blenderBin: process.env.BLENDER_BIN || cfgBlender || "blender",
        blenderBinSource: process.env.BLENDER_BIN ? "env" : cfgBlender ? "config" : "default",
        resolvedBlenderBin: blender.bin,
        resolvedBlenderPrefixArgs: blender.args,
        pythonBin: PYTHON_BIN,
        cwd: ROOT_DIR,
        outputDir: RENDERS_DIR,
        tmpDir: TMP_DIR,
        videoDir: VIDEO_DIR,
        moviesDir: MOVIES_DIR,
        movieExport: MOVIE_EXPORT,
        renderInsideProot: process.env.RENDER_INSIDE_PROOT !== "0",
        renderConcurrency: Number(process.env.RENDER_CONCURRENCY || 4),
        maxConcurrentJobs: MAX_CONCURRENT_JOBS,
        qwenAuthConfigured: hasQwenAuth(),
        port: PORT,
        version: VERSION,
        nodeVersion: process.version,
        platform: `${process.platform}/${process.arch}`,
      });
    }

    if (p === "/api/account" && req.method === "GET") {
      return sendJson(res, 200, publicAccountStatus());
    }

    if (p === "/api/account" && req.method === "POST") {
      let body;
      try { body = await readBody(req); }
      catch (e) { return sendJson(res, 400, { error: "bad_request", detail: String(e.message || e) }); }

      let cookie = normalizeCookieHeader(typeof body?.cookie === "string" ? body.cookie : "");
      let bearer = normalizeQwenToken(typeof body?.token === "string" ? body.token : "");
      const model = typeof body?.model === "string" ? body.model.trim() : "";
      if (!cookie && !bearer) {
        return sendJson(res, 400, { error: "bad_request", detail: "Provide a cookie header or a token." });
      }
      if (cookie.length > 20000) {
        return sendJson(res, 400, { error: "bad_request", detail: "cookie header is too large" });
      }

      const cookieMap = parseCookiePairs(cookie);
      if (!bearer) bearer = normalizeQwenToken(cookieMap.token);
      let refreshNote = "";

      if (!bearer) {
        if (!cookieMap.refresh_token) {
          return sendJson(res, 400, {
            error: "missing_token",
            detail: "Cookie has no token or refresh_token. Use the Connect bookmarklet while signed in on chat.qwen.ai.",
          });
        }
        const refreshed = await refreshQwenAccessToken(cookie);
        if (!refreshed.ok) {
          return sendJson(res, 400, {
            error: "refresh_failed",
            detail: refreshed.detail,
            status: refreshed.status || null,
          });
        }
        bearer = refreshed.token;
        cookie = refreshed.cookies;
        refreshNote = " Refreshed the access token from the cookie.";
      }

      let result = await validateQwenCreds(bearer, cookie);
      if (!result.ok && parseCookiePairs(cookie).refresh_token) {
        const refreshed = await refreshQwenAccessToken(cookie);
        if (refreshed.ok) {
          bearer = refreshed.token;
          cookie = refreshed.cookies;
          result = await validateQwenCreds(bearer, cookie);
          if (result.ok) refreshNote = " Refreshed the access token from the cookie.";
        }
      }
      if (!result.ok) {
        return sendJson(res, 400, { error: "validation_failed", detail: result.detail + refreshNote, status: result.status || null });
      }

      writeLocalConfig((data) => {
        if (cookie) {
          data.QWEN_COOKIES = cookie;
          data.qwen_cookies = cookie;
        }
        if (bearer) {
          data.QWEN_TOKEN = bearer;
          data.qwen_token = bearer;
        }
        const refreshToken = parseCookiePairs(cookie).refresh_token;
        if (refreshToken) data.QWEN_REFRESH_TOKEN = refreshToken;
        delete data.token;
        delete data.cookies;
        if (model) data.QWEN_MODEL = model;
        data.QWEN_ACCOUNT = result.account || "connected";
        data.QWEN_LAST_CHECKED = new Date().toISOString();
      });

      return sendJson(res, 200, { ok: true, detail: result.detail + refreshNote, ...publicAccountStatus() });
    }

    if (p === "/api/account/check" && req.method === "POST") {
      const creds = readQwenCreds();
      if (!creds.configured) {
        return sendJson(res, 400, { error: "not_configured", detail: "No Qwen credentials saved yet." });
      }
      let token = creds.token;
      let cookies = creds.cookies;
      let refreshNote = "";
      let result = await validateQwenCreds(token, cookies);
      if (!result.ok && parseCookiePairs(cookies).refresh_token) {
        const refreshed = await refreshQwenAccessToken(cookies);
        if (refreshed.ok) {
          token = refreshed.token;
          cookies = refreshed.cookies;
          result = await validateQwenCreds(token, cookies);
          if (result.ok) refreshNote = " Refreshed the access token from the cookie.";
        }
      }
      if (result.ok) {
        writeLocalConfig((data) => {
          data.QWEN_COOKIES = cookies;
          data.qwen_cookies = cookies;
          data.QWEN_TOKEN = token;
          data.qwen_token = token;
          const refreshToken = parseCookiePairs(cookies).refresh_token;
          if (refreshToken) data.QWEN_REFRESH_TOKEN = refreshToken;
          if (result.account) data.QWEN_ACCOUNT = result.account;
          data.QWEN_LAST_CHECKED = new Date().toISOString();
        });
      }
      return sendJson(res, result.ok ? 200 : 400, {
        detail: result.detail + refreshNote,
        ok: result.ok,
        detail: result.detail,
        status: result.status || null,
        ...publicAccountStatus(),
      });
    }

    if (p === "/api/account" && req.method === "DELETE") {
      writeLocalConfig((data) => {
        for (const key of ["QWEN_COOKIES", "qwen_cookies", "cookies", "QWEN_TOKEN", "qwen_token", "token", "QWEN_REFRESH_TOKEN", "QWEN_ACCOUNT", "QWEN_LAST_CHECKED"]) {
          delete data[key];
        }
      });
      const status = publicAccountStatus();
      return sendJson(res, 200, {
        ok: true,
        detail: status.source === "env" ? "Removed saved credentials, but QWEN_* environment variables still override them." : "Saved credentials removed.",
        ...status,
      });
    }

    if (p === "/api/blender-test" && (req.method === "POST" || req.method === "GET")) {
      const result = await testBlenderVersion();
      return sendJson(res, 200, result);
    }

    if (p === "/api/image" && req.method === "GET") {
      return await handleImage(url, res);
    }

    /* ---------------- new pipeline worker routes ---------------- */

    if (p === "/api/qwen-video" && req.method === "POST") {
      let body;
      try { body = await readBody(req); }
      catch (e) { return sendJson(res, 400, { error: "bad_request", detail: String(e.message || e) }); }

      const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        return sendJson(res, 400, { error: "bad_request", detail: "prompt is required" });
      }
      if (prompt.length > 4000) {
        return sendJson(res, 400, { error: "bad_request", detail: "prompt too long (max 4000 chars)" });
      }
      const aspectRatio = typeof body?.aspect_ratio === "string" && body.aspect_ratio.trim()
        ? body.aspect_ratio.trim()
        : "9:16";
      if (!VALID_ASPECTS.has(aspectRatio)) {
        return sendJson(res, 400, {
          error: "bad_request",
          detail: `aspect_ratio must be one of: ${Array.from(VALID_ASPECTS).join(", ")}`,
        });
      }

      const job = startQwenVideoJob(prompt, aspectRatio);
      return sendJson(res, 202, { jobId: job.id, job: serializeJob(job) });
    }

    if (p === "/api/previs" && req.method === "POST") {
      let body;
      try { body = await readBody(req); }
      catch (e) { return sendJson(res, 400, { error: "bad_request", detail: String(e.message || e) }); }

      let spec = body?.shot_spec ?? body;
      if (typeof spec === "string") {
        try { spec = JSON.parse(spec); }
        catch (e) {
          return sendJson(res, 400, { error: "bad_request", detail: `shot_spec invalid JSON: ${e.message}` });
        }
      }
      if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
        return sendJson(res, 400, { error: "bad_request", detail: "shot_spec must be a JSON object" });
      }

      const job = startPrevisJob(spec);
      return sendJson(res, 202, { jobId: job.id, job: serializeJob(job) });
    }

    if (p === "/api/jobs" && req.method === "GET") {
      const list = Array.from(jobs.values())
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((j) => serializeJob(j, { logLimit: 10 }));
      return sendJson(res, 200, { jobs: list });
    }

    if (p.startsWith("/api/jobs/")) {
      const id = decodeURIComponent(p.slice("/api/jobs/".length)).replace(/\/+$/, "");
      const job = jobs.get(id);
      if (!job) return sendJson(res, 404, { error: "not_found", detail: `job ${id} not found` });

      if (req.method === "GET") {
        return sendJson(res, 200, serializeJob(job, { logLimit: 400 }));
      }
      if (req.method === "DELETE") {
        cancelJob(job);
        return sendJson(res, 200, serializeJob(job, { logLimit: 100 }));
      }
    }

    if (p === "/api/assets" && req.method === "GET") {
      return sendJson(res, 200, { assets: listAssets() });
    }

    if (p.startsWith("/api/assets/") && req.method === "DELETE") {
      const rawName = p.slice("/api/assets/".length);
      const safe = sanitizeAssetName(rawName);
      if (!safe) {
        return sendJson(res, 400, { error: "bad_request", detail: "invalid asset filename" });
      }
      if (!fs.existsSync(safe.fullPath)) {
        return sendJson(res, 404, { error: "not_found", detail: "asset not found" });
      }
      let st;
      try { st = fs.statSync(safe.fullPath); } catch { st = null; }
      if (!st || !st.isFile()) {
        return sendJson(res, 404, { error: "not_found", detail: "asset not found" });
      }
      fs.unlinkSync(safe.fullPath);
      return sendJson(res, 200, { ok: true, deleted: safe.name });
    }

    /* ---------------- existing Remotion routes (preserved) ---------------- */

    if (p === "/api/render" && req.method === "POST") {
      let body;
      try { body = await readBody(req); }
      catch (e) { return sendJson(res, 400, { error: "bad_request", detail: String(e.message || e) }); }

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
          asset: body.asset,
        });
        return sendJson(res, 202, { jobId: job.id, ...publicJob(job) });
      }

      let props;
      try { props = sanitizeProps(body); }
      catch (e) { return sendJson(res, 400, { error: "bad_request", detail: String(e.message || e) }); }

      let media = null;
      if (body.media && typeof body.media === "object" && !Array.isArray(body.media)) {
        const raw = body.media;
        media = {
          voice: raw.voice === false
            ? false
            : (typeof raw.voice === "string" && /^[a-z]{2}_[a-z]+$/.test(raw.voice) ? raw.voice : "af_bella"),
          music: raw.music !== false,
          imagePrompt: typeof raw.imagePrompt === "string" ? raw.imagePrompt.slice(0, 800) : "",
        };
      }

      const job = startRender(props, {
        frames: body.frames,
        concurrency: body.concurrency,
        asset: body.asset,
        media,
      });
      return sendJson(res, 202, { jobId: job.id, ...publicJob(job) });
    }

    if (p.startsWith("/api/render/") && req.method === "DELETE") {
      const id = p.slice("/api/render/".length);
      const job = jobs.get(id);
      if (!job) return sendJson(res, 404, { error: "not_found" });
      cancelJob(job, "canceled");
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
      const safe = sanitizeAssetName(p.slice("/renders/".length));
      if (!safe) return sendJson(res, 404, { error: "not_found" });
      const ext = path.extname(safe.name).toLowerCase();
      const download = url.searchParams.has("download");
      if ((ext === ".mp4" || ext === ".webm") && serveVideo(req, res, safe.fullPath, { download })) return;
      if (
        [".png", ".jpg", ".jpeg", ".webp", ".m4a", ".aac", ".mp3", ".wav", ".ogg"].includes(ext) &&
        serveFile(res, safe.fullPath, { download })
      ) return;
      return sendJson(res, 404, { error: "not_found" });
    }

    if ((p === "/image" || p === "/image/") && req.method === "GET") {
      return serveStatic(res, "/image-studio.html");
    }

    if (p === "/qwen-connect.user.js" && req.method === "GET") {
      const host = String(req.headers.host || `127.0.0.1:${PORT}`);
      const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
      const origin = `${proto}://${host}`;
      const file = path.join(PUBLIC_DIR, "qwen-connect.user.js");
      const js = fs.readFileSync(file, "utf8").replaceAll("__ZES_ORIGIN__", origin);
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(js);
    }

    if ((p === "/connect" || p === "/connect/") && req.method === "GET") {
      return serveStatic(res, "/connect.html");
    }

    return serveStatic(res, p === "/" ? "/index.html" : p);
  } catch (e) {
    return sendJson(res, 500, { error: "server_error", detail: String(e.message || e).slice(0, 300) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[zes-studio] listening on http://0.0.0.0:${PORT}`);
  console.log(`[zes-studio] cwd=${ROOT_DIR}`);
  console.log(`[zes-studio] public=${PUBLIC_DIR}`);
  console.log(`[zes-studio] renders=${RENDERS_DIR}`);
  console.log(`[zes-studio] tmp=${TMP_DIR}`);
  console.log(`[zes-studio] blender=${resolveBlenderCmd([]).display}`);
  console.log(`[zes-studio] exports -> ${MOVIE_EXPORT ? MOVIES_DIR : "disabled"}`);
  console.log(`[zes-studio] video project=${VIDEO_DIR}`);
});
