// content.js — runs inside web.whatsapp.com (ISOLATED world). Jobs:
//   1) Answer PING (login state).
//   2) Relay LIST_GROUPS / EXTRACT requests to the MAIN-world bridge (wa-store.js)
//      which can read WhatsApp's internal Store; return the results.
//
// This extension is read-only — it never automates the UI or sends anything.

const LOG = (...a) => console.log("%c[WACE]", "color:#00a884", ...a);

const SELECTORS = {
  appReady: ["#pane-side", '[data-testid="chat-list"]', '[aria-label="Chat list"]'],
  qr: ['[data-testid="qrcode"]', 'canvas[aria-label*="scan" i]', "div[data-ref]"],
};

function pick(list) {
  for (const sel of list) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function detectLogin() {
  if (pick(SELECTORS.appReady)) return "in";
  if (pick(SELECTORS.qr)) return "qr";
  return "loading";
}

// ---------- MAIN-world bridge client ----------
let bridgeReqId = 0;
const bridgePending = new Map();
window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  const d = ev.data;
  if (!d || d.__wace !== "res") return;
  const resolve = bridgePending.get(d.id);
  if (resolve) {
    bridgePending.delete(d.id);
    resolve(d.payload);
  }
});
function bridge(action, extra = {}, timeout = 30000) {
  return new Promise((resolve) => {
    const id = ++bridgeReqId;
    bridgePending.set(id, resolve);
    window.postMessage({ __wace: "req", id, action, ...extra }, "*");
    setTimeout(() => {
      if (bridgePending.has(id)) {
        bridgePending.delete(id);
        resolve(null);
      }
    }, timeout);
  });
}

// ---------- message router ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "PING") {
      sendResponse({ login: detectLogin() });
      return;
    }
    if (msg?.type === "LIST_GROUPS") {
      const res = await bridge("LIST_GROUPS");
      if (res && res.available && Array.isArray(res.groups)) {
        sendResponse({ ok: true, groups: res.groups });
      } else {
        sendResponse({
          ok: false,
          error:
            (res && res.report && "WhatsApp internals not found — reload WhatsApp Web and wait for chats to load") ||
            "bridge unavailable — reload WhatsApp Web",
        });
      }
      return;
    }
    if (msg?.type === "EXTRACT") {
      const res = await bridge("EXTRACT", { groupId: msg.groupId }, 45000);
      if (res && res.available && res.ok) {
        sendResponse({ ok: true, groupId: res.groupId, groupName: res.groupName, members: res.members });
      } else {
        sendResponse({ ok: false, error: (res && res.error) || "extraction failed — reload WhatsApp Web" });
      }
      return;
    }
    sendResponse({ ok: false });
  })();
  return true;
});

LOG("content script ready · login:", detectLogin());
