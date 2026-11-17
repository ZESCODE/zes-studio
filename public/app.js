/* ZES Studio control panel — vanilla ES module, zero dependencies. */
"use strict";

const VIEWS = ["dashboard", "generate", "previs", "render", "assets", "logs", "settings"];
const VIEW_LABELS = {
  dashboard: "Dashboard",
  generate: "Generate (Qwen)",
  previs: "Previs (Blender)",
  render: "Render",
  assets: "Assets",
  logs: "Logs",
  settings: "Settings",
};
const ACTIVE_STATUSES = new Set(["queued", "running"]);
const VALID_STATUSES = new Set(["queued", "running", "done", "error", "canceled"]);

const DEFAULT_SHOT_SPEC = {
  name: "Frost card dolly",
  frame_start: 1,
  frame_end: 48,
  fps: 24,
  samples: 16,
  engine: "CYCLES",
  world: { color: "#0b1220", strength: 0.8 },
  ground: { size: 20, color: "#202632", roughness: 0.82 },
  camera: {
    location: [0, -9, 3.2],
    end_location: [3.5, -7.5, 2.6],
    look_at: [0, 0, 1],
    lens: 35,
  },
  sun: { energy: 2.4, location: [4, -6, 9], look_at: [0, 0, 1], color: "#fff3d6" },
  fill: { energy: 700, size: 6, location: [-5, -2, 5], look_at: [0, 0, 1], color: "#6ee7ff" },
  cubes: [
    { name: "Subject_A", location: [-2.4, 0, 1], scale: [0.8, 0.8, 0.8], color: "#6ee7ff", spin: [0, 0, 180] },
    { name: "Subject_B", location: [0, 0.2, 1.15], scale: [1, 1, 1], color: "#4d8dff", spin: [0, 0, -180] },
    { name: "Subject_C", location: [2.4, -0.1, 0.9], scale: [0.7, 0.7, 0.7], color: "#ffc94d", spin: [0, 0, 180] },
  ],
};

const FALLBACK_FACTS = [
  { emoji: "🎬", headline: "Shot blocked in headless Blender", detail: "Camera lens, staging, and timing are validated in 640x360 3D previs first.", stat: "STAGE 1", statLabel: "BLENDER PREVIS" },
  { emoji: "⚡", headline: "AI motion synthesized with Qwen", detail: "Prompt-driven t2v generation downloads high-res clips directly into renders/.", stat: "STAGE 2", statLabel: "QWEN VIDEO" },
  { emoji: "📱", headline: "Orchestrated locally on Android", detail: "Zero external npm server dependencies keep memory tiny inside Termux.", stat: "0 DEPS", statLabel: "NODE ESM" },
  { emoji: "🧊", headline: "Composited with Remotion", detail: "Typography, transitions, and sound beds render cleanly inside Debian proot.", stat: "30 FPS", statLabel: "REMOTION" },
  { emoji: "🚀", headline: "Ready for vertical publishing", detail: "Finished MP4 files stream with HTTP Range and auto-export to Android Movies.", stat: "1080P", statLabel: "FINAL MASTER" },
];

const state = {
  view: "dashboard",
  filter: null,
  jobs: [],
  assets: [],
  settings: null,
  blenderTest: null,
  account: null,
  accountCheck: null,
  jobDetail: null,
  selectedLogJob: null,
  playerName: null,
  pollTimer: null,
  toastTimer: null,
  drawerOpen: false,
  activeSheetId: null,
  lastFocusedDrawer: null,
  lastFocusedSheet: null,
  drawerCloseToken: 0,
  sheetCloseToken: 0,
  jobsSeq: 0,
  assetsSeq: 0,
  logSeq: 0,
};

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function safeStatus(status) {
  const value = String(status || "").toLowerCase();
  return VALID_STATUSES.has(value) ? value : "queued";
}

function isActive(status) {
  return ACTIVE_STATUSES.has(safeStatus(status));
}

function clampProgress(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return date.toISOString();
  }
}

function typeLabel(type) {
  return { qwen: "Generate", previs: "Previs", render: "Render" }[String(type)] || String(type || "job");
}

function typeIcon(type) {
  return { qwen: "✦", previs: "◈", render: "▶" }[String(type)] || "•";
}

function stageLabel(stage) {
  return { qwen: "Qwen", previs: "Previs", render: "Render" }[String(stage)] || "File";
}

function assetUrl(asset) {
  return `/renders/${encodeURIComponent(asset.name)}`;
}

function outputHref(job) {
  const raw = String(job?.output || "");
  return raw.startsWith("/renders/") ? raw : null;
}

function focusElement(element) {
  if (!element || !document.contains(element) || typeof element.focus !== "function") return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    try { element.focus(); } catch { /* element not focusable */ }
  }
}

function showToast(message, kind = "") {
  const toast = $("toast");
  if (!toast) return;
  window.clearTimeout(state.toastTimer);
  toast.textContent = String(message || "");
  toast.className = "toast";
  if (kind === "ok") toast.classList.add("is-ok");
  if (kind === "error") toast.classList.add("is-error");
  toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

function setStatusLine(form, message, kind = "") {
  const line = form?.querySelector?.(".status-line");
  if (!line) return;
  line.textContent = String(message || "");
  line.classList.remove("is-ok", "is-error");
  if (kind === "ok") line.classList.add("is-ok");
  if (kind === "error") line.classList.add("is-error");
}

function setFormBusy(form, busy) {
  if (!form) return;
  const controls = form.querySelectorAll("button, input, textarea, select");
  if (busy) {
    if (form.dataset.busy === "true") return;
    form.dataset.busy = "true";
    controls.forEach((el) => {
      el.dataset.wasDisabled = el.disabled ? "true" : "false";
      el.disabled = true;
    });
    return;
  }
  if (form.dataset.busy !== "true") return;
  controls.forEach((el) => {
    if (el.dataset.wasDisabled !== "true") el.disabled = false;
    delete el.dataset.wasDisabled;
  });
  delete form.dataset.busy;
}

function setButtonBusy(button, busy) {
  if (!button) return;
  if (busy) {
    if (button.dataset.busy === "true") return;
    button.dataset.busy = "true";
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Working…";
  } else {
    if (button.dataset.busy !== "true") return;
    button.disabled = false;
    button.textContent = button.dataset.originalText || "Run";
    delete button.dataset.busy;
    delete button.dataset.originalText;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const detail = data.detail || data.error || data.message || `HTTP ${response.status}`;
    throw new Error(String(detail).slice(0, 240));
  }
  return data;
}

function jsonPost(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body || {}) });
}

/* ------------------------------ navigation ----------------------------- */

