// Reading evidence at the pin: git (git show <pin>:<path>) or a plain folder.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fail, normPath, isInside, escapeRe, globToRegExp } from './util.mjs';
import { evidenceSources, routeSource } from './sources.mjs';

const MAX_BUFFER = 512 * 1024 * 1024;

export function splitLines(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function safeRelPath(p) {
  const n = normPath(p);
  if (!n || path.isAbsolute(n) || /^[A-Za-z]:/.test(n) || n.split('/').includes('..')) return null;
  return n;
}

/** A folder's content hash: every file's relative path and content, in sorted path order. */
export function treeHash(root) {
  const files = [];
  const walk = (rel) => {
    for (const d of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(r);
      else if (d.isFile()) files.push(r);
    }
  };
  walk('');
  files.sort();
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f + '\0');
    h.update(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex') + '\n');
  }
  return h.digest('hex');
}

/** Fails when a dir source pinned by "sha256" no longer matches its files. */
export function checkDirPin(src) {
  if (src.type !== 'dir' || src.sha256 === undefined) return;
  const now = treeHash(path.resolve(src.root));
  if (now !== src.sha256) fail(`evidence dir ${src.root} has changed since it was pinned: sha256 ${now}, config "sha256" ${src.sha256}`);
}

/** One evidence source: a git repo at its pin, or a folder. Paths are relative to the source. */
class SourceReader {
  constructor(src) {
    this.src = src;
    this.cache = new Map();
    if (src.type === 'git') {
      if (!fs.existsSync(src.repo)) fail(`evidence repo not found: ${src.repo}`);
      try {
        this.sha = execFileSync('git', ['-C', src.repo, 'rev-parse', '--verify', '--quiet', `${src.pin}^{commit}`], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
      } catch {
        fail(`pin ${src.pin} does not resolve to a commit in ${src.repo}`);
      }
    } else {
      if (!fs.existsSync(src.root)) fail(`evidence root not found: ${src.root}`);
      this.root = path.resolve(src.root);
      checkDirPin(src);
    }
  }

  describe() {
    const what = this.src.type === 'git' ? `git ${this.src.repo} at ${this.src.pin} (${this.sha.slice(0, 12)})` : `dir ${this.src.root}`;
    return this.src.prefix ? `${this.src.prefix} -> ${what}` : what;
  }

  pinLabel() {
    return this.src.type === 'git' ? this.src.pin : 'dir';
  }

  lines(rel) {
    if (this.cache.has(rel)) return this.cache.get(rel);
    let res;
    if (this.src.type === 'git') {
      try {
        const buf = execFileSync('git', ['-C', this.src.repo, 'show', '--no-textconv', `${this.src.pin}:${rel}`], {
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: MAX_BUFFER,
        });
        res = { ok: true, lines: splitLines(buf.toString('utf8')) };
      } catch {
        res = { ok: false, reason: 'not-found-at-pin' };
      }
    } else {
      const abs = path.resolve(this.root, rel);
      if (!isInside(abs, this.root)) res = { ok: false, reason: 'outside-root' };
      else if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) res = { ok: false, reason: 'not-found' };
      else res = { ok: true, lines: splitLines(fs.readFileSync(abs, 'utf8')) };
    }
    this.cache.set(rel, res);
    return res;
  }
}

/** The evidence: one or more sources, each path routed by the longest matching prefix. */
export class Evidence {
  constructor(cfg) {
    this.readers = evidenceSources(cfg).map((s) => ({ source: s, reader: new SourceReader(s) }));
    this.masker = makeMasker(cfg);
  }

  route(p) {
    const r = routeSource(this.readers.map((x) => x.source), p);
    if (!r) return null;
    return { reader: this.readers.find((x) => x.source === r.source).reader, rel: r.rel };
  }

  describe() {
    return this.readers.map((x) => x.reader.describe()).join('; ');
  }

  pinLabel(p) {
    const r = p === undefined ? { reader: this.readers[0].reader } : this.route(p);
    return r ? r.reader.pinLabel() : 'no source';
  }

