// snapshot <S> <unit> <R>
import fs from 'node:fs';
import path from 'node:path';
import { fail, writeJson, writeJsonl, sha256File, parsePosInt, parseRound } from './util.mjs';

// An item may carry "type": "requirement" | "description"; the tools pass it through untouched
// (diffcheck holds a requirement item's changes to a copying-error basis or a ruling).
export const ITEM_TYPES = ['requirement', 'description'];
import { loadConfig, requireUnit, loadItems, roundDir, readerResultFiles, loadCanaries } from './state.mjs';
import { rulingCheck } from './rulings.mjs';
import { evidenceSources, pinRecord } from './sources.mjs';
import { treeHash, checkDirPin } from './evidence.mjs';

/** Cut 1..n into chunks of chunkSize; a tail shorter than half a chunk joins the previous chunk. */
export function cutChunks(n, chunkSize) {
  const chunks = {};
  const ranges = [];
  for (let from = 1; from <= n; from += chunkSize) ranges.push({ from, to: Math.min(n, from + chunkSize - 1) });
  if (ranges.length > 1) {
    const last = ranges[ranges.length - 1];
    if (last.to - last.from + 1 < chunkSize / 2) {
      ranges.pop();
      ranges[ranges.length - 1].to = last.to;
    }
  }
  ranges.forEach((r, i) => (chunks[`c${i + 1}`] = r));
  return chunks;
}

export function defaultChunkSize(windowSize) {
  return windowSize * Math.max(1, Math.round(70 / windowSize));
}

/**
 * A reading order: a file of ids, one per line (blank lines skipped) or a JSON array. It must be a
 * permutation of the unit's ids: every id once, no others.
 */
export function readOrder(file, unitIds) {
  if (!fs.existsSync(file)) fail(`--order file not found: ${file}`);
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim();
  let ids;
  if (text.startsWith('[')) {
    try {
      ids = JSON.parse(text);
    } catch (e) {
      fail(`--order file is not a valid JSON array: ${e.message}`);
    }
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) fail('--order JSON must be an array of id strings');
  } else {
    ids = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  const want = new Set(unitIds);
  const seen = new Set();
  const dup = [];
  const extra = [];
  for (const id of ids) {
    if (seen.has(id)) dup.push(id);
    seen.add(id);
    if (!want.has(id)) extra.push(id);
  }
  const missing = unitIds.filter((id) => !seen.has(id));
  const why = [];
  if (missing.length) why.push(`missing ${missing.length} (${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', ...' : ''})`);
  if (extra.length) why.push(`not in the unit: ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? ', ...' : ''}`);
  if (dup.length) why.push(`listed twice: ${[...new Set(dup)].slice(0, 8).join(', ')}`);
  if (why.length) fail(`refusing: --order is not a permutation of the unit's ${unitIds.length} ids (${why.join('; ')})`);
  return ids;
}

export function snapshot({ S, unit, R, chunkSize, order }) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  const rd = roundDir(S, unit, R);
  const results = readerResultFiles(rd);
  if (results.length) fail(`refusing: ${rd} already has reader results (${results.join(', ')})`);
  // A reader that has rendered but not yet written results has still started: a new snapshot
  // would let record accept verdicts made against the old text.
  const started = fs.existsSync(rd) ? fs.readdirSync(rd).filter((f) => /^render-.+\.jsonl$/.test(f) || /^w-.+\.txt$/.test(f)) : [];
  if (started.length) fail(`refusing: reading has started in ${rd} (${started.slice(0, 5).join(', ')}${started.length > 5 ? ', ...' : ''})`);
  for (const f of ['confirmed.json', 'report.json']) {
    if (fs.existsSync(path.join(rd, f))) fail(`refusing: ${rd} already has ${f}`);
  }
  const classes = path.join(S, 'classes.md');
  if (!fs.existsSync(classes)) fail(`S/classes.md is missing (${classes}); readers need the bar`);
  if (cfg.requireRulingEntries === true) {
    const r = rulingCheck(S, cfg);
    if (r.missing.length) {
      fail(`refusing: ${r.missing.length} ruling id(s) not found in S/classes.md's "accepted by ruling" section (${r.missing.join(', ')}); readers would not see them`);
    }
  }

  const all = loadItems(S);
  const canaryIds = new Set(loadCanaries(S).map((c) => c.id));
  const leaked = all.filter((it) => canaryIds.has(it.id)).map((it) => it.id);
  if (leaked.length) fail(`refusing: canary ids found in S/items.jsonl: ${leaked.join(', ')}`);
  const items = all.filter((it) => it.unit === unit);
  if (!items.length) fail(`unit ${unit} has no items in S/items.jsonl`);

  // r0 is the cost-measurement read: one test reader reads one window, so its list and its single
  // chunk hold the first window only. The snapshot itself keeps the whole unit.
  const r0 = parseRound(R) === 0;
  // --order sets the reading order (for example a discovery order); the snapshot keeps file order.
  const ordered = order ? readOrder(order, items.map((it) => it.id)) : items.map((it) => it.id);
  const listIds = r0 ? ordered.slice(0, cfg.windowSize) : ordered;
  const size = chunkSize ? parsePosInt(chunkSize, '--chunk-size') : defaultChunkSize(cfg.windowSize);
  // A folder of evidence is pinned by its content hash: refuse a changed one, and print the hash to pin.
  const dirPinHints = [];
  for (const src of evidenceSources(cfg)) {
    if (src.type !== 'dir') continue;
    if (src.sha256 === undefined) dirPinHints.push(`evidence dir ${src.root} has no "sha256"; to pin it, set "sha256": "${treeHash(path.resolve(src.root))}" on that source`);
    else checkDirPin(src);
  }
  fs.mkdirSync(rd, { recursive: true });
  const snap = path.join(rd, 'snapshot.jsonl');
  writeJsonl(snap, items);
  fs.writeFileSync(path.join(rd, 'snapshot.sha256'), `${sha256File(snap)}  snapshot.jsonl\n`);
  fs.copyFileSync(classes, path.join(rd, 'classes.md'));
  // The evidence this round reads, so later tools can tell when the pin has moved since.
  writeJson(path.join(rd, 'pin.json'), { sources: pinRecord(cfg) });
  writeJson(path.join(rd, 'list.json'), listIds);
  const chunks = r0 ? { c1: { from: 1, to: listIds.length } } : cutChunks(listIds.length, size);
  writeJson(path.join(rd, 'chunks.json'), chunks);
  const desc = Object.entries(chunks).map(([k, v]) => `${k} ${v.from}-${v.to}`).join(', ');
  const types = items.filter((it) => it.type !== undefined && !ITEM_TYPES.includes(it.type)).map((it) => it.id);
  return {
    summary:
      `snapshot ${unit} r${parseRound(R)}: ${items.length} items, ` +
      (r0 ? `r0 (cost measurement): list and chunk hold the first window only (${listIds.length} items)` : `${Object.keys(chunks).length} chunks (${desc})`) +
      (order ? `, list in the --order file's order` : '') +
      ` -> ${rd}`,
    warnings: [
      ...dirPinHints,
      ...(r0 && chunkSize ? ['--chunk-size is ignored for r0 (one window)'] : []),
      ...(types.length ? [`"type" is neither "requirement" nor "description" for: ${types.slice(0, 10).join(', ')}${types.length > 10 ? ', ...' : ''}`] : []),
    ],
  };
}
