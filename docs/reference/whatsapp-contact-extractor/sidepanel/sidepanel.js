// sidepanel.js — the extension's UI. Talks to the service worker (background.js)
// which relays to the content scripts. Flow: fetch groups → pick → extract →
// filter (live) → preview → export.
import {
  FIELDS, SLIM_FIELDS, ALL_FIELDS,
  toCSV, toTXT, toJSON, toVCF, toXLSX, download,
} from "../lib/exporters.js";

const $ = (id) => document.getElementById(id);
const bg = (msg) => chrome.runtime.sendMessage(msg);

// ---- state ----
let groups = [];            // [{id,name,size,admin}]
const selected = new Set(); // selected group ids
let records = [];           // merged, deduped contact records (pre-filter)

// ---------- connection ----------
const PILL = {
  connected: ["pill-connected", "Connected"],
  qr: ["pill-qr", "Scan QR in WhatsApp"],
  loading: ["pill-loading", "Loading WhatsApp…"],
  "no-tab": ["pill-notab", "Open WhatsApp Web"],
};
async function refreshConnection() {
  let res;
  try {
    res = await bg({ type: "GET_CONNECTION" });
  } catch (_) {
    res = { state: "no-tab" };
  }
  const state = res?.state || "no-tab";
  const pill = $("connPill");
  pill.className = "pill " + (PILL[state]?.[0] || "pill-loading");
  $("connText").textContent = PILL[state]?.[1] || state;
  const ready = state === "connected";
  $("fetchGroups").disabled = !ready;
  return state;
}
$("connPill").addEventListener("click", async () => {
  await bg({ type: "OPEN_WHATSAPP" });
  setTimeout(refreshConnection, 800);
});

// ---------- fetch groups ----------
$("fetchGroups").addEventListener("click", fetchGroups);
async function fetchGroups() {
  const state = await refreshConnection();
  if (state !== "connected") {
    $("groupList").innerHTML = `<div class="muted" style="padding:14px;text-align:center">Open & log into WhatsApp Web first.</div>`;
    return;
  }
  $("groupList").innerHTML = `<div class="muted" style="padding:14px;text-align:center">Fetching…</div>`;
  const res = await bg({ type: "FETCH_GROUPS" });
  if (!res?.ok) {
    $("groupList").innerHTML = `<div class="muted" style="padding:14px;text-align:center">${res?.error || "Couldn't fetch groups."}</div>`;
    return;
  }
  groups = (res.groups || []).sort((a, b) => (b.size || 0) - (a.size || 0));
  selected.clear();
  renderGroups();
  $("groupSearchWrap").classList.remove("hidden");
  $("groupTools").classList.remove("hidden");
}

function renderGroups() {
  const q = ($("groupSearch").value || "").toLowerCase();
  const list = groups.filter((g) => !q || g.name.toLowerCase().includes(q));
  if (!list.length) {
    $("groupList").innerHTML = `<div class="muted" style="padding:14px;text-align:center">No groups match.</div>`;
  } else {
    $("groupList").innerHTML = list
      .map((g) => {
        const size = g.size != null ? `${g.size} members` : "size unknown";
        const admin = g.admin ? `<span class="badge">admin</span>` : "";
        return `<label class="grp">
          <input type="checkbox" data-id="${g.id}" ${selected.has(g.id) ? "checked" : ""}/>
          <span class="grp-main">
            <div class="grp-name">${escapeHtml(g.name)}</div>
            <div class="grp-meta">${size}</div>
          </span>${admin}
        </label>`;
      })
      .join("");
    $("groupList").querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        cb.checked ? selected.add(cb.dataset.id) : selected.delete(cb.dataset.id);
        updateSelCount();
      });
    });
  }
  updateSelCount();
}
function updateSelCount() {
  $("selCount").textContent = selected.size ? `${selected.size} selected` : "";
  $("extractCard").hidden = selected.size === 0;
  const visIds = groups.map((g) => g.id);
  $("selAll").checked = visIds.length > 0 && visIds.every((id) => selected.has(id));
}
$("groupSearch").addEventListener("input", renderGroups);
$("selAll").addEventListener("change", () => {
  const q = ($("groupSearch").value || "").toLowerCase();
  const vis = groups.filter((g) => !q || g.name.toLowerCase().includes(q));
  if ($("selAll").checked) vis.forEach((g) => selected.add(g.id));
  else vis.forEach((g) => selected.delete(g.id));
  renderGroups();
});

// ---------- extract ----------
$("extractBtn").addEventListener("click", extract);
async function extract() {
  const ids = [...selected];
  if (!ids.length) return;
  $("extractBtn").disabled = true;
  const byKey = new Map(); // dedupe key → record

  let failed = 0;
  for (let i = 0; i < ids.length; i++) {
    const g = groups.find((x) => x.id === ids[i]);
    $("extractStatus").textContent = `Extracting ${i + 1}/${ids.length}: ${g?.name || ids[i]}…`;
    const res = await bg({ type: "EXTRACT_GROUP", groupId: ids[i] });
    if (!res?.ok) {
      failed++;
      continue;
    }
    for (const m of res.members) mergeMember(byKey, m, res.groupName);
  }

  records = [...byKey.values()];
  const note = failed ? ` (${failed} group${failed > 1 ? "s" : ""} couldn't be read — open them once in WhatsApp, then retry)` : "";
  $("extractStatus").textContent = `Done: ${records.length} unique members from ${ids.length - failed} group(s)${note}.`;
  $("extractBtn").disabled = false;

  $("filterCard").hidden = false;
  $("previewCard").hidden = false;
  $("exportCard").hidden = false;
  applyFilters();
}

