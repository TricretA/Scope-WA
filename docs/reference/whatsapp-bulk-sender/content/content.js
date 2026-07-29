// content.js — runs inside web.whatsapp.com.
// Two jobs:
//   1) Answer PING with login state (used by the side panel's connection pill).
//   2) When a campaign is "running" and this page is a /send deep link, send ONE
//      message, record the result, wait a randomized delay, then navigate to the
//      next contact. Page reloads drive the loop; state lives in chrome.storage.
//
// ⚠ MAINTENANCE: WhatsApp obfuscates and changes its DOM. If sending breaks, the
// selectors in SELECTORS below are the first place to look. Each is a list of
// fallbacks tried in order.

const LOG = (...a) => console.log("%c[WABM]", "color:#06cf9c", ...a);

const SELECTORS = {
  appReady: ["#pane-side", '[data-testid="chat-list"]', '[aria-label="Chat list"]'],
  qr: ['[data-testid="qrcode"]', 'canvas[aria-label*="scan" i]', "div[data-ref]"],
  composeBox: [
    '[data-testid="conversation-compose-box-input"]',
    'footer div[contenteditable="true"][data-tab]',
    'div[contenteditable="true"][data-tab="10"]',
    'div[aria-label*="message" i][contenteditable="true"]',
  ],
  sendBtn: [
    '[data-testid="send"]',
    'span[data-icon="send"]',
    'span[data-icon="wds-ic-send-filled"]',
    'button[aria-label="Send"]',
    'div[role="button"][aria-label="Send"]',
  ],
  invalidPopup: ['[data-testid="popup-contents"]', 'div[role="dialog"]', 'div[data-animate-modal-body="true"]'],
  okButton: ['[data-testid="popup-controls-ok"]', 'div[role="button"]', "button"],
};

// ---------- tiny DOM helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pick(list) {
  for (const sel of list) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

async function waitFor(list, timeout = 20000, interval = 300) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const el = pick(list);
    if (el && isVisible(el)) return el;
    await sleep(interval);
  }
  return null;
}

function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Type text into a contenteditable in a way WhatsApp's editor registers.
function typeInto(el, text) {
  el.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.addRange(range);
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
  // insertText honors \n as line breaks inside WhatsApp's editor.
  document.execCommand("insertText", false, text);
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

// ---------- login detection ----------
function detectLogin() {
  if (pick(SELECTORS.appReady)) return "in";
  if (pick(SELECTORS.qr)) return "qr";
  return "loading";
}

// ---------- messaging: PING ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") sendResponse({ login: detectLogin() });
  return true;
});

// ---------- invalid-number detection ----------
function looksInvalid() {
  for (const sel of SELECTORS.invalidPopup) {
    const el = document.querySelector(sel);
    if (el && isVisible(el) && /invalid|not on whatsapp|isn't on whatsapp/i.test(el.textContent || "")) {
      return true;
    }
  }
  return false;
}

async function dismissPopup() {
  for (const sel of SELECTORS.invalidPopup) {
    const modal = document.querySelector(sel);
    if (!modal) continue;
    const btns = modal.querySelectorAll('[role="button"], button');
    for (const b of btns) {
      if (/^ok$/i.test((b.textContent || "").trim())) { b.click(); return; }
    }
    if (btns[0]) btns[0].click();
  }
}

// ---------- the send sequence for ONE contact ----------
async function sendCurrent(campaign, contact) {
  // Wait for either the compose box (chat ready) or an invalid-number popup.
  const start = Date.now();
  let ready = null;
  while (Date.now() - start < 30000) {
    if (looksInvalid()) { await dismissPopup(); return { ok: false, error: "number not on WhatsApp" }; }
    ready = pick(SELECTORS.composeBox);
    if (ready && isVisible(ready)) break;
    await sleep(300);
  }
  if (!ready) {
    if (looksInvalid()) return { ok: false, error: "number not on WhatsApp" };
    return { ok: false, error: "chat did not load (timeout)" };
  }

  // Let the UI settle.
  await sleep(600);

  // Text was prefilled via the deep link. Make sure it's actually there;
  // if WhatsApp didn't populate it, type it ourselves.
  const box = pick(SELECTORS.composeBox);
  if (box && !(box.textContent || "").trim() && contact._message) typeInto(box, contact._message);
  await sleep(300);
  const sendBtn = await waitFor(SELECTORS.sendBtn, 8000);
  if (!sendBtn) return { ok: false, error: "send button not found" };
  clickReal(sendBtn);

  // Confirm the compose box cleared (best-effort success signal).
  await sleep(1200);
  return { ok: true };
}

