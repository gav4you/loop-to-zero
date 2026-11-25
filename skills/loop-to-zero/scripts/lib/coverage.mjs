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
    if (s) for (const n of s) if (n >= c.from && n <= c.to) addTo(out, c.path, n);
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

/**
 * file:line references in a note, e.g. "src/a.js:12" or "docs/x.md:3-5". A range written backwards
 * ("5-3") is read as 3-5, as parseCite reads a cite. The path is found by its characters, so one with
 * a space, a bracket or a non-ASCII letter comes back cut short: use noteNamesLoggedLine to ask
 * whether a note names a line a reader rendered.
 */
export function noteRefs(note) {
  const out = [];
  const re = /([\w.\/\\@+-]+):(\d+)(?:-(\d+))?/g;
  let m;
  while ((m = re.exec(String(note ?? '')))) {
    const p = m[1];
    if (/^\d+$/.test(p) || !/[A-Za-z]/.test(p)) continue; // "12:30" is not a file
    const a = Number(m[2]);
    const b = Number(m[3] || m[2]);
    out.push({ path: normPath(p), from: Math.min(a, b), to: Math.max(a, b), raw: m[0], url: p.startsWith('//') });
  }
  return out;
}

/**
 * The references of a note that can be a file:line: the path has a folder or a file extension, or is a
 * path in `known` (paths some reader rendered, so "Makefile:12" counts once a reader rendered Makefile).
 * A host and port ("localhost:8080", "http://host:80") or a word before a number ("node:18") is not one.
 */
export function fileRefs(note, known = new Set()) {
  return noteRefs(note).filter((r) => !r.url && (known.has(r.path) || r.path.includes('/') || /\.[A-Za-z0-9]+$/.test(r.path)));
}

export function refInLog(log, ref) {
  const s = log.lines.get(ref.path);
  if (!s) return false;
  for (const n of s) if (n >= ref.from && n <= ref.to) return true;
  return false;
}

/**
 * True when the note names a line this render log shows: for some logged path, the note holds
 * "<path>:<n>" or "<path>:<a>-<b>" (either order) with a logged line in it. The logged paths are
 * searched for in the note, so a path may hold any character (a space, brackets, "~", a comma, a
 * non-ASCII letter). The path must start the reference: "a.md:3" is not found inside "docs/ba.md:3",
 * though a leading "./" is allowed.
 */
export function noteNamesLoggedLine(log, note) {
  const text = String(note ?? '').replace(/\\/g, '/');
  for (const [p, set] of log.lines) {
    let i = -1;
    while ((i = text.indexOf(`${p}:`, i + 1)) >= 0) {
      const before = text.slice(0, i).replace(/(?:\.\/)+$/, '');
      if (/[\p{L}\p{N}_\/@+~.-]$/u.test(before)) continue; // the tail of a longer path
      const m = /^(\d+)(?:-(\d+))?/.exec(text.slice(i + p.length + 1));
      if (!m) continue;
      const a = Number(m[1]);
      const b = Number(m[2] || m[1]);
      for (const n of set) if (n >= Math.min(a, b) && n <= Math.max(a, b)) return true;
    }
  }
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
