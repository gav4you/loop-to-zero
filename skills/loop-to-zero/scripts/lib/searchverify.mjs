// Running a fixlog search at the pin: diffcheck --verify-searches.
// A structured search is {"regex": "...", "flags": "...", "paths": ["glob", ...],
// "count": "matches" (the default: every match) | "lines" (matching lines) | "files" (files with a match)}.
// The tool lists the evidence files at the pin (git ls-tree, or a folder walk), reads them (git
// cat-file --batch, or the files) and counts with the same JS regex the fixlog states, so the count
// means exactly what the regex means. git grep's own regex dialect would differ.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fail, globToRegExp, normPath, listRounds, readJsonl, LtzError } from './util.mjs';
import { splitLines } from './evidence.mjs';
import { loadConfig, requireUnit } from './state.mjs';
import { evidenceSources, routeSource, pinRecord, loadPinRecord, pinDifference, configAtPin } from './sources.mjs';

const squash = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

/** A value as text: the string, or every string field of an object (a whole item, for "*"). */
export function textOf(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return Object.values(v).filter((x) => typeof x === 'string').join('\n');
  return '';
}

/**
 * A scopeNote excuses a deliberately bounded search only when the item states the bound: the entry's
 * scopeText (the scope words) must appear, case- and spacing-insensitively, in the field's text.
 * Pass the field's CURRENT text (diffcheck) or its last logged "new" (searches), so a later edit
 * that drops the bound is caught. Returns null when that holds (or there is no scopeNote).
 */
export function scopeTextProblem(e, text = textOf(e.new)) {
  const has = (s) => typeof s === 'string' && s.trim().length > 0;
  if (!has(e.scopeNote)) return null;
  if (!has(e.scopeText)) return 'a "scopeNote" needs a "scopeText": the scope words the item states (for example "outside tests and fixtures")';
  if (!squash(text).includes(squash(e.scopeText))) return `"scopeText" ${JSON.stringify(e.scopeText)} does not appear in the new text, so the item never states the bound`;
  return null;
}

const MAX_BUFFER = 1024 * 1024 * 1024;

/**
 * searches <S> [--rounds <unit>,...|all]: re-run every structured fixlog search of those rounds at
 * the pin over boundaryPaths (not the logged paths), and report each whose boundary-wide count
 * differs from its logged hits: a scope that was too narrow. Past and closed rounds work, since
 * nothing is compared with the current items.
 */
export function searches({ S, rounds }) {
  const cfg = loadConfig(S);
  const units = !rounds || rounds === 'all' ? Object.keys(cfg.units) : rounds.split(',').map((u) => requireUnit(cfg, u.trim()));
  const scanner = new PinScanner(cfg);
  // Each round is re-run at the pin its snapshot recorded (pin.json), so a pin moved since does not
  // show up as a too-narrow scope. A round with no pin.json is re-run at the current pin.
  const nowPin = pinRecord(cfg);
  const scanners = new Map();
  let ownPin = 0;
  let noPin = 0;
  const out = [];
  const bounded = [];
  const problems = [];
  let structured = 0;
  let freeText = 0;
  let differ = 0;
  for (const unit of units) {
    for (const r of listRounds(path.join(S, unit))) {
      const p = path.join(r.dir, 'fixlog.jsonl');
      if (!fs.existsSync(p)) continue;
      const rows = readJsonl(p, { what: `${unit}/${r.name}/fixlog.jsonl` }).rows;
      const rec = loadPinRecord(r.dir);
      let roundScanner = scanner;
      if (!rec) noPin++;
      else if (pinDifference(rec, nowPin)) {
        const k = JSON.stringify(rec);
        if (!scanners.has(k)) scanners.set(k, new PinScanner(configAtPin(cfg, rec)));
        roundScanner = scanners.get(k);
        ownPin++;
      }
      // The field's final text in this round: the last "new" logged for that id and field.
      const lastNew = new Map();
      for (const { obj: x } of rows) lastNew.set(`${x.id}\u0000${x.field}`, x.new);
      for (const { lineNo, obj: e } of rows) {
        if (e.search === undefined) continue;
        const where = `${unit}/${r.name} ${e.id}.${e.field} (fixlog line ${lineNo})`;
        if (typeof e.search === 'string') {
          freeText++;
          continue;
        }
        if (!isStructuredSearch(e.search)) {
          problems.push(`${where}: "search" is neither free text nor {"regex", ...}`);
          continue;
        }
        structured++;
        let res;
        try {
          res = roundScanner.run({ ...e.search, paths: undefined });
        } catch (err) {
          if (!(err instanceof LtzError)) throw err;
          problems.push(`${where}: ${err.message}`);
          continue;
        }
        if (typeof e.hits === 'number' && e.hits === res.hits) continue;
        const line = `${where}: /${e.search.regex}/ logged hits ${JSON.stringify(e.hits)} over ${JSON.stringify(e.search.paths || 'the boundary')}; boundary-wide ${res.hits} ${res.unit}`;
        const noted = typeof e.scopeNote === 'string' && e.scopeNote.trim();
        const sc = noted ? scopeTextProblem(e, textOf(lastNew.get(`${e.id}\u0000${e.field}`))) : null;
        if (noted && !sc) bounded.push(`${line} (bounded on purpose: ${e.scopeNote.slice(0, 80)})`);
        else {
          differ++;
          out.push(`DIFFERS ${line}${sc ? ` (scopeNote not accepted: ${sc})` : ''}`);
        }
      }
    }
  }
  if (!structured && !problems.length) fail(`no structured fixlog searches in ${units.join(', ')}; nothing to re-run`);
  if (bounded.length) out.push('bounded by a scopeNote (not counted as failures):', ...bounded.map((b) => `  ${b}`));
  return {
    output: out.join('\n'),
    problems,
    failed: differ > 0 || problems.length > 0,
    summary:
      `searches: ${structured} structured search(es) re-run over ${scanner.boundary ? 'boundaryPaths' : 'every file (no boundaryPaths)'} at ${scanner.describe()}; ` +
      `${differ} differ from their logged hits, ${bounded.length} bounded by a scopeNote, ${freeText} free-text not re-runnable` +
      (ownPin ? `; ${ownPin} round(s) re-run at their own snapshot pin (the pin has moved since)` : '') +
      (noPin ? `; ${noPin} round(s) with no pin.json, re-run at the current pin` : ''),
  };
}

