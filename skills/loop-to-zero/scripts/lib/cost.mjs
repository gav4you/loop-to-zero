// cost <transcript.jsonl>... | cost --queue <S> <unit> <R> | cost --timeline <transcript.jsonl>:
// token use from Claude Code agent transcripts.
import fs from 'node:fs';
import path from 'node:path';
import { fail, stripBom, readJson } from './util.mjs';
import { loadConfig, requireUnit, requireRoundDir } from './state.mjs';

const FIELDS = ['cache_read_input_tokens', 'cache_creation_input_tokens', 'input_tokens', 'output_tokens'];

/** Sum one transcript; a message id seen on several lines counts once, at the max of each field. */
export function costOfFile(file) {
  if (!fs.existsSync(file)) fail(`transcript not found: ${file}`);
  const byId = new Map();
  let malformed = 0;
  let n = 0;
  for (const line of stripBom(fs.readFileSync(file, 'utf8')).split(/\r?\n/)) {
    if (!line.trim()) continue;
    n++;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }
    const msg = o && o.message;
    const u = msg && msg.usage;
    if (!u || typeof u !== 'object') continue;
    const id = msg.id || o.requestId || o.uuid || `line-${n}`;
    const prev = byId.get(id) || Object.fromEntries(FIELDS.map((f) => [f, 0]));
    for (const f of FIELDS) prev[f] = Math.max(prev[f], Number(u[f]) || 0);
    byId.set(id, prev);
  }
  const t = { cacheReads: 0, cacheWrites: 0, otherInput: 0, output: 0 };
  for (const v of byId.values()) {
    t.cacheReads += v.cache_read_input_tokens;
    t.cacheWrites += v.cache_creation_input_tokens;
    t.otherInput += v.input_tokens;
    t.output += v.output_tokens;
  }
  t.total = t.cacheReads + t.cacheWrites + t.otherInput + t.output;
  return { file, messages: byId.size, malformed, ...t };
}

const sumRows = (rows) =>
  rows.reduce((a, r) => {
    for (const k of ['cacheReads', 'cacheWrites', 'otherInput', 'output', 'total', 'messages']) a[k] += r[k];
    return a;
  }, { cacheReads: 0, cacheWrites: 0, otherInput: 0, output: 0, total: 0, messages: 0 });
const fmtTot = (t) => `cache reads ${t.cacheReads}, cache writes ${t.cacheWrites}, other input ${t.otherInput}, output ${t.output}, total ${t.total}`;

/** cost --queue <S> <unit> <R>: every transcript stored in the round's queue.json, summed. */
export function costQueue({ S, unit, R }) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  const rd = requireRoundDir(S, unit, R);
  const qp = path.join(rd, 'queue.json');
  if (!fs.existsSync(qp)) fail(`no queue.json in ${rd}`);
  const q = readJson(qp, 'queue.json');
  const slots = Array.isArray(q.slots) ? q.slots : [];
  const seen = new Set();
  const out = [];
  const rows = [];
  const problems = [];
  const without = [];
  for (const s of slots) {
    const ts = Array.isArray(s.transcripts) ? s.transcripts.filter((x) => typeof x === 'string') : [];
    if (!ts.length) without.push(s.slot);
    for (const t of ts) {
      if (seen.has(t)) continue;
      seen.add(t);
      if (!fs.existsSync(t)) {
        problems.push(`${s.slot}: transcript not found: ${t}`);
        continue;
      }
      const r = costOfFile(t);
      if (!r.messages) problems.push(`${s.slot}: no usage found in ${t} (is it an agent transcript?)`);
      rows.push(r);
      out.push(`${s.slot}  ${t}\n  ${fmtTot(r)}  (${r.messages} messages)`);
    }
  }
  if (!seen.size) fail(`no transcript paths in ${qp}; store them at launch: queue <S> <unit> <R> mark <slot> running --agent <id> --transcript <path>`);
  const tot = sumRows(rows);
  const warnings = without.length ? [`no transcript stored for: ${without.join(', ')}`] : [];
  return {
    output: out.join('\n'),
    warnings,
    problems,
    summary: `cost --queue ${unit} r${String(R).replace(/^r/, '')}: ${rows.length} transcript(s) from ${slots.length - without.length} of ${slots.length} slots: ${fmtTot(tot)}`,
    total: tot,
  };
}

