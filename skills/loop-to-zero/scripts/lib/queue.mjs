// queue <S> <unit> <R> init | next | mark | replace | rerun | status
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fail, readJson, readJsonl, writeJson, parseGroupSpec, parsePosInt, validName } from './util.mjs';
import { loadConfig, requireUnit, requireRoundDir, loadList, loadChunks, loadCanaryPlan, plantedFor, readerResultPath } from './state.mjs';
import { slotCoverage, fmtPositions } from './coverage.mjs';

export const STATES = ['queued', 'running', 'stopped-limit', 'stopped-credits', 'stopped-context', 'done', 'replaced', 'dropped-by-owner'];
// States in which a job's reading is over. Anything else is open (the guard uses the same rule).
export const CLOSED_STATES = ['done', 'replaced', 'dropped-by-owner'];
const isStopped = (s) => s.startsWith('stopped-');
// --reset: YYYY-MM-DDTHH:MM, optional :SS and fractional seconds, optional Z or +HH:MM/-HH:MM (no
// zone: local time).
const RESET_FORM = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
/**
 * A --reset value: the form above, and a date and time that exist as written. Date.parse refuses
 * (as the ECMAScript date-time format requires) a month 00 or 13, a day 00, a minute or second 60
 * and an offset out of range, such as +24:00. It accepts a day past the month's end and 24:00,
 * rolling them into the next day, so those two are checked here, on the written components (so the
 * machine's zone plays no part). A month outside 01-12 has no day count and is left to Date.parse.
 */
function validReset(s) {
  const m = RESET_FORM.exec(s);
  if (!m) return false;
  const [y, mo, d, h] = m.slice(1, 5).map(Number);
  if (d > daysInMonth(y, mo) || h > 23) return false;
  return !Number.isNaN(Date.parse(s));
}

function queuePath(rd) {
  return path.join(rd, 'queue.json');
}

function ctx(S, unit, R) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  const rd = requireRoundDir(S, unit, R);
  const list = loadList(rd);
  const chunks = loadChunks(rd, list.length);
  return { cfg, rd, list, chunks };
}

function loadQueue(rd) {
  const q = readJson(queuePath(rd), 'queue.json');
  if (!Array.isArray(q.slots) || !Array.isArray(q.groups)) fail('queue.json is malformed (needs "slots" and "groups")');
  return q;
}

/** Progress of one slot, computed from its result file (never from a reader's word). */
export function slotProgress(rd, list, entry, plan) {
  const rp = readerResultPath(rd, entry.slot);
  const { rows, errors, missing } = readJsonl(rp, { strict: false, mustExist: false });
  const cov = slotCoverage({ list, from: entry.from, to: entry.to, rows, canaryIds: plantedFor(plan, entry.slot) });
  return { missingFile: missing, errors, cov, lines: cov.realLines, resume: cov.resume, complete: !missing && !errors.length && cov.complete };
}

const OPAQUE_FIRST = 'abcdefghijkmnpqrstuvwxyz';
const OPAQUE_REST = 'abcdefghijkmnpqrstuvwxyz23456789';
/** A short random slot name (a letter, then 3 letters or digits) that no slot in `taken` has. */
export function opaqueName(taken) {
  for (let i = 0; i < 1000; i++) {
    let s = OPAQUE_FIRST[randomInt(OPAQUE_FIRST.length)];
    for (let k = 0; k < 3; k++) s += OPAQUE_REST[randomInt(OPAQUE_REST.length)];
    if (!taken.has(s)) {
      taken.add(s);
      return s;
    }
  }
  fail('could not find a free opaque slot name');
}

