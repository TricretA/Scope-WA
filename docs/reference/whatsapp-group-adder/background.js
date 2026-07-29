// background.js — service worker. Orchestrates the WhatsApp tab, relays group
// fetches, and starts the add-job. The per-contact loop lives in content.js.

const WA_URL = "https://web.whatsapp.com/";
const WA_MATCH = "https://web.whatsapp.com/*";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.warn("[WAGA] setPanelBehavior:", e));
});

async function findWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: WA_MATCH });
  return tabs && tabs.length ? tabs[0] : null;
}

async function pingTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch (_) {
    return null;
  }
}

async function getConnectionStatus() {
  const tab = await findWhatsAppTab();
  if (!tab) return { state: "no-tab" };
  const pong = await pingTab(tab.id);
  if (!pong) return { state: "loading", tabId: tab.id };
  return {
    state: pong.login === "in" ? "connected" : pong.login === "qr" ? "qr" : "loading",
    tabId: tab.id,
  };
}

async function ensureWhatsAppTab() {
  let tab = await findWhatsAppTab();
  if (!tab) {
    tab = await chrome.tabs.create({ url: WA_URL, active: true });
  } else {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
  }
  return tab;
}

// Ask the content script for the group list (store-backed, else manual).
async function fetchGroups() {
  const tab = await findWhatsAppTab();
  if (!tab) return { ok: false, error: "no-tab" };
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "LIST_GROUPS" });
    return res || { ok: false, error: "no response" };
  } catch (e) {
    return { ok: false, error: "content script not ready — reload WhatsApp Web" };
  }
}

// Start (or resume) the job: mark running, stamp the tab, tell content to loop.
async function startJob() {
  const { job } = await chrome.storage.local.get("job");
  if (!job || !job.contacts || !job.contacts.length) {
    return { ok: false, error: "No contacts loaded." };
  }
  if (!job.group || !job.group.id) return { ok: false, error: "No target group selected." };
  const anyPending = job.contacts.some((c) => c._status === "pending");
  if (!anyPending) return { ok: false, error: "Nothing left to add." };

  const tab = await ensureWhatsAppTab();
  job.status = "running";
  job.tabId = tab.id;
  job.updatedAt = Date.now();
  await chrome.storage.local.set({ job });

  // Give the content script a moment if the tab was just created.
  setTimeout(() => chrome.tabs.sendMessage(tab.id, { type: "RUN_JOB" }).catch(() => {}), 1200);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case "GET_CONNECTION":
        sendResponse(await getConnectionStatus());
        break;
      case "OPEN_WHATSAPP": {
        const tab = await ensureWhatsAppTab();
        sendResponse({ ok: true, tabId: tab.id });
        break;
      }
      case "FETCH_GROUPS":
        sendResponse(await fetchGroups());
        break;
      case "START_JOB":
        sendResponse(await startJob());
        break;
      case "WHICH_TAB":
        sendResponse({ tabId: sender?.tab?.id ?? null });
        break;
      case "FOCUS_WHATSAPP": {
        const tab = await findWhatsAppTab();
        if (tab) {
          await chrome.tabs.update(tab.id, { active: true });
          if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
        }
        sendResponse({ ok: !!tab });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true;
});