const RENDER_CALL = /\bltz(?:\.mjs)?["']?\s+render\s+(.+)$/m;
/**
 * The render command an assistant message runs, if any (a window boundary). "render <S> <unit> <R>
 * <slot> show <cite>" is extra reading, the same as show, so it starts no window.
 */
function renderCall(msg) {
  const content = msg && Array.isArray(msg.content) ? msg.content : [];
  for (const c of content) {
    if (!c || c.type !== 'tool_use' || !c.input) continue;
    const m = RENDER_CALL.exec(String(c.input.command || ''));
    if (!m) continue;
    const args = m[1].trim().split(/\s+/);
    if (args[4] === 'show') continue;
    return m[1].trim().slice(0, 80);
  }
  return null;
}

/**
 * cost --timeline <transcript>: tokens per message with timestamps, in transcript order. Each render
 * call starts a window; the messages before the first one are the startup cost.
 */
export function timeline({ file }) {
  if (!file) fail('cost --timeline needs a transcript .jsonl file');
  if (!fs.existsSync(file)) fail(`transcript not found: ${file}`);
  const byId = new Map();
  let n = 0;
  let malformed = 0;
  for (const line of stripBom(fs.readFileSync(file, 'utf8')).split(/\r?\n/)) {
    if (!line.trim()) continue;
    n++;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }
    const msg = o && o.message;
    const u = msg && msg.usage;
    if (!u || typeof u !== 'object') continue;
    const id = msg.id || o.requestId || o.uuid || `line-${n}`;
    const t = Date.parse(o.timestamp);
    let e = byId.get(id);
    if (!e) {
      e = { id, at: Number.isNaN(t) ? null : t, render: null, ...Object.fromEntries(FIELDS.map((f) => [f, 0])) };
      byId.set(id, e);
    } else if (!Number.isNaN(t) && (e.at === null || t < e.at)) e.at = t;
    for (const f of FIELDS) e[f] = Math.max(e[f], Number(u[f]) || 0);
    e.render = e.render || renderCall(msg);
  }
  const msgs = [...byId.values()];
  if (!msgs.length) fail(`no usage found in ${file} (is it an agent transcript?)`);
  const t0 = msgs.find((m) => m.at !== null)?.at ?? null;
  const tokens = (m) => FIELDS.reduce((a, f) => a + m[f], 0);
  const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
  const out = [];
  let cum = 0;
  // Blocks: startup, then one per render call.
  const blocks = [{ name: 'startup', start: t0, end: t0, tokens: 0, messages: 0 }];
  msgs.forEach((m, i) => {
    if (m.render) blocks.push({ name: `window ${blocks.length} (render ${m.render})`, start: m.at, end: m.at, tokens: 0, messages: 0 });
    const b = blocks[blocks.length - 1];
    const tk = tokens(m);
    cum += tk;
    b.tokens += tk;
    b.messages++;
    if (m.at !== null) b.end = m.at;
    const when = m.at === null ? '(no time)' : `${new Date(m.at).toISOString()} +${mmss(m.at - t0)}`;
    out.push(
      `${String(i + 1).padStart(4)}  ${when}  cache reads ${m.cache_read_input_tokens}, cache writes ${m.cache_creation_input_tokens}, other input ${m.input_tokens}, output ${m.output_tokens}; ` +
        `message ${tk}, cumulative ${cum}${m.render ? `   << render ${m.render}` : ''}`,
    );
  });
  // A block runs until the next block starts.
  for (let i = 0; i < blocks.length; i++) {
    const next = blocks[i + 1];
    if (next && next.start !== null) blocks[i].end = next.start;
  }
  out.push('');
  for (const b of blocks) {
    if (!b.messages && b.name === 'startup') continue;
    const mins = b.start !== null && b.end !== null ? ((b.end - b.start) / 60000).toFixed(1) : '?';
    out.push(`${b.name}: ${b.messages} message(s), ${b.tokens} tokens, ${mins} min`);
  }
  const windows = blocks.slice(1);
  const span = t0 !== null ? (Math.max(...msgs.filter((m) => m.at !== null).map((m) => m.at)) - t0) / 60000 : null;
  const avg = (k) => (windows.length ? Math.round(windows.reduce((a, b) => a + b[k], 0) / windows.length) : 0);
  const avgMin = windows.length && windows.every((b) => b.start !== null && b.end !== null) ? (windows.reduce((a, b) => a + (b.end - b.start), 0) / windows.length / 60000).toFixed(1) : '?';
  return {
    output: out.join('\n'),
    summary:
      `cost --timeline: ${msgs.length} messages over ${span === null ? '?' : span.toFixed(1)} min, ${cum} tokens; startup ${blocks[0].tokens} tokens before the first render; ` +
      `${windows.length} window(s)${windows.length ? `, about ${avg('tokens')} tokens and ${avgMin} min each` : ''}${malformed ? `; ${malformed} malformed lines skipped` : ''}`,
    blocks,
  };
}

export function cost({ files }) {
  if (!files.length) fail('cost needs at least one transcript .jsonl file');
  const rows = files.map(costOfFile);
  const empty = rows.filter((r) => !r.messages);
  const fmt = (r) =>
    `${r.file}\n  cache reads ${r.cacheReads}, cache writes ${r.cacheWrites}, other input ${r.otherInput}, output ${r.output}, total ${r.total}` +
    `  (${r.messages} messages${r.malformed ? `, ${r.malformed} malformed lines skipped` : ''})`;
  const out = rows.map(fmt);
  const tot = rows.reduce((a, r) => {
    for (const k of ['cacheReads', 'cacheWrites', 'otherInput', 'output', 'total', 'messages']) a[k] += r[k];
    return a;
  }, { cacheReads: 0, cacheWrites: 0, otherInput: 0, output: 0, total: 0, messages: 0 });
  const summary =
    `cost: ${rows.length} file(s): cache reads ${tot.cacheReads}, cache writes ${tot.cacheWrites}, other input ${tot.otherInput}, output ${tot.output}, total ${tot.total}`;
  if (empty.length) {
    return { output: out.join('\n'), summary, failed: true, problems: [`no usage found in: ${empty.map((r) => r.file).join(', ')} (is it an agent transcript?)`] };
  }
  return { output: out.join('\n'), summary, rows, total: tot };
}
