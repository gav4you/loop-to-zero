#!/usr/bin/env node
// Claude Code PreToolUse hook for a loop-to-zero state folder. Node >= 18, no dependencies.
// INERT unless env LTZ_STATE names a state folder holding config.json, or a file .ltz-state in the
// hook's cwd holds that path. When active it blocks (exit 2, reason on stderr):
//   - a git commit (Bash or PowerShell) that would include item files (staged, or -a / pathspec
//     changes) while any S/*/r*/queue.json has an open job (any state but done, replaced or
//     dropped-by-owner; queued counts); when the staged set cannot be determined, it is blocked too;
//   - Edit/Write/MultiEdit/NotebookEdit of a file listed in itemFiles when every unit listing it has a
//     status starting with "closed" (one open unit listing it, final-check included, allows the edit);
//   - while S/writer.lock is held by a different session: an edit of, or a commit including, an item
//     file, the decision log, a top-level S/ state file or a round folder's writer file (confirmed.json,
//     fixlog.jsonl, queue.json, ...); reader and fix-checker outputs and scratch stay writable;
//   - a shell search (grep, rg, findstr, Select-String) piped into head or Select-Object -First.
// Any error of the guard's own blocks too (exit 2, "guard error: ...; fix or disable the guard").
// Even when inert, it writes the session hint <S>/.session-hint for "ltz lock <S> ... --session auto".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
// Queue states in which a job's reading is over (the same list as lib/queue.mjs CLOSED_STATES).
const CLOSED_JOB_STATES = new Set(['done', 'replaced', 'dropped-by-owner']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function isState(p) {
  try {
    return !!p && fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'config.json'));
  } catch {
    return false;
  }
}

export function findState(cwd, env = process.env) {
  const fromEnv = env.LTZ_STATE && env.LTZ_STATE.trim();
  if (fromEnv && isState(path.resolve(cwd || '.', fromEnv))) return path.resolve(cwd || '.', fromEnv);
  if (cwd) {
    const marker = path.join(cwd, '.ltz-state');
    try {
      if (fs.existsSync(marker)) {
        const line = stripBom(fs.readFileSync(marker, 'utf8')).split(/\r?\n/).map((s) => s.trim()).find(Boolean);
        if (line) {
          const p = path.resolve(cwd, line);
          if (isState(p)) return p;
        }
      }
    } catch {
      /* unreadable marker: inert */
    }
  }
  return null;
}

const ARG = `(?:"[^"]*"|'[^']*'|\\S+)`;
const GIT_COMMIT_SRC = `\\bgit(?:\\.exe)?((?:\\s+(?:-C\\s+${ARG}|-c\\s+${ARG}|--[\\w-]+(?:=${ARG})?|-[A-Za-z]+))*)\\s+commit\\b`;
export function isGitCommit(cmd) {
  return new RegExp(GIT_COMMIT_SRC, 'i').test(cmd || '');
}

function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Shell command segments: split at &&, ||, ;, | and newlines outside quotes; outer parens dropped. */
function splitSegments(s) {
  const out = [];
  let q = null;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && s[i + 1] === '&')) {
      out.push(s.slice(start, i));
      if ((ch === '&' || ch === '|') && s[i + 1] === ch) i++;
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim().replace(/^\(+/, '').replace(/\)+$/, '').trim()).filter(Boolean);
}

