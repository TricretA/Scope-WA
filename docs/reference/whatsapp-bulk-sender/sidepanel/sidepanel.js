// sidepanel.js — UI controller: CSV → template → pacing → run.
import { parseCSV } from "../lib/csv.js";
import { render, extractVars } from "../lib/template.js";

const $ = (id) => document.getElementById(id);

// ---- In-memory working state (the durable copy lives in chrome.storage.local) ----
let data = { headers: [], rows: [] };

// ============================ CONNECTION STATUS ============================
async function refreshConnection() {
  let status;
  try {
    status = await chrome.runtime.sendMessage({ type: "GET_CONNECTION" });
  } catch {
    status = { state: "no-tab" };
  }
  const pill = $("connPill");
  const text = $("connText");
  pill.className = "pill";
  switch (status?.state) {
    case "connected": pill.classList.add("pill-connected"); text.textContent = "WhatsApp connected"; break;
    case "qr":        pill.classList.add("pill-qr");        text.textContent = "Scan QR to log in"; break;
    case "loading":   pill.classList.add("pill-loading");  text.textContent = "WhatsApp loading…"; break;
    default:          pill.classList.add("pill-notab");     text.textContent = "Open WhatsApp Web"; break;
  }
}
$("connPill").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "OPEN_WHATSAPP" });
  setTimeout(refreshConnection, 800);
});
setInterval(refreshConnection, 3000);
refreshConnection();

// ============================ CSV UPLOAD ============================
const dropzone = $("dropzone");
["dragover", "dragenter"].forEach((e) =>
  dropzone.addEventListener(e, (ev) => { ev.preventDefault(); dropzone.classList.add("drag"); })
);
["dragleave", "drop"].forEach((e) =>
  dropzone.addEventListener(e, () => dropzone.classList.remove("drag"))
);
dropzone.addEventListener("drop", (ev) => {
  ev.preventDefault();
  const f = ev.dataTransfer?.files?.[0];
  if (f) handleCsvFile(f);
});
$("csvFile").addEventListener("change", (ev) => {
  const f = ev.target.files?.[0];
  if (f) handleCsvFile(f);
});
$("clearCsv").addEventListener("click", () => {
  data = { headers: [], rows: [] };
  $("csvFile").value = "";
  $("csvInfo").classList.add("hidden");
  $("phoneCard").hidden = $("msgCard").hidden = true;
  $("paceCard").hidden = $("runCard").hidden = true;
});

function handleCsvFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    data = parseCSV(String(reader.result));
    if (!data.headers.length) { alert("Couldn't read any columns from that CSV."); return; }
    renderPreview(file);
    populateColumns();
    revealSteps();
    updateTemplatePreview();
  };
  reader.readAsText(file);
}

function renderPreview(file) {
  $("csvInfo").classList.remove("hidden");
  $("csvSummary").textContent = `${file.name} — ${data.rows.length} contacts, ${data.headers.length} columns`;
  const tbl = $("previewTable");
  const head = "<tr>" + data.headers.map((h) => `<th>${esc(h)}</th>`).join("") + "</tr>";
  const rows = data.rows.slice(0, 3)
    .map((r) => "<tr>" + data.headers.map((h) => `<td>${esc(r[h] ?? "")}</td>`).join("") + "</tr>")
    .join("");
  tbl.innerHTML = head + rows;
  $("previewMore").textContent = data.rows.length > 3 ? `+${data.rows.length - 3} more` : "";
}

function populateColumns() {
  const sel = $("phoneCol");
  sel.innerHTML = data.headers.map((h) => `<option>${esc(h)}</option>`).join("");
  // Best-guess the phone column.
  const guess = data.headers.find((h) => /phone|mobile|number|whatsapp|tel|cell/i.test(h));
  if (guess) sel.value = guess;
  updatePhoneStats();

  const chips = $("varChips");
  chips.innerHTML = "";
  data.headers.forEach((h) => {
    const c = document.createElement("button");
    c.className = "chip";
    c.textContent = `{{${h}}}`;
    c.addEventListener("click", () => insertAtCursor($("template"), `{{${h}}}`));
    chips.appendChild(c);
  });
}

function revealSteps() {
  ["phoneCard", "msgCard", "paceCard", "runCard"].forEach((id) => ($(id).hidden = false));
}

