"use strict";

const form = document.getElementById("image-studio-form");
const promptEl = document.getElementById("studio-prompt");
const modelEl = document.getElementById("studio-model");
const widthEl = document.getElementById("studio-width");
const heightEl = document.getElementById("studio-height");
const modelBadge = document.getElementById("model-badge");
const generateBtn = document.getElementById("studio-generate");
const statusEl = document.getElementById("studio-status");
const stage = document.getElementById("studio-stage");
const emptyEl = document.getElementById("studio-empty");
const loadingEl = document.getElementById("studio-loading");
const errorEl = document.getElementById("studio-error");
const errorText = document.getElementById("studio-error-text");
const errorUrl = document.getElementById("studio-error-url");
const pendingUrl = document.getElementById("studio-pending-url");
const elapsedEl = document.getElementById("studio-elapsed");
const imgEl = document.getElementById("studio-image");
const metaEl = document.getElementById("studio-meta");
const metaModel = document.getElementById("meta-model");
const metaSize = document.getElementById("meta-size");
const metaTime = document.getElementById("meta-time");
const metaPrompt = document.getElementById("meta-prompt");
const resultSubtitle = document.getElementById("result-subtitle");
const historyWrap = document.getElementById("studio-history-wrap");
const historyEl = document.getElementById("studio-history");
const toastEl = document.getElementById("toast");

const MAX_HISTORY = 8;
const STORAGE_KEY = "zes.imageStudio.v1";
const PRESETS = new Set(["1024x1024", "832x1216", "1216x832", "768x1344", "1344x768"]);

const state = {
  objectUrl: null,
  sourceUrl: "",
  loading: false,
  startedAt: 0,
  timer: null,
  history: [],
  toastTimer: null,
  controller: null,
};

function clampSize(value, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(64, Math.min(2048, n));
}

function buildUrl(prompt, model, width, height) {
  const params = new URLSearchParams({
    prompt,
    model,
    width: String(width),
    height: String(height),
  });
  return `/api/image?${params.toString()}`;
}

function setStatus(text, kind = "") {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("is-error", kind === "error");
  statusEl.classList.toggle("is-ok", kind === "ok");
}

function toast(message, kind = "") {
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.toggle("is-ok", kind === "ok");
  toastEl.classList.toggle("is-error", kind === "error");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3200);
}

function setBusy(busy) {
  state.loading = busy;
  generateBtn.disabled = busy;
  generateBtn.classList.toggle("is-loading", busy);
  generateBtn.querySelector(".btn-label").textContent = busy ? "Generating…" : "Generate image";
  stage.setAttribute("aria-busy", busy ? "true" : "false");
}

function showOnly(el, node) {
  for (const child of el.children) child.hidden = child !== node;
  node.hidden = false;
}

function startTimer() {
  state.startedAt = performance.now();
  elapsedEl.textContent = "0.0s";
  state.timer = setInterval(() => {
    elapsedEl.textContent = `${((performance.now() - state.startedAt) / 1000).toFixed(1)}s`;
  }, 100);
}

function stopTimer() {
  clearInterval(state.timer);
  state.timer = null;
}

function setResultActions(enabled) {
  for (const btn of document.querySelectorAll('[data-action="download"], [data-action="source"], [data-action="copy"]')) {
    btn.disabled = !enabled;
  }
}

function updatePresetState() {
  const key = `${widthEl.value}x${heightEl.value}`;
  for (const btn of document.querySelectorAll(".image-preset")) {
    btn.setAttribute("aria-pressed", btn.dataset.size === key ? "true" : "false");
  }
}

function remember({ prompt, model, width, height, url, objectUrl, ms }) {
  state.history.unshift({ prompt, model, width, height, url, objectUrl, ms, at: Date.now() });
  while (state.history.length > MAX_HISTORY) {
    const dropped = state.history.pop();
    if (dropped && dropped.objectUrl && dropped.objectUrl !== state.objectUrl) {
      setTimeout(() => URL.revokeObjectURL(dropped.objectUrl), 0);
    }
  }
  renderHistory();
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ prompt, model, width, height })
    );
  } catch {
    /* storage may be disabled */
  }
}

function renderHistory() {
  historyEl.textContent = "";
  historyWrap.hidden = state.history.length === 0;
  state.history.forEach((item, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "image-history-item";
    btn.title = `${item.prompt} (${item.model}, ${item.width}×${item.height})`;
    btn.setAttribute("aria-label", `Restore generation ${index + 1}`);
    const thumb = document.createElement("img");
    thumb.src = item.objectUrl;
    thumb.alt = item.prompt;
    thumb.loading = "lazy";
    btn.appendChild(thumb);
    btn.addEventListener("click", () => restore(item));
    historyEl.appendChild(btn);
  });
}

function restore(item) {
  imgEl.src = item.objectUrl;
  imgEl.alt = `Generated image: ${item.prompt}`;
  showOnly(stage, imgEl);
  metaModel.textContent = item.model;
  metaSize.textContent = `${item.width}×${item.height}`;
  metaTime.textContent = `${(item.ms / 1000).toFixed(1)}s`;
  metaPrompt.textContent = item.prompt;
  metaEl.hidden = false;
  resultSubtitle.textContent = "Restored from session history.";
  state.sourceUrl = item.url;
  setResultActions(true);
  setStatus("Restored a previous result.", "ok");
}

function parseErrorDetail(text, status) {
  try {
    const data = JSON.parse(text);
    if (data && (data.error || data.detail)) {
      const upstream = data.status ? ` (upstream ${data.status})` : "";
      return `${data.error || "error"}${data.detail ? `: ${data.detail}` : ""}${upstream}`;
    }
  } catch {
    /* not JSON */
  }
  return `HTTP ${status}`;
}