function viewFromHash() {
  const raw = String(window.location.hash || "").replace(/^#/, "");
  return VIEWS.includes(raw) ? raw : "dashboard";
}

function setView(view, { focus = false } = {}) {
  const next = VIEWS.includes(view) ? view : "dashboard";
  state.view = next;

  document.querySelectorAll(".view").forEach((section) => {
    section.hidden = section.dataset.view !== next;
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.view === next;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  document.title = `${VIEW_LABELS[next]} · ZES Studio`;
  if (focus) focusElement(document.querySelector(`#view-${next} h1`));

  if (next === "assets") fetchAssets({ quiet: true }).catch(() => {});
  if (next === "settings") {
    fetchSettings({ quiet: true }).catch(() => {});
    fetchAccount({ quiet: true }).catch(() => {});
  }
  if (next === "logs" && state.selectedLogJob) {
    fetchJobDetail(state.selectedLogJob, { quiet: true }).catch(() => {});
  }
}

function navigate(view) {
  const next = VIEWS.includes(view) ? view : "dashboard";
  const hash = `#${next}`;
  if (window.location.hash !== hash) window.location.hash = hash;
  else setView(next, { focus: true });
  closeDrawer({ restoreFocus: false });
}

/* -------------------------- drawer & focus trap ------------------------ */

function getFocusable(container) {
  if (!container) return [];
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "video[controls]",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  return Array.from(container.querySelectorAll(selector)).filter((el) => {
    if (el.closest("[hidden]") && el.closest("[hidden]") !== container) return false;
    if (el.tabIndex === -1) return false;
    return el.offsetParent !== null || el.getClientRects().length > 0;
  });
}

function trapFocus(event, container) {
  if (event.key !== "Tab") return;
  const focusables = getFocusable(container);
  if (!focusables.length) {
    event.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      focusElement(last);
    }
  } else if (active === last || !container.contains(active)) {
    event.preventDefault();
    focusElement(first);
  }
}

function syncScrollLock() {
  document.body.classList.toggle("no-scroll", Boolean(state.drawerOpen || state.activeSheetId));
}

function openDrawer() {
  if (state.drawerOpen) return;
  state.drawerOpen = true;
  state.lastFocusedDrawer = document.activeElement;

  const drawer = $("drawer");
  const backdrop = $("drawer-backdrop");
  const button = $("menu-button");
  if (!drawer || !backdrop || !button) return;

  drawer.hidden = false;
  backdrop.hidden = false;
  drawer.removeAttribute("inert");
  drawer.inert = false;
  drawer.setAttribute("aria-hidden", "false");
  button.classList.add("is-open");
  button.setAttribute("aria-expanded", "true");
  syncScrollLock();

  window.requestAnimationFrame(() => {
    if (!state.drawerOpen) return;
    drawer.classList.add("is-open");
    backdrop.classList.add("is-open");
  });
  window.setTimeout(() => {
    if (!state.drawerOpen) return;
    focusElement(getFocusable(drawer)[0] || drawer.querySelector(".drawer-close"));
  }, 30);
}

function closeDrawer({ restoreFocus = true } = {}) {
  if (!state.drawerOpen) return;
  state.drawerOpen = false;

  const drawer = $("drawer");
  const backdrop = $("drawer-backdrop");
  const button = $("menu-button");
  if (drawer && backdrop && button) {
    button.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    drawer.setAttribute("aria-hidden", "true");
    drawer.inert = true;
    drawer.setAttribute("inert", "");
    drawer.classList.remove("is-open");
    backdrop.classList.remove("is-open");
  }
  syncScrollLock();

  const token = ++state.drawerCloseToken;
  window.setTimeout(() => {
    if (!state.drawerOpen && token === state.drawerCloseToken && drawer && backdrop) {
      drawer.hidden = true;
      backdrop.hidden = true;
    }
  }, 240);

  if (restoreFocus && !state.activeSheetId) focusElement(state.lastFocusedDrawer);
}

/* ------------------------------- sheets -------------------------------- */

function openSheet(id) {
  const layer = $(id);
  if (!layer) return;
  if (state.activeSheetId === id) {
    focusElement(layer.querySelector("[data-autofocus]") || getFocusable(layer)[0]);
    return;
  }
  if (state.activeSheetId) closeSheet({ restoreFocus: false });
  if (state.drawerOpen) closeDrawer({ restoreFocus: false });

  state.lastFocusedSheet = document.activeElement;
  state.activeSheetId = id;
  layer.hidden = false;
  layer.removeAttribute("inert");
  layer.inert = false;
  layer.setAttribute("aria-hidden", "false");
  syncScrollLock();

  window.requestAnimationFrame(() => {
    if (state.activeSheetId === id) layer.classList.add("is-open");
  });
  window.setTimeout(() => {
    if (state.activeSheetId !== id) return;
    focusElement(layer.querySelector("[data-autofocus]") || getFocusable(layer)[0]);
  }, 30);
}

function stopPlayer() {
  const video = $("player-video");
  if (!video) return;
  try {
    video.pause();
    video.removeAttribute("src");
    video.load();
  } catch { /* ignore player teardown errors */ }
  state.playerName = null;
}

function closeSheet({ restoreFocus = true } = {}) {
  const id = state.activeSheetId;
  if (!id) return;
  const layer = $(id);
  state.activeSheetId = null;

  if (layer) {
    layer.classList.remove("is-open");
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;
    layer.setAttribute("inert", "");
  }
  if (id === "sheet-player") stopPlayer();
  syncScrollLock();

  const token = ++state.sheetCloseToken;
  window.setTimeout(() => {
    if (state.activeSheetId !== id && layer) layer.hidden = true;
  }, 240);

  if (restoreFocus) focusElement(state.lastFocusedSheet);
}

function openPlayer(name) {
  const asset = state.assets.find((item) => item.name === name);
  if (!asset) {
    showToast("Asset no longer exists. Refresh Assets.", "error");
    return;
  }
  const url = assetUrl(asset);
  const video = $("player-video");
  const title = $("player-title");
  const meta = $("player-meta");
  const link = $("player-open");
  if (!video || !title || !meta || !link) return;

  title.textContent = asset.name;
  meta.textContent = `${stageLabel(asset.stage)} · ${formatBytes(asset.size)} · ${formatDate(asset.mtime)}`;
  link.href = url;
  link.hidden = false;
  video.src = url;
  video.load();
  state.playerName = asset.name;
  openSheet("sheet-player");
  window.setTimeout(() => {
    const promise = video.play();
    if (promise && typeof promise.catch === "function") promise.catch(() => {});
  }, 120);
}

/* --------------------------- data + polling ---------------------------- */

async function refreshJobs({ quiet = true } = {}) {
  const seq = ++state.jobsSeq;
  try {
    const data = await api("/api/jobs");
    if (seq !== state.jobsSeq) return true;
    const previous = new Map(state.jobs.map((job) => [job.id, safeStatus(job.status)]));
    state.jobs = Array.isArray(data.jobs) ? data.jobs : [];

    let newlyDone = false;
    let newlyError = false;
    state.jobs.forEach((job) => {
      const before = previous.get(job.id);
      if (before && ACTIVE_STATUSES.has(before)) {
        if (job.status === "done") newlyDone = true;
        if (job.status === "error") newlyError = true;
      }
    });

    if (!state.selectedLogJob && state.jobs.length) state.selectedLogJob = state.jobs[0].id;
    if (state.selectedLogJob && !state.jobs.some((job) => job.id === state.selectedLogJob)) {
      state.selectedLogJob = state.jobs.length ? state.jobs[0].id : null;
    }

    renderAllJobViews();
    if (state.selectedLogJob) fetchJobDetail(state.selectedLogJob, { quiet: true }).catch(() => {});
    if (newlyDone || newlyError) fetchAssets({ quiet: true }).catch(() => {});
    if (newlyError && !quiet) showToast("A job failed. Open Logs for details.", "error");
    updatePolling();
    return true;
  } catch (err) {
    if (seq !== state.jobsSeq) return false;
    state.jobs = [];
    renderAllJobViews();
    updatePolling();
    if (!quiet) showToast(`Could not load jobs: ${err.message || err}`, "error");
    return false;
  }
}

function updatePolling() {
  const hasActive = state.jobs.some((job) => isActive(job.status));
  if (hasActive && !state.pollTimer) {
    state.pollTimer = window.setInterval(() => {
      refreshJobs({ quiet: true }).catch(() => {});
    }, 2000);
  } else if (!hasActive && state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function fetchJobDetail(id, { quiet = true } = {}) {
  if (!id) return false;
  const seq = ++state.logSeq;
  try {
    const job = await api(`/api/jobs/${encodeURIComponent(id)}`);
    if (seq !== state.logSeq || state.selectedLogJob !== id) return true;
    state.jobDetail = job;
    renderLogDetail();
    return true;
  } catch (err) {
    if (seq === state.logSeq && !quiet) {
      showToast(`Could not load log: ${err.message || err}`, "error");
    }
    return false;
  }
}

async function fetchAssets({ quiet = true } = {}) {
  const seq = ++state.assetsSeq;
  try {
    const data = await api("/api/assets");
    if (seq !== state.assetsSeq) return true;
    state.assets = Array.isArray(data.assets) ? data.assets : [];
    renderAssets();
    return true;
  } catch (err) {
    if (seq !== state.assetsSeq) return false;
    state.assets = [];
    renderAssets();
    if (!quiet) showToast(`Could not load assets: ${err.message || err}`, "error");
    return false;
  }
}

async function fetchSettings({ quiet = true } = {}) {
  try {
    const data = await api("/api/settings");
    state.settings = data;
    renderSettings();
    return true;
  } catch (err) {
    state.settings = null;
    renderSettings();
    if (!quiet) showToast(`Could not load settings: ${err.message || err}`, "error");
    return false;
  }
}

async function fetchAccount({ quiet = true } = {}) {
  try {
    state.account = await api("/api/account");
    state.accountCheck = null;
    renderAccount();
    return true;
  } catch (err) {
    state.account = null;
    renderAccount();
    if (!quiet) showToast(`Could not load account: ${err.message || err}`, "error");
    return false;
  }
}

async function checkAccount(button) {
  if (state.accountChecking) return;
  state.accountChecking = true;
  if (button) button.disabled = true;
  try {
    const data = await api("/api/account/check", { method: "POST" });
    state.account = pickAccount(data) || state.account;
    state.accountCheck = { ok: true, detail: data.detail || "Connection verified." };
    renderAccount();
    showToast("Qwen account verified.", "ok");
  } catch (err) {
    state.accountCheck = { ok: false, detail: err.message || String(err) };
    renderAccount();
    showToast(`Check failed: ${err.message || err}`, "error");
  } finally {
    state.accountChecking = false;
    if (button) button.disabled = false;
  }
}

async function disconnectAccount() {
  if (!window.confirm("Remove the saved Qwen cookie/token from config.json?")) return;
  try {
    const data = await api("/api/account", { method: "DELETE" });
    state.account = pickAccount(data) || state.account;
    state.accountCheck = null;
    renderAccount();
    showToast("Qwen credentials removed.", "ok");
    await fetchSettings({ quiet: true });
  } catch (err) {
    showToast(`Disconnect failed: ${err.message || err}`, "error");
  }
}

async function handleAccountSubmit(form) {
  const cookie = String(form.querySelector('[name="cookie"]')?.value || "").trim();
  const token = String(form.querySelector('[name="token"]')?.value || "").trim();
  if (!cookie && !token) {
    setStatusLine(form, "Paste a Cookie header or a token first.", "error");
    return;
  }
  setFormBusy(form, true);
  setStatusLine(form, "Validating with chat.qwen.ai…");
  try {
    const data = await api("/api/account", {
      method: "POST",
      body: JSON.stringify({ cookie, token }),
    });
    state.account = pickAccount(data) || state.account;
    state.accountCheck = { ok: true, detail: data.detail || "Connected." };
    form.reset();
    form.hidden = true;
    renderAccount();
    setStatusLine(form, "");
    showToast(data.detail || "Qwen account connected.", "ok");
    await fetchSettings({ quiet: true });
  } catch (err) {
    setStatusLine(form, `Failed: ${err.message || err}`, "error");
    showToast(`Connect failed: ${err.message || err}`, "error");
  } finally {
    setFormBusy(form, false);
  }
}

function pickAccount(data) {
  if (!data || typeof data !== "object") return null;
  const keys = ["configured", "connected", "source", "tokenPresent", "hasCookies", "cookieFields", "account", "lastChecked", "model", "envOverride"];
  const out = {};
  let found = false;
  for (const key of keys) {
    if (key in data) {
      out[key] = data[key];
      found = true;
    }
  }
  return found ? out : null;
}

function renderAccount() {
  const badge = $("account-indicator");
  const summary = $("account-summary");
  if (!badge || !summary) return;

  const a = state.account;
  const check = state.accountCheck;
  let label = "Not connected";
  let tone = "is-error";
  if (a === null) {
    label = "Unavailable";
  } else if (check && check.ok) {
    label = "Verified";
    tone = "is-ok";
  } else if (check && !check.ok) {
    label = "Rejected";
  } else if (a.configured) {
    label = "Configured";
    tone = "is-ok";
  }
  badge.className = `badge ${tone}`.trim();
  badge.innerHTML = `<span class="account-dot" aria-hidden="true"></span> ${esc(label)}`;

  const rows = [];
  if (!a) {
    rows.push(["Status", "Could not load /api/account"]);
  } else {
    rows.push(["Status", a.configured
      ? check && check.ok ? "Verified with chat.qwen.ai" : "Credentials saved (not checked yet)"
      : "No Qwen credentials saved"]);
    if (a.account) rows.push(["Account", a.account]);
    rows.push(["Source", a.source === "env" ? "environment variables" : a.source === "config" ? "config.json" : "—"]);
    rows.push(["Bearer token", a.tokenPresent ? "present" : "missing"]);
    rows.push(["Cookie header", a.hasCookies
      ? `${Array.isArray(a.cookieFields) ? a.cookieFields.length : 0} fields${a.cookieFields && a.cookieFields.length ? `: ${a.cookieFields.join(", ")}` : ""}`
      : "not set"]);
    rows.push(["Model", a.model || "qwen3.8-max"]);
    if (a.lastChecked) rows.push(["Last checked", a.lastChecked]);
    if (a.envOverride) rows.push(["Note", "QWEN_* environment variables override config.json"]);
  }
  if (check && check.detail) rows.push(["Result", check.detail]);

  summary.innerHTML = rows.map(([labelText, value]) => `
    <div class="account-row">
      <dt>${esc(labelText)}</dt>
      <dd>${esc(String(value))}</dd>
    </div>`).join("");

  const disconnect = document.querySelector('button[data-action="account-disconnect"]');
  if (disconnect) disconnect.disabled = !(a && a.configured);
}

function buildConnectBookmarklet() {
  const target = `${window.location.origin}/connect#p=`;
  const code = [
    "javascript:(async function(){try{",
    "var o={cookie:document.cookie||'',token:''};",
    "var keys=['token','access_token','active_token','qwen_token','qwen-token','auth_token'],i,k,v;",
    "for(i=0;i<keys.length;i++){k=keys[i];v=(localStorage.getItem(k)||sessionStorage.getItem(k)||'');if(v){o.token=v;break;}}",
    "if(!o.token){try{var st=localStorage.getItem('qwen_access_token_state');if(st){var sj=JSON.parse(st);o.token=(sj&&sj.token)||(sj&&sj.state&&sj.state.token)||'';}}catch(e){}}",
    "if(!o.token){for(i=0;i<localStorage.length;i++){k=localStorage.key(i)||'';if(/token/i.test(k)){v=localStorage.getItem(k)||'';if(v){o.token=v;break;}}}}",
    "o.token=String(o.token||'').replace(/^\"|\"$/g,'');",
    "if(!o.token){",
    "  try{",
    "    var r=await fetch('https://auth.qwen.ai/api/v2/auths/refresh',{method:'GET',credentials:'include',headers:{'Accept':'application/json','Version':'0.3.45','source':'web','X-Request-Id':(crypto.randomUUID?crypto.randomUUID():String(Date.now())),'Timezone':new Date().toString().replace(/\\s*\\(.+\\)$/,''),'x-request-origin':'https://chat.qwen.ai'}});",
    "    var j=await r.json(),d=j&&j.data;o.token=(d&&(d.access_token||d.token))||'';",
    "  }catch(e){}",
    "}",
    "if(!o.token){alert('Qwen token not found. Stay signed in on chat.qwen.ai and try again.');return;}",
    "var b=btoa(unescape(encodeURIComponent(JSON.stringify(o))));",
    `window.location.href=${JSON.stringify(target)}+encodeURIComponent(b);`,
    "}catch(e){alert('Qwen connect failed: '+e);}})();",
  ].join("");
  return code;
}

function installBookmarklet() {
  const link = $("account-bookmarklet");
  if (!link) return;
  const code = buildConnectBookmarklet();
  if (link.dataset.bound === "1") return;
  link.dataset.bound = "1";
  link.setAttribute("href", code);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showToast("Drag this button to the bookmarks bar, then click it on chat.qwen.ai.");
  });
}

async function copyBookmarklet() {
  try {
    await navigator.clipboard.writeText(buildConnectBookmarklet());
    showToast("Bookmarklet copied. Create a bookmark with it.", "ok");
  } catch {
    showToast("Clipboard unavailable. Open Settings on desktop Chrome.", "error");
  }
}

async function pasteCredentials() {
  const cookieEl = $("account-cookie");
  const tokenEl = $("account-token");
  try {
    const text = String((await navigator.clipboard.readText()) || "").trim();
    if (!text) {
      showToast("Clipboard is empty.", "error");
      return;
    }
    const looksLikeToken = text.length > 40 && !text.includes(";") && !text.includes("=");
    if (looksLikeToken && tokenEl) tokenEl.value = text;
    else if (cookieEl) cookieEl.value = text;
    showToast(`Pasted ${looksLikeToken ? "token" : "cookie header"}.`, "ok");
  } catch {
    showToast("Clipboard permission denied.", "error");
  }
}

async function refreshAll({ quiet = true } = {}) {
  const results = await Promise.all([
    refreshJobs({ quiet }),
    fetchAssets({ quiet }),
    fetchSettings({ quiet }),
    fetchAccount({ quiet }),
  ]);
  if (!quiet) {
    const ok = results.every(Boolean);
    showToast(ok ? "Refreshed." : "Refresh finished with warnings.", ok ? "ok" : "error");
  }
  return results;
}

/* ------------------------------- renderers ---------------------------- */

function updateStatusDot() {
  const dot = $("job-status-dot");
  if (!dot) return;
  const active = state.jobs.filter((job) => isActive(job.status));
  const latestError = state.jobs.find((job) => safeStatus(job.status) === "error");
  dot.className = "status-dot";
  if (active.length) {
    dot.classList.add("is-active");
    dot.setAttribute("aria-label", `${active.length} active job${active.length === 1 ? "" : "s"}`);
  } else if (latestError) {
    dot.classList.add("is-error");
    dot.setAttribute("aria-label", "Last job failed");
  } else {
    dot.setAttribute("aria-label", "No active jobs");
  }
}

function renderPipelineCounts() {
  const counts = {
    previs: { queued: 0, running: 0, done: 0 },
    qwen: { queued: 0, running: 0, done: 0 },
    render: { queued: 0, running: 0, done: 0 },
  };
  state.jobs.forEach((job) => {
    const type = String(job.type || "");
    const status = safeStatus(job.status);
    if (counts[type] && Object.prototype.hasOwnProperty.call(counts[type], status)) {
      counts[type][status] += 1;
    }
  });

  const labels = {
    previs: "Previs",
    qwen: "Generate",
    render: "Render",
  };
  Object.keys(counts).forEach((type) => {
    const el = $(`pipeline-${type}-counts`);
    if (el) {
      const c = counts[type];
      el.textContent = `${c.queued} queued · ${c.running} running · ${c.done} done`;
    }
    const button = document.querySelector(`button[data-filter="${type}"]`);
    if (button) button.setAttribute("aria-pressed", state.filter === type ? "true" : "false");
  });

  const total = $("pipeline-total");
  if (total) total.textContent = `${state.jobs.length} job${state.jobs.length === 1 ? "" : "s"}`;

  const filterLabel = $("active-filter-label");
  if (filterLabel) {
    filterLabel.textContent = state.filter
      ? `Filtered: ${labels[state.filter] || state.filter} · polling only while active`
      : "All stages · polling only while active";
  }
  const clear = document.querySelector('button[data-action="clear-filter"]');
  if (clear) clear.disabled = !state.filter;
}

function jobTitle(job) {
  const meta = job.meta || {};
  if (job.type === "qwen") return String(meta.prompt || "Qwen video").slice(0, 120);
  if (job.type === "previs") return String(meta.shotName || "Blender previs").slice(0, 120);
  if (job.type === "render") return String(meta.topic || meta.composition || "Remotion render").slice(0, 120);
  return "Worker job";
}

function renderJobCard(job, { compact = false } = {}) {
  const status = safeStatus(job.status);
  const progress = clampProgress(job.progress);
  const active = isActive(status);
  const output = outputHref(job);
  const logTail = Array.isArray(job.log) ? job.log.slice(-3).join("\n") : "";
  const created = formatDate(job.createdAt);
  const message = String(job.message || job.error || "").slice(0, 220);
  const badgeClass = `badge status-${status}`;
  const id = esc(job.id);
  const showLog = !compact || active || status === "error";

  return `
    <article class="job-card status-${status}">
      <div class="job-head">
        <div class="job-title">
          <strong>${typeIcon(job.type)} ${esc(jobTitle(job))}</strong>
          <span class="job-id">#${id} · ${esc(typeLabel(job.type))} · ${esc(created)} · ${progress}%</span>
        </div>
        <span class="${badgeClass}">${esc(status)}</span>
      </div>
      ${message ? `<p class="job-message">${esc(message)}</p>` : ""}
      <div class="progress-track" role="progressbar" aria-label="Job ${id} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
        <span class="progress-fill" style="width:${progress}%"></span>
      </div>
      ${showLog && logTail ? `<pre class="job-log">${esc(logTail)}</pre>` : ""}
      <div class="job-actions">
        <button class="btn btn-ghost" type="button" data-action="view-job-logs" data-id="${id}">View logs</button>
        ${active ? `<button class="btn btn-danger" type="button" data-action="cancel-job" data-id="${id}">Cancel</button>` : ""}
        ${output ? `<a class="btn btn-ghost link-button" href="${esc(output)}" target="_blank" rel="noopener">Open output</a>` : ""}
      </div>
    </article>`;
}

function renderActiveJobs() {
  const container = $("active-jobs");
  if (!container) return;
  const active = state.jobs.filter((job) => isActive(job.status));
  const errors = state.jobs.filter((job) => safeStatus(job.status) === "error").slice(0, 2);
  const combined = [...active, ...errors]
    .filter((job) => !state.filter || job.type === state.filter)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 8);

  if (!combined.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No active jobs${state.filter ? " for this stage" : ""}. Finished clips appear in Assets.</p>
        <a class="btn btn-primary" href="#generate" data-view="generate">Start Generate</a>
      </div>`;
    return;
  }
  container.innerHTML = combined.map((job) => renderJobCard(job)).join("");
}

function renderGenerateJobs() {
  const container = $("generate-jobs");
  if (!container) return;
  const jobs = state.jobs
    .filter((job) => job.type === "qwen")
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 8);
  if (!jobs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No Qwen jobs yet. Write a prompt above or use the quick sheet.</p>
        <button class="btn btn-primary" type="button" data-action="open-generation">New Generation</button>
      </div>`;
    return;
  }
  container.innerHTML = jobs.map((job) => renderJobCard(job, { compact: true })).join("");
}

function renderRenderJobs() {
  const container = $("render-jobs");
  if (!container) return;
  const jobs = state.jobs
    .filter((job) => job.type === "render")
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 8);
  if (!jobs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No final renders yet. Pick a source asset and start Remotion.</p>
        <a class="btn btn-ghost" href="#assets" data-view="assets">View assets</a>
      </div>`;
    return;
  }
  container.innerHTML = jobs.map((job) => renderJobCard(job, { compact: true })).join("");
}

function renderLogOptions() {
  const select = $("log-job-select");
  if (!select) return;
  if (!state.jobs.length) {
    state.selectedLogJob = null;
    select.innerHTML = '<option value="">No jobs yet</option>';
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = state.jobs.map((job) => {
    const selected = job.id === state.selectedLogJob ? " selected" : "";
    const label = `${typeLabel(job.type)} #${job.id} · ${safeStatus(job.status)} · ${formatDate(job.createdAt)}`;
    return `<option value="${esc(job.id)}"${selected}>${esc(label)}</option>`;
  }).join("");
  if (state.selectedLogJob) select.value = state.selectedLogJob;
}

