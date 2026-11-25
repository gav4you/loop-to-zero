// sweep <S> <pattern.json> [--unit U]   and   replay <S> <pattern.json|classfile> --rounds <unit>
import fs from 'node:fs';
import path from 'node:path';
import { fail, readJson, readJsonl, listRounds } from './util.mjs';
import { loadConfig, requireUnit, loadItems, checkItems, historyFolders } from './state.mjs';
import { loadConfirmed, classesOf, readerClasses } from './record.mjs';

export function validatePattern(p, where) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) fail(`${where}: a pattern must be a JSON object`);
  if (typeof p.regex !== 'string' || !p.regex) fail(`${where}: "regex" is required`);
  const flags = p.flags ?? '';
  if (typeof flags !== 'string' || !/^[dgimsuyv]*$/.test(flags)) fail(`${where}: bad "flags" ${JSON.stringify(flags)}`);
  try {
    new RegExp(p.regex, flags);
  } catch (e) {
    fail(`${where}: regex does not compile: ${e.message}`);
  }
  if (p.fields !== undefined && (!Array.isArray(p.fields) || p.fields.some((f) => typeof f !== 'string'))) fail(`${where}: "fields" must be an array of field names`);
  if (p.knownInstances !== undefined && (!Array.isArray(p.knownInstances) || p.knownInstances.some((f) => typeof f !== 'string'))) {
    fail(`${where}: "knownInstances" must be an array of ids`);
  }
  return p;
}

export function loadPattern(file) {
  return validatePattern(readJson(file, 'pattern file'), file);
}

/** A pattern file, or a class file: a JSON array of patterns or {"patterns": [...]}. */
export function loadPatterns(file) {
  const raw = readJson(file, 'pattern file');
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw.patterns) ? raw.patterns : [raw];
  if (!arr.length) fail(`${file}: no patterns`);
  return arr.map((p, i) => validatePattern(p, `${file} pattern ${i + 1}`));
}

export function fieldText(item, field) {
  const v = item[field];
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
  return JSON.stringify(v);
}

/**
 * Matches of one pattern in one item: [{field, text, index}]. The regex runs exactly as written;
 * only "g" is added for iteration, and a fresh RegExp per field means lastIndex never leaks
 * between items.
 */
export function matchItem(p, item, fields) {
  const flags = (p.flags ?? '').includes('g') ? p.flags : (p.flags ?? '') + 'g';
  const out = [];
  for (const f of fields) {
    const t = fieldText(item, f);
    if (t === null) continue;
    const re = new RegExp(p.regex, flags);
    let m;
    while ((m = re.exec(t))) {
      out.push({ field: f, text: m[0], index: m.index, context: t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' ') });
      if (m[0] === '') re.lastIndex++;
    }
  }
  return out;
}

export function patternFields(p, cfg) {
  return p.fields && p.fields.length ? p.fields : cfg.itemFields;
}

/**
 * The state folders whose rounds hold known instances: S/ first, then each historyFolders entry (such
 * as a discovery state folder), in config order. [{base, label}]; label prefixes the round name, so a
 * history round reads "discovery/u1/r3".
 */
function roundSources(S, hist) {
  return [{ base: S, label: '' }, ...hist.folders.map((f) => ({ base: f.dir, label: f.label }))];
}

/** Every snapshot of every unit, in each source: [{unit, round, items}] */
function allSnapshots(sources, cfg) {
  const out = [];
  for (const src of sources) {
    for (const unit of Object.keys(cfg.units)) {
      for (const r of listRounds(path.join(src.base, unit))) {
        const p = path.join(r.dir, 'snapshot.jsonl');
        if (fs.existsSync(p)) out.push({ unit, round: `${src.label}${unit}/${r.name}`, items: checkItems(readJsonl(p, { what: p }).rows, p) });
      }
    }
  }
  return out;
}

/**
 * Every round's fixlog "new" values as item-like texts: [{where, item}], so a wrong a fix introduced
 * (and fixed again before the next snapshot) can still satisfy a known instance.
 */