// ============================ PHONE HANDLING ============================
// Normalize to the digits-only form WhatsApp's deep link expects (drops +, spaces, dashes).
function normalizePhone(raw) {
  if (!raw) return "";
  let s = String(raw).trim().replace(/[^\d+]/g, "");
  s = s.replace(/(?!^)\+/g, ""); // keep only a leading +
  return s.replace(/\+/g, "");   // deep link wants bare digits
}
function validPhone(raw) {
  const d = normalizePhone(raw);
  return d.length >= 8 && d.length <= 15;
}
function updatePhoneStats() {
  const col = $("phoneCol").value;
  const good = data.rows.filter((r) => validPhone(r[col])).length;
  const bad = data.rows.length - good;
  $("phoneStats").innerHTML =
    `<b>${good}</b> valid number${good === 1 ? "" : "s"}` +
    (bad ? ` · <span style="color:var(--danger)">${bad} will be skipped</span> (missing or too short — needs country code)` : "");
}
$("phoneCol").addEventListener("change", () => { updatePhoneStats(); updateTemplatePreview(); });

// ============================ TEMPLATE ============================
function insertAtCursor(el, text) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  el.focus();
  el.selectionStart = el.selectionEnd = s + text.length;
  el.dispatchEvent(new Event("input"));
}
$("template").addEventListener("input", () => { updateTemplatePreview(); persistDraft(); });

function updateTemplatePreview() {
  const tpl = $("template").value;
  const firstValid = data.rows.find((r) => validPhone(r[$("phoneCol").value])) || data.rows[0];
  if (!firstValid || !tpl) { $("msgPreview").textContent = tpl || "—"; return; }
  const { text } = render(tpl, firstValid);
  $("msgPreview").textContent = text || "—";
}

// ============================ BUILD CAMPAIGN ============================
function buildContacts() {
  const col = $("phoneCol").value;
  const tpl = $("template").value;
  return data.rows.map((r) => {
    const phone = normalizePhone(r[col]);
    if (!validPhone(r[col])) {
      return { _phone: phone, _message: "", _status: "skipped", _error: "invalid/missing number", vars: r };
    }
    const { text } = render(tpl, r);
    return { _phone: phone, _message: text, _status: "pending", _error: "", vars: r };
  });
}

function readSettings() {
  return {
    minDelay: Math.max(2, +$("minDelay").value || 8),
    maxDelay: Math.max(3, +$("maxDelay").value || 20),
    batchSize: Math.max(0, +$("batchSize").value || 0),
    batchPause: Math.max(0, +$("batchPause").value || 0),
  };
}

async function saveCampaign(extra = {}) {
  const contacts = buildContacts();
  const campaign = {
    status: "idle",
    contacts,
    settings: readSettings(),
    testMode: false,
    currentIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...extra,
  };
  await chrome.storage.local.set({ campaign });
  return campaign;
}

// ============================ RUN CONTROLS ============================
async function preflight() {
  if (!$("template").value.trim()) { alert("Write a message first."); return false; }
  const conn = await chrome.runtime.sendMessage({ type: "GET_CONNECTION" });
  if (conn?.state !== "connected") {
    const go = confirm(
      "WhatsApp Web isn't connected yet.\n\nClick OK to open/focus it — log in (scan the QR) if needed, then press Start again."
    );
    if (go) await chrome.runtime.sendMessage({ type: "OPEN_WHATSAPP" });
    return false;
  }
  return true;
}

$("testBtn").addEventListener("click", async () => {
  if (!(await preflight())) return;
  await saveCampaign({ testMode: true });
  const res = await chrome.runtime.sendMessage({ type: "START_CAMPAIGN" });
  if (!res?.ok) alert(res?.error || "Could not start.");
});

$("startBtn").addEventListener("click", async () => {
  if (!(await preflight())) return;
  const contacts = buildContacts();
  const sendable = contacts.filter((c) => c._status === "pending").length;
  if (!sendable) { alert("No valid contacts to send to."); return; }
  if (!confirm(`Send to ${sendable} contact${sendable === 1 ? "" : "s"}? Keep this WhatsApp tab open while it runs.`)) return;
  await saveCampaign({ testMode: false });
  const res = await chrome.runtime.sendMessage({ type: "START_CAMPAIGN" });
  if (!res?.ok) alert(res?.error || "Could not start.");
});

