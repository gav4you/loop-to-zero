// reach <S> --to <rev> [--unit <unit>]: what moving the evidence pin to <rev> would reach, before the
// owner decides. Counting only the items that cite a changed file undercounts: a universal claim ("no
// caller does X") can be broken by a changed file it never cites. So each unit's items are put in
// three groups:
//   cites      - the item cites a file changed between the pin and <rev> (inside boundaryPaths);
//   search     - the item states a universal word, cites no changed file, and the last structured
//                fixlog search logged for it finds different hits at <rev> than at the pin;
//   unsearched - the item states a universal word, cites no changed file, and has no structured search
//                to re-run: the writer checks it against the changed files by hand, or counts it in.
// It reports; it never fails on what it finds and never judges.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fail, globToRegExp, listRounds, parseCite, readJsonl, LtzError } from './util.mjs';
import { loadConfig, loadItems, requireUnit } from './state.mjs';
import { evidenceSources } from './sources.mjs';
import { countWord } from './textchecks.mjs';
import { PinScanner, isStructuredSearch } from './searchverify.mjs';

const MAX_BUFFER = 1024 * 1024 * 1024;

function changedFiles(source, to) {
  let out;
  try {
    // --no-renames: a renamed file is listed under its old and its new path, so cites of either count.
    out = execFileSync('git', ['-C', source.repo, 'diff', '--name-only', '--no-renames', '-z', source.pin, to, '--'], { maxBuffer: MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    fail(`git diff ${source.pin} ${to} failed in ${source.repo}: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  }
  return out.toString('utf8').split('\0').filter(Boolean).map((f) => source.prefix + f);
}

function sameLocations(a, b) {
  if (a.hits !== b.hits || a.locations.size !== b.locations.size) return false;
  for (const [k, v] of a.locations) if (b.locations.get(k) !== v) return false;
  return true;
}

export function reach({ S, to, unit }) {
  if (!to) fail('reach needs --to <rev>: the commit or tag the pin would move to');
  const cfg = loadConfig(S);
  if (unit) requireUnit(cfg, unit);
  const sources = evidenceSources(cfg);
  const git = sources.filter((s) => s.type === 'git');
  if (git.length !== 1 || sources.length !== 1) {
    fail(`reach works on a single git evidence source (this config has ${sources.length} source(s), ${git.length} git); compare the pins of each source by hand`);
  }
  const src = git[0];
  const boundary = Array.isArray(cfg.boundaryPaths) && cfg.boundaryPaths.length ? cfg.boundaryPaths.map(globToRegExp) : null;
  const changed = changedFiles(src, to).filter((f) => !boundary || boundary.some((r) => r.test(f)));
  const changedSet = new Set(changed.map((f) => f.toLowerCase()));

  const fields = Array.isArray(cfg.itemFields) && cfg.itemFields.length ? cfg.itemFields : ['title'];
  const words = cfg.universalWords;
  const units = unit ? [unit] : Object.keys(cfg.units);

  // The last structured search logged for each (unit, id), over every round of every unit.
  const lastSearch = new Map();
  for (const u of Object.keys(cfg.units)) {
    for (const r of listRounds(path.join(S, u))) {
      const p = path.join(r.dir, 'fixlog.jsonl');
      if (!fs.existsSync(p)) continue;
      for (const { obj: e } of readJsonl(p, { what: `${u}/${r.name}/fixlog.jsonl` }).rows) {
        if (!isStructuredSearch(e.search)) continue;
        lastSearch.set(`${e.unit || u}\u0000${e.id}`, { search: e.search, where: `${u}/${r.name}` });
      }
    }
  }

  const before = new PinScanner(cfg);
  const after = new PinScanner({ ...cfg, evidence: { type: 'git', repo: src.repo, pin: to, prefix: src.prefix } });
  // A boundary that selects no file at either commit would report "0 files changed" for any move.
  if (boundary) {
    const selects = (sc) => sc.files().some((f) => boundary.some((r) => r.test(f)));
    if (!selects(before) && !selects(after)) {
      fail(
        `boundaryPaths (${cfg.boundaryPaths.join(', ')}) select no file at ${src.pin} or at ${to}; check the globs ` +
          '("**" crosses folders, "*" and "?" do not, a trailing "/" covers a folder; braces and a bare folder name are literal)',
      );
    }
  }
  const out = [];
  const problems = [];
  const totals = { cites: 0, search: 0, unsearched: 0, items: 0 };
  const items = loadItems(S);
  for (const u of units) {
    const its = items.filter((it) => it.unit === u);
    const g = { cites: [], search: [], unsearched: [] };
    for (const it of its) {
      const cites = (Array.isArray(it.cites) ? it.cites : []).map((c) => parseCite(c).path.toLowerCase());
      if (cites.some((c) => changedSet.has(c))) {
        g.cites.push(it.id);
        continue;
      }
      const text = fields.map((f) => (typeof it[f] === 'string' ? it[f] : '')).join('\n');
      const found = words.filter((w) => countWord(text, w) > 0);
      if (!found.length) continue;
      const ls = lastSearch.get(`${u}\u0000${it.id}`);
      if (!ls) {
        g.unsearched.push(`${it.id} [${found.join(', ')}]`);
        continue;
      }
      try {
        const a = before.run({ ...ls.search, paths: undefined });
        const b = after.run({ ...ls.search, paths: undefined });
        if (!sameLocations(a, b)) g.search.push(`${it.id} /${ls.search.regex}/ (${ls.where}): ${a.hits} -> ${b.hits} ${b.unit}`);
      } catch (err) {
        if (!(err instanceof LtzError)) throw err;
        problems.push(`${u} ${it.id}: its search from ${ls.where} cannot run: ${err.message}`);
        g.unsearched.push(`${it.id} [${found.join(', ')}] (search not runnable)`);
      }
    }
    totals.items += its.length;
    totals.cites += g.cites.length;
    totals.search += g.search.length;
    totals.unsearched += g.unsearched.length;
    const status = cfg.units[u].status;
    out.push(`${u} (${its.length} items, ${status}): cite a changed file ${g.cites.length}; universal, search hits change ${g.search.length}; universal, no search to re-run ${g.unsearched.length}`);
    if (g.cites.length) out.push(`  cites: ${g.cites.join(', ')}`);
    for (const s of g.search) out.push(`  search: ${s}`);
    if (g.unsearched.length) out.push(`  unsearched: ${g.unsearched.join(', ')}`);
  }
  return {
    output: [`changed inside ${boundary ? 'boundaryPaths' : 'the repo (no boundaryPaths)'} between ${src.pin} and ${to}: ${changed.length} file(s)${changed.length ? ` (${changed.slice(0, 10).join(', ')}${changed.length > 10 ? ', ...' : ''})` : ''}`, ...out].join('\n'),
    problems,
    summary: `reach: ${totals.cites} item(s) cite a changed file, ${totals.search} universal item(s) whose search hits change, ${totals.unsearched} universal item(s) with no search to re-run, in ${totals.items} items`,
  };
}