  /** Returns {ok:true, lines} or {ok:false, reason}. */
  lines(p) {
    const rel = safeRelPath(p);
    if (!rel) return { ok: false, reason: 'bad-path' };
    const r = this.route(rel);
    if (!r) return { ok: false, reason: 'no-source' };
    return r.reader.lines(r.rel);
  }
}

/**
 * Find the line for a section/key cite (best effort). Ranking: a markdown heading containing the
 * key, then a key-looking line (key: / "key" / key =), then any line containing it (exact case
 * before case-insensitive). Returns {line, others} (1-based) or null.
 */
export function findKey(lines, key) {
  const esc = escapeRe(key);
  const keyLike = new RegExp(`(^|[\\s"'\`{,\\[])${esc}["'\`\\]]?\\s*[:=]`);
  const lower = key.toLowerCase();
  const hits = [];
  lines.forEach((t, i) => {
    let rank = null;
    if (t.includes(key)) {
      if (/^\s*#{1,6}\s/.test(t)) rank = 0;
      else if (keyLike.test(t)) rank = 1;
      else rank = 2;
    } else if (t.toLowerCase().includes(lower)) rank = 3;
    if (rank !== null) hits.push({ i, rank });
  });
  if (!hits.length) return null;
  hits.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return { line: hits[0].i + 1, others: hits.slice(1).map((h) => h.i + 1).sort((a, b) => a - b) };
}

export const KEY_BLOCK_AFTER = 10;
export const KEYPATH_MAX_LINES = 200;

const indentOf = (t) => /^\s*/.exec(t)[0].replace(/\t/g, '    ').length;

/** Last line (0-based) of the block a key on line i owns: deeper-indented lines, plus a closing bracket. */
function blockEnd(lines, i) {
  const ind = indentOf(lines[i]);
  let end = i;
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j];
    if (!t.trim()) continue;
    const d = indentOf(t);
    if (d > ind) {
      end = j;
      continue;
    }
    if (d === ind && /^\s*[}\]]/.test(t)) end = j;
    break;
  }
  return end;
}

/**
 * Find a nested key ("server.http.port") in JSON or YAML text by indentation (best effort).
 * Each key is looked for inside the block of the one before it; a key written inline on its
 * parent's line ({"port": 1}) resolves to that line. Returns {line, end} (1-based) or null.
 */
export function findKeyPath(lines, keys) {
  let from = 0;
  let to = lines.length - 1;
  let line = -1;
  let inline = false;
  for (const k of keys) {
    const esc = escapeRe(k);
    const own = new RegExp(`^\\s*(?:-\\s+)?["']?${esc}["']?\\s*:`);
    // Inside a parent's block only its direct children count: the block's shallowest indent,
    // ignoring blank lines and closing brackets. The first key takes the shallowest match anywhere.
    let child = null;
    if (line >= 0) {
      for (let j = from; j <= to; j++) {
        const t = lines[j];
        if (!t.trim() || /^\s*[}\]]/.test(t)) continue;
        child = child === null ? indentOf(t) : Math.min(child, indentOf(t));
      }
    }
    let found = -1;
    let best = Infinity;
    for (let j = from; j <= to; j++) {
      if (!own.test(lines[j])) continue;
      const d = indentOf(lines[j]);
      if (child !== null && d !== child) continue;
      if (d < best) {
        best = d;
        found = j;
      }
    }
    if (found < 0 && line >= 0 && new RegExp(`[{,]\\s*["']?${esc}["']?\\s*:`).test(lines[line])) {
      inline = true;
      from = line + 1;
      to = line;
      continue;
    }
    if (found < 0) return null;
    line = found;
    inline = false;
    from = found + 1;
    to = blockEnd(lines, found);
  }
  return { line: line + 1, end: (inline ? line : blockEnd(lines, line)) + 1 };
}