export function init({ S, unit, R, pairs, opaque, perChunk, only }) {
  const { cfg, rd, chunks } = ctx(S, unit, R);
  if (fs.existsSync(queuePath(rd))) fail(`refusing: ${queuePath(rd)} already exists`);
  // A final-check round (a closed unit reopened for the final targeted check) reads only the chunks
  // covering a dropped range from S/known-wrongs.txt (even one another reader read): it may queue a
  // subset of chunks, or none. The writer chooses them; the tool does not read that file.
  const finalCheck = cfg.units[unit]?.status === 'final-check';
  if (opaque && pairs && pairs.length) fail('give --opaque or --pairs, not both');
  if (!opaque && perChunk !== undefined) fail('--per-chunk goes only with --opaque');
  if (!opaque && only !== undefined) fail('--chunks goes only with --opaque');
  if (only !== undefined && !finalCheck) fail(`--chunks (a subset of the chunks) is only for a final-check unit; unit ${unit} is ${cfg.units[unit]?.status ?? 'without a status'}, so every chunk is queued`);
  if (!opaque && (!pairs || !pairs.length) && !finalCheck) fail('init needs --pairs <chunk>=<slotA>,<slotB> ... or --opaque');
  let groups;
  if (opaque) {
    // Short random names, so a reader cannot infer that another reader shares its range.
    const n = perChunk === undefined ? 2 : parsePosInt(perChunk, '--per-chunk');
    let names = Object.keys(chunks);
    if (only !== undefined) {
      names = String(only).split(',').map((x) => x.trim()).filter(Boolean);
      for (const c of names) if (!chunks[c]) fail(`--chunks names chunk ${c}, which is not in chunks.json (${Object.keys(chunks).join(', ')})`);
      if (new Set(names).size !== names.length) fail('--chunks lists a chunk twice');
    }
    const taken = new Set();
    groups = names.map((chunk) => ({ chunk, slots: Array.from({ length: n }, () => opaqueName(taken)) }));
  } else groups = (pairs || []).map((p) => parseGroupSpec(p, '--pairs'));
  const seenChunk = new Set();
  const seenSlot = new Set();
  const slots = [];
  const now = new Date().toISOString();
  for (const g of groups) {
    if (!chunks[g.chunk]) fail(`--pairs names chunk ${g.chunk}, which is not in chunks.json (${Object.keys(chunks).join(', ')})`);
    if (seenChunk.has(g.chunk)) fail(`--pairs lists chunk ${g.chunk} twice`);
    seenChunk.add(g.chunk);
    for (const s of g.slots) {
      if (seenSlot.has(s)) fail(`slot ${s} is listed twice`);
      seenSlot.add(s);
      const c = chunks[g.chunk];
      slots.push({ slot: s, chunk: g.chunk, from: c.from, to: c.to, state: 'queued', agent: null, reset: null, history: [{ at: now, state: 'queued' }] });
    }
  }
  const unread = Object.keys(chunks).filter((c) => !seenChunk.has(c));
  if (unread.length && !finalCheck) fail(`refusing: chunks with no readers: ${unread.join(', ')} (every chunk must be queued)`);
  writeJson(queuePath(rd), { unit, round: R, created: now, ...(opaque ? { opaque: true } : {}), ...(finalCheck ? { finalCheck: true } : {}), groups: groups.map((g) => ({ chunk: g.chunk, slots: g.slots })), slots });
  const readersArg = groups.map((g) => `${g.chunk}=${g.slots.join(',')}`).join(' ');
  const notQueued = unread.length ? `; final check: chunk(s) ${unread.join(', ')} not queued, so record reports their items not read` : '';
  return {
    output: opaque && groups.length ? `slots per chunk (for record): --chunk-readers ${readersArg}` : '',
    summary: `queue init: ${slots.length} slots in ${groups.length} groups${opaque ? ' (opaque names)' : ''}${notQueued} -> ${queuePath(rd)}`,
  };
}

