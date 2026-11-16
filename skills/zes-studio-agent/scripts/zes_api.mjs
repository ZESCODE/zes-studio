#!/usr/bin/env node
// Zero-dependency agent CLI for the ZES Studio 2.0 local API.
// Usage: ZES_BASE=http://localhost:3000 node zes_api.mjs <command> [args]
import { readFile, writeFile } from "node:fs/promises";

const BASE = String(process.env.ZES_BASE || `http://localhost:${process.env.PORT || 8090}`)
  .replace(/\/+$/, "");
const WATCH_TIMEOUT_MS = Math.max(1000, Number(process.env.ZES_WATCH_TIMEOUT_MS || 15 * 60 * 1000));
const argv = process.argv.slice(2);
const command = String(argv.shift() || "help").toLowerCase();
const args = argv;

const DEFAULT_FACTS = [
  { emoji: "🎬", headline: "Shot blocked in headless Blender", detail: "Camera lens, staging, and timing are validated in 640x360 3D previs first.", stat: "STAGE 1", statLabel: "BLENDER PREVIS" },
  { emoji: "⚡", headline: "AI motion synthesized with Qwen", detail: "Prompt-driven t2v generation downloads high-res clips directly into renders/.", stat: "STAGE 2", statLabel: "QWEN VIDEO" },
  { emoji: "📱", headline: "Orchestrated locally on Android", detail: "Zero external npm server dependencies keep memory tiny inside Termux.", stat: "0 DEPS", statLabel: "NODE ESM" },
  { emoji: "🧊", headline: "Composited with Remotion", detail: "Typography, transitions, and sound beds render cleanly inside Debian proot.", stat: "30 FPS", statLabel: "REMOTION" },
  { emoji: "🚀", headline: "Ready for vertical publishing", detail: "Finished MP4 files stream with HTTP Range and auto-export to Android Movies.", stat: "1080P", statLabel: "FINAL MASTER" },
];

const HELP = `ZES Studio agent API CLI (zero dependencies)

Base URL: ${BASE}
Set ZES_BASE=http://localhost:3000 when the server runs with PORT=3000.
Set ZES_WATCH_TIMEOUT_MS to override the 15-minute watch timeout.

Commands:
  status                              GET /api/status
  settings                            GET /api/settings
  blender-test                        POST /api/blender-test
  jobs                                GET /api/jobs
  job <id>                            GET /api/jobs/:id (full log tail)
  watch <id>                          poll every 2s until done/error
  qwen "<prompt>" [aspect] [--watch]  POST /api/qwen-video
  previs <shot.json|inline> [--watch]  POST /api/previs
  render <asset|-> [topic] [--watch]  POST /api/render
  assets                              GET /api/assets
  renders                             GET /api/renders
  image "<prompt>" <out> [w] [h] [model]  GET /api/image -> file
  cancel <id> --yes                   DELETE /api/jobs/:id
  delete <asset> --yes                DELETE /api/assets/:name
  help                                show this message

Aspect ratios: 9:16 (default), 16:9, 1:1, 4:3, 3:4.
For final renders, '-' uses five default facts and the animated backdrop.
Destructive commands require --yes after user confirmation.
`;

function need(value, message) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(message);
  }
  return value;
}

function takeFlag(list, flag) {
  const index = list.indexOf(flag);
  if (index === -1) return false;
  list.splice(index, 1);
  return true;
}