function renderLogDetail() {
  const output = $("log-output");
  const meta = $("log-selected-meta");
  const badge = $("log-live-badge");
  const cancel = $("log-cancel");
  const selected = state.jobs.find((job) => job.id === state.selectedLogJob) || null;
  const job = state.jobDetail && state.jobDetail.id === state.selectedLogJob ? state.jobDetail : null;

  if (!job) {
    if (output) output.textContent = selected ? "Loading log…" : "No log loaded yet.";
    if (meta) meta.textContent = selected ? `Selected ${typeLabel(selected.type)} #${selected.id}` : "No job selected.";
    if (badge) {
      badge.textContent = "idle";
      badge.className = "badge";
    }
    if (cancel) cancel.disabled = true;
    return;
  }

  const status = safeStatus(job.status);
  const progress = clampProgress(job.progress);
  const active = isActive(status);
  if (output) {
    output.textContent = Array.isArray(job.log) && job.log.length ? job.log.join("\n") : "(no log lines yet)";
    output.scrollTop = output.scrollHeight;
  }
  if (meta) {
    meta.innerHTML = `
      <strong>#${esc(job.id)}</strong> · ${esc(typeLabel(job.type))} · ${esc(status)} · ${progress}%<br>
      Created ${esc(formatDate(job.createdAt))}${job.finishedAt ? ` · finished ${esc(formatDate(job.finishedAt))}` : ""}<br>
      ${job.output ? `Output: <code>${esc(job.output)}</code><br>` : ""}
      ${job.error ? `Error: <span style="color:var(--danger)">${esc(job.error)}</span><br>` : ""}
      Meta: <code>${esc(JSON.stringify(job.meta || {}))}</code>`;
  }
  if (badge) {
    badge.textContent = active ? "live" : status;
    badge.className = `badge status-${status}`;
  }
  if (cancel) cancel.disabled = !active;
}

