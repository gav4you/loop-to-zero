// crosscheck <S> [--unit <unit>]: items read one window at a time never see each other, so two items
// that cite the same line and state different numbers both pass a reader who checks each one alone.
// This lists every cite two or more items share (a family the writer judges together) and flags the
// families whose items state different numbers. It reports; it never fails and never judges.
import { loadConfig, loadItems, requireUnit } from './state.mjs';

const NUM = /(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g;

function numbersOf(it, fields) {
  const text = fields.map((f) => (typeof it[f] === 'string' ? it[f] : '')).join(' ');
  return [...new Set(text.match(NUM) || [])].sort((a, b) => Number(a) - Number(b));
}

export function crosscheck({ S, unit }) {
  const cfg = loadConfig(S);
  if (unit) requireUnit(cfg, unit);
  const fields = Array.isArray(cfg.itemFields) && cfg.itemFields.length ? cfg.itemFields : ['title'];
  const items = loadItems(S).filter((it) => !unit || it.unit === unit);
  const byCite = new Map();
  for (const it of items) {
    for (const c of new Set((Array.isArray(it.cites) ? it.cites : []).map((x) => String(x).trim()).filter(Boolean))) {
      if (!byCite.has(c)) byCite.set(c, []);
      byCite.get(c).push(it);
    }
  }
  const out = [];
  let families = 0;
  let differ = 0;
  for (const [cite, its] of [...byCite.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    if (its.length < 2) continue;
    families++;
    const ids = its.map((x) => x.id);
    const nums = its.map((x) => ({ id: x.id, n: numbersOf(x, fields) }));
    const withNums = nums.filter((x) => x.n.length);
    const distinct = new Set(withNums.map((x) => x.n.join(',')));
    let line = `${cite}: ${its.length} items (${ids.join(', ')})`;
    if (distinct.size > 1) {
      differ++;
      line += `; numbers differ: ${withNums.map((x) => `${x.id} [${x.n.join(', ')}]`).join(', ')}`;
    }
    out.push(line);
  }
  return {
    output: out.join('\n'),
    summary: `crosscheck: ${families} shared cite(s), ${differ} with differing numbers in ${items.length} items${unit ? ` (unit ${unit})` : ''}`,
  };
}