function jsonRequest(body, method = "POST") {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function api(path, options = {}) {
  const response = await fetch(BASE + path, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    const detail = isJson
      ? JSON.stringify(payload)
      : payload.toString("utf8").slice(0, 400);
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  return payload;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function watchJob(id) {
  const jobId = need(id, "watch requires a job id");
  const started = Date.now();
  while (true) {
    const job = await api(`/api/jobs/${encodeURIComponent(jobId)}`);
    const status = String(job.status || "").toLowerCase();
    if (status === "done" || status === "error" || status === "canceled") {
      printJson(job);
      if (status !== "done") process.exitCode = 1;
      return;
    }
    process.stderr.write(
      `[watch] #${jobId} ${status || "unknown"} ${Number(job.progress || 0)}% ${String(job.message || "").slice(0, 120)}\n`
    );
    if (Date.now() - started > WATCH_TIMEOUT_MS) {
      printJson(job);
      throw new Error(`watch timeout after ${WATCH_TIMEOUT_MS} ms for job #${jobId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function maybeWatch(data, enabled) {
  const jobId = data?.jobId || data?.id;
  if (!enabled) return;
  if (!jobId) throw new Error("server response did not include jobId");
  await watchJob(jobId);
}

async function parseShotSpec(raw) {
  const value = need(raw, "previs requires a shot-spec JSON file path or inline JSON object");
  const trimmed = String(value).trim();
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); }
    catch (err) { throw new Error(`inline shot_spec is not valid JSON: ${err.message}`); }
  }
  try {
    return JSON.parse(await readFile(trimmed, "utf8"));
  } catch (err) {
    throw new Error(`cannot read shot spec ${trimmed}: ${err.message}`);
  }
}

async function main() {
  // --watch is accepted by queue commands; --yes is handled by destructive ones.
  const watch = takeFlag(args, "--watch");

  switch (command) {
    case "help":
    case "-h":
    case "--help":
      process.stdout.write(HELP);
      return;

    case "status":
      printJson(await api("/api/status"));
      return;

    case "settings":
      printJson(await api("/api/settings"));
      return;

    case "blender-test":
      printJson(await api("/api/blender-test", jsonRequest({})));
      return;

    case "jobs":
      printJson(await api("/api/jobs"));
      return;

    case "job":
      printJson(await api(`/api/jobs/${encodeURIComponent(need(args[0], "job requires an id"))}`));
      return;

    case "watch":
      await watchJob(args[0]);
      return;

    case "qwen": {
      const prompt = need(args[0], "qwen requires a prompt");
      const aspectRatio = args[1] || "9:16";
      const data = await api("/api/qwen-video", jsonRequest({ prompt, aspect_ratio: aspectRatio }));
      printJson(data);
      await maybeWatch(data, watch);
      return;
    }

    case "previs": {
      const shotSpec = await parseShotSpec(args[0]);
      const data = await api("/api/previs", jsonRequest({ shot_spec: shotSpec }));
      printJson(data);
      await maybeWatch(data, watch);
      return;
    }

    case "render": {
      const asset = need(args[0], "render requires an asset name or '-' for the animated backdrop");
      const topic = args[1] ? String(args[1]) : undefined;
      const body = asset === "-"
        ? { facts: DEFAULT_FACTS, ...(topic ? { topic } : {}) }
        : { asset, ...(topic ? { topic } : {}) };
      const data = await api("/api/render", jsonRequest(body));
      printJson(data);
      await maybeWatch(data, watch);
      return;
    }

    case "assets":
      printJson(await api("/api/assets"));
      return;

    case "renders":
      printJson(await api("/api/renders"));
      return;

    case "image": {
      const prompt = need(args[0], "image requires a prompt");
      const outFile = need(args[1], "image requires an output file path");
      const width = args[2] || "1024";
      const height = args[3] || "1024";
      const model = args[4] || "flux";
      const query = new URLSearchParams({ prompt, model, width, height });
      const bytes = await api(`/api/image?${query}`);
      await writeFile(outFile, bytes);
      console.log(`Wrote ${bytes.length} bytes to ${outFile}`);
      return;
    }

    case "cancel": {
      const id = need(args[0], "cancel requires a job id");
      if (!takeFlag(args, "--yes")) {
        throw new Error("cancel is destructive: confirm with the user, then pass --yes");
      }
      printJson(await api(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" }));
      return;
    }

    case "delete": {
      const name = need(args[0], "delete requires an asset filename");
      if (!takeFlag(args, "--yes")) {
        throw new Error("delete is destructive: confirm with the user, then pass --yes");
      }
      printJson(await api(`/api/assets/${encodeURIComponent(name)}`, { method: "DELETE" }));
      return;
    }

    default:
      throw new Error(`unknown command: ${command}\n\n${HELP}`);
  }
}

main().catch((err) => {
  console.error(`ERROR: ${String(err?.message || err)}`);
  process.exit(1);
});