function assetThumb(asset) {
  const url = `${assetUrl(asset)}#t=0.1`;
  return `
    <button class="asset-thumb" type="button" data-action="play-asset" data-name="${esc(asset.name)}" aria-label="Play ${esc(asset.name)}">
      <video src="${esc(url)}" muted preload="metadata" playsinline></video>
      <span class="thumb-label">${esc(asset.name)}<small>${esc(stageLabel(asset.stage))} · ${esc(formatBytes(asset.size))} · ${esc(formatDate(asset.mtime))}</small></span>
    </button>`;
}

function assetRow(asset) {
  const url = assetUrl(asset);
  const download = `${url}?download=1`;
  const isVideo = asset.kind === "video";
  const isImage = asset.kind === "image";
  const preview = isVideo
    ? `<div class="asset-preview"><video src="${esc(url)}#t=0.1" muted preload="metadata" playsinline></video></div>`
    : (isImage ? `<div class="asset-preview"><img src="${esc(url)}" alt="Preview of ${esc(asset.name)}"></div>` : "");

  return `
    <article class="asset-row">
      <div class="asset-row-head">
        <div class="asset-name">${isVideo ? "▶" : (isImage ? "▣" : "•")} ${esc(asset.name)}</div>
        <span class="badge">${esc(stageLabel(asset.stage))}</span>
      </div>
      <div class="asset-meta">${esc(formatBytes(asset.size))} · ${esc(formatDate(asset.mtime))} · ${esc(asset.kind)}</div>
      ${preview}
      <div class="asset-actions">
        ${isVideo ? `<button class="btn btn-ghost" type="button" data-action="play-asset" data-name="${esc(asset.name)}">Play fullscreen</button>` : ""}
        <a class="btn btn-ghost link-button" href="${esc(isVideo || isImage ? url : download)}" target="_blank" rel="noopener">Open</a>
        <a class="btn btn-ghost link-button" href="${esc(download)}" download>Download</a>
        <button class="btn btn-danger" type="button" data-action="delete-asset" data-name="${esc(asset.name)}">Delete</button>
      </div>
    </article>`;
}

