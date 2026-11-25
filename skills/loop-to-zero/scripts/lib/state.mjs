// Reading the state folder S/: config, items, round folders, canaries.
import fs from 'node:fs';
import path from 'node:path';
import { fail, readJson, readJsonl, sha256File, sha256FileLf, validName, parseRound, readText } from './util.mjs';
import { evidenceSources } from './sources.mjs';

// Unit statuses. Every status starting with "closed" is treated as closed; "open" and "final-check"
// (and a unit with no status) as open. loadConfig refuses a status that is not in this list.
export const UNIT_STATUSES = [
  'open', 'final-check',
  'closed', 'closed-leads-pending', 'closed-owner-questions-open', 'closed-known-wrongs', 'closed-by-stopping-rule',
];

// Every config.json key the tools read (top level, then unit and evidence-source fields).
// test/run.mjs checks this list against the code in both directions. loadConfig refuses a key that
// is in none of the three lists, so a misspelled key cannot be silently ignored.
export const CONFIG_KEYS = [
  'evidence', 'windowSize', 'itemFields', 'units', 'universalWords', 'itemsRoot',
  'maskSecrets', 'maskKeys', 'maskAllow', 'maskExclude', 'boundaryPaths',
  'ownerQuestionsBlock', 'defectsBlock', 'decisionLog', 'rulingIdPattern', 'requireRulingEntries', 'historyFolders',
];
export const UNIT_CONFIG_KEYS = ['status', 'itemFiles'];
export const SOURCE_CONFIG_KEYS = ['type', 'repo', 'pin', 'root', 'prefix', 'sha256'];

export const DEFAULT_UNIVERSAL_WORDS = [
  'only', 'every', 'each', 'all', 'always',
  'never', 'no', 'none', 'nothing', 'nobody',
  'sole', 'exclusively', 'any',
  'no caller', 'nothing reads', 'exists only', 'appears only',
];

export function loadConfig(S) {
  if (!S) fail('state folder <S> is required');
  if (!fs.existsSync(S) || !fs.statSync(S).isDirectory()) fail(`state folder not found: ${S}`);
  const cfg = readJson(path.join(S, 'config.json'), 'S/config.json');
  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!isObject(cfg)) fail('config.json must be a JSON object ({"evidence": {...}, "units": {...}, ...})');
  const knownKeys = (obj, keys, where) => {
    for (const k of Object.keys(obj)) if (!keys.includes(k)) fail(`${where}unknown key ${JSON.stringify(k)}. The keys are: ${keys.join(', ')}`);
  };
  knownKeys(cfg, CONFIG_KEYS, 'config.json: ');
  evidenceSources(cfg); // validates one source or a list of prefixed sources
  if (Array.isArray(cfg.evidence)) cfg.evidence.forEach((s, i) => knownKeys(s, SOURCE_CONFIG_KEYS, `config.json: evidence[${i}]: `));
  else knownKeys(cfg.evidence, SOURCE_CONFIG_KEYS, 'config.json: evidence: ');
  cfg.windowSize = cfg.windowSize ?? 16;
  if (!Number.isInteger(cfg.windowSize) || cfg.windowSize < 1) fail('config.json: windowSize must be a positive integer');
  cfg.itemFields = cfg.itemFields ?? ['title', 'plan', 'reason'];
  if (!Array.isArray(cfg.itemFields) || !cfg.itemFields.length) fail('config.json: itemFields must be a non-empty array');
  if (cfg.units !== undefined && !isObject(cfg.units)) fail('config.json: "units" must be an object, {"<unit>": {"status", "itemFiles"}}');
  cfg.units = cfg.units ?? {};
  for (const [name, u] of Object.entries(cfg.units)) {
    if (!isObject(u)) fail(`config.json: unit ${name} must be an object, {"status", "itemFiles"}`);
    knownKeys(u, UNIT_CONFIG_KEYS, `config.json: unit ${name}: `);
    // A unit with no status counts as open. A status outside the list is refused: a mistyped closed
    // status would otherwise be read as open.
    if (u.status !== undefined && !UNIT_STATUSES.includes(u.status)) {
      fail(`config.json: unit ${name}: "status" must be one of ${UNIT_STATUSES.join(', ')} (got ${JSON.stringify(u.status)})`);
    }
  }
  if (cfg.universalWords !== undefined && !(Array.isArray(cfg.universalWords) && cfg.universalWords.length && cfg.universalWords.every((w) => typeof w === 'string' && w.trim()))) {
    fail('config.json: "universalWords" must be a non-empty array of non-empty strings, such as ["only", "every"] (leave the key out to use the default list)');
  }
  cfg.universalWords = cfg.universalWords ?? DEFAULT_UNIVERSAL_WORDS;
  return cfg;
}

/**
 * Config "historyFolders": other state folders (relative to S/, such as a discovery state folder)
 * whose rounds the repeat check, flips, sweep's known-instance check and replay also read.
 * {folders: [{dir, label}], problems}, in config order; label is "<folder>/" for round names such as
 * "discovery/r3".
 */
export function historyFolders(S, cfg) {
  const problems = [];
  const folders = [];
  const hist = cfg.historyFolders === undefined ? [] : cfg.historyFolders;
  if (!Array.isArray(hist) || hist.some((x) => typeof x !== 'string' || !x.trim())) {
    problems.push('config.json: "historyFolders" must be an array of folder paths (relative to S/)');
    return { folders, problems };
  }
  for (const h of hist) {
    const dir = path.resolve(S, h);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) problems.push(`config.json: history folder ${h} not found (${dir})`);
    else folders.push({ dir, label: `${h.replace(/[\\/]+$/, '')}/` });
  }
  return { folders, problems };
}

