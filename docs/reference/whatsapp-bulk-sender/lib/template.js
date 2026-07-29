// template.js — {{variable}} substitution with {{variable|fallback}} defaults.

const VAR_RE = /\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

// Return every distinct {{variable}} name used in a template.
export function extractVars(template) {
  const names = new Set();
  let m;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(template)) !== null) names.add(m[1].trim());
  return [...names];
}

// Render one template against a row object.
// Returns { text, missing: [varNames that were empty AND had no fallback] }.
export function render(template, row) {
  const missing = [];
  const text = template.replace(VAR_RE, (_full, rawName, fallback) => {
    const name = rawName.trim();
    const val = row[name];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return String(val);
    }
    if (fallback !== undefined) return fallback;
    missing.push(name);
    return "";
  });
  return { text, missing };
}
