// exporters.js — turn an array of contact records into downloadable files.
// Formats: CSV, TXT, JSON, VCF (vCard 3.0), and XLSX (real Excel, built with a
// tiny dependency-free ZIP writer — the extension's CSP blocks external libs).
//
// A record looks like:
//   { name, number, display, role, groups, isMe, isSaved, hidden, pushname }
// where `number` is E.164 digits with a leading "+", or "" if hidden.

// ---------- field model ----------------------------------------------------
// Column key → header label + how to read it from a record.
export const FIELDS = {
  name: { label: "Name", get: (r) => r.display },
  number: { label: "Number", get: (r) => (r.hidden ? "hidden" : r.number) },
  role: { label: "Role", get: (r) => r.role },
  groups: { label: "Groups", get: (r) => (r.groups || []).join(" | ") },
  saved: { label: "Saved Contact", get: (r) => (r.isSaved ? "yes" : "no") },
  pushname: { label: "Push Name", get: (r) => r.pushname || "" },
};

export const SLIM_FIELDS = ["name", "number"];
export const ALL_FIELDS = ["name", "number", "role", "groups", "saved", "pushname"];

function row(r, keys) {
  return keys.map((k) => String(FIELDS[k].get(r) ?? ""));
}

// ---------- CSV -------------------------------------------------------------
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCSV(records, keys) {
  const header = keys.map((k) => csvCell(FIELDS[k].label)).join(",");
  const lines = records.map((r) => row(r, keys).map(csvCell).join(","));
  // Leading BOM so Excel opens Unicode names correctly.
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

// ---------- TXT -------------------------------------------------------------
// mode: "numbers" (one number per line) or "name-number" ("Name: +number").
export function toTXT(records, mode = "numbers") {
  const lines = records
    .map((r) => {
      const num = r.hidden ? "" : r.number;
      if (mode === "name-number") return `${r.display || "(no name)"}: ${num || "hidden"}`;
      return num; // numbers-only: skip hidden (nothing to dial)
    })
    .filter((l) => l && l.length);
  return lines.join("\r\n") + "\r\n";
}

// ---------- JSON ------------------------------------------------------------
export function toJSON(records) {
  const clean = records.map((r) => ({
    name: r.display,
    number: r.hidden ? null : r.number,
    hidden: r.hidden,
    role: r.role,
    groups: r.groups,
    savedContact: r.isSaved,
    pushName: r.pushname || null,
  }));
  return JSON.stringify(clean, null, 2);
}

// ---------- VCF (vCard 3.0) -------------------------------------------------
function vcardEscape(s) {
  return String(s ?? "").replace(/([;,\\])/g, "\\$1").replace(/\n/g, "\\n");
}
export function toVCF(records) {
  const cards = records
    .filter((r) => !r.hidden && r.number) // a vCard needs a real number to be useful
    .map((r) => {
      const name = r.display || r.number;
      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${vcardEscape(name)}`,
        `N:${vcardEscape(name)};;;;`,
        `TEL;TYPE=CELL:${r.number}`,
        r.groups && r.groups.length ? `NOTE:${vcardEscape("WhatsApp group: " + r.groups.join(", "))}` : null,
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\r\n");
    });
  return cards.join("\r\n") + "\r\n";
}

// ---------- XLSX (minimal, no dependencies) ---------------------------------
// Build a valid .xlsx = a ZIP of XML parts. Strings use inlineStr so numbers
// keep their leading "+" and never get mangled into scientific notation.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  const enc = new TextEncoder();
  const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    // Local file header (fixed 1980-01-01 timestamp; store method, no compression)
    const local = [].concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0x21),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0)
    );
    chunks.push(new Uint8Array(local), nameBytes, data);
    // Central directory record
    const cen = [].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x21),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
    );
    central.push(new Uint8Array(cen), nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  for (const c of central) chunks.push(c);

  const end = [].concat(
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(centralStart), u16(0)
  );
  chunks.push(new Uint8Array(end));

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function colLetter(n) {
  let s = "";
  n += 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function sheetXml(records, keys) {
  const rows = [];
  const cells = (vals, rIdx) =>
    vals
      .map((v, cIdx) => `<c r="${colLetter(cIdx)}${rIdx}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`)
      .join("");
  rows.push(`<row r="1">${cells(keys.map((k) => FIELDS[k].label), 1)}</row>`);
  records.forEach((r, i) => {
    rows.push(`<row r="${i + 2}">${cells(row(r, keys), i + 2)}</row>`);
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rows.join("")}</sheetData></worksheet>`
  );
}

export function toXLSX(records, keys) {
  const files = [
    {
      name: "[Content_Types].xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    },
    {
      name: "xl/workbook.xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Contacts" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        "</Relationships>",
    },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(records, keys) },
  ];
  return makeZip(files); // Uint8Array
}

// ---------- download helper -------------------------------------------------
export function download(filenameBase, ext, content, mime) {
  const data = content instanceof Uint8Array ? content : new TextEncoder().encode(content);
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
