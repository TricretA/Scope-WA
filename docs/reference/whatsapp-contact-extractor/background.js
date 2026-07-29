// background.js — service worker. Finds/opens the WhatsApp tab and relays the
// group list + participant extraction requests from the side panel. All the
// heavy lifting (reading the Store) happens in the content scripts.

const WA_URL = "https://web.whatsapp.com/";
const WA_MATCH = "https://web.whatsapp.com/*";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.warn("[WACE] setPanelBehavior:", e));
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

async function extractGroup(groupId) {
  const tab = await findWhatsAppTab();
  if (!tab) return { ok: false, error: "no-tab" };
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT", groupId });
    return res || { ok: false, error: "no response" };
  } catch (e) {
    return { ok: false, error: "content script not ready — reload WhatsApp Web" };
  }
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
      case "EXTRACT_GROUP":
        sendResponse(await extractGroup(msg.groupId));
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
