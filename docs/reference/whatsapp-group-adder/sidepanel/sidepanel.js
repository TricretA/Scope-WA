// sidepanel.js — UI controller: import → group → pacing → run.
import { parseFile, contactsFromRows, normalizePhone, validPhone } from "../lib/parse.js";

const $ = (id) => document.getElementById(id);

// Working state (durable copy lives in chrome.storage.local.job)
let imported = null; // { kind, headers?, rows?, contacts? }
let contacts = []; // normalized [{phone,name,raw}]
let groups = []; // fetched groups
let selectedGroup = null;

// ============================ CONNECTION ============================
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

// ============================ IMPORT ============================
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
  if (f) handleFile(f);
});
$("file").addEventListener("change", (ev) => {
  const f = ev.target.files?.[0];
  if (f) handleFile(f);
});
$("clearFile").addEventListener("click", resetImport);

function resetImport() {
  imported = null; contacts = [];
  $("file").value = "";
  $("importInfo").classList.add("hidden");
  $("csvCols").classList.add("hidden");
  ["groupCard", "paceCard", "runCard"].forEach((id) => ($(id).hidden = true));
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    imported = parseFile(file.name, String(reader.result));
    if (imported.kind === "csv") {
      if (!imported.headers.length) { alert("Couldn't read any columns from that CSV."); return; }
      setupCsvColumns();
    } else {
      contacts = imported.contacts;
      if (!contacts.length) { alert("No numbers found in that file."); return; }
      $("csvCols").classList.add("hidden");
    }
    renderImport(file);
    revealSteps();
  };
  reader.readAsText(file);
}

function setupCsvColumns() {
  $("csvCols").classList.remove("hidden");
  const opts = imported.headers.map((h) => `<option>${esc(h)}</option>`).join("");
  const phoneSel = $("phoneCol");
  const nameSel = $("nameCol");
  phoneSel.innerHTML = opts;
  nameSel.innerHTML = `<option value="">— none —</option>` + opts;
  const pg = imported.headers.find((h) => /phone|mobile|number|whatsapp|tel|cell|msisdn/i.test(h));
  if (pg) phoneSel.value = pg;
  const ng = imported.headers.find((h) => /name|first|full|contact/i.test(h));
  if (ng) nameSel.value = ng;
  rebuildCsvContacts();
  phoneSel.onchange = nameSel.onchange = rebuildCsvContacts;
}

function rebuildCsvContacts() {
  contacts = contactsFromRows(imported.rows, $("phoneCol").value, $("nameCol").value || null);
  renderPreviewTable();
}

function renderImport(file) {
  $("importInfo").classList.remove("hidden");
  renderPreviewTable(file);
}

function renderPreviewTable(file) {
  const valid = contacts.filter((c) => validPhone(c.phone)).length;
  const bad = contacts.length - valid;
  $("importSummary").innerHTML =
    `${contacts.length} contact${contacts.length === 1 ? "" : "s"} · ` +
    `<b style="color:var(--accent-2)">${valid} valid</b>` +
    (bad ? ` · <span style="color:var(--danger)">${bad} invalid</span>` : "");

  const tbl = $("previewTable");
  const head = "<tr><th>Name</th><th>Number → +254 applied</th><th>Status</th></tr>";
  const rows = contacts.slice(0, 5).map((c) => {
    const ok = validPhone(c.phone);
    const badge = ok ? `<span style="color:var(--accent-2)">ready</span>` : `<span style="color:var(--danger)">invalid</span>`;
    return `<tr><td>${esc(c.name || "—")}</td><td>+${esc(c.phone || c.raw)}</td><td>${badge}</td></tr>`;
  }).join("");
  tbl.innerHTML = head + rows;
  $("previewMore").textContent = contacts.length > 5 ? `+${contacts.length - 5} more` : "";
}

function revealSteps() {
  ["groupCard", "paceCard", "runCard"].forEach((id) => ($(id).hidden = false));
}

// ============================ GROUPS ============================
$("fetchGroups").addEventListener("click", fetchGroups);
$("groupSel").addEventListener("change", () => {
  const val = $("groupSel").value;
  selectedGroup = groups.find((g) => g.id === val) || null;
});