export function next({ S, unit, R, cap }) {
  const { rd, list } = ctx(S, unit, R);
  const q = loadQueue(rd);
  const n = parsePosInt(cap, '--cap');
  const plan = loadCanaryPlan(rd);
  const by = new Map(q.slots.map((s) => [s.slot, s]));
  const active = q.slots.filter((s) => s.state === 'running' || isStopped(s.state));
  const out = [];
  const now = Date.now();
  for (const s of q.slots.filter((x) => isStopped(x.state))) {
    const pr = slotProgress(rd, list, s, plan);
    const pos = pr.resume ?? '(complete: check the file, then mark done)';
    if (s.state === 'stopped-limit' && s.reset && Date.parse(s.reset) > now) {
      out.push(`wait     ${s.slot} (agent ${s.agent || '-'}) until ${s.reset}, then continue from position ${pos}`);
    } else {
      out.push(`continue ${s.slot} (agent ${s.agent || '-'}): SendMessage "continue from position ${pos}"`);
    }
  }
  let free = n - active.length;
  const launches = [];
  const partial = q.groups.filter((g) => {
    const qd = g.slots.filter((s) => by.get(s).state === 'queued');
    return qd.length && qd.length < g.slots.length;
  });
  const whole = q.groups.filter((g) => g.slots.every((s) => by.get(s).state === 'queued'));
  const launchGroups = (gs) => {
    for (const g of gs) {
      const qd = g.slots.filter((s) => by.get(s).state === 'queued');
      if (qd.length > free) continue;
      for (const s of qd) {
        const e = by.get(s);
        launches.push(e);
        out.push(`launch   ${s} (chunk ${e.chunk}, positions ${e.from}-${e.to})`);
      }
      free -= qd.length;
    }
  };
  launchGroups(partial);
  // Reruns are in no group: each launches on its own, after the half-launched pairs.
  for (const e of q.slots.filter((s) => s.parent && s.state === 'queued')) {
    if (free < 1) break;
    launches.push(e);
    out.push(`launch   ${e.slot} (rerun of ${e.parent}, chunk ${e.chunk}, positions ${e.from}-${e.to})`);
    free--;
  }
  launchGroups(whole);
  const queued = q.slots.filter((s) => s.state === 'queued').length;
  return {
    output: out.join('\n'),
    summary: `queue next (cap ${n}): ${active.length} active, ${launches.length} to launch, ${queued - launches.length} still queued`,
    launches: launches.map((e) => e.slot),
  };
}

/** Add a transcript path (absolute) to a slot's list, once. */
function addTranscript(e, transcript) {
  if (transcript === undefined) return;
  if (typeof transcript !== 'string' || !transcript.trim()) fail('--transcript needs a path (the agent\'s transcript .jsonl)');
  const abs = path.resolve(transcript.trim());
  e.transcripts = e.transcripts || [];
  if (!e.transcripts.includes(abs)) e.transcripts.push(abs);
}

export function mark({ S, unit, R, slot, state, agent, reset, ruling, transcript }) {
  const { rd, list } = ctx(S, unit, R);
  validName(slot, 'slot');
  if (!STATES.includes(state)) fail(`state must be one of ${STATES.join(', ')} (got ${JSON.stringify(state)})`);
  const q = loadQueue(rd);
  const e = q.slots.find((s) => s.slot === slot);
  if (!e) fail(`slot ${slot} is not in queue.json`);
  // Only an ISO 8601 date and time with both parts, that exists: Date.parse alone accepts "Nov 10
  // 03:00" (year 2001) and "2026-11-10" (UTC midnight), so "next" would treat a known limit wait as over.
  if (reset !== undefined && !validReset(reset)) {
    fail(
      `--reset must be an ISO 8601 date and time, YYYY-MM-DDTHH:MM[:SS[.fff]][Z|+HH:MM|-HH:MM], such as 2026-11-10T03:00 (local time) ` +
        `or 2026-11-10T03:00Z; got ${JSON.stringify(reset)}. A bare clock time, a date with no time or no year, and an invalid date or time are refused`,
    );
  }
  if (ruling !== undefined && state !== 'dropped-by-owner') fail('--ruling goes only with dropped-by-owner');
  addTranscript(e, transcript);
  const plan = loadCanaryPlan(rd);
  if (state === 'dropped-by-owner') {
    // The owner approved dropping the rest of this reader's range. The tail is recorded, and record
    // marks the chunk as not full depth, so the round cannot count as a zero.
    if (typeof ruling !== 'string' || !ruling.trim()) fail('dropped-by-owner needs --ruling <id>: its decision id in the decision log (usually P-n)');
    const pr = slotProgress(rd, list, e, plan);
    if (pr.complete) fail(`refusing: ${slot} already covers its whole range ${e.from}-${e.to}; mark it done`);
    e.dropped = { from: pr.resume ?? e.from, to: e.to, ruling: ruling.trim() };
  }
  if (state === 'done') {
    const pr = slotProgress(rd, list, e, plan);
    if (!pr.complete) {
      const why = [];
      if (pr.missingFile) why.push('result file is missing');
      if (pr.errors.length) why.push(`${pr.errors.length} unparseable line(s)`);
      if (pr.cov.missing.length) why.push(`missing positions ${fmtPositions(pr.cov.missing)}`);
      if (pr.cov.duplicates.length) why.push(`duplicate positions ${pr.cov.duplicates.map((d) => d.pos).join(', ')}`);
      if (pr.cov.outside.length) why.push(`${pr.cov.outside.length} line(s) outside its range`);
      const pos = pr.resume ?? e.from;
      fail(
        `refusing: ${slot} does not cover its range ${e.from}-${e.to} (${why.join('; ')}). ` +
          `Mark it stopped-context and send "continue from position ${pos}": node <skill>/scripts/ltz.mjs queue ${S} ${unit} ${R} mark ${slot} stopped-context`,
      );
    }
  }
  if (state === 'running') {
    const a = agent || e.agent;
    if (!a) fail('running needs --agent <id> (the agent id is what a later continue is sent to)');
    e.agent = a;
  } else if (agent) {
    e.agent = agent;
  }
  e.reset = reset ?? (state === 'stopped-limit' ? e.reset : null);
  const prev = e.state;
  e.state = state;
  e.history = e.history || [];
  if (state !== 'dropped-by-owner') delete e.dropped;
  e.history.push({ at: new Date().toISOString(), state, agent: e.agent, ...(e.reset ? { reset: e.reset } : {}), ...(e.dropped ? { dropped: e.dropped } : {}) });
  writeJson(queuePath(rd), q);
  let extra = state === 'stopped-limit' && !e.reset ? ' (no --reset given: wait 30 minutes, then check)' : '';
  if (e.dropped) extra = ` (positions ${e.dropped.from}-${e.dropped.to} dropped by decision ${e.dropped.ruling}; the chunk is not full depth)`;
  if (transcript !== undefined) extra += ` (transcript ${e.transcripts[e.transcripts.length - 1]})`;
  return { summary: `queue mark: ${slot} ${prev} -> ${state}${e.agent ? ` (agent ${e.agent})` : ''}${extra}` };
}

