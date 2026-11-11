// canary add <S> <unit> <R> --from <file>   and   canary plan <S> <unit> <R> --per-slot K --seed N
// canary gitignore <S>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fail, readJsonl, readJson, appendJsonl, writeJson, parsePosInt, prng, hashString, isInside, canon, escapeRe, stripBom } from './util.mjs';
import { loadConfig, requireUnit, requireRoundDir, loadItems, loadSnapshot, loadCanaries, checkItems } from './state.mjs';
import { sourceBases } from './sources.mjs';

const META = ['kind'];

// Canaries must never be committed: a reader that can see them (in a repo's history) is no
// longer blind to them. These lines go in S/.gitignore when S/ is under git.
// canaries-src/ holds the writer's canary source files (canary add --from): the same rule applies.
export const GITIGNORE_LINES = ['canaries.jsonl', '**/canary-plan.json', 'canaries-src/'];
// Readers may run probes in S/<unit>/r<R>/scratch/<slot>/, a copy of the code holding the secrets render
// masks, so every round's scratch/ folder must be ignored too. Any line git treats as ignoring them
// will do; this is the one printed.
export const SCRATCH_LINE = '**/scratch/';
export const NEVER_COMMIT_NOTE = 'NOTE: never commit S/canaries.jsonl, any canary-plan.json or S/canaries-src/; if S/ is under git, run "node <skill>/scripts/ltz.mjs canary gitignore <S>" for the .gitignore lines';

const NAME = /^[A-Za-z0-9._-]+$/;
// The files probed in each scratch folder: a slot's file, a nested dotfile and a file directly in scratch/.
const PROBE_FILES = ['k7f2/probe.txt', 'k7f2/copy/.env', 'notes.md'];
const okName = (s) => typeof s === 'string' && NAME.test(s) && !s.includes('..');
const roundsIn = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^r\d+$/.test(d.name)).map((d) => d.name);
  } catch {
    return [];
  }
};

/**
 * The files whose being ignored shows that S/.gitignore ignores the readers' scratch folders, as
 * '/'-separated paths relative to S/. For each unit folder (a synthetic one, so a line naming one
 * unit is not enough; every unit in config.json; every folder of S/, or of a folder in S/ such as a
 * discovery state folder, that holds r<R> folders) and each round (r1, r12 and every r<R> on disk),
 * three files of the scratch folder <unit>/r<R>/scratch/: <slot>/probe.txt, <slot>/copy/.env and
 * notes.md.
 */
export function scratchProbes(S) {
  const units = new Set(['any-unit']);
  try {
    const cfg = JSON.parse(stripBom(fs.readFileSync(path.join(S, 'config.json'), 'utf8')));
    if (cfg && cfg.units && typeof cfg.units === 'object') for (const u of Object.keys(cfg.units)) if (okName(u)) units.add(u);
  } catch {
    // no or unreadable config.json: the synthetic unit and the folders on disk still cover it
  }
  const top = fs.readdirSync(S, { withFileTypes: true }).filter((d) => d.isDirectory() && okName(d.name) && d.name !== '.git').map((d) => d.name);
  for (const a of top) {
    if (roundsIn(path.join(S, a)).length) units.add(a);
    for (const b of fs.readdirSync(path.join(S, a), { withFileTypes: true })) {
      if (b.isDirectory() && okName(b.name) && roundsIn(path.join(S, a, b.name)).length) units.add(`${a}/${b.name}`);
    }
  }
  const probes = [];
  for (const u of units) {
    const rounds = new Set(['r1', 'r12', ...roundsIn(path.join(S, ...u.split('/')))]);
    for (const r of rounds) for (const f of PROBE_FILES) probes.push(`${u}/${r}/scratch/${f}`);
  }
  return probes;
}

