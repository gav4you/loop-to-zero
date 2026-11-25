// flips <S> <unit>: an (id, field) whose value returns to a value it held in an earlier round.
// A fixlog entry may carry "ruling": "<id>" (a ruling) or "judgment:<round>:<id>" (a judgments entry,
// for an overturn that was not a ruling; "judgment:<folder>/<round>:<id>" names one in a history
// folder's judgments.jsonl). A flip whose returning change carries one is explained:
// reported separately, and it does not fail the command.
import path from 'node:path';
import fs from 'node:fs';
import { readJsonl, canon, listRounds } from './util.mjs';
import { loadConfig, requireUnit, historyFolders, loadItems } from './state.mjs';

/** Values compare after whitespace is collapsed, so a re-spaced revert still counts. */
function norm(v) {
  return typeof v === 'string' ? JSON.stringify(v.replace(/\s+/g, ' ').trim()) : canon(v);
}

function rulingOf(e) {
  return e && typeof e.ruling === 'string' && e.ruling.trim() ? e.ruling.trim() : null;
}

export function findFlips(entriesByRound) {
  // entriesByRound: [{round, entries:[{id, field, old, new, ruling?}]}] in round order
  const hist = new Map();
  const flips = [];
  const push = (key, v, round, entry) => {
    const h = hist.get(key);
    const nv = norm(v);
    const k = h.findIndex((x) => x.v === nv);
    if (k >= 0 && k < h.length - 1) {
      flips.push({ key, value: v, firstRound: h[k].round, returnedRound: round, ruling: rulingOf(entry) });
    }
    h.push({ v: nv, round });
  };
  for (const { round, entries } of entriesByRound) {
    for (const e of entries) {
      const key = `${e.id}\u0000${e.field}`;
      if (!hist.has(key)) hist.set(key, [{ v: norm(e.old), round }]);
      const h = hist.get(key);
      // A gap in the chain (an edit outside the fixlog) is itself a held value, with no ruling.
      if (h[h.length - 1].v !== norm(e.old)) push(key, e.old, round, null);
      push(key, e.new, round, e);
    }
  }
  return flips.map((f) => {
    const [id, field] = f.key.split('\u0000');
    return { id, field, value: f.value, firstRound: f.firstRound, returnedRound: f.returnedRound, ruling: f.ruling };
  });
}

/**
 * Where a cross-unit entry belongs in one (id, field) chain of {round, e} steps. Other units' rounds
 * have no order against this unit's, so the values decide: first a gap the entry fills exactly (the
 * step before ends on its "old" and the step after starts from its "new"), then the start of the chain
 * (the first step starts from its "new"), then the end (the last step ends on its "old"), then any
 * step that ends on its "old". Failing all of those it goes last.
 * When the entry fits both the start and the end (it undoes this unit's edits, or they undo it), the
 * item's current value decides: the chain has to end on it. `current` is that value (normalised), or
 * undefined when the item is gone; then the entry goes last, as a revert logged by another unit does.
 */
function crossPosition(list, e, current) {
  const o = norm(e.old);
  const nw = norm(e.new);
  const endsOn = (i) => i > 0 && norm(list[i - 1].e.new) === o;
  const startsFrom = (i) => i < list.length && norm(list[i].e.old) === nw;
  for (let i = 1; i < list.length; i++) if (endsOn(i) && startsFrom(i)) return i;
  const atStart = startsFrom(0);
  const atEnd = endsOn(list.length);
  if (atStart && atEnd) return current !== undefined && current !== nw && norm(list[list.length - 1].e.new) === current ? 0 : list.length;
  if (atEnd) return list.length;
  if (atStart) return 0;
  for (let i = 1; i < list.length; i++) if (endsOn(i)) return i;
  return list.length;
}