async function fetchGroups() {
  const conn = await chrome.runtime.sendMessage({ type: "GET_CONNECTION" });
  if (conn?.state !== "connected") {
    if (confirm("WhatsApp Web isn't connected. Open/focus it and log in, then click Fetch again.")) {
      await chrome.runtime.sendMessage({ type: "OPEN_WHATSAPP" });
    }
    return;
  }
  $("fetchGroups").textContent = "Fetching…";
  const res = await chrome.runtime.sendMessage({ type: "FETCH_GROUPS" });
  $("fetchGroups").textContent = "Fetch my groups ↻";
  const banner = $("groupBanner");
  const sel = $("groupSel");

  if (!res?.ok) {
    banner.classList.remove("hidden");
    banner.textContent = res?.error === "no-tab"
      ? "Open WhatsApp Web first (click the status pill)."
      : `Couldn't fetch groups: ${res?.error || "unknown"}.`;
    return;
  }

  if (res.via === "store" && res.groups.length) {
    groups = res.groups;
    banner.classList.add("hidden");
    sel.innerHTML = `<option value="">— select a group —</option>` +
      groups.map((g) => {
        const tag = g.admin ? "" : " (not admin)";
        const size = g.size ? ` · ${g.size}` : "";
        return `<option value="${esc(g.id)}"${g.admin ? "" : " disabled"}>${esc(g.name)}${size}${tag}</option>`;
      }).join("");
    return;
  }

  // Manual fallback: use the currently open chat as the target.
  banner.classList.remove("hidden");
  if (res.current) {
    groups = [res.current];
    sel.innerHTML = `<option value="__current__">Current open chat: ${esc(res.current.name)}</option>`;
    selectedGroup = res.current;
    banner.innerHTML = "Fast group list unavailable (WhatsApp internals changed). " +
      "<b>Fallback:</b> open the target group in WhatsApp Web, then it's selected above. " +
      "In this mode the group must stay open while adding.";
  } else {
    groups = [];
    sel.innerHTML = `<option value="">— none —</option>`;
    banner.innerHTML = "Couldn't list groups automatically. Open the target group in WhatsApp Web, " +
      "then click Fetch again to use it as the target.";
  }
}

// ============================ SETTINGS ============================
function readSettings() {
  return {
    minDelay: Math.max(10, +$("minDelay").value || 45),
    maxDelay: Math.max(11, +$("maxDelay").value || 90),
    batchSize: Math.max(0, +$("batchSize").value || 0),
    batchPause: Math.max(0, +$("batchPause").value || 0),
    dailyCap: Math.max(1, +$("dailyCap").value || 45),
    stopAfterFails: Math.max(2, +$("stopAfterFails").value || 3),
  };
}

function buildJobContacts() {
  return contacts.map((c) => {
    const ok = validPhone(c.phone);
    return {
      phone: c.phone, name: c.name,
      _status: ok ? "pending" : "skipped",
      _error: ok ? "" : "invalid/missing number",
    };
  });
}

async function saveJob() {
  const job = {
    status: "idle",
    group: selectedGroup ? { id: selectedGroup.id, name: selectedGroup.name } : null,
    contacts: buildJobContacts(),
    settings: readSettings(),
    currentIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ job });
  return job;
}

// ============================ RUN CONTROLS ============================
async function preflight() {
  if (!contacts.some((c) => validPhone(c.phone))) { alert("No valid contacts to add."); return false; }
  if (!selectedGroup) { alert("Fetch and select a target group first."); return false; }
  if (selectedGroup.admin === false) { alert("You're not an admin of that group — WhatsApp won't let you add people."); return false; }
  const conn = await chrome.runtime.sendMessage({ type: "GET_CONNECTION" });
  if (conn?.state !== "connected") {
    if (confirm("WhatsApp Web isn't connected. Open/focus it, log in, then press Start again.")) {
      await chrome.runtime.sendMessage({ type: "OPEN_WHATSAPP" });
    }
    return false;
  }
  return true;
}

$("startBtn").addEventListener("click", async () => {
  if (!(await preflight())) return;
  const n = contacts.filter((c) => validPhone(c.phone)).length;
  const manualNote = selectedGroup.id === "__current__"
    ? "\n\nManual mode: keep the group OPEN in WhatsApp Web the whole time."
    : "";
  if (!confirm(`Add ${n} contact${n === 1 ? "" : "s"} to "${selectedGroup.name}"?\n\nGo slow — this is ban-prone.${manualNote}`)) return;
  await saveJob();
  const res = await chrome.runtime.sendMessage({ type: "START_JOB" });
  if (!res?.ok) alert(res?.error || "Could not start.");
});