function allFixlogTexts(sources, cfg) {
  const out = [];
  for (const src of sources) {
    for (const unit of Object.keys(cfg.units)) {
      for (const r of listRounds(path.join(src.base, unit))) {
        const p = path.join(r.dir, 'fixlog.jsonl');
        if (!fs.existsSync(p)) continue;
        for (const { lineNo, obj: e } of readJsonl(p, { what: p }).rows) {
          if (typeof e.id !== 'string' || typeof e.field !== 'string') continue;
          const item = e.field === '*' ? (e.new && typeof e.new === 'object' ? e.new : null) : { id: e.id, [e.field]: e.new };
          if (item) out.push({ id: e.id, where: `${src.label}${unit}/${r.name} fixlog line ${lineNo}`, item });
        }
      }
    }
  }
  return out;
}

/**
 * sweep <S> <pattern.json|classfile> [--unit U] [--count]. Every pattern must hit its known instances
 * (in the current items, any round snapshot, or any round's fixlog "new" text, in S/ or in a config
 * "historyFolders" folder, such as a discovery state folder). --count prints only
 * hit counts per pattern and unit, never the hits themselves, and also runs patterns that have no
 * knownInstances yet (claim-shape counting at setup).
 */
export function sweep({ S, patternFile, unit, count = false }) {
  const cfg = loadConfig(S);
  if (unit) requireUnit(cfg, unit);
  const patterns = loadPatterns(patternFile);
  const items = loadItems(S);
  // A missing history folder, or a "historyFolders" that is not an array, is a PROBLEM (as for record
  // and flips), checked whether or not a known instance needs it.
  const hist = historyFolders(S, cfg);
  const sources = roundSources(S, hist);
  const many = patterns.length > 1;
  const results = patterns.map((p, i) => sweepOne(sources, cfg, p, items, unit, p.id ? `${p.id}${p.class ? ` (${p.class})` : ''}` : many ? `${path.basename(patternFile)} #${i + 1}` : path.basename(patternFile), count));
  const problems = [
    ...hist.problems,
    ...results.filter((r) => r.missed.length).map((r) => `pattern too narrow${many ? ` (${r.label})` : ''}: known instance(s) not hit: ${r.missed.join(', ')}`),
  ];
  const refused = results.some((r) => r.missed.length) ? '; REFUSED (pattern too narrow)' : '';
  if (count) {
    const units = unit ? [unit] : [...new Set([...Object.keys(cfg.units), ...items.map((it) => it.unit)])];
    const out = [];
    for (const r of results) {
      for (const u of units) {
        const hs = r.hits.filter((h) => h.unit === u);
        out.push(`${r.label}  ${u}: ${hs.length} items, ${hs.reduce((a, h) => a + h.matches.length, 0)} matches`);
      }
      out.push(`${r.label}  total: ${r.hits.length} items, ${r.hits.reduce((a, h) => a + h.matches.length, 0)} matches in ${r.scanned} items${r.untested ? ' (no knownInstances: counts only)' : ''}`);
    }
    const known = results.reduce((a, r) => a + r.knownWhere.length, 0);
    const untested = results.filter((r) => r.untested).length;
    return {
      output: out.join('\n'),
      problems,
      failed: problems.length > 0,
      summary: `sweep --count: ${results.length} pattern(s)${refused || `; known instances all hit (${known})`}${untested ? `; ${untested} pattern(s) without knownInstances, counted only` : ''}`,
    };
  }
  const block = (r) => r.hits.map((h) => `${h.id}  ${h.matches.map((m) => `[${m.field}] "${m.text}" ... ${m.context}`).join('\n      ')}`);
  const out = many ? results.flatMap((r) => [`== ${r.label}`, ...block(r)]) : block(results[0]);
  const desc = results
    .map((r) => `${r.label}: ${r.hits.length} items hit (${r.hits.reduce((a, h) => a + h.matches.length, 0)} matches) in ${r.scanned} items` + (r.missed.length ? '' : `; known instances all hit (${r.knownWhere.join(', ')})`))
    .join('; ');
  return { output: out.join('\n'), problems, failed: problems.length > 0, summary: `sweep ${desc}${refused}`, hits: results.flatMap((r) => r.hits) };
}

