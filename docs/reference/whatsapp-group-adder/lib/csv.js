// csv.js — small, dependency-free RFC-4180-ish CSV parser.
// Handles quoted fields, embedded commas/newlines, escaped quotes ("") and CRLF.

export function parseCSV(text) {
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    // Skip fully-empty trailing lines.
    if (!(record.length === 1 && record[0] === "")) rows.push(record);
    record = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      // handle CRLF and lone CR
      endRecord();
      if (text[i + 1] === "\n") i++;
      i++;
      continue;
    }
    if (ch === "\n") {
      endRecord();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // flush last field/record if the file didn't end with a newline
  if (field !== "" || record.length) endRecord();

  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows: dataRows };
}
