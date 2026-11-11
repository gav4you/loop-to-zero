// Shared helpers for the loop-to-zero tool kit. Node >= 18, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class LtzError extends Error {}

/** Throw a user-facing failure (the CLI prints it and exits non-zero). */
export function fail(msg) {
  throw new LtzError(msg);
}

export function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function exists(p) {
  return fs.existsSync(p);
}

export function readText(p) {
  return stripBom(fs.readFileSync(p, 'utf8'));
}

export function readJson(p, what) {
  if (!fs.existsSync(p)) fail(`${what || 'file'} is missing: ${p}`);
  try {
    return JSON.parse(readText(p));
  } catch (e) {
    fail(`${what || p} is not valid JSON (${p}): ${e.message}`);
  }
}

/**
 * Read a JSON-lines file. Returns {rows: [{lineNo, obj}], errors: [string]}.
 * Blank lines are skipped. With strict=true, any parse error throws.
 */
export function readJsonl(p, { what, strict = true, mustExist = true } = {}) {
  if (!fs.existsSync(p)) {
    if (mustExist) fail(`${what || 'file'} is missing: ${p}`);
    return { rows: [], errors: [], missing: true };
  }
  const rows = [];
  const errors = [];
  const lines = readText(p).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const obj = JSON.parse(line);
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        errors.push(`${what || p} line ${i + 1}: not a JSON object`);
        return;
      }
      rows.push({ lineNo: i + 1, obj });
    } catch (e) {
      errors.push(`${what || p} line ${i + 1}: not valid JSON (${e.message})`);
    }
  });
  if (strict && errors.length) fail(errors.join('\n'));
  return { rows, errors, missing: false };
}

export function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

export function writeJsonl(p, objs) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, objs.map((o) => JSON.stringify(o)).join('\n') + (objs.length ? '\n' : ''));
}

export function appendJsonl(p, objs) {
  if (!objs.length) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, objs.map((o) => JSON.stringify(o)).join('\n') + '\n');
}

export function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/** Canonical JSON: object keys sorted recursively, so equal values compare equal. */
export function canon(v) {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Unit, slot and chunk names become file names; keep them plain. */
export function validName(s, what) {
  if (typeof s !== 'string' || !NAME_RE.test(s) || s.includes('..')) {
    fail(`${what} must match [A-Za-z0-9._-]+ (got ${JSON.stringify(s)})`);
  }
  return s;
}

export function parseRound(r) {
  const m = /^r?(\d+)$/.exec(String(r ?? ''));
  if (!m) fail(`round must be a number such as 3 or r3 (got ${JSON.stringify(r)})`);
  return Number(m[1]);
}

export function parsePosInt(s, what, { min = 1 } = {}) {
  if (!/^\d+$/.test(String(s ?? ''))) fail(`${what} must be a whole number (got ${JSON.stringify(s)})`);
  const n = Number(s);
  if (n < min) fail(`${what} must be at least ${min} (got ${n})`);
  return n;
}

/** Repo-relative path normalisation: forward slashes, no leading ./ */
export function normPath(p) {
  let s = String(p).trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  return s;
}

/**
 * Parse a cite: "path:12", "path:20-25" (line cites) or "path:Key" (section/key cite).
 * Anything without a colon is a "bare" cite (nothing to render).
 */
export function parseCite(raw) {
  const c = String(raw).trim();
  // Config-key cite: "path#a.b.c" (a nested JSON/YAML key), when the path part has no colon.
  const h = /^([^#:]+)#([^#]+)$/.exec(c);
  if (h && h[2].trim()) {
    const p = normPath(h[1]);
    const keys = h[2].trim().split('.').map((k) => k.trim()).filter(Boolean);
    if (keys.length) return { kind: 'keypath', path: p, keys, key: `#${keys.join('.')}`, norm: `${p}#${keys.join('.')}` };
  }
  const m = /^(.*):(\d+)(?:-(\d+))?$/.exec(c);
  if (m && m[1]) {
    const a = Number(m[2]);
    const b = m[3] ? Number(m[3]) : a;
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const p = normPath(m[1]);
    return { kind: 'lines', path: p, from, to, norm: from === to ? `${p}:${from}` : `${p}:${from}-${to}` };
  }
  const i = c.indexOf(':');
  if (i > 0 && i < c.length - 1) {
    const p = normPath(c.slice(0, i));
    const key = c.slice(i + 1).trim();
    return { kind: 'key', path: p, key, norm: `${p}:${key}` };
  }
  const p = normPath(c.replace(/:$/, ''));
  return { kind: 'bare', path: p, norm: p };
}

/** Compress {path -> Set(line)} into sorted "path:a-b" strings. */
export function compressLines(map) {
  const out = [];
  for (const p of [...map.keys()].sort()) {
    const nums = [...map.get(p)].sort((a, b) => a - b);
    let i = 0;
    while (i < nums.length) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      out.push(nums[i] === nums[j] ? `${p}:${nums[i]}` : `${p}:${nums[i]}-${nums[j]}`);
      i = j + 1;
    }
  }
  return out;
}

/**
 * Minimal argv parser. spec maps flag name -> 'bool' | 'string' | 'multi'.
 * 'multi' consumes every following token that does not start with "--".
 */
export function parseArgs(argv, spec = {}) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      let name = a.slice(2);
      let val;
      const eq = name.indexOf('=');
      if (eq >= 0) {
        val = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      const kind = spec[name];
      if (!kind) fail(`unknown option --${name}`);
      if (kind === 'bool') {
        flags[name] = true;
        continue;
      }
      if (kind === 'multi') {
        const vals = val !== undefined ? [val] : [];
        while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) vals.push(argv[++i]);
        if (!vals.length) fail(`--${name} needs at least one value`);
        flags[name] = (flags[name] || []).concat(vals);
        continue;
      }
      if (val === undefined) {
        if (i + 1 >= argv.length) fail(`--${name} needs a value`);
        val = argv[++i];
      }
      flags[name] = val;
      continue;
    }
    pos.push(a);
  }
  return { pos, flags };
}

/** "c1=a,b" -> {chunk:'c1', slots:['a','b']} */
export function parseGroupSpec(s, what) {
  const m = /^([^=]+)=(.+)$/.exec(s);
  if (!m) fail(`${what} must look like <chunk>=<slotA>,<slotB> (got ${JSON.stringify(s)})`);
  const chunk = validName(m[1], 'chunk name');
  const slots = m[2].split(',').map((x) => validName(x.trim(), 'slot name'));
  if (new Set(slots).size !== slots.length) fail(`${what}: slot listed twice in ${s}`);
  return { chunk, slots };
}

/** Round folders of a unit, sorted numerically (r2 before r10). */
export function listRounds(unitDir) {
  if (!fs.existsSync(unitDir)) return [];
  return fs
    .readdirSync(unitDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^r\d+$/.test(d.name))
    .map((d) => ({ name: d.name, n: Number(d.name.slice(1)), dir: path.join(unitDir, d.name) }))
    .sort((a, b) => a.n - b.n);
}

/** Deterministic PRNG (mulberry32). */
export function prng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A path glob as a RegExp over repo-relative, forward-slash paths: "**" crosses folders, "*" and
 * "?" do not; a glob ending in "/" covers everything under it.
 */
export function globToRegExp(glob) {
  let g = normPath(glob);
  if (g.endsWith('/')) g += '**';
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += escapeRe(c);
  }
  return new RegExp('^' + re + '$');
}

export function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