function sweepOne(sources, cfg, p, items, unit, label, count) {
  const fields = patternFields(p, cfg);
  for (const f of fields) {
    if (!items.some((it) => it[f] !== undefined)) fail(`refusing: field "${f}" is in no item, so the sweep would check nothing there`);
  }
  const untested = !Array.isArray(p.knownInstances) || !p.knownInstances.length;
  if (untested && !count) {
    fail(`refusing: "knownInstances" is empty for ${label}; a pattern must hit at least its seed before it is trusted (--count runs it to count claim shapes)`);
  }
  const scanned = unit ? items.filter((it) => it.unit === unit) : items;
  const hits = [];
  for (const it of scanned) {
    const m = matchItem(p, it, fields);
    if (m.length) hits.push({ id: it.id, unit: it.unit, matches: m });
  }
  // Known instances are checked over all items (and every round snapshot and fixlog "new" text, in S/
  // and each history folder, since a fixed item no longer carries the wrong text), whatever --unit says.
  const byId = new Map(items.map((it) => [it.id, it]));
  let snaps = null;
  let fixes = null;
  const missed = [];
  const knownWhere = [];
  for (const id of untested ? [] : p.knownInstances) {
    if (byId.has(id) && matchItem(p, byId.get(id), fields).length) {
      knownWhere.push(`${id}: current`);
      continue;
    }
    snaps = snaps || allSnapshots(sources, cfg);
    const found = snaps.find((s) => s.items.some((it) => it.id === id && matchItem(p, it, fields).length));
    if (found) {
      knownWhere.push(`${id}: ${found.round} snapshot`);
      continue;
    }
    fixes = fixes || allFixlogTexts(sources, cfg);
    const fixed = fixes.find((x) => x.id === id && matchItem(p, x.item, fields).length);
    if (fixed) {
      knownWhere.push(`${id}: ${fixed.where}`);
      continue;
    }
    const exists = byId.has(id) || snaps.some((s) => s.items.some((it) => it.id === id)) || fixes.some((x) => x.id === id);
    missed.push(exists ? `${id} (not hit)` : `${id} (no such item)`);
  }
  return { label, hits, scanned: scanned.length, missed, knownWhere, untested };
}