/** A gitignore glob (no leading "/", no trailing "/") as a RegExp source, by git's wildmatch rules. */
function gitGlob(g) {
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '\\' && i + 1 < g.length) {
      out += escapeRe(g[++i]);
    } else if (c === '*' && g[i + 1] === '*' && (i === 0 || g[i - 1] === '/') && (i + 2 === g.length || g[i + 2] === '/')) {
      // "**" as a whole path segment: "**/" is zero or more folders, a final "/**" everything inside.
      if (i + 2 === g.length) {
        out += '.*';
        i += 1;
      } else {
        out += '(?:.*/)?';
        i += 2;
      }
    } else if (c === '*') {
      while (g[i + 1] === '*') i++; // any other "**" is a plain "*"
      out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '[') {
      let j = i + 1;
      const neg = g[j] === '!' || g[j] === '^';
      if (neg) j++;
      if (g[j] === ']') j++; // a "]" first in the class is literal
      while (j < g.length && g[j] !== ']') j++;
      if (j >= g.length) {
        out += '\\[';
        continue;
      }
      const body = g.slice(i + 1 + (neg ? 1 : 0), j).replace(/[\\\]^[]/g, '\\$&');
      out += neg ? `[^/${body}]` : `(?!/)[${body}]`;
      i = j;
    } else {
      out += escapeRe(c);
    }
  }
  return out;
}

/** The patterns of a .gitignore's text: [{re, negate, dirOnly}], in file order. */
export function gitignorePatterns(text) {
  const rules = [];
  for (const raw of stripBom(text).split(/\r?\n/)) {
    let line = raw.replace(/(?<!\\) +$/, ''); // trailing spaces are dropped unless escaped
    if (!line || line.startsWith('#')) continue;
    let negate = false;
    if (line.startsWith('!')) {
      negate = true;
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith('/')) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    if (!line) continue;
    // A "/" at the start or in the middle anchors the pattern to the .gitignore's folder; otherwise it
    // matches at any depth.
    const anchored = line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    rules.push({ re: new RegExp(`^${anchored ? '' : '(?:.*/)?'}${gitGlob(line)}$`), negate, dirOnly });
  }
  return rules;
}

/**
 * Whether a .gitignore at the root (its text) ignores the file `rel` ('/'-separated), as git decides
 * it: the last pattern matching a path decides; a folder that is ignored hides everything inside it
 * (a later "!" pattern cannot re-include a file there); a pattern ending in "/" matches folders only.
 * The fallback when git is not found; the documented subset is #, !, a trailing /, an anchoring /,
 * *, ?, [...], ** and \ escapes.
 */
export function globIgnores(text, rel) {
  const rules = gitignorePatterns(text);
  const parts = rel.split('/');
  for (let k = 1; k <= parts.length; k++) {
    const sub = parts.slice(0, k).join('/');
    const folder = k < parts.length;
    let ignored = false;
    for (const r of rules) if ((folder || !r.dirOnly) && r.re.test(sub)) ignored = !r.negate;
    if (ignored) return true;
  }
  return false;
}

/**
 * Which probe paths S/.gitignore leaves unignored, asked of git itself: the file is copied as is into
 * a fresh repo in the system temp folder, with no system, global or excludes-file rules, the probe
 * paths are created there as real files, and "git check-ignore" judges them. {method, notIgnored}, or
 * null when git is not found (ENOENT). Any other git failure fails the command.
 */