export function flips({ S, unit }) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  // Each historyFolders entry's rounds (such as a discovery state folder's) come first, in config
  // order, then this state folder's. A history round is labelled "<folder>/r<N>".
  const hist = historyFolders(S, cfg);
  const sources = [...hist.folders.map((f) => ({ base: f.dir, label: f.label })), { base: S, label: '' }];
  // This unit's history is its own rounds' entries (those not tagged for another unit), plus the
  // entries other units' rounds logged for it ("unit": "<this unit>": cross-unit edits). Without the
  // second kind a flip made by a cross-unit edit goes unseen, and the unit's next own entry looks
  // like an edit outside the fixlog that no ruling can explain.
  const ownRounds = [];
  const crossIn = []; // {round, e}: entries for this unit found in other units' fixlogs
  const roundInfo = new Map(); // round label -> {n, base}
  for (const src of sources) {
    for (const r of listRounds(path.join(src.base, unit))) {
      const fp = path.join(r.dir, 'fixlog.jsonl');
      if (!fs.existsSync(fp)) continue;
      const round = `${src.label}${r.name}`;
      roundInfo.set(round, { n: r.n, base: src.base });
      const entries = readJsonl(fp, { what: `${round}/fixlog.jsonl` }).rows.map((x) => x.obj).filter((e) => e && (e.unit === undefined || e.unit === unit));
      ownRounds.push({ round, entries });
    }
    for (const u2 of Object.keys(cfg.units)) {
      if (u2 === unit) continue;
      for (const r of listRounds(path.join(src.base, u2))) {
        const fp = path.join(r.dir, 'fixlog.jsonl');
        if (!fs.existsSync(fp)) continue;
        const round = `${src.label}${u2}/${r.name}`;
        for (const x of readJsonl(fp, { what: `${round}/fixlog.jsonl` }).rows) {
          if (!x.obj || x.obj.unit !== unit) continue;
          roundInfo.set(round, { n: r.n, base: src.base });
          crossIn.push({ round, e: x.obj });
        }
      }
    }
  }
  // Each (id, field) is its own chain, so the entries are laid out per key: the unit's own entries in
  // round order, with each cross-unit entry placed where its "old" and "new" fit that chain.
  const byKey = new Map();
  const keyOf = (e) => `${e.id}\u0000${e.field}`;
  for (const { round, entries } of ownRounds) {
    for (const e of entries) {
      if (!byKey.has(keyOf(e))) byKey.set(keyOf(e), []);
      byKey.get(keyOf(e)).push({ round, e });
    }
  }
  const itemsPath = path.join(S, 'items.jsonl');
  const itemById = new Map((fs.existsSync(itemsPath) ? loadItems(S) : []).map((it) => [it.id, it]));
  const currentOf = (e) => {
    const it = itemById.get(e.id);
    if (e.field === '*') return norm(it ?? null);
    return it ? norm(it[e.field] ?? null) : undefined;
  };
  for (const c of crossIn) {
    if (!byKey.has(keyOf(c.e))) byKey.set(keyOf(c.e), []);
    const list = byKey.get(keyOf(c.e));
    list.splice(crossPosition(list, c.e, currentOf(c.e)), 0, c);
  }
  const byRound = [];
  for (const list of byKey.values()) for (const { round, e } of list) byRound.push({ round, entries: [e] });
  const rounds = ownRounds;
  const found = findFlips(byRound);
  const n = byRound.length;
  const show = (v) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + '...' : s;
  };
  // A ruling id explains a flip. So does "judgment:<round>:<id>" for an overturn that was not a
  // ruling (a spot-check, say), but only when the judgments.jsonl of the state folder that holds the
  // returning entry (S/, or the history folder for a history round) has that entry for this unit and
  // it concerns the flipped item: its id is the item, or its backprop list names the item.
  // "judgment:<folder>/<round>:<id>" looks in that history folder's judgments.jsonl instead (the
  // folder holding the overturned verdict's round), by the same rules; <folder> must equal a
  // "historyFolders" entry (trailing slashes aside), or the flip stays unexplained.
  const histDir = new Map(hist.folders.map((f) => [f.label.slice(0, -1), f.dir]));
  const histNames = Array.isArray(cfg.historyFolders) ? cfg.historyFolders.filter((h) => typeof h === 'string').map((h) => h.replace(/[\\/]+$/, '')) : [];
  const judgmentsOf = new Map();
  const loadJudgments = (base) => {
    if (!judgmentsOf.has(base)) {
      const jp = path.join(base, 'judgments.jsonl');
      judgmentsOf.set(base, fs.existsSync(jp) ? readJsonl(jp, { what: jp }).rows.map((x) => x.obj) : []);
    }
    return judgmentsOf.get(base);
  };
  const roundNo = (r) => Number(String(r).replace(/^r/, ''));
  for (const f of found) {
    if (!f.ruling || !f.ruling.startsWith('judgment:')) continue;
    const m = /^judgment:(?:([^:]+)\/)?(r?\d+):(.+)$/.exec(f.ruling);
    if (!m) {
      f.why = `"${f.ruling}" is not judgment:<round>:<id> or judgment:<folder>/<round>:<id>`;
      continue;
    }
    const [, folder, round, id] = m;
    if (folder !== undefined && !histDir.has(folder)) {
      f.why = histNames.includes(folder)
        ? `${f.ruling} names history folder ${folder}, which was not found`
        : `${f.ruling} names folder ${folder}, which is not in config "historyFolders" (${histNames.join(', ') || 'none'})`;
      continue;
    }
    const base = folder !== undefined ? histDir.get(folder) : roundInfo.get(f.returnedRound)?.base ?? S;
    const where = base === S ? 'S/judgments.jsonl' : `${path.relative(S, base).replace(/\\/g, '/')}/judgments.jsonl`;
    const entry = loadJudgments(base).find((j) => j.id === id && roundNo(j.round) === roundNo(round) && (j.unit === undefined || j.unit === unit));
    if (!entry) f.why = `${f.ruling} names no entry in ${where} (unit ${unit}, round ${roundNo(round)}, id ${id})`;
    else if (entry.id !== f.id && !(Array.isArray(entry.backprop) && entry.backprop.includes(f.id))) {
      f.why = `${f.ruling} is about ${entry.id}, and its backprop does not name ${f.id}`;
    }
  }
  const unexplained = found.filter((f) => !f.ruling || f.why);
  const explained = found.filter((f) => f.ruling && !f.why);
  const out = unexplained.map((f) => `FLIP ${f.id}.${f.field}: returned in ${f.returnedRound} to a value first held in ${f.firstRound}: "${show(f.value)}"${f.why ? ` (not explained: ${f.why})` : ''}`);
  if (explained.length) {
    out.push('ruling-explained (not a failure):');
    for (const f of explained) {
      out.push(`  RULING ${f.ruling}: ${f.id}.${f.field} returned in ${f.returnedRound} to a value first held in ${f.firstRound}: "${show(f.value)}"`);
    }
  }
  const histN = rounds.filter((r) => roundInfo.get(r.round).base !== S).length;
  return {
    output: out.join('\n'),
    problems: hist.problems,
    failed: unexplained.length > 0 || hist.problems.length > 0,
    summary:
      `flips ${unit}: ${rounds.length} fixlogs${histN ? ` (${histN} from historyFolders)` : ''}, ${n} entries${crossIn.length ? ` (${crossIn.length} logged for ${unit} in other units' fixlogs)` : ''}; ${unexplained.length} unexplained flip(s), ${explained.length} ruling-explained` +
      (unexplained.length ? ' -> stop fixing those items and take each reading to the owner' : ''),
    flips: found,
  };
}