const CD_SEG = /^(?:cd|chdir|pushd|Set-Location|sl)(?:\s+(?:-Path|-LiteralPath|\/d))?\s+(.+)$/i;
const GIT_SEG = new RegExp(`(?:^|[\\s&(])git(?:\\.exe)?((?:\\s+(?:-C\\s+${ARG}|-c\\s+${ARG}|--[\\w-]+(?:=${ARG})?|-[A-Za-z]+))*)(?:\\s+([\\w-]+))?([\\s\\S]*)$`, 'i');
const VALUE_SHORT = new Set(['m', 'F', 'C', 'c', 't']);
const VALUE_LONG = new Set(['--message', '--file', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--author', '--date', '--template', '--cleanup', '--trailer']);
// Git subcommands that cannot change what is staged.
const READ_ONLY_GIT = new Set([
  'status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'ls-tree', 'cat-file', 'branch', 'tag', 'remote', 'fetch',
  'config', 'describe', 'shortlog', 'blame', 'grep', 'check-ignore', 'reflog', 'help', 'version', 'whatchanged', 'rev-list',
]);
const STAGING_GIT = new Set(['add', 'stage', 'rm', 'mv']);

function home() {
  return process.env.HOME || process.env.USERPROFILE || '~';
}

/** Global git options of one invocation: {dir, undetermined}. */
function gitGlobals(optsText, dir) {
  let d = dir;
  let undetermined = null;
  const g = tokenize(optsText);
  for (let i = 0; i < g.length; i++) {
    if (g[i] === '-C' && g[i + 1] !== undefined) d = path.resolve(d, g[++i]);
    else if (/^--(git-dir|work-tree)\b/.test(g[i])) undetermined = `${g[i].split('=')[0]} is not followed`;
    else if (g[i] === '-c') i++;
  }
  return { dir: d, undetermined };
}

/** git commit arguments: {all, paths, undetermined}. */
function parseCommitArgs(args) {
  const c = { all: false, paths: [], undetermined: null };
  let dashdash = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^\d*[<>]/.test(a)) continue; // a redirection, not a path
    if (dashdash) {
      c.paths.push(a);
      continue;
    }
    if (a === '--') {
      dashdash = true;
      continue;
    }
    if (a.startsWith('--')) {
      const [name, val] = a.split(/=(.*)/s);
      if (name === '--all') c.all = true;
      else if (name === '--pathspec-from-file') c.undetermined = '--pathspec-from-file is not followed';
      else if (VALUE_LONG.has(name) && val === undefined) i++;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        if (a[j] === 'a') c.all = true;
        if (VALUE_SHORT.has(a[j])) {
          if (j === a.length - 1) i++;
          break;
        }
      }
      continue;
    }
    c.paths.push(a);
  }
  return c;
}

