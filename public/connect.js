"use strict";

const body = document.getElementById("connect-body");
const badge = document.getElementById("connect-badge");
const actions = document.getElementById("connect-actions");
const lead = document.getElementById("connect-lead");
const help = document.getElementById("connect-help");
const retry = document.getElementById("connect-retry");
const heading = document.querySelector(".view-header h1");

function decodePayload(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const padded = text + "=".repeat((4 - (text.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

function setState({ ok, label, title, message, retryable = false }) {
  if (badge) {
    badge.className = `badge ${ok ? "is-ok" : "is-error"}`;
    badge.innerHTML = `<span class="account-dot" aria-hidden="true"></span> ${label}`;
  }
  if (heading) heading.textContent = title;
  if (lead) lead.textContent = message;
  if (body) {
    body.innerHTML = "";
    const mark = document.createElement("div");
    mark.className = ok ? "connect-mark is-ok" : "connect-mark is-error";
    mark.textContent = ok ? "✓" : "!";
    const text = document.createElement("p");
    text.className = "muted";
    text.textContent = message;
    body.append(mark, text);
  }
  if (actions) actions.hidden = false;
  if (retry) retry.hidden = !retryable;
  if (ok && help) help.hidden = true;
}

async function save(payload) {
  try {
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cookie: typeof payload.cookie === "string" ? payload.cookie : "",
        token: typeof payload.token === "string" ? payload.token : "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState({
        ok: false,
        label: "Failed",
        title: "Connection failed",
        message: data.detail || data.error || `HTTP ${res.status}`,
        retryable: true,
      });
      return;
    }
    const who = data.account ? ` as ${data.account}` : "";
    setState({
      ok: true,
      label: "Verified",
      title: "Qwen connected",
      message: `${data.detail || "Credentials saved."}${who}`,
    });
    setTimeout(() => {
      window.location.href = "/#settings";
    }, 1600);
  } catch (err) {
    setState({
      ok: false,
      label: "Failed",
      title: "Local server error",
      message: String(err.message || err),
      retryable: true,
    });
  }
}

function start() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const payload = decodePayload(params.get("p") || params.get("payload"));
  if (window.location.hash) {
    history.replaceState(null, "", "/connect");
  }
  if (!payload || (!payload.token && !payload.cookie)) {
    setState({
      ok: false,
      label: "Waiting",
      title: "No token received",
      message: "Run the Connect Qwen bookmarklet on a signed-in chat.qwen.ai tab.",
      retryable: false,
    });
    return;
  }
  save(payload);
}

retry?.addEventListener("click", () => {
  window.location.href = "https://chat.qwen.ai/";
});

start();