function renderAssets() {
  const assets = [...state.assets].sort((a, b) => Number(b.mtimeMs || 0) - Number(a.mtimeMs || 0));
  const videos = assets.filter((asset) => asset.kind === "video");

  const recent = $("recent-assets");
  if (recent) {
    recent.innerHTML = videos.length
      ? videos.slice(0, 4).map(assetThumb).join("")
      : '<div class="empty-state" style="grid-column:1/-1"><p>No video assets yet. Generate or build a previs first.</p><a class="btn btn-primary" href="#generate" data-view="generate">Go to Generate</a></div>';
  }

  const list = $("assets-list");
  if (list) {
    list.innerHTML = assets.length
      ? assets.map(assetRow).join("")
      : '<div class="empty-state"><p>The renders/ directory is empty.</p><a class="btn btn-primary" href="#generate" data-view="generate">Go to Generate</a></div>';
  }

  const summary = $("assets-summary");
  if (summary) summary.textContent = assets.length
    ? `${assets.length} file${assets.length === 1 ? "" : "s"} · ${formatBytes(assets.reduce((sum, a) => sum + Number(a.size || 0), 0))} total`
    : "No files yet.";

  const count = $("assets-count");
  if (count) count.textContent = `${assets.length} file${assets.length === 1 ? "" : "s"}`;

  const select = $("render-asset");
  if (select) {
    const current = select.value;
    const options = ['<option value="">Animated backdrop (no asset)</option>'];
    assets.forEach((asset) => {
      options.push(`<option value="${esc(asset.name)}">${esc(asset.name)} · ${esc(formatBytes(asset.size))}</option>`);
    });
    select.innerHTML = options.join("");
    select.value = assets.some((asset) => asset.name === current) ? current : "";
  }
}