/**
 * After an account change (or a new session) an old agent cannot be continued. The order: take FROM
 * (the slot's resume position) from status, launch a fresh agent on the same slot from FROM, then
 * record it here with its id; --from FROM, if given, must still equal the result file's resume
 * position. The slot stays open (running) with the new agent; the old agent goes into agentHistory.
 * (mark ... replaced is for closing an abandoned slot, not this.)
 */
export function replace({ S, unit, R, slot, agent, from, transcript }) {
  const { rd, list } = ctx(S, unit, R);
  validName(slot, 'slot');
  if (typeof agent !== 'string' || !agent.trim()) fail('replace needs --agent <newId> (the fresh agent now reading this slot)');
  const q = loadQueue(rd);
  const e = q.slots.find((s) => s.slot === slot);
  if (!e) fail(`slot ${slot} is not in queue.json`);
  if (['done', 'dropped-by-owner'].includes(e.state)) fail(`refusing: ${slot} is ${e.state}; nothing is left to read`);
  if (e.agent === agent.trim()) fail(`refusing: ${agent} is already ${slot}'s agent`);
  const pr = slotProgress(rd, list, e, loadCanaryPlan(rd));
  if (pr.complete) fail(`refusing: ${slot} already covers its range ${e.from}-${e.to}; mark it done`);
  const resume = pr.resume ?? e.from;
  if (from !== undefined) {
    const p = parsePosInt(from, '--from');
    if (p !== resume) {
      fail(
        `refusing: --from ${p}, but ${slot}'s result file resumes at position ${resume}; ` +
          (p < resume
            ? `earlier positions would be judged twice (unless the new agent has already written positions ${p}-${resume - 1}: check its lines, then replace without --from)`
            : 'positions would be skipped'),
      );
    }
  }
  addTranscript(e, transcript);
  const now = new Date().toISOString();
  e.agentHistory = e.agentHistory || [];
  if (e.agent) e.agentHistory.push({ agent: e.agent, until: now, state: e.state, replacedBy: agent.trim() });
  const prev = e.state;
  e.agent = agent.trim();
  e.state = 'running';
  e.reset = null;
  delete e.dropped;
  e.history = e.history || [];
  e.history.push({ at: now, state: 'running', agent: e.agent, replacedAgent: e.agentHistory.length ? e.agentHistory[e.agentHistory.length - 1].agent : null, from: resume });
  writeJson(queuePath(rd), q);
  return {
    output:
      from !== undefined
        ? `agent ${e.agent} reads ${slot} from FROM = ${resume}, as launched (it appends to agent-${slot}.jsonl)`
        : `agent ${e.agent} reads ${slot}; it must have been launched with FROM = ${resume} (it appends to agent-${slot}.jsonl); pass --from to have that checked`,
    summary: `queue replace: ${slot} ${prev} -> running with agent ${e.agent}; earlier agents: ${e.agentHistory.map((h) => h.agent).join(', ') || 'none'}`,
  };
}

