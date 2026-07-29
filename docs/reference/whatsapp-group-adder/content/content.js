// content.js — runs inside web.whatsapp.com (ISOLATED world). Jobs:
//   1) Answer PING (login state) and LIST_GROUPS / RUN_JOB messages.
//   2) Drive the add-loop: step through the contact list, add each to the target
//      group, classify the result, honor pacing + daily cap + pause/stop.
//
// Unlike the bulk *sender* (which loops via page navigation), group-adding has no
// deep link, so the loop lives here in one page load and survives reloads by
// re-checking chrome.storage on load. State lives in chrome.storage.local.job.
//
// Two add paths:
//   • FAST: ask the MAIN-world bridge (wa-store.js) to call WhatsApp's internal
//     API — returns a precise status code. Preferred.
//   • DOM fallback: automate the group-info "Add member" UI. Requires the target
//     group to be the currently OPEN chat. Used when the bridge is unavailable.

const LOG = (...a) => console.log("%c[WAGA]", "color:#06cf9c", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SELECTORS = {
  appReady: ["#pane-side", '[data-testid="chat-list"]', '[aria-label="Chat list"]'],
  qr: ['[data-testid="qrcode"]', 'canvas[aria-label*="scan" i]', "div[data-ref]"],
  // group-info / add-member DOM fallback
  chatHeader: ['header [data-testid="conversation-info-header"]', "header div[role='button'][title]", "#main header"],
  addMemberBtn: [
    '[data-testid="menu-item-add-to-group"]',
    'div[role="button"][title="Add member" i]',
    'div[role="button"][aria-label="Add member" i]',
  ],
  memberSearch: [
    '[data-testid="chat-list-search"]',
    'div[contenteditable="true"][data-tab]',
    'input[type="text"]',
  ],
  resultRow: ['[data-testid="cell-frame-container"]', 'div[role="listitem"]', 'div[role="button"][tabindex]'],
  confirmArrow: ['[data-testid="add-participant-btn"]', 'span[data-icon="checkmark-medium"]', 'div[role="button"][aria-label*="add" i]'],
  dialog: ['[data-testid="popup-contents"]', 'div[role="dialog"]', 'div[data-animate-modal-body="true"]'],
};

function pick(list) {
  for (const sel of list) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}
function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
async function waitFor(list, timeout = 12000, interval = 250) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const el = pick(list);
    if (el && isVisible(el)) return el;
    await sleep(interval);
  }
  return null;
}

