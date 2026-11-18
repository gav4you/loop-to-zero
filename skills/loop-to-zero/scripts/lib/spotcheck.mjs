// spotcheck <S> <unit> <R> --seed N [--per-slot K] [--extra <slot>=<K> ...]
// Draws each reader's random spot-checks reproducibly: K of the items the reader marked ok (canaries
// excluded), half from the early half of its positions and half from the late half, and writes them with
// the seed to r<R>/spotchecks.json. Weighted picks are the writer's own and are not drawn here.
import fs from 'node:fs';
import path from 'node:path';
import { fail, readJson, readJsonl, writeJson, parsePosInt, prng, hashString } from './util.mjs';
import { loadConfig, requireUnit, requireRoundDir } from './state.mjs';

function draw(pool, n, rnd) {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export function spotcheck({ S, unit, R, seed, perSlot, extra = [] }) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  const rd = requireRoundDir(S, unit, R);
  if (seed === undefined) fail('spotcheck needs --seed N (write the seed down: it makes the picks reproducible)');
  const sd = parsePosInt(seed, '--seed', { min: 0 });
  const K = perSlot === undefined ? 5 : parsePosInt(perSlot, '--per-slot');
  const outP = path.join(rd, 'spotchecks.json');
  if (fs.existsSync(outP)) fail(`refusing: ${outP} already exists (one draw per round)`);
  const list = readJson(path.join(rd, 'list.json'), 'list.json');
  const pos = new Map(list.map((id, i) => [id, i + 1]));
  const files = fs.readdirSync(rd).filter((f) => /^agent-.+\.jsonl$/.test(f)).sort();
  if (!files.length) fail('spotcheck: no reader result files (agent-<slot>.jsonl) in this round');
  const slots = files.map((f) => f.replace(/^agent-/, '').replace(/\.jsonl$/, ''));
  const more = new Map();
  for (const e of [].concat(extra || [])) {
    const m = /^([^=]+)=(\d+)$/.exec(String(e));
    if (!m) fail(`--extra takes <slot>=<K>, got ${JSON.stringify(e)}`);
    if (!slots.includes(m[1])) fail(`--extra names ${m[1]}, which has no reader file in this round`);
    more.set(m[1], Number(m[2]));
  }
  const picks = {};
  const notes = [];
  for (const [i, slot] of slots.entries()) {
    const rows = readJsonl(path.join(rd, files[i]), { strict: false }).rows.map((r) => r.obj).filter((o) => o && pos.has(o.id));
    if (!rows.length) continue;
    const ps = rows.map((o) => pos.get(o.id));
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    const mid = (lo + hi) / 2;
    const oks = rows.filter((o) => o.verdict === 'ok').map((o) => ({ id: o.id, position: pos.get(o.id), half: pos.get(o.id) <= mid ? 'early' : 'late' }));
    const n = K + (more.get(slot) || 0);
    const rnd = prng((sd ^ hashString(slot)) >>> 0);
    const early = oks.filter((x) => x.half === 'early');
    const late = oks.filter((x) => x.half === 'late');
    let a = draw(early, Math.ceil(n / 2), rnd);
    let b = draw(late, n - a.length, rnd);
    if (a.length + b.length < n) a = a.concat(draw(early.filter((x) => !a.includes(x)), n - a.length - b.length, rnd));
    if (a.length + b.length < n) notes.push(`${slot}: only ${a.length + b.length} ok item(s) to pick from, wanted ${n}`);
    picks[slot] = [...a, ...b].sort((x, y) => x.position - y.position);
  }
  writeJson(outP, { seed: sd, perSlot: K, extra: Object.fromEntries(more), picks });
  const lines = Object.entries(picks).map(([slot, xs]) => `${slot}: ${xs.map((x) => `${x.id} (${x.position}, ${x.half})`).join(', ')}`);
  return {
    output: [...lines, ...notes.map((x) => `NOTE: ${x}`)].join('\n'),
    summary: `spotcheck ${unit} r${R}: seed ${sd}, ${K} per reader${more.size ? ` (+${[...more].map(([k, v]) => `${k} ${v}`).join(', ')})` : ''} -> ${outP}`,
  };
}
