// diffcheck <S> <unit> <R>: the change set must equal fixlog.jsonl, and changed text is checked.
import fs from 'node:fs';
import path from 'node:path';
import { readJsonl, canon, listRounds, LtzError } from './util.mjs';
import { PinScanner, isStructuredSearch, scopeTextProblem, textOf, judgedShapeProblem, compareJudged } from './searchverify.mjs';
import { loadConfig, requireUnit, requireRoundDir, verifySnapshot, loadSnapshot, loadItems, loadCanaries, checkItems } from './state.mjs';
import { addedUniversals, newClosedLists, shapeFlags, universalClauses } from './textchecks.mjs';
import { loadPatterns, matchItem, patternFields } from './patterns.mjs';

function short(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s === undefined ? 'undefined' : s.length > 70 ? s.slice(0, 67) + '...' : s;
}

export function loadRegressionPatterns(S) {
  const dir = path.join(S, 'checks', 'patterns');
  if (!fs.existsSync(dir)) return { patterns: [], dirMissing: true };
  const patterns = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    for (const p of loadPatterns(path.join(dir, f))) patterns.push({ ...p, file: f });
  }
  return { patterns, dirMissing: false };
}

export function diffcheck({ S, unit, R, verifySearches = true }) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  const rd = requireRoundDir(S, unit, R);
  verifySnapshot(rd);
  const snap = loadSnapshot(rd);
  const all = loadItems(S);
  const snapById = new Map(snap.map((it) => [it.id, it]));
  const curById = new Map(all.map((it) => [it.id, it]));
  const cur = all.filter((it) => it.unit === unit);
  const mismatches = [];
  const flags = [];
  const warnings = [];

  for (const c of loadCanaries(S)) if (curById.has(c.id)) flags.push(`${c.id} is a canary and is in S/items.jsonl; remove it`);

  // The change set, field by field (including cites), plus added and removed items.
  const changed = new Map();
  const setChange = (id, f, o, n) => {
    if (!changed.has(id)) changed.set(id, new Map());
    changed.get(id).set(f, { old: o, new: n });
  };
  for (const it of snap) {
    const c = curById.get(it.id);
    if (!c) {
      setChange(it.id, '*', it, null);
      continue;
    }
    for (const f of new Set([...Object.keys(it), ...Object.keys(c)])) {
      if (canon(it[f]) !== canon(c[f])) setChange(it.id, f, it[f], c[f]);
    }
  }
  for (const c of cur) if (!snapById.has(c.id)) setChange(c.id, '*', null, c);

  // fixlog.jsonl
  const fixPath = path.join(rd, 'fixlog.jsonl');
  const { rows, missing } = readJsonl(fixPath, { what: 'fixlog.jsonl', mustExist: false });
  // Entries for this unit (no "unit", or this unit) make up its change set. Entries with another
  // "unit" are cross-unit edits, checked against that unit's latest snapshot below.
  const logged = new Map();
  const cross = new Map(); // unit -> [entries]
  const allEntries = [];
  const add = (map, e) => {
    if (!map.has(e.id)) map.set(e.id, new Map());
    if (!map.get(e.id).has(e.field)) map.get(e.id).set(e.field, []);
    map.get(e.id).get(e.field).push(e);
  };
  for (const { lineNo, obj } of rows) {
    const e = { ...obj, lineNo };
    if (typeof e.id !== 'string' || typeof e.field !== 'string') {
      mismatches.push(`fixlog.jsonl line ${lineNo}: needs string "id" and "field"`);
      continue;
    }
    if (!('old' in e) || !('new' in e)) mismatches.push(`fixlog.jsonl line ${lineNo}: ${e.id}.${e.field} needs "old" and "new"`);
    if (!snapById.has(e.id) && !curById.has(e.id)) mismatches.push(`fixlog.jsonl line ${lineNo}: ${e.id} is not an item`);
    allEntries.push(e);
    if (e.unit !== undefined && e.unit !== unit) {
      if (!cross.has(e.unit)) cross.set(e.unit, []);
      cross.get(e.unit).push(e);
      continue;
    }
    const owner = curById.get(e.id)?.unit;
    if (!snapById.has(e.id) && owner && owner !== unit) {
      mismatches.push(`fixlog.jsonl line ${lineNo}: ${e.id} belongs to unit ${owner}; a cross-unit edit needs "unit": "${owner}"`);
      continue;
    }
    add(logged, e);
  }

  for (const [id, fields] of changed) {
    for (const [f, d] of fields) {
      const entries = logged.get(id)?.get(f);
      if (!entries) {
        mismatches.push(`${id}.${f} changed (${short(d.old)} -> ${short(d.new)}) but is not in fixlog.jsonl`);
        continue;
      }
      if (canon(entries[0].old) !== canon(d.old)) mismatches.push(`${id}.${f}: fixlog "old" (line ${entries[0].lineNo}) is not the snapshot value`);
      const last = entries[entries.length - 1];
      if (canon(last.new) !== canon(d.new)) mismatches.push(`${id}.${f}: fixlog "new" (line ${last.lineNo}) is not the current value`);
      for (let i = 1; i < entries.length; i++) {
        if (canon(entries[i].old) !== canon(entries[i - 1].new)) mismatches.push(`${id}.${f}: fixlog line ${entries[i].lineNo} "old" does not follow line ${entries[i - 1].lineNo} "new"`);
      }
    }
  }
  for (const [id, fields] of logged) {
    if (!changed.has(id)) {
      mismatches.push(`${id} is in fixlog.jsonl but did not change`);
      continue;
    }
    for (const f of fields.keys()) if (!changed.get(id).has(f)) mismatches.push(`${id}.${f} is in fixlog.jsonl but that field did not change`);
  }

  // Cross-unit edits: every other open unit named in this fixlog is compared with its latest
  // snapshot. Its changed set must be explained by the entries for it here, the entries of its own
  // latest round's fixlog (fixes it made since that snapshot), and the entries with "unit": U in any
  // other round's fixlog (cross-unit edits from earlier rounds while U was not snapshotted again).
  // "Logged but did not change" is checked for this round's entries only.
  const here = path.resolve(rd);
  const taggedElsewhere = (U) => {
    const out = [];
    for (const u2 of Object.keys(cfg.units)) {
      for (const r of listRounds(path.join(S, u2))) {
        if (path.resolve(r.dir) === here) continue;
        const p = path.join(r.dir, 'fixlog.jsonl');
        if (!fs.existsSync(p)) continue;
        for (const x of readJsonl(p, { what: p }).rows) if (x.obj && x.obj.unit === U) out.push({ ...x.obj, lineNo: x.lineNo });
      }
    }
    return out;
  };
  const crossText = []; // [{id, f, old, new, backing}] for the text checks below
  const crossIds = new Set(); // for the regression patterns below
  for (const [U, entries] of cross) {
    const at = `fixlog.jsonl line ${entries[0].lineNo}`;
    if (!Object.prototype.hasOwnProperty.call(cfg.units, U)) {
      mismatches.push(`${at}: "unit": "${U}" is not a unit in config.json`);
      continue;
    }
    if (String(cfg.units[U].status || '').startsWith('closed')) continue; // the closed-unit check below flags it
    for (const e of entries) {
      const owner = curById.get(e.id)?.unit ?? null;
      if (owner && owner !== U) mismatches.push(`fixlog.jsonl line ${e.lineNo}: ${e.id} is an item of ${owner}, not ${U}`);
    }
    const rs = listRounds(path.join(S, U)).filter((r) => fs.existsSync(path.join(r.dir, 'snapshot.jsonl')));
    if (!rs.length) {
      mismatches.push(`${at}: unit ${U} has no round snapshot to compare its cross-unit edits with; take a baseline first ("node <skill>/scripts/ltz.mjs snapshot <S> ${U} <R>")`);
      continue;
    }
    const last = rs[rs.length - 1];
    const sp = path.join(last.dir, 'snapshot.jsonl');
    const base = checkItems(readJsonl(sp, { what: sp }).rows, sp);
    const baseById = new Map(base.map((it) => [it.id, it]));
    const ownP = path.join(last.dir, 'fixlog.jsonl');
    const own = fs.existsSync(ownP) ? readJsonl(ownP, { what: ownP }).rows.map((x) => ({ ...x.obj, lineNo: x.lineNo, mine: true })).filter((e) => e.unit === undefined || e.unit === U) : [];
    const expected = new Map();
    for (const e of [...own, ...taggedElsewhere(U), ...entries]) add(expected, e);
    const mine = new Map(); // this round's entries for U: they back the text checks
    for (const e of entries) add(mine, e);
    const changedU = new Map();
    const note = (id, f, o, n) => {
      if (!changedU.has(id)) changedU.set(id, new Map());
      changedU.get(id).set(f, { old: o, new: n });
    };
    for (const it of base) {
      const c = curById.get(it.id);
      if (!c) note(it.id, '*', it, null);
      else for (const f of new Set([...Object.keys(it), ...Object.keys(c)])) if (canon(it[f]) !== canon(c[f])) note(it.id, f, it[f], c[f]);
    }
    for (const c of all) if (c.unit === U && !baseById.has(c.id)) note(c.id, '*', null, c);
    for (const [id, fs2] of changedU) {
      for (const [f, d] of fs2) {
        const es = expected.get(id)?.get(f);
        if (!es) {
          mismatches.push(`${U}: ${id}.${f} changed since ${U}/${last.name} but is logged neither here (with "unit": "${U}"), nor in ${U}/${last.name}/fixlog.jsonl, nor in another round's fixlog with "unit": "${U}"`);
          continue;
        }
        if (!es.some((e) => canon(e.old) === canon(d.old))) mismatches.push(`${U}: ${id}.${f}: no logged "old" is the ${U}/${last.name} snapshot value`);
        if (!es.some((e) => canon(e.new) === canon(d.new))) mismatches.push(`${U}: ${id}.${f}: no logged "new" is the current value`);
        // The fields this round edits in U get the same text and regression checks as this unit's.
        if (mine.has(id) && (mine.get(id).has(f) || mine.get(id).has('*'))) {
          crossText.push({
            id, f, old: d.old, new: d.new,
            backing: [...(mine.get(id).get(f) || []), ...(mine.get(id).get('*') || [])],
            entries: mine.get(id).get(f) || [],
            requirement: baseById.get(id)?.type === 'requirement' || curById.get(id)?.type === 'requirement',
          });
          crossIds.add(id);
        }
      }
    }
    for (const e of entries) {
      if (!changedU.get(e.id)?.has(e.field)) mismatches.push(`fixlog.jsonl line ${e.lineNo}: ${e.id}.${e.field} is logged for unit ${U} but did not change since ${U}/${last.name}`);
    }
  }

  // Searches. Every structured search must say what it cannot see ("blindSpots"). Unless
  // --no-verify-searches, each is run at the pin: its count must equal "hits", a free-text search
  // fails (it cannot be run), and paths narrower than boundaryPaths fail unless a "scopeNote"
  // justifies a deliberately bounded claim.
  const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
  const scanner = verifySearches ? new PinScanner(cfg) : null;
  let unverified = 0;
  // Every entry, this unit's and cross-unit ones, gets the search checks.
  for (const e of allEntries) {
    {
      {
        const id = e.id;
        const f = e.field;
        const where = `${id}.${f} (fixlog line ${e.lineNo})`;
        // A scopeNote excuses a bounded search only when the item states the bound: its scopeText
        // (the scope words) must appear in the new text.
        // Checked against the field's current text, so a later edit that drops the bound is caught.
        const curItem = curById.get(id);
        const sc = scopeTextProblem(e, curItem ? textOf(f === '*' ? curItem : curItem[f]) : textOf(e.new));
        if (sc) mismatches.push(`${where}: ${sc}`);
        if (e.search === undefined) continue;
        if (typeof e.search === 'string') {
          if (verifySearches) {
            mismatches.push(`${where}: a free-text search cannot be run at the pin (${JSON.stringify(e.search.slice(0, 60))}); log it as {"regex", "paths"?} with "hits" and "blindSpots"`);
          } else unverified++;
          continue;
        }
        if (!isStructuredSearch(e.search)) {
          mismatches.push(`${where}: "search" must be free text or {"regex", "flags"?, "paths"?, "count"?: "matches"|"lines"|"files"}`);
          continue;
        }
        if (!nonEmpty(e.blindSpots) && !nonEmpty(e.search.blindSpots)) {
          mismatches.push(`${where}: a structured search needs "blindSpots": what it cannot see (options in variables, multi-line calls, dynamic names)`);
        }
        // Every hit must have been judged at the pin, not only counted: "judged" holds one
        // {"at", "why"} per hit. A bare count ("hitsJudged") proves nothing about each hit.
        if (Object.prototype.hasOwnProperty.call(e, 'hitsJudged')) {
          mismatches.push(`${where}: "hitsJudged" is no longer accepted: a count proves nothing about each hit. Give "judged": [{"at": "path:line", "why": "<short reason>"}], one entry per hit`);
        }
        const shape = judgedShapeProblem(e.judged);
        if (shape) mismatches.push(`${where}: ${shape}`);
        if (!verifySearches) {
          if (!shape && e.judged.length !== e.hits) {
            mismatches.push(`${where}: "judged" has ${e.judged.length} entries, but "hits" is ${JSON.stringify(e.hits)}; give one entry per hit`);
          }
          unverified++;
          continue;
        }
        let r;
        try {
          r = scanner.run(e.search);
        } catch (err) {
          if (!(err instanceof LtzError)) throw err;
          mismatches.push(`${where}: ${err.message}`);
          continue;
        }
        if (typeof e.hits !== 'number' || e.hits !== r.hits) {
          mismatches.push(`${where}: search /${e.search.regex}/ logs hits ${JSON.stringify(e.hits)}, but the pin has ${r.hits} ${r.unit} in ${r.scanned} files`);
        }
        // The judged locations must be exactly the hit locations at the pin (case- and slash-insensitive).
        if (!shape) {
          const { missing, extra } = compareJudged(e.judged, r.locations);
          const list = (xs) => `${xs.slice(0, 10).join(', ')}${xs.length > 10 ? `, and ${xs.length - 10} more` : ''}`;
          if (missing.length) mismatches.push(`${where}: "judged" leaves out hit(s) at the pin: ${list(missing)}`);
          if (extra.length) mismatches.push(`${where}: "judged" names location(s) that are not hits at the pin: ${list(extra)}`);
        }
        if (r.narrower) {
          const cover = `search paths cover ${r.narrower.covered} of the ${r.narrower.boundary} files in boundaryPaths (not ${r.narrower.example}, for example)`;
          if (nonEmpty(e.scopeNote)) warnings.push(`${where}: ${cover}; bounded on purpose (scopeNote: ${e.scopeNote.slice(0, 80)})`);
          else mismatches.push(`${where}: ${cover}; widen "paths" to the boundary, or give a "scopeNote" justifying a deliberately bounded claim`);
        }
      }
    }
  }
  if (unverified) warnings.push(`${unverified} search(es) were not run at the pin (--no-verify-searches), so their hits and "judged" locations were not verified`);

  // Text checks on every changed string field (the whole field).
  // A bound is backed only by a logged search with a numeric hit count for that id AND field.
  const isBacking = (e) =>
    ((typeof e.search === 'string' && e.search.trim()) || isStructuredSearch(e.search)) && typeof e.hits === 'number' && Number.isFinite(e.hits);
  const backed = (id, f) => [...(logged.get(id)?.get(f) || []), ...(logged.get(id)?.get('*') || [])].some(isBacking);
  const checkText = (id, f, o, n, isBacked = backed) => {
    if (typeof n !== 'string') return;
    const oldT = typeof o === 'string' ? o : '';
    if (!isBacked(id, f)) {
      // Every changed clause holding a universal word, added or kept ("only A" -> "only A and B").
      const uc = universalClauses(oldT, n, cfg.universalWords);
      for (const u of uc) {
        flags.push(`${id}.${f}: changed clause holds universal word(s) ${u.words.map((w) => `"${w}"`).join(', ')} with no fixlog "search" + "hits" for ${id}.${f}: "${u.clause.slice(0, 90)}"`);
        if (u.joins.length) flags.push(`${id}.${f}: list joined by "${u.joins.join('", "')}" inside a universal clause (a closed list): "${u.clause.slice(0, 90)}"`);
      }
      const uni = addedUniversals(oldT, n, cfg.universalWords);
      if (!uc.length && uni.length) {
        flags.push(`${id}.${f}: added universal word(s) ${uni.map((u) => `"${u.word}" (${u.old} -> ${u.new})`).join(', ')} with no fixlog "search" + "hits" for ${id}.${f}`);
      }
      // A new list is cleared the same way: a proven list is backed by a logged search for this id and field.
      for (const s of newClosedLists(oldT, n)) flags.push(`${id}.${f}: new list with no "such as"/"for example": "${s.slice(0, 90)}"`);
    }
    for (const s of shapeFlags(oldT, n)) flags.push(`${id}.${f}: ${s}`);
  };
  for (const [id, fields] of changed) {
    for (const [f, d] of fields) {
      if (f === '*') {
        if (d.new) for (const [k, v] of Object.entries(d.new)) checkText(id, k, undefined, v);
        continue;
      }
      checkText(id, f, d.old, d.new);
    }
  }
  // Cross-unit edits made this round, backed only by this round's entries for that (id, field).
  for (const c of crossText) {
    const isBacked = () => c.backing.some(isBacking);
    if (c.f === '*') {
      if (c.new) for (const [k, v] of Object.entries(c.new)) checkText(c.id, k, undefined, v, isBacked);
      continue;
    }
    checkText(c.id, c.f, c.old, c.new, isBacked);
  }

  // Closed units are never edited. This unit's own changes, and (since units can share one file,
  // which the guard cannot split) every closed unit's items against its latest round snapshot.
  const isClosed = (u) => String(cfg.units[u]?.status || '').startsWith('closed');
  if (isClosed(unit)) {
    for (const id of changed.keys()) flags.push(`${id}: unit ${unit} is ${cfg.units[unit].status}; a closed unit is not edited (log a lead instead)`);
  }
  for (const u of Object.keys(cfg.units)) {
    if (u === unit || !isClosed(u)) continue;
    const rounds = listRounds(path.join(S, u)).filter((r) => fs.existsSync(path.join(r.dir, 'snapshot.jsonl')));
    if (!rounds.length) {
      warnings.push(`closed unit ${u} has no round snapshot, so its items could not be checked for edits; create a baseline with "node <skill>/scripts/ltz.mjs snapshot <S> ${u} <R>"`);
      continue;
    }
    const last = rounds[rounds.length - 1];
    const p = path.join(last.dir, 'snapshot.jsonl');
    const base = checkItems(readJsonl(p, { what: p }).rows, p);
    const baseIds = new Set(base.map((it) => it.id));
    for (const it of base) {
      const c = curById.get(it.id);
      if (!c) flags.push(`${it.id}: item of closed unit ${u} was removed since ${u}/${last.name}`);
      else if (canon(c) !== canon(it)) flags.push(`${it.id}: item of closed unit ${u} changed since ${u}/${last.name} (${cfg.units[u].status}; log a lead instead)`);
    }
    for (const c of all) if (c.unit === u && !baseIds.has(c.id)) flags.push(`${c.id}: item added to closed unit ${u} since ${u}/${last.name}`);
  }

  // Regression patterns against every changed item that still exists.
  const { patterns, dirMissing } = loadRegressionPatterns(S);
  if (dirMissing) warnings.push('no S/checks/patterns folder: no regression patterns were run');
  const reg = patterns.filter((p) => p.regression === true);
  for (const id of new Set([...changed.keys(), ...crossIds])) {
    const it = curById.get(id);
    if (!it) continue;
    for (const p of reg) {
      const m = matchItem(p, it, patternFields(p, cfg));
      if (m.length) flags.push(`${id}: still matches regression pattern ${p.id || p.file} (${p.class || 'no class'}): "${m[0].text}" in ${m[0].field}`);
    }
  }

  // Requirement items are never narrowed. Each fixlog entry for a changed field of an item whose
  // "type" is "requirement" (in the snapshot or now) needs "basis": "copying-error" with a non-empty
  // "source" (the file:line the item copies, such as a policy line or a config value), or a "ruling".
  const problems = [];
  const nonEmpty2 = (s) => typeof s === 'string' && s.trim().length > 0;
  const requirementProblem = (id, f, e) => {
    if (nonEmpty2(e.ruling) || (e.basis === 'copying-error' && nonEmpty2(e.source))) return;
    const got = e.basis === undefined ? '' : ` (got "basis": ${JSON.stringify(e.basis)}${e.basis === 'copying-error' ? ' with no "source"' : ''})`;
    problems.push(
      `${id}.${f} (fixlog line ${e.lineNo}): a requirement item changed without a copying-error basis or a ruling ` +
        `(a requirement the evidence does not meet is a defect, not a fix); give "basis": "copying-error" with "source": "<file:line>", or a "ruling"${got}`,
    );
  };
  const isRequirement = (id) => snapById.get(id)?.type === 'requirement' || curById.get(id)?.type === 'requirement';
  for (const [id, fields] of changed) {
    if (!isRequirement(id)) continue;
    for (const f of fields.keys()) for (const e of logged.get(id)?.get(f) || []) requirementProblem(id, f, e);
  }
  for (const c of crossText) if (c.requirement) for (const e of c.entries) requirementProblem(c.id, c.f, e);

  const nFields = [...changed.values()].reduce((a, m) => a + m.size, 0);
  const ok = !mismatches.length && !flags.length && !problems.length;
  return {
    mismatches,
    flags,
    problems,
    warnings,
    failed: !ok,
    summary:
      `diffcheck ${unit} r${String(R).replace(/^r/, '')}: ${changed.size} changed items (${nFields} fields), ${rows.length} fixlog entries${missing ? ' (no fixlog.jsonl)' : ''}, ` +
      `${reg.length} regression patterns${verifySearches ? ', searches verified at the pin' : ''}; ${mismatches.length} mismatches, ${flags.length} flags${problems.length ? `, ${problems.length} problems` : ''} -> ${ok ? 'PASS' : 'FAIL'}`,
  };
}