/**
 * A re-run or supplementary read of positions P-Q of a slot: a new slot with an opaque name, its
 * parent recorded. record takes the rerun's lines for P-Q in place of the parent's (the latest
 * rerun wins). The parent must be a slot of the queue's groups, not a rerun itself.
 */
export function rerun({ S, unit, R, slot, from, to }) {
  const { rd } = ctx(S, unit, R);
  validName(slot, 'slot');
  const q = loadQueue(rd);
  const p = q.slots.find((s) => s.slot === slot);
  if (!p) fail(`slot ${slot} is not in queue.json`);
  if (p.parent) fail(`refusing: ${slot} is itself a rerun of ${p.parent}; rerun ${p.parent} instead (the latest rerun wins)`);
  if (from === undefined || to === undefined) fail('rerun needs --from P --to Q (the positions to read again)');
  const P = parsePosInt(from, '--from');
  const Q = parsePosInt(to, '--to');
  if (P > Q) fail(`--from ${P} is after --to ${Q}`);
  if (P < p.from || Q > p.to) fail(`refusing: ${P}-${Q} is not inside ${slot}'s range ${p.from}-${p.to}`);
  const name = opaqueName(new Set(q.slots.map((s) => s.slot)));
  const now = new Date().toISOString();
  q.slots.push({ slot: name, chunk: p.chunk, from: P, to: Q, parent: slot, state: 'queued', agent: null, reset: null, created: now, history: [{ at: now, state: 'queued', rerunOf: slot }] });
  writeJson(queuePath(rd), q);
  return {
    output: `launch a fresh agent with ${slot}'s brief on slot ${name}, FROM = ${P}, ${Q - P + 1} items (it writes agent-${name}.jsonl); then mark ${name} running --agent <id>`,
    summary: `queue rerun: new slot ${name} reads ${slot}'s positions ${P}-${Q} again (queued); record uses its lines there`,
  };
}

export function status({ S, unit, R }) {
  const { rd, list } = ctx(S, unit, R);
  const q = loadQueue(rd);
  const plan = loadCanaryPlan(rd);
  const out = [];
  const counts = {};
  let inconsistent = 0;
  for (const e of q.slots) {
    counts[e.state] = (counts[e.state] || 0) + 1;
    const pr = slotProgress(rd, list, e, plan);
    const resume = pr.resume === null ? (pr.missingFile ? e.from : 'complete') : pr.resume;
    let flag = '';
    if (e.state === 'done' && !pr.complete) {
      flag = '  !! marked done but the file no longer covers the range';
      inconsistent++;
    }
    const drop =
      (e.parent ? `  rerun of ${e.parent}` : '') +
      (e.dropped ? `  dropped ${e.dropped.from}-${e.dropped.to} (decision ${e.dropped.ruling})` : '') +
      (e.agentHistory && e.agentHistory.length ? `  earlier agents ${e.agentHistory.map((h) => h.agent).join(', ')}` : '') +
      (e.transcripts && e.transcripts.length ? `  transcripts ${e.transcripts.length}` : '');
    out.push(
      `${e.slot.padEnd(12)} chunk ${e.chunk} ${e.from}-${e.to}  ${e.state.padEnd(16)} agent ${e.agent || '-'}  ` +
        `lines ${pr.lines}  resume ${resume}${e.reset ? `  reset ${e.reset}` : ''}${drop}${flag}`,
    );
  }
  const desc = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ');
  return { output: out.join('\n'), summary: `queue status: ${q.slots.length} slots (${desc})`, failed: inconsistent > 0 };
}