export function isStructuredSearch(s) {
  return !!s && typeof s === 'object' && !Array.isArray(s) && typeof s.regex === 'string' && s.regex.length > 0;
}

function walk(root, rel = '', out = []) {
  for (const d of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (d.name === '.git') continue;
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) walk(root, r, out);
    else if (d.isFile()) out.push(r);
  }
  return out;
}

export class PinScanner {
  constructor(cfg) {
    this.cfg = cfg;
    this.sources = evidenceSources(cfg);
    this.texts = new Map();
    this.boundary = Array.isArray(cfg.boundaryPaths) && cfg.boundaryPaths.length ? cfg.boundaryPaths : null;
  }

  describe() {
    return this.sources.map((s) => `${s.prefix ? `${s.prefix} -> ` : ''}${s.type === 'git' ? `${s.repo} at ${s.pin}` : s.root}`).join('; ');
  }

  /**
   * Every evidence file as a cite path (the source's prefix + its own path). A file a source holds
   * under another source's longer prefix routes to that other source, so it is left out here.
   */
  files() {
    if (this.all) return this.all;
    this.all = [];
    for (const s of this.sources) {
      let own;
      if (s.type === 'git') {
        const out = execFileSync('git', ['-C', s.repo, 'ls-tree', '-r', '-z', '--name-only', s.pin], { maxBuffer: MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe'] });
        own = out.toString('utf8').split('\0').filter(Boolean);
      } else {
        own = walk(path.resolve(s.root)).map(normPath);
      }
      for (const f of own) {
        const p = s.prefix + f;
        const r = routeSource(this.sources, p);
        if (r && r.source === s) this.all.push(p);
      }
    }
    return this.all;
  }

  select(globs) {
    const res = globs.map(globToRegExp);
    return this.files().filter((f) => res.some((r) => r.test(f)));
  }

  /** Text of each path at the pin (binary files are skipped), each read from its own source. */
  read(paths) {
    const need = paths.filter((p) => !this.texts.has(p));
    const bySource = new Map();
    for (const p of need) {
      const r = routeSource(this.sources, p);
      if (!r) {
        this.texts.set(p, null);
        continue;
      }
      if (!bySource.has(r.source)) bySource.set(r.source, []);
      bySource.get(r.source).push({ p, rel: r.rel });
    }
    for (const [s, list] of bySource) {
      if (s.type === 'git') {
        const input = list.map((x) => `${s.pin}:${x.rel}`).join('\n') + '\n';
        const buf = execFileSync('git', ['-C', s.repo, 'cat-file', '--batch'], { input, maxBuffer: MAX_BUFFER, stdio: ['pipe', 'pipe', 'pipe'] });
        let off = 0;
        for (const { p } of list) {
          const nl = buf.indexOf(10, off);
          const header = buf.slice(off, nl).toString('utf8');
          off = nl + 1;
          const m = /^\S+ (\S+) (\d+)$/.exec(header);
          if (!m) {
            this.texts.set(p, null);
            continue;
          }
          const size = Number(m[2]);
          const body = buf.slice(off, off + size);
          off += size + 1;
          this.texts.set(p, m[1] === 'blob' && !body.includes(0) ? body.toString('utf8') : null);
        }
      } else {
        for (const { p, rel } of list) {
          const body = fs.readFileSync(path.join(path.resolve(s.root), rel));
          this.texts.set(p, body.includes(0) ? null : body.toString('utf8'));
        }
      }
    }
    return paths.map((p) => [p, this.texts.get(p)]);
  }

  /**
   * Run one structured search: {hits, count, unit, scanned, narrower, locations}. locations maps each
   * hit location to its hits there: "path:line" for count "matches" (a line with two matches holds
   * 2) or "lines", and "path" for count "files". Paths are cite paths (a source's prefix included).
   */
  run(search) {
    const flags = String(search.flags ?? '').replace(/[gy]/g, '');
    let re;
    try {
      re = new RegExp(search.regex, flags);
    } catch (e) {
      fail(`search regex ${JSON.stringify(search.regex)} does not compile: ${e.message}`);
    }
    if (search.paths !== undefined && (!Array.isArray(search.paths) || search.paths.some((x) => typeof x !== 'string'))) fail('search "paths" must be an array of globs');
    const count = search.count ?? 'matches';
    if (!['matches', 'lines', 'files'].includes(count)) fail(`search "count" must be "matches", "lines" or "files" (got ${JSON.stringify(count)})`);
    const globs = search.paths && search.paths.length ? search.paths : this.boundary || ['**'];
    const scope = this.select(globs);
    let matches = 0;
    let lines = 0;
    let files = 0;
    const locations = new Map();
    const at = (loc, k) => locations.set(loc, (locations.get(loc) || 0) + k);
    for (const [p, text] of this.read(scope)) {
      if (text === null) continue;
      let n = 0;
      const ls = splitLines(text);
      for (let i = 0; i < ls.length; i++) {
        const l = ls[i];
        if (!re.test(l)) continue;
        n++;
        // Every match on the line, stepping past zero-length matches.
        const g = new RegExp(re.source, flags + 'g');
        let m;
        let k = 0;
        while ((m = g.exec(l))) {
          matches++;
          k++;
          if (m[0] === '') g.lastIndex++;
        }
        if (count === 'matches') at(`${p}:${i + 1}`, k);
        else if (count === 'lines') at(`${p}:${i + 1}`, 1);
      }
      lines += n;
      if (n) {
        files++;
        if (count === 'files') at(p, 1);
      }
    }
    let narrower = null;
    if (this.boundary && search.paths && search.paths.length) {
      const inScope = new Set(scope);
      const bound = this.select(this.boundary);
      const left = bound.filter((f) => !inScope.has(f));
      if (left.length) narrower = { boundary: bound.length, covered: bound.length - left.length, example: left[0] };
    }
    const hits = count === 'files' ? files : count === 'lines' ? lines : matches;
    const unit = count === 'files' ? 'matching files' : count === 'lines' ? 'matching lines' : 'matches';
    return { hits, count, unit, scanned: scope.length, narrower, locations };
  }
}

/** A location compared case- and slash-insensitively ("src\\A.js:3" is "src/a.js:3"). */
export function normLocation(s) {
  return String(s).trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').toLowerCase();
}

/**
 * The shape of a structured search's "judged": [{"at": "path:line", "why": "<short reason>"}], one
 * entry per hit (empty for 0 hits). Returns a problem, or null.
 */
export function judgedShapeProblem(judged) {
  if (!Array.isArray(judged)) {
    return 'a structured search needs "judged": [{"at": "path:line", "why": "<short reason>"}], one entry per hit judged at the pin ([] for 0 hits)';
  }
  for (const [i, x] of judged.entries()) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || typeof x.at !== 'string' || !x.at.trim()) return `"judged"[${i}] needs an "at": the hit's location (path:line)`;
    if (typeof x.why !== 'string' || !x.why.trim()) return `"judged"[${i}] (${x.at}) needs a non-empty "why": why that hit does or does not refute the claim`;
  }
  return null;
}

/**
 * Compare "judged" with the hit locations found at the pin, as multisets (a location with two hits is
 * judged twice). Returns {missing, extra}: each "location" or "location (N hits, judged M)".
 */
export function compareJudged(judged, locations) {
  const want = new Map();
  for (const [loc, n] of locations) want.set(normLocation(loc), (want.get(normLocation(loc)) || 0) + n);
  const got = new Map();
  for (const x of judged) got.set(normLocation(x.at), (got.get(normLocation(x.at)) || 0) + 1);
  const label = (loc, n, m) => (n <= 1 && m <= 1 ? loc : `${loc} (${n} hit${n === 1 ? '' : 's'}, judged ${m})`);
  const missing = [];
  const extra = [];
  for (const [loc, n] of want) {
    const m = got.get(loc) || 0;
    if (m < n) missing.push(label(loc, n, m));
  }
  for (const [loc, m] of got) {
    const n = want.get(loc) || 0;
    if (m > n) extra.push(label(loc, n, m));
  }
  return { missing, extra };
}