// Find a clickable element by matching its aria-label / title / visible text.
// WhatsApp has dropped most data-testids, so text matching is the durable path.
function findClickableByText(re) {
  const cands = document.querySelectorAll('div[role="button"], button, [aria-label], [title], span[data-icon]');
  for (const el of cands) {
    if (!isVisible(el)) continue;
    const hay = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.textContent || ""}`;
    if (re.test(hay)) return el.closest('div[role="button"], button') || el;
  }
  return null;
}
async function waitForText(re, timeout = 8000, interval = 250) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const el = findClickableByText(re);
    if (el) return el;
    await sleep(interval);
  }
  return null;
}

// ---------- login detection ----------
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
  if (!d || d.__waga !== "res") return;
  const resolve = bridgePending.get(d.id);
  if (resolve) {
    bridgePending.delete(d.id);
    resolve(d.payload);
  }
});
function bridge(action, extra = {}, timeout = 20000) {
  return new Promise((resolve) => {
    const id = ++bridgeReqId;
    bridgePending.set(id, resolve);
    window.postMessage({ __waga: "req", id, action, ...extra }, "*");
    setTimeout(() => {
      if (bridgePending.has(id)) {
        bridgePending.delete(id);
        resolve(null); // treat as unavailable
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
      sendResponse(await listGroups());
      return;
    }
    if (msg?.type === "RUN_JOB") {
      maybeRun();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false });
  })();
  return true;
});

// ---------- group listing ----------
async function listGroups() {
  const res = await bridge("LIST_GROUPS");
  if (res && res.available && Array.isArray(res.groups)) {
    return { ok: true, via: "store", groups: res.groups };
  }
  // Fallback: we can't reliably enumerate groups from the DOM, so offer the
  // currently open chat as the target if it looks like a group.
  const current = detectOpenGroup();
  return { ok: true, via: "manual", groups: [], current };
}

// Best-effort read of the currently open chat's title (used as manual target).
function detectOpenGroup() {
  const header = document.querySelector("#main header");
  if (!header) return null;
  const titleEl = header.querySelector('span[dir="auto"][title], span[dir="auto"]');
  const title = titleEl?.getAttribute("title") || titleEl?.textContent?.trim();
  if (!title) return null;
  return { id: "__current__", name: title, admin: true, manual: true };
}

// ---------- add one contact (fast path, else DOM) ----------
async function addContact(job, contact) {
  const realGroup = job.group?.id && job.group.id !== "__current__";
  // FAST path via bridge — attempt whenever the store is available and we have a
  // real group id (don't gate on canAdd; ADD itself reports if the API is missing).
  const probe = await bridge("PROBE", {}, 8000);
  LOG("probe →", probe);

  if (probe && probe.available && realGroup) {
    const r = await bridge("ADD", { groupId: job.group.id, phone: contact.phone }, 40000);
    LOG("store add result →", r);
    if (r && r.available && r.code !== "no-api") {
      return classifyCode(r.code, r.error);
    }
    // Store exists but has no usable add function → tell the user plainly.
    if (r && r.code === "no-api") {
      return { status: "failed", error: "internal add API not found — paste the [WAGA-store] probe report" };
    }
  }

  // DOM fallback (target group must be the currently OPEN chat).
  return await addViaDOM(contact);
}

// Map internal status code → our buckets.
function classifyCode(code, error) {
  const c = String(code);
  if (["200", "201", "0", "000", "ok", "success"].includes(c.toLowerCase())) return { status: "added" };
  if (c === "403") return { status: "invite", error: "privacy: can't add, needs invite" };
  if (c === "409") return { status: "exists", error: "already in group" };
  if (c === "404") return { status: "failed", error: "not on WhatsApp" };
  if (c === "408") return { status: "failed", error: "recently left — try later" };
  if (c === "error") return { status: "failed", error: error || "add failed" };
  if (c === "no-api") return { status: "failed", error: "add API unavailable" };
  // Unknown but not an obvious failure — treat as added optimistically but note it.
  return { status: "added", error: "code " + c };
}

// DOM automation: open group info → Add member → search number → pick → confirm.
// Requires the target group to be the currently OPEN chat.
async function addViaDOM(contact) {
  try {
    if (!pick(["#main"])) return { status: "failed", error: "open the target group in WhatsApp first" };

    // 1) Open the group-info panel by clicking the chat header title area.
    const header = document.querySelector("#main header");
    if (header) {
      const titleClick = header.querySelector('div[role="button"], span[dir="auto"]') || header;
      clickReal(titleClick);
    }

    // 2) Click "Add member" / "Add participant" (text/aria based).
    let addBtn = await waitForText(/add (member|participant)/i, 7000);
    if (!addBtn) {
      // Some layouts nest it behind a menu; try the panel's "..." menu once.
      const menu = findClickableByText(/^menu$|group settings/i);
      if (menu) { clickReal(menu); await sleep(600); addBtn = await waitForText(/add (member|participant)/i, 3000); }
    }
    if (!addBtn) {
      await closeOverlays();
      return { status: "failed", error: "‘Add member’ not found — is this a group you admin, and is it open?" };
    }
    clickReal(addBtn);

    // 3) Type the number into the member search box.
    const search =
      (await waitFor(['div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]'], 6000)) ||
      (await waitFor(['input[type="text"]'], 2000));
    if (!search) {
      await closeOverlays();
      return { status: "failed", error: "member search box not found" };
    }
    typeInto(search, contact.phone);
    await sleep(2000);

    if (dialogHas(/not on whatsapp|no results|no contacts found|couldn'?t find/i)) {
      await closeOverlays();
      return { status: "failed", error: "not on WhatsApp / not found" };
    }

    // 4) Click the first result row (a listitem inside the add panel).
    const row = await waitFor(['div[role="listitem"]', '[data-testid="cell-frame-container"]', 'div[role="button"][tabindex]'], 5000);
    if (!row) {
      await closeOverlays();
      return { status: "failed", error: "no matching contact row" };
    }
    clickReal(row);
    await sleep(600);

    // 5) Confirm (green checkmark / "Next" / add arrow), then any confirm dialog.
    const confirm =
      findClickableByText(/^(add|next|done|confirm)$/i) ||
      pick(['span[data-icon="checkmark-medium"]', 'span[data-icon="checkmark"]', 'div[role="button"][aria-label*="add" i]']);
    if (confirm) clickReal(confirm);
    await sleep(800);
    await clickDialogButton(/^add$/i);
    await sleep(1400);

    // 6) Classify any resulting dialog.
    if (dialogHas(/invite to group via link|couldn'?t be added|can'?t be added|not able to add/i)) {
      await closeOverlays();
      return { status: "invite", error: "privacy: needs invite link" };
    }
    if (dialogHas(/already (a )?(participant|member|in)/i)) {
      await closeOverlays();
      return { status: "exists", error: "already in group" };
    }
    if (dialogHas(/only admins|not an admin|don'?t have permission/i)) {
      await closeOverlays();
      return { status: "failed", error: "you're not an admin of this group" };
    }
    await closeOverlays();
    return { status: "added" };
  } catch (e) {
    await closeOverlays();
    return { status: "failed", error: String(e?.message || e) };
  }
}

function dialogHas(re) {
  const dlg = pick(SELECTORS.dialog);
  return !!(dlg && isVisible(dlg) && re.test(dlg.textContent || ""));
}
async function clickDialogButton(re) {
  const dlg = pick(SELECTORS.dialog);
  if (!dlg) return false;
  const btns = dlg.querySelectorAll('[role="button"], button');
  for (const b of btns) {
    if (re.test((b.textContent || "").trim())) {
      clickReal(b);
      return true;
    }
  }
  return false;
}
async function closeOverlays() {
  // Press Escape a couple of times to dismiss panels/dialogs.
  for (let i = 0; i < 3; i++) {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(200);
  }
}

function typeInto(el, text) {
  el.focus();
  try {
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
  } catch (_) {}
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
  document.execCommand("insertText", false, text);
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
}
function clickReal(el) {
  const target = el.closest('[role="button"], button') || el;
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}

// ---------- pacing ----------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function getDaily() {
  const { daily } = await chrome.storage.local.get("daily");
  if (daily && daily.date === todayKey()) return daily;
  const fresh = { date: todayKey(), count: 0 };
  await chrome.storage.local.set({ daily: fresh });
  return fresh;
}
async function bumpDaily() {
  const d = await getDaily();
  d.count += 1;
  await chrome.storage.local.set({ daily: d });
  return d.count;
}
function pickDelay(s, addedSoFar) {
  const min = Math.max(5, s.minDelay || 45);
  const max = Math.max(min + 1, s.maxDelay || 90);
  let ms = (min + Math.random() * (max - min)) * 1000;
  if (s.batchSize > 0 && s.batchPause > 0 && addedSoFar > 0 && addedSoFar % s.batchSize === 0) {
    ms += s.batchPause * 1000;
  }
  return Math.round(ms);
}

// ---------- the add loop ----------
let looping = false;
let myTabId = null;

async function currentTabId() {
  if (myTabId != null) return myTabId;
  try {
    const who = await chrome.runtime.sendMessage({ type: "WHICH_TAB" });
    myTabId = who?.tabId ?? null;
  } catch (_) {}
  return myTabId;
}

async function setNote(note) {
  const { job } = await chrome.storage.local.get("job");
  if (!job) return;
  job._statusNote = note;
  job.updatedAt = Date.now();
  await chrome.storage.local.set({ job });
}

async function maybeRun() {
  if (looping) return;
  const { job } = await chrome.storage.local.get("job");
  if (!job || job.status !== "running") return;
  const tid = await currentTabId();
  if (job.tabId != null && tid != null && job.tabId !== tid) {
    LOG("Not the active job tab; standing by.");
    return;
  }
  looping = true;
  try {
    await runLoop();
  } catch (e) {
    LOG("loop fatal", e);
  } finally {
    looping = false;
  }
}

async function runLoop() {
  // Wait for login.
  const loginStart = Date.now();
  while (detectLogin() !== "in" && Date.now() - loginStart < 60000) {
    if (detectLogin() === "qr") await setNote("Waiting for you to scan the QR…");
    await sleep(1000);
  }
  if (detectLogin() !== "in") {
    await setNote("Not logged in — stopped.");
    return;
  }

  let consecutiveFails = 0;

  while (true) {
    const { job } = await chrome.storage.local.get("job");
    if (!job || job.status !== "running") {
      LOG("Halted (status:", job?.status, ")");
      return;
    }
    const s = job.settings || {};

    // Daily cap.
    const daily = await getDaily();
    const cap = Math.max(1, s.dailyCap || 45);
    if (daily.count >= cap) {
      job.status = "paused";
      job._statusNote = `Daily cap reached (${daily.count}/${cap}). Resume tomorrow to protect your number.`;
      job.updatedAt = Date.now();
      await chrome.storage.local.set({ job });
      return;
    }

    // Next pending contact.
    const idx = job.contacts.findIndex((c) => c._status === "pending");
    if (idx === -1) {
      job.status = "done";
      job._statusNote = "All done ✓";
      job.updatedAt = Date.now();
      await chrome.storage.local.set({ job });
      return;
    }
    const contact = job.contacts[idx];
    LOG(`Adding ${idx + 1}/${job.contacts.length} → +${contact.phone} to ${job.group?.name}`);
    await setNote(`Adding ${contact.name || "+" + contact.phone}…`);

    let result;
    try {
      result = await addContact(job, contact);
    } catch (e) {
      result = { status: "failed", error: String(e?.message || e) };
    }

    // Persist result (re-read in case user paused/stopped mid-add).
    const { job: fresh } = await chrome.storage.local.get("job");
    if (!fresh) return;
    const c = fresh.contacts[idx];
    c._status = result.status;
    c._error = result.error || "";
    fresh.updatedAt = Date.now();
    await chrome.storage.local.set({ job: fresh });

    if (result.status === "added") {
      consecutiveFails = 0;
      await bumpDaily();
    } else if (result.status === "failed") {
      consecutiveFails += 1;
    } else {
      consecutiveFails = 0; // invite/exists aren't hard failures
    }

    // Stop-on-consecutive-failures guardrail.
    const failLimit = Math.max(2, s.stopAfterFails || 3);
    if (consecutiveFails >= failLimit) {
      const { job: j2 } = await chrome.storage.local.get("job");
      if (j2) {
        j2.status = "paused";
        j2._statusNote = `Paused after ${consecutiveFails} failures in a row — WhatsApp may be throttling. Check the last chat, then resume.`;
        j2.updatedAt = Date.now();
        await chrome.storage.local.set({ job: j2 });
      }
      return;
    }

    // Any pending left?
    const remaining = fresh.contacts.some((x) => x._status === "pending");
    if (!remaining) {
      fresh.status = "done";
      fresh._statusNote = "All done ✓";
      fresh.updatedAt = Date.now();
      await chrome.storage.local.set({ job: fresh });
      return;
    }

    // Wait (randomized, with batch pauses), checking for pause/stop.
    const addedSoFar = fresh.contacts.filter((x) => x._status === "added").length;
    const delay = pickDelay(s, addedSoFar);
    const wakeAt = Date.now() + delay;
    const todayCount = (await getDaily()).count;
    await setNote(`Waiting ~${Math.round(delay / 1000)}s · added ${addedSoFar} this run · ${todayCount}/${cap} today…`);
    while (Date.now() < wakeAt) {
      await sleep(1000);
      const { job: chk } = await chrome.storage.local.get("job");
      if (!chk || chk.status !== "running") {
        LOG("Halted during delay (status:", chk?.status, ")");
        return;
      }
    }
  }
}

// ---------- boot: resume a running job on (re)load ----------
(async () => {
  await sleep(1500);
  maybeRun().catch((e) => LOG("boot maybeRun", e));
})();
