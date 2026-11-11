// Coverage arithmetic shared by record and queue (mark done / status).
import fs from 'node:fs';
import { readJsonl, parseCite, normPath } from './util.mjs';

function addTo(map, key, n) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(n);
}

/**
 * Parse a render log. Entries:
 *   {t:'item', id}                        an item rendered in a window
 *   {t:'cite', cite, path, status, id?}   one cite attempt (status ok or a reason)
 *   {t:'line', path, line, id?, key?, via?}  one line shown
 */
export function loadRenderLog(file) {
  const log = {
    missing: !fs.existsSync(file),
    errors: [],
    items: new Set(),
    lines: new Map(), // path -> Set(line)
    attempts: new Set(), // normalised cite strings rendered (any status)
    keyLines: new Map(), // path\nkey -> Set(line)
    byItem: new Map(), // id -> Map(path -> Set(line))
  };
  if (log.missing) return log;
  const { rows, errors } = readJsonl(file, { strict: false });
  log.errors = errors;
  for (const { obj: e } of rows) {
    if (e.t === 'item') log.items.add(e.id);
    else if (e.t === 'cite') log.attempts.add(e.cite);
    else if (e.t === 'line' && typeof e.path === 'string' && Number.isInteger(e.line)) {
      addTo(log.lines, e.path, e.line);
      if (e.key) addTo(log.keyLines, `${e.path}\n${e.key}`, e.line);
      if (e.id) {
        if (!log.byItem.has(e.id)) log.byItem.set(e.id, new Map());
        addTo(log.byItem.get(e.id), e.path, e.line);
      }
    }
  }
  return log;
}

/** True when the cite was rendered for this reader: the same cite was attempted, or every line is logged. */
export function citeInLog(log, raw) {
  const c = parseCite(raw);
  if (log.attempts.has(c.norm)) return true;
  if (c.kind === 'lines') {
    const s = log.lines.get(c.path);
    if (!s) return false;
    for (let n = c.from; n <= c.to; n++) if (!s.has(n)) return false;
    return true;
  }
  if (c.kind === 'key' || c.kind === 'keypath') return log.keyLines.has(`${c.path}\n${c.key}`);
  return false;
}

/** Lines of one cite that the log shows were rendered: Map(path -> Set(line)). */
export function citeLinesRead(log, raw) {
  const c = parseCite(raw);
  const out = new Map();
  if (c.kind === 'lines') {
    const s = log.lines.get(c.path);
    if (s) for (let n = c.from; n <= c.to; n++) if (s.has(n)) addTo(out, c.path, n);
  } else if (c.kind === 'key' || c.kind === 'keypath') {
    const s = log.keyLines.get(`${c.path}\n${c.key}`);
    if (s) for (const n of s) addTo(out, c.path, n);
  }
  return out;
}

export function mergeLineMaps(into, from) {
  for (const [p, set] of from) for (const n of set) addTo(into, p, n);
  return into;
}

/** file:line references in a note, e.g. "src/a.js:12" or "docs/x.md:3-5". */
export function noteRefs(note) {
  const out = [];
  const re = /([\w.\/\\@+-]+):(\d+)(?:-(\d+))?/g;
  let m;
  while ((m = re.exec(String(note ?? '')))) {
    const p = m[1];
    if (/^\d+$/.test(p) || !/[A-Za-z]/.test(p)) continue; // "12:30" is not a file
    out.push({ path: normPath(p), from: Number(m[2]), to: Number(m[3] || m[2]), raw: m[0] });
  }
  return out;
}

export function refInLog(log, ref) {
  const s = log.lines.get(ref.path);
  if (!s) return false;
  for (let n = ref.from; n <= ref.to; n++) if (s.has(n)) return true;
  return false;
}

/**
 * Exact-once coverage of list positions from..to (1-based) by one reader's result rows.
 * Canary rows (ids planted for this slot) are set aside and never count.
 */
export function slotCoverage({ list, from, to, rows, canaryIds = new Set() }) {
  const pos = new Map(list.map((id, i) => [id, i + 1]));
  const seen = new Map();
  const outside = [];
  const canaryRows = [];
  let last = 0;
  let outOfOrder = false;
  for (const r of rows) {
    const id = r.obj.id;
    if (canaryIds.has(id)) {
      canaryRows.push(r);
      continue;
    }
    const p = pos.get(id);
    if (!p || p < from || p > to) {
      outside.push(r);
      continue;
    }
    if (p < last) outOfOrder = true;
    last = Math.max(last, p);
    if (!seen.has(p)) seen.set(p, []);
    seen.get(p).push(r);
  }
  const missing = [];
  const duplicates = [];
  for (let p = from; p <= to; p++) {
    const s = seen.get(p);
    if (!s) missing.push(p);
    else if (s.length > 1) duplicates.push({ pos: p, id: list[p - 1], lines: s.map((x) => x.lineNo) });
  }
  const real = new Map([...seen].map(([p, s]) => [p, s[0]]));
  return {
    missing,
    duplicates,
    outside,
    canaryRows,
    real,
    outOfOrder,
    complete: !missing.length && !duplicates.length && !outside.length,
    resume: missing.length ? missing[0] : null,
    realLines: [...seen.values()].reduce((a, s) => a + s.length, 0),
  };
}

/** "1, 2, 3, 7" -> "1-3, 7" */
export function fmtPositions(ps) {
  const out = [];
  let i = 0;
  while (i < ps.length) {
    let j = i;
    while (j + 1 < ps.length && ps[j + 1] === ps[j] + 1) j++;
    out.push(i === j ? `${ps[i]}` : `${ps[i]}-${ps[j]}`);
    i = j + 1;
  }
  return out.join(', ');
}