function renderSettings() {
  const grid = $("settings-grid");
  const s = state.settings || {};
  const rows = [
    ["BLENDER_BIN", s.blenderBin || "blender"],
    ["Resolved binary", s.resolvedBlenderBin || s.blenderBin || "blender"],
    ["Wrapper args", Array.isArray(s.resolvedBlenderPrefixArgs) && s.resolvedBlenderPrefixArgs.length ? s.resolvedBlenderPrefixArgs.join(" ") : "(none)"],
    ["Output dir", s.outputDir || "renders/"],
    ["Temp dir", s.tmpDir || "tmp/"],
    ["Video project", s.videoDir || "video/"],
    ["Movies export", s.moviesDir || "/storage/emulated/0/Movies"],
    ["Python worker", s.pythonBin || "python"],
    ["Port", s.port || 8090],
    ["Node", s.nodeVersion || "—"],
    ["Platform", s.platform || "—"],
    ["Max concurrent jobs", s.maxConcurrentJobs || 2],
    ["Qwen auth", s.qwenAuthConfigured ? "configured" : "not configured"],
    ["Render inside proot", s.renderInsideProot ? "yes" : "no"],
    ["Server version", s.version || "—"],
  ];
  if (grid) {
    grid.innerHTML = rows.map(([label, value]) => `
      <div class="setting-row">
        <dt>${esc(label)}</dt>
        <dd><code>${esc(String(value))}</code></dd>
      </div>`).join("");
  }

  const blenderBin = $("previs-blender-bin");
  if (blenderBin) blenderBin.textContent = s.blenderBin || "blender";
  const outputDir = $("previs-output-dir");
  if (outputDir) outputDir.textContent = s.outputDir || "renders/";
  const command = $("previs-command");
  if (command) {
    command.textContent = `${s.blenderBin || "blender"} -b --python-exit-code 1 -P previs_build.py -- tmp/shot_<id>.json <absolute-output.mp4>`;
  }
}

function renderBlenderTest() {
  const meta = $("blender-test-meta");
  const output = $("blender-test-output");
  const result = state.blenderTest;
  if (!result) {
    if (meta) meta.textContent = "No test run yet.";
    if (output) output.textContent = "Press “Test Blender” to check the resolved binary.";
    return;
  }
  const ok = Boolean(result.ok);
  if (meta) {
    meta.innerHTML = `
      <span class="badge ${ok ? "is-ok" : "is-error"}">${ok ? "ok" : "failed"}</span><br>
      <strong>Command:</strong> <code>${esc(result.command || "blender --version")}</code><br>
      <strong>Exit:</strong> ${esc(result.exitCode ?? "—")} · <strong>Duration:</strong> ${esc(result.durationMs ?? "—")} ms`;
  }
  if (output) output.textContent = String(result.output || "(no output)");
}

function renderAllJobViews() {
  updateStatusDot();
  renderPipelineCounts();
  renderActiveJobs();
  renderGenerateJobs();
  renderRenderJobs();
  renderLogOptions();
  renderLogDetail();
}

/* ------------------------------- actions ------------------------------- */

