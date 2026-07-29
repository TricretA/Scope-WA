// background.js — service worker: tab management, connection detection, campaign kickoff.
// The per-contact send loop lives in content/content.js and is driven by page reloads;
// this worker only orchestrates the WhatsApp tab and answers the side panel's queries.

const WA_URL = "https://web.whatsapp.com/";
const WA_MATCH = "https://web.whatsapp.com/*";

// Open the side panel when the toolbar icon is clicked.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.warn("[WABM] setPanelBehavior:", e));
});

// Find an existing WhatsApp Web tab, if any.
async function findWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: WA_MATCH });
  return tabs && tabs.length ? tabs[0] : null;
}

// Ask a tab's content script for its state. Returns null if the content script
// isn't there yet (tab still loading, or not a WA tab).
async function pingTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch (e) {
    return null;
  }
}

// Resolve overall connection status for the side panel's indicator.
async function getConnectionStatus() {
  const tab = await findWhatsAppTab();
  if (!tab) return { state: "no-tab" };
  const pong = await pingTab(tab.id);
  if (!pong) return { state: "loading", tabId: tab.id };
  // pong.login: "in" (chat UI ready) | "qr" (needs scan) | "loading"
  return { state: pong.login === "in" ? "connected" : pong.login === "qr" ? "qr" : "loading", tabId: tab.id };
}

// Ensure a focused WhatsApp Web tab exists; create one if needed. Returns the tab.
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

// Build the deep link that opens (or errors on) a specific number, with the
// message prefilled via the URL — the most reliable text-send path.
function sendDeepLink(phoneDigits, text) {
  let url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(phoneDigits)}`;
  if (text) url += `&text=${encodeURIComponent(text)}`;
  return url;
}

// Kick off a campaign: navigate the WA tab to the first pending contact.
// The content script picks up the running campaign from storage and drives the loop.
async function startCampaign() {
  const { campaign } = await chrome.storage.local.get("campaign");
  if (!campaign || !campaign.contacts || !campaign.contacts.length) {
    return { ok: false, error: "No contacts loaded." };
  }
  const firstIdx = campaign.contacts.findIndex((c) => c._status === "pending");
  if (firstIdx === -1) return { ok: false, error: "Nothing left to send." };

  const tab = await ensureWhatsAppTab();

  campaign.status = "running";
  campaign.currentIndex = firstIdx;
  campaign.tabId = tab.id;
  campaign.updatedAt = Date.now();
  await chrome.storage.local.set({ campaign });

  const first = campaign.contacts[firstIdx];
  await chrome.tabs.update(tab.id, { url: sendDeepLink(first._phone, first._message), active: true });
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
      case "START_CAMPAIGN":
        sendResponse(await startCampaign());
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
  return true; // async response
});
