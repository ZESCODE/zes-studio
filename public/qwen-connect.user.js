// ==UserScript==
// @name         ZES Studio Qwen Connect
// @namespace    __ZES_ORIGIN__/
// @version      1.0.0
// @description  Send the signed-in Qwen token to your local ZES Studio server.
// @match        https://chat.qwen.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";
  const TARGET = "__ZES_ORIGIN__/connect#p=";

  function findToken() {
    const keys = ["token", "access_token", "active_token", "qwen_token", "qwen-token", "auth_token"];
    for (const key of keys) {
      const value = localStorage.getItem(key) || sessionStorage.getItem(key) || "";
      if (value) return value;
    }
    try {
      const state = JSON.parse(localStorage.getItem("qwen_access_token_state") || "null");
      const value = (state && state.token) || (state && state.state && state.state.token) || "";
      if (value) return value;
    } catch (e) { /* ignore */ }
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || "";
      if (/token/i.test(key)) {
        const value = localStorage.getItem(key) || "";
        if (value) return value;
      }
    }
    return "";
  }

  function connect(button) {
    const token = String(findToken() || "").replace(/^"|"$/g, "");
    if (!token) {
      alert("No Qwen token found. Make sure chat.qwen.ai is signed in and fully loaded, then tap again.");
      return;
    }
    button.textContent = "Sending…";
    const payload = { token, cookie: document.cookie || "" };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    window.location.href = TARGET + encodeURIComponent(encoded);
  }

  function install() {
    if (document.getElementById("zes-qwen-connect")) return;
    const button = document.createElement("button");
    button.id = "zes-qwen-connect";
    button.type = "button";
    button.textContent = "Connect ZES Studio";
    button.style.cssText = [
      "position:fixed", "right:14px", "bottom:86px", "z-index:2147483647",
      "padding:10px 14px", "border-radius:999px", "border:1px solid #4f8cff",
      "background:#1d4ed8", "color:#fff", "font:600 13px/1.2 system-ui,sans-serif",
      "box-shadow:0 8px 24px rgba(0,0,0,.35)", "cursor:pointer",
    ].join(";");
    button.addEventListener("click", () => connect(button));
    document.body.appendChild(button);
  }

  install();
  setInterval(install, 3000);
})();