async function handleGenerateSubmit(form) {
  const promptEl = form.querySelector('[name="prompt"]');
  const prompt = String(promptEl?.value || "").trim();
  if (!prompt) {
    showToast("Enter a prompt first.", "error");
    focusElement(promptEl);
    return;
  }
  const aspectButton = form.querySelector('[data-aspect-group] button[aria-pressed="true"]');
  const aspectRatio = aspectButton?.dataset.aspect || "9:16";

  setFormBusy(form, true);
  setStatusLine(form, "Submitting Qwen job…");
  try {
    const data = await jsonPost("/api/qwen-video", { prompt, aspect_ratio: aspectRatio });
    setStatusLine(form, `Queued job #${data.jobId || "?"}`, "ok");
    showToast(`Qwen generation queued${data.jobId ? ` (#${data.jobId})` : ""}.`, "ok");
    if (promptEl) promptEl.value = "";
    if (form.closest(".sheet-layer")) closeSheet({ restoreFocus: false });
    await refreshJobs({ quiet: true });
  } catch (err) {
    setStatusLine(form, `Failed: ${err.message || err}`, "error");
    showToast(`Qwen job failed: ${err.message || err}`, "error");
  } finally {
    setFormBusy(form, false);
  }
}

async function handlePrevisSubmit(form) {
  const editor = $("previs-spec");
  const raw = String(editor?.value || "").trim();
  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (err) {
    setStatusLine(form, `Invalid JSON: ${err.message}`, "error");
    showToast("Shot spec must be valid JSON.", "error");
    return;
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    setStatusLine(form, "Shot spec must be a JSON object.", "error");
    return;
  }

  setFormBusy(form, true);
  setStatusLine(form, "Queueing Blender previs…");
  try {
    const data = await jsonPost("/api/previs", { shot_spec: spec });
    setStatusLine(form, `Queued job #${data.jobId || "?"}`, "ok");
    showToast(`Blender previs queued${data.jobId ? ` (#${data.jobId})` : ""}.`, "ok");
    await refreshJobs({ quiet: true });
  } catch (err) {
    setStatusLine(form, `Failed: ${err.message || err}`, "error");
    showToast(`Previs job failed: ${err.message || err}`, "error");
  } finally {
    setFormBusy(form, false);
  }
}

async function handleRenderSubmit(form) {
  const asset = String(form.querySelector('[name="asset"]')?.value || "");
  const topic = String(form.querySelector('[name="topic"]')?.value || "").trim();
  const imagePromptInput = String(form.querySelector('[name="imagePrompt"]')?.value || "").trim();
  const voice = String(form.querySelector('[name="voice"]')?.value || "");
  const music = Boolean(form.querySelector('[name="music"]')?.checked);
  const factsRaw = String(form.querySelector('[name="facts"]')?.value || "").trim();

  let facts = FALLBACK_FACTS;
  if (factsRaw) {
    try {
      const parsed = JSON.parse(factsRaw);
      if (!Array.isArray(parsed) || parsed.length !== 5) {
        throw new Error("facts must be a JSON array of exactly 5 items");
      }
      facts = parsed;
    } catch (err) {
      setStatusLine(form, `Invalid facts JSON: ${err.message}`, "error");
      showToast("Fix the facts JSON before rendering.", "error");
      return;
    }
  }

  const imagePrompt = imagePromptInput
    || (topic ? `cinematic documentary background of ${topic}, dramatic lighting, no text` : "");

  const body = {
    ...(asset ? { asset } : { facts }),
    ...(topic ? { topic } : {}),
    media: { voice: voice || false, music, imagePrompt },
  };

  setFormBusy(form, true);
  setStatusLine(form, "Queueing Remotion render with media prep…");
  try {
    const data = await jsonPost("/api/render", body);
    const id = data.jobId || data.id || "?";
    setStatusLine(form, `Queued render #${id}`, "ok");
    showToast(`Final render queued (#${id}).`, "ok");
    await refreshJobs({ quiet: true });
  } catch (err) {
    setStatusLine(form, `Failed: ${err.message || err}`, "error");
    showToast(`Render failed: ${err.message || err}`, "error");
  } finally {
    setFormBusy(form, false);
  }
}

function handleImageSubmit(form) {
  const input = form.querySelector('[name="prompt"]');
  const prompt = String(input?.value || "").trim();
  if (!prompt) {
    showToast("Enter an image prompt first.", "error");
    focusElement(input);
    return;
  }
  const img = $("image-preview");
  const link = $("image-open");
  const url = `/api/image?prompt=${encodeURIComponent(prompt)}&width=768&height=768`;
  if (!img || !link) return;
  img.alt = `Pollinations backdrop: ${prompt}`;
  img.src = url;
  img.hidden = false;
  link.href = url;
  link.hidden = false;
  showToast("Loading image preview…");
}

async function cancelJob(id) {
  if (!id) {
    showToast("No job selected.", "error");
    return;
  }
  try {
    await api(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    showToast(`Canceled job #${id}.`, "ok");
    await refreshJobs({ quiet: true });
    if (state.selectedLogJob === id) await fetchJobDetail(id, { quiet: true });
  } catch (err) {
    showToast(`Cancel failed: ${err.message || err}`, "error");
  }
}

async function deleteAsset(name) {
  if (!name) return;
  if (!window.confirm(`Delete ${name}? This removes the file from renders/.`)) return;
  try {
    await api(`/api/assets/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (state.playerName === name) closeSheet({ restoreFocus: false });
    showToast(`Deleted ${name}.`, "ok");
    await fetchAssets({ quiet: true });
  } catch (err) {
    showToast(`Delete failed: ${err.message || err}`, "error");
  }
}

async function testBlender(button) {
  setButtonBusy(button, true);
  const meta = $("blender-test-meta");
  const output = $("blender-test-output");
  if (meta) meta.textContent = "Running BLENDER_BIN --version…";
  if (output) output.textContent = "Waiting for Blender…";
  try {
    const result = await jsonPost("/api/blender-test", {});
    state.blenderTest = result;
    renderBlenderTest();
    showToast(result.ok ? "Blender is available." : "Blender test failed.", result.ok ? "ok" : "error");
  } catch (err) {
    state.blenderTest = {
      ok: false,
      command: "BLENDER_BIN --version",
      exitCode: null,
      durationMs: null,
      output: String(err.message || err),
    };
    renderBlenderTest();
    showToast(`Blender test failed: ${err.message || err}`, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

function previsLoadSample() {
  const editor = $("previs-spec");
  if (!editor) return;
  editor.value = JSON.stringify(DEFAULT_SHOT_SPEC, null, 2);
  setStatusLine($("previs-form"), "Sample shot spec loaded.", "ok");
}

function previsFormat() {
  const form = $("previs-form");
  const editor = $("previs-spec");
  if (!editor) return;
  try {
    editor.value = JSON.stringify(JSON.parse(editor.value), null, 2);
    setStatusLine(form, "JSON formatted.", "ok");
  } catch (err) {
    setStatusLine(form, `Invalid JSON: ${err.message}`, "error");
    showToast("Cannot format invalid JSON.", "error");
  }
}

async function handleAction(button) {
  const action = button.dataset.action;
  switch (action) {
    case "close-drawer":
      closeDrawer();
      break;
    case "close-sheet":
      closeSheet();
      break;
    case "open-generation":
      openSheet("sheet-generation");
      break;
    case "clear-filter":
      state.filter = null;
      renderPipelineCounts();
      renderActiveJobs();
      break;
    case "refresh-all":
      await refreshAll({ quiet: false });
      break;
    case "refresh-assets":
      await fetchAssets({ quiet: false });
      break;
    case "refresh-settings":
      await fetchSettings({ quiet: false });
      break;
    case "account-check":
      await checkAccount(button);
      break;
    case "account-connect-toggle": {
      const form = $("account-form");
      installBookmarklet();
      window.open("https://chat.qwen.ai/", "_blank", "noopener");
      if (form) {
        form.hidden = false;
        setStatusLine(form, "Sign in on the new tab, then run the bookmarklet or paste credentials.");
        focusElement($("account-cookie"));
      }
      break;
    }
    case "account-open-qwen":
      window.open("https://chat.qwen.ai/", "_blank", "noopener");
      break;
    case "account-copy-bookmarklet":
      await copyBookmarklet();
      break;
    case "account-paste-clipboard":
      await pasteCredentials();
      break;
    case "account-userscript":
      window.open("/qwen-connect.user.js", "_blank", "noopener");
      showToast("Install the script in Tampermonkey, then reload chat.qwen.ai.");
      break;
    case "account-connect-cancel": {
      const form = $("account-form");
      if (form) {
        form.hidden = true;
        form.reset();
        setStatusLine(form, "");
      }
      break;
    }
    case "account-disconnect":
      await disconnectAccount();
      break;
    case "test-blender":
      await testBlender(button);
      break;
    case "previs-sample":
      previsLoadSample();
      break;
    case "previs-format":
      previsFormat();
      break;
    case "log-refresh":
      await refreshJobs({ quiet: false });
      if (state.selectedLogJob) await fetchJobDetail(state.selectedLogJob, { quiet: false });
      break;
    case "log-cancel":
      await cancelJob(state.selectedLogJob);
      break;
    case "view-job-logs":
      state.selectedLogJob = button.dataset.id || null;
      renderLogOptions();
      renderLogDetail();
      navigate("logs");
      if (state.selectedLogJob) await fetchJobDetail(state.selectedLogJob, { quiet: true });
      break;
    case "cancel-job":
      await cancelJob(button.dataset.id);
      break;
    case "play-asset":
      openPlayer(button.dataset.name);
      break;
    case "delete-asset":
      await deleteAsset(button.dataset.name);
      break;
    default:
      break;
  }
}

/* ------------------------------- events -------------------------------- */

function handleClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const nav = target.closest("a[data-view]");
  if (nav) {
    event.preventDefault();
    navigate(nav.dataset.view);
    return;
  }

  const aspect = target.closest("button[data-aspect]");
  if (aspect) {
    const group = aspect.closest("[data-aspect-group]");
    if (group) {
      group.querySelectorAll("button[data-aspect]").forEach((button) => {
        button.setAttribute("aria-pressed", button === aspect ? "true" : "false");
      });
    }
    return;
  }

  const filter = target.closest("button[data-filter]");
  if (filter) {
    state.filter = state.filter === filter.dataset.filter ? null : filter.dataset.filter;
    renderPipelineCounts();
    renderActiveJobs();
    return;
  }

  const action = target.closest("button[data-action]");
  if (action) {
    event.preventDefault();
    handleAction(action).catch((err) => showToast(`Action failed: ${err.message || err}`, "error"));
  }
}

function handleSubmit(event) {
  const form = event.target;
  if (!form || form.tagName !== "FORM") return;
  if (form.matches("[data-generate-form]")) {
    event.preventDefault();
    handleGenerateSubmit(form).catch((err) => showToast(`Generate failed: ${err.message || err}`, "error"));
    return;
  }
  if (form.id === "previs-form") {
    event.preventDefault();
    handlePrevisSubmit(form).catch((err) => showToast(`Previs failed: ${err.message || err}`, "error"));
    return;
  }
  if (form.id === "render-form") {
    event.preventDefault();
    handleRenderSubmit(form).catch((err) => showToast(`Render failed: ${err.message || err}`, "error"));
    return;
  }
  if (form.id === "image-form") {
    event.preventDefault();
    handleImageSubmit(form);
    return;
  }
  if (form.id === "account-form") {
    event.preventDefault();
    handleAccountSubmit(form).catch((err) => showToast(`Connect failed: ${err.message || err}`, "error"));
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    if (state.activeSheetId) {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (state.drawerOpen) {
      event.preventDefault();
      closeDrawer();
      return;
    }
  }
  if (event.key === "Tab") {
    if (state.activeSheetId) {
      trapFocus(event, $(state.activeSheetId));
    } else if (state.drawerOpen) {
      trapFocus(event, $("drawer"));
    }
  }
}

function bindEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("keydown", handleKeydown);

  const menuButton = $("menu-button");
  if (menuButton) {
    menuButton.addEventListener("click", () => {
      if (state.drawerOpen) closeDrawer();
      else openDrawer();
    });
  }

  const logSelect = $("log-job-select");
  if (logSelect) {
    logSelect.addEventListener("change", () => {
      state.selectedLogJob = logSelect.value || null;
      state.jobDetail = null;
      renderLogDetail();
      if (state.selectedLogJob) fetchJobDetail(state.selectedLogJob, { quiet: false }).catch(() => {});
    });
  }

  const imagePreview = $("image-preview");
  if (imagePreview) {
    imagePreview.addEventListener("error", () => {
      imagePreview.hidden = true;
      const link = $("image-open");
      if (link) link.hidden = true;
      showToast("Image preview failed. Pollinations may be busy.", "error");
    });
  }

  const drawer = $("drawer");
  let touchX = 0;
  let touchY = 0;
  if (drawer) {
    drawer.addEventListener("touchstart", (event) => {
      if (!state.drawerOpen || event.touches.length !== 1) return;
      touchX = event.touches[0].clientX;
      touchY = event.touches[0].clientY;
    }, { passive: true });
    drawer.addEventListener("touchend", (event) => {
      if (!state.drawerOpen || !touchX || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchX;
      const dy = event.changedTouches[0].clientY - touchY;
      touchX = 0;
      touchY = 0;
      if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) closeDrawer();
    }, { passive: true });
  }

  window.addEventListener("hashchange", () => setView(viewFromHash(), { focus: false }));
  window.addEventListener("error", (event) => {
    event.preventDefault();
    showToast("Unexpected UI error. Refresh the page if it repeats.", "error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    showToast("A background request failed. Check Logs.", "error");
  });
}

function init() {
  bindEvents();
  setView(viewFromHash(), { focus: false });
  renderAssets();
  renderSettings();
  renderAccount();
  installBookmarklet();
  renderBlenderTest();
  renderAllJobViews();
  refreshAll({ quiet: true }).catch(() => showToast("Initial refresh failed.", "error"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  try {
    init();
  } catch (err) {
    showToast(`Startup failed: ${err.message || err}`, "error");
  }
}