$("pauseBtn").addEventListener("click", async () => {
  const { job } = await chrome.storage.local.get("job");
  if (job) { job.status = "paused"; job.updatedAt = Date.now(); await chrome.storage.local.set({ job }); }
});
$("resumeBtn").addEventListener("click", async () => {
  if (!(await preflight())) return;
  const res = await chrome.runtime.sendMessage({ type: "START_JOB" });
  if (!res?.ok) alert(res?.error || "Could not resume.");
});
$("stopBtn").addEventListener("click", async () => {
  const { job } = await chrome.storage.local.get("job");
  if (job) { job.status = "stopped"; job.updatedAt = Date.now(); await chrome.storage.local.set({ job }); }
});

// ============================ LIVE PROGRESS ============================
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.job) renderRun(changes.job.newValue);
  if (changes.daily) renderDaily(changes.daily.newValue);
});

function renderRun(c) {
  if (!c) return;
  const running = c.status === "running";
  const paused = c.status === "paused";
  const stopped = c.status === "stopped";

  $("progressWrap").classList.toggle("hidden", !c.contacts?.length);
  $("logWrap").classList.toggle("hidden", !c.contacts?.length);

  const total = c.contacts.length;
  const by = (s) => c.contacts.filter((x) => x._status === s).length;
  const added = by("added"), invite = by("invite"), exists = by("exists"), fail = by("failed"), skip = by("skipped");
  const done = added + invite + exists + fail + skip;

  $("cAdded").textContent = added;
  $("cInvite").textContent = invite;
  $("cExists").textContent = exists;
  $("cFail").textContent = fail;
  $("cSkip").textContent = skip;
  $("cDone").textContent = done;
  $("cTotal").textContent = total;
  $("progressBar").style.width = total ? `${(done / total) * 100}%` : "0%";

  $("startBtn").disabled = running;
  $("pauseBtn").hidden = !running;
  $("resumeBtn").hidden = !((paused || stopped) && c.contacts.some((x) => x._status === "pending"));
  $("stopBtn").hidden = !(running || paused);

  const statusText = { running: "Adding…", paused: "Paused.", stopped: "Stopped.", done: "Finished.", idle: "" }[c.status] || "";
  $("statusLine").textContent = c._statusNote || statusText;

  const log = $("log");
  const meta = {
    added: ["li-added", "✓"], invite: ["li-invite", "✉"], exists: ["li-exists", "•"],
    failed: ["li-fail", "✕"], skipped: ["li-skip", "–"],
  };
  log.innerHTML = c.contacts
    .filter((x) => x._status !== "pending")
    .slice(-250).reverse()
    .map((x) => {
      const [cls, icon] = meta[x._status] || ["li-skip", "–"];
      const who = x.name ? `${esc(x.name)} · ` : "";
      const note = x._error ? ` — ${esc(x._error)}` : "";
      return `<div class="log-item ${cls}"><span class="li-icon">${icon}</span><span>${who}+${esc(x.phone)}${note}</span></div>`;
    })
    .join("");
}

function renderDaily(d) {
  const cap = readSettings().dailyCap;
  $("dailyCapLbl").textContent = cap;
  $("dailyCount").textContent = d && isToday(d.date) ? d.count : 0;
}
function isToday(dateStr) {
  const dt = new Date();
  const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return dateStr === key;
}

// ============================ REPORT ============================
$("downloadLog").addEventListener("click", async () => {
  const { job } = await chrome.storage.local.get("job");
  if (!job) return;
  const rows = [["name", "phone", "status", "note"]].concat(
    job.contacts.map((c) => [c.name || "", c.phone, c._status, c._error || ""])
  );
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wa-group-add-report.csv";
  a.click();
  URL.revokeObjectURL(url);
});

// ============================ RESTORE ============================
(async () => {
  const { job, daily } = await chrome.storage.local.get(["job", "daily"]);
  if (job?.contacts?.length) renderRun(job);
  renderDaily(daily);
})();

// ============================ util ============================
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
