// record <S> <unit> <R> --chunk-readers <chunk>=<slotA>,<slotB> ...
import fs from 'node:fs';
import path from 'node:path';
import { fail, LtzError, readJson, readJsonl, writeJson, parseGroupSpec, compressLines, listRounds, parseRound } from './util.mjs';
import {
  loadConfig, requireUnit, requireRoundDir, verifySnapshot, loadSnapshot, loadList, loadChunks,
  loadCanaries, loadCanaryPlan, plantedFor, readerResultPath, renderLogPath, historyFolders,
} from './state.mjs';
import { decisionLogIds, barRulings } from './rulings.mjs';
import { pinRecord, loadPinRecord, pinDifference } from './sources.mjs';
import {
  loadRenderLog, citeInLog, citeLinesRead, mergeLineMaps, noteRefs, fileRefs, refInLog, noteNamesLoggedLine, slotCoverage, fmtPositions,
} from './coverage.mjs';
import { estimateRemaining, estimateRange, ESTIMATE_CAVEAT, round2 } from './estimate.mjs';

const RESERVED = new Set(['pending', 'defects', 'withdrawn', 'outsideBar', 'ruledKept', 'rejected']);
// plain-fix-failure: the earlier fix did not settle it; new-text: the wrong is in text an earlier fix
// introduced; earlier-miss: a different claim of the same class in old text, missed earlier.
export const REPEAT_REASONS = ['plain-fix-failure', 'new-text', 'earlier-miss'];
// Verdicts: readers give ok or wrong; the writer records pending-owner and defect; report.json adds
// unread for an item no reader read, and outside-bar for a reader wrong the writer listed as outside a
// frozen bar (confirmed.json "outsideBar": listed for the owner, not counted).
export const VERDICTS = ['ok', 'wrong', 'pending-owner', 'defect', 'unread', 'outside-bar'];
// How a confirmed wrong no reader marked was found. "audit" is a known outside finding (an audit or
// review); "fixcheck" a fix checker's find in old, snapshot text (a named item or an unchanged field);
// "extract" an item the extract flagged with no usable cite. All count as found by none.
export const FOUND_BY = ['sweep', 'spot-check', 'audit', 'fixcheck', 'extract'];
// Why a pending id waits for the owner. rule-meaning: readers and writer dispute what a rule means;
// boundary-silent: the boundary is silent on the refuter's kind of evidence; ruled-wording: a ruling
// approved the refuted wording. The last two concern items the evidence refutes, so they always block
// a zero; ownerQuestionsBlock governs only rule-meaning.
export const PENDING_REASONS = ['rule-meaning', 'boundary-silent', 'ruled-wording'];
export const ALWAYS_BLOCKING_PENDING = ['boundary-silent', 'ruled-wording'];

/**
 * Parse confirmed.json:
 * {"<id>": {note, foundBy?, class?, repeatReason?, repeatNote?, rulingsChecked?},
 *  "pending": [{id, pendingReason, question?}], "withdrawn": [{id, ruling}],
 *  "outsideBar": [{id, note}], "ruledKept": [{id, ruling}], "defects": [ids], "rejected": [{id, note}]}
 * "rejected" lists each reader wrong the writer did not confirm, with the reason and the file:line that
 * answers the refuter (or a note starting "history:" naming the earlier reasoned ok).
 * A bare id in "pending" (rounds before pending reasons) is read, with no reason; record refuses it.
 * "outsideBar", "ruledKept" and "rejected" are read leniently: their shape errors come back in outsideBarShape,
 * ruledKeptShape and rejectedShape, which record reports as PROBLEMs (other callers, such as replay and the
 * earlier-round repeat scan, ignore them).
 */
export function loadConfirmed(file) {
  const raw = readJson(file, 'confirmed.json');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('confirmed.json must be a JSON object');
  const dv = raw.defects === undefined ? [] : raw.defects;
  if (!Array.isArray(dv) || dv.some((x) => typeof x !== 'string')) fail('confirmed.json: "defects" must be an array of ids');
  const defects = new Set(dv);
  const pv = raw.pending === undefined ? [] : raw.pending;
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (!Array.isArray(pv) || pv.some((x) => typeof x !== 'string' && !(isObj(x) && typeof x.id === 'string'))) {
    fail('confirmed.json: "pending" must be an array of {"id", "pendingReason"} entries');
  }
  const pending = new Set();
  const pendingReasons = new Map(); // id -> reason (undefined for a bare id)
  for (const x of pv) {
    const id = typeof x === 'string' ? x : x.id;
    pending.add(id);
    pendingReasons.set(id, typeof x === 'string' ? undefined : x.pendingReason);
  }
  // Reader wrongs a ruling given mid-round overturned: [{id, ruling}].
  const wv = raw.withdrawn === undefined ? [] : raw.withdrawn;
  if (!Array.isArray(wv) || wv.some((x) => !(isObj(x) && typeof x.id === 'string'))) {
    fail('confirmed.json: "withdrawn" must be an array of {"id", "ruling"} entries');
  }
  const withdrawn = new Map(wv.map((x) => [x.id, x.ruling]));
  // Reader wrongs outside a frozen bar (they fit no class): [{id, note}], listed for the owner and not
  // counted.
  const ov = raw.outsideBar === undefined ? [] : raw.outsideBar;
  const outsideBar = new Map();
  const outsideBarShape = [];
  if (!Array.isArray(ov)) outsideBarShape.push('confirmed.json: "outsideBar" must be an array of {"id", "note"} entries');
  else {
    ov.forEach((x, i) => {
      if (!isObj(x) || typeof x.id !== 'string' || !x.id.trim()) {
        outsideBarShape.push(`confirmed.json: "outsideBar" entry ${i + 1} (${JSON.stringify(x)}) is not an {"id", "note"} entry`);
        return;
      }
      if (outsideBar.has(x.id)) outsideBarShape.push(`confirmed.json: "outsideBar" lists ${x.id} twice`);
      outsideBar.set(x.id, x.note);
    });
  }
  // Ruled oks the writer checked and found covered by a ruling the owner kept (after an "amend
  // <ruling>?" question): [{id, ruling}]. record checks each against this round's ruled oks.
  const kv = raw.ruledKept === undefined ? [] : raw.ruledKept;
  const ruledKept = [];
  const ruledKeptShape = [];
  if (!Array.isArray(kv)) ruledKeptShape.push('confirmed.json: "ruledKept" must be an array of {"id", "ruling"} entries');
  else {
    const seen = new Set();
    kv.forEach((x, i) => {
      if (!isObj(x) || typeof x.id !== 'string' || !x.id.trim() || typeof x.ruling !== 'string' || !x.ruling.trim()) {
        ruledKeptShape.push(`confirmed.json: "ruledKept" entry ${i + 1} (${JSON.stringify(x)}) is not an {"id", "ruling"} entry with both non-empty`);
        return;
      }
      const key = `${x.id}\u0000${x.ruling.trim()}`;
      if (seen.has(key)) ruledKeptShape.push(`confirmed.json: "ruledKept" lists ${x.id} with ruling ${x.ruling.trim()} twice`);
      seen.add(key);
      ruledKept.push({ id: x.id, ruling: x.ruling.trim() });
    });
  }
  const wrongs = new Map();
  for (const [k, v] of Object.entries(raw)) {
    if (RESERVED.has(k)) continue;
    wrongs.set(k, v);
  }
  const jv = raw.rejected === undefined ? [] : raw.rejected;
  const rejected = new Map();
  const rejectedShape = [];
  if (!Array.isArray(jv)) rejectedShape.push('confirmed.json: "rejected" must be an array of {"id", "note"} entries');
  else {
    jv.forEach((x, i) => {
      if (!isObj(x) || typeof x.id !== 'string') {
        rejectedShape.push(`confirmed.json: "rejected" entry ${i + 1} (${JSON.stringify(x)}) is not an {"id", "note"} entry`);
        return;
      }
      if (rejected.has(x.id)) rejectedShape.push(`confirmed.json: "rejected" lists ${x.id} twice`);
      rejected.set(x.id, x.note);
    });
  }
  return { wrongs, pending, pendingReasons, defects, withdrawn, outsideBar, outsideBarShape, ruledKept, ruledKeptShape, rejected, rejectedShape };
}

/** The owner's close rulings: {ownerQuestionsBlock (default true), defectsBlock (default false)}. */
export function closeRules(cfg) {
  const get = (k, dflt) => {
    if (cfg[k] === undefined) return dflt;
    if (typeof cfg[k] !== 'boolean') fail(`config.json: "${k}" must be true or false`);
    return cfg[k];
  };
  return { ownerQuestionsBlock: get('ownerQuestionsBlock', true), defectsBlock: get('defectsBlock', false) };
}

