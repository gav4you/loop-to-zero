// render <S> <unit> <R> <slot> <from> <count> [--list file]   and   show <S> <unit> <R> <slot> <cite>...
import fs from 'node:fs';
import path from 'node:path';
import { fail, readJsonl, appendJsonl, parseCite, parsePosInt, validName } from './util.mjs';
import {
  loadConfig, requireUnit, requireRoundDir, verifySnapshot, loadSnapshot, loadList, checkItems,
  loadCanaries, loadCanaryPlan, renderLogPath,
} from './state.mjs';
import { Evidence, resolveCite } from './evidence.mjs';

const maskedNote = (log) => {
  const n = log.filter((e) => e.t === 'line' && e.masked).length;
  return `, ${n} masked line(s)`;
};

// In a --list (fix-checker) file, an item with no "changed" field is a named item, added for context.
export const NAMED_ITEM_MARK = '(named item, for context)';

// Fields that only canaries carry; they are never rendered, so a canary looks like a real item.
const CANARY_META = new Set(['kind']);

function fmtValue(v) {
  if (typeof v === 'string') return v.includes('\n') ? v.replace(/\n/g, '\n    ') : v;
  return JSON.stringify(v);
}

/**
 * A fix-checker item's "changed": one {field, old?, new} or an array of them. Returns the list, or
 * a string saying what is wrong with it.
 */
export function changedList(c) {
  const list = Array.isArray(c) ? c : [c];
  if (!list.length) return '"changed" is an empty list';
  for (const [i, x] of list.entries()) {
    const at = Array.isArray(c) ? `"changed"[${i}]` : '"changed"';
    if (!x || typeof x !== 'object' || Array.isArray(x)) return `${at} must be an object {field, old?, new}`;
    if (typeof x.field !== 'string' || !x.field) return `${at} needs a "field"`;
    if (!('new' in x)) return `${at} (${x.field}) needs "new"`;
  }
  return list;
}

function changedText(item) {
  const list = changedList(item.changed);
  if (typeof list === 'string') return [`changed: ${fmtValue(item.changed)}`];
  return list.map((x, i) => `changed${list.length > 1 ? `[${i + 1}]` : ''}: ${x.field}: ${fmtValue(x.new)}${'old' in x ? `  (was: ${fmtValue(x.old)})` : ''}`);
}

function itemText(item, cfg, isCanary) {
  const out = [];
  const shown = new Set(['cites', 'changed']);
  const order = ['id', 'unit', ...cfg.itemFields];
  for (const k of order) {
    if (shown.has(k)) continue;
    shown.add(k);
    if (item[k] !== undefined) out.push(`${k}: ${fmtValue(item[k])}`);
  }
  for (const k of Object.keys(item)) {
    if (shown.has(k)) continue;
    if (isCanary && CANARY_META.has(k)) continue;
    shown.add(k);
    out.push(`${k}: ${fmtValue(item[k])}`);
  }
  if (item.changed !== undefined) out.push(...changedText(item));
  const cites = Array.isArray(item.cites) ? item.cites : [];
  out.push(`cites: ${cites.length ? cites.join(', ') : '(none)'}`);
  return out;
}

/** Render one cite; returns {text: [lines], log: [entries]} */
function renderCite(evidence, raw, logBase) {
  const cite = parseCite(raw);
  const res = resolveCite(evidence, cite);
  const text = [];
  const log = [];
  const head = `--- ${raw} (at ${evidence.pinLabel(cite.path)}${res.note ? '; ' + res.note : ''}) ---`;
  text.push(head);
  // Every attempt is logged, so a reader may cite exactly what was rendered (or found missing).
  log.push({ t: 'cite', cite: cite.norm, path: cite.path, status: res.status, ...logBase });
  if (res.status !== 'ok') {
    text.push(`    (nothing rendered: ${res.status})`);
    return { text, log };
  }
  const w = String(res.lines[res.lines.length - 1].n).length;
  for (const { n, text: raw0 } of res.lines) {
    const mk = evidence.masker.mask(cite.path, raw0);
    text.push(`${String(n).padStart(Math.max(w, 5))} | ${mk.text}`);
    const e = { t: 'line', path: cite.path, line: n, ...logBase };
    if (cite.kind === 'key' || cite.kind === 'keypath') e.key = cite.key;
    if (mk.masked) e.masked = true;
    log.push(e);
  }
  return { text, log };
}