/** git add/stage/rm/mv arguments: {all, paths}. "all" covers -A/-u/-p, ".", ":/" and globs. */
function parseStagingArgs(args, dir) {
  const r = { all: false, paths: [] };
  let dashdash = false;
  for (const a of args) {
    if (/^\d*[<>]/.test(a)) continue;
    if (!dashdash && a === '--') {
      dashdash = true;
      continue;
    }
    if (!dashdash && a.startsWith('-')) {
      if (/^-(-all|-update|-no-ignore-removal|-patch|-interactive|-edit|[A-Za-z]*[Aupie][A-Za-z]*)$/.test(a)) r.all = true;
      continue;
    }
    if (a === '.' || a === ':/' || a === ':' || a.startsWith(':(') || /[*?[]/.test(a)) r.all = true;
    else r.paths.push(path.resolve(dir, a));
  }
  return r;
}

/**
 * Every git commit in a shell command, with what runs before it in the same command:
 * [{dir, all, paths, adds, addAll, otherCommands, undetermined}]. The folder follows cd and -C;
 * git add/stage/rm/mv before the commit add to what it commits; any other git command that can
 * change the index makes it undetermined.
 */
export function parseCommits(cmd, cwd) {
  const out = [];
  let dir = cwd;
  const pre = { adds: [], addAll: false, otherCommands: false, undetermined: null };
  for (const seg of splitSegments(cmd)) {
    const cd = CD_SEG.exec(seg);
    if (cd) {
      const d = tokenize(cd[1])[0];
      if (!d || d === '-') pre.undetermined = `cannot follow "cd ${d || ''}"`;
      else dir = path.resolve(dir, d === '~' ? home() : d);
      continue;
    }
    const gm = GIT_SEG.exec(seg);
    if (!gm) {
      pre.otherCommands = true;
      continue;
    }
    const g = gitGlobals(gm[1], dir);
    const sub = (gm[2] || '').toLowerCase();
    const args = tokenize(gm[3] || '');
    if (sub === 'commit') {
      const c = parseCommitArgs(args);
      out.push({
        dir: g.dir,
        all: c.all,
        paths: c.paths,
        adds: [...pre.adds],
        addAll: pre.addAll,
        otherCommands: pre.otherCommands,
        undetermined: g.undetermined || pre.undetermined || c.undetermined,
      });
      continue;
    }
    if (g.undetermined) pre.undetermined = g.undetermined;
    if (STAGING_GIT.has(sub)) {
      const s = parseStagingArgs(args, g.dir);
      if (s.all) pre.addAll = true;
      pre.adds.push(...s.paths);
      continue;
    }
    if (!sub || READ_ONLY_GIT.has(sub)) continue;
    pre.undetermined = `"git ${sub}" runs before the commit in the same command and may change what is staged`;
  }
  return out;
}

/** Absolute paths a commit would include (see parseCommits); throws when that cannot be known. */
function committedFiles(c) {
  const git = (args) =>
    execFileSync('git', ['-C', c.dir, '-c', 'core.quotepath=off', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
      maxBuffer: 64 * 1024 * 1024,
    });
  const top = git(['rev-parse', '--show-toplevel']).trim();
  const names = (s) => s.split('\0').filter(Boolean).map((n) => path.resolve(top, n));
  const files = names(git(['diff', '--cached', '--name-only', '-z']));
  const needWorkTree = c.all || c.paths.length || c.addAll;
  if (needWorkTree && c.otherCommands) {
    const e = new Error('another command runs before the commit in the same command, so the working tree it would commit is unknown; run the commit as its own command');
    e.undetermined = true;
    throw e;
  }
  if (needWorkTree) {
    const wt = names(git(['diff', '--name-only', '-z']));
    if (c.all || c.addAll) files.push(...wt);
    if (c.addAll) files.push(...names(git(['ls-files', '--others', '--exclude-standard', '-z'])));
    if (c.paths.length) {
      const specs = c.paths.map((p) => ({ glob: /[*?[]/.test(p), abs: normForCompare(path.resolve(c.dir, p)) }));
      for (const f of wt) {
        const nf = normForCompare(f);
        if (specs.some((s) => s.glob || nf === s.abs || nf.startsWith(s.abs + '/'))) files.push(f);
      }
    }
  }
  return { files, adds: c.adds };
}

/** Bases a relative itemFiles entry is tried against: itemsRoot, every evidence repo or root, cwd. */
function itemBases(cfg, cwd) {
  const evs = Array.isArray(cfg.evidence) ? cfg.evidence : [cfg.evidence || {}];
  return [cfg.itemsRoot, ...evs.flatMap((e) => (e && typeof e === 'object' ? [e.repo, e.root] : [])), cwd].filter((b) => typeof b === 'string' && b);
}

/** Every unit's itemFiles as absolute candidates (one per base). */
function itemCandidates(cfg, cwd) {
  const bases = itemBases(cfg, cwd);
  const out = [];
  for (const u of Object.values(cfg.units || {})) {
    for (const f of (u && u.itemFiles) || []) {
      const dirEntry = /[\\/]$/.test(f);
      for (const c of path.isAbsolute(f) ? [f] : bases.map((b) => path.resolve(b, f))) out.push({ abs: normForCompare(c), raw: c, dirEntry, file: f });
    }
  }
  return out;
}

/** {items: [item files the commit includes]} or {undetermined: reason}. */
export function commitItemFiles(cmd, cwd, cfg) {
  const cands = itemCandidates(cfg, cwd);
  if (!cands.length) return { undetermined: 'no unit lists itemFiles in config.json, so item files cannot be told from other files' };
  const commits = parseCommits(cmd, cwd);
  if (!commits.length) return { undetermined: 'the git commit in this command could not be parsed' };
  const items = new Set();
  const all = new Set();
  for (const c of commits) {
    if (c.undetermined) return { undetermined: c.undetermined };
    let r;
    try {
      r = committedFiles(c);
    } catch (e) {
      if (e && e.undetermined) return { undetermined: e.message };
      const why = String((e && e.stderr) || (e && e.message) || e).trim().split(/\r?\n/)[0];
      return { undetermined: `git could not list the staged files in ${c.dir}: ${why}` };
    }
    for (const f of [...r.files, ...r.adds]) all.add(f);
    for (const f of r.files) {
      const nf = normForCompare(f);
      for (const k of cands) if (nf === k.abs || (k.dirEntry && nf.startsWith(k.abs + '/'))) items.add(f);
    }
    // A path staged in the same command counts, and so does a folder holding an item file.
    for (const p of r.adds) {
      const np = normForCompare(p);
      for (const k of cands) {
        if (k.abs === np || (k.dirEntry && np.startsWith(k.abs + '/'))) items.add(p);
        else if (k.abs.startsWith(np + '/')) items.add(k.raw); // a staged folder holding an item file
      }
    }
  }
  return { items: [...items], files: [...all] };
}

// "ltz lock <S> acquire|release|check --session auto": the writer cannot learn its own session id,
// so the guard, which runs before the command and sees session_id, writes it to <S>/.session-hint.
// This is the one thing the guard does even when inert (setup takes the lock before config.json
// exists), and it never blocks: a hint that cannot be written makes the lock command fail instead.
export const SESSION_HINT = '.session-hint';
const LTZ_TOKEN = /(?:^|[\\/])ltz(?:\.mjs)?$/i;

/** The state folders (absolute) that "ltz ... lock <S> <action> --session auto" commands name. */
export function lockAutoTargets(cmd, cwd) {
  const out = [];
  let dir = cwd || process.cwd();
  for (const seg of splitSegments(String(cmd || ''))) {
    const cd = CD_SEG.exec(seg);
    if (cd) {
      const d = tokenize(cd[1])[0];
      if (d && d !== '-') dir = path.resolve(dir, d === '~' ? home() : d);
      continue;
    }
    const t = tokenize(seg);
    const i = t.findIndex((x) => LTZ_TOKEN.test(x));
    if (i < 0 || t[i + 1] !== 'lock') continue;
    const pos = [];
    let session = null;
    for (let j = i + 2; j < t.length; j++) {
      if (t[j] === '--session') session = t[++j] ?? null;
      else if (t[j].startsWith('--session=')) session = t[j].slice('--session='.length);
      else if (t[j].startsWith('--')) continue;
      else pos.push(t[j]);
    }
    if (session === 'auto' && pos.length >= 2 && ['acquire', 'release', 'check'].includes(pos[1])) out.push(path.resolve(dir, pos[0]));
  }
  return out;
}

/** Write {session, at} to each such state folder that exists. Errors are swallowed. */
export function writeSessionHints(input) {
  const written = [];
  try {
    if (!input || !SHELL_TOOLS.has(input.tool_name) || typeof input.session_id !== 'string' || !input.session_id.trim()) return written;
    const cmd = String((input.tool_input && input.tool_input.command) || '');
    for (const S of lockAutoTargets(cmd, input.cwd || process.cwd())) {
      try {
        if (!fs.statSync(S).isDirectory()) continue;
        fs.writeFileSync(path.join(S, SESSION_HINT), JSON.stringify({ session: input.session_id.trim(), at: new Date().toISOString() }) + '\n');
        written.push(S);
      } catch {
        /* the lock command will say the hint is missing */
      }
    }
  } catch {
    /* never block on a hint */
  }
  return written;
}

const SEARCH_HEAD = /\b(?:grep|egrep|fgrep|rg|findstr|Select-String|sls)\b[\s\S]*?\|\s*(?:head\b|(?:Select-Object|select)\b[^|]*?\s-f(?:i(?:r(?:s(?:t)?)?)?)?\b)/i;
export function isSearchIntoHead(cmd) {
  return SEARCH_HEAD.test(cmd || '');
}

function normForCompare(p) {
  let s = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') s = s.toLowerCase();
  return s;
}

function readJson(p) {
  try {
    return JSON.parse(stripBom(fs.readFileSync(p, 'utf8')));
  } catch {
    return null;
  }
}

/** S/config.json, which must parse: the guard cannot tell what to protect without it. */
function readConfig(S) {
  const p = path.join(S, 'config.json');
  let cfg;
  try {
    cfg = JSON.parse(stripBom(fs.readFileSync(p, 'utf8')));
  } catch (e) {
    throw new Error(`S/config.json could not be read (${e.message})`);
  }
  // "historyFolders" names the folders whose judgments.jsonl is a writer file, so a malformed value
  // means the guard cannot tell what to protect (a missing folder is fine: record and sweep report it).
  const h = cfg?.historyFolders;
  if (h !== undefined && (!Array.isArray(h) || h.some((x) => typeof x !== 'string' || !x.trim()))) {
    throw new Error(`config.json: "historyFolders" must be an array of folder paths (relative to S/), not ${JSON.stringify(h)}`);
  }
  return cfg;
}

// Files only the lock holder may edit: item files, the decision log, these top-level S/ files, and
// each config "historyFolders" folder's judgments.jsonl.
// Everything else (S/<unit>/r<R>/ reader and fix-checker outputs, scratch folders) stays writable,
// so readers and a fix checker in a fresh session can write their result files.
export const LOCKED_STATE_FILES = [
  'config.json', 'loop.md', 'classes.md', 'lessons.md', 'judgments.jsonl', 'items.jsonl',
  'decisions.md', 'cross-unit-edits.txt', 'closed-unit-leads.txt', 'canaries.jsonl',
];
// The writer's files in each round folder S/<unit>/r<R>/. Agent outputs there stay writable:
// agent-*, render-*, w-* and fix-checker results fixcheck-<K>-<chunk>.jsonl.
export const LOCKED_ROUND_FILES = ['confirmed.json', 'fixlog.jsonl', 'queue.json', 'report.json', 'measure.json', 'retro.md', 'canary-plan.json'];
const LOCKED_ROUND_PATTERN = /^fixcheck-.+-input\.jsonl$/;

/** What makes a file the writer's ("an item file of unit X", "the decision log", "S/x"), or null. */
function writerFile(cfg, S, target, cwd) {
  const t = normForCompare(path.resolve(cwd || '.', target));
  const hit = itemFileHit(cfg, target, cwd);
  if (hit) return `an item file of unit ${hit.unit}`;
  if (typeof cfg.decisionLog === 'string' && cfg.decisionLog.trim()) {
    const log = path.isAbsolute(cfg.decisionLog) ? cfg.decisionLog : path.resolve(S, cfg.decisionLog);
    if (t === normForCompare(log)) return 'the decision log';
  }
  for (const f of LOCKED_STATE_FILES) if (t === normForCompare(path.join(S, f))) return `S/${f}`;
  // Each history folder's judgments.jsonl (such as S/discovery/judgments.jsonl): the main loop writes
  // overturns of a history folder's verdicts there. Nothing else in a history folder is the writer's.
  for (const h of cfg.historyFolders || []) {
    if (t === normForCompare(path.resolve(S, h, 'judgments.jsonl'))) return `S/${h.replace(/[\\/]+$/, '').replace(/\\/g, '/')}/judgments.jsonl`;
  }
  const s = normForCompare(S);
  if (t.startsWith(s + '/')) {
    const parts = t.slice(s.length + 1).split('/');
    if (parts.length === 3 && /^r\d+$/.test(parts[1])) {
      const name = parts[2];
      if (LOCKED_ROUND_FILES.includes(name) || LOCKED_ROUND_PATTERN.test(name)) return `the round file S/${parts.join('/')}`;
    }
  }
  return null;
}

/** The lock, when a session other than this one holds it (an unreadable lock counts as held). */
function otherHolder(S, sessionId) {
  const p = path.join(S, 'writer.lock');
  if (!fs.existsSync(p)) return null;
  const lock = readJson(p);
  if (!lock || !lock.session) return { session: '(unreadable writer.lock)', since: '?' };
  return lock.session !== sessionId ? lock : null;
}

function activeJobs(S) {
  const out = [];
  let units = [];
  try {
    units = fs.readdirSync(S, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return out;
  }
  for (const u of units) {
    let rounds = [];
    try {
      rounds = fs.readdirSync(path.join(S, u.name), { withFileTypes: true }).filter((d) => d.isDirectory() && /^r\d+$/.test(d.name));
    } catch {
      continue;
    }
    for (const r of rounds) {
      const qp = path.join(S, u.name, r.name, 'queue.json');
      if (!fs.existsSync(qp)) continue;
      const q = readJson(qp);
      if (!q || !Array.isArray(q.slots)) {
        // An unreadable queue cannot show its jobs are closed: count it as open.
        out.push(`${u.name}/${r.name} queue.json (unreadable)`);
        continue;
      }
      // Open: anything not done, replaced or dropped-by-owner. A queued job counts as open.
      for (const s of q.slots) {
        if (s && !CLOSED_JOB_STATES.has(s.state)) out.push(`${u.name}/${r.name} ${s.slot} (${s.state})`);
      }
    }
  }
  return out;
}

// Items often live in a different repo from the pinned evidence, so a relative itemFiles entry is
// tried against every candidate base: itemsRoot, the evidence repo or root, and the hook's cwd.
/** Every unit whose itemFiles names the target (an entry ending in / covers its folder): [{unit, status, file}], in config order. */
function itemFileUnits(cfg, target, cwd) {
  const bases = itemBases(cfg, cwd);
  const t = normForCompare(path.resolve(cwd || '.', target));
  const out = [];
  for (const [unit, u] of Object.entries(cfg.units || {})) {
    if (!u) continue;
    const f = (u.itemFiles || []).find((f) => {
      const cands = path.isAbsolute(f) ? [f] : bases.map((b) => path.resolve(b, f));
      return cands.some((c) => {
        const abs = normForCompare(c);
        return t === abs || (/[\\/]$/.test(f) && t.startsWith(abs + '/'));
      });
    });
    if (f !== undefined) out.push({ unit, status: u.status, file: f });
  }
  return out;
}
function itemFileHit(cfg, target, cwd) {
  return itemFileUnits(cfg, target, cwd)[0] || null;
}
const isClosedStatus = (status) => String(status || '').startsWith('closed');
/**
 * The guard works per file: every unit lists every file that holds its items, and an edit of an item
 * file is blocked only while every unit naming it is closed. While any is open (final-check counts as
 * open), the closed units' items in it are left to diffcheck's closed-unit check. Returns the closed
 * units that block the edit, or null.
 */
function closedItemFile(cfg, target, cwd) {
  const units = itemFileUnits(cfg, target, cwd);
  return units.length && units.every((u) => isClosedStatus(u.status)) ? units : null;
}

/** Returns a list of block reasons (empty = allow). Throws on its own errors (main blocks then). */
export function check(input, S) {
  const reasons = [];
  const cfg = readConfig(S);
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const cwd = input.cwd || process.cwd();
  const isShell = SHELL_TOOLS.has(tool);
  const cmd = isShell ? String(ti.command || '') : '';
  const commit = isShell && isGitCommit(cmd);
  const write = WRITE_TOOLS.has(tool);
  const holder = write || commit ? otherHolder(S, input.session_id) : null;
  const lockText = holder ? `S/writer.lock is held by session ${holder.session} since ${holder.since}` : '';

  if (commit) {
    const jobs = activeJobs(S);
    if (jobs.length || holder) {
      const r = commitItemFiles(cmd, cwd, cfg);
      // While readers read, a commit that would include item files is blocked.
      if (jobs.length) {
        if (r.undetermined) {
          reasons.push(
            `git commit while readers are still reading (${jobs.join(', ')}), and what the commit includes could not be determined: ${r.undetermined}. ` +
              'Commit after the round\'s reading is done, or stage only non-item files and commit from the repo folder.',
          );
        } else if (r.items.length) {
          reasons.push(`git commit would include item files (${r.items.join(', ')}) while readers are still reading (${jobs.join(', ')}). Commit item edits after the round's reading is done.`);
        }
      }
      // Another session holds the lock: its commits may not include the writer's files.
      if (holder) {
        const mine = r.undetermined ? [] : [...new Set([...r.items, ...r.files.filter((f) => writerFile(cfg, S, f, cwd))])];
        if (r.undetermined) reasons.push(`${lockText}, and what this commit includes could not be determined: ${r.undetermined}.`);
        else if (mine.length) reasons.push(`${lockText}; this commit would include the writer's files (${mine.join(', ')}). Only the writer session commits them.`);
      }
    }
  }
  if (write) {
    const target = ti.file_path || ti.notebook_path;
    if (target) {
      const closed = closedItemFile(cfg, target, cwd);
      if (closed) {
        const named = closed.map((u) => `${u.unit} (${u.status})`);
        const who = closed.length === 1
          ? `unit ${closed[0].unit}, which is ${closed[0].status}`
          : `units ${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}, which are all closed`;
        reasons.push(`${target} holds items of ${who}. Closed units are not edited; log a lead instead.`);
      }
      if (holder) {
        const why = writerFile(cfg, S, target, cwd);
        if (why) {
          reasons.push(
            `${target} is ${why}, and ${lockText}; only the writer session edits it. ` +
              'Readers and fix checkers write their result files under S/<unit>/r<R>/ and scratch files, which stay allowed.',
          );
        }
      }
    }
  }
  if (isShell && isSearchIntoHead(cmd)) {
    reasons.push('a search piped into head/Select-Object -First truncates its output; a search backing a bound must be unlimited (use -l or -c, or narrower paths).');
  }
  return reasons;
}

function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    raw = '';
  }
  let input = null;
  try {
    input = JSON.parse(stripBom(raw));
  } catch {
    input = null;
  }
  const cwd = (input && input.cwd) || process.cwd();
  // Before anything else, and whether or not the guard is active: the session hint for
  // "lock ... --session auto".
  writeSessionHints(input);
  const S = findState(cwd);
  if (!S) return 0;
  let reasons;
  try {
    if (!input || typeof input !== 'object') throw new Error('the hook input was not JSON, so nothing could be checked');
    reasons = check(input, S);
  } catch (e) {
    throw new Error(`${e && e.message ? e.message : e} (state folder ${S})`);
  }
  if (!reasons.length) return 0;
  process.stderr.write(`ltz guard (state ${S}) blocked ${input.tool_name}:\n- ${reasons.join('\n- ')}\n`);
  return 2;
}

const self = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
const same = process.platform === 'win32' ? entry.toLowerCase() === self.toLowerCase() : entry === self;
if (same) {
  try {
    process.exitCode = main();
  } catch (e) {
    // Fail closed: a guard that cannot check must not let the call through.
    process.stderr.write(`ltz guard: guard error: ${e && e.message ? e.message : e}; fix or disable the guard\n`);
    process.exitCode = 2;
  }
}