export function classesOf(entry) {
  if (!entry || entry.class === undefined) return [];
  return Array.isArray(entry.class) ? entry.class.map(String) : [String(entry.class)];
}

/** Class labels readers gave each id they marked wrong in one round folder: Map(id -> Set). */
export function readerClasses(rd) {
  const map = new Map();
  if (!fs.existsSync(rd)) return map;
  for (const f of fs.readdirSync(rd).filter((x) => /^agent-.+\.jsonl$/.test(x))) {
    const { rows } = readJsonl(path.join(rd, f), { strict: false });
    for (const { obj } of rows) {
      if (obj.verdict !== 'wrong') continue;
      const cls = Array.isArray(obj.class) ? obj.class : obj.class ? [obj.class] : [];
      if (!map.has(obj.id)) map.set(obj.id, new Set());
      for (const c of cls) map.get(obj.id).add(String(c));
    }
  }
  return map;
}

/**
 * A repeat kept wrong lists every bar ruling in the decision log, each with why it does not cover the
 * item: "rulingsChecked": [{"ruling": "<ruling id>", "why": "<why it does not cover this item>"}, ...].
 * `log` is barRulings(S, cfg). With it "ok", the listed rulings must equal the log's ruling ids: each
 * a whole ruling id (config "rulingIdPattern") in the log, with a non-empty why, listed once, and no
 * log id left out. With "decisionLog" or "rulingIdPattern" absent ("none"), a non-empty list is a
 * PROBLEM (nothing to check it against) and [] is accepted with an info line; "bad" is a PROBLEM.
 * Returns {problems, infos}.
 */
export function rulingsCheckedProblems(id, v, log) {
  const problems = [];
  const infos = [];
  const rc = v.rulingsChecked;
  const ask = `list every bar ruling in the decision log, each with why it doesn't cover ${id}`;
  if (!Array.isArray(rc)) {
    problems.push(
      `confirmed.json: ${id} has repeatReason "${v.repeatReason}" but "rulingsChecked" is ${rc === undefined ? 'missing' : JSON.stringify(rc)}, not a list: ` +
        `${ask} ("rulingsChecked": [{"ruling": "<ruling id>", "why": "<why it does not cover this item>"}, ...])`,
    );
    return { problems, infos };
  }
  if (log.state === 'bad') {
    problems.push(`confirmed.json: ${id} "rulingsChecked" cannot be checked: ${log.reason}`);
    return { problems, infos };
  }
  if (log.state !== 'ok') {
    if (rc.length) problems.push(`confirmed.json: ${id} "rulingsChecked" lists ${rc.length} ruling(s), but ${log.reason}, so there is nothing to check them against`);
    else infos.push(`confirmed.json: ${id} "rulingsChecked" is [] and was not checked: ${log.reason}`);
    return { problems, infos };
  }
  const listed = new Set();
  rc.forEach((e, i) => {
    const at = `confirmed.json: ${id} "rulingsChecked" entry ${i + 1}`;
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      problems.push(`${at} (${JSON.stringify(e)}) is not a {"ruling", "why"} object`);
      return;
    }
    const r = e.ruling;
    if (typeof r !== 'string' || !log.whole.test(r)) {
      problems.push(`${at} has ruling ${JSON.stringify(r)}, which is not a ruling id (config "rulingIdPattern" /${log.pattern}/)`);
    } else if (!log.ids.has(r)) {
      problems.push(`${at} names ruling ${r}, which is not in the decision log (${log.logPath})`);
    }
    if (typeof r === 'string') {
      if (listed.has(r)) problems.push(`confirmed.json: ${id} "rulingsChecked" lists ruling ${r} twice`);
      listed.add(r);
    }
    if (typeof e.why !== 'string' || !e.why.trim()) problems.push(`${at} (${JSON.stringify(r)}) has no "why" (why that ruling does not cover ${id})`);
  });
  for (const rid of log.ids) {
    if (!listed.has(rid)) problems.push(`confirmed.json: ${id} "rulingsChecked" leaves out ${rid}, a bar ruling in the decision log (${log.logPath}): ${ask}`);
  }
  return { problems, infos };
}

/**
 * Repeat check: a confirmed id that an earlier round of the same unit (r0 excluded) also
 * confirmed, with an overlapping class. A class unknown on either side counts as overlapping.
 * Info lines (an empty "rulingsChecked" list accepted) are pushed to `infos`. Each repeat kept wrong
 * with a "repeatReason" is pushed to `repeats` as {id, repeatReason, of: [<earlier rounds>]}. A
 * "repeatReason" on an id no earlier round's standing wrong names is pushed to `warnings`.
 */
export function repeatProblems(S, unit, R, wrongs, curReaderClasses, cfg = {}, infos = [], repeats = [], warnings = []) {
  const problems = [];
  const prev = new Map();
  // Earlier rounds of this state folder (r1..r(R-1)), and every round (r0 aside) of the same unit in
  // each configured history folder, such as a discovery state folder.
  const sources = [{ base: S, label: '', all: false }];
  const hist = historyFolders(S, cfg);
  problems.push(...hist.problems);
  for (const f of hist.folders) sources.push({ base: f.dir, label: f.label, all: true });
  for (const src of sources) {
    for (const r of listRounds(path.join(src.base, unit))) {
      if (r.n === 0 || (!src.all && r.n >= R)) continue;
      const p = path.join(r.dir, 'confirmed.json');
      if (!fs.existsSync(p)) continue;
      const { wrongs: w } = loadConfirmed(p);
      const rc = readerClasses(r.dir);
      // A wrong that judgments.jsonl later overturned (its latest line for this unit and round says
      // "now": "ok" or "pending-owner") is no repeat basis, as replay treats it.
      const latest = new Map();
      const jp = path.join(src.base, 'judgments.jsonl');
      if (fs.existsSync(jp)) {
        for (const { obj: j } of readJsonl(jp, { what: jp }).rows) {
          if (!j || typeof j.id !== 'string' || (j.unit !== undefined && j.unit !== unit)) continue;
          if (Number(String(j.round).replace(/^r/, '')) !== r.n) continue;
          latest.set(j.id, j.now);
        }
      }
      for (const [id, v] of w) {
        if (latest.get(id) === 'ok' || latest.get(id) === 'pending-owner') continue;
        const cls = classesOf(v).length ? classesOf(v) : [...(rc.get(id) || [])];
        if (!prev.has(id)) prev.set(id, []);
        prev.get(id).push({ round: `${src.label}${r.name}`, cls });
      }
    }
  }
  let log = null; // the decision log's bar rulings, read once and only when a repeat needs them
  for (const [id, v] of wrongs) {
    const reason = v && typeof v === 'object' ? v.repeatReason : undefined;
    // The value is checked on every entry, a repeat or not.
    if (reason !== undefined && !REPEAT_REASONS.includes(reason)) {
      problems.push(`confirmed.json: ${id} has repeatReason ${JSON.stringify(reason)}; the accepted values are ${REPEAT_REASONS.map((r) => `"${r}"`).join(', ')}`);
      continue;
    }
    const earlier = prev.get(id);
    if (!earlier) {
      if (reason !== undefined) {
        warnings.push(`confirmed.json: ${id} has repeatReason "${reason}", but no earlier round's standing wrong names it (none confirmed it, or judgments.jsonl overturned it); it is not counted as a repeat`);
      }
      continue;
    }
    // The item's classes: the entry's, else the readers' labels.
    const cur = classesOf(v).length ? classesOf(v) : [...(curReaderClasses.get(id) || [])];
    if (reason !== undefined) {
      repeats.push({ id, repeatReason: reason, of: [...new Set(earlier.map((e) => e.round))] });
      if (typeof v.repeatNote !== 'string' || !v.repeatNote.trim()) {
        problems.push(`confirmed.json: ${id} has repeatReason "${v.repeatReason}" but no "repeatNote" (what happened: the failed fix, the introducing fix, or the earlier miss)`);
      }
      // Keeping a repeat as wrong is safe only after checking that no ruling covers the point.
      if (log === null) log = barRulings(S, cfg);
      const rc = rulingsCheckedProblems(id, v, log);
      problems.push(...rc.problems);
      infos.push(...rc.infos);
      continue;
    }
    for (const e of earlier) {
      const overlap = !cur.length || !e.cls.length ? null : cur.filter((c) => e.cls.includes(c));
      if (overlap === null || overlap.length) {
        const what = overlap === null ? 'class unknown on one side, so it may be the same class' : `class ${overlap.join(', ')}`;
        problems.push(
          `confirmed.json: ${id} repeats ${e.round} (${what}). If the evidence plainly refutes it, keep it wrong with ` +
            '"repeatReason": "plain-fix-failure" (the earlier fix failed), "new-text" (an earlier fix introduced the text) ' +
            'or "earlier-miss" (a different claim of the class, missed earlier in old text) and a "repeatNote"; ' +
            'only the Verdicts exceptions go in "pending", with a "pendingReason": "rule-meaning" (a dispute over a rule\'s meaning), ' +
            '"boundary-silent" (the boundary is silent on the refuter\'s kind of evidence) or "ruled-wording" (a ruling approved the wording)',
        );
        break;
      }
    }
  }
  return problems;
}