async function generate() {
  const prompt = promptEl.value.trim();
  if (!prompt) {
    setStatus("Please enter a prompt.", "error");
    promptEl.focus();
    return;
  }
  if (state.loading) return;

  const model = modelEl.value;
  const width = clampSize(widthEl.value, 1024);
  const height = clampSize(heightEl.value, 1024);
  widthEl.value = String(width);
  heightEl.value = String(height);
  updatePresetState();

  const url = buildUrl(prompt, model, width, height);
  state.sourceUrl = url;
  pendingUrl.textContent = url;

  imgEl.hidden = true;
  imgEl.removeAttribute("src");
  showOnly(stage, loadingEl);
  metaEl.hidden = true;
  setResultActions(false);
  setBusy(true);
  setStatus("Requesting image…");
  startTimer();

  state.controller = new AbortController();
  try {
    const res = await fetch(url, { signal: state.controller.signal });
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.startsWith("image/")) {
      const text = await res.text();
      throw new Error(parseErrorDetail(text, res.status));
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const ms = performance.now() - state.startedAt;

    state.objectUrl = objectUrl;
    imgEl.src = objectUrl;
    imgEl.alt = `Generated image: ${prompt}`;
    showOnly(stage, imgEl);

    metaModel.textContent = model;
    metaSize.textContent = `${width}×${height}`;
    metaTime.textContent = `${(ms / 1000).toFixed(1)}s`;
    metaPrompt.textContent = prompt;
    metaEl.hidden = false;
    resultSubtitle.textContent = "Latest generation.";
    setResultActions(true);
    setStatus(`Done in ${(ms / 1000).toFixed(1)}s.`, "ok");
    toast("Image generated.", "ok");

    remember({ prompt, model, width, height, url, objectUrl, ms });
  } catch (err) {
    if (err.name === "AbortError") return;
    showOnly(stage, errorEl);
    errorText.textContent = err.message || String(err);
    errorUrl.textContent = url;
    setStatus(`Failed: ${err.message || err}`, "error");
    toast(`Image failed: ${err.message || err}`, "error");
    resultSubtitle.textContent = "Last request failed.";
  } finally {
    stopTimer();
    setBusy(false);
    state.controller = null;
  }
}

function download() {
  if (!state.objectUrl) return;
  const a = document.createElement("a");
  a.href = state.objectUrl;
  a.download = `zes-image-${modelEl.value}-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openSource() {
  if (!state.sourceUrl) return;
  window.open(state.sourceUrl, "_blank", "noopener,noreferrer");
}

async function copySource() {
  if (!state.sourceUrl) return;
  try {
    await navigator.clipboard.writeText(new URL(state.sourceUrl, location.origin).href);
    toast("URL copied.", "ok");
  } catch {
    toast("Clipboard unavailable.", "error");
  }
}

function randomize() {
  const subjects = [
    "a calico cat surfing a glowing wave at sunset",
    "frosted blue glass studio, cinematic lighting",
    "a tiny astronaut tending a neon garden",
    "isometric cyberpunk alley in the rain",
    "a lighthouse made of stacked books at dusk",
    "portrait of a fox in a velvet cloak, studio light",
  ];
  const styles = [
    "photorealistic, shallow depth of field",
    "studio lighting, high detail",
    "cinematic color grade, 35mm",
    "soft volumetric light, pastel palette",
    "dramatic rim light, ultra sharp",
  ];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  const style = styles[Math.floor(Math.random() * styles.length)];
  promptEl.value = `${subject}, ${style}`;
  modelEl.value = ["flux", "zimage", "klein", "kontext"][Math.floor(Math.random() * 4)];
  modelBadge.textContent = modelEl.value;
  const preset = Array.from(PRESETS)[Math.floor(Math.random() * PRESETS.size)];
  const [w, h] = preset.split("x");
  widthEl.value = w;
  heightEl.value = h;
  updatePresetState();
  promptEl.focus();
  setStatus("Prompt randomized. Press Generate.");
}

function restoreSession() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    saved = null;
  }
  const params = new URLSearchParams(location.search);
  const prompt = params.get("prompt") || (saved && saved.prompt) || "";
  const model = params.get("model") || (saved && saved.model) || "flux";
  const width = params.get("width") || (saved && saved.width) || 1024;
  const height = params.get("height") || (saved && saved.height) || 1024;

  if (prompt) promptEl.value = prompt;
  if (Array.from(modelEl.options).some((o) => o.value === model)) modelEl.value = model;
  widthEl.value = String(width);
  heightEl.value = String(height);
  modelBadge.textContent = modelEl.value;
  updatePresetState();

  if (params.get("prompt") && params.get("auto") !== "0") {
    generate();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  generate();
});

promptEl.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    generate();
  }
});

modelEl.addEventListener("change", () => {
  modelBadge.textContent = modelEl.value;
});

for (const input of [widthEl, heightEl]) {
  input.addEventListener("input", updatePresetState);
  input.addEventListener("change", updatePresetState);
}

document.querySelector("[data-size-group]").addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-size]");
  if (!btn) return;
  const [w, h] = btn.dataset.size.split("x");
  widthEl.value = w;
  heightEl.value = h;
  updatePresetState();
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  switch (target.dataset.action) {
    case "download":
      download();
      break;
    case "source":
      openSource();
      break;
    case "copy":
      copySource();
      break;
    case "randomize":
      randomize();
      break;
    default:
      break;
  }
});

window.addEventListener("beforeunload", () => {
  for (const item of state.history) {
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
  }
});

restoreSession();