// A more trustworthy click: dispatch pointer + mouse events on the clickable ancestor.
function clickReal(el) {
  const target = el.closest('[role="button"], button') || el;
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}

// ---------- next-contact deep link ----------
function deepLink(phone, text) {
  let url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}`;
  if (text) url += `&text=${encodeURIComponent(text)}`;
  return url;
}

function pickDelay(s, sentCount) {
  const min = Math.max(2, s.minDelay || 8);
  const max = Math.max(min + 1, s.maxDelay || 20);
  let ms = (min + Math.random() * (max - min)) * 1000;
  if (s.batchSize > 0 && s.batchPause > 0 && sentCount > 0 && sentCount % s.batchSize === 0) {
    ms += s.batchPause * 1000;
  }
  return Math.round(ms);
}

// ---------- main loop step (once per page load) ----------
let handledThisLoad = false;

async function runStep() {
  if (handledThisLoad) return;

  const params = new URLSearchParams(location.search);
  const onSendPage = location.pathname === "/send" || params.has("phone");
  if (!onSendPage) return;

  const { campaign } = await chrome.storage.local.get("campaign");
  if (!campaign || campaign.status !== "running") return;

  // Only the designated tab drives the loop.
  try {
    const who = await chrome.runtime.sendMessage({ type: "WHICH_TAB" });
    if (who?.tabId != null && campaign.tabId != null && who.tabId !== campaign.tabId) {
      LOG("Not the active campaign tab; standing by.");
      return;
    }
  } catch {}

  const idx = campaign.currentIndex ?? 0;
  const contact = campaign.contacts[idx];
  if (!contact) return;

  handledThisLoad = true;
  LOG(`Sending ${idx + 1}/${campaign.contacts.length} → +${contact._phone}`);

  // Wait for login before doing anything.
  const loginStart = Date.now();
  while (detectLogin() !== "in" && Date.now() - loginStart < 60000) {
    if (detectLogin() === "qr") { await setNote(campaign, "Waiting for you to scan the QR…"); }
    await sleep(1000);
  }
  if (detectLogin() !== "in") { await setNote(campaign, "Not logged in — stopped."); return; }

  let result;
  try {
    result = await sendCurrent(campaign, contact);
  } catch (e) {
    LOG("send error", e);
    result = { ok: false, error: String(e?.message || e) };
  }
  LOG(`result → ${result.ok ? "SENT" : "FAILED"}${result.via ? " (" + result.via + ")" : ""}${result.error ? " — " + result.error : ""}`);

  // Re-read the latest campaign (user may have paused/stopped meanwhile).
  const { campaign: fresh } = await chrome.storage.local.get("campaign");
  if (!fresh) return;
  const c = fresh.contacts[idx];
  c._status = result.ok ? "sent" : "failed";
  c._error = result.ok ? "" : result.error || "unknown error";

  // Decide what's next.
  if (fresh.testMode) {
    fresh.status = "done";
    fresh._statusNote = "Test complete — check the chat, then Start when ready.";
    fresh.updatedAt = Date.now();
    await chrome.storage.local.set({ campaign: fresh });
    return;
  }

  const nextIdx = fresh.contacts.findIndex((x, i) => i > idx && x._status === "pending");
  if (nextIdx === -1) {
    fresh.status = "done";
    fresh._statusNote = "All done ✓";
    fresh.updatedAt = Date.now();
    await chrome.storage.local.set({ campaign: fresh });
    return;
  }

  const sentSoFar = fresh.contacts.filter((x) => x._status === "sent").length;
  const delay = pickDelay(fresh.settings || {}, sentSoFar);
  fresh.currentIndex = nextIdx;
  fresh._statusNote = `Waiting ~${Math.round(delay / 1000)}s, then contact ${nextIdx + 1}/${fresh.contacts.length}…`;
  fresh.updatedAt = Date.now();
  await chrome.storage.local.set({ campaign: fresh });

  await sleep(delay);

  // Final status check before navigating (pause/stop honored here).
  const { campaign: check } = await chrome.storage.local.get("campaign");
  if (!check || check.status !== "running") {
    LOG("Halted before next contact (status:", check?.status, ")");
    return;
  }
  const nc = check.contacts[nextIdx];
  location.href = deepLink(nc._phone, nc._message);
}

async function setNote(campaign, note) {
  const { campaign: fresh } = await chrome.storage.local.get("campaign");
  if (!fresh) return;
  fresh._statusNote = note;
  await chrome.storage.local.set({ campaign: fresh });
}

// Kick off once the page has had a moment to render.
(async () => {
  await sleep(1200);
  runStep().catch((e) => LOG("runStep fatal", e));
})();