/**
 * The fix checker's results in a round folder: fixcheck-<K>-<part>.jsonl (reader schema), with the
 * matching fixcheck-<K>-<part>-input.jsonl when it exists. Per iteration K: the items checked, the
 * wrongs, and any input item left unjudged. It never affects countsAsZero.
 */
export function fixCheckerSummary(rd, problems, warnings) {
  const iters = new Map(); // K -> Map(chunk -> {input, rows, file})
  for (const f of fs.readdirSync(rd).filter((x) => /^fixcheck-.*\.jsonl$/.test(x)).sort()) {
    const m = /^fixcheck-(\d+)-([A-Za-z0-9._-]+?)(-input)?\.jsonl$/.exec(f);
    if (!m) {
      problems.push(`${f}: a fix-checker file is named fixcheck-<K>-<part>.jsonl (or fixcheck-<K>-<part>-input.jsonl), where <K> is the iteration number`);
      continue;
    }
    const K = Number(m[1]);
    if (!iters.has(K)) iters.set(K, new Map());
    const chunks = iters.get(K);
    if (!chunks.has(m[2])) chunks.set(m[2], { input: null, rows: null, file: null });
    const c = chunks.get(m[2]);
    const { rows, errors } = readJsonl(path.join(rd, f), { strict: false });
    for (const e of errors) problems.push(`${f}: ${e}`);
    if (m[3]) c.input = rows.map((r) => r.obj && r.obj.id).filter((x) => typeof x === 'string');
    else {
      c.rows = rows;
      c.file = f;
    }
  }
  const out = [];
  for (const K of [...iters.keys()].sort((a, b) => a - b)) {
    const chunks = {};
    const checkedAll = new Set();
    const wrongAll = new Set();
    const notJudgedAll = [];
    for (const [name, c] of [...iters.get(K)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const checked = new Set();
      const wrong = new Set();
      for (const r of c.rows || []) {
        const o = r.obj;
        if (!o || typeof o.id !== 'string') {
          problems.push(`${c.file}: line ${r.lineNo} has no "id"`);
          continue;
        }
        if (o.verdict !== 'ok' && o.verdict !== 'wrong') {
          problems.push(`${c.file}: line ${r.lineNo} (${o.id}): verdict must be "ok" or "wrong" (got ${JSON.stringify(o.verdict)})`);
          continue;
        }
        checked.add(o.id);
        if (o.verdict === 'wrong') wrong.add(o.id);
      }
      const entry = { itemsChecked: checked.size, wrongs: wrong.size, wrongIds: [...wrong] };
      if (c.input) entry.inputItems = c.input.length;
      if (!c.rows) entry.notRun = true;
      else if (c.input) {
        entry.notJudged = c.input.filter((id) => !checked.has(id));
        notJudgedAll.push(...entry.notJudged);
        if (entry.notJudged.length) warnings.push(`fix checker ${K}, part ${name}: ${entry.notJudged.length} input item(s) not judged (${entry.notJudged.join(', ')})`);
      }
      chunks[name] = entry;
      for (const id of checked) checkedAll.add(id);
      for (const id of wrong) wrongAll.add(id);
    }
    out.push({ iteration: K, itemsChecked: checkedAll.size, wrongs: wrongAll.size, wrongIds: [...wrongAll], notJudged: notJudgedAll, chunks });
  }
  return out;
}

export function record({ S, unit, R, chunkReaders }) {
  const cfg = loadConfig(S);
  requireUnit(cfg, unit);
  const rd = requireRoundDir(S, unit, R);
  const confirmedPath = path.join(rd, 'confirmed.json');
  if (!fs.existsSync(confirmedPath)) {
    fail(`refusing: ${confirmedPath} is missing. Confirm the union first and write confirmed.json (use {} when nothing was confirmed).`);
  }
  // A final-check round reads only the chunks covering a dropped range from S/known-wrongs.txt (even
  // one another reader read); the writer names them in --chunk-readers (the tool does not read that
  // file). The others are reported not read, and the round never counts as a zero. Every other status
  // needs readers for every chunk.
  const finalCheck = cfg.units[unit]?.status === 'final-check';
  if (!finalCheck && (!chunkReaders || !chunkReaders.length)) fail('--chunk-readers <chunk>=<slotA>,<slotB> ... is required');

  const problems = [];
  const warnings = [];
  const roundPin = loadPinRecord(rd);
  const pinMoved = roundPin ? pinDifference(roundPin, pinRecord(cfg)) : null;
  if (pinMoved) {
    warnings.push(`evidence pin moved since this round's snapshot (${pinMoved}): tools now read the new pin, so a wrong only the new evidence shows is evidence drift, not a reader miss`);
  }
  let sha = null;
  try {
    sha = verifySnapshot(rd);
  } catch (e) {
    if (!(e instanceof LtzError)) throw e;
    problems.push(e.message);
  }
  const snap = loadSnapshot(rd);
  const byId = new Map(snap.map((it) => [it.id, it]));
  const list = loadList(rd);
  for (const id of list) if (!byId.has(id)) problems.push(`list.json id ${id} is not in snapshot.jsonl`);
  const chunks = loadChunks(rd, list.length);

  // The queue: ranges the owner approved dropping, and re-run slots (a "parent").
  let qSlots = [];
  const qP = path.join(rd, 'queue.json');
  if (fs.existsSync(qP)) {
    const q = readJson(qP, 'queue.json');
    if (!q || typeof q !== 'object' || Array.isArray(q)) fail('queue.json must be a JSON object ({"groups": [...], "slots": [...]})');
    qSlots = (Array.isArray(q.slots) ? q.slots : []).filter((s) => s && typeof s === 'object' && typeof s.slot === 'string');
  }
  const rerunSlots = new Map(qSlots.filter((s) => typeof s.parent === 'string').map((s) => [s.slot, s]));

  // Readers per chunk; every chunk must be read.
  const groups = (chunkReaders || []).map((s) => parseGroupSpec(s, '--chunk-readers'));
  const groupOf = new Map();
  const slotChunk = new Map();
  for (const g of groups) {
    if (!chunks[g.chunk]) problems.push(`--chunk-readers names chunk ${g.chunk}, which is not in chunks.json`);
    if (groupOf.has(g.chunk)) problems.push(`--chunk-readers lists chunk ${g.chunk} twice`);
    groupOf.set(g.chunk, g.slots);
    for (const s of g.slots) {
      if (slotChunk.has(s)) problems.push(`slot ${s} is listed for two chunks`);
      if (rerunSlots.has(s)) problems.push(`slot ${s} is a rerun of ${rerunSlots.get(s).parent}; name ${rerunSlots.get(s).parent} in --chunk-readers (record takes its rerun lines itself)`);
      slotChunk.set(s, g.chunk);
    }
  }
  // Every reader the queue holds must be named: a slot left out would take its wrongs out of the
  // union unseen. An abandoned slot is closed with "mark <slot> replaced", and is then not needed.
  for (const s of qSlots) {
    if (typeof s.parent === 'string' || s.state === 'replaced' || slotChunk.has(s.slot)) continue;
    problems.push(
      `queue.json holds slot ${s.slot} (chunk ${s.chunk}, state ${s.state}), which --chunk-readers does not name, so its lines would be left out; ` +
        `name it, or close it with "queue <S> <unit> <R> mark ${s.slot} replaced" if nobody will read it`,
    );
  }
  const notRead = [];
  for (const [name, c] of Object.entries(chunks)) {
    if (groupOf.has(name)) continue;
    if (finalCheck) notRead.push(name);
    else problems.push(`chunk ${name} (positions ${c.from}-${c.to}) has no readers in --chunk-readers; its items would be reported unread`);
  }
  // Reruns of each named slot, oldest first; a replaced (abandoned) rerun is not used.
  const rerunsOf = new Map();
  for (const r of rerunSlots.values()) {
    if (!slotChunk.has(r.parent)) {
      warnings.push(`rerun ${r.slot} of ${r.parent} is not used: ${r.parent} is not in --chunk-readers`);
      continue;
    }
    if (r.state === 'replaced') continue;
    if (!rerunsOf.has(r.parent)) rerunsOf.set(r.parent, []);
    rerunsOf.get(r.parent).push(r);
  }

  // Canaries.
  const plan = loadCanaryPlan(rd);
  const canaryMap = Object.keys(plan).length ? new Map(loadCanaries(S).map((c) => [c.id, c])) : new Map();
  for (const [slot, entries] of Object.entries(plan)) {
    for (const e of entries) if (!canaryMap.has(e.canaryId)) problems.push(`canary-plan.json: ${slot} names ${e.canaryId}, which is not in S/canaries.jsonl`);
    const usedRerun = rerunSlots.has(slot) && slotChunk.has(rerunSlots.get(slot).parent);
    if (!slotChunk.has(slot) && !usedRerun) warnings.push(`canary-plan.json has slot ${slot}, which is not in --chunk-readers; not scored`);
  }

  // Confirmed wrongs, pending ids and defects.
  const { wrongs, pending, pendingReasons, defects, withdrawn, outsideBar, outsideBarShape, ruledKept, ruledKeptShape, rejected, rejectedShape } = loadConfirmed(confirmedPath);
  for (const [id, v] of wrongs) {
    if (canaryMap.has(id)) problems.push(`confirmed.json: ${id} is a canary; canaries are scored, never confirmed`);
    else if (!byId.has(id)) problems.push(`confirmed.json: ${id} is not an item in this round's snapshot`);
    if (!v || typeof v !== 'object' || typeof v.note !== 'string' || !v.note.trim()) problems.push(`confirmed.json: ${id} has no "note"`);
    if (v && typeof v === 'object' && v.foundBy !== undefined && !FOUND_BY.includes(v.foundBy)) {
      problems.push(`confirmed.json: ${id} has foundBy ${JSON.stringify(v.foundBy)}; the accepted values are ${FOUND_BY.map((x) => `"${x}"`).join(', ')}`);
    }
    if (pending.has(id)) problems.push(`confirmed.json: ${id} is both confirmed wrong and pending`);
    if (defects.has(id)) problems.push(`confirmed.json: ${id} is both confirmed wrong and a defect`);
  }
  for (const id of pending) {
    if (!byId.has(id)) problems.push(`confirmed.json: pending id ${id} is not an item in this round's snapshot`);
    const why = pendingReasons.get(id);
    if (why === undefined) {
      problems.push(`confirmed.json: pending id ${id} has no "pendingReason"; write {"id": "${id}", "pendingReason": "${PENDING_REASONS.join('|')}"}`);
    } else if (!PENDING_REASONS.includes(why)) {
      problems.push(`confirmed.json: pending id ${id} has pendingReason ${JSON.stringify(why)}; the accepted values are ${PENDING_REASONS.map((x) => `"${x}"`).join(', ')}`);
    }
  }
  for (const id of defects) {
    if (!byId.has(id)) problems.push(`confirmed.json: defect id ${id} is not an item in this round's snapshot`);
    if (pending.has(id)) problems.push(`confirmed.json: ${id} is both pending and a defect`);
  }
  // Withdrawn by ruling: each ruling must be a whole ruling id (config rulingIdPattern) that the
  // decision log holds. Checked only when there is something withdrawn.
  for (const id of withdrawn.keys()) {
    if (!byId.has(id)) problems.push(`confirmed.json: withdrawn id ${id} is not an item in this round's snapshot`);
    if (wrongs.has(id)) problems.push(`confirmed.json: ${id} is both withdrawn and confirmed wrong`);
    if (pending.has(id)) problems.push(`confirmed.json: ${id} is both withdrawn and pending`);
    if (defects.has(id)) problems.push(`confirmed.json: ${id} is both withdrawn and a defect`);
  }
  if (withdrawn.size) {
    const d = decisionLogIds(S, cfg);
    if (d.error) problems.push(`confirmed.json: "withdrawn" needs its rulings checked, but ${d.error}`);
    else {
      const whole = new RegExp(`^(?:${cfg.rulingIdPattern})$`);
      for (const [id, ruling] of withdrawn) {
        if (typeof ruling !== 'string' || !whole.test(ruling)) {
          problems.push(`confirmed.json: withdrawn ${id} has ruling ${JSON.stringify(ruling)}, which is not a ruling id (config "rulingIdPattern" /${cfg.rulingIdPattern}/)`);
        } else if (!d.ids.includes(ruling)) {
          problems.push(`confirmed.json: withdrawn ${id} names ruling ${ruling}, which is not in the decision log (${d.logPath})`);
        }
      }
    }
  }
  // Outside the bar: reader wrongs that fit no class of a frozen bar. Listed for the owner, not counted:
  // neither confirmed wrongs nor false alarms. Each needs a note saying what the evidence shows.
  problems.push(...outsideBarShape);
  for (const [id, note] of outsideBar) {
    if (!byId.has(id)) problems.push(`confirmed.json: outsideBar id ${id} is not an item in this round's snapshot`);
    if (typeof note !== 'string' || !note.trim()) problems.push(`confirmed.json: outsideBar ${id} has no "note" (what the evidence shows, with file:line)`);
    if (wrongs.has(id)) problems.push(`confirmed.json: ${id} is both outside the bar and confirmed wrong`);
    if (pending.has(id)) problems.push(`confirmed.json: ${id} is both outside the bar and pending`);
    if (withdrawn.has(id)) problems.push(`confirmed.json: ${id} is both outside the bar and withdrawn`);
    if (defects.has(id)) problems.push(`confirmed.json: ${id} is both outside the bar and a defect`);
  }

  // Rejected: reader wrongs the writer did not confirm. Each names its reason and the file:line that
  // answers the refuter, or starts "history:" (an earlier reasoned ok that holds), so the stronger
  // reviewer can re-judge the dismissal. The grounding is checked below, once the readers' render logs
  // are loaded.
  problems.push(...rejectedShape);
  for (const [id, note] of rejected) {
    if (!byId.has(id)) problems.push(`confirmed.json: rejected id ${id} is not an item in this round's snapshot`);
    for (const [has, what] of [[wrongs, 'confirmed wrong'], [pending, 'pending'], [defects, 'a defect'], [withdrawn, 'withdrawn'], [outsideBar, 'outside the bar']]) {
      if (has.has(id)) problems.push(`confirmed.json: ${id} is both rejected and ${what}`);
    }
  }

  // Ranges the owner approved dropping (queue state dropped-by-owner, with a decision id).
  const dropped = new Map();
  for (const s of qSlots) {
    if (s.state !== 'dropped-by-owner') continue;
    const d = s.dropped;
    if (!d || !Number.isInteger(d.from) || !Number.isInteger(d.to) || typeof d.ruling !== 'string' || !d.ruling.trim()) {
      problems.push(`queue.json: ${s.slot} is dropped-by-owner without a dropped range and decision id`);
      continue;
    }
    dropped.set(s.slot, d);
  }
  const inDrop = (slot, p) => {
    const d = dropped.get(slot);
    return !!d && p >= d.from && p <= d.to;
  };

  // Per-reader coverage, over the merged view: a named slot's lines, with each rerun's lines in
  // place of them for the rerun's positions (the latest rerun wins). Each source must cover exactly
  // the positions it supplies; lines a later source supersedes are not used.
  const readers = new Map(); // named slot -> {slot, chunk, real: Map(pos -> {obj, lineNo, src, log}), owner, sources}
  const sourceInfo = new Map(); // file slot -> {cov}, for canary scoring
  const renderedPaths = new Set(); // every path a used render log shows, for the "rejected" notes
  for (const g of groups) {
    const c = chunks[g.chunk];
    if (!c) continue;
    for (const slot of g.slots) {
      const sources = [{ slot, from: c.from, to: c.to, parent: null }];
      for (const r of rerunsOf.get(slot) || []) {
        if (!Number.isInteger(r.from) || !Number.isInteger(r.to) || r.from > r.to || r.from < c.from || r.to > c.to) {
          problems.push(`queue.json: rerun ${r.slot} of ${slot} has range ${r.from}-${r.to}, which is not inside chunk ${g.chunk} (positions ${c.from}-${c.to})`);
          continue;
        }
        sources.push({ slot: r.slot, from: r.from, to: r.to, parent: slot, state: r.state });
      }
      const owner = new Map();
      for (let p = c.from; p <= c.to; p++) {
        let o = sources[0].slot;
        for (const s of sources.slice(1)) if (p >= s.from && p <= s.to) o = s.slot;
        owner.set(p, o);
      }
      const real = new Map();
      const superseded = []; // wrongs in lines a later rerun supersedes: {p, id, slot}
      for (const src of sources) {
        const sup = new Set();
        for (let p = src.from; p <= src.to; p++) if (owner.get(p) === src.slot) sup.add(p);
        src.positions = sup.size;
        const lab = src.parent ? `${src.slot} (rerun of ${slot})` : src.slot;
        const rp = readerResultPath(rd, src.slot);
        if (!sup.size) {
          // Wholly superseded by later reruns (a parent whose whole range was re-read, or an earlier
          // rerun): neither its result file nor its render log is needed. When the file is there, a
          // wrong in it is still compared with the line that replaces it, and its canaries are scored.
          if (fs.existsSync(rp)) {
            const cov = slotCoverage({ list, from: src.from, to: src.to, rows: readJsonl(rp, { strict: false }).rows, canaryIds: plantedFor(plan, src.slot) });
            sourceInfo.set(src.slot, { cov });
            for (const [p, r] of cov.real) if (r.obj.verdict === 'wrong') superseded.push({ p, id: r.obj.id, slot: src.slot });
          }
          continue;
        }
        if (!fs.existsSync(rp)) {
          problems.push(`${lab}: result file is missing (${rp})${src.parent ? `; it supplies positions ${src.from}-${src.to}` : ''}`);
          continue;
        }
        const { rows, errors } = readJsonl(rp, { strict: false });
        for (const e of errors) problems.push(`${lab}: ${e}`);
        const log = loadRenderLog(renderLogPath(rd, src.slot));
        if (log.missing) problems.push(`${lab}: render log is missing (render-${src.slot}.jsonl); nothing it judged was rendered`);
        for (const e of log.errors) problems.push(`${lab}: render log ${e}`);
        for (const lp of log.lines.keys()) renderedPaths.add(lp);
        const cov = slotCoverage({ list, from: src.from, to: src.to, rows, canaryIds: plantedFor(plan, src.slot) });
        sourceInfo.set(src.slot, { cov });
        const missing = cov.missing.filter((p) => sup.has(p) && !inDrop(src.slot, p));
        if (missing.length) {
          problems.push(`${lab}: positions not covered: ${fmtPositions(missing)} (ids ${missing.map((p) => list[p - 1]).join(', ')})`);
        }
        for (const d of cov.duplicates) if (sup.has(d.pos)) problems.push(`${lab}: position ${d.pos} (${d.id}) is covered ${d.lines.length} times (lines ${d.lines.join(', ')})`);
        for (const r of cov.outside) {
          const range = src.parent ? `its rerun range (positions ${src.from}-${src.to})` : `chunk ${g.chunk} (positions ${c.from}-${c.to})`;
          problems.push(`${lab}: line ${r.lineNo} has id ${JSON.stringify(r.obj.id)}, which is not in ${range} and not a canary planted for this slot`);
        }
        if (cov.outOfOrder) warnings.push(`${lab}: lines are not in list order`);
        for (const [p, r] of cov.real) {
          if (!sup.has(p)) {
            // Superseded by a later rerun; a wrong here is compared with the line that replaces it.
            if (r.obj.verdict === 'wrong') superseded.push({ p, id: r.obj.id, slot: src.slot });
            continue;
          }
          const o = r.obj;
          const where = `${lab}: ${o.id} (line ${r.lineNo})`;
          if (o.verdict !== 'ok' && o.verdict !== 'wrong') problems.push(`${where}: verdict must be "ok" or "wrong" (got ${JSON.stringify(o.verdict)})`);
          if (o.cites !== undefined && !Array.isArray(o.cites)) problems.push(`${where}: "cites" must be an array`);
          if (!log.items.has(o.id)) problems.push(`${where}: judged but never rendered by this reader`);
          for (const ci of Array.isArray(o.cites) ? o.cites : []) {
            if (!citeInLog(log, ci)) problems.push(`${where}: cites ${ci}, which is not in its render log`);
          }
          // A wrong refuted by the item's own text (its figures disagree with each other) has no evidence
          // line to name: its note starts "self-contradiction:" and quotes the clash instead.
          if (o.verdict === 'wrong' && !/^\s*self-contradiction:/i.test(String(o.note ?? ''))) {
            // The paths this reader rendered are looked for in the note, so a path may hold any character
            // (a space, brackets, a non-ASCII letter), which the reference pattern alone would cut short.
            const refs = noteRefs(o.note);
            if (!refs.some((ref) => refInLog(log, ref)) && !noteNamesLoggedLine(log, o.note)) {
              if (!refs.length) problems.push(`${where}: wrong, but its note names no file:line`);
              else problems.push(`${where}: wrong, but none of the file:line refs in its note (${refs.map((x) => x.raw).join(', ')}) is in its render log`);
            }
          }
          real.set(p, { obj: o, lineNo: r.lineNo, src: src.slot, log });
        }
      }
      // A wrong the replaced lines marked that the replacing rerun does not mark leaves the union:
      // say so, so the writer confirms it or drops it.
      for (const x of superseded) {
        const now = real.get(x.p);
        if (now && now.obj.verdict === 'wrong') continue;
        const by = owner.get(x.p);
        warnings.push(
          `${x.id} (position ${x.p}): ${x.slot === slot ? slot : `${x.slot} (rerun of ${slot})`} marked it wrong, but rerun ${by}, which replaces those lines, ` +
            `${now ? `marks it ${now.obj.verdict}` : 'has no line for it (dropped)'}; it leaves the union, so confirm it or drop it`,
        );
      }
      readers.set(slot, { slot, chunk: g.chunk, real, owner, sources });
    }
  }

  // Repeats: the same id confirmed again for an overlapping class goes to the owner.
  const curRC = new Map();
  for (const rinfo of readers.values()) {
    for (const r of rinfo.real.values()) {
      if (r.obj.verdict !== 'wrong') continue;
      const cls = Array.isArray(r.obj.class) ? r.obj.class : r.obj.class ? [r.obj.class] : [];
      if (!curRC.has(r.obj.id)) curRC.set(r.obj.id, new Set());
      for (const c of cls) curRC.get(r.obj.id).add(String(c));
    }
  }
  const infos = [];
  const repeats = []; // repeats kept wrong with a repeatReason: {id, repeatReason, of}
  problems.push(...repeatProblems(S, unit, parseRound(R), wrongs, curRC, cfg, infos, repeats, warnings));
  const output = infos.map((x) => `INFO: ${x}`).join('\n');

  // The fix checker's results (usually written after record first runs; none is normal).
  const fixChecker = fixCheckerSummary(rd, problems, warnings);

  // Ruled oks: an ok whose note starts "ruled: <ruling id>" (the wording a ruling approved, where the
  // evidence differs). Listed from every line the merged view uses, then from the fix checker's
  // result files (slot = the file's name, such as fixcheck-1-p1). Each one is a warning, not a
  // PROBLEM, unless its id is pending as ruled-wording or confirmed.json "ruledKept" lists it with the
  // same ruling (the owner kept the ruling after an "amend <ruling>?" question).
  const ruledOks = [];
  // With "rulingIdPattern" set, the ruling is that pattern's match at the start of what follows
  // "ruled:" (when the match ends the word), so an id holding "(", ")", "," or ";" is taken whole.
  let rulingAtStart = null;
  if (typeof cfg.rulingIdPattern === 'string' && cfg.rulingIdPattern.trim()) {
    try {
      rulingAtStart = new RegExp(`^(?:${cfg.rulingIdPattern})`);
    } catch {
      // a pattern that does not compile is reported where rulings are checked
    }
  }
  const ruledOk = (o, slot) => {
    if (!o || o.verdict !== 'ok') return;
    const text = String(o.note ?? '');
    const lead = /^\s*ruled:\s*/i.exec(text);
    if (!lead) return;
    const rest = text.slice(lead[0].length);
    let ruling = null;
    const mp = rulingAtStart ? rulingAtStart.exec(rest) : null;
    if (mp && mp[0] && !/^[\p{L}\p{N}_-]/u.test(rest.slice(mp[0].length))) ruling = mp[0];
    if (ruling === null) {
      const mr = /^[^\s,;()]+/.exec(rest);
      if (!mr) return;
      ruling = mr[0].replace(/[.,;:)]+$/, '');
    }
    ruledOks.push({ id: o.id, slot, ruling, refs: noteRefs(o.note).map((x) => x.raw) });
  };
  for (const rinfo of readers.values()) {
    for (const [, r] of [...rinfo.real].sort((a, b) => a[0] - b[0])) ruledOk(r.obj, r.src);
  }
  for (const f of fs.readdirSync(rd).filter((x) => /^fixcheck-\d+-[A-Za-z0-9._-]+\.jsonl$/.test(x) && !/-input\.jsonl$/.test(x)).sort()) {
    for (const { obj } of readJsonl(path.join(rd, f), { strict: false }).rows) ruledOk(obj, f.replace(/\.jsonl$/, ''));
  }
  // "ruledKept": each entry must name a ruled ok of this round with that ruling, and an id that is
  // neither confirmed, pending, a defect, withdrawn nor outside the bar.
  problems.push(...ruledKeptShape);
  const kept = new Set();
  for (const k of ruledKept) {
    const mine = ruledOks.filter((x) => x.id === k.id);
    if (!mine.length) problems.push(`confirmed.json: "ruledKept" lists ${k.id}, which is not a ruled ok of this round (an ok whose note starts "ruled: <ruling id>")`);
    else if (!mine.some((x) => x.ruling === k.ruling)) {
      problems.push(`confirmed.json: "ruledKept" lists ${k.id} with ruling ${k.ruling}, but its ruled ok names ${[...new Set(mine.map((x) => x.ruling))].join(', ')}`);
    }
    for (const [has, what] of [[wrongs, 'confirmed wrong'], [pending, 'pending'], [defects, 'a defect'], [withdrawn, 'withdrawn'], [outsideBar, 'outside the bar']]) {
      if (has.has(k.id)) problems.push(`confirmed.json: ${k.id} is both in "ruledKept" and ${what}`);
    }
    kept.add(`${k.id}\u0000${k.ruling}`);
  }

  // Every reader wrong left unconfirmed needs a "rejected" entry: no silent dismissals.
  const markedBy = new Map();
  for (const rinfo of readers.values()) {
    for (const r of rinfo.real.values()) {
      if (r.obj.verdict !== 'wrong' || canaryMap.has(r.obj.id)) continue;
      if (!markedBy.has(r.obj.id)) markedBy.set(r.obj.id, new Set());
      markedBy.get(r.obj.id).add(r.src);
    }
  }
  for (const [id, by] of markedBy) {
    if (wrongs.has(id) || pending.has(id) || defects.has(id) || withdrawn.has(id) || outsideBar.has(id) || rejected.has(id)) continue;
    problems.push(`confirmed.json: ${id} was marked wrong by ${[...by].sort().join(', ')} but is not confirmed, pending, a defect, withdrawn or outside the bar, and has no "rejected" entry (its reason and the file:line that answers the refuter)`);
  }
  for (const id of rejected.keys()) {
    if (!markedBy.has(id) && byId.has(id)) warnings.push(`confirmed.json: ${id} is rejected, but no reader marked it wrong`);
  }
  // A dismissal needs the same grounding as a confirmation: a file:line (a path with a folder or a file
  // extension, or one a reader of this round rendered), or "history:" followed by what it names.
  for (const [id, note] of rejected) {
    const txt = typeof note === 'string' ? note.trim() : '';
    if (/^history:\s*\S/i.test(txt) || fileRefs(txt, renderedPaths).length) continue;
    const loose = noteRefs(txt).map((x) => x.raw);
    problems.push(
      `confirmed.json: rejected ${id} has no file:line that answers the refuter (or a note starting "history:" that names the earlier reasoned ok)` +
        (loose.length ? `; ${loose.join(', ')} is not one: a file:line has a path with a folder or a file extension, or one a reader rendered` : ''),
    );
  }

  // Templated ok notes: one reader writing the same note (file:line refs and numbers aside) on 5 or more
  // items. A note copied from item to item is a default, not a reading of each item; the writer gives
  // those ranges a supplementary read (references/briefs.md, "Verifying the readers' work").
  const TEMPLATE_MIN = 5;
  const bySlot = new Map();
  for (const rinfo of readers.values()) {
    for (const r of rinfo.real.values()) {
      if (r.obj.verdict !== 'ok' || canaryMap.has(r.obj.id)) continue;
      const raw = String(r.obj.note ?? '').trim();
      const key = raw.replace(/([\w.\/\\@+-]+):(\d+)(?:-(\d+))?/g, '<ref>').replace(/\d+/g, '#').replace(/\s+/g, ' ').toLowerCase();
      if (!bySlot.has(r.src)) bySlot.set(r.src, new Map());
      const g = bySlot.get(r.src);
      if (!g.has(key)) g.set(key, { sample: raw, ids: [] });
      g.get(key).ids.push(r.obj.id);
    }
  }
  for (const [slot, g] of [...bySlot].sort((x, y) => x[0].localeCompare(y[0]))) {
    for (const { sample, ids } of g.values()) {
      if (ids.length >= TEMPLATE_MIN) {
        warnings.push(
          sample
            ? `${slot}: ${ids.length} ok notes share one text ("${sample.slice(0, 60)}"): ${ids.join(', ')}; a template is not a reading of each item, so give that reader's whole range a supplementary read`
            : `${slot}: ${ids.length} ok notes are blank: ${ids.join(', ')}; a blank note is not a reading of each item, so give that reader's whole range a supplementary read`,
        );
      }
    }
  }

  if (problems.length) return { output, problems, warnings };

  // ---- measure ----
  const measure = { unit, round: Number(String(R).replace(/^r/, '')), snapshotSha256: sha, caveat: ESTIMATE_CAVEAT, chunks: {}, total: {}, canaries: {} };
  const tot = { items: 0, confirmed: 0, foundByAll: 0, foundByNone: 0, foundByNoneBy: {}, foundByOneReader: 0, falseAlarms: {}, foundBy: {}, foundByAlone: {}, pendingMarkedWrong: {}, outsideBar: {}, outsideBarItems: 0, outsideBarIds: [] };
  const totEst = { N: 0, foundByReaders: 0, remaining: 0, chunksEstimated: [], chunksNotEstimated: [] };
  const foundByOf = new Map();
  measure.reruns = [];
  for (const [name, c] of Object.entries(chunks)) {
    const slots = groupOf.get(name) || []; // none: a chunk a final-check round did not queue
    const ids = list.slice(c.from - 1, c.to);
    const marked = new Map(slots.map((s) => [s, new Set([...readers.get(s).real.values()].filter((r) => r.obj.verdict === 'wrong').map((r) => r.obj.id))]));
    const conf = ids.filter((id) => wrongs.has(id));
    const union = ids.filter((id) => slots.some((s) => marked.get(s).has(id)));
    const m = {
      readers: slots, items: ids.length, union, unionSize: union.length, confirmed: conf.length, defects: ids.filter((id) => defects.has(id)).length,
      foundByAll: 0, foundBy: {}, foundByAlone: {}, foundByOneReader: 0, foundByNone: 0, foundByNoneIds: [], foundByNoneBy: {}, foundByAudit: 0, foundByAuditIds: [],
      falseAlarms: {}, falseAlarmIds: {}, pendingMarkedWrong: {}, defectMarkedWrong: {}, withdrawnByRuling: {},
      withdrawn: ids.filter((id) => withdrawn.has(id)).length,
      outsideBar: {}, outsideBarIds: ids.filter((id) => outsideBar.has(id)),
    };
    m.outsideBarItems = m.outsideBarIds.length;
    for (const s of slots) {
      m.foundBy[s] = conf.filter((id) => marked.get(s).has(id)).length;
      m.foundByAlone[s] = 0;
      // Pending ids, defects, wrongs withdrawn by a ruling and wrongs outside the bar are neither
      // confirmed wrongs nor false alarms.
      const fa = [...marked.get(s)].filter((id) => !wrongs.has(id) && !pending.has(id) && !defects.has(id) && !withdrawn.has(id) && !outsideBar.has(id));
      m.falseAlarms[s] = fa.length;
      m.falseAlarmIds[s] = fa;
      m.pendingMarkedWrong[s] = [...marked.get(s)].filter((id) => pending.has(id)).length;
      m.defectMarkedWrong[s] = [...marked.get(s)].filter((id) => defects.has(id)).length;
      m.withdrawnByRuling[s] = [...marked.get(s)].filter((id) => withdrawn.has(id)).length;
      m.outsideBar[s] = [...marked.get(s)].filter((id) => outsideBar.has(id)).length;
    }
    for (const id of ids) {
      if (withdrawn.has(id) && !union.includes(id)) warnings.push(`confirmed.json: ${id} is withdrawn by ruling ${withdrawn.get(id)}, but no reader marked it wrong`);
      if (outsideBar.has(id) && !union.includes(id)) warnings.push(`confirmed.json: ${id} is listed outside the bar, but no reader marked it wrong`);
    }
    for (const id of conf) {
      const finders = slots.filter((s) => marked.get(s).has(id));
      foundByOf.set(id, finders);
      if (slots.length && finders.length === slots.length) m.foundByAll++;
      if (finders.length === 1) {
        m.foundByAlone[finders[0]]++;
        m.foundByOneReader++;
      }
      const how = wrongs.get(id).foundBy;
      if (finders.length === 0) {
        m.foundByNone++;
        m.foundByNoneIds.push(id);
        if (how) m.foundByNoneBy[how] = (m.foundByNoneBy[how] || 0) + 1;
        if (how === 'audit') {
          m.foundByAudit++;
          m.foundByAuditIds.push(id);
        }
        if (!how) warnings.push(`confirmed.json: ${id} was found by no reader; say how ("foundBy": ${FOUND_BY.map((x) => `"${x}"`).join(', ')})`);
      } else if (how) {
        // Counts follow the reader files: a reader did mark it, so it is not counted as found by none.
        warnings.push(`confirmed.json: ${id} has foundBy "${how}", but ${finders.join(', ')} marked it wrong; counted as found by ${finders.length === 1 ? 'that reader' : 'those readers'}`);
      }
    }
    if (slots.length >= 2) {
      const [a, b] = slots;
      const both = conf.filter((id) => marked.get(a).has(id) && marked.get(b).has(id)).length;
      const est = estimateRemaining(m.foundBy[a], m.foundBy[b], both);
      const rng = estimateRange(m.foundBy[a], m.foundBy[b], both);
      m.estimate = { pair: [a, b], n1: m.foundBy[a], n2: m.foundBy[b], m: both, ...est, range: [rng.remainingLow, rng.remainingHigh], lowConfidence: rng.lowConfidence, ...(rng.why ? { why: rng.why } : {}), caveat: ESTIMATE_CAVEAT };
      totEst.rangeLow = (totEst.rangeLow || 0) + rng.remainingLow;
      totEst.rangeHigh = (totEst.rangeHigh || 0) + rng.remainingHigh;
      if (rng.lowConfidence) totEst.lowConfidenceChunks = [...(totEst.lowConfidenceChunks || []), name];
      if (slots.length > 2) m.estimate.note = `uses the first two readers listed (${a}, ${b})`;
      totEst.N += est.N;
      totEst.foundByReaders += est.foundByReaders;
      totEst.remaining += est.remaining;
      totEst.chunksEstimated.push(name);
    } else {
      m.estimate = { pair: null, reason: 'needs two readers per chunk', caveat: ESTIMATE_CAVEAT };
      totEst.chunksNotEstimated.push(name);
    }
    // A chunk with a range the owner dropped (and no rerun supplied since) was not read at full depth.
    m.droppedRanges = [];
    m.reruns = [];
    for (const s of slots) {
      const rinfo = readers.get(s);
      for (const src of rinfo.sources) {
        const d = dropped.get(src.slot);
        if (d) {
          let excused = 0;
          for (let p = d.from; p <= d.to; p++) if (rinfo.owner.get(p) === src.slot && !rinfo.real.has(p)) excused++;
          if (excused) m.droppedRanges.push({ slot: src.slot, ...d, ...(src.parent ? { rerunOf: src.parent } : {}) });
        }
        if (src.parent) {
          const note = { slot: src.slot, parent: src.parent, chunk: name, from: src.from, to: src.to, state: src.state, positionsTaken: src.positions };
          m.reruns.push(note);
          measure.reruns.push(note);
        }
      }
    }
    m.notRead = notRead.includes(name);
    m.fullDepth = m.droppedRanges.length === 0 && !m.notRead;
    if (!m.fullDepth && m.estimate.pair) m.estimate.partial = 'a reader\'s range was dropped by the owner';
    measure.chunks[name] = m;
    tot.items += m.items;
    tot.confirmed += m.confirmed;
    tot.defects = (tot.defects || 0) + m.defects;
    tot.foundByAll += m.foundByAll;
    tot.foundByNone += m.foundByNone;
    for (const [k, v] of Object.entries(m.foundByNoneBy)) tot.foundByNoneBy[k] = (tot.foundByNoneBy[k] || 0) + v;
    tot.foundByAudit = (tot.foundByAudit || 0) + m.foundByAudit;
    tot.foundByOneReader += m.foundByOneReader;
    tot.withdrawn = (tot.withdrawn || 0) + m.withdrawn;
    tot.outsideBarItems += m.outsideBarItems;
    tot.outsideBarIds.push(...m.outsideBarIds);
    for (const s of slots) {
      tot.withdrawnByRuling = tot.withdrawnByRuling || {};
      tot.withdrawnByRuling[s] = m.withdrawnByRuling[s];
      tot.outsideBar[s] = m.outsideBar[s];
      tot.foundBy[s] = m.foundBy[s];
      tot.foundByAlone[s] = m.foundByAlone[s];
      tot.falseAlarms[s] = m.falseAlarms[s];
      tot.pendingMarkedWrong[s] = m.pendingMarkedWrong[s];
      tot.defectMarkedWrong = tot.defectMarkedWrong || {};
      tot.defectMarkedWrong[s] = m.defectMarkedWrong[s];
    }
  }
  totEst.N = round2(totEst.N);
  totEst.remaining = round2(totEst.remaining);
  {
    const { rangeLow = 0, rangeHigh = 0, lowConfidenceChunks = [], ...rest } = totEst;
    totEst.range = [round2(rangeLow), round2(rangeHigh)];
    // With no chunk estimated (one reader per chunk, or none) the 0 is no estimate: say so.
    totEst.estimated = totEst.chunksEstimated.length > 0;
    totEst.lowConfidence = lowConfidenceChunks.length > 0 || !totEst.estimated;
    totEst.lowConfidenceChunks = lowConfidenceChunks;
    if (!totEst.estimated) totEst.reason = 'needs two readers per chunk';
    delete totEst.rangeLow;
    delete totEst.rangeHigh;
    void rest;
  }
  measure.total = { ...tot, estimate: { ...totEst, caveat: ESTIMATE_CAVEAT } };
  const notFull = Object.entries(measure.chunks).filter(([, m]) => !m.fullDepth).map(([k]) => k);
  measure.fullDepth = notFull.length === 0;
  measure.total.fullDepth = measure.fullDepth;
  measure.total.chunksNotFullDepth = notFull;
  measure.finalCheck = finalCheck;
  measure.chunksNotRead = notRead;
  measure.fixChecker = fixChecker;
  measure.repeats = repeats;

  // Ruled oks (gathered above, before the PROBLEM gate): a warning for each one neither pending as
  // ruled-wording nor listed in "ruledKept" with its ruling.
  measure.ruledOks = ruledOks;
  for (const x of measure.ruledOks) {
    if (pending.has(x.id) && pendingReasons.get(x.id) === 'ruled-wording') continue;
    if (kept.has(`${x.id}\u0000${x.ruling}`)) continue;
    warnings.push(
      `ruled ok: ${x.id} (${x.slot}, ruling ${x.ruling}${x.refs.length ? `, ${x.refs.join(', ')}` : ', no file:line'}) is not in "pending" with pendingReason "ruled-wording" ` +
        'or in "ruledKept"; check the approved wording at the evidence (the owner may have kept the ruling: then list it in "ruledKept")',
    );
  }

  // Canaries: scored per slot (a rerun slot's own plan included), never part of coverage, the report
  // or the estimate.
  for (const [slot, entries] of Object.entries(plan)) {
    const info = sourceInfo.get(slot);
    if (!info) continue;
    const lines = new Map();
    for (const r of info.cov.canaryRows) if (!lines.has(r.obj.id)) lines.set(r.obj.id, r.obj);
    const sc = { planted: entries.length, plantedWrong: 0, plantedOk: 0, caught: 0, missed: 0, falseAlarms: 0, okCorrect: 0, notJudged: 0, detail: [] };
    for (const e of entries) {
      const can = canaryMap.get(e.canaryId);
      const line = lines.get(e.canaryId);
      const kind = can.kind === 'wrong' ? 'wrong' : 'ok';
      if (kind === 'wrong') sc.plantedWrong++;
      else sc.plantedOk++;
      let outcome;
      if (!line) outcome = 'not-judged';
      else if (kind === 'wrong') outcome = line.verdict === 'wrong' ? 'caught' : 'missed';
      else outcome = line.verdict === 'wrong' ? 'false-alarm' : 'ok-correct';
      if (outcome === 'not-judged') sc.notJudged++;
      if (outcome === 'caught') sc.caught++;
      if (outcome === 'missed') sc.missed++;
      if (outcome === 'false-alarm') sc.falseAlarms++;
      if (outcome === 'ok-correct') sc.okCorrect++;
      sc.detail.push({ canaryId: e.canaryId, atPosition: e.atPosition, kind, verdict: line ? line.verdict : null, outcome });
      const what = `${slot}: the planted ${kind} ${e.canaryId} (before position ${e.atPosition})`;
      if (outcome === 'missed') warnings.push(`canary missed: ${what} was marked ok; that reader's range gets a supplementary read`);
      if (outcome === 'false-alarm') warnings.push(`canary false alarm: ${what} was marked wrong`);
      if (outcome === 'not-judged') warnings.push(`canary not judged: ${what} has no line in the reader's file`);
    }
    measure.canaries[slot] = sc;
  }
  const canarySlots = Object.entries(measure.canaries);
  const canaryText = canarySlots.length
    ? `; canaries: ${canarySlots.map(([slot, c]) => `${slot} caught ${c.caught} of ${c.plantedWrong}${c.plantedOk ? `, ${c.falseAlarms} false alarm(s) on ${c.plantedOk} ok` : ''}${c.notJudged ? `, ${c.notJudged} not judged` : ''}`).join('; ')}`
    : '';

  // ---- report ----
  const items = [];
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  const pendingBy = Object.fromEntries(PENDING_REASONS.map((k) => [k, 0]));
  for (const [name, c] of Object.entries(chunks)) {
    const slots = groupOf.get(name) || [];
    for (let p = c.from; p <= c.to; p++) {
      const id = list[p - 1];
      const perReader = {};
      const citesRead = new Map();
      const citesReadBy = {};
      let readBy = 0;
      for (const s of slots) {
        const rinfo = readers.get(s);
        const hit = rinfo.real.get(p);
        if (!hit) {
          // Only a position in an owner-dropped range can be missing here (coverage checked the rest).
          const src = rinfo.owner.get(p);
          perReader[s] = { verdict: null, dropped: true, ruling: dropped.get(src)?.ruling ?? null, ...(src !== s ? { rerun: src } : {}) };
          citesReadBy[s] = [];
          continue;
        }
        readBy++;
        const row = hit.obj;
        perReader[s] = { verdict: row.verdict, class: row.class ?? [], note: row.note ?? '', ...(hit.src !== s ? { rerun: hit.src } : {}) };
        // cites_read: only what the render log of the file that supplied this line shows.
        const mine = new Map();
        if (hit.log.byItem.has(id)) mergeLineMaps(mine, hit.log.byItem.get(id));
        for (const ci of Array.isArray(row.cites) ? row.cites : []) mergeLineMaps(mine, citeLinesRead(hit.log, ci));
        citesReadBy[s] = compressLines(mine);
        mergeLineMaps(citesRead, mine);
      }
      let verdict = 'ok';
      let note;
      const readerNotes = slots.map((s) => `${s}: ${perReader[s].dropped ? `(dropped by decision ${perReader[s].ruling})` : perReader[s].note}`).join(' | ');
      const entryExtra = {};
      if (pending.has(id)) {
        verdict = 'pending-owner';
        const why = pendingReasons.get(id);
        pendingBy[why]++;
        entryExtra.pendingReason = why;
        note = `pending owner question (${why}). ${readerNotes}`;
      } else if (defects.has(id)) {
        verdict = 'defect';
        note = `defect, for the owner (S/defects.md); the item is not edited. ${readerNotes}`;
      } else if (wrongs.has(id)) {
        verdict = 'wrong';
        note = wrongs.get(id).note;
      } else if (withdrawn.has(id) && readBy) {
        // A reader wrong a ruling given mid-round overturned: ok, and not a false alarm.
        entryExtra.withdrawnByRuling = withdrawn.get(id);
        note = `withdrawn by ruling ${withdrawn.get(id)}. ${readerNotes}`;
      } else if (outsideBar.has(id) && readBy) {
        // A reader wrong outside a frozen bar: listed for the owner, neither ok nor wrong for this
        // pass's count. An item no reader read stays unread (which blocks a zero).
        verdict = 'outside-bar';
        note = `outside the bar (listed for the owner, not counted): ${outsideBar.get(id)} | ${readerNotes}`;
      } else if (!readBy) {
        // No reader read it (every reader's range here was dropped by the owner): never "ok".
        verdict = 'unread';
        note = slots.length ? `not read: ${readerNotes}` : 'not read (final check)';
      } else if (rejected.has(id)) {
        entryExtra.rejected = rejected.get(id);
        note = `rejected: ${rejected.get(id)} | ${readerNotes}`;
      } else {
        note = readerNotes;
      }
      counts[verdict]++;
      const entry = { id, chunk: name, position: p, verdict, ...entryExtra, note, cites_read: compressLines(citesRead), cites_read_by: citesReadBy, readers: perReader };
      if (verdict === 'wrong') {
        entry.foundBy = foundByOf.get(id) || [];
        if (wrongs.get(id).foundBy) entry.foundByWriter = wrongs.get(id).foundBy;
        const cls = classesOf(wrongs.get(id));
        if (cls.length) entry.class = cls;
        const rpt = repeats.find((x) => x.id === id);
        if (rpt) {
          entry.repeatReason = rpt.repeatReason;
          entry.repeatOf = rpt.of;
        }
      }
      items.push(entry);
    }
  }
  // A round counts as a zero only at full depth, with no confirmed wrong and nothing unread. Pending
  // items the evidence refutes (boundary-silent, ruled-wording) always block; the owner's close rulings
  // decide the rest: rule-meaning items block when ownerQuestionsBlock (default true), defects when
  // defectsBlock (default false). Fix-checker finds do not enter here.
  const rules = closeRules(cfg);
  measure.total.unread = counts.unread;
  measure.total.pending = counts['pending-owner'];
  measure.total.pendingByReason = pendingBy;
  measure.closeRules = rules;
  const blockers = [];
  // r0 (one window, verdicts that never count) or any list shorter than the unit is not a full pass.
  const partialList = parseRound(R) === 0 || list.length < snap.length;
  measure.fullPass = !partialList;
  if (partialList) blockers.push(`r0 / partial list: not a full pass (${list.length} of ${snap.length} items listed)`);
  if (!measure.fullDepth) blockers.push('not full depth');
  if (notRead.length) blockers.push(`final check: chunk(s) ${notRead.join(', ')} not read`);
  if (counts.wrong) blockers.push(`${counts.wrong} wrong`);
  if (counts.unread) blockers.push(`${counts.unread} unread`);
  for (const k of ALWAYS_BLOCKING_PENDING) {
    if (pendingBy[k]) blockers.push(`${pendingBy[k]} pending-owner (${k}: the evidence refutes it, so it always blocks)`);
  }
  if (rules.ownerQuestionsBlock && pendingBy['rule-meaning']) blockers.push(`${pendingBy['rule-meaning']} pending-owner (rule-meaning; ownerQuestionsBlock)`);
  if (rules.defectsBlock && counts.defect) blockers.push(`${counts.defect} defect (defectsBlock)`);
  measure.countsAsZero = blockers.length === 0;
  measure.zeroBlockers = blockers;
  measure.total.countsAsZero = measure.countsAsZero;
  const report = { unit, round: measure.round, snapshotSha256: sha, generated: new Date().toISOString(), fullDepth: measure.fullDepth, countsAsZero: measure.countsAsZero, counts, items };
  writeJson(path.join(rd, 'report.json'), report);
  writeJson(path.join(rd, 'measure.json'), measure);
  const est = measure.total.estimate;
  const droppedOnly = notFull.filter((k) => !notRead.includes(k));
  if (droppedOnly.length) warnings.push(`not full depth: chunk(s) ${droppedOnly.join(', ')} have ranges dropped by the owner; this round cannot count as a zero`);
  if (notRead.length) warnings.push(`final check: chunk(s) ${notRead.join(', ')} had no readers; their items are reported not read, and this round cannot count as a zero`);
  const fc = fixChecker.length
    ? `; fix checker ${fixChecker.map((x) => `#${x.iteration}: ${x.itemsChecked} checked, ${x.wrongs} wrong`).join(', ')}`
    : '';
  const rr = measure.reruns.length ? `; ${measure.reruns.length} rerun(s) merged (${measure.reruns.map((x) => `${x.slot} for ${x.parent} ${x.from}-${x.to}`).join(', ')})` : '';
  // Wrongs outside a frozen bar are not counted, but the writer lists them for the owner.
  const rptText = repeats.length ? ` (${repeats.length} repeat(s): ${repeats.map((x) => `${x.id} ${x.repeatReason}, of ${x.of.join(', ')}`).join('; ')})` : '';
  const ob = outsideBar.size ? `; outside the bar, list for the owner (not counted): ${[...outsideBar.keys()].join(', ')}` : '';
  return {
    output,
    problems: [],
    warnings,
    summary:
      `record ${unit} r${measure.round}: ${items.length} items (ok ${counts.ok}, wrong ${counts.wrong}, pending-owner ${counts['pending-owner']}, defect ${counts.defect}, unread ${counts.unread}, outside-bar ${counts['outside-bar']}); ` +
      `full depth ${measure.fullDepth ? 'yes' : 'NO'}, counts as zero ${measure.countsAsZero ? 'yes' : `no (${blockers.join(', ')})`}; ` +
      `${readers.size} reader files covered${rr}; confirmed ${tot.confirmed}${rptText}, found by one reader ${tot.foundByOneReader}, by none ${tot.foundByNone}, rejected ${rejected.size}${fc}${ob}${canaryText}; ` +
      (est.estimated
        ? `estimated remaining ${est.remaining} (range ${est.range[0]}-${est.range[1]}${est.lowConfidenceChunks.length ? `, low confidence in ${est.lowConfidenceChunks.join(', ')}` : ''}${est.chunksNotEstimated.length ? `, chunk(s) ${est.chunksNotEstimated.join(', ')} not estimated` : ''}; ${ESTIMATE_CAVEAT})`
        : `remaining wrongs not estimated (${est.reason})`) +
      ' -> report.json, measure.json',
  };
}
