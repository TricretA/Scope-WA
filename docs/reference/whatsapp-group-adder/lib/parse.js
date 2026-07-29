// parse.js — turn CSV / VCF / TXT into a normalized contact list.
// A contact is { phone: "<digits, intl>", name: "<display or ''>", raw: "<original number cell>" }.
//
// Phone normalization defaults a missing country code to Kenya (+254), because
// that's this user's book. Change DEFAULT_CC to retarget. The preview in the UI
// always shows the resulting number so mistakes are visible before any add runs.

import { parseCSV } from "./csv.js";

export const DEFAULT_CC = "254";

// --- phone normalization -------------------------------------------------
// Returns intl digits only (no +, no spaces). "" if nothing usable.
export function normalizePhone(raw, cc = DEFAULT_CC) {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (!s) return "";
  const hadPlus = s.startsWith("+") || /^00\d/.test(s);
  // strip everything but digits
  let d = s.replace(/\D/g, "");
  if (!d) return "";
  if (/^00\d/.test(s)) d = d.replace(/^00/, ""); // 00<cc>... → <cc>...
  if (hadPlus) return d; // already international, trust it

  // No +: interpret as a local/national number.
  if (d.startsWith("0")) {
    // 07XXXXXXXX (KE mobile) / 0XXXXXXXXX → drop trunk 0, prepend cc
    d = cc + d.replace(/^0+/, "");
  } else if (d.startsWith(cc) && d.length > cc.length + 6) {
    // already carries the country code, e.g. 2547XXXXXXXX
    /* keep */
  } else if (d.length <= 9) {
    // bare national significant number without trunk 0, e.g. 7XXXXXXXX
    d = cc + d;
  }
  // else: long number that doesn't start with our cc — assume it's a full
  // foreign number and leave it as-is.
  return d;
}

export function validPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15;
}

// --- VCF (vCard) ---------------------------------------------------------
// Splits on BEGIN:VCARD…END:VCARD, pulls FN (or N) for the name and the first
// TEL for the number. Handles folded lines (leading space continuation).
export function parseVCF(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // unfold folded lines: a line starting with space/tab continues the previous
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
  const out = [];
  for (const card of cards) {
    const lines = card.split(/\r\n|\r|\n/);
    let name = "";
    let tel = "";
    let nFallback = "";
    for (const line of lines) {
      const up = line.toUpperCase();
      if (!name && up.startsWith("FN")) {
        name = line.slice(line.indexOf(":") + 1).trim();
      } else if ((up.startsWith("N:") || up.startsWith("N;")) && !nFallback) {
        // N:Last;First;;; → "First Last"
        const val = line.slice(line.indexOf(":") + 1).trim();
        const parts = val.split(";").map((p) => p.trim()).filter(Boolean);
        if (parts.length) nFallback = [parts[1], parts[0]].filter(Boolean).join(" ");
      } else if (!tel && up.includes("TEL")) {
        tel = line.slice(line.indexOf(":") + 1).trim();
      }
    }
    if (tel) out.push({ raw: tel, name: name || nFallback || "" });
  }
  return out;
}

// --- TXT -----------------------------------------------------------------
// One entry per line. Accepts: "number", "number,name", "name,number",
// "name<tab>number", "name;number". Blank lines and lines starting with # skip.
export function parseTXT(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const out = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const tokens = t.split(/[,;\t]/).map((x) => x.trim()).filter(Boolean);
    if (!tokens.length) continue;
    if (tokens.length === 1) {
      out.push({ raw: tokens[0], name: "" });
      continue;
    }
    // pick the token that looks most like a phone as the number, rest as name
    const phoneIdx = tokens.findIndex((x) => /[\d]{6,}/.test(x.replace(/\D/g, "")));
    const idx = phoneIdx === -1 ? tokens.length - 1 : phoneIdx;
    const raw = tokens[idx];
    const name = tokens.filter((_, i) => i !== idx).join(" ").trim();
    out.push({ raw, name });
  }
  return out;
}

// --- unified entry point -------------------------------------------------
// filename decides the parser. CSV returns {headers, rows} so the caller can
// let the user pick phone/name columns; VCF/TXT return a ready contact list.
export function parseFile(filename, text) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "vcf") return { kind: "list", contacts: dedupe(finish(parseVCF(text))) };
  if (ext === "txt") return { kind: "list", contacts: dedupe(finish(parseTXT(text))) };
  // default: CSV
  const { headers, rows } = parseCSV(text);
  return { kind: "csv", headers, rows };
}

// Build final contacts from CSV rows once columns are chosen.
export function contactsFromRows(rows, phoneCol, nameCol) {
  return dedupe(
    finish(
      rows.map((r) => ({ raw: r[phoneCol] ?? "", name: nameCol ? (r[nameCol] ?? "") : "" }))
    )
  );
}

function finish(list) {
  return list.map((c) => {
    const phone = normalizePhone(c.raw);
    return { phone, name: (c.name || "").trim(), raw: String(c.raw || "").trim() };
  });
}

// Drop exact duplicate numbers (keep first, prefer the one that has a name).
function dedupe(list) {
  const seen = new Map();
  for (const c of list) {
    const key = c.phone || c.raw;
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev) seen.set(key, c);
    else if (!prev.name && c.name) seen.set(key, c);
  }
  return [...seen.values()];
}