$("pauseBtn").addEventListener("click", async () => {
  const { campaign } = await chrome.storage.local.get("campaign");
  if (campaign) { campaign.status = "paused"; campaign.updatedAt = Date.now(); await chrome.storage.local.set({ campaign }); }
});
$("resumeBtn").addEventListener("click", async () => {
  if (!(await preflight())) return;
  const res = await chrome.runtime.sendMessage({ type: "START_CAMPAIGN" });
  if (!res?.ok) alert(res?.error || "Could not resume.");
});
$("stopBtn").addEventListener("click", async () => {
  const { campaign } = await chrome.storage.local.get("campaign");
  if (campaign) { campaign.status = "stopped"; campaign.updatedAt = Date.now(); await chrome.storage.local.set({ campaign }); }
});

// ============================ LIVE PROGRESS (via storage events) ============================
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.campaign) renderRun(changes.campaign.newValue);
});

function renderRun(c) {
  if (!c) return;
  const running = c.status === "running";
  const paused = c.status === "paused";
  const active = running || paused;

  $("progressWrap").classList.toggle("hidden", !c.contacts?.length);
  $("logWrap").classList.toggle("hidden", !c.contacts?.length);

  const total = c.contacts.length;
  const sent = c.contacts.filter((x) => x._status === "sent").length;
  const fail = c.contacts.filter((x) => x._status === "failed").length;
  const skip = c.contacts.filter((x) => x._status === "skipped").length;
  const done = sent + fail + skip;

  $("cSent").textContent = sent;
  $("cFail").textContent = fail;
  $("cSkip").textContent = skip;
  $("cDone").textContent = done;
  $("cTotal").textContent = total;
  $("progressBar").style.width = total ? `${(done / total) * 100}%` : "0%";

  // Button visibility
  $("startBtn").disabled = running;
  $("testBtn").disabled = running;
  $("pauseBtn").hidden = !running;
  $("resumeBtn").hidden = !(paused || (c.status === "stopped" && done < total));
  $("stopBtn").hidden = !active;

  const statusText = {
    running: "Sending…", paused: "Paused.", stopped: "Stopped.",
    done: "Finished.", idle: "",
  }[c.status] || "";
  $("statusLine").textContent = c._statusNote || statusText;

  // Log (most recent first)
  const log = $("log");
  log.innerHTML = c.contacts
    .filter((x) => x._status !== "pending")
    .slice(-200).reverse()
    .map((x) => {
      const cls = x._status === "sent" ? "li-sent" : x._status === "failed" ? "li-fail" : "li-skip";
      const icon = x._status === "sent" ? "✓" : x._status === "failed" ? "✕" : "–";
      const who = x.vars && (x.vars.name || x.vars.Name) ? `${esc(x.vars.name || x.vars.Name)} · ` : "";
      const note = x._error ? ` — ${esc(x._error)}` : "";
      return `<div class="log-item ${cls}"><span class="li-icon">${icon}</span><span>${who}+${esc(x._phone)}${note}</span></div>`;
    })
    .join("");
}

// ============================ DOWNLOAD REPORT ============================
$("downloadLog").addEventListener("click", async () => {
  const { campaign } = await chrome.storage.local.get("campaign");
  if (!campaign) return;
  const rows = [["phone", "status", "error", "message"]].concat(
    campaign.contacts.map((c) => [c._phone, c._status, c._error || "", (c._message || "").replace(/\n/g, " ")])
  );
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wa-bulk-report.csv";
  a.click();
  URL.revokeObjectURL(url);
});

// ============================ DRAFT PERSISTENCE ============================
async function persistDraft() {
  await chrome.storage.local.set({
    draft: { template: $("template").value, settings: readSettings() },
  });
}
["minDelay", "maxDelay", "batchSize", "batchPause"].forEach((id) =>
  $(id).addEventListener("change", persistDraft)
);

async function restoreDraft() {
  const { draft, campaign } = await chrome.storage.local.get(["draft", "campaign"]);
  if (draft) {
    if (draft.template) $("template").value = draft.template;
    if (draft.settings) {
      $("minDelay").value = draft.settings.minDelay;
      $("maxDelay").value = draft.settings.maxDelay;
      $("batchSize").value = draft.settings.batchSize;
      $("batchPause").value = draft.settings.batchPause;
    }
  }
  if (campaign?.contacts?.length) renderRun(campaign);
}
restoreDraft();

// ============================ util ============================
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