export function render({ S, unit, R, slot, from, count, listFile }) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  validName(slot, 'slot');
  const rd = requireRoundDir(S, unit, R);
  const f = parsePosInt(from, '<from>');
  const c = parsePosInt(count, '<count>');

  let items;
  let source;
  if (listFile) {
    if (!fs.existsSync(listFile)) fail(`--list file not found: ${listFile}`);
    items = checkItems(readJsonl(listFile, { what: listFile }).rows, listFile);
    for (const it of items) {
      if (it.changed === undefined) continue;
      const c = changedList(it.changed);
      if (typeof c === 'string') fail(`${listFile}: ${it.id}: ${c}`);
    }
    source = path.basename(listFile);
  } else {
    verifySnapshot(rd);
    const snap = loadSnapshot(rd);
    const byId = new Map(snap.map((it) => [it.id, it]));
    const list = loadList(rd);
    items = list.map((id) => {
      if (!byId.has(id)) fail(`list.json id ${id} is not in snapshot.jsonl`);
      return byId.get(id);
    });
    source = 'list.json';
  }
  const n = items.length;
  const to = f + c - 1;
  if (f < 1 || f > n || to > n) fail(`refusing: positions ${f}-${to} are outside the list (1-${n} in ${source})`);

  const plan = loadCanaryPlan(rd);
  const planned = (plan[slot] || []).filter((e) => e.atPosition >= f && e.atPosition <= to);
  let canaries = new Map();
  if (planned.length) {
    canaries = new Map(loadCanaries(S).map((x) => [x.id, x]));
    for (const e of planned) if (!canaries.has(e.canaryId)) fail(`canary-plan.json names ${e.canaryId}, which is not in S/canaries.jsonl`);
  }

  const evidence = new Evidence(cfg);
  const winName = `w-${slot}-${f}.txt`;
  const text = [
    `# window ${winName}: unit ${unit}, round ${R}, slot ${slot}, positions ${f}-${to} of ${n} (${source})`,
    `# evidence: ${evidence.describe()}`,
    `# Read this file in full. To read more lines, use the show command so the lines are logged.`,
    '',
  ];
  const log = [];
  let unresolved = 0;
  let named = 0;
  const emit = (item, isCanary) => {
    log.push({ t: 'item', id: item.id, window: winName });
    const isNamed = !!listFile && !isCanary && item.changed === undefined;
    if (isNamed) named++;
    text.push(`=== item ${item.id} ===${isNamed ? ` ${NAMED_ITEM_MARK}` : ''}`);
    text.push(...itemText(item, cfg, isCanary));
    for (const raw of Array.isArray(item.cites) ? item.cites : []) {
      const r = renderCite(evidence, raw, { id: item.id });
      text.push(...r.text);
      log.push(...r.log);
      if (r.log.some((e) => e.t === 'cite' && e.status !== 'ok')) unresolved++;
    }
    text.push('');
  };
  for (let p = f; p <= to; p++) {
    for (const e of planned.filter((x) => x.atPosition === p)) emit(canaries.get(e.canaryId), true);
    emit(items[p - 1], false);
  }
  fs.writeFileSync(path.join(rd, winName), text.join('\n') + '\n');
  appendJsonl(renderLogPath(rd, slot), log);
  const lines = log.filter((e) => e.t === 'line').length;
  return {
    summary: `render ${winName}: positions ${f}-${to}, ${lines} cited lines logged to render-${slot}.jsonl` +
      maskedNote(log) +
      (named ? `, ${named} named item(s) for context` : '') +
      (unresolved ? `, ${unresolved} cite(s) unresolved (marked in the window)` : ''),
  };
}

export function show({ S, unit, R, slot, cites }) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  validName(slot, 'slot');
  const rd = requireRoundDir(S, unit, R);
  if (!cites.length) fail('show needs at least one <path:lines> cite');
  const evidence = new Evidence(cfg);
  const out = [];
  const log = [];
  let bad = 0;
  for (const raw of cites) {
    const r = renderCite(evidence, raw, { via: 'show' });
    out.push(...r.text);
    log.push(...r.log);
    if (r.log.some((e) => e.t === 'cite' && e.status !== 'ok')) bad++;
  }
  appendJsonl(renderLogPath(rd, slot), log);
  const lines = log.filter((e) => e.t === 'line').length;
  const summary = `show: ${lines} lines logged to render-${slot}.jsonl` + maskedNote(log) + (bad ? `; ${bad} cite(s) could not be shown` : '');
  return { output: out.join('\n'), summary, failed: bad > 0 };
}