// Merge a raw member into the deduped map, combining groups & keeping best info.
function mergeMember(map, m, groupName) {
  const number = m.number ? "+" + m.number : "";
  const key = m.hidden ? "lid:" + (m.lid || m.pushname || m.name || Math.random()) : number || "u:" + (m.pushname || m.name);
  let r = map.get(key);
  if (!r) {
    r = {
      name: "", number, display: "", hidden: !!m.hidden,
      isSaved: false, isMe: false, pushname: "",
      admin: false, superAdmin: false, groups: [],
    };
    map.set(key, r);
  }
  r.name = r.name || m.name || "";
  r.pushname = r.pushname || m.pushname || "";
  r.isSaved = r.isSaved || !!m.isSaved;
  r.isMe = r.isMe || !!m.isMe;
  r.admin = r.admin || !!m.isAdmin;
  r.superAdmin = r.superAdmin || !!m.isSuperAdmin;
  if (groupName && !r.groups.includes(groupName)) r.groups.push(groupName);
  // finalize derived fields
  r.role = r.superAdmin ? "super-admin" : r.admin ? "admin" : "member";
  r.display = r.name || r.pushname || (r.hidden ? "(hidden)" : r.number) || "(unknown)";
}

// ---------- filters (live) ----------
["fExcludeMe","fExcludeAdmins","fOnlyAdmins","fExcludeSaved","fOnlyUnnamed","fHideHidden","fDropNoName"]
  .forEach((id) => $(id).addEventListener("change", applyFilters));

function filteredRecords() {
  const exMe = $("fExcludeMe").checked;
  const exAdmin = $("fExcludeAdmins").checked;
  const onlyAdmin = $("fOnlyAdmins").checked;
  const exSaved = $("fExcludeSaved").checked;
  const onlyUnnamed = $("fOnlyUnnamed").checked;
  const hideHidden = $("fHideHidden").checked;
  const dropNoName = $("fDropNoName").checked;
  return records.filter((r) => {
    if (exMe && r.isMe) return false;
    if (hideHidden && r.hidden) return false;
    if (exSaved && r.isSaved) return false;
    if (onlyUnnamed && r.isSaved) return false;
    const isAdmin = r.admin || r.superAdmin;
    if (exAdmin && isAdmin) return false;
    if (onlyAdmin && !isAdmin) return false;
    if (dropNoName && !r.name && !r.pushname) return false;
    return true;
  });
}

function applyFilters() {
  const rows = filteredRecords();
  // counts
  $("cTotal").textContent = rows.length;
  $("cReach").textContent = rows.filter((r) => !r.hidden).length;
  $("cHidden").textContent = rows.filter((r) => r.hidden).length;
  $("cAdmin").textContent = rows.filter((r) => r.admin || r.superAdmin).length;
  renderPreview(rows);
}

function renderPreview(rows) {
  const head = `<tr><th>#</th><th>Name</th><th>Number</th><th>Role</th><th>Groups</th></tr>`;
  const shown = rows.slice(0, 50);
  const body = shown
    .map((r, i) => {
      const num = r.hidden ? `<span class="tag-hidden">hidden</span>` : escapeHtml(r.number);
      const role = r.admin || r.superAdmin ? `<span class="tag-admin">${r.role}</span>` : r.role;
      return `<tr><td>${i + 1}</td><td>${escapeHtml(r.display)}</td><td>${num}</td><td>${role}</td><td>${escapeHtml(
        r.groups.join(", ")
      )}</td></tr>`;
    })
    .join("");
  $("previewTable").innerHTML = head + body;
  $("previewMore").textContent = rows.length > shown.length ? `…and ${rows.length - shown.length} more (all included in export).` : "";
}

// ---------- export ----------
document.querySelectorAll(".export").forEach((btn) => {
  btn.addEventListener("click", () => doExport(btn.dataset.fmt));
});
function doExport(fmt) {
  const rows = filteredRecords();
  if (!rows.length) {
    $("exportNote").textContent = "Nothing to export with the current filters.";
    return;
  }
  const keys = $("fieldSet").value === "all" ? ALL_FIELDS : SLIM_FIELDS;
  const base = ($("fileName").value || "whatsapp-contacts").replace(/[\\/:*?"<>|]/g, "_").trim() || "whatsapp-contacts";

  try {
    if (fmt === "csv") download(base, "csv", toCSV(rows, keys), "text/csv;charset=utf-8");
    else if (fmt === "xlsx")
      download(base, "xlsx", toXLSX(rows, keys), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    else if (fmt === "vcf") download(base, "vcf", toVCF(rows), "text/vcard;charset=utf-8");
    else if (fmt === "txt") download(base, "txt", toTXT(rows, $("txtMode").value), "text/plain;charset=utf-8");
    else if (fmt === "json") download(base, "json", toJSON(rows), "application/json;charset=utf-8");

    const hiddenNote =
      fmt === "vcf" || fmt === "txt"
        ? rows.some((r) => r.hidden)
          ? " (privacy-hidden members skipped — no number to save)"
          : ""
        : "";
    $("exportNote").textContent = `Exported ${rows.length} contacts as ${fmt.toUpperCase()}${hiddenNote}.`;
  } catch (e) {
    $("exportNote").textContent = "Export failed: " + (e?.message || e);
  }
}

// ---------- utils ----------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------- boot ----------
refreshConnection();
setInterval(refreshConnection, 4000);