function gitNotIgnored(bytes, probes) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^GIT_/i.test(k)) delete env[k];
  env.GIT_CONFIG_NOSYSTEM = '1';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltz-gitignore-'));
  try {
    const empty = path.join(tmp, 'empty');
    fs.writeFileSync(empty, '');
    env.GIT_CONFIG_GLOBAL = empty;
    const repo = path.join(tmp, 'repo');
    const tmpl = path.join(tmp, 'template'); // an empty template: no info/exclude rules
    const git = (args, input) =>
      spawnSync('git', ['-c', `core.excludesFile=${empty.replace(/\\/g, '/')}`, ...args], { cwd: repo, env, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    fs.mkdirSync(repo);
    fs.mkdirSync(tmpl);
    const init = git(['init', '-q', `--template=${tmpl.replace(/\\/g, '/')}`]);
    if (init.error && init.error.code === 'ENOENT') return null;
    if (init.error || init.status !== 0) fail(`canary gitignore: git init failed in ${repo}: ${init.error ? init.error.message : init.stderr.trim()}`);
    fs.writeFileSync(path.join(repo, '.gitignore'), bytes);
    for (const p of probes) {
      fs.mkdirSync(path.dirname(path.join(repo, p)), { recursive: true });
      fs.writeFileSync(path.join(repo, p), '');
    }
    const r = git(['check-ignore', '--no-index', '-z', '--stdin'], probes.map((p) => `${p}\0`).join(''));
    // Exit 0: some paths are ignored; 1: none is; anything else is an error.
    if (r.error || (r.status !== 0 && r.status !== 1)) fail(`canary gitignore: git check-ignore failed: ${r.error ? r.error.message : (r.stderr || '').trim()}`);
    const ignored = new Set(r.stdout.split('\0').filter(Boolean));
    return { method: 'git check-ignore', notIgnored: probes.filter((p) => !ignored.has(p)) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function gitignore({ S }) {
  if (!S || !fs.existsSync(S) || !fs.statSync(S).isDirectory()) fail(`state folder not found: ${S}`);
  const p = path.join(S, '.gitignore');
  const bytes = fs.existsSync(p) ? fs.readFileSync(p) : Buffer.alloc(0);
  const have = bytes.toString('utf8').split(/\r?\n/).map((l) => l.trim());
  const missing = GITIGNORE_LINES.filter((l) => !have.includes(l));
  // The scratch folders: any line git treats as ignoring every <unit>/r<R>/scratch/ folder.
  const probes = scratchProbes(S);
  const res = gitNotIgnored(bytes, probes) || {
    method: 'glob match (git not found)',
    notIgnored: probes.filter((x) => !globIgnores(bytes.toString('utf8'), x)),
  };
  const problems = [];
  if (res.notIgnored.length) {
    missing.push(`${SCRATCH_LINE} (or any line git treats as ignoring every <unit>/r<R>/scratch/ folder)`);
    const left = new Map(); // scratch folder -> its probe files not ignored
    for (const x of res.notIgnored) {
      const f = x.slice(0, x.lastIndexOf('/scratch/') + '/scratch/'.length);
      if (!left.has(f)) left.set(f, []);
      left.get(f).push(x.slice(f.length));
    }
    const named = [...left].map(([f, files]) => (files.length === PROBE_FILES.length ? f : `${f} (partly: ${files.join(', ')} not ignored)`));
    problems.push(
      `${p} does not ignore the readers' scratch folders, which hold probe copies of the code with its secrets; ` +
        `not ignored: ${named.join(', ')}; add the line ${SCRATCH_LINE}`,
    );
  }
  return {
    output: [...GITIGNORE_LINES, SCRATCH_LINE].join('\n'),
    problems,
    failed: missing.length > 0,
    summary:
      `canary gitignore: ${p} needs the ${GITIGNORE_LINES.length + 1} lines above, for any commit of S/ ` +
      `(${missing.length ? `missing: ${missing.join(', ')}` : 'all present'}); the scratch folders were checked by ${res.method} over ${probes.length} paths`,
    missing,
  };
}

function keySet(obj, drop = []) {
  return Object.keys(obj).filter((k) => !drop.includes(k)).sort().join(',');
}

export function add({ S, unit, R, from }) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  const rd = requireRoundDir(S, unit, R);
  if (!from) fail('canary add needs --from <canaries.jsonl>');
  for (const base of [...sourceBases(cfg), cfg.itemsRoot].filter(Boolean)) {
    if (isInside(S, base)) fail(`refusing: the state folder is inside ${base}; canaries must never be written into a repo`);
  }
  const incoming = checkItems(readJsonl(from, { what: from }).rows, from);
  if (!incoming.length) fail(`${from} has no canaries`);
  const items = loadItems(S);
  const itemIds = new Set(items.map((x) => x.id));
  const existing = new Set(loadCanaries(S).map((x) => x.id));
  const snapP = path.join(rd, 'snapshot.jsonl');
  const ref = (fs.existsSync(snapP) ? loadSnapshot(rd) : items.filter((x) => x.unit === unit));
  if (!ref.length) fail(`unit ${unit} has no items to model canaries on`);
  // The key set real items most often have; a canary must have exactly that set (plus "kind").
  const counts = new Map();
  for (const it of ref) counts.set(keySet(it), (counts.get(keySet(it)) || 0) + 1);
  const shape = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const problems = [];
  for (const c of incoming) {
    if (itemIds.has(c.id)) problems.push(`${c.id}: collides with a real item id`);
    if (existing.has(c.id)) problems.push(`${c.id}: already in S/canaries.jsonl`);
    if (c.unit !== unit) problems.push(`${c.id}: unit is ${JSON.stringify(c.unit)}, not ${unit}`);
    if (c.kind !== 'wrong' && c.kind !== 'ok') problems.push(`${c.id}: "kind" must be "wrong" or "ok"`);
    if (!Array.isArray(c.cites)) problems.push(`${c.id}: "cites" must be an array`);
    for (const f of cfg.itemFields) if (typeof c[f] !== 'string' || !c[f].trim()) problems.push(`${c.id}: missing item field "${f}"`);
    const ks = keySet(c, META);
    if (ks !== shape) problems.push(`${c.id}: fields {${ks}} differ from real items {${shape}}; a canary must look like a real item`);
  }
  if (problems.length) fail(`refusing to add canaries:\n  ${problems.join('\n  ')}`);
  appendJsonl(path.join(S, 'canaries.jsonl'), incoming);
  const w = incoming.filter((c) => c.kind === 'wrong').length;
  return { output: NEVER_COMMIT_NOTE, summary: `canary add: ${incoming.length} canaries (${w} wrong, ${incoming.length - w} ok) appended to S/canaries.jsonl` };
}

export function plan({ S, unit, R, perSlot, seed }) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  const rd = requireRoundDir(S, unit, R);
  const K = parsePosInt(perSlot, '--per-slot');
  const sd = parsePosInt(seed, '--seed', { min: 0 });
  const planP = path.join(rd, 'canary-plan.json');
  if (fs.existsSync(planP)) fail(`refusing: ${planP} already exists`);
  const qP = path.join(rd, 'queue.json');
  if (!fs.existsSync(qP)) fail('canary plan needs queue.json for the slots and their ranges (run queue init first)');
  const q = readJson(qP, 'queue.json');
  const pool = loadCanaries(S).filter((c) => c.unit === unit);
  if (pool.length < K) fail(`only ${pool.length} canaries for unit ${unit} in S/canaries.jsonl; --per-slot ${K} needs at least ${K}`);
  const out = {};
  for (const s of q.slots) {
    const started = fs.readdirSync(rd).filter((f) => f === `agent-${s.slot}.jsonl` || f.startsWith(`w-${s.slot}-`));
    if (started.length) fail(`refusing: ${s.slot} has already started (${started.join(', ')}); plan canaries before reading`);
    const size = s.to - s.from + 1;
    if (K > size) fail(`--per-slot ${K} is more than slot ${s.slot}'s ${size} positions`);
    const rnd = prng((sd ^ hashString(s.slot)) >>> 0);
    const ids = pool.map((c) => c.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const positions = new Set();
    while (positions.size < K) positions.add(s.from + Math.floor(rnd() * size));
    const ps = [...positions].sort((a, b) => a - b);
    out[s.slot] = ps.map((p, i) => ({ canaryId: ids[i], atPosition: p }));
  }
  writeJson(planP, out);
  return { output: NEVER_COMMIT_NOTE, summary: `canary plan: ${K} per slot over ${q.slots.length} slots (seed ${sd}) -> ${planP}`, plan: out, hash: canon(out) };
}