export function replay({ S, patternFile, rounds, holdout }) {
  const cfg = loadConfig(S);
  if (!rounds) fail('--rounds <unit> is required (a unit, a comma list, or "all")');
  const units = rounds === 'all' ? Object.keys(cfg.units) : rounds.split(',').map((u) => requireUnit(cfg, u.trim()));
  const patterns = loadPatterns(patternFile);
  for (const p of patterns) if (!p.class) fail(`replay: pattern ${p.id || p.regex} has no "class"; recall is measured against confirmed wrongs of that class`);
  const out = [];
  const totals = patterns.map(() => ({ ofClass: 0, recalled: 0, falseHits: 0, otherClassHits: 0, rounds: 0 }));
  // --holdout <unit>/r<R>[,...]: the rounds a rule was written from. Recall is reported again without them,
  // so a rule is judged on rounds it was not fitted to. A history round is named with its label
  // (such as discovery/u1/r3).
  const held = new Set(holdout ? String(holdout).split(',').map((x) => x.trim()).filter(Boolean) : []);
  const heldSeen = new Set();
  const outTotals = patterns.map(() => ({ ofClass: 0, recalled: 0, falseHits: 0, rounds: 0 }));
  let replayed = 0;
  let replayedHist = 0;
  let overturnedTotal = 0;
  const overturnedIn = new Set(); // the judgments files that overturned a wrong
  // Each historyFolders entry's rounds (such as a discovery state folder's) are replayed too, first and
  // in config order, as flips reads them; a history round is labelled "<folder>/<unit>/r<N>". A missing
  // folder, or a "historyFolders" that is not an array, is a PROBLEM.
  const hist = historyFolders(S, cfg);
  const sources = [...hist.folders.map((f) => ({ base: f.dir, label: f.label })), { base: S, label: '' }];
  // A confirmed wrong whose latest judgments.jsonl line for that unit and round says "now": "ok" or
  // "pending-owner" was overturned, so it is not a past confirmed wrong. The judgments.jsonl is that of
  // the state folder holding the round (S/, or the history folder), as flips resolves "judgment:"
  // references. Lines match a unit as flips does (the same unit, or no unit), and a round by its
  // number (2 or "r2").
  const judgmentsOf = new Map();
  const loadJudgments = (base) => {
    if (!judgmentsOf.has(base)) {
      const jp = path.join(base, 'judgments.jsonl');
      judgmentsOf.set(base, fs.existsSync(jp) ? readJsonl(jp, { what: jp }).rows.map((x) => x.obj) : []);
    }
    return judgmentsOf.get(base);
  };
  const roundNo = (x) => Number(String(x).replace(/^r/, ''));
  const toReplay = [];
  for (const src of sources) for (const unit of units) for (const r of listRounds(path.join(src.base, unit))) if (r.n !== 0) toReplay.push({ src, unit, r }); // r0 is never replayed: its find list is {} by rule
  for (const { src, unit, r } of toReplay) {
    const snapP = path.join(r.dir, 'snapshot.jsonl');
    const confP = path.join(r.dir, 'confirmed.json');
    if (!fs.existsSync(snapP) || !fs.existsSync(confP)) continue;
    replayed++;
    if (src.base !== S) replayedHist++;
    const roundLabel = `${src.label}${unit}/${r.name}`;
    const isHeld = held.has(roundLabel);
    if (isHeld) heldSeen.add(roundLabel);
    const judgments = loadJudgments(src.base);
    const items = checkItems(readJsonl(snapP, { what: snapP }).rows, snapP);
    const conf = loadConfirmed(confP);
    const latest = new Map();
    for (const j of judgments) {
      if (!j || typeof j.id !== 'string' || (j.unit !== undefined && j.unit !== unit) || roundNo(j.round) !== r.n) continue;
      latest.set(j.id, j.now);
    }
    const overturned = [...conf.wrongs.keys()].filter((id) => latest.get(id) === 'ok' || latest.get(id) === 'pending-owner');
    overturnedTotal += overturned.length;
    if (overturned.length) overturnedIn.add(src.base === S ? 'S/judgments.jsonl' : `${src.label}judgments.jsonl`);
    const wrongs = new Map([...conf.wrongs].filter(([id]) => !overturned.includes(id)));
    // Overturned to pending-owner: like a pending item, neither a recalled wrong nor a false hit.
    const pending = new Set([...conf.pending, ...overturned.filter((id) => latest.get(id) === 'pending-owner')]);
    const defects = conf.defects;
    // An item no reader read in this round (a final-check round's unqueued chunks, a dropped range)
    // was never judged, so a hit on it is neither a recalled wrong nor a false hit. report.json says
    // which those are; a round without one (a rebuilt past round) is taken as read in full.
    const unread = new Set();
    const repP = path.join(r.dir, 'report.json');
    if (fs.existsSync(repP)) {
      const rep = readJson(repP, repP);
      for (const it of Array.isArray(rep.items) ? rep.items : []) if (it && it.verdict === 'unread') unread.add(it.id);
    }
    // An item a later round found wrong in this round's text (its latest judgments.jsonl line for this
    // round says "now": "wrong": an earlier miss) was wrong here too, so a hit on it is not a false hit.
    const laterWrong = new Set([...latest].filter(([, now]) => now === 'wrong').map(([id]) => id));
    const rc = readerClasses(r.dir);
    const classOf = (id) => {
      const c = classesOf(wrongs.get(id));
      return c.length ? c : [...(rc.get(id) || [])];
    };
    patterns.forEach((p, i) => {
      const fields = patternFields(p, cfg);
      const allHits = items.filter((it) => matchItem(p, it, fields).length).map((it) => it.id);
      const hit = new Set(allHits.filter((id) => !unread.has(id)));
      const unreadHits = allHits.filter((id) => unread.has(id));
      const ofClass = [...wrongs.keys()].filter((id) => classOf(id).includes(p.class));
      const recalled = ofClass.filter((id) => hit.has(id));
      const missed = ofClass.filter((id) => !hit.has(id));
      const laterWrongHits = [...hit].filter((id) => !wrongs.has(id) && laterWrong.has(id));
      const falseHits = [...hit].filter((id) => !wrongs.has(id) && !pending.has(id) && !defects.has(id) && !laterWrong.has(id));
      const otherClass = [...hit].filter((id) => wrongs.has(id) && !ofClass.includes(id));
      const t = totals[i];
      t.ofClass += ofClass.length;
      t.recalled += recalled.length;
      t.falseHits += falseHits.length;
      t.otherClassHits += otherClass.length;
      t.rounds++;
      if (!isHeld) {
        const o = outTotals[i];
        o.ofClass += ofClass.length;
        o.recalled += recalled.length;
        o.falseHits += falseHits.length;
        o.rounds++;
      }
      out.push(
        `${src.label}${unit}/${r.name} ${p.id || p.class}: recall ${recalled.length}/${ofClass.length}` +
          (missed.length ? ` (missed ${missed.join(', ')})` : '') +
          `; false hits ${falseHits.length}${falseHits.length ? ` (${falseHits.join(', ')})` : ''}` +
          (otherClass.length ? `; hits on other-class wrongs ${otherClass.join(', ')}` : '') +
          (laterWrongHits.length ? `; hits on items a later round found wrong here, not false hits: ${laterWrongHits.join(', ')}` : '') +
          (unreadHits.length ? `; hits on items not read in this round, not counted: ${unreadHits.join(', ')}` : '') +
          (overturned.length ? `; overturned, not counted: ${overturned.join(', ')}` : ''),
      );
    });
  }
  if (!replayed) {
    const hp = hist.problems.length ? `${hist.problems.join('; ')}; and ` : 'refusing: ';
    fail(`${hp}no round folder of ${units.join(', ')} has both snapshot.jsonl and confirmed.json; nothing to replay`);
  }
  const sums = patterns.map((p, i) => {
    const t = totals[i];
    return `${p.id || p.class}: recall ${t.recalled}/${t.ofClass}, false hits ${t.falseHits} over ${t.rounds} round(s)`;
  });
  for (const h of held) if (!heldSeen.has(h)) fail(`--holdout ${h} names no replayed round (rounds are named <unit>/r<R>, or <folder>/<unit>/r<R> for a history folder)`);
  let ho = '';
  if (held.size) {
    if (outTotals.every((o) => o.rounds === 0)) fail('--holdout leaves no round to replay');
    ho = `; held out ${[...held].join(',')}: ` + patterns.map((p, i) => {
      const o = outTotals[i];
      return `${p.id || p.class}: recall ${o.recalled}/${o.ofClass}, false hits ${o.falseHits} over ${o.rounds} round(s)`;
    }).join('; ');
  }
  const ov = overturnedTotal ? `; ${overturnedTotal} overturned wrong(s) not counted (${[...overturnedIn].join(', ')})` : '';
  return {
    output: out.join('\n'),
    problems: hist.problems,
    summary: `replay: ${replayed} round(s)${replayedHist ? ` (${replayedHist} from historyFolders)` : ''}; ${sums.join('; ')}${ov}${ho}`,
    totals,
  };
}