// Secret-looking values. A key is split into segments (on _ - . spaces and camelCase) and is secret when
// its segments contain one of these names as whole segments: "auth_token" and "db_password" are
// secret, "max_tokens", "bypass" and "mytoken" are not.
export const BUILTIN_SECRET_KEYS = [
  'password', 'passwd', 'secret', 'token', 'apikey', 'api_key', 'private_key',
  'credential', 'credentials', 'access_key', 'auth_token', 'client_secret', 'pin',
];
export const MASK = '«masked»';

export function keySegments(key) {
  return String(key)
    .split(/[_\-.\s]+/)
    .flatMap((s) => s.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/))
    .map((s) => s.toLowerCase())
    .filter(Boolean);
}

function containsRun(segs, run) {
  for (let i = 0; i + run.length <= segs.length; i++) {
    let hit = true;
    for (let j = 0; j < run.length; j++) {
      if (segs[i + j] !== run[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

// Plural compounds match only as the WHOLE key (all its segments), so "access_tokens" is masked
// while "max_tokens" (and "my_secrets") are not.
export const WHOLE_KEY_SECRETS = ['access_tokens', 'refresh_tokens', 'secrets', 'passwords', 'api_keys', 'client_secrets'];

export function isSecretKey(key, extra = []) {
  const segs = keySegments(key);
  const whole = WHOLE_KEY_SECRETS.some((name) => keySegments(name).join('\u0000') === segs.join('\u0000'));
  return whole || [...BUILTIN_SECRET_KEYS, ...extra].some((name) => {
    const run = keySegments(name);
    return run.length > 0 && containsRun(segs, run);
  });
}

// A key (bare or quoted) followed by ":" (not "::") or "=" (not "=="). A key may hold several words
// separated by spaces or tabs ("Password rotation: 90 days" in a policy's prose); its segments then
// include each word, so "password" is found in it.
const KEY_VALUE = /(?<![A-Za-z0-9_.\-])(["'`]?)([A-Za-z_][A-Za-z0-9_.\-]*(?:[ \t]+[A-Za-z_][A-Za-z0-9_.\-]*)*)\1\s*(?::(?!:)|=(?!=))\s*/g;

// An unquoted plain number, boolean or duration ("12", "true", "30s", "1h30m", "90 days", "1 week") is
// left visible only when the key ALSO names a setting ("password_min_length: 12", "token_ttl: 3600",
// "Password rotation: 90 days"); a bare secret key with a numeric value ("password: 1234", "pin: 0000")
// is still masked. maskAllow keys are never masked.
export const PLAIN_VALUE = /^(?:[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?|true|false|(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+|\d+(?:\.\d+)?[ \t]+(?:second|minute|hour|day|week)s?)$/i;
export const SETTING_SEGMENTS = [
  'min', 'max', 'length', 'len', 'lifetime', 'ttl', 'expiry', 'expires', 'age', 'days', 'hours', 'minutes',
  'seconds', 'rotation', 'count', 'size', 'rounds', 'attempts', 'interval', 'timeout',
];

export function hasSettingSegment(key) {
  return keySegments(key).some((s) => SETTING_SEGMENTS.includes(s));
}

/** True when an allow-list name's segments appear, as whole segments, in the key. */
export function isAllowedKey(key, allow = []) {
  const segs = keySegments(key);
  return allow.some((name) => {
    const run = keySegments(name);
    return run.length > 0 && containsRun(segs, run);
  });
}

/** Mask the values of secret keys in one line. Returns {text, masked}. */
export function maskSecrets(line, extraKeys = [], allowKeys = []) {
  const re = new RegExp(KEY_VALUE.source, 'g');
  let out = '';
  let last = 0;
  let masked = false;
  let m;
  while ((m = re.exec(line))) {
    if (!isSecretKey(m[2], extraKeys) || isAllowedKey(m[2], allowKeys)) continue;
    const i = m.index + m[0].length;
    if (i < last) continue;
    const q = line[i];
    let a;
    let b;
    if (q === '"' || q === "'" || q === '`') {
      a = i + 1;
      const j = line.indexOf(q, a);
      b = j < 0 ? line.length : j;
    } else if (q === '[' || q === '{') {
      // A list or inline object ("passwords: [p1, p2]"): mask everything up to its matching bracket.
      const close = q === '[' ? ']' : '}';
      let depth = 0;
      let j = i;
      for (; j < line.length; j++) {
        if (line[j] === q) depth++;
        else if (line[j] === close && --depth === 0) break;
      }
      a = i + 1;
      b = j < line.length ? j : line.length;
    } else {
      // An unquoted value runs to the next , ; } ] or ), a " #" comment, or the end of the line, so
      // "Password: correct horse battery" is masked whole, not only its first word.
      a = i;
      const rest = line.slice(i);
      const end = rest.search(/\s+#|[,;}\])]/);
      const v = (end < 0 ? rest : rest.slice(0, end)).replace(/\s+$/, '');
      if (v && PLAIN_VALUE.test(v) && hasSettingSegment(m[2])) continue;
      b = i + v.length;
    }
    if (b > a) {
      out += line.slice(last, a) + MASK;
      last = b;
      masked = true;
      re.lastIndex = b;
    }
  }
  return { text: out + line.slice(last), masked };
}

/**
 * Masking as configured: maskSecrets (default true), maskKeys (extra names), maskAllow (names never
 * masked, by whole segments), maskExclude (path globs).
 */
export function makeMasker(cfg) {
  const list = (k) => {
    const v = cfg[k] === undefined ? [] : cfg[k];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) fail(`config.json: "${k}" must be an array of non-empty strings`);
    return v;
  };
  const extra = list('maskKeys');
  const allow = list('maskAllow');
  const exclude = list('maskExclude').map(globToRegExp);
  const enabled = cfg.maskSecrets !== false;
  return {
    enabled,
    mask(p, line) {
      if (!enabled || exclude.some((re) => re.test(normPath(p)))) return { text: line, masked: false };
      return maskSecrets(line, extra, allow);
    },
  };
}

/**
 * Resolve a parsed cite at the pin.
 * Returns {status:'ok', lines:[{n,text}], note} or {status:<reason>, lines:[], note}.
 */
export function resolveCite(evidence, cite) {
  if (cite.kind === 'bare') return { status: 'no-line-or-key', lines: [], note: 'cite names no line or key; nothing rendered' };
  const file = evidence.lines(cite.path);
  if (!file.ok) return { status: file.reason, lines: [], note: `${cite.path}: ${file.reason}` };
  const L = file.lines;
  if (cite.kind === 'keypath') {
    const f = findKeyPath(L, cite.keys);
    if (!f) return { status: 'key-not-found', lines: [], note: `key path "${cite.keys.join('.')}" not found in ${cite.path}` };
    let to = f.end;
    let note = `key path found on line ${f.line}`;
    if (to - f.line + 1 > KEYPATH_MAX_LINES) {
      to = f.line + KEYPATH_MAX_LINES - 1;
      note += `; block clipped at ${KEYPATH_MAX_LINES} lines`;
    }
    const out = [];
    for (let n = f.line; n <= to; n++) out.push({ n, text: L[n - 1] });
    return { status: 'ok', lines: out, note };
  }
  if (cite.kind === 'lines') {
    if (cite.from > L.length) {
      return { status: 'beyond-eof', lines: [], note: `line ${cite.from} is beyond the end of ${cite.path} (${L.length} lines)` };
    }
    const to = Math.min(cite.to, L.length);
    const out = [];
    for (let n = cite.from; n <= to; n++) out.push({ n, text: L[n - 1] });
    const note = to < cite.to ? `clipped at end of file (${L.length} lines)` : '';
    return { status: 'ok', lines: out, note };
  }
  const found = findKey(L, cite.key);
  if (!found) return { status: 'key-not-found', lines: [], note: `key "${cite.key}" not found in ${cite.path}` };
  const to = Math.min(found.line + KEY_BLOCK_AFTER, L.length);
  const out = [];
  for (let n = found.line; n <= to; n++) out.push({ n, text: L[n - 1] });
  const note = `key found on line ${found.line}` + (found.others.length ? `; also on lines ${found.others.join(', ')}` : '');
  return { status: 'ok', lines: out, note };
}