export function requireUnit(cfg, unit) {
  validName(unit, 'unit');
  if (!Object.prototype.hasOwnProperty.call(cfg.units, unit)) {
    fail(`unit ${unit} is not in config.json "units" (known: ${Object.keys(cfg.units).join(', ') || 'none'})`);
  }
  return unit;
}

/** Validate a list of item objects; duplicate or missing ids are failures. */
export function checkItems(rows, what) {
  const seen = new Set();
  for (const { lineNo, obj } of rows) {
    if (typeof obj.id !== 'string' || !obj.id) fail(`${what} line ${lineNo}: item has no string "id"`);
    if (seen.has(obj.id)) fail(`${what} line ${lineNo}: duplicate id ${obj.id}`);
    // A string here would be shown as "cites: (none)", with no evidence rendered.
    if (obj.cites !== undefined && !Array.isArray(obj.cites)) fail(`${what} line ${lineNo}: item ${obj.id}: "cites" must be an array (got ${JSON.stringify(obj.cites)})`);
    seen.add(obj.id);
  }
  return rows.map((r) => r.obj);
}

export function loadItems(S) {
  const p = path.join(S, 'items.jsonl');
  return checkItems(readJsonl(p, { what: 'S/items.jsonl' }).rows, 'S/items.jsonl');
}

export function roundDir(S, unit, R) {
  return path.join(S, validName(unit, 'unit'), 'r' + parseRound(R));
}

export function requireRoundDir(S, unit, R) {
  const rd = roundDir(S, unit, R);
  if (!fs.existsSync(rd)) fail(`round folder not found: ${rd} (run snapshot first)`);
  return rd;
}

export function readSnapshotHash(rd) {
  const p = path.join(rd, 'snapshot.sha256');
  if (!fs.existsSync(p)) fail(`snapshot.sha256 is missing in ${rd}`);
  return readText(p).trim().split(/\s+/)[0];
}

/** Fails if snapshot.jsonl no longer matches snapshot.sha256. */
export function verifySnapshot(rd) {
  const snap = path.join(rd, 'snapshot.jsonl');
  if (!fs.existsSync(snap)) fail(`snapshot.jsonl is missing in ${rd}`);
  const want = readSnapshotHash(rd);
  const got = sha256File(snap);
  // A copy that differs only in line endings (a git checkout that turned "\n" into "\r\n") holds the
  // same items: it still matches the hash taken when the snapshot was written.
  if (want !== got && sha256FileLf(snap) === want) return want;
  if (want !== got) fail(`snapshot.jsonl was changed after the snapshot (sha256 ${got} != recorded ${want})`);
  return got;
}

export function loadSnapshot(rd) {
  const p = path.join(rd, 'snapshot.jsonl');
  return checkItems(readJsonl(p, { what: 'snapshot.jsonl' }).rows, 'snapshot.jsonl');
}

export function loadList(rd) {
  const list = readJson(path.join(rd, 'list.json'), 'list.json');
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) fail('list.json must be a JSON array of ids');
  if (new Set(list).size !== list.length) fail('list.json has a duplicate id');
  return list;
}

/** chunks.json: {"c1": {"from":1,"to":64}, ...} with 1-based inclusive positions. */
export function loadChunks(rd, listLen) {
  const chunks = readJson(path.join(rd, 'chunks.json'), 'chunks.json');
  const names = Object.keys(chunks);
  if (!names.length) fail('chunks.json has no chunks');
  const covered = new Array(listLen + 1).fill(0);
  for (const name of names) {
    validName(name, 'chunk name');
    const c = chunks[name];
    if (!c || !Number.isInteger(c.from) || !Number.isInteger(c.to) || c.from < 1 || c.to < c.from || c.to > listLen) {
      fail(`chunks.json: chunk ${name} has a bad range (list has ${listLen} positions)`);
    }
    for (let p = c.from; p <= c.to; p++) covered[p]++;
  }
  for (let p = 1; p <= listLen; p++) {
    if (covered[p] !== 1) fail(`chunks.json: position ${p} is in ${covered[p]} chunks (must be exactly 1)`);
  }
  return chunks;
}

export function loadCanaries(S) {
  const p = path.join(S, 'canaries.jsonl');
  const { rows } = readJsonl(p, { what: 'S/canaries.jsonl', mustExist: false });
  return checkItems(rows, 'S/canaries.jsonl');
}

/** canary-plan.json: {slot: [{canaryId, atPosition}]}. Returns {} when absent. */
export function loadCanaryPlan(rd) {
  const p = path.join(rd, 'canary-plan.json');
  if (!fs.existsSync(p)) return {};
  const plan = readJson(p, 'canary-plan.json');
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) fail('canary-plan.json must be a JSON object ({"<slot>": [{"canaryId", "atPosition"}]})');
  for (const [slot, list] of Object.entries(plan)) {
    if (!Array.isArray(list)) fail(`canary-plan.json: ${slot} must map to an array`);
    for (const e of list) {
      if (!e || typeof e.canaryId !== 'string' || !Number.isInteger(e.atPosition)) {
        fail(`canary-plan.json: ${slot} has an entry without canaryId/atPosition`);
      }
    }
  }
  return plan;
}

/** Ids of the canaries planted for one slot (Set). */
export function plantedFor(plan, slot) {
  return new Set((plan[slot] || []).map((e) => e.canaryId));
}

export function readerResultPath(rd, slot) {
  return path.join(rd, `agent-${validName(slot, 'slot')}.jsonl`);
}

export function renderLogPath(rd, slot) {
  return path.join(rd, `render-${validName(slot, 'slot')}.jsonl`);
}

export function readerResultFiles(rd) {
  if (!fs.existsSync(rd)) return [];
  return fs.readdirSync(rd).filter((f) => /^agent-.+\.jsonl$/.test(f));
}
