#!/usr/bin/env node
// Test runner for the loop-to-zero tool kit: node <skill>/scripts/test/run.mjs
// No frameworks. Each test prints PASS or FAIL; the runner exits non-zero if any fail.
// Every negative test asserts a non-zero exit AND the reason, beside a positive control.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chapman, estimateRemaining, estimateRange, ESTIMATE_CAVEAT } from '../lib/estimate.mjs';
import { parseCite } from '../lib/util.mjs';
import { cutChunks } from '../lib/snapshot.mjs';
import { loadRenderLog, citeInLog } from '../lib/coverage.mjs';
import { isSecretKey, PLAIN_VALUE, hasSettingSegment, maskSecrets } from '../lib/evidence.mjs';
import { CONFIG_KEYS } from '../lib/state.mjs';
import { globIgnores } from '../lib/canary.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, '..');
const LTZ = path.join(SCRIPTS, 'ltz.mjs');
const GUARD = path.join(SCRIPTS, 'hooks', 'guard.mjs');
const TMP_ROOT = path.join(HERE, 'tmp');
const RUN = path.join(TMP_ROOT, `run-${process.pid}-${Date.now()}`);

const BASE_ENV = { ...process.env };
delete BASE_ENV.LTZ_STATE;

// ---------------------------------------------------------------- harness
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
class AssertionError extends Error {}
function ok(c, msg) {
  if (!c) throw new AssertionError(msg);
}
function eq(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  ok(sa === sb, `${msg}: expected ${sb}, got ${sa}`);
}
function ltz(args, opts = {}) {
  const r = spawnSync(process.execPath, [LTZ, ...args], { encoding: 'utf8', env: BASE_ENV, cwd: opts.cwd || RUN, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function passes(r, label = '') {
  ok(r.code === 0, `${label} expected exit 0, got ${r.code}:\n${r.out}`);
  return r;
}
function fails(r, re, label = '') {
  ok(r.code !== 0 && r.code !== null, `${label} expected a non-zero exit, got ${r.code}:\n${r.out}`);
  ok(re.test(r.out), `${label} expected output matching ${re}, got:\n${r.out}`);
  return r;
}
const rj = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
// A confirmed.json written with no "rejected" key gets one for each base-round reader wrong (A02, A03,
// A09) it leaves unaccounted, so tests about other fields need not restate the dismissals. Write
// "rejected" explicitly (even []) to test the rule itself.
const BASE_READER_WRONGS = ['A02', 'A03', 'A09'];
function withRejected(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || 'rejected' in o) return o;
  const ids = (k) => (Array.isArray(o[k]) ? o[k].map((x) => (typeof x === 'string' ? x : x && x.id)) : []);
  const taken = new Set([...Object.keys(o), ...ids('pending'), ...ids('defects'), ...ids('withdrawn'), ...ids('outsideBar'), ...ids('restated')]);
  const rejected = BASE_READER_WRONGS.filter((id) => !taken.has(id)).map((id) => ({ id, note: 'src/auth.js:1 answers the reader; fixture dismissal' }));
  return rejected.length ? { ...o, rejected } : o;
}
const wj = (p, o) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(path.basename(p) === 'confirmed.json' ? withRejected(o) : o, null, 2) + '\n');
};
const rjl = (p) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
const wjl = (p, rows) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
};

// ---------------------------------------------------------------- fixture repo (built once)
const GITCFG = path.join(RUN, 'empty.gitconfig');
const GIT_ENV = {
  ...BASE_ENV,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: GITCFG,
  GIT_AUTHOR_NAME: 'ltz test',
  GIT_AUTHOR_EMAIL: 'ltz@example.invalid',
  GIT_COMMITTER_NAME: 'ltz test',
  GIT_COMMITTER_EMAIL: 'ltz@example.invalid',
  GIT_CEILING_DIRECTORIES: TMP_ROOT,
};
const REPO = path.join(RUN, 'repo');
const git = (args) => execFileSync('git', ['-C', REPO, ...args], { env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const samePath = (a, b) => path.resolve(a).replace(/\\/g, '/').toLowerCase() === path.resolve(b).replace(/\\/g, '/').toLowerCase();

const AUTH_V1 = [
  '// auth module', 'export function login(user) {', '  return check(user); // V1-LINE-3', '}',
  'export function check(user) {', '  if (!user) return false;', '  return user.active === true;', '}',
  'export function logout() {', '  return null;', '}', '// end',
];
const FILES = {
  'src/auth.js': AUTH_V1.join('\n') + '\n',
  'src/billing.js': ['// billing', 'export const RATE = 0.2;', 'export function charge(amount) {', '  return amount * RATE;', '}',
    'export function refund(amount) {', "  if (amount <= 0) throw new Error('bad');", '  return -amount;', '}', '// end'].join('\n') + '\n',
  'docs/spec.md': ['# Spec', '', '## Login', 'Users log in with a password.', '', '## Refunds', 'Refunds are issued within 30 days.',
    'Only admins approve refunds.', '', '## Billing', 'The rate is 20 percent.'].join('\n') + '\n',
  'config/app.json': ['{', '  "timeout": 30,', '  "retries": 3', '}'].join('\n') + '\n',
  'docs/closed.md': '# closed unit items\n',
  'config/secrets.yml': ['db:', '  host: localhost', '  password: "hunter2"', '  api_key=abc123', '  user: admin', '  tokenizer: whitespace', "  private-key: 'k-123'",
    '  max_tokens: 4096', '  bypass: true', '  mytoken=abc', '  auth_token: t-1', '  db_password=pw1', '  clientSecret: "cs-9"', '  report_dsn: https://key@errors.example/1',
    '  access_tokens: at-1', '  refreshTokens = "rt-2"', '  secrets: s3cr3t', '  passwords: [p1, p2]', '  api_keys: k-1', '  client_secrets: cs-2', '  my_secrets: visible',
    '  password_min_length: 12', '  api_token_ttl: 30s', '  secret_rotation: 15m', '  auth_token_required: true', '  token_lifetime: one-day', '  db_password: hunter2',
    '  password: 1234', '  pin: 0000', '  token_ttl: 3600'].join('\n') + '\n',
  'config/nested.yml': ['server:', '  http:', '    port: 8080', '    timeout: 30', '  grpc:', '    port: 9090', 'client:', '  timeout: 5'].join('\n') + '\n',
  'config/nested.json': ['{', '  "server": {', '    "http": {', '      "port": 8080', '    },', '    "grpc": { "port": 9090 }', '  },', '  "client": { "timeout": 5 }', '}'].join('\n') + '\n',
};

function buildRepo() {
  fs.mkdirSync(REPO, { recursive: true });
  fs.writeFileSync(GITCFG, '');
  git(['init', '-q']);
  const top = git(['rev-parse', '--show-toplevel']).trim();
  if (!samePath(top, REPO)) throw new Error(`fixture repo toplevel is ${top}, not ${REPO}; refusing to commit`);
  git(['config', 'core.autocrlf', 'false']);
  for (const [p, body] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(REPO, p)), { recursive: true });
    fs.writeFileSync(path.join(REPO, p), body);
  }
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'v1']);
  git(['tag', 'v1']);
  // HEAD and the working tree differ from the pin on line 3.
  fs.writeFileSync(path.join(REPO, 'src/auth.js'), FILES['src/auth.js'].replace('V1-LINE-3', 'HEAD-LINE-3'));
  git(['commit', '-q', '-am', 'after the pin']);
  fs.writeFileSync(path.join(REPO, 'src/auth.js'), FILES['src/auth.js'].replace('V1-LINE-3', 'WORKTREE-LINE-3'));
}

// ---------------------------------------------------------------- fixture state folder
const item = (id, title, cites, extra = {}) => ({ id, unit: 'u1', title, plan: 'keep as is', reason: 'per the source', cites, ...extra });
const ITEMS = [
  item('A01', 'login calls check', ['src/auth.js:3']),
  item('A02', 'check throws on an empty user', ['src/auth.js:5-7']),
  item('A03', 'logout returns null.', ['src/auth.js:9-10']),
  item('A04', 'the rate is 0.2', ['src/billing.js:2']),
  item('A05', 'Refunds: Only admins approve refunds', ['docs/spec.md:Refunds']),
  item('A06', 'the onlyx flag is read', ['config/app.json:timeout']),
  item('A07', 'only positive amounts are charged', ['src/billing.js:3-5']),
  item('A08', 'refund throws on a non-positive amount', ['src/billing.js:6-8']),
  item('A09', 'timeout is 30', ['config/app.json:2']),
  item('A10', 'retries is 3', ['config/app.json:3']),
  item('A11', 'the login section exists', ['docs/spec.md:Login']),
  item('A12', 'a cite past the end of the file', ['src/auth.js:999']),
  { id: 'B01', unit: 'u2', title: 'closed one', plan: 'keep', reason: 'r', cites: ['docs/spec.md:1'] },
  { id: 'B02', unit: 'u2', title: 'closed two', plan: 'keep', reason: 'r', cites: ['docs/spec.md:2'] },
];

let nS = 0;
function makeS(opts = {}) {
  const dir = path.join(RUN, `case-${++nS}`);
  const S = path.join(dir, 'S');
  fs.mkdirSync(S, { recursive: true });
  wj(path.join(S, 'config.json'), {
    evidence: { type: 'git', repo: REPO, pin: 'v1' },
    windowSize: 3,
    itemFields: ['title', 'plan', 'reason'],
    units: { u1: { status: 'open', itemFiles: ['docs/spec.md'] }, u2: { status: 'closed', itemFiles: ['docs/closed.md'] } },
    ...(opts.config || {}),
  });
  wjl(path.join(S, 'items.jsonl'), opts.items || ITEMS);
  if (opts.classes !== false) fs.writeFileSync(path.join(S, 'classes.md'), '# Classes\n\nU1 non-use ...\n');
  return S;
}
const RD = (S, unit = 'u1', R = 1) => path.join(S, unit, `r${R}`);
const snap = (S, extra = []) => passes(ltz(['snapshot', S, 'u1', '1', '--chunk-size', '6', ...extra]), 'snapshot');

function setItems(S, edits) {
  const rows = rjl(path.join(S, 'items.jsonl'));
  for (const [id, field, v] of edits) {
    const it = rows.find((r) => r.id === id);
    it[field] = v;
  }
  wjl(path.join(S, 'items.jsonl'), rows);
}

/** Simulate one reader: render its windows through the CLI, then write its result file. */
function reader(S, slot, from, to, verdicts = {}, opts = {}) {
  const rd = RD(S);
  const list = rj(path.join(rd, 'list.json'));
  const byId = new Map(rjl(path.join(rd, 'snapshot.jsonl')).map((x) => [x.id, x]));
  const w = 3;
  for (let p = from; p <= to; p += w) passes(ltz(['render', S, 'u1', '1', slot, String(p), String(Math.min(w, to - p + 1))]), `render ${slot} ${p}`);
  const lines = [];
  for (let p = from; p <= to; p++) {
    for (const c of opts.canaryLines?.[p] || []) lines.push(c);
    const id = list[p - 1];
    const v = verdicts[id] || { verdict: 'ok', note: 'holds at the pin' };
    lines.push({ unit: 'u1', id, verdict: v.verdict, class: v.class || [], note: v.note, cites: v.cites ?? byId.get(id).cites });
  }
  wjl(path.join(rd, `agent-${slot}.jsonl`), lines);
}

const READERS = ['--chunk-readers', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b'];
const CONFIRMED = {
  A02: { note: 'src/auth.js:6 returns false; it does not throw', class: 'C2' },
  A03: { note: 'src/auth.js:10 returns null, but the title claims more', class: 'U1' },
  A08: { note: 'src/billing.js:7 throws only when amount <= 0', foundBy: 'sweep' },
};
/** A complete round 1: snapshot, four readers, confirmed.json. */
function fullRound(opts = {}) {
  const S = makeS(opts);
  snap(S);
  if (opts.beforeRead) opts.beforeRead(S);
  reader(S, 'c1-a', 1, 6, {
    A02: { verdict: 'wrong', note: 'src/auth.js:6 returns false for an empty user', class: ['C2'] },
    A03: { verdict: 'wrong', note: 'src/auth.js:10 returns null only', class: ['U1'] },
  }, { canaryLines: opts.canaryLinesA });
  reader(S, 'c1-b', 1, 6, { A02: { verdict: 'wrong', note: 'src/auth.js:7 is the only return path', class: ['C2'] } });
  reader(S, 'c2-a', 7, 12);
  reader(S, 'c2-b', 7, 12, { A09: { verdict: 'wrong', note: 'config/app.json:2 looks off', class: ['C2'] } });
  wj(path.join(RD(S), 'confirmed.json'), opts.confirmed || CONFIRMED);
  return S;
}
let BASE = null;
function baseCopy() {
  if (!BASE) BASE = fullRound();
  const dir = path.join(RUN, `case-${++nS}`);
  fs.cpSync(path.dirname(BASE), dir, { recursive: true });
  return path.join(dir, 'S');
}
function editJsonl(p, fn) {
  wjl(p, fn(rjl(p)));
}

// ================================================================ tests
// ---- help
for (const c of ['snapshot', 'render', 'show', 'record', 'queue', 'diffcheck', 'sweep', 'flips', 'canary', 'cost', 'replay', 'lock', 'rulings', 'spotcheck']) {
  test(`help: ${c} --help`, () => {
    const r = passes(ltz([c, '--help']));
    ok(r.out.includes(c), 'help names the command');
  });
}
test('help: an unknown command fails', () => fails(ltz(['frobnicate']), /unknown command/));

// ---- snapshot
test('snapshot: writes snapshot, list, chunks, hash and classes copy', () => {
  const S = makeS();
  snap(S);
  const rd = RD(S);
  eq(rj(path.join(rd, 'list.json')), ITEMS.filter((x) => x.unit === 'u1').map((x) => x.id), 'list.json');
  eq(rj(path.join(rd, 'chunks.json')), { c1: { from: 1, to: 6 }, c2: { from: 7, to: 12 } }, 'chunks.json');
  ok(fs.existsSync(path.join(rd, 'classes.md')), 'classes.md copied');
  const want = fs.readFileSync(path.join(rd, 'snapshot.sha256'), 'utf8').split(/\s+/)[0];
  eq(want, crypto.createHash('sha256').update(fs.readFileSync(path.join(rd, 'snapshot.jsonl'))).digest('hex'), 'snapshot.sha256');
  eq(rjl(path.join(rd, 'snapshot.jsonl')).length, 12, 'snapshot has only u1 items');
});
test('snapshot: default chunk size cuts on window multiples; a short tail merges', () => {
  const S = makeS();
  passes(ltz(['snapshot', S, 'u1', '1']));
  eq(rj(path.join(RD(S), 'chunks.json')), { c1: { from: 1, to: 12 } }, 'default chunks (window 3 -> 69 per chunk)');
  eq(cutChunks(70, 64), { c1: { from: 1, to: 70 } }, 'tail of 6 merges');
  eq(cutChunks(100, 64), { c1: { from: 1, to: 64 }, c2: { from: 65, to: 100 } }, 'tail of 36 stays');
});
test('snapshot: refuses when the round already has reader results', () => {
  const S = makeS();
  snap(S);
  passes(ltz(['snapshot', S, 'u1', '1', '--chunk-size', '6']), 'control: re-snapshot before reading');
  fs.writeFileSync(path.join(RD(S), 'agent-c1-a.jsonl'), '');
  fails(ltz(['snapshot', S, 'u1', '1']), /already has reader results/);
});
test('snapshot: refuses once a reader has rendered, before any result is written', () => {
  const S = makeS();
  snap(S);
  passes(ltz(['render', S, 'u1', '1', 'c1-a', '1', '3']));
  fails(ltz(['snapshot', S, 'u1', '1', '--chunk-size', '6']), /reading has started .*render-c1-a\.jsonl/);
});
test('snapshot: refuses without S/classes.md, and for an unknown unit', () => {
  fails(ltz(['snapshot', makeS({ classes: false }), 'u1', '1']), /classes\.md is missing/);
  fails(ltz(['snapshot', makeS(), 'u9', '1']), /not in config\.json "units"/);
});
test('snapshot/render: an item "type" passes through; an unknown value is warned about', () => {
  const S = makeS({ items: ITEMS.map((x) => (x.id === 'A01' ? { ...x, type: 'requirement' } : x.id === 'A02' ? { ...x, type: 'description' } : x)) });
  const r = passes(ltz(['snapshot', S, 'u1', '1', '--chunk-size', '6']));
  ok(!/WARNING/.test(r.out), r.out);
  eq(rjl(path.join(RD(S), 'snapshot.jsonl')).slice(0, 2).map((x) => x.type), ['requirement', 'description'], 'passed through to the snapshot');
  passes(ltz(['render', S, 'u1', '1', 't-a', '1', '2']));
  const w = fs.readFileSync(path.join(RD(S), 'w-t-a-1.txt'), 'utf8');
  ok(/type: requirement/.test(w) && /type: description/.test(w), 'shown in the window');
  const S2 = makeS({ items: ITEMS.map((x) => (x.id === 'A01' ? { ...x, type: 'requirment' } : x)) });
  const r2 = passes(ltz(['snapshot', S2, 'u1', '1']), 'an unknown type is not a failure');
  ok(/WARNING: "type" is neither "requirement" nor "description" for: A01/.test(r2.out), r2.out);
});
test('snapshot --order: list.json in a given order, which must be a permutation of the unit', () => {
  const ids = ITEMS.filter((x) => x.unit === 'u1').map((x) => x.id);
  const rev = [...ids].reverse();
  const S = makeS();
  const f = path.join(path.dirname(S), 'order.txt');
  fs.writeFileSync(f, rev.join('\n') + '\n\n');
  const r = passes(ltz(['snapshot', S, 'u1', '1', '--chunk-size', '6', '--order', f]));
  ok(/list in the --order file's order/.test(r.out), r.out);
  eq(rj(path.join(RD(S), 'list.json')), rev, 'one id per line');
  eq(rjl(path.join(RD(S), 'snapshot.jsonl')).map((x) => x.id), ids, 'the snapshot keeps file order');
  const S2 = makeS();
  const j = path.join(path.dirname(S2), 'order.json');
  wj(j, [ids[1], ids[0], ...ids.slice(2)]);
  passes(ltz(['snapshot', S2, 'u1', '1', '--order', j]));
  eq(rj(path.join(RD(S2), 'list.json')).slice(0, 2), [ids[1], ids[0]], 'a JSON array');
  const bad = (list, re, label) => {
    const S3 = makeS();
    const g = path.join(path.dirname(S3), 'o.txt');
    fs.writeFileSync(g, list.join('\n'));
    fails(ltz(['snapshot', S3, 'u1', '1', '--order', g]), re, label);
    ok(!fs.existsSync(path.join(RD(S3), 'list.json')), `${label}: nothing written`);
  };
  bad(ids.slice(1), /not a permutation .*missing 1 \(A01\)/, 'an id missing');
  bad([...ids, 'B01'], /not in the unit: B01/, 'another unit\'s id');
  bad([...ids, 'A03'], /listed twice: A03/, 'a duplicate');
  const S4 = makeS();
  passes(ltz(['snapshot', S4, 'u1', '0', '--order', f]), 'r0 with an order');
  eq(rj(path.join(RD(S4, 'u1', 0), 'list.json')), rev.slice(0, 3), 'r0: the first window of the order');
});
test('snapshot: refuses when a canary id is in S/items.jsonl', () => {
  const S = makeS();
  wjl(path.join(S, 'canaries.jsonl'), [{ ...ITEMS[0], id: 'A01', kind: 'wrong' }]);
  fails(ltz(['snapshot', S, 'u1', '1']), /canary ids found in S\/items\.jsonl: A01/);
});

/** S with a decision log (D-1, D-2, D-12) and an "accepted by ruling" section listing `listed`. */
function rulingsS(listed, extraConfig = {}) {
  const S = makeS({ config: { decisionLog: 'decisions.md', rulingIdPattern: 'D-\\d+', ...extraConfig } });
  fs.writeFileSync(path.join(S, 'decisions.md'), '# Decisions\n\nD-1 (2026-10-01): readers read cold.\nD-2: owner questions block a close.\nD-12: see D-1.\n');
  fs.writeFileSync(
    path.join(S, 'classes.md'),
    `# Classes\n\n## Accepted by ruling\n${listed.map((id) => `- ${id}: verbatim text`).join('\n')}\n\n## Universal words\nD-2 is mentioned here, outside the section.\n`,
  );
  return S;
}
test('rulings: every ruling id in the decision log must be found in the "accepted by ruling" section', () => {
  passes(ltz(['rulings', rulingsS(['D-1', 'D-2', 'D-12'])]), 'all listed');
  const r = fails(ltz(['rulings', rulingsS(['D-12'])]), /2 not found in the "accepted by ruling" section/);
  ok(/MISSING D-1:/.test(r.out) && /MISSING D-2:/.test(r.out), `D-1 (D-12 is not D-1) and D-2 (mentioned only outside the section):\n${r.out}`);
  ok(!/MISSING D-12/.test(r.out), 'D-12 listed');
  const S = rulingsS(['D-1', 'D-2', 'D-12']);
  fs.writeFileSync(path.join(S, 'classes.md'), '# Classes\n- D-1 D-2 D-12\n');
  fails(ltz(['rulings', S]), /no heading containing "accepted by ruling"/);
  fails(ltz(['rulings', rulingsS(['D-1'], { rulingIdPattern: 'R-\\d+' })]), /matched no ids/, 'a pattern that matches nothing checks nothing');
  fails(ltz(['rulings', makeS()]), /"decisionLog" .* is required/);
});
test('snapshot: with requireRulingEntries, refuses while a ruling is not found in the section', () => {
  fails(ltz(['snapshot', rulingsS(['D-1', 'D-12'], { requireRulingEntries: true }), 'u1', '1']), /refusing: 1 ruling id\(s\) not found in S\/classes\.md's "accepted by ruling" section \(D-2\); readers would not see them/);
  passes(ltz(['snapshot', rulingsS(['D-1', 'D-2', 'D-12'], { requireRulingEntries: true }), 'u1', '1']), 'all listed');
  passes(ltz(['snapshot', rulingsS(['D-1'], { requireRulingEntries: false }), 'u1', '1']), 'not required');
  // Whole text, as for rulings: "D-2x" is not D-2; a mid-line mention of D-2 is.
  const S = rulingsS(['D-1', 'D-12'], { requireRulingEntries: true });
  rulingsSection(S, ['- D-1: verbatim text', '- D-12: verbatim text; see D-2x.']);
  fails(ltz(['snapshot', S, 'u1', '1']), /refusing: 1 ruling id\(s\) not found .*\(D-2\)/, 'D-2x is not D-2');
  rulingsSection(S, ['- D-1: verbatim text', '- D-12: verbatim text; it supersedes D-2.']);
  passes(ltz(['snapshot', S, 'u1', '1']), 'a mid-line mention of D-2 counts');
});
/** Rewrite S/classes.md with an "accepted by ruling" section of `lines` (its first line is S/classes.md:4). */
function rulingsSection(S, lines) {
  fs.writeFileSync(path.join(S, 'classes.md'), `# Classes\n\n## Accepted by ruling\n${lines.join('\n')}\n\n## Universal words\nD-2 is mentioned here, outside the section.\n`);
}
test('rulings: an id is found where it appears as whole text in the section, in any form; not inside another id, nor outside the section', () => {
  const S = rulingsS(['D-1', 'D-2', 'D-12']);
  const base = ['- D-1: verbatim text', '- D-12: verbatim text'];
  // Any whole-text mention inside the section counts: no line form is required.
  for (const line of ['- D-2: verbatim text', '  It supersedes D-2.', 'Ruling D-2: verbatim text', '> D-2: verbatim text', '| D-2 | verbatim text |',
    '**D-2** verbatim text', '### D-2', '(see D-2)']) {
    rulingsSection(S, [...base, line]);
    passes(ltz(['rulings', S]), `"${line}" holds D-2`);
  }
  // Not whole text (inside D-2x, XD-2 or D-21), or after the section ends: MISSING, with a plain message.
  for (const [lines, label] of [[['- D-2x: not the id'], 'D-2x'], [['- XD-2: another scheme'], 'XD-2'], [['- D-21: another ruling'], 'D-21'],
    [['## Later', '- D-2: verbatim text'], 'after a heading of the section\'s level'], [['# Other', '- D-2: verbatim text'], 'after a higher heading']]) {
    rulingsSection(S, [...base, ...lines]);
    const r = fails(ltz(['rulings', S]), /1 not found in the "accepted by ruling" section/, label);
    ok(/MISSING D-2: in the decision log, but not found in S\/classes\.md's "accepted by ruling" section$/m.test(r.out), `${label}:\n${r.out}`);
    ok(!/MISSING D-1\b/.test(r.out) && !/MISSING D-12/.test(r.out), `${label}: D-1 and D-12 are found:\n${r.out}`);
  }
  // A deeper heading stays inside the section.
  rulingsSection(S, [...base, '### Later', '- D-2: verbatim text']);
  passes(ltz(['rulings', S]), 'a deeper heading does not end the section');
});
test('rulings: the decision log yields only whole-text ids; a match inside a longer token (PR-12, XR-5, SHA256) is no ruling', () => {
  // A log of `lines` with pattern `pattern`, and an accepted-by-ruling section holding `listed`.
  const logS = (lines, listed, pattern = 'R-\\d+') => {
    const S = makeS({ config: { decisionLog: 'decisions.md', rulingIdPattern: pattern } });
    fs.writeFileSync(path.join(S, 'decisions.md'), ['# Decisions', '', ...lines, ''].join('\n'));
    rulingsSection(S, listed.map((id) => `- ${id}: verbatim text`));
    return S;
  };
  // Collected: R-12 at a line start, after a space, in brackets, followed by a colon.
  for (const line of ['R-12 approves the refunds wording.', 'The owner approved R-12 today.', 'See (R-12) and [R-12].', 'R-12: approved.']) {
    const r = fails(ltz(['rulings', logS(['R-1: readers read cold.', line], ['R-1'])]), /1 not found/, `"${line}"`);
    ok(/MISSING R-12:/.test(r.out) && /rulings: 2 ruling id\(s\)/.test(r.out), `"${line}" yields R-12:\n${r.out}`);
  }
  // Not collected: an id-shaped match inside a longer token.
  const r = passes(ltz(['rulings', logS(['R-1: readers read cold.', 'Merged in PR-12.', 'See XR-5 in the old log.', 'R-7x is a typo.', 'R-123a is a hash.', 'Part 3R-8 of the old scheme.'], ['R-1'])]), 'only R-1 is a ruling');
  ok(/rulings: 1 ruling id\(s\)/.test(r.out) && !/MISSING/.test(r.out), r.out);
  const sha = passes(ltz(['rulings', logS(['A1: approved.', 'Commit SHA256 a1b2.'], ['A1'], 'A\\d+')]), 'SHA256 holds no A256');
  ok(/rulings: 1 ruling id\(s\)/.test(sha.out), sha.out);
  // A log whose only matches are embedded matches no id: nothing would be checked.
  fails(ltz(['rulings', logS(['Merged in PR-12.', 'See XR-5.'], [])]), /rulingIdPattern \/R-\\d\+\/ matched no ids in .*decisions\.md; nothing would be checked/, 'embedded only');
});

// ---- render / show
function windowLines(file) {
  // (path,line) pairs actually printed in a window file
  const out = new Set();
  let cur = null;
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const h = /^--- (.+?) \(at /.exec(l);
    if (h) {
      cur = parseCite(h[1]).path;
      continue;
    }
    const m = /^\s*(\d+) \| /.exec(l);
    if (m && cur) out.add(`${cur}:${m[1]}`);
  }
  return out;
}
function logLines(S, slot) {
  return new Set(rjl(path.join(RD(S), `render-${slot}.jsonl`)).filter((e) => e.t === 'line').map((e) => `${e.path}:${e.line}`));
}
test('render: shows the pinned text (not HEAD or the working tree), with line numbers', () => {
  const S = makeS();
  snap(S);
  passes(ltz(['render', S, 'u1', '1', 't-a', '1', '3']));
  const w = fs.readFileSync(path.join(RD(S), 'w-t-a-1.txt'), 'utf8');
  ok(w.includes('V1-LINE-3'), 'pinned line 3 rendered');
  ok(!w.includes('HEAD-LINE-3') && !w.includes('WORKTREE-LINE-3'), 'HEAD/working tree text not rendered');
  ok(/^\s+3 \| {3}return check\(user\); \/\/ V1-LINE-3$/m.test(w), 'line number prefix');
  ok(w.includes('title: login calls check') && w.includes('plan: keep as is'), 'items in full');
  eq([...logLines(S, 't-a')].sort(), ['src/auth.js:10', 'src/auth.js:3', 'src/auth.js:5', 'src/auth.js:6', 'src/auth.js:7', 'src/auth.js:9'], 'logged lines');
  eq(rjl(path.join(RD(S), 'render-t-a.jsonl')).filter((e) => e.t === 'item').map((e) => e.id), ['A01', 'A02', 'A03'], 'item entries');
});
test('render: every rendered line is logged (lines, ranges, section and key cites)', () => {
  const S = makeS();
  snap(S);
  passes(ltz(['render', S, 'u1', '1', 't-a', '4', '3']));
  passes(ltz(['render', S, 'u1', '1', 't-a', '10', '3']));
  const printed = new Set([...windowLines(path.join(RD(S), 'w-t-a-4.txt')), ...windowLines(path.join(RD(S), 'w-t-a-10.txt'))]);
  const logged = logLines(S, 't-a');
  ok(printed.size >= 10, `window shows lines (${printed.size})`);
  eq([...printed].sort(), [...logged].sort(), 'printed lines == logged lines');
  ok(logged.has('docs/spec.md:6') && logged.has('docs/spec.md:11'), 'section cite: heading plus following lines');
  ok(logged.has('config/app.json:2') && logged.has('config/app.json:4'), 'key cite: key line plus following lines');
  const misses = rjl(path.join(RD(S), 'render-t-a.jsonl')).filter((e) => e.t === 'cite' && e.status !== 'ok');
  eq(misses.map((e) => [e.id, e.status]), [['A12', 'beyond-eof']], 'unresolved cite logged as an attempt');
  ok(fs.readFileSync(path.join(RD(S), 'w-t-a-10.txt'), 'utf8').includes('nothing rendered: beyond-eof'), 'marker in window');
});
test('render: positions outside the list are refused', () => {
  const S = makeS();
  snap(S);
  fails(ltz(['render', S, 'u1', '1', 't-a', '0', '3']), /at least 1/);
  fails(ltz(['render', S, 'u1', '1', 't-a', '13', '1']), /outside the list \(1-12/);
  fails(ltz(['render', S, 'u1', '1', 't-a', '11', '3']), /positions 11-13 are outside the list/);
  passes(ltz(['render', S, 'u1', '1', 't-a', '10', '3']), 'control: last full window');
});
test('render: refuses a snapshot changed after it was taken', () => {
  const S = makeS();
  snap(S);
  fs.appendFileSync(path.join(RD(S), 'snapshot.jsonl'), JSON.stringify(item('A99', 'x', [])) + '\n');
  fails(ltz(['render', S, 'u1', '1', 't-a', '1', '3']), /changed after the snapshot/);
});
test('render --list: renders the fix-checker input file, positions checked against it', () => {
  const S = makeS();
  snap(S);
  const lf = path.join(RD(S), 'fixcheck-1-c1-input.jsonl');
  wjl(lf, [{ ...ITEMS[0], title: 'login delegates to check', changed: { field: 'title', new: 'login delegates to check' } }, ITEMS[1]]);
  passes(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '2', '--list', lf]));
  const w = fs.readFileSync(path.join(RD(S), 'w-fixcheck-1-c1-1.txt'), 'utf8');
  ok(w.includes('login delegates to check') && w.includes('changed:'), 'renders the list file in full');
  fails(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '2', '2', '--list', lf]), /outside the list \(1-2/);
});
test('show: prints and logs lines; a missing path fails but is logged as an attempt', () => {
  const S = makeS();
  snap(S);
  const r = passes(ltz(['show', S, 'u1', '1', 't-a', 'src/billing.js:2-3']));
  ok(r.out.includes('RATE = 0.2'), 'show prints the pinned line');
  passes(ltz(['render', S, 'u1', '1', 't-a', 'show', 'docs/spec.md:Billing']), 'render ... show form');
  const log = rjl(path.join(RD(S), 'render-t-a.jsonl'));
  eq(log.filter((e) => e.t === 'line' && e.via === 'show').map((e) => `${e.path}:${e.line}`), ['src/billing.js:2', 'src/billing.js:3', 'docs/spec.md:10', 'docs/spec.md:11'], 'show lines logged');
  fails(ltz(['show', S, 'u1', '1', 't-a', 'src/missing.js:1']), /could not be shown/);
  ok(rjl(path.join(RD(S), 'render-t-a.jsonl')).some((e) => e.t === 'cite' && e.cite === 'src/missing.js:1' && e.status === 'not-found-at-pin'), 'miss logged');
});

test('render: secret-looking values are masked by default and the masking is logged', () => {
  const S = makeS();
  snap(S);
  const r = passes(ltz(['show', S, 'u1', '1', 't-a', 'config/secrets.yml:1-7']));
  ok(!/hunter2|abc123|k-123/.test(r.out), `no secret value shown:\n${r.out}`);
  ok(/password: "«masked»"/.test(r.out) && /api_key=«masked»/.test(r.out) && /private-key: '«masked»'/.test(r.out), r.out);
  ok(/host: localhost/.test(r.out) && /user: admin/.test(r.out) && /tokenizer: whitespace/.test(r.out), 'other keys (and "tokenizer") shown');
  const log = rjl(path.join(RD(S), 'render-t-a.jsonl')).filter((e) => e.t === 'line');
  eq(log.filter((e) => e.masked).map((e) => e.line), [3, 4, 7], 'masked lines logged');
  const lf = path.join(RD(S), 'fixcheck-1-c1-input.jsonl');
  wjl(lf, [item('A01', 'secrets', ['config/secrets.yml:3'])]);
  passes(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '1', '--list', lf]));
  ok(!fs.readFileSync(path.join(RD(S), 'w-fixcheck-1-c1-1.txt'), 'utf8').includes('hunter2'), 'masked in window files too');
});
test('render: masking matches whole key segments (auth_token, db_password yes; max_tokens, bypass, mytoken no)', () => {
  const S = makeS();
  snap(S);
  const r = passes(ltz(['show', S, 'u1', '1', 't-a', 'config/secrets.yml:8-14']));
  ok(/max_tokens: 4096/.test(r.out) && /bypass: true/.test(r.out) && /mytoken=abc/.test(r.out), `not secrets, shown:\n${r.out}`);
  ok(!/t-1|pw1|cs-9/.test(r.out) && /auth_token: «masked»/.test(r.out) && /db_password=«masked»/.test(r.out) && /clientSecret: "«masked»"/.test(r.out), `secrets masked:\n${r.out}`);
  ok(/report_dsn: https:\/\/key@errors/.test(r.out), 'report_dsn is not a built-in secret key');
  ok(/show: 7 lines logged .*, 3 masked line\(s\)/.test(r.out), `masked count reported:\n${r.out}`);
  eq(rjl(path.join(RD(S), 'render-t-a.jsonl')).filter((e) => e.masked).map((e) => e.line), [11, 12, 13], 'masked lines logged');
  for (const [k, want] of [['apiKey', true], ['APIKey', true], ['dbPassword', true], ['X-Auth-Token', true], ['CLIENT_SECRET', true], ['credentials', true], ['access_key_id', true],
    ['max_tokens', false], ['tokenizer', false], ['mytoken', false], ['bypass', false], ['passthrough', false], ['secretary', false]]) {
    eq(isSecretKey(k), want, `isSecretKey(${k})`);
  }
});
test('render: plural compound names (access_tokens, secrets, passwords, ...) match only as the whole key', () => {
  const S = makeS();
  snap(S);
  const r = passes(ltz(['show', S, 'u1', '1', 't-a', 'config/secrets.yml:15-21']));
  ok(!/at-1|rt-2|s3cr3t|p1|p2|k-1|cs-2/.test(r.out), `compound secrets masked:\n${r.out}`);
  ok(/access_tokens: «masked»/.test(r.out) && /refreshTokens = "«masked»"/.test(r.out) && /passwords: \[«masked»\]/.test(r.out), r.out);
  ok(/my_secrets: visible/.test(r.out), 'not the whole key: "my_secrets" is not masked');
  ok(/6 masked line\(s\)/.test(r.out), r.out);
  const r2 = passes(ltz(['show', S, 'u1', '1', 't-a', 'config/secrets.yml:8']));
  ok(/max_tokens: 4096/.test(r2.out) && /0 masked line/.test(r2.out), 'max_tokens stays unmasked');
  for (const [k, want] of [['access_tokens', true], ['accessTokens', true], ['SECRETS', true], ['api_keys', true], ['client_secrets', true], ['max_tokens', false], ['my_secrets', false], ['refresh_tokens_ttl', false]]) {
    eq(isSecretKey(k), want, `isSecretKey(${k})`);
  }
});
test('render: plain numbers, booleans and durations are never masked; maskAllow names are never masked', () => {
  const S = makeS();
  snap(S);
  const r = passes(ltz(['show', S, 'u1', '1', 't-a', 'config/secrets.yml:22-27']));
  ok(/password_min_length: 12/.test(r.out) && /api_token_ttl: 30s/.test(r.out) && /secret_rotation: 15m/.test(r.out) , `plain values shown:\n${r.out}`);
  ok(/token_lifetime: «masked»/.test(r.out) && /db_password: «masked»/.test(r.out) && !/hunter2|one-day/.test(r.out), `real values still masked:\n${r.out}`);
  ok(/auth_token_required: «masked»/.test(r.out), 'a boolean under a key with no setting segment is masked');
  ok(/3 masked line\(s\)/.test(r.out), r.out);
  const S2 = makeS({ config: { maskAllow: ['token_lifetime'] } });
  snap(S2);
  const r2 = passes(ltz(['show', S2, 'u1', '1', 't-a', 'config/secrets.yml:26-27']));
  ok(/token_lifetime: one-day/.test(r2.out) && /db_password: «masked»/.test(r2.out), `allowed key shown, others masked:\n${r2.out}`);
  for (const [v, plain] of [['12', true], ['-3.5', true], ['true', true], ['FALSE', true], ['30s', true], ['1h30m', true], ['250ms', true], ['hunter2', false], ['12abc', false], ['s3cr3t', false], ['yes', false]]) {
    eq(PLAIN_VALUE.test(v), plain, `plain value ${v}`);
  }
  const S3 = makeS({ config: { maskAllow: 'token_lifetime' } });
  snap(S3);
  fails(ltz(['show', S3, 'u1', '1', 't-a', 'config/secrets.yml:26']), /"maskAllow" must be an array/);
});
test('render: a numeric secret is masked unless the key also names a setting (SECURITY)', () => {
  const S = makeS();
  snap(S);
  const r = passes(ltz(['show', S, 'u1', '1', 't-a', 'config/secrets.yml:22', 'config/secrets.yml:28-30']));
  ok(/password: «masked»/.test(r.out) && !/password: 1234/.test(r.out), `password: 1234 masked:\n${r.out}`);
  ok(/pin: «masked»/.test(r.out) && !/pin: 0000/.test(r.out), `pin: 0000 masked:\n${r.out}`);
  ok(/password_min_length: 12/.test(r.out) && /token_ttl: 3600/.test(r.out), `setting keys shown:\n${r.out}`);
  ok(/2 masked line\(s\)/.test(r.out), r.out);
  for (const [k, want] of [['password_min_length', true], ['token_ttl', true], ['pin_max_attempts', true], ['secret_rotation', true], ['password', false], ['pin', false], ['auth_token_required', false], ['db_password', false]]) {
    eq(hasSettingSegment(k), want, `hasSettingSegment(${k})`);
  }
  const S2 = makeS({ config: { maskAllow: ['pin'] } });
  snap(S2);
  ok(/pin: 0000/.test(passes(ltz(['show', S2, 'u1', '1', 't-a', 'config/secrets.yml:29'])).out), 'a maskAllow key is never masked');
});
test('masking: keys with spaces split into words; an unquoted value runs to its end; "<number> <unit word>" is a duration', () => {
  for (const [line, want] of [
    ['Password rotation: 90 days', 'Password rotation: 90 days'], // "rotation" is a setting segment, "90 days" a plain duration
    ['Password rotation: 1 week', 'Password rotation: 1 week'],
    ['Token expiry: 2 Weeks', 'Token expiry: 2 Weeks'],
    ['Password: hunter2', 'Password: «masked»'],
    ['Password: 90 days', 'Password: «masked»'], // no setting segment: masked whole
    ['Password rotation: every 90 days', 'Password rotation: «masked»'], // not a plain duration
    ['Password rotation: 90 fortnights', 'Password rotation: «masked»'], // not a unit word
    ['The admin password is: correct horse battery', 'The admin password is: «masked»'], // the whole value
    ['user: admin password: hunter2', 'user: admin password: «masked»'],
    ['Rotation: 90 days', 'Rotation: 90 days'], // not a secret key
    ['password_min_length: 12 # the policy minimum', 'password_min_length: 12 # the policy minimum'], // a " #" comment ends the value
    ['password: hunter2 # old', 'password: «masked» # old'],
    ['f(password=x, y)', 'f(password=«masked», y)'],
  ]) eq(maskSecrets(line).text, want, line);
  for (const [v, want] of [['90 days', true], ['1 day', true], ['30 seconds', true], ['2 minutes', true], ['12 hours', true], ['3 weeks', true], ['90 fortnights', false], ['every 90 days', false], ['90days', false]]) {
    eq(PLAIN_VALUE.test(v), want, `PLAIN_VALUE ${v}`);
  }
  // Through show, on a policy document in a folder source.
  const root = path.join(RUN, `policy-${++nS}`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'policy.md'), '# Passwords\nPassword rotation: 90 days\nPassword: hunter2\nThe service password is: correct horse battery\n');
  const S = makeS({ config: { evidence: { type: 'dir', root } } });
  snap(S);
  const r = passes(ltz(['show', S, 'u1', '1', 't-a', 'policy.md:1-4']));
  ok(/Password rotation: 90 days/.test(r.out) && /Password: «masked»/.test(r.out) && !/hunter2|horse|battery/.test(r.out), r.out);
  ok(/2 masked line\(s\)/.test(r.out), r.out);
});
test('render: maskKeys adds names; maskExclude path globs are never masked; bad values refused', () => {
  const S = makeS({ config: { maskKeys: ['dsn'] } });
  snap(S);
  const r = passes(ltz(['show', S, 'u1', '1', 't-a', 'config/secrets.yml:14']));
  ok(/report_dsn: «masked»/.test(r.out) && /1 masked line/.test(r.out), r.out);
  const S2 = makeS({ config: { maskExclude: ['config/secrets.*'] } });
  snap(S2);
  const r2 = passes(ltz(['show', S2, 'u1', '1', 't-a', 'config/secrets.yml:3-4']));
  ok(/password: "hunter2"/.test(r2.out) && /0 masked line/.test(r2.out), `excluded path not masked:\n${r2.out}`);
  const S3 = makeS({ config: { maskExclude: ['config/*.json', 'docs/**'] } });
  snap(S3);
  ok(/password: "«masked»"/.test(passes(ltz(['show', S3, 'u1', '1', 't-a', 'config/secrets.yml:3'])).out), 'control: a glob that does not match the path');
  const S4 = makeS({ config: { maskKeys: 'dsn' } });
  snap(S4);
  fails(ltz(['show', S4, 'u1', '1', 't-a', 'config/secrets.yml:3']), /"maskKeys" must be an array/);
});
test('render: "maskSecrets": false shows secret values', () => {
  const S = makeS({ config: { maskSecrets: false } });
  snap(S);
  const r = passes(ltz(['show', S, 'u1', '1', 't-a', 'config/secrets.yml:3-4']));
  ok(/password: "hunter2"/.test(r.out) && /api_key=abc123/.test(r.out) && !/«masked»/.test(r.out), r.out);
  ok(!rjl(path.join(RD(S), 'render-t-a.jsonl')).some((e) => e.masked), 'nothing logged as masked');
});
test('render: path#a.b.c cites resolve nested JSON/YAML keys (line plus block), respecting nesting', () => {
  const S = makeS();
  snap(S);
  const lines = (cite) => {
    const before = fs.existsSync(path.join(RD(S), 'render-k.jsonl')) ? rjl(path.join(RD(S), 'render-k.jsonl')).length : 0;
    const r = ltz(['show', S, 'u1', '1', 'k', cite]);
    return { r, got: rjl(path.join(RD(S), 'render-k.jsonl')).slice(before).filter((e) => e.t === 'line').map((e) => e.line) };
  };
  eq(lines('config/nested.yml#server.http').got, [2, 3, 4], 'yaml block');
  eq(lines('config/nested.yml#server.grpc.port').got, [6], 'yaml leaf inside grpc, not http');
  eq(lines('config/nested.json#server.http').got, [3, 4, 5], 'json block with its closing brace');
  eq(lines('config/nested.json#server.grpc.port').got, [6], 'json inline object');
  eq(lines('config/nested.json#client.timeout').got, [8], 'json top-level inline');
  const miss = lines('config/nested.yml#client.port');
  fails(miss.r, /could not be shown/, 'client has no port: nesting respected');
  eq(miss.got, [], 'nothing rendered for a missing key path');
  fails(lines('config/nested.yml#server.grpc.timeout').r, /could not be shown/, 'grpc has no timeout (client\'s later timeout is outside its block)');
  fails(lines('config/nested.yml#server.timeout').r, /could not be shown/, 'a grandchild (http.timeout) is not a direct child of server');
  fails(lines('config/nested.json#server.port').r, /could not be shown/, 'json: port is under http/grpc, not server');
  eq(lines('config/nested.yml#client.timeout').got, [8], 'control: client.timeout');
  ok(rjl(path.join(RD(S), 'render-k.jsonl')).some((e) => e.t === 'cite' && e.cite === 'config/nested.yml#client.port' && e.status === 'key-not-found'), 'attempt logged');
  passes(ltz(['show', S, 'u1', '1', 'k', 'docs/spec.md:Refunds']), 'path:Key still works');
  const log = loadRenderLog(path.join(RD(S), 'render-k.jsonl'));
  ok(citeInLog(log, 'config/nested.yml#server.http'), 'a rendered key path counts as read');
  ok(!citeInLog(log, 'config/nested.json#server.grpc'), 'an unrendered key path does not');
});
test('render --list: a JSONL of full items; malformed or duplicate lines are refused', () => {
  const S = makeS();
  snap(S);
  const lf = path.join(RD(S), 'fixcheck-1-c1-input.jsonl');
  wjl(lf, [{ ...ITEMS[0], title: 'brand new text', changed: { field: 'title', old: 'login calls check', new: 'brand new text' } }]);
  passes(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '1', '--list', lf]));
  const w = fs.readFileSync(path.join(RD(S), 'w-fixcheck-1-c1-1.txt'), 'utf8');
  ok(w.includes('title: brand new text') && !w.includes('title: login calls check'), 'item text comes from the list file, not the snapshot');
  wjl(lf, [ITEMS[0], ITEMS[0]]);
  fails(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '2', '--list', lf]), /duplicate id A01/);
  fs.writeFileSync(lf, JSON.stringify(ITEMS[0]) + '\n{"title": "no id"}\n');
  fails(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '2', '--list', lf]), /item has no string "id"/);
  fs.writeFileSync(lf, JSON.stringify(ITEMS[0]) + '\nnot json\n');
  fails(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '1', '--list', lf]), /not valid JSON/);
  fails(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '1', '--list', path.join(RD(S), 'nope.jsonl')]), /--list file not found/);
});

test('render --list: an item without "changed" is a named item, marked for context; changed items are not', () => {
  const S = makeS();
  snap(S);
  const lf = path.join(RD(S), 'fixcheck-1-c1-input.jsonl');
  wjl(lf, [{ ...ITEMS[0], title: 'login delegates to check', changed: { field: 'title', new: 'login delegates to check' } }, ITEMS[1]]);
  const r = passes(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '2', '--list', lf]));
  const w = fs.readFileSync(path.join(RD(S), 'w-fixcheck-1-c1-1.txt'), 'utf8');
  ok(/^=== item A02 === \(named item, for context\)$/m.test(w), `A02 marked:\n${w}`);
  ok(/^=== item A01 ===$/m.test(w), 'the changed item is not marked');
  ok(/1 named item\(s\) for context/.test(r.out), r.out);
  passes(ltz(['render', S, 'u1', '1', 't-a', '1', '2']));
  ok(!/named item/.test(fs.readFileSync(path.join(RD(S), 'w-t-a-1.txt'), 'utf8')), 'control: a normal window never marks items');
});

/** Folders for mixed-source tests: export/ (dir) and export/deep/ (another dir). */
function mixedFolders() {
  const exp = path.join(RUN, `export-src-${++nS}`);
  const deep = path.join(RUN, `deep-src-${nS}`);
  fs.mkdirSync(exp, { recursive: true });
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(exp, 'notes.md'), 'EXPORT-LINE-1 RATE\nsecond\n');
  fs.writeFileSync(path.join(deep, 'notes.md'), 'DEEP-LINE-1\n');
  return { exp, deep };
}
test('mixed evidence: a cite routes to the longest matching prefix, which is stripped', () => {
  const { exp, deep } = mixedFolders();
  const S = makeS({ config: { evidence: [
    { type: 'git', repo: REPO, pin: 'v1', prefix: '' },
    { type: 'dir', root: exp, prefix: 'export/' },
    { type: 'dir', root: deep, prefix: 'export/deep' },
  ] } });
  snap(S);
  let r = passes(ltz(['show', S, 'u1', '1', 't-a', 'export/notes.md:1']));
  ok(/EXPORT-LINE-1/.test(r.out) && /\(at dir\)/.test(r.out), `export/ prefix stripped, read from the folder:\n${r.out}`);
  r = passes(ltz(['show', S, 'u1', '1', 't-a', 'export/deep/notes.md:1']));
  ok(/DEEP-LINE-1/.test(r.out) && !/EXPORT-LINE/.test(r.out), 'the longest prefix wins');
  r = passes(ltz(['show', S, 'u1', '1', 't-a', 'src/auth.js:3']));
  ok(/V1-LINE-3/.test(r.out) && /\(at v1\)/.test(r.out), 'the empty prefix: the git repo at its pin');
  fails(ltz(['show', S, 'u1', '1', 't-a', 'export/auth.js:3']), /could not be shown/, 'export/ never falls back to the git repo');
  passes(ltz(['render', S, 'u1', '1', 't-a', '1', '1']), 'render routes item cites the same way');
  ok(/V1-LINE-3/.test(fs.readFileSync(path.join(RD(S), 'w-t-a-1.txt'), 'utf8')), 'window from the git source');
  ok(/export\/ -> dir/.test(fs.readFileSync(path.join(RD(S), 'w-t-a-1.txt'), 'utf8')), 'the window header lists every source');
});
test('mixed evidence: sources with no empty prefix, bad configs refused, a single object still valid', () => {
  const { exp } = mixedFolders();
  const S = makeS({ config: { evidence: [{ type: 'git', repo: REPO, pin: 'v1', prefix: 'code/' }, { type: 'dir', root: exp, prefix: 'export/' }] } });
  snap(S);
  ok(/V1-LINE-3/.test(passes(ltz(['show', S, 'u1', '1', 't-a', 'code/src/auth.js:3'])).out), 'code/ prefix stripped');
  const r = fails(ltz(['show', S, 'u1', '1', 't-a', 'src/auth.js:3']), /could not be shown/);
  ok(/no-source/.test(r.out), `a path no source claims:\n${r.out}`);
  const bad = (evidence, re, label) => {
    const S2 = makeS({ config: { evidence } });
    fails(ltz(['snapshot', S2, 'u1', '1']), re, label);
  };
  bad([], /"evidence" is an empty list/, 'empty list');
  bad([{ type: 'git', repo: REPO, pin: 'v1' }, { type: 'dir', root: exp }], /two evidence sources share the prefix ""/, 'duplicate prefix');
  bad([{ type: 'svn', root: exp, prefix: 'x/' }], /evidence\[0\]: "type" must be "git" or "dir"/, 'bad type');
  bad([{ type: 'dir', root: exp, prefix: '../up' }], /"prefix" must be a relative folder/, 'prefix escaping');
  passes(ltz(['show', (() => { const S3 = makeS(); snap(S3); return S3; })(), 'u1', '1', 't-a', 'src/auth.js:3']), 'a single evidence object, as before');
});
test('mixed evidence: --verify-searches and searches scan every source by the same routing', () => {
  const { exp } = mixedFolders();
  const S = makeS({ config: { evidence: [{ type: 'git', repo: REPO, pin: 'v1', prefix: '' }, { type: 'dir', root: exp, prefix: 'export/' }] } });
  snap(S);
  // RATE: 2 in the git repo's src/billing.js, 1 in export/notes.md.
  passes(verifyRun(S, { regex: 'RATE', paths: ['**'] }, 3, { at: [...RATE_SRC, 'export/notes.md:1'] }), 'both sources');
  passes(verifyRun(S, { regex: 'RATE', paths: ['export/**'] }, 1, { at: ['export/notes.md:1'] }), 'only the folder source');
  passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { at: RATE_SRC }), 'only the git source');
  fails(verifyRun(S, { regex: 'RATE', paths: ['**'] }, 2), /the pin has 3 matches/);
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'a', 'b', { search: { regex: 'RATE', paths: ['src/**'] }, hits: 2, blindSpots: 'x' })]);
  const r = fails(ltz(['searches', S, '--rounds', 'u1']), /1 differ/, 'boundary-wide (every source) count is 3');
  ok(/boundary-wide 3 matches/.test(r.out), r.out);
});

test('render --list: "changed" may be an array of fields; each is shown; malformed is refused', () => {
  const S = makeS();
  snap(S);
  const lf = path.join(RD(S), 'fixcheck-1-c1-input.jsonl');
  wjl(lf, [{ ...ITEMS[0], title: 'new title', plan: 'new plan', changed: [{ field: 'title', old: 'login calls check', new: 'new title' }, { field: 'plan', new: 'new plan' }] }]);
  const r = passes(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '1', '--list', lf]));
  const w = fs.readFileSync(path.join(RD(S), 'w-fixcheck-1-c1-1.txt'), 'utf8');
  ok(/^changed\[1\]: title: new title {2}\(was: login calls check\)$/m.test(w) && /^changed\[2\]: plan: new plan$/m.test(w), `both changes shown:\n${w}`);
  ok(!/named item/.test(w) && !/0 named/.test(r.out), 'a changed item, not a named one');
  wjl(lf, [{ ...ITEMS[0], changed: { field: 'title', new: 'x' } }]);
  passes(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '1', '--list', lf]), 'one object still works');
  ok(/^changed: title: x$/m.test(fs.readFileSync(path.join(RD(S), 'w-fixcheck-1-c1-1.txt'), 'utf8')), 'single change line');
  for (const [changed, re] of [[[], /"changed" is an empty list/], [[{ new: 'x' }], /"changed"\[0\] needs a "field"/], [{ field: 'title' }, /"changed" \(title\) needs "new"/], ['title', /"changed" must be an object/]]) {
    wjl(lf, [{ ...ITEMS[0], changed }]);
    fails(ltz(['render', S, 'u1', '1', 'fixcheck-1-c1', '1', '1', '--list', lf]), re, JSON.stringify(changed));
  }
});

// ---- record
test('record: happy path writes report.json and measure.json', () => {
  const S = baseCopy();
  passes(ltz(['record', S, 'u1', '1', ...READERS]));
  const rep = rj(path.join(RD(S), 'report.json'));
  eq(rep.items.length, 12, 'one report line per item');
  eq(rep.counts, { ok: 9, wrong: 3, 'pending-owner': 0, defect: 0, unread: 0, 'outside-bar': 0 }, 'counts');
  const by = Object.fromEntries(rep.items.map((x) => [x.id, x]));
  eq(by.A02.verdict, 'wrong', 'A02 wrong');
  eq(by.A02.note, CONFIRMED.A02.note, 'wrong note from confirmed.json');
  eq(by.A09.verdict, 'ok', 'false alarm reported ok');
  eq(by.A01.cites_read, ['src/auth.js:3'], 'cites_read from render logs');
  const m = rj(path.join(RD(S), 'measure.json'));
  const c1 = m.chunks.c1;
  eq([c1.confirmed, c1.foundByAll, c1.foundBy['c1-a'], c1.foundBy['c1-b'], c1.foundByAlone['c1-a'], c1.foundByAlone['c1-b'], c1.foundByNone, c1.foundByOneReader],
    [2, 1, 2, 1, 1, 0, 0, 1], 'chunk c1 measures');
  eq([c1.estimate.n1, c1.estimate.n2, c1.estimate.m, c1.estimate.N, c1.estimate.remaining], [2, 1, 1, 2, 0], 'c1 estimate');
  eq([m.chunks.c2.confirmed, m.chunks.c2.foundByNone, m.chunks.c2.falseAlarms['c2-b'], m.chunks.c2.falseAlarms['c2-a']], [1, 1, 1, 0], 'c2 measures');
  eq([c1.union, m.chunks.c2.union], [['A02', 'A03'], ['A09']], 'union of reader wrongs per chunk');
  eq(m.total.foundByNone, 1, 'total foundByNone');
  eq(m.caveat, ESTIMATE_CAVEAT, 'caveat string');
  eq(m.total.estimate.caveat, 'low estimate: readers share a brief, so they are not independent; foundByNone adds to this', 'literal caveat');
});
test('record: refuses without confirmed.json, and writes nothing', () => {
  const S = baseCopy();
  fs.rmSync(path.join(RD(S), 'confirmed.json'));
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /confirmed\.json is missing/);
  ok(!fs.existsSync(path.join(RD(S), 'report.json')) && !fs.existsSync(path.join(RD(S), 'measure.json')), 'no report or measure written');
});
test('record: a reader file missing a position is a PROBLEM, and nothing is written', () => {
  const S = baseCopy();
  editJsonl(path.join(RD(S), 'agent-c1-b.jsonl'), (rows) => rows.filter((r) => r.id !== 'A04'));
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /PROBLEM: c1-b: positions not covered: 4 \(ids A04\)/);
  ok(!fs.existsSync(path.join(RD(S), 'report.json')), 'no report.json after a refusal');
});
test('record: a duplicated position is a PROBLEM', () => {
  const S = baseCopy();
  editJsonl(path.join(RD(S), 'agent-c2-a.jsonl'), (rows) => [...rows, rows[0]]);
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /c2-a: position 7 \(A07\) is covered 2 times/);
});
test('record: a cite not in the reader\'s render log is a PROBLEM', () => {
  const S = baseCopy();
  editJsonl(path.join(RD(S), 'agent-c1-a.jsonl'), (rows) => rows.map((r) => (r.id === 'A01' ? { ...r, cites: [...r.cites, 'src/billing.js:9'] } : r)));
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /c1-a: A01 \(line 1\): cites src\/billing\.js:9, which is not in its render log/);
});
test('record: a cite read by the OTHER reader does not count for this one', () => {
  const S = baseCopy();
  // c1-b shows billing.js:9; c1-a cites it without having rendered it.
  passes(ltz(['show', S, 'u1', '1', 'c1-b', 'src/billing.js:9']));
  editJsonl(path.join(RD(S), 'agent-c1-a.jsonl'), (rows) => rows.map((r) => (r.id === 'A01' ? { ...r, cites: ['src/billing.js:9'] } : r)));
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /c1-a: A01 .*src\/billing\.js:9, which is not in its render log/);
  passes(ltz(['show', S, 'u1', '1', 'c1-a', 'src/billing.js:9']), 'c1-a shows it');
  passes(ltz(['record', S, 'u1', '1', ...READERS]), 'control: once shown, it counts');
});
test('record: a wrong whose note names no file:line is a PROBLEM', () => {
  const S = baseCopy();
  editJsonl(path.join(RD(S), 'agent-c1-a.jsonl'), (rows) => rows.map((r) => (r.id === 'A02' ? { ...r, note: 'looks off to me' } : r)));
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /c1-a: A02 .*wrong, but its note names no file:line/);
});
test('record: a wrong naming a file:line the reader never rendered is a PROBLEM', () => {
  const S = baseCopy();
  editJsonl(path.join(RD(S), 'agent-c1-a.jsonl'), (rows) => rows.map((r) => (r.id === 'A02' ? { ...r, note: 'see src/billing.js:9' } : r)));
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /c1-a: A02 .*none of the file:line refs in its note \(src\/billing\.js:9\) is in its render log/);
});
test('record: an item judged but never rendered is a PROBLEM', () => {
  const S = baseCopy();
  editJsonl(path.join(RD(S), 'render-c2-a.jsonl'), (rows) => rows.filter((e) => e.id !== 'A10'));
  editJsonl(path.join(RD(S), 'agent-c2-a.jsonl'), (rows) => rows.map((r) => (r.id === 'A10' ? { ...r, cites: [] } : r)));
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /c2-a: A10 .*judged but never rendered/);
});
test('record: cites_read comes only from render logs, never from the item\'s cites', () => {
  const S = baseCopy();
  passes(ltz(['record', S, 'u1', '1', ...READERS]));
  const by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq(ITEMS.find((x) => x.id === 'A12').cites, ['src/auth.js:999'], 'item A12 cites a line past EOF');
  eq(by.A12.cites_read, [], 'nothing was rendered for A12, so cites_read is empty');
  ok(JSON.stringify(by.A12.cites_read) !== JSON.stringify(ITEMS[11].cites), 'cites_read != item cites');
  eq(by.A05.cites_read, ['docs/spec.md:6-11'], 'section cite read as rendered lines');
});
test('record: every chunk must have readers', () => {
  const S = baseCopy();
  fails(ltz(['record', S, 'u1', '1', '--chunk-readers', 'c1=c1-a,c1-b']), /chunk c2 \(positions 7-12\) has no readers/);
});
test('record: a snapshot edited after reading is a PROBLEM', () => {
  const S = baseCopy();
  const p = path.join(RD(S), 'snapshot.jsonl');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('logout returns null.', 'logout returns nothing.'));
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /changed after the snapshot/);
});
test('record: confirmed ids must be real items with notes', () => {
  const S = baseCopy();
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, Z99: { note: 'x.js:1' }, A04: {} });
  const r = fails(ltz(['record', S, 'u1', '1', ...READERS]), /Z99 is not an item/);
  ok(/A04 has no "note"/.test(r.out), 'note required');
});
test('record: pending ids become pending-owner, not wrong and not false alarms', () => {
  const S = baseCopy();
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, pending: [{ id: 'A09', pendingReason: 'rule-meaning' }] });
  passes(ltz(['record', S, 'u1', '1', ...READERS]));
  const by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq(by.A09.verdict, 'pending-owner', 'A09 pending');
  eq(rj(path.join(RD(S), 'measure.json')).chunks.c2.falseAlarms['c2-b'], 0, 'not a false alarm');
});

/** Turn a base copy's round 1 into round 2, so an earlier round 1 can be written by hand. */
function asRound2(S) {
  fs.renameSync(RD(S, 'u1', 1), RD(S, 'u1', 2));
  fs.mkdirSync(RD(S, 'u1', 1), { recursive: true });
}
test('record: a repeat (same id, overlapping class, earlier round) is a PROBLEM', () => {
  const S = baseCopy();
  asRound2(S);
  const r1 = path.join(RD(S, 'u1', 1), 'confirmed.json');
  const r2 = path.join(RD(S, 'u1', 2), 'confirmed.json');
  wj(r1, { A05: { note: 'docs/spec.md:8', class: 'U1' } });
  passes(ltz(['record', S, 'u1', '2', ...READERS]), 'control: no id confirmed twice');
  fs.rmSync(path.join(RD(S, 'u1', 2), 'report.json'));
  wj(r1, { A02: { note: 'src/auth.js:6', class: 'C2' } });
  fs.writeFileSync(path.join(S, 'judgments.jsonl'), JSON.stringify({ date: '2026-01-02', unit: 'u1', round: 1, id: 'A02', was: 'wrong', now: 'ok', by: 'fixcheck', reason: 'old text held' }) + '\n');
  passes(ltz(['record', S, 'u1', '2', ...READERS]), 'an earlier wrong judgments.jsonl overturned is no repeat basis');
  fs.rmSync(path.join(RD(S, 'u1', 2), 'report.json'));
  fs.rmSync(path.join(S, 'judgments.jsonl'));
  const r = fails(ltz(['record', S, 'u1', '2', ...READERS]), /PROBLEM: confirmed\.json: A02 repeats r1 \(class C2\)/);
  ok(/keep it wrong with "repeatReason": "plain-fix-failure".*"new-text".*"repeatNote"; only the Verdicts exceptions go in "pending", with a "pendingReason": "rule-meaning".*"boundary-silent".*"ruled-wording"/.test(r.out), `the way out is named:\n${r.out}`);
  ok(!fs.existsSync(path.join(RD(S, 'u1', 2), 'report.json')), 'nothing written');
  wj(r1, { A02: { note: 'src/auth.js:6' } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /A02 repeats r1 \(class unknown on one side/, 'earlier class unknown (and no reader files) counts as overlapping');
  wj(r1, { A02: { note: 'src/auth.js:6', class: 'U4' } });
  passes(ltz(['record', S, 'u1', '2', ...READERS]), 'control: no overlapping class');
  wj(r1, { A02: { note: 'src/auth.js:6', class: ['U4', 'C2'] } });
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'plain-fix-failure' } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /A02 has repeatReason "plain-fix-failure" but no "repeatNote"/, 'the escape hatch needs its own note');
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'plain-fix-failure', repeatNote: '  ' } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /no "repeatNote"/, 'a blank repeatNote is not a note');
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'plain-fix-failure', repeatNote: 'r1 edited the plan field only' } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /A02 has repeatReason "plain-fix-failure" but "rulingsChecked" is missing, not a list: list every bar ruling in the decision log, each with why it doesn't cover A02/, 'rulings must be checked first');
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'plain-fix-failure', repeatNote: 'r1 edited the plan field only', rulingsChecked: 'yes' } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /"rulingsChecked" is "yes", not a list/, 'a string is not a list');
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'plain-fix-failure', repeatNote: 'r1 edited the plan field only', rulingsChecked: true } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /"rulingsChecked" is true, not a list: list every bar ruling in the decision log, each with why it doesn't cover A02/, 'the old boolean is refused');
  // No "decisionLog" and no "rulingIdPattern" here: [] is accepted, saying it was not checked.
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'plain-fix-failure', repeatNote: 'r1 edited the plan field only', rulingsChecked: [] } });
  const r3 = passes(ltz(['record', S, 'u1', '2', ...READERS]), 'repeatReason plain-fix-failure with a repeatNote and rulingsChecked');
  ok(/INFO: confirmed\.json: A02 "rulingsChecked" is \[\] and was not checked: config "decisionLog" and "rulingIdPattern" are not set/.test(r3.out), r3.out);
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'tired' } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /the accepted values are "plain-fix-failure", "new-text", "earlier-miss"/);
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'new-text' } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /A02 has repeatReason "new-text" but no "repeatNote"/, 'new-text also needs a repeatNote');
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'new-text', repeatNote: 'r1 fix wrote "always", which the pin refutes' } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /"new-text" but "rulingsChecked" is missing, not a list/);
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'new-text', repeatNote: 'r1 fix wrote "always", which the pin refutes', rulingsChecked: [] } });
  passes(ltz(['record', S, 'u1', '2', ...READERS]), 'repeatReason new-text with a repeatNote');
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'earlier-miss' } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /A02 has repeatReason "earlier-miss" but no "repeatNote"/, 'earlier-miss needs a repeatNote');
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'earlier-miss', repeatNote: 'r1 fixed the throw claim; this is the return-value claim, missed in r1' } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /"earlier-miss" but "rulingsChecked" is missing, not a list/);
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'earlier-miss', repeatNote: 'r1 fixed the throw claim; this is the return-value claim, missed in r1', rulingsChecked: [] } });
  passes(ltz(['record', S, 'u1', '2', ...READERS]), 'repeatReason earlier-miss with a repeatNote');
  fs.rmSync(path.join(RD(S, 'u1', 2), 'report.json'));
  const { A02, ...rest } = CONFIRMED;
  wj(r2, { ...rest, pending: [{ id: 'A02', pendingReason: 'rule-meaning' }] });
  passes(ltz(['record', S, 'u1', '2', ...READERS]), 'marked pending instead');
});
test('record: "rulingsChecked" lists every bar ruling in the decision log, each with a why; the listed set must equal the log\'s', () => {
  const S = baseCopy();
  asRound2(S);
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  const LOG = { ...base, decisionLog: 'decisions.md', rulingIdPattern: 'R-\\d+' };
  wj(cfgP, LOG);
  // R-3 is superseded by R-7 but still in the log; P-1 is a process decision, not a bar ruling id.
  fs.writeFileSync(path.join(S, 'decisions.md'), [
    '# Decisions', '', 'R-1 (2026-10-01): the refunds wording of A05 is approved.', 'R-12: A02 may say "throws".',
    'R-3: C2 claims about return values are read loosely. Superseded by R-7.', 'R-7 (2026-11-02): supersedes R-3; C2 claims are read strictly.',
    'P-1: two readers per chunk.', 'Merged in PR-45; see XR-9 in the old log.', '',
  ].join('\n'));
  // A log whose only id-shaped matches sit inside longer tokens.
  fs.writeFileSync(path.join(S, 'embedded.md'), '# Decisions\n\nMerged in PR-45; see XR-9.\n');
  // S/classes.md has no accepted-by-ruling section: the check does not read it.
  fs.writeFileSync(path.join(S, 'classes.md'), '# Classes\n\nC2 return values. R-99 is named here.\n');
  wj(path.join(RD(S, 'u1', 1), 'confirmed.json'), { A02: { note: 'src/auth.js:6', class: 'C2' } });
  const r2 = path.join(RD(S, 'u1', 2), 'confirmed.json');
  const keep = (rulingsChecked) =>
    wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'plain-fix-failure', repeatNote: 'r1 edited the plan field only', rulingsChecked } });
  const rec = () => ltz(['record', S, 'u1', '2', ...READERS]);
  const why = (ruling, w = 'it approves other wording, not this claim') => ({ ruling, why: w });
  const ALL = ['R-1', 'R-12', 'R-3', 'R-7'].map((x) => why(x));
  const without = (id) => ALL.filter((e) => e.ruling !== id);
  keep(true);
  fails(rec(), /A02 has repeatReason "plain-fix-failure" but "rulingsChecked" is true, not a list: list every bar ruling in the decision log, each with why it doesn't cover A02/, 'the old boolean');
  // The full set, in any order, is accepted.
  keep(ALL);
  let r = passes(rec(), 'every bar ruling listed (PR-45 and XR-9 in the log are no rulings)');
  ok(!/INFO:/.test(r.out), `no info line for the full set:\n${r.out}`);
  keep([...ALL].reverse());
  passes(rec(), 'any order');
  // A log ruling left out is refused, by name, each one.
  fs.rmSync(path.join(RD(S, 'u1', 2), 'report.json'));
  keep(without('R-12'));
  r = fails(rec(), /PROBLEM: confirmed\.json: A02 "rulingsChecked" leaves out R-12, a bar ruling in the decision log \(.*decisions\.md\): list every bar ruling in the decision log, each with why it doesn't cover A02/, 'R-12 missing');
  eq((r.out.match(/leaves out/g) || []).length, 1, 'only R-12 is left out');
  ok(!fs.existsSync(path.join(RD(S, 'u1', 2), 'report.json')), 'nothing written');
  // R-1 is not found inside R-12: leaving out R-1 is refused.
  keep(without('R-1'));
  fails(rec(), /leaves out R-1, a bar ruling in the decision log/, 'R-1 left out while R-12 is listed');
  // A superseded ruling is still in the log, so it is still required.
  keep(without('R-3'));
  fails(rec(), /leaves out R-3, a bar ruling in the decision log/, 'the superseded R-3');
  keep([...without('R-3'), why('R-3', 'superseded by R-7')]);
  passes(rec(), 'R-3 listed as superseded');
  keep([]);
  r = fails(rec(), /leaves out R-1, a bar ruling/, 'an empty list');
  eq((r.out.match(/leaves out (R-1|R-12|R-3|R-7), a bar ruling/g) || []).length, 4, `each log ruling named:\n${r.out}`);
  ok(!/leaves out P-1/.test(r.out), 'P-1 does not match the pattern');
  // An id not in the log is refused, even with the full set listed.
  for (const [extra, label] of [['R-99', 'an id only classes.md names'], ['R-2', 'an id named nowhere']]) {
    keep([...ALL, why(extra)]);
    r = fails(rec(), new RegExp(`entry 5 names ruling ${extra}, which is not in the decision log \\(.*decisions\\.md\\)`), label);
    ok(!/leaves out/.test(r.out), r.out);
  }
  // The shape: each entry a {"ruling", "why"} object, a whole ruling id, a non-empty why, listed once.
  for (const [list, re, label] of [
    [[...ALL, why('D-1')], /entry 5 has ruling "D-1", which is not a ruling id \(config "rulingIdPattern" \/R-\\d\+\/\)/, 'not a ruling id'],
    [[...ALL, why('R-3x')], /entry 5 has ruling "R-3x", which is not a ruling id/, 'not a whole ruling id'],
    [[...ALL, { why: 'no ruling' }], /entry 5 has ruling undefined, which is not a ruling id/, 'no ruling'],
    [[why('R-12', '  '), ...without('R-12')], /entry 1 \("R-12"\) has no "why" \(why that ruling does not cover A02\)/, 'an empty why'],
    [[{ ruling: 'R-12' }, ...without('R-12')], /entry 1 \("R-12"\) has no "why"/, 'no why'],
    [[...ALL, why('R-12', 'again')], /A02 "rulingsChecked" lists ruling R-12 twice/, 'a duplicate'],
    [['R-12', ...without('R-12')], /entry 1 \("R-12"\) is not a \{"ruling", "why"\} object/, 'a bare id'],
  ]) {
    keep(list);
    fails(rec(), re, label);
  }
  // Without "decisionLog" or "rulingIdPattern" there is nothing to check a list against: only [] is accepted.
  for (const [cfg, what] of [[base, 'config "decisionLog" and "rulingIdPattern" are not set'], [{ ...base, rulingIdPattern: 'R-\\d+' }, 'config "decisionLog" is not set'],
    [{ ...base, decisionLog: 'decisions.md' }, 'config "rulingIdPattern" is not set']]) {
    wj(cfgP, cfg);
    keep(ALL);
    fails(rec(), new RegExp(`A02 "rulingsChecked" lists 4 ruling\\(s\\), but ${what}, so there is nothing to check them against`), what);
    keep([]);
    r = passes(rec(), `${what}: an empty list`);
    ok(new RegExp(`INFO: confirmed\\.json: A02 "rulingsChecked" is \\[\\] and was not checked: ${what}`).test(r.out), r.out);
  }
  // Fail closed: a pattern that does not compile (even without "decisionLog"), a setting that is not a
  // non-empty string, a missing or unreadable log, or a pattern that matches no id in it.
  for (const [cfg, list, re, label] of [
    [{ ...base, rulingIdPattern: 'R-(' }, [], /A02 "rulingsChecked" cannot be checked: config "rulingIdPattern" does not compile/, 'a bad pattern, no log'],
    [{ ...LOG, rulingIdPattern: 'R-(' }, ALL, /cannot be checked: config "rulingIdPattern" does not compile/, 'a bad pattern'],
    [{ ...base, decisionLog: '  ' }, [], /cannot be checked: config "decisionLog" must be a non-empty string/, 'a blank decisionLog'],
    [{ ...base, decisionLog: true, rulingIdPattern: 'R-\\d+' }, [], /cannot be checked: config "decisionLog" must be a non-empty string/, 'a decisionLog that is no path'],
    [{ ...LOG, rulingIdPattern: '' }, [], /cannot be checked: config "rulingIdPattern" must be a non-empty string/, 'an empty pattern'],
    [{ ...LOG, decisionLog: 'missing.md' }, ALL, /cannot be checked: decision log not found: .*missing\.md/, 'a missing log'],
    [{ ...LOG, decisionLog: '.' }, ALL, /cannot be checked: decision log cannot be read: /, 'a log that is a folder'],
    [{ ...LOG, rulingIdPattern: 'Q-\\d+' }, [], /cannot be checked: rulingIdPattern \/Q-\\d\+\/ matched no ids in .*decisions\.md; nothing would be checked/, 'no id in the log'],
    [{ ...LOG, decisionLog: 'embedded.md' }, [], /cannot be checked: rulingIdPattern \/R-\\d\+\/ matched no ids in .*embedded\.md; nothing would be checked/, 'only embedded matches in the log'],
  ]) {
    wj(cfgP, cfg);
    keep(list);
    fails(rec(), re, label);
  }
});
test('record: countsAsZero honours ownerQuestionsBlock and defectsBlock (all four combinations)', () => {
  const S = baseCopy();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  wj(path.join(RD(S), 'confirmed.json'), { pending: [{ id: 'A09', pendingReason: 'rule-meaning' }], defects: ['A10'] });
  const zero = (o, d) => {
    wj(cfgP, { ...base, ...(o === undefined ? {} : { ownerQuestionsBlock: o }), ...(d === undefined ? {} : { defectsBlock: d }) });
    const r = passes(ltz(['record', S, 'u1', '1', ...READERS]));
    const m = rj(path.join(RD(S), 'measure.json'));
    return { z: m.countsAsZero, blockers: m.zeroBlockers.join('; '), rules: m.closeRules, out: r.out };
  };
  let x = zero(undefined, undefined);
  eq([x.z, x.rules], [false, { ownerQuestionsBlock: true, defectsBlock: false }], 'defaults: owner questions block, defects do not');
  ok(/pending-owner \(rule-meaning; ownerQuestionsBlock\)/.test(x.blockers) && !/defect/.test(x.blockers), x.blockers);
  eq(zero(true, false).z, false, 'questions block');
  x = zero(false, false);
  eq(x.z, true, 'neither blocks');
  ok(/counts as zero yes/.test(x.out), x.out);
  x = zero(false, true);
  eq([x.z, x.blockers], [false, '1 defect (defectsBlock)'], 'defects block');
  x = zero(true, true);
  eq([x.z, x.blockers], [false, '1 pending-owner (rule-meaning; ownerQuestionsBlock); 1 defect (defectsBlock)'], 'both block');
  wj(path.join(RD(S), 'confirmed.json'), {});
  wj(cfgP, { ...base, ownerQuestionsBlock: true, defectsBlock: true });
  passes(ltz(['record', S, 'u1', '1', ...READERS]));
  eq(rj(path.join(RD(S), 'measure.json')).countsAsZero, true, 'control: nothing pending, no defects');
  wj(cfgP, { ...base, defectsBlock: 'yes' });
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /"defectsBlock" must be true or false/);
});
test('record: foundBy "audit" (an outside finding no reader found) counts as found by none', () => {
  const S = baseCopy();
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, A08: { note: 'src/billing.js:7 per the 2026-10 audit', foundBy: 'audit' } });
  const r = passes(ltz(['record', S, 'u1', '1', ...READERS]));
  ok(!/WARNING: (?!.*share one text).*A08/.test(r.out), r.out);
  const m = rj(path.join(RD(S), 'measure.json'));
  eq([m.chunks.c2.foundByNone, m.chunks.c2.foundByAudit, m.chunks.c2.foundByAuditIds, m.total.foundByAudit], [1, 1, ['A08'], 1], 'audit finds counted as found by none');
  eq([m.chunks.c2.estimate.n1, m.chunks.c2.estimate.n2], [0, 0], 'not a reader find');
  eq(Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x])).A08.foundByWriter, 'audit', 'shown in the report');
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, A02: { ...CONFIRMED.A02, foundBy: 'audit' } });
  const r2 = passes(ltz(['record', S, 'u1', '1', ...READERS]));
  ok(/A02 has foundBy "audit", but c1-a, c1-b marked it wrong; counted as found by those readers/.test(r2.out), r2.out);
  eq(rj(path.join(RD(S), 'measure.json')).chunks.c1.foundByAudit, 0, 'a reader find is not an audit find');
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, A08: { note: 'src/billing.js:7', foundBy: 'hunch' } });
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /A08 has foundBy "hunch"; the accepted values are "sweep", "spot-check", "audit"/);
});
test('record: historyFolders extend the repeat check to another state folder (discovery)', () => {
  const S = baseCopy();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  wj(path.join(S, 'discovery', 'u1', 'r3', 'confirmed.json'), { A02: { note: 'src/auth.js:6', class: 'C2' } });
  passes(ltz(['record', S, 'u1', '1', ...READERS]), 'control: the history folder is not configured');
  fs.rmSync(path.join(RD(S), 'report.json'));
  wj(cfgP, { ...base, historyFolders: ['discovery'] });
  const r = fails(ltz(['record', S, 'u1', '1', ...READERS]), /A02 repeats discovery\/r3 \(class C2\)/, 'found in discovery, even at a higher round number');
  ok(!fs.existsSync(path.join(RD(S), 'report.json')), 'nothing written');
  wj(path.join(S, 'discovery', 'u1', 'r3', 'confirmed.json'), { A05: { note: 'docs/spec.md:8', class: 'U1' } });
  passes(ltz(['record', S, 'u1', '1', ...READERS]), 'control: no repeated id there');
  fs.rmSync(path.join(S, 'discovery', 'u1', 'r3', 'confirmed.json'));
  wj(path.join(S, 'discovery', 'u1', 'r0', 'confirmed.json'), { A02: { note: 'src/auth.js:6', class: 'C2' } });
  passes(ltz(['record', S, 'u1', '1', ...READERS]), 'r0 of a history folder does not count');
  wj(cfgP, { ...base, historyFolders: ['nope'] });
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /history folder nope not found/);
  wj(cfgP, { ...base, historyFolders: 'discovery' });
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /"historyFolders" must be an array/);
  ok(r.out.length > 0, 'output');
});
test('record: r0 (the cost-measurement read) is not an earlier round for the repeat check', () => {
  const S = baseCopy();
  wj(path.join(RD(S, 'u1', 0), 'confirmed.json'), { A02: { note: 'src/auth.js:6', class: 'C2' } });
  passes(ltz(['record', S, 'u1', '1', ...READERS]));
});
test('record: defects get verdict "defect"; not wrongs, not false alarms, not in the estimate', () => {
  const S = baseCopy();
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, defects: ['A09'] });
  passes(ltz(['record', S, 'u1', '1', ...READERS]));
  const rep = rj(path.join(RD(S), 'report.json'));
  const by = Object.fromEntries(rep.items.map((x) => [x.id, x]));
  eq(by.A09.verdict, 'defect', 'A09 is a defect');
  ok(/defect, for the owner/.test(by.A09.note), 'defect note');
  eq(rep.counts, { ok: 8, wrong: 3, 'pending-owner': 0, defect: 1, unread: 0, 'outside-bar': 0 }, 'counts');
  const c2 = rj(path.join(RD(S), 'measure.json')).chunks.c2;
  eq([c2.confirmed, c2.defects, c2.falseAlarms['c2-b'], c2.defectMarkedWrong['c2-b'], c2.estimate.n1, c2.estimate.n2], [1, 1, 0, 1, 0, 0], 'not a wrong, not a false alarm, not in the estimate');
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, defects: ['Z1'] });
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /defect id Z1 is not an item/);
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, defects: ['A02'] });
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /A02 is both confirmed wrong and a defect/);
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, defects: 'A09' });
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /"defects" must be an array of ids/);
});

// ---- canaries
const CANARIES = [
  { id: 'A13', unit: 'u1', kind: 'wrong', title: 'logout returns a session token', plan: 'keep as is', reason: 'per the source', cites: ['src/auth.js:9-10'] },
  { id: 'A14', unit: 'u1', kind: 'ok', title: 'the rate is a constant', plan: 'keep as is', reason: 'per the source', cites: ['src/billing.js:2'] },
];
test('canary add: validates and appends; collisions, shape and duplicates refused', () => {
  const S = makeS();
  snap(S);
  const f = path.join(path.dirname(S), 'canaries-in.jsonl');
  wjl(f, [{ ...CANARIES[0], id: 'A01' }]);
  fails(ltz(['canary', 'add', S, 'u1', '1', '--from', f]), /A01: collides with a real item id/);
  wjl(f, [{ ...CANARIES[0], reason: undefined }]);
  fails(ltz(['canary', 'add', S, 'u1', '1', '--from', f]), /differ from real items|missing item field "reason"/);
  wjl(f, CANARIES);
  passes(ltz(['canary', 'add', S, 'u1', '1', '--from', f]));
  eq(rjl(path.join(S, 'canaries.jsonl')).map((c) => c.id), ['A13', 'A14'], 'appended');
  fails(ltz(['canary', 'add', S, 'u1', '1', '--from', f]), /already in S\/canaries\.jsonl/);
  ok(!fs.readFileSync(path.join(S, 'items.jsonl'), 'utf8').includes('A13'), 'never written to items.jsonl');
});
test('canary gitignore: prints lines that really keep canary files and scratch folders out of git', () => {
  const S = makeS();
  const printed = (out) => out.split(/\r?\n/).filter((l) => l && !/^(?:canary gitignore:|PROBLEM:|WARNING:)/.test(l));
  const r = fails(ltz(['canary', 'gitignore', S]), /missing: canaries\.jsonl, \*\*\/canary-plan\.json, canaries-src\/, \*\*\/scratch\/ \(or any line git treats as ignoring every <unit>\/r<R>\/scratch\/ folder\)\).* -> FAIL/, 'no S/.gitignore: refused, naming what it lacks');
  const lines = printed(r.out);
  eq(lines, ['canaries.jsonl', '**/canary-plan.json', 'canaries-src/', '**/scratch/'], 'printed lines');
  // The canary checks are unchanged: exact lines, each named when missing.
  fs.writeFileSync(path.join(S, '.gitignore'), 'canaries.jsonl\n**/canary-plan.json\n**/scratch/\n');
  const partial = fails(ltz(['canary', 'gitignore', S]), /missing: canaries-src\/\)/, 'canaries-src/ missing on its own');
  ok(!/PROBLEM:/.test(partial.out), `the scratch folders are ignored:\n${partial.out}`);
  // Check them with git itself, in a temp repo that holds S/.
  const repo = path.dirname(S);
  const g = (args) => spawnSync('git', ['-C', repo, ...args], { env: GIT_ENV, encoding: 'utf8' });
  g(['init', '-q']);
  ok(samePath(g(['rev-parse', '--show-toplevel']).stdout.trim(), repo), 'temp repo is its own toplevel');
  fs.writeFileSync(path.join(S, '.gitignore'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(S, 'canaries.jsonl'), '{}\n');
  wj(path.join(RD(S), 'canary-plan.json'), {});
  wj(path.join(RD(S), 'report.json'), {});
  eq(g(['check-ignore', '-q', 'S/canaries.jsonl']).status, 0, 'canaries.jsonl ignored');
  eq(g(['check-ignore', '-q', 'S/u1/r1/canary-plan.json']).status, 0, 'canary-plan.json ignored');
  wjl(path.join(S, 'canaries-src', 'r1-batch.jsonl'), [{}]);
  eq(g(['check-ignore', '-q', 'S/canaries-src/r1-batch.jsonl']).status, 0, 'canaries-src/ ignored');
  fs.mkdirSync(path.join(RD(S), 'scratch', 'k7f2', 'copy'), { recursive: true });
  fs.writeFileSync(path.join(RD(S), 'scratch', 'k7f2', 'copy', '.env'), 'DB_PASSWORD=hunter2\n');
  eq(g(['check-ignore', '-q', 'S/u1/r1/scratch/k7f2/copy/.env']).status, 0, 'a probe copy in scratch/ ignored');
  eq(g(['check-ignore', '-q', 'S/u1/r1/report.json']).status, 1, 'control: report.json not ignored');
  const r2 = passes(ltz(['canary', 'gitignore', S]));
  ok(/all present\); the scratch folders and the canary files were checked by git check-ignore over \d+ paths/.test(r2.out), `all present once added:\n${r2.out}`);
  fails(ltz(['canary', 'gitignore', path.join(RUN, 'no-such-S')]), /state folder not found/);
});
test('canary gitignore: the scratch folders need a line git treats as ignoring every <unit>/r<R>/scratch/ folder', () => {
  const S = makeS(); // config units u1 and u2
  fs.mkdirSync(path.join(RD(S), 'scratch'), { recursive: true }); // u1/r1 on disk
  const CANARY = 'canaries.jsonl\n**/canary-plan.json\ncanaries-src/\n';
  const gi = (text) => {
    fs.writeFileSync(path.join(S, '.gitignore'), CANARY + text);
    return ltz(['canary', 'gitignore', S]);
  };
  const refused = (text, re, label) => {
    const r = fails(gi(text), /PROBLEM: .*does not ignore the readers' scratch folders/, label);
    ok(/missing: \*\*\/scratch\/ \(or any line git treats/.test(r.out) && !/missing: canaries/.test(r.out), `${label}: only the scratch line is missing:\n${r.out}`);
    if (re) ok(re.test(r.out), `${label}: expected ${re}:\n${r.out}`);
    return r;
  };
  let r = refused('', /not ignored: any-unit\/r1\/scratch\/, any-unit\/r12\/scratch\/, any-folder\/any-unit\/r1\/scratch\/, any-folder\/any-unit\/r12\/scratch\/, u1\/r1\/scratch\/, u1\/r12\/scratch\/, u2\/r1\/scratch\/, u2\/r12\/scratch\/; add the line \*\*\/scratch\//, 'no scratch line');
  // Any line git treats the same is accepted.
  for (const line of ['**/scratch/', 'scratch/', 'scratch', '**/scratch', '**/r*/scratch/', '**/scratch/**', '**/r[0-9]*/scratch/', '**/scratch/   ']) {
    r = passes(gi(`${line}\n`), `"${line}" ignores every scratch folder`);
    ok(/all present\); the scratch folders and the canary files were checked by git check-ignore/.test(r.out), r.out);
  }
  // Lines that leave some scratch folder (or some file in it) unignored are refused.
  refused('u1/r*/scratch/\nu2/r*/scratch/\n', /not ignored: any-unit\/r1\/scratch\/, any-unit\/r12\/scratch\/, any-folder\/any-unit\/r1\/scratch\/, any-folder\/any-unit\/r12\/scratch\/; /, 'only the configured units');
  // A line that reaches one level only misses a discovery state folder's rounds, on disk yet or not.
  refused('*/r*/scratch/\n', /not ignored: any-folder\/any-unit\/r1\/scratch\/, any-folder\/any-unit\/r12\/scratch\/; /, 'one level only');
  refused('*/r[0-9]*/scratch/\n', /not ignored: any-folder\/any-unit\/r1\/scratch\/, any-folder\/any-unit\/r12\/scratch\/; /, 'one level only, with a class');
  refused('/scratch/\n', /u1\/r1\/scratch\//, 'anchored at S/');
  refused('r*/scratch/\n', /u1\/r1\/scratch\//, 'anchored one level too high');
  refused('# **/scratch/\n', /u1\/r1\/scratch\//, 'a comment');
  refused('  **/scratch/\n', /u1\/r1\/scratch\//, 'leading spaces are part of the pattern');
  refused('**/scratch/\n!**/scratch/\n', /u1\/r1\/scratch\//, 'negated again');
  refused('**/scratch/**/*.txt\n', /u1\/r1\/scratch\/ \(partly: k7f2\/copy\/\.env, notes\.md not ignored\)/, 'only some files');
  refused('**/r1/scratch/\n', /u1\/r12\/scratch\//, 'one round');
  // A unit folder on disk that config.json does not list is probed too, with its rounds on disk.
  fs.mkdirSync(path.join(S, 'u9', 'r7'), { recursive: true });
  refused('**/r1/scratch/\n**/r12/scratch/\n', /not ignored: u9\/r7\/scratch\/; /, 'a round on disk (u9/r7)');
  fs.rmSync(path.join(S, 'u9'), { recursive: true });
  // A discovery state folder's rounds inside S/ are rounds too.
  fs.mkdirSync(path.join(S, 'discovery', 'u1', 'r3'), { recursive: true });
  refused('*/r*/scratch/\n', /not ignored: any-folder\/any-unit\/r1\/scratch\/, any-folder\/any-unit\/r12\/scratch\/, discovery\/u1\/r1\/scratch\/, discovery\/u1\/r12\/scratch\/, discovery\/u1\/r3\/scratch\/; /, 'discovery/<unit>/r<R>/scratch/');
  passes(gi('**/scratch/\n'), 'covers discovery too');
});
test('canary gitignore: only S/.gitignore counts, not a global excludes file or GIT_* variables', () => {
  const S = makeS();
  const CANARY = 'canaries.jsonl\n**/canary-plan.json\ncanaries-src/\n';
  fs.writeFileSync(path.join(S, '.gitignore'), CANARY);
  const home = path.join(path.dirname(S), 'home');
  fs.mkdirSync(path.join(home, 'xdg', 'git'), { recursive: true });
  fs.writeFileSync(path.join(home, 'xdg', 'git', 'ignore'), '**/scratch/\n'); // git's default global excludes file
  fs.mkdirSync(path.join(home, 'elsewhere'), { recursive: true });
  // Control: git itself honours that excludes file here.
  const repo = path.join(home, 'repo');
  fs.mkdirSync(path.join(repo, 'u1', 'r1', 'scratch'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'u1', 'r1', 'scratch', 'a.txt'), '');
  const genv = { ...GIT_ENV, XDG_CONFIG_HOME: path.join(home, 'xdg') };
  spawnSync('git', ['-C', repo, 'init', '-q'], { env: genv });
  eq(spawnSync('git', ['-C', repo, 'check-ignore', '-q', 'u1/r1/scratch/a.txt'], { env: genv }).status, 0, 'control: the global excludes file ignores scratch/');
  const env = { ...BASE_ENV, XDG_CONFIG_HOME: path.join(home, 'xdg'), GIT_WORK_TREE: path.join(home, 'elsewhere') };
  const run = () => {
    const r = spawnSync(process.execPath, [LTZ, 'canary', 'gitignore', S], { encoding: 'utf8', env, cwd: RUN });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };
  fails(run(), /PROBLEM: .*does not ignore the readers' scratch folders/, 'a global excludes file is not S/.gitignore');
  fs.writeFileSync(path.join(S, '.gitignore'), CANARY + '**/scratch/\n');
  passes(run(), 'S/.gitignore itself, with GIT_WORK_TREE set in the environment');
});
test('canary gitignore: without git, a glob match decides the same way', () => {
  const S = makeS();
  const CANARY = 'canaries.jsonl\n**/canary-plan.json\ncanaries-src/\n';
  // An environment where git cannot be found (node itself is run by its full path).
  const env = { ...BASE_ENV };
  for (const k of Object.keys(env)) if (/^path$/i.test(k)) delete env[k];
  const noGit = path.join(RUN, 'no-git-bin');
  fs.mkdirSync(noGit, { recursive: true });
  env.PATH = noGit;
  const run = (text) => {
    fs.writeFileSync(path.join(S, '.gitignore'), CANARY + text);
    const r = spawnSync(process.execPath, [LTZ, 'canary', 'gitignore', S], { encoding: 'utf8', env, cwd: RUN });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };
  let r = passes(run('**/scratch/\n'), 'glob: accepted');
  ok(/checked by glob match \(git not found\)/.test(r.out), r.out);
  r = fails(run('u1/r*/scratch/\n'), /not ignored: any-unit\/r1\/scratch\/, any-unit\/r12\/scratch\/, any-folder\/any-unit\/r1\/scratch\/, any-folder\/any-unit\/r12\/scratch\/, u2\/r1\/scratch\/, u2\/r12\/scratch\/; /, 'glob: one unit');
  ok(/checked by glob match \(git not found\)/.test(r.out), r.out);
  fails(run('**/scratch/\n!**/scratch/\n'), /u1\/r1\/scratch\//, 'glob: negated');
});
test('canary gitignore: the glob fallback agrees with git check-ignore', () => {
  const repo = path.join(RUN, 'glob-vs-git');
  fs.mkdirSync(repo, { recursive: true });
  const g = (args, input) => spawnSync('git', ['-C', repo, '-c', `core.excludesFile=${GITCFG.replace(/\\/g, '/')}`, ...args], { env: GIT_ENV, encoding: 'utf8', input });
  g(['init', '-q']);
  const PATHS = ['u1/r1/scratch/k7f2/probe.txt', 'u1/r12/scratch/k7f2/copy/.env', 'u2/r1/scratch/notes.md', 'discovery/u1/r3/scratch/c1-a/x.js',
    'scratch/top.txt', 'u1/r1/report.json', 'u1/r1/scratchpad/a.txt', 'u1/r1/my-scratch/a.txt', 'u1/r1/scratch.txt', 'a/b/c/scratch/d/e.txt', 'u1/r1/#scratch/a.txt', 'u1/r1/!scratch/a.txt'];
  for (const p of PATHS) {
    fs.mkdirSync(path.dirname(path.join(repo, p)), { recursive: true });
    fs.writeFileSync(path.join(repo, p), '');
  }
  const CASES = ['**/scratch/', 'scratch/', 'scratch', '**/scratch', '/scratch/', 'r*/scratch/', '*/r*/scratch/', '*/*/scratch/', 'u1/r*/scratch/', 'u1/**/scratch/',
    '**/r*/scratch/**', 'scratch/**', '**/scratch/*.txt', '**/scratch/*', '*', '**', 'u?/r1/scratch/', 'u[12]/r1/scratch/', 'u[!1]/r*/scratch/', 'u[^1]/r*/scratch/',
    '**/scratch/\n!**/scratch/', '**/scratch/*/*.txt\n!**/scratch/*/probe.txt', '**/scratch/\n!u1/r1/scratch/k7f2/probe.txt', 'scratch/\n!/u1/r1/scratch/', '# **/scratch/', '\\#scratch/',
    '\\!scratch/', 'scratch/   ', '  scratch/', 'scratch\\ ','*.json', 'r1/', '**/r1/**', 'u1/r1/scratch*', 'u1/r1/*scratch/', 'a/**/scratch/', 'a/**/d/', '**/c/**/e.txt', 'u1/r1/scratch.txt/', '[s]cratch/', '[a-r]1/', 'scratch[/',
    'r1?scratch/', '#scratch/', 'u1[,-0]r1/scratch/', 'u1/r1/scratch/**', '/**/scratch/'];
  const diff = [];
  for (const text of CASES) {
    fs.writeFileSync(path.join(repo, '.gitignore'), text + '\n');
    const r = g(['check-ignore', '--no-index', '-z', '--stdin'], PATHS.map((p) => p + '\0').join(''));
    ok(r.status === 0 || r.status === 1, `git check-ignore failed: ${r.stderr}`);
    const gitSays = new Set(r.stdout.split('\0').filter(Boolean));
    for (const p of PATHS) if (globIgnores(text + '\n', p) !== gitSays.has(p)) diff.push(`${JSON.stringify(text)} ${p}: git ${gitSays.has(p)}, glob ${!gitSays.has(p)}`);
  }
  eq(diff, [], 'glob and git disagree');
  // Sanity: the cases do discriminate.
  ok(globIgnores('**/scratch/\n', 'u1/r1/scratch/k7f2/probe.txt') && !globIgnores('/scratch/\n', 'u1/r1/scratch/k7f2/probe.txt'), 'control');
});
test('canary add/plan: remind that canary files are never committed', () => {
  const S = makeS();
  snap(S);
  const f = path.join(path.dirname(S), 'canaries-in.jsonl');
  wjl(f, CANARIES);
  const r = passes(ltz(['canary', 'add', S, 'u1', '1', '--from', f]));
  ok(/never commit S\/canaries\.jsonl/.test(r.out) && /node <skill>\/scripts\/ltz\.mjs canary gitignore/.test(r.out), r.out);
});
test('canary plan: K per slot, inside each range, deterministic by seed', () => {
  const plans = [];
  for (let i = 0; i < 2; i++) {
    const S = makeS();
    snap(S);
    wjl(path.join(S, 'canaries.jsonl'), CANARIES);
    passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
    passes(ltz(['canary', 'plan', S, 'u1', '1', '--per-slot', '2', '--seed', '7']));
    plans.push(rj(path.join(RD(S), 'canary-plan.json')));
    fails(ltz(['canary', 'plan', S, 'u1', '1', '--per-slot', '2', '--seed', '7']), /already exists/);
  }
  eq(plans[0], plans[1], 'same seed -> same plan');
  for (const [slot, list] of Object.entries(plans[0])) {
    eq(list.length, 2, `${slot} has 2`);
    const [lo, hi] = slot.startsWith('c1') ? [1, 6] : [7, 12];
    ok(list.every((e) => e.atPosition >= lo && e.atPosition <= hi), `${slot} positions in range`);
  }
});
test('canary: rendered like a real item; excluded from coverage and report; scored in measure', () => {
  const S = fullRound({
    beforeRead: (S2) => {
      wjl(path.join(S2, 'canaries.jsonl'), CANARIES);
      wj(path.join(RD(S2), 'canary-plan.json'), { 'c1-a': [{ canaryId: 'A13', atPosition: 2 }, { canaryId: 'A14', atPosition: 5 }] });
    },
    canaryLinesA: { 2: [{ unit: 'u1', id: 'A13', verdict: 'wrong', class: ['C2'], note: 'src/auth.js:10 returns null', cites: ['src/auth.js:9-10'] }] },
  });
  const w = fs.readFileSync(path.join(RD(S), 'w-c1-a-1.txt'), 'utf8');
  ok(w.indexOf('=== item A13 ===') > w.indexOf('=== item A01 ===') && w.indexOf('=== item A13 ===') < w.indexOf('=== item A02 ==='), 'inserted before position 2');
  ok(!/^kind:/m.test(w) && !/canary/i.test(w), 'no canary marker in the window');
  ok(!/canary/i.test(fs.readFileSync(path.join(RD(S), 'render-c1-a.jsonl'), 'utf8')), 'no canary marker in the render log');
  passes(ltz(['record', S, 'u1', '1', ...READERS]), 'a canary line is not a coverage problem; a missing canary line is not either');
  const rep = rj(path.join(RD(S), 'report.json'));
  ok(!rep.items.some((x) => x.id === 'A13' || x.id === 'A14'), 'canaries not in report.json');
  const sc = rj(path.join(RD(S), 'measure.json')).canaries['c1-a'];
  eq([sc.planted, sc.caught, sc.missed, sc.falseAlarms, sc.notJudged], [2, 1, 0, 0, 1], 'canary score');
  eq(rj(path.join(RD(S), 'measure.json')).chunks.c1.confirmed, 2, 'canary not in confirmed counts');
});
test('canary: a confirmed canary is a PROBLEM; an unplanned canary line is a PROBLEM', () => {
  const S = fullRound({
    beforeRead: (S2) => {
      wjl(path.join(S2, 'canaries.jsonl'), CANARIES);
      wj(path.join(RD(S2), 'canary-plan.json'), { 'c1-a': [{ canaryId: 'A13', atPosition: 2 }] });
    },
  });
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, A13: { note: 'src/auth.js:10' } });
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /A13 is a canary/);
  wj(path.join(RD(S), 'confirmed.json'), CONFIRMED);
  editJsonl(path.join(RD(S), 'agent-c1-b.jsonl'), (rows) => [...rows, { unit: 'u1', id: 'A13', verdict: 'ok', note: '', cites: [] }]);
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /c1-b: line 7 has id "A13", which is not in chunk c1/);
});

// ---- queue
function queued() {
  const S = makeS();
  snap(S);
  passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
  return S;
}
test('queue init: every chunk must be queued', () => {
  const S = makeS();
  snap(S);
  fails(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b']), /chunks with no readers: c2/);
  fails(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c9=x-a,x-b']), /c9, which is not in chunks\.json/);
  passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
  eq(rj(path.join(RD(S), 'queue.json')).slots.map((s) => [s.slot, s.from, s.to, s.state]),
    [['c1-a', 1, 6, 'queued'], ['c1-b', 1, 6, 'queued'], ['c2-a', 7, 12, 'queued'], ['c2-b', 7, 12, 'queued']], 'slots');
});
test('queue next: whole pairs within the cap; running and stopped jobs count', () => {
  const S = queued();
  let r = passes(ltz(['queue', S, 'u1', '1', 'next', '--cap', '2']));
  ok(/launch\s+c1-a/.test(r.out) && /launch\s+c1-b/.test(r.out) && !/c2-a/.test(r.out), `cap 2 -> c1 pair:\n${r.out}`);
  r = passes(ltz(['queue', S, 'u1', '1', 'next', '--cap', '3']));
  ok(!/launch\s+c2-a/.test(r.out), 'cap 3 does not split the c2 pair');
  fails(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'running']), /running needs --agent/);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'running', '--agent', 'ag1']));
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-b', 'running', '--agent', 'ag2']));
  r = passes(ltz(['queue', S, 'u1', '1', 'next', '--cap', '3']));
  ok(!/^launch/m.test(r.out) && /0 to launch/.test(r.out), `2 running + cap 3 leaves no room for a pair:\n${r.out}`);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'stopped-limit', '--reset', '2000-01-01T00:00:00Z']));
  r = passes(ltz(['queue', S, 'u1', '1', 'next', '--cap', '4']));
  ok(/continue c1-a \(agent ag1\)/.test(r.out) && /launch\s+c2-a/.test(r.out), `continue listed, then a pair:\n${r.out}`);
  fails(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'sleeping']), /state must be one of/);
});
test('queue mark --reset: only an ISO 8601 date and time (YYYY-MM-DDTHH:MM...) is stored; anything looser is refused with the form and an example', () => {
  const S = queued();
  const qp = path.join(RD(S), 'queue.json');
  const slot = () => rj(qp).slots.find((s) => s.slot === 'c1-a');
  const mark = (state, reset) => ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', state, ...(reset === undefined ? [] : ['--reset', reset])]);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'running', '--agent', 'ag1']));
  // A date or time that does not exist (Date.parse rolls a day past the month's end, and 24:00, into
  // the next day; it refuses an offset out of range): refused, and nothing is written.
  for (const bad of [
    '2026-11-31T03:00', '2026-02-30T03:00', '2026-02-29T03:00', '2100-02-29T03:00', '2026-04-31T03:00', '2026-11-00T03:00',
    '2026-00-10T03:00', '2026-11-10T24:00', '2026-11-10T03:60', '2026-11-10T03:00:60', '2026-11-10T03:00+24:00', '2026-11-10T03:00-23:60',
  ]) {
    const r = fails(mark('stopped-limit', bad), /--reset must be an ISO 8601 date and time, .*such as 2026-11-10T03:00.*an invalid date or time are refused/, `refused: ${bad}`);
    ok(r.out.includes(`got ${JSON.stringify(bad)}`), r.out);
    eq([slot().state, slot().reset], ['running', null], `nothing written for ${bad}`);
  }
  // A bare clock time, a date with no year (V8 reads it as 2001), a date with no time (read as UTC
  // midnight), a year with no month or day, an impossible date or hour, words, a lowercase t, a space
  // for the T, an offset without its colon, a one-digit hour, an extended year, a leading space: all
  // refused, and nothing is written. Date.parse reads several of these.
  for (const bad of [
    '03:00', 'Nov 10 03:00', '2026-11-10', '2026T03:00', '2026-13-40T03:00', '2026-11-10T25:00', 'tomorrow 3am', '2026-11-10t03:00',
    '2026-11-10 03:00', '2026-11-10T03:00+0100', '2026-11-10T3:00', '+002026-11-10T03:00', ' 2026-11-10T03:00',
  ]) {
    const r = fails(mark('stopped-limit', bad), /--reset must be an ISO 8601 date and time, YYYY-MM-DDTHH:MM\[:SS\[\.fff\]\]\[Z\|\+HH:MM\|-HH:MM\], such as 2026-11-10T03:00/, `refused: ${JSON.stringify(bad)}`);
    ok(r.out.includes(`got ${JSON.stringify(bad)}`), r.out);
    eq([slot().state, slot().reset], ['running', null], `nothing written for ${JSON.stringify(bad)}`);
  }
  for (const good of [
    '2026-11-10T03:00', '2026-11-10T03:00:30', '2026-11-10T03:00:30.250', '2026-11-10T03:00Z', '2026-11-10T03:00+01:00', '2026-11-10T03:00:30-05:30',
    '2028-02-29T03:00', '2000-02-29T03:00', '2026-12-31T23:59', '2026-01-31T00:00', '2026-11-30T23:59:59Z', '2026-11-10T03:00+23:59',
  ]) {
    passes(mark('stopped-limit', good), `accepted: ${good}`);
    eq([slot().state, slot().reset], ['stopped-limit', good], `stored as given: ${good}`);
    passes(mark('running'), 'back to running');
    eq(slot().reset, null, 'the reset is cleared');
  }
  passes(mark('stopped-limit', '2026-11-10T03:00'), 'the documented example');
  ok(/c1-a .*reset 2026-11-10T03:00/.test(passes(ltz(['queue', S, 'u1', '1', 'status'])).out), 'status shows it');
});
test('queue mark done: refused unless the result file covers the whole range', () => {
  const S = queued();
  reader(S, 'c1-a', 1, 5);
  const refusal = fails(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'done']), /refusing: c1-a does not cover its range 1-6 \(missing positions 6\).*stopped-context.*position 6/s);
  ok(/node <skill>\/scripts\/ltz\.mjs queue .* u1 1 mark c1-a stopped-context/.test(refusal.out), `full command form:\n${refusal.out}`);
  const st = passes(ltz(['queue', S, 'u1', '1', 'status']));
  ok(/c1-a .*lines 5\s+resume 6/.test(st.out), `status shows resume 6:\n${st.out}`);
  // Six lines (A01 A02 A03 A03 A05 A06): one duplicated, one missing. A line count would pass this.
  editJsonl(path.join(RD(S), 'agent-c1-a.jsonl'), (rows) => [rows[0], rows[1], rows[2], rows[2], rows[4], { ...rows[4], id: 'A06' }]);
  eq(rjl(path.join(RD(S), 'agent-c1-a.jsonl')).length, 6, 'six lines');
  fails(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'done']), /missing positions 4; duplicate positions 3/);
  reader(S, 'c1-a', 1, 6);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'done']), 'control: complete file');
});

test('queue dropped-by-owner: needs --ruling, only for a partly read slot; recorded and shown', () => {
  const S = queued();
  reader(S, 'c1-a', 1, 4);
  fails(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'dropped-by-owner']), /dropped-by-owner needs --ruling <id>/);
  fails(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'done', '--ruling', 'D-9']), /--ruling goes only with dropped-by-owner/);
  const r = passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'dropped-by-owner', '--ruling', 'D-9']));
  ok(/positions 5-6 dropped by decision D-9; the chunk is not full depth/.test(r.out), r.out);
  eq(rj(path.join(RD(S), 'queue.json')).slots.find((s) => s.slot === 'c1-a').dropped, { from: 5, to: 6, ruling: 'D-9' }, 'dropped range');
  ok(/c1-a .*dropped-by-owner .*dropped 5-6 \(decision D-9\)/.test(passes(ltz(['queue', S, 'u1', '1', 'status'])).out), 'status shows it');
  const n = passes(ltz(['queue', S, 'u1', '1', 'next', '--cap', '2']));
  ok(/0 active/.test(n.out), `a dropped job is not active:\n${n.out}`);
  reader(S, 'c1-b', 1, 6);
  fails(ltz(['queue', S, 'u1', '1', 'mark', 'c1-b', 'dropped-by-owner', '--ruling', 'D-9']), /already covers its whole range 1-6; mark it done/);
});
test('record: a chunk with an owner-dropped range is not full depth and the round cannot count as a zero', () => {
  const S = baseCopy();
  wj(path.join(RD(S), 'confirmed.json'), {});
  passes(ltz(['record', S, 'u1', '1', ...READERS]), 'control: full depth');
  let m = rj(path.join(RD(S), 'measure.json'));
  eq([m.fullDepth, m.countsAsZero, m.chunks.c1.fullDepth], [true, true, true], 'full depth, nothing confirmed: counts as a zero');
  editJsonl(path.join(RD(S), 'agent-c1-b.jsonl'), (rows) => rows.filter((x) => x.id !== 'A05' && x.id !== 'A06'));
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /c1-b: positions not covered: 5-6/, 'control: a short file without a drop is a coverage problem');
  passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-b', 'dropped-by-owner', '--ruling', 'D-9']));
  const r = passes(ltz(['record', S, 'u1', '1', ...READERS]));
  ok(/WARNING: not full depth: chunk\(s\) c1/.test(r.out) && /full depth NO, counts as zero no/.test(r.out), r.out);
  m = rj(path.join(RD(S), 'measure.json'));
  eq([m.fullDepth, m.countsAsZero, m.chunks.c1.fullDepth, m.chunks.c2.fullDepth], [false, false, false, true], 'not full depth');
  eq(m.chunks.c1.droppedRanges, [{ slot: 'c1-b', from: 5, to: 6, ruling: 'D-9' }], 'dropped range in measure.json');
  let by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq([by.A05.verdict, by.A05.readers['c1-b'].dropped], ['ok', true], 'A05 read by c1-a only');
  // One slot's drop excuses only that slot's range.
  const c2a = path.join(RD(S), 'agent-c2-a.jsonl');
  const keep = fs.readFileSync(c2a, 'utf8');
  editJsonl(c2a, (rows) => rows.filter((x) => x.id !== 'A12'));
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /c2-a: positions not covered: 12/, 'another slot\'s gap is still a problem');
  fs.writeFileSync(c2a, keep);
  // Both readers dropped A06: it is unread, never ok.
  editJsonl(path.join(RD(S), 'agent-c1-a.jsonl'), (rows) => rows.filter((x) => x.id !== 'A06'));
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'dropped-by-owner', '--ruling', 'D-9']));
  passes(ltz(['record', S, 'u1', '1', ...READERS]));
  const rep = rj(path.join(RD(S), 'report.json'));
  by = Object.fromEntries(rep.items.map((x) => [x.id, x]));
  eq([by.A06.verdict, rep.counts.unread, rep.countsAsZero], ['unread', 1, false], 'unread, not ok');
});

test('r0: snapshot writes a one-window list; queue init, mark done and record work; round 0 can close', () => {
  const S = makeS();
  const r = passes(ltz(['snapshot', S, 'u1', '0']));
  ok(/r0 \(cost measurement\): list and chunk hold the first window only \(3 items\)/.test(r.out), r.out);
  const rd = RD(S, 'u1', 0);
  eq(rj(path.join(rd, 'list.json')), ['A01', 'A02', 'A03'], 'one window (windowSize 3)');
  eq(rj(path.join(rd, 'chunks.json')), { c1: { from: 1, to: 3 } }, 'one chunk');
  eq(rjl(path.join(rd, 'snapshot.jsonl')).length, 12, 'the snapshot keeps the whole unit');
  passes(ltz(['queue', S, 'u1', '0', 'init', '--pairs', 'c1=r0-a']));
  passes(ltz(['render', S, 'u1', '0', 'r0-a', '1', '3']));
  fails(ltz(['render', S, 'u1', '0', 'r0-a', '4', '1']), /outside the list \(1-3/, 'nothing past the window');
  const byId = new Map(rjl(path.join(rd, 'snapshot.jsonl')).map((x) => [x.id, x]));
  wjl(path.join(rd, 'agent-r0-a.jsonl'), ['A01', 'A02'].map((id) => ({ unit: 'u1', id, verdict: 'ok', note: 'holds', cites: byId.get(id).cites })));
  fails(ltz(['queue', S, 'u1', '0', 'mark', 'r0-a', 'done']), /missing positions 3/, 'done still needs the whole window');
  wjl(path.join(rd, 'agent-r0-a.jsonl'), ['A01', 'A02', 'A03'].map((id) => ({ unit: 'u1', id, verdict: 'ok', note: 'holds', cites: byId.get(id).cites })));
  passes(ltz(['queue', S, 'u1', '0', 'mark', 'r0-a', 'done']));
  wj(path.join(rd, 'confirmed.json'), {});
  const rec = passes(ltz(['record', S, 'u1', '0', '--chunk-readers', 'c1=r0-a']));
  eq(rj(path.join(rd, 'report.json')).items.length, 3, 'r0 report covers the window');
  const m = rj(path.join(rd, 'measure.json'));
  eq([m.fullDepth, m.fullPass, m.countsAsZero], [true, false, false], 'one window read in full, but never a zero');
  ok(m.zeroBlockers.includes('r0 / partial list: not a full pass (3 of 12 items listed)'), m.zeroBlockers.join('; '));
  ok(/counts as zero no \(r0 \/ partial list/.test(rec.out), rec.out);
});
test('r0: a finished or abandoned r0 no longer blocks item commits', () => {
  const { S, repo, g, env } = guardRepo();
  wj(path.join(RD(S), 'queue.json'), { groups: [], slots: [{ slot: 'c1-a', state: 'done' }] });
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'edit\n');
  g(['add', 'docs/spec.md']);
  passes(ltz(['snapshot', S, 'u1', '0']));
  passes(ltz(['queue', S, 'u1', '0', 'init', '--pairs', 'c1=r0-a']));
  const r = guard(bash('git commit -m x'), { env, cwd: repo });
  eq(r.code, 2, 'an r0 left queued blocks');
  ok(/u1\/r0 r0-a \(queued\)/.test(r.out), r.out);
  passes(ltz(['queue', S, 'u1', '0', 'mark', 'r0-a', 'replaced']), 'close the abandoned r0 slot');
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 0, 'closed: allowed');
});
test('r0: a finished r0 (read and marked done) no longer blocks item commits', () => {
  const { S, repo, g, env } = guardRepo();
  wj(path.join(RD(S), 'queue.json'), { groups: [], slots: [{ slot: 'c1-a', state: 'done' }] });
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'edit\n');
  g(['add', 'docs/spec.md']);
  passes(ltz(['snapshot', S, 'u1', '0']));
  passes(ltz(['queue', S, 'u1', '0', 'init', '--pairs', 'c1=r0-a']));
  passes(ltz(['queue', S, 'u1', '0', 'mark', 'r0-a', 'running', '--agent', 'r0-agent']));
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 2, 'r0 still reading: blocked');
  passes(ltz(['render', S, 'u1', '0', 'r0-a', '1', '3']));
  const rd0 = RD(S, 'u1', 0);
  const byId = new Map(rjl(path.join(rd0, 'snapshot.jsonl')).map((x) => [x.id, x]));
  wjl(path.join(rd0, 'agent-r0-a.jsonl'), ['A01', 'A02', 'A03'].map((id) => ({ unit: 'u1', id, verdict: 'ok', note: 'holds', cites: byId.get(id).cites })));
  passes(ltz(['queue', S, 'u1', '0', 'mark', 'r0-a', 'done']));
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 0, 'r0 done: allowed');
});
test('queue replace: a fresh agent on the same slot after an account change; the slot stays open', () => {
  const S = queued();
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'running', '--agent', 'ag1']));
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'stopped-limit']));
  reader(S, 'c1-a', 1, 3);
  // FROM comes from status (the slot's resume position), before the fresh agent is launched.
  ok(/c1-a\s+chunk c1 1-6\s+stopped-limit\s+agent ag1\s+lines 3\s+resume 4/.test(passes(ltz(['queue', S, 'u1', '1', 'status'])).out), 'status gives FROM');
  fails(ltz(['queue', S, 'u1', '1', 'replace', 'c1-a']), /replace needs --agent <newId>/);
  let r = fails(ltz(['queue', S, 'u1', '1', 'replace', 'c1-a', '--agent', 'ag2', '--from', '2']), /resumes at position 4; earlier positions would be judged twice \(unless the new agent has already written positions 2-3: check its lines, then replace without --from\)/);
  r = fails(ltz(['queue', S, 'u1', '1', 'replace', 'c1-a', '--agent', 'ag2', '--from', '5']), /resumes at position 4; positions would be skipped/);
  ok(!/unless the new agent/.test(r.out), r.out);
  r = passes(ltz(['queue', S, 'u1', '1', 'replace', 'c1-a', '--agent', 'ag2', '--from', '4']));
  ok(/agent ag2 reads c1-a from position 4 \("continue from position 4"\), as launched/.test(r.out) && /stopped-limit -> running with agent ag2; earlier agents: ag1/.test(r.out), r.out);
  ok(!/launch the new agent/.test(r.out), `the agent is already launched:\n${r.out}`);
  let e = rj(path.join(RD(S), 'queue.json')).slots.find((s) => s.slot === 'c1-a');
  eq([e.state, e.agent, e.agentHistory.map((h) => h.agent)], ['running', 'ag2', ['ag1']], 'open, new agent, old agent in history');
  r = passes(ltz(['queue', S, 'u1', '1', 'replace', 'c1-a', '--agent', 'ag3']));
  ok(/agent ag3 reads c1-a; it must have been launched with the slot's brief and "continue from position 4" .*pass --from to have that checked/.test(r.out), r.out);
  e = rj(path.join(RD(S), 'queue.json')).slots.find((s) => s.slot === 'c1-a');
  eq(e.agentHistory.map((h) => h.agent), ['ag1', 'ag2'], 'history grows');
  ok(/earlier agents ag1, ag2/.test(passes(ltz(['queue', S, 'u1', '1', 'status'])).out), 'status shows them');
  reader(S, 'c1-a', 1, 6);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'done']));
  fails(ltz(['queue', S, 'u1', '1', 'replace', 'c1-a', '--agent', 'ag4']), /c1-a is done; nothing is left to read/);
});

// ---- round 6: pending reasons, foundBy, fix checker, reruns, opaque names, transcripts
test('record: every pending id needs a pendingReason; boundary-silent and ruled-wording always block a zero', () => {
  const S = baseCopy();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  const conf = path.join(RD(S), 'confirmed.json');
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  wj(conf, { pending: ['A09'] });
  fails(rec(), /pending id A09 has no "pendingReason"; write \{"id": "A09", "pendingReason": "rule-meaning\|boundary-silent\|ruled-wording"\}/, 'a bare id');
  ok(!fs.existsSync(path.join(RD(S), 'report.json')), 'nothing written');
  wj(conf, { pending: [{ id: 'A09' }] });
  fails(rec(), /pending id A09 has no "pendingReason"/, 'an entry without one');
  wj(conf, { pending: [{ id: 'A09', pendingReason: 'unsure' }] });
  fails(rec(), /pending id A09 has pendingReason "unsure"; the accepted values are "rule-meaning", "boundary-silent", "ruled-wording"/);
  wj(conf, { pending: [{ reason: 'rule-meaning' }] });
  fails(rec(), /"pending" must be an array of \{"id", "pendingReason"\} entries/);
  const zero = (reason, o) => {
    wj(cfgP, { ...base, ...(o === undefined ? {} : { ownerQuestionsBlock: o }) });
    wj(conf, { pending: [{ id: 'A09', pendingReason: reason, question: 'does the boundary cover config files?' }] });
    passes(rec(), reason);
    return rj(path.join(RD(S), 'measure.json'));
  };
  let m = zero('rule-meaning', false);
  eq([m.countsAsZero, m.zeroBlockers, m.total.pendingByReason], [true, [], { 'rule-meaning': 1, 'boundary-silent': 0, 'ruled-wording': 0 }], 'rule-meaning: ownerQuestionsBlock false lets it close');
  m = zero('rule-meaning', undefined);
  eq([m.countsAsZero, m.zeroBlockers], [false, ['1 pending-owner (rule-meaning; ownerQuestionsBlock)']], 'rule-meaning: blocks by default');
  for (const k of ['boundary-silent', 'ruled-wording']) {
    m = zero(k, false);
    eq([m.countsAsZero, m.zeroBlockers], [false, [`1 pending-owner (${k}: the evidence refutes it, so it always blocks)`]], `${k} blocks even with ownerQuestionsBlock false`);
    eq(m.total.pendingByReason[k], 1, `${k} counted`);
  }
  const by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq([by.A09.verdict, by.A09.pendingReason], ['pending-owner', 'ruled-wording'], 'the report carries the reason');
  ok(/^pending owner question \(ruled-wording\)/.test(by.A09.note), by.A09.note);
  // An earlier round written before pending reasons is still read by the repeat check.
  asRound2(S);
  wj(path.join(RD(S, 'u1', 1), 'confirmed.json'), { pending: ['A05'], A02: { note: 'src/auth.js:6', class: 'C2' } });
  wj(cfgP, base);
  wj(path.join(RD(S, 'u1', 2), 'confirmed.json'), CONFIRMED);
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /A02 repeats r1 \(class C2\)/, 'an earlier round with bare pending ids is still read');
});
test('record: foundBy "fixcheck" and "extract" count as found by none; any foundBy a reader also marked warns', () => {
  const S = baseCopy();
  const conf = path.join(RD(S), 'confirmed.json');
  wj(conf, { ...CONFIRMED, A08: { note: 'src/billing.js:7', foundBy: 'fixcheck' }, A10: { note: 'config/app.json:3', foundBy: 'extract' } });
  const r = passes(ltz(['record', S, 'u1', '1', ...READERS]));
  ok(!/WARNING: (?!.*share one text).*(A08|A10)/.test(r.out), r.out);
  const m = rj(path.join(RD(S), 'measure.json'));
  eq([m.chunks.c2.foundByNone, m.chunks.c2.foundByNoneBy, m.total.foundByNoneBy, m.chunks.c2.foundByAudit], [2, { fixcheck: 1, extract: 1 }, { fixcheck: 1, extract: 1 }, 0], 'found by none, counted per kind');
  eq([m.chunks.c2.estimate.n1, m.chunks.c2.estimate.n2], [0, 0], 'not reader finds');
  wj(conf, { ...CONFIRMED, A02: { ...CONFIRMED.A02, foundBy: 'sweep' } });
  const r2 = passes(ltz(['record', S, 'u1', '1', ...READERS]));
  ok(/A02 has foundBy "sweep", but c1-a, c1-b marked it wrong; counted as found by those readers/.test(r2.out), r2.out);
  wj(conf, { ...CONFIRMED, A08: { note: 'src/billing.js:7' } });
  ok(/A08 was found by no reader; say how \("foundBy": "sweep", "spot-check", "audit", "fixcheck", "extract"\)/.test(passes(ltz(['record', S, 'u1', '1', ...READERS])).out), 'the warning lists every value');
});
test('record: measure.json.fixChecker reports the items checked and the wrongs per fix-check iteration', () => {
  const S = baseCopy();
  const rd = RD(S);
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  passes(rec());
  eq(rj(path.join(rd, 'measure.json')).fixChecker, [], 'none yet is normal');
  wjl(path.join(rd, 'fixcheck-1-c1-input.jsonl'), [ITEMS[0], ITEMS[1], ITEMS[2]]);
  wjl(path.join(rd, 'fixcheck-1-c1.jsonl'), [{ id: 'A01', verdict: 'ok' }, { id: 'A02', verdict: 'wrong', note: 'src/auth.js:6' }]);
  wjl(path.join(rd, 'fixcheck-1-c2.jsonl'), [{ id: 'A07', verdict: 'wrong', note: 'src/billing.js:3' }]);
  wjl(path.join(rd, 'fixcheck-2-c1.jsonl'), [{ id: 'A02', verdict: 'ok' }]);
  wjl(path.join(rd, 'fixcheck-2-c2-input.jsonl'), [ITEMS[6]]);
  const r = passes(rec());
  ok(/fix checker #1: 3 checked, 2 wrong, #2: 1 checked, 0 wrong/.test(r.out), r.out);
  ok(/WARNING: fix checker 1, part c1: 1 input item\(s\) not judged \(A03\)/.test(r.out), r.out);
  const fc = rj(path.join(rd, 'measure.json')).fixChecker;
  eq(fc.map((x) => [x.iteration, x.itemsChecked, x.wrongs, x.wrongIds, x.notJudged]), [[1, 3, 2, ['A02', 'A07'], ['A03']], [2, 1, 0, [], []]], 'per iteration');
  eq(fc[0].chunks.c1, { itemsChecked: 2, wrongs: 1, wrongIds: ['A02'], inputItems: 3, notJudged: ['A03'] }, 'per chunk, with its input');
  eq(fc[1].chunks.c2, { itemsChecked: 0, wrongs: 0, wrongIds: [], inputItems: 1, notRun: true }, 'an input with no results yet');
  // Fix-checker wrongs never enter countsAsZero.
  wj(path.join(rd, 'confirmed.json'), {});
  passes(rec());
  eq(rj(path.join(rd, 'measure.json')).countsAsZero, true, 'fix-checker finds do not block');
  wjl(path.join(rd, 'fixcheck-2-c1.jsonl'), [{ id: 'A02', verdict: 'maybe' }]);
  fails(rec(), /fixcheck-2-c1\.jsonl: line 1 \(A02\): verdict must be "ok" or "wrong"/);
  wjl(path.join(rd, 'fixcheck-2-c1.jsonl'), [{ verdict: 'ok' }]);
  fails(rec(), /fixcheck-2-c1\.jsonl: line 1 has no "id"/);
  wjl(path.join(rd, 'fixcheck-2-c1.jsonl'), [{ id: 'A02', verdict: 'ok' }]);
  fs.writeFileSync(path.join(rd, 'fixcheck-x.jsonl'), '');
  fails(rec(), /fixcheck-x\.jsonl: a fix-checker file is named fixcheck-<K>-<part>\.jsonl/);
});

const rerunsOf = (S, parent) => rj(path.join(RD(S), 'queue.json')).slots.filter((s) => s.parent === parent);
test('queue rerun: a new opaque slot for a range of its parent; refused outside it or for a rerun', () => {
  const S = queued();
  fails(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '5', '--to', '8']), /refusing: 5-8 is not inside c1-a's range 1-6/);
  fails(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '3', '--to', '2']), /--from 3 is after --to 2/);
  fails(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '3']), /rerun needs --from P --to Q/);
  fails(ltz(['queue', S, 'u1', '1', 'rerun', 'zz-9', '--from', '1', '--to', '2']), /slot zz-9 is not in queue\.json/);
  const r = passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '2', '--to', '5']));
  const [x] = rerunsOf(S, 'c1-a');
  ok(/^[a-z][a-z0-9]{3}$/.test(x.slot) && !/c1|-a/.test(x.slot), `an opaque name: ${x.slot}`);
  eq([x.chunk, x.from, x.to, x.state], ['c1', 2, 5, 'queued'], 'the rerun slot');
  ok(new RegExp(`slot ${x.slot}, FROM = 2, 4 items`).test(r.out), r.out);
  fails(ltz(['queue', S, 'u1', '1', 'rerun', x.slot, '--from', '2', '--to', '3']), new RegExp(`${x.slot} is itself a rerun of c1-a; rerun c1-a instead`));
  ok(new RegExp(`${x.slot} .*queued .*rerun of c1-a`).test(passes(ltz(['queue', S, 'u1', '1', 'status'])).out), 'status shows the parent');
  // next launches a queued rerun on its own; it counts against the cap.
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'running', '--agent', 'a1']));
  let n = passes(ltz(['queue', S, 'u1', '1', 'next', '--cap', '2']));
  ok(/launch\s+c1-b/.test(n.out) && !new RegExp(`launch\\s+${x.slot}`).test(n.out), `a half-launched pair first:\n${n.out}`);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-b', 'running', '--agent', 'b1']));
  n = passes(ltz(['queue', S, 'u1', '1', 'next', '--cap', '3']));
  ok(new RegExp(`launch\\s+${x.slot} \\(rerun of c1-a, chunk c1, positions 2-5\\)`).test(n.out) && !/launch\s+c2-a/.test(n.out), `then the rerun, on its own:\n${n.out}`);
  passes(ltz(['queue', S, 'u1', '1', 'mark', x.slot, 'running', '--agent', 'a2']));
  n = passes(ltz(['queue', S, 'u1', '1', 'next', '--cap', '4']));
  ok(!/^launch/m.test(n.out), `a running rerun takes a place under the cap (3 running, cap 4: no room for a pair):\n${n.out}`);
  // mark done checks the rerun's own range.
  reader(S, x.slot, 2, 4);
  fails(ltz(['queue', S, 'u1', '1', 'mark', x.slot, 'done']), new RegExp(`${x.slot} does not cover its range 2-5 \\(missing positions 5\\)`));
  reader(S, x.slot, 2, 5);
  passes(ltz(['queue', S, 'u1', '1', 'mark', x.slot, 'done']));
});
test('record: a rerun\'s lines replace its parent\'s for its range (the latest wins), checked against its own render log', () => {
  const S = baseCopy();
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, rejected: [{ id: 'A09', note: 'config/app.json:2 holds; fixture dismissal' }, { id: 'A04', note: 'src/billing.js:2 holds 0.2 as the item says; fixture dismissal' }] });
  const rec = (extra = READERS) => ltz(['record', S, 'u1', '1', ...extra]);
  passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '2', '--to', '5']));
  const [x1] = rerunsOf(S, 'c1-a');
  fails(rec(), new RegExp(`${x1.slot} \\(rerun of c1-a\\): result file is missing .*; it supplies positions 2-5`), 'a queued rerun is used, so its file must exist');
  reader(S, x1.slot, 2, 5, {
    A03: { verdict: 'wrong', note: 'src/auth.js:10 returns null only', class: ['U1'] },
    A04: { verdict: 'wrong', note: 'src/billing.js:2 holds 0.2', class: ['C2'] },
  });
  const r = passes(rec());
  ok(new RegExp(`1 rerun\\(s\\) merged \\(${x1.slot} for c1-a 2-5\\)`).test(r.out), r.out);
  let m = rj(path.join(RD(S), 'measure.json'));
  eq(m.reruns, [{ slot: x1.slot, parent: 'c1-a', chunk: 'c1', from: 2, to: 5, state: 'queued', positionsTaken: 4 }], 'measure notes the rerun and its parent');
  eq(m.chunks.c1.reruns.length, 1, 'and per chunk');
  eq([m.chunks.c1.foundBy['c1-a'], m.chunks.c1.falseAlarmIds['c1-a']], [1, ['A04']], 'the merged reader: A02 ok now, A03 and A04 wrong');
  let by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq(by.A02.readers['c1-a'], { verdict: 'ok', class: [], note: 'holds at the pin', rerun: x1.slot }, 'from the rerun');
  ok(by.A01.readers['c1-a'].rerun === undefined && by.A06.readers['c1-a'].rerun === undefined, 'outside the rerun: the parent');
  // Checked against the rerun's own render log, not the parent's (c1-a rendered A01's src/auth.js:3).
  const xf = path.join(RD(S), `agent-${x1.slot}.jsonl`);
  const keep = fs.readFileSync(xf, 'utf8');
  editJsonl(xf, (rows) => rows.map((x) => (x.id === 'A04' ? { ...x, cites: ['src/auth.js:3'] } : x)));
  fails(rec(), new RegExp(`${x1.slot} \\(rerun of c1-a\\): A04 \\(line 3\\): cites src/auth\\.js:3, which is not in its render log`));
  fs.writeFileSync(xf, keep);
  // The parent's lines inside the rerun range are not needed; outside it they are.
  const pf = path.join(RD(S), 'agent-c1-a.jsonl');
  const keepP = fs.readFileSync(pf, 'utf8');
  editJsonl(pf, (rows) => rows.filter((x) => x.id !== 'A03'));
  passes(rec(), 'position 3 comes from the rerun');
  editJsonl(pf, (rows) => rows.filter((x) => x.id !== 'A06'));
  fails(rec(), /c1-a: positions not covered: 6 \(ids A06\)/, 'position 6 still comes from the parent');
  fs.writeFileSync(pf, keepP);
  editJsonl(xf, (rows) => [...rows, { unit: 'u1', id: 'A06', verdict: 'ok', note: '', cites: [] }]);
  fails(rec(), new RegExp(`${x1.slot} \\(rerun of c1-a\\): line 5 has id "A06", which is not in its rerun range \\(positions 2-5\\)`));
  fs.writeFileSync(xf, keep);
  // A second, overlapping rerun wins where they overlap.
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '4', '--to', '6']));
  const x2 = rerunsOf(S, 'c1-a')[1];
  reader(S, x2.slot, 4, 6);
  passes(rec());
  m = rj(path.join(RD(S), 'measure.json'));
  eq(m.reruns.map((x) => [x.slot, x.positionsTaken]), [[x1.slot, 2], [x2.slot, 3]], 'the later rerun takes 4-6');
  by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq([by.A03.readers['c1-a'].rerun, by.A04.readers['c1-a'].rerun, by.A04.readers['c1-a'].verdict], [x1.slot, x2.slot, 'ok'], 'latest wins');
  editJsonl(xf, (rows) => rows.filter((x) => x.id !== 'A04'));
  passes(rec(), 'the earlier rerun\'s superseded lines are not needed');
  fs.writeFileSync(xf, keep);
  // A replaced (abandoned) rerun is not used.
  passes(ltz(['queue', S, 'u1', '1', 'mark', x2.slot, 'replaced']));
  passes(rec());
  by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq([by.A04.readers['c1-a'].rerun, by.A04.readers['c1-a'].verdict], [x1.slot, 'wrong'], 'back to the first rerun');
  fails(rec(['--chunk-readers', `c1=c1-a,${x1.slot}`, 'c2=c2-a,c2-b']), new RegExp(`slot ${x1.slot} is a rerun of c1-a; name c1-a in --chunk-readers`));
});
test('record: a rerun of an owner-dropped tail restores full depth; a dropped rerun is not full depth', () => {
  const S = baseCopy();
  wj(path.join(RD(S), 'confirmed.json'), {});
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
  editJsonl(path.join(RD(S), 'agent-c1-b.jsonl'), (rows) => rows.filter((x) => x.id !== 'A05' && x.id !== 'A06'));
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-b', 'dropped-by-owner', '--ruling', 'P-3']));
  passes(rec());
  eq(rj(path.join(RD(S), 'measure.json')).chunks.c1.fullDepth, false, 'control: dropped');
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-b', '--from', '5', '--to', '6']));
  const [x] = rerunsOf(S, 'c1-b');
  reader(S, x.slot, 5, 6);
  passes(rec());
  let m = rj(path.join(RD(S), 'measure.json'));
  eq([m.chunks.c1.fullDepth, m.chunks.c1.droppedRanges, m.countsAsZero], [true, [], true], 'the rerun read the dropped tail');
  // A rerun the owner dropped part of: its tail is excused, and the chunk is not full depth.
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c2-a', '--from', '9', '--to', '12']));
  const [y] = rerunsOf(S, 'c2-a');
  reader(S, y.slot, 9, 10);
  fails(rec(), new RegExp(`${y.slot} \\(rerun of c2-a\\): positions not covered: 11-12`), 'control: a short rerun file');
  passes(ltz(['queue', S, 'u1', '1', 'mark', y.slot, 'dropped-by-owner', '--ruling', 'P-4']));
  passes(rec());
  m = rj(path.join(RD(S), 'measure.json'));
  eq([m.chunks.c2.fullDepth, m.chunks.c2.droppedRanges], [false, [{ slot: y.slot, from: 11, to: 12, ruling: 'P-4', rerunOf: 'c2-a' }]], 'a dropped rerun');
  const by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((z) => [z.id, z]));
  eq(by.A11.readers['c2-a'], { verdict: null, dropped: true, ruling: 'P-4', rerun: y.slot }, 'shown as dropped by the rerun');
});
test('queue init --opaque: short random slot names, two per chunk by default; record accepts them', () => {
  const S = baseCopy();
  fails(ltz(['queue', S, 'u1', '1', 'init', '--opaque', '--pairs', 'c1=a,b']), /give --opaque or --pairs, not both/);
  fails(ltz(['queue', S, 'u1', '1', 'init', '--per-chunk', '3', '--pairs', 'c1=a,b', 'c2=c,d']), /--per-chunk goes only with --opaque/);
  const r = passes(ltz(['queue', S, 'u1', '1', 'init', '--opaque']));
  const q = rj(path.join(RD(S), 'queue.json'));
  eq([q.opaque, q.groups.map((g) => [g.chunk, g.slots.length])], [true, [['c1', 2], ['c2', 2]]], 'two per chunk');
  const names = q.groups.flatMap((g) => g.slots);
  ok(names.every((s) => /^[a-z][a-z2-9]{3}$/.test(s)) && new Set(names).size === 4, `opaque and distinct (no "-", no chunk name): ${names}`);
  const arg = `--chunk-readers c1=${q.groups[0].slots.join(',')} c2=${q.groups[1].slots.join(',')}`;
  ok(r.out.includes(arg), `init prints the record arguments:\n${r.out}`);
  // Readers on the opaque slots, recorded under those names.
  for (const g of q.groups) for (const s of g.slots) reader(S, s, g.chunk === 'c1' ? 1 : 7, g.chunk === 'c1' ? 6 : 12);
  wj(path.join(RD(S), 'confirmed.json'), {});
  passes(ltz(['record', S, 'u1', '1', '--chunk-readers', `c1=${q.groups[0].slots.join(',')}`, `c2=${q.groups[1].slots.join(',')}`]));
  eq(Object.keys(rj(path.join(RD(S), 'measure.json')).chunks.c1.foundBy), q.groups[0].slots, 'measured under the opaque names');
  fs.rmSync(path.join(RD(S), 'queue.json'));
  passes(ltz(['queue', S, 'u1', '1', 'init', '--opaque', '--per-chunk', '3']));
  eq(rj(path.join(RD(S), 'queue.json')).groups.map((g) => g.slots.length), [3, 3], '--per-chunk 3');
});
test('queue mark --transcript stores the agent\'s transcript path; replace adds the next one', () => {
  const S = queued();
  const t1 = path.join(RUN, 'ag1.jsonl');
  const r = passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'running', '--agent', 'ag1', '--transcript', t1]));
  ok(r.out.includes(`(transcript ${t1})`), r.out);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'stopped-limit', '--transcript', t1]));
  let e = rj(path.join(RD(S), 'queue.json')).slots.find((s) => s.slot === 'c1-a');
  eq(e.transcripts, [t1], 'stored once, absolute');
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-b', 'running', '--agent', 'ag2', '--transcript', 'rel/ag2.jsonl'], { cwd: RUN }));
  eq(rj(path.join(RD(S), 'queue.json')).slots.find((s) => s.slot === 'c1-b').transcripts, [path.join(RUN, 'rel', 'ag2.jsonl')], 'a relative path is made absolute');
  passes(ltz(['queue', S, 'u1', '1', 'replace', 'c1-a', '--agent', 'ag3', '--transcript', path.join(RUN, 'ag3.jsonl')]));
  e = rj(path.join(RD(S), 'queue.json')).slots.find((s) => s.slot === 'c1-a');
  eq(e.transcripts, [t1, path.join(RUN, 'ag3.jsonl')], 'the replacing agent\'s transcript too');
  ok(/c1-a .*transcripts 2/.test(passes(ltz(['queue', S, 'u1', '1', 'status'])).out), 'status counts them');
  fails(ltz(['queue', S, 'u1', '1', 'mark', 'c2-a', 'running', '--agent', 'ag4', '--transcript', ' ']), /--transcript needs a path/);
});

// ---- round 8 T4: requirement items are never narrowed
test('diffcheck: a requirement item changes only with "basis": "copying-error" and a "source", or a "ruling"', () => {
  const typed = ITEMS.map((x) => (x.id === 'A01' ? { ...x, type: 'requirement' } : x.id === 'A02' ? { ...x, type: 'description' } : x));
  const S = makeS({ items: typed });
  snap(S);
  const dc = () => ltz(['diffcheck', S, 'u1', '1']);
  const NEW = 'login invokes check';
  const PROB = /PROBLEM: A01\.title \(fixlog line 1\): a requirement item changed without a copying-error basis or a ruling \(a requirement the evidence does not meet is a defect, not a fix\)/;
  setItems(S, [['A01', 'title', NEW]]);
  fixlog(S, [fl('A01', 'title', 'login calls check', NEW)]);
  const r0 = fails(dc(), PROB, 'no basis, no ruling');
  ok(/give "basis": "copying-error" with "source": "<file:line>", or a "ruling"/.test(r0.out), `the source is any file:line, not only a policy line:\n${r0.out}`);
  fixlog(S, [fl('A01', 'title', 'login calls check', NEW, { basis: 'copying-error', source: 'docs/policy.md:3' })]);
  passes(dc(), 'a copying error, with its source');
  fixlog(S, [fl('A01', 'title', 'login calls check', NEW, { basis: 'copying-error', source: 'config/app.json:2' })]);
  passes(dc(), 'a copying error whose source is a config value, with no policy line');
  fixlog(S, [fl('A01', 'title', 'login calls check', NEW, { basis: 'copying-error' })]);
  fails(dc(), /a requirement item changed without a copying-error basis or a ruling .*\(got "basis": "copying-error" with no "source"\)/, 'no source');
  fixlog(S, [fl('A01', 'title', 'login calls check', NEW, { basis: 'copying-error', source: '  ' })]);
  fails(dc(), PROB, 'a blank source');
  fixlog(S, [fl('A01', 'title', 'login calls check', NEW, { basis: 'evidence-differs', source: 'src/auth.js:3' })]);
  fails(dc(), /\(got "basis": "evidence-differs"\)/, 'another basis');
  fixlog(S, [fl('A01', 'title', 'login calls check', NEW, { ruling: 'R-4' })]);
  passes(dc(), 'a ruling');
  fixlog(S, [fl('A01', 'title', 'login calls check', NEW, { ruling: ' ' })]);
  fails(dc(), PROB, 'a blank ruling');
  // Every entry for the field needs it.
  setItems(S, [['A01', 'title', 'login invokes check now']]);
  fixlog(S, [fl('A01', 'title', 'login calls check', NEW, { ruling: 'R-4' }), fl('A01', 'title', NEW, 'login invokes check now')]);
  fails(dc(), /A01\.title \(fixlog line 2\): a requirement item changed/, 'a follow-up entry without one');
  // Description items and untyped items are unaffected.
  setItems(S, [['A01', 'title', 'login calls check'], ['A02', 'title', 'check returns false on an empty user'], ['A03', 'title', 'logout gives back null.']]);
  fixlog(S, [fl('A02', 'title', 'check throws on an empty user', 'check returns false on an empty user'), fl('A03', 'title', 'logout returns null.', 'logout gives back null.')]);
  passes(dc(), 'type description, and no type');
  // Changing the type away from requirement, or removing the item, is a change to a requirement item.
  setItems(S, [['A02', 'title', 'check throws on an empty user'], ['A03', 'title', 'logout returns null.'], ['A01', 'type', 'description']]);
  fixlog(S, [fl('A01', 'type', 'requirement', 'description')]);
  fails(dc(), /A01\.type \(fixlog line 1\): a requirement item changed without a copying-error basis or a ruling/, 'retyped');
  setItems(S, [['A01', 'type', 'requirement']]);
  const rows = rjl(path.join(S, 'items.jsonl'));
  const a01 = rows.find((x) => x.id === 'A01');
  wjl(path.join(S, 'items.jsonl'), rows.filter((x) => x.id !== 'A01'));
  fixlog(S, [fl('A01', '*', a01, null)]);
  fails(dc(), /A01\.\* \(fixlog line 1\): a requirement item changed without a copying-error basis or a ruling/, 'removed');
  fixlog(S, [fl('A01', '*', a01, null, { ruling: 'R-4' })]);
  passes(dc(), 'removed by a ruling');
});
test('diffcheck: a cross-unit edit of a requirement item needs the basis or a ruling too', () => {
  const S = makeS({
    items: [...ITEMS, { id: 'C01', unit: 'u3', type: 'requirement', title: 'third one', plan: 'keep', reason: 'r', cites: [] }],
    config: { units: { u1: { status: 'open', itemFiles: ['docs/spec.md'] }, u2: { status: 'closed', itemFiles: ['docs/closed.md'] }, u3: { status: 'open', itemFiles: [] } } },
  });
  snap(S);
  passes(ltz(['snapshot', S, 'u3', '1']));
  setItems(S, [['C01', 'title', 'the third item']]);
  fixlog(S, [fl('C01', 'title', 'third one', 'the third item', { unit: 'u3' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /PROBLEM: C01\.title \(fixlog line 1\): a requirement item changed without a copying-error basis or a ruling/);
  fixlog(S, [fl('C01', 'title', 'third one', 'the third item', { unit: 'u3', basis: 'copying-error', source: 'docs/policy.md:7' })]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: with its basis');
});

// ---- round 8: final-check rounds without full reading
/** A state folder whose unit u1 has the given status, snapshotted (chunks c1 1-6, c2 7-12). */
function statusS(status) {
  const S = makeS({ config: { units: { u1: { status, itemFiles: ['docs/spec.md'] }, u2: { status: 'closed', itemFiles: ['docs/closed.md'] } } } });
  snap(S);
  return S;
}
test('queue init on a final-check unit: a subset of chunks, or none; every other status still queues every chunk', () => {
  const qj = (S) => rj(path.join(RD(S), 'queue.json'));
  let S = statusS('final-check');
  const r = passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c2=k7f2']));
  ok(/final check: chunk\(s\) c1 not queued, so record reports their items not read/.test(r.out), r.out);
  eq([qj(S).finalCheck, qj(S).groups], [true, [{ chunk: 'c2', slots: ['k7f2'] }]], 'only c2 queued');
  S = statusS('final-check');
  passes(ltz(['queue', S, 'u1', '1', 'init']), 'no chunks at all');
  eq([qj(S).groups, qj(S).slots], [[], []], 'an empty queue');
  S = statusS('final-check');
  const o = passes(ltz(['queue', S, 'u1', '1', 'init', '--opaque', '--per-chunk', '1', '--chunks', 'c2']));
  const g = qj(S).groups;
  eq([g.length, g[0].chunk, g[0].slots.length], [1, 'c2', 1], '--opaque --chunks c2');
  ok(o.out.includes(`--chunk-readers c2=${g[0].slots[0]}`), o.out);
  S = statusS('final-check');
  fails(ltz(['queue', S, 'u1', '1', 'init', '--opaque', '--chunks', 'c9']), /--chunks names chunk c9, which is not in chunks\.json/);
  fails(ltz(['queue', S, 'u1', '1', 'init', '--opaque', '--chunks', 'c2,c2']), /--chunks lists a chunk twice/);
  fails(ltz(['queue', S, 'u1', '1', 'init', '--chunks', 'c2']), /--chunks goes only with --opaque/);
  for (const st of ['open', 'closed', 'closed-leads-pending', 'closed-known-wrongs']) {
    S = statusS(st);
    fails(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c2=k7f2']), /chunks with no readers: c1 \(every chunk must be queued\)/, st);
    fails(ltz(['queue', S, 'u1', '1', 'init']), /init needs --pairs/, st);
    fails(ltz(['queue', S, 'u1', '1', 'init', '--opaque', '--chunks', 'c2']), new RegExp(`--chunks \\(a subset of the chunks\\) is only for a final-check unit; unit u1 is ${st}`), st);
    ok(!fs.existsSync(path.join(RD(S), 'queue.json')), `${st}: nothing written`);
  }
});
test('record on a final-check unit: unqueued chunks are reported not read, and the round never counts as a zero', () => {
  const S = baseCopy();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  const status = (st) => wj(cfgP, { ...base, units: { ...base.units, u1: { ...base.units.u1, status: st } } });
  const rd = RD(S);
  status('final-check');
  wj(path.join(rd, 'confirmed.json'), { A02: { note: 'src/auth.js:6 returns false', foundBy: 'spot-check' }, A08: CONFIRMED.A08 });
  wjl(path.join(rd, 'fixcheck-1-c2.jsonl'), [{ id: 'A08', verdict: 'ok' }]);
  const r = passes(ltz(['record', S, 'u1', '1', '--chunk-readers', 'c2=c2-a,c2-b']), 'no queue.json, c2 read');
  ok(/WARNING: final check: chunk\(s\) c1 had no readers; their items are reported not read/.test(r.out), r.out);
  ok(/counts as zero no \(not full depth, final check: chunk\(s\) c1 not read, 2 wrong, 5 unread\)/.test(r.out), r.out);
  let m = rj(path.join(rd, 'measure.json'));
  eq([m.finalCheck, m.chunksNotRead, m.fullDepth, m.countsAsZero, m.chunks.c1.notRead, m.chunks.c1.fullDepth, m.chunks.c2.notRead, m.chunks.c2.fullDepth],
    [true, ['c1'], false, false, true, false, false, true], 'c1 not read; c2 at full depth');
  eq([m.chunks.c1.readers, m.chunks.c1.confirmed, m.chunks.c1.foundByNone, m.chunks.c1.foundByNoneBy, m.chunks.c1.foundByAll, m.chunks.c1.estimate.pair],
    [[], 1, 1, { 'spot-check': 1 }, 0, null], 'a confirmed lead in the unread chunk is counted as found by none, by its foundBy');
  eq([m.chunks.c2.confirmed, m.chunks.c2.foundByNoneBy, m.fixChecker[0].itemsChecked], [1, { sweep: 1 }, 1], 'the read chunk and the fix checker as usual');
  let rep = rj(path.join(rd, 'report.json'));
  const by = Object.fromEntries(rep.items.map((x) => [x.id, x]));
  eq([by.A01.verdict, by.A01.note, by.A02.verdict, by.A02.foundByWriter, rep.counts.unread], ['unread', 'not read (final check)', 'wrong', 'spot-check', 5], 'not read (final check)');
  // An empty queue (no chunk queued) and no --chunk-readers: every chunk not read.
  passes(ltz(['queue', S, 'u1', '1', 'init']));
  passes(ltz(['record', S, 'u1', '1']), 'no readers at all');
  m = rj(path.join(rd, 'measure.json'));
  rep = rj(path.join(rd, 'report.json'));
  eq([m.chunksNotRead, rep.counts.unread, rep.counts.wrong, m.countsAsZero], [['c1', 'c2'], 10, 2, false], 'all not read');
  // Every other status keeps the refusals.
  for (const st of ['open', 'closed', 'closed-known-wrongs']) {
    status(st);
    fails(ltz(['record', S, 'u1', '1', '--chunk-readers', 'c2=c2-a,c2-b']), /chunk c1 \(positions 1-6\) has no readers in --chunk-readers/, st);
    fails(ltz(['record', S, 'u1', '1']), /--chunk-readers <chunk>=<slotA>,<slotB> \.\.\. is required/, st);
  }
});

// ---- round 7: withdrawn by ruling, ruled oks, a rerun dropping a wrong, final-check, baselines, solo
test('record: "withdrawn" reader wrongs (overturned by a ruling mid-round) are neither false alarms nor confirmed', () => {
  const S = baseCopy();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  const conf = path.join(RD(S), 'confirmed.json');
  const mp = path.join(RD(S), 'measure.json');
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  // c2-b marked A09 wrong: a false alarm in the base round.
  wj(conf, { ...CONFIRMED, withdrawn: [] });
  passes(rec(), 'an empty list needs no ruling config');
  const m0 = rj(mp);
  eq([m0.chunks.c2.falseAlarms['c2-b'], m0.chunks.c2.withdrawnByRuling['c2-b']], [1, 0], 'control: a false alarm');
  wj(conf, { ...CONFIRMED, withdrawn: [{ id: 'A09', ruling: 'D-12' }] });
  fails(rec(), /"withdrawn" needs its rulings checked, but config\.json: "decisionLog" \(the path of the decision log\) is required/);
  fs.writeFileSync(path.join(S, 'decisions.md'), '# Decisions\n- D-12: config timeouts are read at startup\n');
  wj(cfgP, { ...base, decisionLog: 'decisions.md' });
  fails(rec(), /"withdrawn" needs its rulings checked, but config\.json: "rulingIdPattern" .* is required/);
  wj(cfgP, { ...base, decisionLog: 'decisions.md', rulingIdPattern: 'D-\\d+' });
  passes(rec());
  const m = rj(mp);
  eq([m.chunks.c2.falseAlarms['c2-b'], m.chunks.c2.falseAlarmIds['c2-b'], m.chunks.c2.withdrawnByRuling['c2-b'], m.chunks.c2.withdrawnByRuling['c2-a'], m.chunks.c2.withdrawn],
    [0, [], 1, 0, 1], 'not a false alarm: counted per slot as withdrawnByRuling');
  eq([m.total.withdrawn, m.total.withdrawnByRuling['c2-b'], m.total.falseAlarms['c2-b'], m.chunks.c2.confirmed, m.total.confirmed], [1, 1, 0, 1, 3], 'and in total; not confirmed');
  eq(m.total.estimate, m0.total.estimate, 'the remaining-wrongs estimate is unchanged');
  const by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq([by.A09.verdict, by.A09.withdrawnByRuling], ['ok', 'D-12'], 'reported ok, with its ruling');
  ok(/^withdrawn by ruling D-12\. /.test(by.A09.note), by.A09.note);
  // Each ruling: a whole ruling id that the decision log holds.
  for (const [ruling, re] of [
    ['D-1', /withdrawn A09 names ruling D-1, which is not in the decision log/],
    ['R-12', /withdrawn A09 has ruling "R-12", which is not a ruling id \(config "rulingIdPattern" \/D-\\d\+\/\)/],
    ['D-12x', /withdrawn A09 has ruling "D-12x", which is not a ruling id/],
    [undefined, /withdrawn A09 has ruling undefined, which is not a ruling id/],
  ]) {
    wj(conf, { ...CONFIRMED, withdrawn: [{ id: 'A09', ...(ruling === undefined ? {} : { ruling }) }] });
    fails(rec(), re, String(ruling));
  }
  for (const [extra, re] of [
    [{ withdrawn: [{ id: 'A02', ruling: 'D-12' }] }, /A02 is both withdrawn and confirmed wrong/],
    [{ pending: [{ id: 'A09', pendingReason: 'rule-meaning' }], withdrawn: [{ id: 'A09', ruling: 'D-12' }] }, /A09 is both withdrawn and pending/],
    [{ defects: ['A09'], withdrawn: [{ id: 'A09', ruling: 'D-12' }] }, /A09 is both withdrawn and a defect/],
    [{ withdrawn: [{ id: 'Z9', ruling: 'D-12' }] }, /withdrawn id Z9 is not an item in this round's snapshot/],
    [{ withdrawn: ['A09'] }, /"withdrawn" must be an array of \{"id", "ruling"\} entries/],
  ]) {
    wj(conf, { ...CONFIRMED, ...extra });
    fails(rec(), re);
  }
  wj(conf, { ...CONFIRMED, withdrawn: [{ id: 'A10', ruling: 'D-12' }] });
  ok(/WARNING: confirmed\.json: A10 is withdrawn by ruling D-12, but no reader marked it wrong/.test(passes(rec()).out), 'a withdrawn id no reader marked: a warning only');
});
test('record: "restated" (final-check only) holds a reader wrong that restates a known wrong or a lead\'s flaw: neither confirmed nor a false alarm', () => {
  const S = baseCopy();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  const status = (st) => wj(cfgP, { ...base, units: { ...base.units, u1: { ...base.units.u1, status: st } } });
  const conf = path.join(RD(S), 'confirmed.json');
  const mp = path.join(RD(S), 'measure.json');
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  status('final-check');
  // c2-b marked A09 wrong: a false alarm in the base round (control).
  wj(conf, { ...CONFIRMED, restated: [] });
  passes(rec(), 'an empty list');
  const m0 = rj(mp);
  eq([m0.chunks.c2.falseAlarms['c2-b'], m0.chunks.c2.restated, m0.total.restated], [1, 0, 0], 'control: a false alarm');
  const of = 'known-wrongs.txt: A09 (u1/r7, held draft drafts/A09.md)';
  wj(conf, { ...CONFIRMED, restated: [{ id: 'A09', of }] });
  const r = passes(rec());
  ok(/rejected 0, restated 1/.test(r.out), r.out);
  const m = rj(mp);
  eq([m.chunks.c2.falseAlarms['c2-b'], m.chunks.c2.falseAlarmIds['c2-b'], m.chunks.c2.restated, m.total.restated, m.chunks.c2.confirmed, m.total.confirmed],
    [0, [], 1, 1, 1, 3], 'not a false alarm, not confirmed');
  const by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq([by.A09.verdict, by.A09.restated], ['wrong', of], 'reported wrong (the item is wrong at the snapshot), with what it restates');
  ok(by.A09.note.startsWith(`restated: ${of}`), by.A09.note);
  // With no confirmed wrong, the restated one alone keeps the round from counting as a zero.
  wj(conf, { restated: [{ id: 'A09', of }] });
  passes(rec());
  eq([rj(mp).total.confirmed, rj(mp).countsAsZero, rj(mp).zeroBlockers], [0, false, ['1 wrong']], 'a restated wrong blocks a zero');
  // Only a final-check round takes it.
  for (const st of ['open', 'closed']) {
    status(st);
    fails(rec(), /"restated" is only for a final-check unit's round/, st);
  }
  status('final-check');
  for (const [extra, re] of [
    [{ restated: [{ id: 'A02', of }] }, /A02 is both restated and confirmed wrong/],
    [{ pending: [{ id: 'A09', pendingReason: 'rule-meaning' }], restated: [{ id: 'A09', of }] }, /A09 is both restated and pending/],
    [{ defects: ['A09'], restated: [{ id: 'A09', of }] }, /A09 is both restated and a defect/],
    [{ outsideBar: [{ id: 'A09', note: 'src/auth.js:1' }], restated: [{ id: 'A09', of }] }, /A09 is both restated and outside the bar/],
    [{ rejected: [{ id: 'A09', note: 'src/auth.js:1 answers it' }], restated: [{ id: 'A09', of }] }, /A09 is both rejected and restated/],
    [{ restated: [{ id: 'Z9', of }] }, /restated id Z9 is not an item in this round's snapshot/],
    [{ restated: [{ id: 'A09' }] }, /restated A09 names no known wrong or lead in "of"/],
    [{ restated: [{ id: 'A09', of: '  ' }] }, /restated A09 names no known wrong or lead in "of"/],
    [{ restated: ['A09'] }, /"restated" entry 1 \("A09"\) is not an \{"id", "of"\} entry/],
    [{ restated: { id: 'A09', of } }, /"restated" must be an array of \{"id", "of"\} entries/],
    [{ restated: [{ id: 'A09', of }, { id: 'A09', of }] }, /"restated" lists A09 twice/],
    [{ withdrawn: [{ id: 'A09', ruling: 'D-12' }], restated: [{ id: 'A09', of }] }, /A09 is both restated and withdrawn/],
    [{ ruledKept: [{ id: 'A09', ruling: 'R-1' }], restated: [{ id: 'A09', of }] }, /A09 is both in "ruledKept" and restated/],
  ]) {
    wj(conf, { ...CONFIRMED, ...extra });
    fails(rec(), re);
  }
  // A restated id in a chunk no reader read stays unread.
  wj(conf, { ...CONFIRMED, restated: [{ id: 'A09', of }, { id: 'A01', of }] });
  const ru = passes(ltz(['record', S, 'u1', '1', '--chunk-readers', 'c2=c2-a,c2-b']));
  ok(/WARNING: confirmed\.json: A01 is restated, but no reader marked it wrong/.test(ru.out), ru.out);
  eq(Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x.verdict])).A01, 'unread', 'no reader read A01: unread, not wrong');
  wj(conf, { ...CONFIRMED, restated: [{ id: 'A09', of }, { id: 'A10', of: 'closed-unit-leads.txt: A10 (stale)' }] });
  ok(/WARNING: confirmed\.json: A10 is restated, but no reader marked it wrong/.test(passes(rec()).out), 'a restated id no reader marked: a warning only');
});
test('record and replay: a restated id is no repeat of the round that confirmed it, and no false hit', () => {
  const S = baseCopy();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  wj(cfgP, { ...base, units: { ...base.units, u1: { ...base.units.u1, status: 'final-check' } } });
  asRound2(S);
  // Round 1 (the closing round) confirmed A09; round 2 is the final check, where c2-b marks A09 wrong again.
  wj(path.join(RD(S, 'u1', 1), 'confirmed.json'), { A09: { note: 'src/billing.js:7', class: 'U1' } });
  const c2 = path.join(RD(S, 'u1', 2), 'confirmed.json');
  const rec = () => ltz(['record', S, 'u1', '2', ...READERS]);
  wj(c2, { ...CONFIRMED, A09: { note: 'src/billing.js:7', class: 'U1' } });
  fails(rec(), /A09 repeats r1/, 'control: confirming it again is a repeat');
  fs.rmSync(path.join(RD(S, 'u1', 2), 'report.json'), { force: true });
  wj(c2, { ...CONFIRMED, restated: [{ id: 'A09', of: 'known-wrongs.txt: A09 (u1/r1)' }] });
  passes(rec(), 'restated: no repeat');
  // replay: a pattern hitting A09 counts it neither as recalled nor as a false hit in round 2.
  const pat = patFile(S, { id: 'P-09', class: 'U1', regex: '.', fields: ['title'], knownInstances: ['A09'] });
  const rp = passes(ltz(['replay', S, pat, '--rounds', 'u1']));
  const line = rp.out.split('\n').find((x) => x.startsWith('u1/r2 '));
  ok(line && /hits on restated items \(a known flaw fixed in this final check\), not counted: (.*\b)?A09\b/.test(line) && !/false hits \d+ \([^)]*\bA09\b/.test(line), 'round 2 line:\n' + rp.out);
});
test('record: "outsideBar" reader wrongs (outside a frozen bar) are listed for the owner, not counted: not false alarms, not confirmed', () => {
  const S = baseCopy();
  const conf = path.join(RD(S), 'confirmed.json');
  const mp = path.join(RD(S), 'measure.json');
  const rp = path.join(RD(S), 'report.json');
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  const NOTE = 'config/app.json:2 sets 30; the item misstates the unit, which no class of the frozen bar covers';
  // c2-b marked A09 wrong: a false alarm in the base round.
  wj(conf, { ...CONFIRMED, outsideBar: [] });
  passes(rec(), 'an empty list');
  const m0 = rj(mp);
  eq([m0.chunks.c2.falseAlarms['c2-b'], m0.chunks.c2.outsideBar['c2-b'], m0.chunks.c2.outsideBarItems, m0.total.outsideBarItems], [1, 0, 0, 0], 'control: a false alarm');
  wj(conf, { ...CONFIRMED, outsideBar: [{ id: 'A09', note: NOTE }] });
  const r = passes(rec());
  const m = rj(mp);
  eq([m.chunks.c2.falseAlarms['c2-b'], m.chunks.c2.falseAlarmIds['c2-b'], m.chunks.c2.outsideBar['c2-b'], m.chunks.c2.outsideBar['c2-a'], m.chunks.c2.outsideBarItems, m.chunks.c2.outsideBarIds],
    [0, [], 1, 0, 1, ['A09']], 'not a false alarm: counted per slot as outsideBar.<slot>');
  eq([m.total.outsideBar['c2-b'], m.total.outsideBar['c1-a'], m.total.outsideBarItems, m.total.outsideBarIds, m.total.falseAlarms['c2-b'], m.chunks.c2.confirmed, m.total.confirmed],
    [1, 0, 1, ['A09'], 0, 1, 3], 'and in total; not confirmed');
  eq(m.total.estimate, m0.total.estimate, 'the remaining-wrongs estimate is unchanged');
  const rep = rj(rp);
  const by = Object.fromEntries(rep.items.map((x) => [x.id, x]));
  eq([by.A09.verdict, rep.counts], ['outside-bar', { ok: 8, wrong: 3, 'pending-owner': 0, defect: 0, unread: 0, 'outside-bar': 1 }], 'reported outside-bar: neither ok nor wrong');
  ok(by.A09.note.startsWith(`outside the bar (listed for the owner, not counted): ${NOTE} | c2-a: `), by.A09.note);
  ok(/outside-bar 1\);/.test(r.out) && /; outside the bar, list for the owner \(not counted\): A09;/.test(r.out), `named in the summary for the owner:\n${r.out}`);
  // It does not block a zero; a confirmed wrong does.
  wj(conf, { outsideBar: [{ id: 'A09', note: NOTE }] });
  passes(rec());
  eq([rj(mp).countsAsZero, rj(mp).zeroBlockers, rj(rp).countsAsZero], [true, [], true], 'an outside-bar item does not block a zero');
  wj(conf, { A09: { note: NOTE } });
  passes(rec());
  eq(rj(mp).countsAsZero, false, 'control: confirmed wrong, it blocks');
  // PROBLEMS.
  for (const [extra, re] of [
    [{ ...CONFIRMED, outsideBar: [{ id: 'A02', note: NOTE }] }, /PROBLEM: confirmed\.json: A02 is both outside the bar and confirmed wrong/],
    [{ pending: [{ id: 'A09', pendingReason: 'rule-meaning' }], outsideBar: [{ id: 'A09', note: NOTE }] }, /A09 is both outside the bar and pending/],
    [{ withdrawn: [{ id: 'A09', ruling: 'D-12' }], outsideBar: [{ id: 'A09', note: NOTE }] }, /A09 is both outside the bar and withdrawn/],
    [{ defects: ['A09'], outsideBar: [{ id: 'A09', note: NOTE }] }, /A09 is both outside the bar and a defect/],
    [{ outsideBar: [{ id: 'A09' }] }, /PROBLEM: confirmed\.json: outsideBar A09 has no "note" \(what the evidence shows, with file:line\)/],
    [{ outsideBar: [{ id: 'A09', note: '  ' }] }, /outsideBar A09 has no "note"/],
    [{ outsideBar: [{ id: 'Z9', note: NOTE }] }, /outsideBar id Z9 is not an item in this round's snapshot/],
    [{ outsideBar: 'A09' }, /PROBLEM: confirmed\.json: "outsideBar" must be an array of \{"id", "note"\} entries/],
    [{ outsideBar: ['A09'] }, /PROBLEM: confirmed\.json: "outsideBar" entry 1 \("A09"\) is not an \{"id", "note"\} entry/],
    [{ outsideBar: [{ id: 'A09', note: NOTE }, { id: 'A09', note: NOTE }] }, /"outsideBar" lists A09 twice/],
  ]) {
    wj(conf, extra);
    fails(rec(), re);
  }
  // A listed id no reader marked: a warning only.
  wj(conf, { ...CONFIRMED, outsideBar: [{ id: 'A10', note: NOTE }] });
  ok(/WARNING: confirmed\.json: A10 is listed outside the bar, but no reader marked it wrong/.test(passes(rec()).out), 'a warning only');
});
test('record: an "outsideBar" item no reader read stays unread, which still blocks a zero', () => {
  const S = baseCopy();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  wj(cfgP, { ...base, units: { ...base.units, u1: { ...base.units.u1, status: 'final-check' } } });
  wj(path.join(RD(S), 'confirmed.json'), { outsideBar: [{ id: 'A03', note: 'src/auth.js:10 returns null; the claim fits no class' }, { id: 'A09', note: 'config/app.json:2' }] });
  passes(ltz(['record', S, 'u1', '1', '--chunk-readers', 'c2=c2-a,c2-b']), 'c1 not read');
  const by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq([by.A03.verdict, by.A09.verdict, rj(path.join(RD(S), 'measure.json')).countsAsZero], ['unread', 'outside-bar', false], 'unread, not outside-bar, where no reader read it');
});
test('record: ruled oks (an ok whose note starts "ruled: <ruling id>") are listed; one not pending as ruled-wording warns', () => {
  const S = baseCopy();
  const conf = path.join(RD(S), 'confirmed.json');
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  editJsonl(path.join(RD(S), 'agent-c1-a.jsonl'), (rows) => rows.map((x) => {
    if (x.id === 'A04') return { ...x, note: 'ruled: D-12. src/billing.js:2 says 0.2; the approved wording says 20 percent' };
    if (x.id === 'A05') return { ...x, note: '  Ruled:R-3 (no line named)' };
    if (x.id === 'A06') return { ...x, note: 'holds; ruled: D-12 mid-note' };
    if (x.id === 'A01') return { ...x, note: 'ruled D-12, no colon' };
    if (x.id === 'A03') return { ...x, note: 'ruled: D-12 but src/auth.js:10 returns null only' };
    return x;
  }));
  // The fix checker's results too (not its input file, and not a wrong).
  wjl(path.join(RD(S), 'fixcheck-1-c2.jsonl'), [
    { id: 'A09', verdict: 'ok', note: 'ruled: D-12 config/app.json:2 says 30' },
    { id: 'A07', verdict: 'wrong', note: 'ruled: D-12 src/billing.js:3' },
    { id: 'A08', verdict: 'ok', note: 'holds' },
  ]);
  wjl(path.join(RD(S), 'fixcheck-1-c2-input.jsonl'), [{ ...ITEMS[6], verdict: 'ok', note: 'ruled: D-99 src/billing.js:4' }, ITEMS[7], ITEMS[8]]);
  const r = passes(rec());
  eq(rj(path.join(RD(S), 'measure.json')).ruledOks, [
    { id: 'A04', slot: 'c1-a', ruling: 'D-12', refs: ['src/billing.js:2'] },
    { id: 'A05', slot: 'c1-a', ruling: 'R-3', refs: [] },
    { id: 'A09', slot: 'fixcheck-1-c2', ruling: 'D-12', refs: ['config/app.json:2'] },
  ], 'only oks whose note starts "ruled:" (not a wrong, not mid-note, not without the colon), readers\' then the fix checker\'s');
  ok(/WARNING: ruled ok: A04 \(c1-a, ruling D-12, src\/billing\.js:2\) is not in "pending" with pendingReason "ruled-wording"/.test(r.out), r.out);
  ok(/WARNING: ruled ok: A05 \(c1-a, ruling R-3, no file:line\)/.test(r.out), r.out);
  ok(/WARNING: ruled ok: A09 \(fixcheck-1-c2, ruling D-12, config\/app\.json:2\) is not in "pending"/.test(r.out), r.out);
  wj(conf, { ...CONFIRMED, pending: [{ id: 'A04', pendingReason: 'ruled-wording' }, { id: 'A05', pendingReason: 'rule-meaning' }, { id: 'A09', pendingReason: 'ruled-wording' }] });
  const r2 = passes(rec());
  ok(!/ruled ok: A04/.test(r2.out) && !/ruled ok: A09/.test(r2.out) && /ruled ok: A05/.test(r2.out), `pending as ruled-wording: no warning; another reason still warns:\n${r2.out}`);
  eq(rj(path.join(RD(S), 'measure.json')).ruledOks.length, 3, 'all still listed');
});
test('record: "ruledKept" (ruled oks whose ruling the owner kept) silences their warning; a bad entry is a PROBLEM and nothing is written', () => {
  const S = baseCopy();
  const conf = path.join(RD(S), 'confirmed.json');
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  const outFiles = [path.join(RD(S), 'report.json'), path.join(RD(S), 'measure.json')];
  editJsonl(path.join(RD(S), 'agent-c1-a.jsonl'), (rows) => rows.map((x) => {
    if (x.id === 'A04') return { ...x, note: 'ruled: D-12. src/billing.js:2 says 0.2; the approved wording says 20 percent' };
    if (x.id === 'A05') return { ...x, note: 'ruled: R-3 docs/spec.md:8' };
    return x;
  }));
  // c1-b gives A03 (confirmed wrong) a ruled ok, and A04 a ruled ok under another ruling.
  editJsonl(path.join(RD(S), 'agent-c1-b.jsonl'), (rows) => rows.map((x) => {
    if (x.id === 'A03') return { ...x, note: 'ruled: D-12 src/auth.js:10' };
    if (x.id === 'A04') return { ...x, note: 'ruled: R-3 src/billing.js:2' };
    return x;
  }));
  wjl(path.join(RD(S), 'fixcheck-1-c2.jsonl'), [{ id: 'A09', verdict: 'ok', note: 'ruled: D-12 config/app.json:2 says 30' }]);
  const r0 = passes(rec(), 'control: no ruledKept');
  for (const re of [/ruled ok: A04 \(c1-a, ruling D-12/, /ruled ok: A04 \(c1-b, ruling R-3/, /ruled ok: A05 \(c1-a/, /ruled ok: A09 \(fixcheck-1-c2/]) ok(re.test(r0.out), `${re} warns without ruledKept:\n${r0.out}`);
  wj(conf, { ...CONFIRMED, ruledKept: [{ id: 'A04', ruling: 'D-12' }, { id: 'A09', ruling: 'D-12' }] });
  const r1 = passes(rec(), 'kept');
  ok(!/ruled ok: A04 \(c1-a/.test(r1.out) && !/ruled ok: A09/.test(r1.out), `kept with the same ruling: no warning (a reader's and the fix checker's):\n${r1.out}`);
  ok(/ruled ok: A04 \(c1-b, ruling R-3/.test(r1.out) && /ruled ok: A05 \(c1-a/.test(r1.out), `another ruling on the same id, and an id not kept, still warn:\n${r1.out}`);
  ok(/or in "ruledKept"/.test(r1.out), r1.out);
  eq(rj(outFiles[1]).ruledOks.map((x) => `${x.id}:${x.slot}`), ['A04:c1-a', 'A05:c1-a', 'A03:c1-b', 'A04:c1-b', 'A09:fixcheck-1-c2'], 'all still listed in measure.json');
  eq(rj(outFiles[0]).items.find((x) => x.id === 'A04').verdict, 'ok', 'a kept ruled ok stays ok');
  const bad = (ruledKept, re, label, extra = {}) => {
    for (const f of outFiles) fs.rmSync(f, { force: true });
    wj(conf, { ...CONFIRMED, ...extra, ruledKept });
    fails(rec(), re, label);
    ok(outFiles.every((f) => !fs.existsSync(f)), `${label}: nothing written`);
  };
  bad([{ id: 'A06', ruling: 'D-12' }], /PROBLEM: confirmed\.json: "ruledKept" lists A06, which is not a ruled ok of this round/, 'an id that is no ruled ok');
  bad([{ id: 'A04', ruling: 'D-13' }], /"ruledKept" lists A04 with ruling D-13, but its ruled ok names D-12, R-3/, 'a ruling no ruled ok of the id names');
  bad([{ id: 'A03', ruling: 'D-12' }], /A03 is both in "ruledKept" and confirmed wrong/, 'also confirmed wrong');
  bad([{ id: 'A04', ruling: 'D-12' }], /A04 is both in "ruledKept" and pending/, 'also pending', { pending: [{ id: 'A04', pendingReason: 'ruled-wording' }] });
  bad([{ id: 'A04', ruling: 'D-12' }], /A04 is both in "ruledKept" and a defect/, 'also a defect', { defects: ['A04'] });
  bad([{ id: 'A04', ruling: 'D-12' }], /A04 is both in "ruledKept" and withdrawn/, 'also withdrawn', { withdrawn: [{ id: 'A04', ruling: 'D-12' }] });
  bad([{ id: 'A04', ruling: 'D-12' }], /A04 is both in "ruledKept" and outside the bar/, 'also outside the bar', { outsideBar: [{ id: 'A04', note: 'src/billing.js:2' }] });
  bad('A04', /"ruledKept" must be an array of \{"id", "ruling"\} entries/, 'not a list');
  bad([{ ruling: 'D-12' }], /"ruledKept" entry 1 \(\{"ruling":"D-12"\}\) is not an \{"id", "ruling"\} entry/, 'no id');
  bad([{ id: 'A04' }], /"ruledKept" entry 1 \(\{"id":"A04"\}\) is not an \{"id", "ruling"\} entry/, 'no ruling');
  bad([{ id: ' ', ruling: 'D-12' }], /"ruledKept" entry 1 .* is not an \{"id", "ruling"\} entry/, 'a blank id');
  bad([{ id: 'A04', ruling: ' ' }], /"ruledKept" entry 1 .* is not an \{"id", "ruling"\} entry/, 'a blank ruling');
  bad([{ id: 'A04', ruling: 'D-12' }, { id: 'A04', ruling: 'D-12' }], /"ruledKept" lists A04 with ruling D-12 twice/, 'listed twice');
  // Other readers of confirmed.json (replay, the repeat scan) ignore a malformed ruledKept.
  wj(conf, { ...CONFIRMED, ruledKept: 'A04' });
  passes(ltz(['replay', S, patFile(S, { id: 'U-null', class: 'U1', regex: 'null', fields: ['title'], knownInstances: ['A03'] }), '--rounds', 'u1']), 'replay reads the round');
});
test('record: a wrong the replaced lines marked that the replacing rerun does not mark is a warning with its id', () => {
  const S = baseCopy();
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, rejected: [{ id: 'A09', note: 'config/app.json:2 holds; fixture dismissal' }, { id: 'A04', note: 'src/billing.js:2 holds 0.2 as the item says; fixture dismissal' }] });
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
  // c1-a marked A02 and A03 wrong; the rerun keeps A03 wrong, marks A02 ok, and A04 wrong.
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '2', '--to', '5']));
  const [x1] = rerunsOf(S, 'c1-a');
  reader(S, x1.slot, 2, 5, {
    A03: { verdict: 'wrong', note: 'src/auth.js:10 returns null only', class: ['U1'] },
    A04: { verdict: 'wrong', note: 'src/billing.js:2 holds 0.2', class: ['C2'] },
  });
  let r = passes(rec());
  ok(new RegExp(`WARNING: A02 \\(position 2\\): c1-a marked it wrong, but rerun ${x1.slot}, which replaces those lines, marks it ok; it leaves the union, so confirm it or drop it`).test(r.out), r.out);
  ok(!/A03 \(position 3\)/.test(r.out) && !/A04 \(position 4\)/.test(r.out), `no warning where the rerun also marks it, or the parent did not:\n${r.out}`);
  // An earlier rerun's wrong that a later rerun replaces with an ok.
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '4', '--to', '5']));
  const x2 = rerunsOf(S, 'c1-a')[1];
  reader(S, x2.slot, 4, 5, { A05: { verdict: 'ok', note: 'ruled: D-12 docs/spec.md:8 says only admins' } });
  r = passes(rec());
  ok(new RegExp(`A04 \\(position 4\\): ${x1.slot} \\(rerun of c1-a\\) marked it wrong, but rerun ${x2.slot}, which replaces those lines, marks it ok`).test(r.out), r.out);
  eq(rj(path.join(RD(S), 'measure.json')).ruledOks, [{ id: 'A05', slot: x2.slot, ruling: 'D-12', refs: ['docs/spec.md:8'] }], 'a ruled ok in a rerun line is listed under the rerun\'s slot');
  // A dropped rerun position over a parent wrong.
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-b', '--from', '2', '--to', '3']));
  const [y] = rerunsOf(S, 'c1-b');
  passes(ltz(['render', S, 'u1', '1', y.slot, '3', '1']));
  const byId = new Map(rjl(path.join(RD(S), 'snapshot.jsonl')).map((it) => [it.id, it]));
  wjl(path.join(RD(S), `agent-${y.slot}.jsonl`), [{ unit: 'u1', id: 'A03', verdict: 'ok', note: 'holds', cites: byId.get('A03').cites }]);
  passes(ltz(['queue', S, 'u1', '1', 'mark', y.slot, 'dropped-by-owner', '--ruling', 'P-5']));
  r = passes(rec());
  ok(new RegExp(`A02 \\(position 2\\): c1-b marked it wrong, but rerun ${y.slot}, which replaces those lines, has no line for it \\(dropped\\)`).test(r.out), r.out);
});
test('diffcheck: a whole-boundary search with a scopeNote and scopeText passes; a later edit dropping the scope words fails', () => {
  const B = ['src/**', 'docs/**', 'config/**'];
  const S = makeS({ config: { boundaryPaths: B } });
  snap(S);
  const text = 'outside tests and scripts, only billing reads RATE';
  const entry = { scopeNote: 'every hit judged; the claim excludes tests and scripts', scopeText: 'outside tests and scripts' };
  const r = passes(verifyRun(S, { regex: 'RATE', paths: B }, 2, { text, entry, at: RATE_SRC }), 'paths = boundaryPaths');
  ok(!/bounded on purpose|boundaryPaths/.test(r.out), `not narrower, so no warning:\n${r.out}`);
  const first = fl('A01', 'title', 'login calls check', text, { search: { regex: 'RATE', paths: B }, hits: 2, judged: J(...RATE_SRC), blindSpots: 'names built at run time', ...entry });
  setItems(S, [['A01', 'title', 'only billing reads RATE']]);
  fixlog(S, [first, fl('A01', 'title', text, 'only billing reads RATE')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /fixlog line 1\): "scopeText" "outside tests and scripts" does not appear in the new text/, 'a later edit dropped the scope words');
  setItems(S, [['A01', 'title', 'outside tests and scripts, only the billing service reads RATE']]);
  fixlog(S, [first, fl('A01', 'title', text, 'outside tests and scripts, only the billing service reads RATE')]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: the later edit keeps them');
});
test('snapshot as a baseline: taken before a cross-unit edit, then taken again at that unit\'s round 1 start', () => {
  const S = makeS({
    items: [...ITEMS, { id: 'C01', unit: 'u3', title: 'third one', plan: 'keep', reason: 'r', cites: [] }, { id: 'C02', unit: 'u3', title: 'third two', plan: 'keep', reason: 'r', cites: [] }],
    config: { units: { u1: { status: 'open', itemFiles: ['docs/spec.md'] }, u2: { status: 'closed', itemFiles: ['docs/closed.md'] }, u3: { status: 'open', itemFiles: [] } } },
  });
  snap(S);
  passes(ltz(['snapshot', S, 'u3', '1']), 'a baseline for u3 before u1 edits it');
  setItems(S, [['C01', 'title', 'the third one, edited by a u1 sweep']]);
  fixlog(S, [fl('C01', 'title', 'third one', 'the third one, edited by a u1 sweep', { unit: 'u3' })]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'u1\'s cross-unit diffcheck passes against the baseline');
  passes(ltz(['snapshot', S, 'u3', '1']), 'u3\'s round 1 takes it again at its start (nothing rendered yet)');
  eq(rjl(path.join(RD(S, 'u3', 1), 'snapshot.jsonl')).find((x) => x.id === 'C01').title, 'the third one, edited by a u1 sweep', 'the re-take holds the edited text');
  // After the re-take, u1's entry is no longer a change since u3's snapshot: run u1's diffcheck first.
  fails(ltz(['diffcheck', S, 'u1', '1']), /C01\.title is logged for unit u3 but did not change since u3\/r1/);
  passes(ltz(['render', S, 'u3', '1', 'k2aa', '1', '1']));
  fails(ltz(['snapshot', S, 'u3', '1']), /reading has started/, 'once reading starts, no re-take');
});
test('final-check: snapshot F before edits, fix, diffcheck F, baseline F+1, status back: nothing flagged', () => {
  const S = makeS();
  snap(S);
  passes(ltz(['snapshot', S, 'u2', '1']), 'u2 closed, with a snapshot');
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  const status = (st) => wj(cfgP, { ...base, units: { ...base.units, u2: { ...base.units.u2, status: st } } });
  status('final-check');
  passes(ltz(['snapshot', S, 'u2', '2']), 'round F = 2, before any edit');
  setItems(S, [['B01', 'title', 'the first closed item']]);
  wjl(path.join(RD(S, 'u2', 2), 'fixlog.jsonl'), [fl('B01', 'title', 'closed one', 'the first closed item')]);
  passes(ltz(['diffcheck', S, 'u2', '2']), 'diffcheck F');
  passes(ltz(['diffcheck', S, 'u1', '1']), 'final-check counts as open');
  status('closed');
  fails(ltz(['diffcheck', S, 'u1', '1']), /FLAG: B01: item of closed unit u2 changed since u2\/r2/, 'control: back to closed with no new baseline');
  status('final-check');
  passes(ltz(['snapshot', S, 'u2', '3']), 'the baseline F+1');
  status('closed');
  passes(ltz(['diffcheck', S, 'u1', '1']), 'closed again: the final-check edit is not flagged');
});
test('solo and r0: queue init --opaque --per-chunk 1, then record with one slot per chunk', () => {
  const S = makeS();
  snap(S);
  const r = passes(ltz(['queue', S, 'u1', '1', 'init', '--opaque', '--per-chunk', '1']));
  const q = rj(path.join(RD(S), 'queue.json'));
  eq(q.groups.map((g) => g.slots.length), [1, 1], 'one slot per chunk');
  for (const g of q.groups) reader(S, g.slots[0], g.chunk === 'c1' ? 1 : 7, g.chunk === 'c1' ? 6 : 12);
  wj(path.join(RD(S), 'confirmed.json'), {});
  const args = /--chunk-readers (.+)$/m.exec(r.out)[1].split(' ');
  passes(ltz(['record', S, 'u1', '1', '--chunk-readers', ...args]));
  const m = rj(path.join(RD(S), 'measure.json'));
  eq([m.countsAsZero, m.chunks.c1.readers.length, m.chunks.c1.estimate.pair, m.total.estimate.chunksNotEstimated], [true, 1, null, ['c1', 'c2']], 'one reader per chunk: a zero, with no estimate');
  const S0 = makeS();
  passes(ltz(['snapshot', S0, 'u1', '0']));
  passes(ltz(['queue', S0, 'u1', '0', 'init', '--opaque', '--per-chunk', '1']));
  const rd0 = RD(S0, 'u1', 0);
  const slot = rj(path.join(rd0, 'queue.json')).groups[0].slots[0];
  passes(ltz(['render', S0, 'u1', '0', slot, '1', '3']));
  const byId = new Map(rjl(path.join(rd0, 'snapshot.jsonl')).map((x) => [x.id, x]));
  wjl(path.join(rd0, `agent-${slot}.jsonl`), ['A01', 'A02', 'A03'].map((id) => ({ unit: 'u1', id, verdict: 'ok', note: 'holds', cites: byId.get(id).cites })));
  passes(ltz(['queue', S0, 'u1', '0', 'mark', slot, 'done']));
  wj(path.join(rd0, 'confirmed.json'), {});
  passes(ltz(['record', S0, 'u1', '0', '--chunk-readers', `c1=${slot}`]));
  const m0 = rj(path.join(rd0, 'measure.json'));
  eq([m0.fullDepth, m0.countsAsZero, m0.chunks.c1.readers], [true, false, [slot]], 'r0 with its one opaque reader');
});

// ---- diffcheck
function fixlog(S, rows) {
  wjl(path.join(RD(S), 'fixlog.jsonl'), rows);
}
const fl = (id, field, o, n, extra = {}) => ({ id, field, old: o, new: n, ...extra });
/** "judged" entries for these hit locations. */
const J = (...locs) => locs.map((at) => ({ at, why: 'judged at the pin: not a counterexample' }));
// RATE at the pin: src/billing.js lines 2 ("export const RATE = 0.2;") and 4 ("return amount * RATE;").
const RATE_SRC = ['src/billing.js:2', 'src/billing.js:4'];
test('diffcheck: a logged, clean change passes', () => {
  const S = makeS();
  snap(S);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'no change, no fixlog');
  setItems(S, [['A01', 'title', 'login delegates to check']]);
  fixlog(S, [fl('A01', 'title', 'login calls check', 'login delegates to check')]);
  passes(ltz(['diffcheck', S, 'u1', '1']));
});
test('diffcheck: an unlogged change fails', () => {
  const S = makeS();
  snap(S);
  setItems(S, [['A01', 'title', 'login delegates to check'], ['A04', 'cites', ['src/billing.js:3']]]);
  fixlog(S, [fl('A01', 'title', 'login calls check', 'login delegates to check')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /MISMATCH: A04\.cites changed .* but is not in fixlog\.jsonl/);
});
test('diffcheck: a logged id with no change fails', () => {
  const S = makeS();
  snap(S);
  fixlog(S, [fl('A04', 'title', 'the rate is 0.2', 'the rate is 20%')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /MISMATCH: A04 is in fixlog\.jsonl but did not change/);
});
test('diffcheck: fixlog text that differs from the item fails', () => {
  const S = makeS();
  snap(S);
  setItems(S, [['A01', 'title', 'login delegates to check']]);
  fixlog(S, [fl('A01', 'title', 'login calls check', 'login delegates to check()')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /A01\.title: fixlog "new" .* is not the current value/);
});
test('diffcheck: an added "only" without a logged search fails; with search+hits (even 0) it passes', () => {
  const S = makeS();
  snap(S);
  setItems(S, [['A01', 'title', 'login delegates only to check']]);
  fixlog(S, [fl('A01', 'title', 'login calls check', 'login delegates only to check')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /FLAG: A01\.title: changed clause holds universal word\(s\) "only" with no fixlog "search" \+ "hits" for A01\.title/);
  fixlog(S, [fl('A01', 'title', 'login calls check', 'login delegates only to check', { search: { regex: 'NO_SUCH_CALLER' }, hits: 0, judged: [], blindSpots: 'names built at run time' })]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: backed by a search (0 hits is a valid count)');
  fixlog(S, [fl('A01', 'title', 'login calls check', 'login delegates only to check', { search: { regex: 'check\\(' }, hits: '2', blindSpots: 'aliases' })]);
  fails(ltz(['diffcheck', S, 'u1', '1', '--no-verify-searches']), /changed clause holds universal/, 'hits must be a number');
});
test('diffcheck: a KEPT universal in a changed clause ("only A" -> "only A and B") fails without a search', () => {
  const S = makeS();
  setItems(S, [['A01', 'title', 'only the API imports X']]);
  snap(S);
  setItems(S, [['A01', 'title', 'only the API and the worker import X']]);
  fixlog(S, [fl('A01', 'title', 'only the API imports X', 'only the API and the worker import X')]);
  const r = fails(ltz(['diffcheck', S, 'u1', '1']), /A01\.title: changed clause holds universal word\(s\) "only"/);
  ok(/A01\.title: list joined by "and" inside a universal clause/.test(r.out), `2-member list flagged:\n${r.out}`);
  ok(!/added universal/.test(r.out), 'the word was kept, not added');
  // A search logged for another field of the same id does not back this field.
  const search = { search: { regex: 'import X' }, hits: 0, judged: [], blindSpots: 'dynamic imports' };
  setItems(S, [['A01', 'plan', 'review the import']]);
  fixlog(S, [fl('A01', 'title', 'only the API imports X', 'only the API and the worker import X'), fl('A01', 'plan', 'keep as is', 'review the import', search)]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /A01\.title: changed clause holds universal/, 'search is per id+field');
  setItems(S, [['A01', 'plan', 'keep as is']]);
  fixlog(S, [fl('A01', 'title', 'only the API imports X', 'only the API and the worker import X', search)]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: the same change with search+hits for A01.title');
});
test('diffcheck: a universal kept in an UNCHANGED clause is not flagged', () => {
  const S = makeS();
  setItems(S, [['A01', 'title', 'only the API imports X. It caches.']]);
  snap(S);
  setItems(S, [['A01', 'title', 'only the API imports X. It stores results.']]);
  fixlog(S, [fl('A01', 'title', 'only the API imports X. It caches.', 'only the API imports X. It stores results.')]);
  passes(ltz(['diffcheck', S, 'u1', '1']));
  setItems(S, [['A01', 'title', 'only the API imports X. It always stores results.']]);
  fixlog(S, [fl('A01', 'title', 'only the API imports X. It caches.', 'only the API imports X. It always stores results.')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /changed clause holds universal word\(s\) "always".*"It always stores results"/, 'a universal in the changed clause');
});
test('diffcheck: a flagged clause clears by removing the universal word, not by a hedge', () => {
  const S = makeS();
  setItems(S, [['A01', 'title', 'only the API imports X']]);
  snap(S);
  const change = (to) => {
    setItems(S, [['A01', 'title', to]]);
    fixlog(S, [fl('A01', 'title', 'only the API imports X', to)]);
    return ltz(['diffcheck', S, 'u1', '1']);
  };
  passes(change('the API imports X'), 'the universal word removed from the clause');
  passes(change('the API and the worker import X'), 'removed, even with a list');
  fails(change('probably only the API imports X'), /changed clause holds universal word\(s\) "only"/, 'a hedge in front');
  fails(change('only the API imports X, as far as we can tell'), /changed clause holds universal word\(s\) "only"/, 'a hedge appended');
  fails(change('only the API imports X in most builds'), /changed clause holds universal word\(s\) "only"/, 'a scope hedge');
});
/**
 * A01's title changed with a logged search; returns diffcheck's result. "judged" holds one entry per
 * location in `at` (the hit locations at the pin, known from the fixture), and blindSpots is given,
 * unless `entry` overrides them.
 */
function verifyRun(S, search, hits, { at = [], entry = {}, args = [], text = 'only billing reads RATE' } = {}) {
  setItems(S, [['A01', 'title', text]]);
  fixlog(S, [fl('A01', 'title', 'login calls check', text, { search, hits, judged: J(...at), blindSpots: 'names built at run time; aliases', ...entry })]);
  return ltz(['diffcheck', S, 'u1', '1', ...args]);
}
test('diffcheck --verify-searches: a structured search is run at the pin and its hits must match', () => {
  const S = makeS();
  snap(S);
  let r = passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { at: RATE_SRC }), 'RATE is on 2 lines under src/ at the pin');
  ok(/searches verified at the pin/.test(r.out), r.out);
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 3), /MISMATCH: A01\.title \(fixlog line 1\): search \/RATE\/ logs hits 3, but the pin has 2 matches/);
  passes(verifyRun(S, { regex: 'V1-LINE', paths: ['src/*.js'] }, 1, { at: ['src/auth.js:3'] }), 'counted at the pin (HEAD and the working tree say HEAD-/WORKTREE-LINE)');
  fails(verifyRun(S, { regex: 'V1-LINE', paths: ['src/*.js'] }, 0), /the pin has 1 matches/, 'not counted in HEAD or the working tree');
  passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'], count: 'files' }, 1, { at: ['src/billing.js'] }), 'count: files');
  fails(verifyRun(S, { regex: '(unclosed', paths: ['src/**'] }, 0), /does not compile/);
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, '2'), /logs hits "2"/, 'hits must be a number');
  passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { at: RATE_SRC, args: ['--verify-searches'] }), '--verify-searches is accepted (it is the default)');
  r = passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 99, { at: Array.from({ length: 99 }, (_, i) => `src/x.js:${i + 1}`), args: ['--no-verify-searches'] }), '--no-verify-searches skips running searches');
  ok(/WARNING: 1 search\(es\) were not run at the pin/.test(r.out), r.out);
  fails(verifyRun(S, { regex: 'RATE' }, 2, { args: ['--verify-searches', '--no-verify-searches'] }), /not both/);
});
test('diffcheck searches: free text fails; paths narrower than boundaryPaths fail without a scopeNote', () => {
  const S = makeS({ config: { boundaryPaths: ['src/**', 'docs/**', 'config/**'] } });
  snap(S);
  fails(verifyRun(S, 'rg -n RATE src', 2), /MISMATCH: A01\.title \(fixlog line 1\): a free-text search cannot be run at the pin/);
  fails(verifyRun(S, 'rg -n RATE src', 2, { entry: { scopeNote: 'only src matters' } }), /free-text search cannot be run/, 'a scopeNote does not make free text checkable');
  passes(verifyRun(S, 'rg -n RATE src', 2, { args: ['--no-verify-searches'] }), 'free text is only accepted with --no-verify-searches');
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2), /search paths cover \d+ of the \d+ files in boundaryPaths .*widen "paths" to the boundary, or give a "scopeNote"/);
  const bounded = { text: 'only billing reads RATE, in the src folder', entry: { scopeNote: 'the claim is about src only', scopeText: 'in the src folder' } };
  let r = passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { ...bounded, at: RATE_SRC }), 'a scopeNote with a scopeText the item states');
  ok(/bounded on purpose \(scopeNote: the claim is about src only\)/.test(r.out), r.out);
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { entry: { scopeNote: '  ' } }), /widen "paths"/, 'a blank scopeNote is not a note');
  r = passes(verifyRun(S, { regex: 'RATE' }, 2, { at: RATE_SRC }), 'no paths: the whole boundary is searched');
  ok(!/boundaryPaths/.test(r.out), 'control: not narrower');
  r = passes(verifyRun(S, { regex: 'RATE', paths: ['**'] }, 2, { at: RATE_SRC }));
  ok(!/boundaryPaths/.test(r.out), 'control: paths wider than the boundary');
});
test('diffcheck: a scopeNote needs a scopeText that appears in the new text', () => {
  const S = makeS({ config: { boundaryPaths: ['src/**', 'docs/**', 'config/**'] } });
  snap(S);
  const run = (entry, text = 'only billing reads RATE, in the src folder') => verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { text, at: RATE_SRC, entry: { scopeNote: 'bounded to src', ...entry } });
  passes(run({ scopeText: 'in the src folder' }), 'stated in the item');
  passes(run({ scopeText: 'IN THE  SRC FOLDER' }), 'compared case-insensitively (and spacing-insensitively)');
  fails(run({}), /a "scopeNote" needs a "scopeText"/, 'scopeText missing');
  fails(run({ scopeText: ' ' }), /needs a "scopeText"/, 'blank scopeText');
  fails(run({ scopeText: 'in the src folder' }, 'only billing reads RATE'), /"scopeText" "in the src folder" does not appear in the new text, so the item never states the bound/, 'the item never states the bound');
  fails(run({ scopeText: 'outside tests' }), /does not appear in the new text/, 'a scopeText the item does not say');
  run({ scopeText: 'in the src folder' }, 'only billing reads RATE'); // leaves that fixlog in place
  fails(ltz(['diffcheck', S, 'u1', '1', '--no-verify-searches']), /does not appear in the new text/, 'checked even with --no-verify-searches');
  // A follow-up edit that drops the bound: the scopeText is checked against the field's current text.
  const first = fl('A01', 'title', 'login calls check', 'only billing reads RATE, in the src folder', {
    search: { regex: 'RATE', paths: ['src/**'] }, hits: 2, judged: J(...RATE_SRC), blindSpots: 'x', scopeNote: 'bounded to src', scopeText: 'in the src folder',
  });
  setItems(S, [['A01', 'title', 'only billing reads RATE']]);
  fixlog(S, [first, fl('A01', 'title', 'only billing reads RATE, in the src folder', 'only billing reads RATE')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /fixlog line 1\): "scopeText" "in the src folder" does not appear in the new text/, 'the follow-up dropped the bound');
  setItems(S, [['A01', 'title', 'only billing reads RATE, still in the src folder']]);
  fixlog(S, [first, fl('A01', 'title', 'only billing reads RATE, in the src folder', 'only billing reads RATE, still in the src folder')]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: the follow-up keeps the bound');
});
test('diffcheck searches: "judged" lists every hit at the pin with a reason; a count alone is refused', () => {
  const S = makeS();
  snap(S);
  const RATE = { regex: 'RATE', paths: ['src/**'] };
  passes(verifyRun(S, RATE, 2, { at: RATE_SRC }), 'control');
  passes(verifyRun(S, RATE, 2, { at: ['SRC\\Billing.js:4', './src/billing.js:2'] }), 'compared case- and slash-insensitively, in any order');
  fails(verifyRun(S, RATE, 2, { at: RATE_SRC, entry: { hitsJudged: 2 } }), /"hitsJudged" is no longer accepted: a count proves nothing about each hit\. Give "judged"/, 'the old field');
  fails(verifyRun(S, RATE, 2, { entry: { judged: undefined } }), /a structured search needs "judged": \[\{"at": "path:line", "why": "<short reason>"\}\]/, 'no judged');
  fails(verifyRun(S, RATE, 2, { entry: { judged: [{ at: 'src/billing.js:2', why: 'x' }, { at: 'src/billing.js:4', why: ' ' }] } }), /"judged"\[1\] \(src\/billing\.js:4\) needs a non-empty "why"/, 'a missing why');
  fails(verifyRun(S, RATE, 2, { entry: { judged: [{ at: 'src/billing.js:2', why: 'x' }, { why: 'x' }] } }), /"judged"\[1\] needs an "at"/, 'a missing at');
  let r = fails(verifyRun(S, RATE, 2, { at: ['src/billing.js:2', 'src/billing.js:5'] }), /"judged" leaves out hit\(s\) at the pin: src\/billing\.js:4$/m, 'a wrong location');
  ok(/"judged" names location\(s\) that are not hits at the pin: src\/billing\.js:5$/m.test(r.out), r.out);
  fails(verifyRun(S, RATE, 2, { at: ['src/billing.js:2', 'src/billing.js:2'] }), /not hits at the pin: src\/billing\.js:2 \(1 hit, judged 2\)/, 'a duplicate location');
  fails(verifyRun(S, RATE, 2, { at: ['src/billing.js:2'] }), /leaves out hit\(s\) at the pin: src\/billing\.js:4/, 'fewer judged than hits');
  fails(verifyRun(S, RATE, 3, { at: [...RATE_SRC, 'src/billing.js:9'] }), /logs hits 3, but the pin has 2 matches/, 'a count mismatch');
  // --no-verify-searches: only the shape and the count; the locations are not verified.
  r = passes(verifyRun(S, RATE, 2, { at: ['anything:1', 'anything:2'], args: ['--no-verify-searches'] }));
  ok(/were not run at the pin \(--no-verify-searches\), so their hits and "judged" locations were not verified/.test(r.out), r.out);
  fails(verifyRun(S, RATE, 2, { at: ['src/billing.js:2'], args: ['--no-verify-searches'] }), /"judged" has 1 entries, but "hits" is 2; give one entry per hit/, 'a count mismatch without verification');
  fails(verifyRun(S, RATE, 2, { entry: { judged: [{ at: 'a:1', why: '' }, { at: 'a:2', why: 'x' }] }, args: ['--no-verify-searches'] }), /"judged"\[0\] \(a:1\) needs a non-empty "why"/);
  fails(verifyRun(S, RATE, 2, { at: RATE_SRC, entry: { hitsJudged: 2 }, args: ['--no-verify-searches'] }), /"hitsJudged" is no longer accepted/, 'the old field without verification');
});
test('diffcheck searches: a structured search needs blindSpots (even without verification)', () => {
  const S = makeS();
  snap(S);
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { entry: { blindSpots: undefined } }), /a structured search needs "blindSpots"/);
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { entry: { blindSpots: ' ' } }), /needs "blindSpots"/, 'blank');
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { entry: { blindSpots: undefined }, args: ['--no-verify-searches'] }), /needs "blindSpots"/, 'also with --no-verify-searches');
  passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'], blindSpots: 'RATE read through a variable' }, 2, { at: RATE_SRC, entry: { blindSpots: undefined } }), 'blindSpots inside the search object');
  passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { at: RATE_SRC }), 'control');
});
test('diffcheck --verify-searches: a search without paths covers boundaryPaths, not every file', () => {
  // "rate" (case-insensitive) is on 2 lines in src/billing.js and 1 line in docs/spec.md.
  const S = makeS({ config: { boundaryPaths: ['src/**'] } });
  snap(S);
  passes(verifyRun(S, { regex: 'rate', flags: 'i' }, 2, { at: RATE_SRC }), 'only src/ is in the boundary');
  fails(verifyRun(S, { regex: 'rate', flags: 'i' }, 3), /the pin has 2 matches/);
  const S2 = makeS();
  snap(S2);
  passes(verifyRun(S2, { regex: 'rate', flags: 'i' }, 3, { at: [...RATE_SRC, 'docs/spec.md:11'] }), 'control: no boundaryPaths, every file');
});
test('diffcheck --verify-searches: a folder of evidence is scanned', () => {
  const root = path.join(RUN, 'dir-evidence');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'const RATE = 1;\nuse(RATE);\nRATE;\nRATE * RATE;\n');
  fs.writeFileSync(path.join(root, 'notes.md'), 'RATE in prose\n');
  const S = makeS({ config: { evidence: { type: 'dir', root } } });
  snap(S);
  const A = ['src/a.js:1', 'src/a.js:2', 'src/a.js:3', 'src/a.js:4'];
  passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 5, { at: [...A, 'src/a.js:4'] }), 'matches (the default): two on "RATE * RATE", judged twice');
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 5, { at: [...A, 'src/a.js:3'] }), /leaves out hit\(s\) at the pin: src\/a\.js:4 \(2 hits, judged 1\)/, 'a line with two matches judged once');
  passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'], count: 'lines' }, 4, { at: A }), 'count: lines');
  passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'], count: 'files' }, 1, { at: ['src/a.js'] }), 'count: files (judged by path)');
  passes(verifyRun(S, { regex: 'RATE' }, 6, { at: [...A, 'src/a.js:4', 'notes.md:1'] }), 'the whole folder');
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 4), /the pin has 5 matches/, 'a line count is not a match count');
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'], count: 'lines' }, 5), /the pin has 4 matching lines/);
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**'], count: 'words' }, 5), /"count" must be "matches", "lines" or "files"/);
  passes(verifyRun(S, { regex: 'X*', paths: ['notes.md'] }, 14, { at: Array(14).fill('notes.md:1') }), 'zero-length matches are stepped past, not looped on');
});
test('searches: re-runs logged structured searches over boundaryPaths and reports too-narrow scopes', () => {
  // "rate" (case-insensitive): 2 matches in src/, 1 in docs/spec.md.
  const S = makeS({ config: { boundaryPaths: ['src/**', 'docs/**'] } });
  const s = (paths, extra = {}) => ({ search: { regex: 'rate', flags: 'i', ...(paths ? { paths } : {}) }, blindSpots: 'x', ...extra });
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'a', 'b', { ...s(['src/**']), hits: 2 }), fl('A02', 'title', 'a', 'b', { search: 'rg -n rate', hits: 3 })]);
  wjl(path.join(RD(S, 'u2', 1), 'fixlog.jsonl'), [fl('B01', 'title', 'a', 'b', { ...s(['**']), hits: 3 })]);
  const r = fails(ltz(['searches', S]), /1 differ from their logged hits/);
  ok(/DIFFERS u1\/r1 A01\.title \(fixlog line 1\): \/rate\/ logged hits 2 over \["src\/\*\*"\]; boundary-wide 3 matches/.test(r.out), r.out);
  ok(!/B01/.test(r.out.split('\n').filter((l) => l.startsWith('DIFFERS')).join('\n')), 'B01 (a closed unit) matches');
  ok(/1 free-text not re-runnable/.test(r.out), 'free text counted, not re-run');
  passes(ltz(['searches', S, '--rounds', 'u2']), 'a closed unit\'s past round, with a sound scope');
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'a', 'b in src', { ...s(['src/**'], { scopeNote: 'only src matters', scopeText: 'in src' }), hits: 2 })]);
  const r2 = passes(ltz(['searches', S, '--rounds', 'u1']), 'a scopeNote is listed apart, not a failure');
  ok(/bounded by a scopeNote/.test(r2.out) && /bounded on purpose: only src matters/.test(r2.out), r2.out);
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'a', 'b', { ...s(['src/**'], { scopeNote: 'only src matters', scopeText: 'in src' }), hits: 2 })]);
  const r3 = fails(ltz(['searches', S, '--rounds', 'u1']), /1 differ/, 'a scopeNote whose scopeText the item never states is not accepted');
  ok(/scopeNote not accepted: "scopeText" "in src" does not appear in the new text/.test(r3.out), r3.out);
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'a', 'b in src', { ...s(['src/**'], { scopeNote: 'only src matters', scopeText: 'in src' }), hits: 2 }), fl('A01', 'title', 'b in src', 'b')]);
  fails(ltz(['searches', S, '--rounds', 'u1']), /1 differ/, 'a later entry in the round dropped the bound');
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A02', 'title', 'a', 'b', { search: 'rg -n rate', hits: 3 })]);
  fails(ltz(['searches', S, '--rounds', 'u1']), /no structured fixlog searches in u1; nothing to re-run/);
  fails(ltz(['searches', S, '--rounds', 'u9']), /not in config\.json "units"/);
});
test('snapshot: records the evidence pin each round reads (git commit resolved) in pin.json', () => {
  const S = makeS();
  snap(S);
  const pin = rj(path.join(RD(S), 'pin.json'));
  ok(Array.isArray(pin.sources) && pin.sources.length === 1, JSON.stringify(pin));
  const s = pin.sources[0];
  eq(s.type, 'git');
  eq(s.pin, 'v1');
  eq(s.commit, git(['rev-parse', 'v1^{commit}']).trim(), 'the tag resolved to its commit');
});
test('searches: a round snapshotted at an earlier pin is re-run at its own pin, not the moved one', () => {
  // V1-LINE matches src/auth.js:3 at v1 only; HEAD changed that line.
  const S = makeS();
  snap(S);
  wjl(path.join(RD(S), 'fixlog.jsonl'), [fl('A01', 'title', 'a', 'b', { search: { regex: 'V1-LINE' }, hits: 1, blindSpots: 'x' })]);
  passes(ltz(['searches', S, '--rounds', 'u1']), 'same pin: 1 hit');
  const cfg = rj(path.join(S, 'config.json'));
  wj(path.join(S, 'config.json'), { ...cfg, evidence: { ...cfg.evidence, pin: 'HEAD' } });
  const r = passes(ltz(['searches', S, '--rounds', 'u1']), 'the pin moved, but the round is re-run at its own pin');
  ok(/1 round\(s\) re-run at their own snapshot pin/.test(r.out), r.out);
  fs.rmSync(path.join(RD(S), 'pin.json'));
  const r2 = fails(ltz(['searches', S, '--rounds', 'u1']), /1 differ/, 'control: with no pin.json the current pin is used, and the search no longer hits');
  ok(/1 round\(s\) with no pin\.json, re-run at the current pin/.test(r2.out), r2.out);
});
test('searches --at-current: re-runs a round at the moved pin, not its own', () => {
  const S = makeS();
  snap(S);
  wjl(path.join(RD(S), 'fixlog.jsonl'), [fl('A01', 'title', 'a', 'b', { search: { regex: 'V1-LINE' }, hits: 1, blindSpots: 'x' })]);
  passes(ltz(['searches', S, '--rounds', 'u1', '--at-current']), 'control: the pin has not moved, so the bound holds at the current pin');
  const cfg = rj(path.join(S, 'config.json'));
  wj(path.join(S, 'config.json'), { ...cfg, evidence: { ...cfg.evidence, pin: 'HEAD' } });
  passes(ltz(['searches', S, '--rounds', 'u1']), 'without the flag: its own pin, still 1 hit');
  const r = fails(ltz(['searches', S, '--rounds', 'u1', '--at-current']), /1 differ/, 'at the moved pin the logged bound no longer holds');
  ok(/1 snapshotted at another pin/.test(r.out), r.out);
});
test('record: warns when the evidence pin moved since the round\'s snapshot', () => {
  const S = baseCopy();
  passes(ltz(['record', S, 'u1', '1', ...READERS]), 'control: same pin');
  ok(!/pin moved/.test(ltz(['record', S, 'u1', '1', ...READERS]).out), 'no warning at the same pin');
  const cfg = rj(path.join(S, 'config.json'));
  wj(path.join(S, 'config.json'), { ...cfg, evidence: { ...cfg.evidence, pin: 'HEAD' } });
  const r = ltz(['record', S, 'u1', '1', ...READERS]);
  ok(/WARNING: evidence pin moved since this round's snapshot/.test(r.out), r.out);
});
test('record: a wrong whose note starts "self-contradiction:" needs no evidence file:line (the item refutes itself)', () => {
  const S = makeS();
  snap(S);
  const self = { verdict: 'wrong', note: 'self-contradiction: the title says 2 + 2 = 5', class: ['C2'] };
  reader(S, 'c1-a', 1, 6, { A04: self });
  reader(S, 'c1-b', 1, 6, { A04: self });
  reader(S, 'c2-a', 7, 12);
  reader(S, 'c2-b', 7, 12);
  wj(path.join(RD(S), 'confirmed.json'), { A04: { note: 'self-contradiction: 2 + 2 is not 5', class: 'C2' } });
  const r = ltz(['record', S, 'u1', '1', ...READERS]);
  ok(!/A04.*names no file:line/.test(r.out), r.out);
  reader(S, 'c1-b', 1, 6, { A04: { verdict: 'wrong', note: 'the sum is off', class: ['C2'] } });
  ok(/A04.*wrong, but its note names no file:line/.test(ltz(['record', S, 'u1', '1', ...READERS]).out), 'control: without the prefix a file:line is still required');
  reader(S, 'c1-b', 1, 6, { A04: { verdict: 'wrong', note: '  self-contradiction: 2 + 2 is not 5', class: ['C2'] } });
  ok(!/A04.*names no file:line/.test(ltz(['record', S, 'u1', '1', ...READERS]).out), 'leading spaces before the prefix are allowed');
  reader(S, 'c1-b', 1, 6, { A04: { verdict: 'wrong', note: 'sssself-contradiction: 2 + 2 is not 5', class: ['C2'] } });
  ok(/A04.*wrong, but its note names no file:line/.test(ltz(['record', S, 'u1', '1', ...READERS]).out), 'a mangled prefix is not the prefix');
});
test('crosscheck: groups items that cite the same line and flags differing numbers among them', () => {
  const its = [
    item('A01', 'timeout is 30 seconds', ['config/app.json:2']),
    item('A02', 'the timeout is 60', ['config/app.json:2']),
    item('A03', 'timeout 30', ['config/app.json:2']),
    item('A04', 'retries is 3', ['config/app.json:3']),
    item('A05', 'retries are 3', ['config/app.json:3']),
    item('A06', 'login calls check', ['src/auth.js:3']),
  ];
  const S = makeS({ items: its });
  const r = passes(ltz(['crosscheck', S]));
  ok(/config\/app\.json:2: 3 items \(A01, A02, A03\); numbers differ: A01 \[30\], A02 \[60\], A03 \[30\]/.test(r.out), r.out);
  ok(/config\/app\.json:3: 2 items \(A04, A05\)/.test(r.out) && !/app\.json:3.*differ/.test(r.out), r.out);
  ok(!/src\/auth\.js:3/.test(r.out), 'a cite only one item uses is not a family');
  ok(/2 shared cite\(s\), 1 with differing numbers/.test(r.out), r.out);
  const r2 = passes(ltz(['crosscheck', S, '--unit', 'u2']));
  ok(/0 shared cite/.test(r2.out), r2.out);
});
test('reach: items citing changed files, universal items whose search hits change, and universal items with no search', () => {
  // Between v1 and HEAD only src/auth.js changes (line 3: V1-LINE-3 -> HEAD-LINE-3).
  const S = makeS();
  snap(S);
  fixlog(S, [
    fl('A07', 'title', 'positive amounts are charged', 'only positive amounts are charged', { search: { regex: 'HEAD-LINE|charge' } }),
    fl('A05', 'title', 'admins approve refunds', 'Refunds: Only admins approve refunds', { search: { regex: 'admins' } }),
  ]);
  const r = passes(ltz(['reach', S, '--to', 'HEAD']));
  ok(/between v1 and HEAD: 1 file\(s\) \(src\/auth\.js\)/.test(r.out), r.out);
  ok(/u1 \(12 items, open\): cite a changed file 4; universal, search hits change 1; universal, no search to re-run 0/.test(r.out), r.out);
  ok(/cites: A01, A02, A03, A12/.test(r.out), r.out);
  ok(r.out.includes('search: A07 /HEAD-LINE|charge/ (u1/r1): 1 -> 2 matches'), r.out);
  ok(!/A05/.test(r.out), 'a universal item whose search finds the same hits is not reached');
  ok(/u2 \(2 items, closed\): cite a changed file 0/.test(r.out), r.out);
  ok(/reach: 4 item\(s\) cite a changed file, 1 universal item\(s\) whose search hits change, 0 universal/.test(r.out), r.out);
  fixlog(S, []);
  const r2 = passes(ltz(['reach', S, '--to', 'HEAD', '--unit', 'u1']));
  ok(/universal, no search to re-run 2/.test(r2.out) && /unsearched: A05 \[only\], A07 \[only\]/.test(r2.out), r2.out);
  ok(!/A06/.test(r2.out), '"onlyx" holds no universal word');
  ok(!/u2 \(/.test(r2.out), '--unit limits the report');
  const S3 = makeS({ config: { boundaryPaths: ['docs/**', 'config/**'] } });
  const r3 = passes(ltz(['reach', S3, '--to', 'HEAD']));
  ok(/0 file\(s\)/.test(r3.out) && /cite a changed file 0/.test(r3.out), 'a change outside boundaryPaths reaches nothing it cites');
  fails(ltz(['reach', S3]), /needs --to/);
  fails(ltz(['reach', S3, '--to', 'no-such-rev']), /git diff v1 no-such-rev failed/);
});
test('sweep --count: only counts per pattern and unit, never the hits; known instances still checked', () => {
  const S = makeS();
  const f = patFile(S, ONLY);
  const r = passes(ltz(['sweep', S, f, '--count']));
  ok(/U-only \(U1\)  u1: 2 items, 2 matches/.test(r.out) && /U-only \(U1\)  u2: 0 items, 0 matches/.test(r.out), r.out);
  ok(/total: 2 items, 2 matches in 14 items/.test(r.out), r.out);
  ok(!/A0\d|B0\d|Only admins|only positive/.test(r.out), `no ids or hit text:\n${r.out}`);
  ok(/A05/.test(passes(ltz(['sweep', S, f])).out), 'control: without --count the hits are printed');
  fails(ltz(['sweep', S, patFile(S, { ...ONLY, knownInstances: ['A06'] }), '--count']), /pattern too narrow/, 'known instances still refused');
  const cls = patFile(S, [ONLY, { id: 'U-null', class: 'U1', regex: 'null', fields: ['title'], knownInstances: ['A03'] }], 'cls.json');
  const r2 = passes(ltz(['sweep', S, cls, '--count', '--unit', 'u1']));
  ok(/U-only \(U1\)  u1: 2 items/.test(r2.out) && /U-null \(U1\)  u1: 1 items, 1 matches/.test(r2.out) && !/u2:/.test(r2.out), r2.out);
});
/** S with a third, open unit u3 (C01, C02), both u1 and u3 snapshotted. */
function crossS() {
  const S = makeS({
    items: [...ITEMS, { id: 'C01', unit: 'u3', title: 'third one', plan: 'keep', reason: 'r', cites: [] }, { id: 'C02', unit: 'u3', title: 'third two', plan: 'keep', reason: 'r', cites: [] }],
    config: { units: { u1: { status: 'open', itemFiles: ['docs/spec.md'] }, u2: { status: 'closed', itemFiles: ['docs/closed.md'] }, u3: { status: 'open', itemFiles: [] } } },
  });
  snap(S);
  passes(ltz(['snapshot', S, 'u3', '1']));
  return S;
}
test('diffcheck: cross-unit edits (entries with "unit") must equal that unit\'s changes since its snapshot', () => {
  const S = crossS();
  setItems(S, [['C01', 'title', 'the third one, edited by a u1 sweep']]);
  fixlog(S, [fl('C01', 'title', 'third one', 'the third one, edited by a u1 sweep', { unit: 'u3' })]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'logged with its unit');
  fixlog(S, [fl('C01', 'title', 'third one', 'the third one, edited by a u1 sweep')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /C01 belongs to unit u3; a cross-unit edit needs "unit": "u3"/, 'no "unit"');
  setItems(S, [['C01', 'plan', 'also changed']]);
  fixlog(S, [fl('C01', 'title', 'third one', 'the third one, edited by a u1 sweep', { unit: 'u3' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /u3: C01\.plan changed since u3\/r1 but is logged neither here/, 'an unlogged change in the other unit');
  setItems(S, [['C01', 'plan', 'keep']]);
  fixlog(S, [fl('C01', 'title', 'third one', 'the third one, edited by a u1 sweep', { unit: 'u3' }), fl('C02', 'title', 'third two', 'x', { unit: 'u3' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /C02\.title is logged for unit u3 but did not change since u3\/r1/, 'a logged change that did not happen');
  fixlog(S, [fl('C01', 'title', 'third one', 'something else', { unit: 'u3' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /u3: C01\.title: no logged "new" is the current value/, 'logged text differs');
  fixlog(S, [fl('C01', 'title', 'not what u3/r1 holds', 'the third one, edited by a u1 sweep', { unit: 'u3' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /u3: C01\.title: no logged "old" is the u3\/r1 snapshot value/, 'logged old differs');
  // u3's own fixes since its snapshot also explain its changes.
  wjl(path.join(RD(S, 'u3', 1), 'fixlog.jsonl'), [fl('C02', 'title', 'third two', 'third two fixed')]);
  setItems(S, [['C02', 'title', 'third two fixed']]);
  fixlog(S, [fl('C01', 'title', 'third one', 'the third one, edited by a u1 sweep', { unit: 'u3' })]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'u3\'s own round fixes count');
  fixlog(S, [fl('C01', 'title', 'third one', 'the third one, edited by a u1 sweep', { unit: 'u9' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /"unit": "u9" is not a unit in config\.json/);
});
test('diffcheck: a cross-unit edit to a unit with no snapshot is refused', () => {
  const S = makeS({
    items: [...ITEMS, { id: 'C01', unit: 'u3', title: 'third one', plan: 'keep', reason: 'r', cites: [] }],
    config: { units: { u1: { status: 'open', itemFiles: [] }, u2: { status: 'closed', itemFiles: [] }, u3: { status: 'open', itemFiles: [] } } },
  });
  snap(S);
  setItems(S, [['C01', 'title', 'edited']]);
  fixlog(S, [fl('C01', 'title', 'third one', 'edited', { unit: 'u3' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /unit u3 has no round snapshot to compare its cross-unit edits with/);
});
test('diffcheck: cross-unit edits over several rounds, while the other unit is not snapshotted again', () => {
  const S = crossS();
  setItems(S, [['C01', 'title', 'the third one, edited in u1 r1']]);
  fixlog(S, [fl('C01', 'title', 'third one', 'the third one, edited in u1 r1', { unit: 'u3' })]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'u1 r1');
  passes(ltz(['snapshot', S, 'u1', '2', '--chunk-size', '6']), 'u1 r2 baseline');
  setItems(S, [['C02', 'title', 'the third two, edited in u1 r2']]);
  const r2log = path.join(RD(S, 'u1', 2), 'fixlog.jsonl');
  wjl(r2log, [fl('C02', 'title', 'third two', 'the third two, edited in u1 r2', { unit: 'u3' })]);
  passes(ltz(['diffcheck', S, 'u1', '2']), 'the u1/r1 entry explains C01, which u3 has not re-snapshotted');
  setItems(S, [['C02', 'plan', 'changed by nobody']]);
  fails(ltz(['diffcheck', S, 'u1', '2']), /u3: C02\.plan changed since u3\/r1 but is logged neither here/, 'control: an unlogged third edit still fails');
  setItems(S, [['C02', 'plan', 'keep']]);
  fixlog(S, []);
  fails(ltz(['diffcheck', S, 'u1', '2']), /u3: C01\.title changed since u3\/r1 but is logged neither here/, 'control: without the u1/r1 entry C01 is unexplained');
  // After u3 is snapshotted again, an earlier round's entry that no longer differs is not "logged but unchanged".
  const S2 = crossS();
  setItems(S2, [['C01', 'title', 'the third one, edited in u1 r1']]);
  fixlog(S2, [fl('C01', 'title', 'third one', 'the third one, edited in u1 r1', { unit: 'u3' })]);
  passes(ltz(['snapshot', S2, 'u3', '2']), 'u3 r2 baseline');
  passes(ltz(['snapshot', S2, 'u1', '2', '--chunk-size', '6']), 'u1 r2 baseline');
  setItems(S2, [['C02', 'title', 'the third two, edited in u1 r2']]);
  wjl(path.join(RD(S2, 'u1', 2), 'fixlog.jsonl'), [fl('C02', 'title', 'third two', 'the third two, edited in u1 r2', { unit: 'u3' })]);
  passes(ltz(['diffcheck', S2, 'u1', '2']), 'an old entry is only an explanation');
  wjl(path.join(RD(S2, 'u1', 2), 'fixlog.jsonl'), [fl('C02', 'title', 'third two', 'the third two, edited in u1 r2', { unit: 'u3' }), fl('C01', 'title', 'third one', 'the third one, edited in u1 r1', { unit: 'u3' })]);
  fails(ltz(['diffcheck', S2, 'u1', '2']), /C01\.title is logged for unit u3 but did not change since u3\/r2/, 'control: this round\'s entry still must have happened');
});
test('diffcheck: a cross-unit edit gets the text and regression checks, backed by its own entries', () => {
  const S = crossS();
  setItems(S, [['C01', 'title', 'login calls only the third one']]);
  fixlog(S, [fl('C01', 'title', 'third one', 'login calls only the third one', { unit: 'u3' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /FLAG: C01\.title: changed clause holds universal word\(s\) "only" with no fixlog "search" \+ "hits" for C01\.title/);
  fixlog(S, [fl('C01', 'title', 'third one', 'login calls only the third one', { unit: 'u3', search: { regex: 'NO_SUCH_CALLER' }, hits: 0, judged: [], blindSpots: 'names built at run time' })]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: backed by its own search');
  const pat = { id: 'R1', class: 'U9', regex: '\\bcalls only\\b', fields: ['title'], knownInstances: ['C01'], regression: true };
  wj(path.join(S, 'checks', 'patterns', 'r1.json'), pat);
  fails(ltz(['diffcheck', S, 'u1', '1']), /FLAG: C01: still matches regression pattern R1/, 'regression patterns');
  wj(path.join(S, 'checks', 'patterns', 'r1.json'), { ...pat, regression: false });
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: not a regression pattern');
  // u3's own fixes since its snapshot are u3's diffcheck's to text-check, not this one's.
  wjl(path.join(RD(S, 'u3', 1), 'fixlog.jsonl'), [fl('C02', 'title', 'third two', 'third two is always cached')]);
  setItems(S, [['C02', 'title', 'third two is always cached']]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'u3\'s own fix is not text-checked here');
});
test('diffcheck: edits to a closed unit are flagged (its own changes, and a closed unit sharing the file)', () => {
  const S = makeS();
  snap(S);
  passes(ltz(['snapshot', S, 'u2', '1']));
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: closed unit u2 unchanged since u2/r1');
  setItems(S, [['B01', 'title', 'closed one edited']]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /FLAG: B01: item of closed unit u2 changed since u2\/r1/);
  wjl(path.join(RD(S, 'u2', 1), 'fixlog.jsonl'), [fl('B01', 'title', 'closed one', 'closed one edited')]);
  fails(ltz(['diffcheck', S, 'u2', '1']), /FLAG: B01: unit u2 is closed; a closed unit is not edited/);
  const S2 = makeS();
  snap(S2);
  const r = passes(ltz(['diffcheck', S2, 'u1', '1']), 'a closed unit with no snapshot is a warning, not a pass of nothing');
  ok(/WARNING: closed unit u2 has no round snapshot/.test(r.out), r.out);
});
test('diffcheck: a changed item still matching a regression pattern fails', () => {
  const S = makeS();
  snap(S);
  const pat = { id: 'R1', class: 'U9', regex: '\\bdelegates\\b', fields: ['title'], knownInstances: ['A01'], regression: true };
  wj(path.join(S, 'checks', 'patterns', 'r1.json'), pat);
  setItems(S, [['A01', 'title', 'login delegates to check']]);
  fixlog(S, [fl('A01', 'title', 'login calls check', 'login delegates to check')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /FLAG: A01: still matches regression pattern R1/);
  wj(path.join(S, 'checks', 'patterns', 'r1.json'), { ...pat, regression: false });
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: not a regression pattern');
});
test('diffcheck: a new list without "such as" fails; with "such as" it passes', () => {
  const S = makeS();
  snap(S);
  setItems(S, [['A01', 'plan', 'check the user, the session, and the token']]);
  fixlog(S, [fl('A01', 'plan', 'keep as is', 'check the user, the session, and the token')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /new list with no "such as"/);
  setItems(S, [['A01', 'plan', 'check inputs such as the user, the session, and the token']]);
  fixlog(S, [fl('A01', 'plan', 'keep as is', 'check inputs such as the user, the session, and the token')]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: opened list');
  setItems(S, [['A01', 'plan', 'check the user, the session, and the token, among others']]);
  fixlog(S, [fl('A01', 'plan', 'keep as is', 'check the user, the session, and the token, among others')]);
  passes(ltz(['diffcheck', S, 'u1', '1']), '"among others" opens the list');
  setItems(S, [['A01', 'plan', 'check the user, the session, and the token, and others']]);
  fixlog(S, [fl('A01', 'plan', 'keep as is', 'check the user, the session, and the token, and others')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /new list with no "such as"/, 'control: "and others" is not one of the openers');
});
test('diffcheck: a new list is cleared by a logged search with hits for that id and field; a search for another field or id does not clear it', () => {
  const S = makeS();
  snap(S);
  const list = 'check the user, the session, and the token';
  const search = { search: { regex: 'NO_SUCH_CALLER' }, hits: 0, judged: [], blindSpots: 'names built at run time' };
  setItems(S, [['A01', 'plan', list]]);
  fixlog(S, [fl('A01', 'plan', 'keep as is', list, search)]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'a proven list: search + hits for A01.plan');
  setItems(S, [['A01', 'reason', 'per the spec']]);
  fixlog(S, [fl('A01', 'plan', 'keep as is', list), fl('A01', 'reason', 'per the source', 'per the spec', search)]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /FLAG: A01\.plan: new list with no "such as"/, 'control: a search for A01.reason does not back A01.plan');
  setItems(S, [['A01', 'reason', 'per the source'], ['A02', 'plan', 'review it']]);
  fixlog(S, [fl('A01', 'plan', 'keep as is', list), fl('A02', 'plan', 'keep as is', 'review it', search)]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /FLAG: A01\.plan: new list with no "such as"/, 'control: a search for A02.plan does not back A01.plan');
});
test('diffcheck: shape flags (stacked parentheticals, long sentence, appended clause)', () => {
  const S = makeS();
  snap(S);
  setItems(S, [['A01', 'title', 'login (v1) (checked) delegates to check']]);
  fixlog(S, [fl('A01', 'title', 'login calls check', 'login (v1) (checked) delegates to check')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /stacked parentheticals/);
  const long = Array.from({ length: 61 }, (_, i) => `w${i}`).join(' ') + '.';
  setItems(S, [['A01', 'title', long]]);
  fixlog(S, [fl('A01', 'title', 'login calls check', long)]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /sentence of 61 words/);
  setItems(S, [['A01', 'title', 'login calls check'], ['A03', 'title', 'logout returns null, so callers check it.']]);
  fixlog(S, [fl('A03', 'title', 'logout returns null.', 'logout returns null, so callers check it.')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /A03\.title: clause appended with no sentence stop/);
  setItems(S, [['A03', 'title', 'logout returns null. Callers check it.']]);
  fixlog(S, [fl('A03', 'title', 'logout returns null.', 'logout returns null. Callers check it.')]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: appended as its own sentence');
});
test('diffcheck: a canary found in S/items.jsonl fails', () => {
  const S = makeS();
  snap(S);
  wjl(path.join(S, 'canaries.jsonl'), [CANARIES[0]]);
  const rows = rjl(path.join(S, 'items.jsonl'));
  wjl(path.join(S, 'items.jsonl'), [...rows, { ...CANARIES[0], kind: undefined, unit: 'u2' }]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /A13 is a canary and is in S\/items\.jsonl/);
});

function pipeline(args) {
  // cli | node (cat). Returns both exit codes and what the downstream process received.
  return new Promise((resolve) => {
    const a = spawn(process.execPath, [LTZ, ...args], { env: BASE_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    const b = spawn(process.execPath, ['-e', "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(s))"], { stdio: ['pipe', 'pipe', 'ignore'] });
    a.stdout.pipe(b.stdin);
    a.stderr.resume();
    let down = '';
    b.stdout.on('data', (d) => (down += d));
    const codes = {};
    const done = () => {
      if ('a' in codes && 'b' in codes) resolve({ codeA: codes.a, codeB: codes.b, down, pipefail: codes.a !== 0 ? codes.a : codes.b });
    };
    a.on('close', (c) => ((codes.a = c), done()));
    b.on('close', (c) => ((codes.b = c), done()));
  });
}
test('diffcheck: a failing check inside a pipe still fails (status propagates)', async () => {
  const S = makeS();
  snap(S);
  setItems(S, [['A01', 'title', 'login delegates to check']]);
  const bad = await pipeline(['diffcheck', S, 'u1', '1']);
  ok(bad.codeB === 0, 'the downstream process itself succeeds');
  ok(bad.codeA !== 0, `the CLI exits non-zero inside the pipe (got ${bad.codeA})`);
  ok(bad.pipefail !== 0, 'pipeline status (pipefail) is non-zero');
  ok(/MISMATCH: A01\.title/.test(bad.down) && /FAIL/.test(bad.down), `downstream received the full report:\n${bad.down}`);
  fixlog(S, [fl('A01', 'title', 'login calls check', 'login delegates to check')]);
  const good = await pipeline(['diffcheck', S, 'u1', '1']);
  ok(good.codeA === 0 && good.pipefail === 0, `control: a passing check exits 0 in the pipe (got ${good.codeA})`);
  const bash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (process.platform === 'win32' && fs.existsSync(bash)) {
    setItems(S, [['A01', 'title', 'login delegates again to check']]);
    const q = (s) => `"${s.replace(/\\/g, '/')}"`;
    const r = spawnSync(bash, ['-c', `set -o pipefail; ${q(process.execPath)} ${q(LTZ)} diffcheck ${q(S)} u1 1 | cat > /dev/null`], { env: BASE_ENV, encoding: 'utf8' });
    ok(r.status !== 0, `bash pipefail sees the failure (status ${r.status}) ${r.stderr}`);
  }
});

// ---- sweep
const patFile = (S, p, name = 'p.json') => {
  const f = path.join(path.dirname(S), name);
  wj(f, p);
  return f;
};
const ONLY = { id: 'U-only', class: 'U1', regex: '\\bonly\\b', flags: 'i', fields: ['title'], knownInstances: ['A05'] };
test('sweep: prints hits; known instances hit', () => {
  const S = makeS();
  const r = passes(ltz(['sweep', S, patFile(S, ONLY)]));
  ok(/^A05 /m.test(r.out) && /^A07 /m.test(r.out), 'A05 and A07 hit');
  ok(!/^A06 /m.test(r.out), '"onlyx" is not hit by \\bonly\\b');
  ok(/2 items hit/.test(r.out), 'count');
});
test('sweep: a pattern missing a known instance is refused (too narrow)', () => {
  const S = makeS();
  fails(ltz(['sweep', S, patFile(S, { ...ONLY, knownInstances: ['A05', 'A06'] })]), /pattern too narrow: known instance\(s\) not hit: A06 \(not hit\)/);
  fails(ltz(['sweep', S, patFile(S, { ...ONLY, knownInstances: ['A05', 'Z42'] })]), /Z42 \(no such item\)/);
  fails(ltz(['sweep', S, patFile(S, { ...ONLY, knownInstances: [] })]), /knownInstances" is empty/);
});
test('sweep: the regex runs exactly as written ("onlyx" does not match \\bonly\\b)', () => {
  const S = makeS();
  fails(ltz(['sweep', S, patFile(S, { ...ONLY, knownInstances: ['A06'] })]), /A06 \(not hit\)/);
  passes(ltz(['sweep', S, patFile(S, { ...ONLY, regex: 'only', knownInstances: ['A06'] })]), 'control: an unbounded "only" does hit onlyx');
  fails(ltz(['sweep', S, patFile(S, { ...ONLY, flags: '', knownInstances: ['A05'] })]), /A05 \(not hit\)/, 'no implicit case folding');
});
test('sweep: g/i flags do not skip items (no lastIndex leak)', () => {
  const S = makeS();
  const r = passes(ltz(['sweep', S, patFile(S, { ...ONLY, flags: 'gi', knownInstances: ['A05', 'A07'] })]));
  ok(/^A07 /m.test(r.out), 'A07 hit after A05 (its match is earlier in the string)');
});
test('sweep: a known instance fixed since is found in its round snapshot; --unit filters hits only', () => {
  const S = makeS();
  snap(S);
  setItems(S, [['A05', 'title', 'Refunds: admins approve refunds']]);
  const r = passes(ltz(['sweep', S, patFile(S, ONLY), '--unit', 'u2']));
  ok(/A05: u1\/r1 snapshot/.test(r.out), `known instance found in the snapshot:\n${r.out}`);
  ok(/0 items hit/.test(r.out), 'u2 has no hits');
});
test('sweep: a known instance can be met by a fixlog "new" text (a wrong a fix introduced, fixed since)', () => {
  const S = makeS();
  const pat = patFile(S, { ...ONLY, knownInstances: ['A01'] });
  fails(ltz(['sweep', S, pat]), /A01 \(not hit\)/, 'control: A01 never carried "only" in items or snapshots');
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [
    fl('A01', 'title', 'login calls check', 'login only calls check'),
    fl('A01', 'title', 'login only calls check', 'login calls check'),
  ]);
  const r = passes(ltz(['sweep', S, pat]));
  ok(/A01: u1\/r1 fixlog line 1/.test(r.out), `found in the fixlog:\n${r.out}`);
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'plan', 'keep as is', 'only keep it')]);
  fails(ltz(['sweep', S, pat]), /A01 \(not hit\)/, 'a fixlog text in a field the pattern does not read');
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('Z9', '*', null, { id: 'Z9', unit: 'u1', title: 'only a removed item' })]);
  passes(ltz(['sweep', S, patFile(S, { ...ONLY, knownInstances: ['Z9'] }, 'z.json')]), 'a whole item ("*") in the fixlog');
});
test('sweep --count: patterns with no knownInstances are counted (claim shapes); without --count refused', () => {
  const S = makeS();
  const f = patFile(S, { id: 'shape-only', class: 'U1', regex: '\\bonly\\b', flags: 'i', fields: ['title'] });
  const r = passes(ltz(['sweep', S, f, '--count']));
  ok(/shape-only \(U1\)  u1: 2 items/.test(r.out) && /no knownInstances: counts only/.test(r.out) && /1 pattern\(s\) without knownInstances, counted only/.test(r.out), r.out);
  fails(ltz(['sweep', S, f]), /"knownInstances" is empty for shape-only/, 'without --count it is refused');
  fails(ltz(['sweep', S, patFile(S, { ...ONLY, knownInstances: ['A06'] }, 'k.json'), '--count']), /pattern too narrow/, 'a pattern WITH knownInstances is still held to them');
});
test('sweep: a field no item has is refused', () => {
  const S = makeS();
  fails(ltz(['sweep', S, patFile(S, { ...ONLY, fields: ['titel'] })]), /field "titel" is in no item/);
});
test('sweep: a known instance fixed during discovery is hit in a historyFolders round\'s snapshot or fixlog "new"; refused without historyFolders', () => {
  const S = makeS();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  const withHist = () => wj(cfgP, { ...base, historyFolders: ['discovery'] });
  const noHist = () => wj(cfgP, base);
  const pat = patFile(S, { ...ONLY, knownInstances: ['A01'] });
  const D = path.join(S, 'discovery', 'u1');
  fails(ltz(['sweep', S, pat]), /A01 \(not hit\)/, 'control: A01 carries no "only" in S/');
  // Only in a discovery round's snapshot.
  wjl(path.join(D, 'r2', 'snapshot.jsonl'), [item('A01', 'login only calls check', ['src/auth.js:3'])]);
  fails(ltz(['sweep', S, pat]), /A01 \(not hit\)/, 'negative control: without historyFolders the discovery snapshot is not read');
  withHist();
  let r = passes(ltz(['sweep', S, pat]), 'with historyFolders');
  ok(/A01: discovery\/u1\/r2 snapshot/.test(r.out), `labelled by folder:\n${r.out}`);
  // Only in a discovery round's fixlog "new" value.
  fs.rmSync(path.join(D, 'r2', 'snapshot.jsonl'));
  wjl(path.join(D, 'r3', 'fixlog.jsonl'), [fl('A01', 'title', 'login calls check', 'login only calls check')]);
  r = passes(ltz(['sweep', S, pat]), 'a discovery fixlog "new" text');
  ok(/A01: discovery\/u1\/r3 fixlog line 1/.test(r.out), r.out);
  noHist();
  fails(ltz(['sweep', S, pat]), /A01 \(not hit\)/, 'negative control: without historyFolders the discovery fixlog is not read');
  // An id known only in a history folder is "not hit", not "no such item", when the pattern misses it.
  const z = patFile(S, { ...ONLY, knownInstances: ['Z9'] }, 'z.json');
  wjl(path.join(D, 'r2', 'snapshot.jsonl'), [{ id: 'Z9', unit: 'u1', title: 'nothing here', cites: [] }]);
  fails(ltz(['sweep', S, z]), /Z9 \(no such item\)/, 'control: without historyFolders');
  withHist();
  fails(ltz(['sweep', S, z]), /Z9 \(not hit\)/, 'with historyFolders the history item exists');
  // S/'s own rounds are checked first, so their labels are unchanged.
  snap(S);
  setItems(S, [['A05', 'title', 'Refunds: admins approve refunds']]);
  wjl(path.join(D, 'r2', 'snapshot.jsonl'), [item('A05', 'Only admins approve refunds', [])]);
  ok(/A05: u1\/r1 snapshot/.test(passes(ltz(['sweep', S, patFile(S, ONLY)])).out), 'S/ first');
  // A bad historyFolders is a PROBLEM even when every known instance is hit in the current items.
  setItems(S, [['A05', 'title', 'Refunds: Only admins approve refunds']]);
  wj(cfgP, { ...base, historyFolders: ['nope'] });
  fails(ltz(['sweep', S, patFile(S, ONLY)]), /PROBLEM: config\.json: history folder nope not found/, 'a missing folder');
  fails(ltz(['sweep', S, patFile(S, ONLY), '--count']), /history folder nope not found/, 'a missing folder, --count');
  wj(cfgP, { ...base, historyFolders: 'discovery' });
  fails(ltz(['sweep', S, patFile(S, ONLY)]), /"historyFolders" must be an array/, 'not an array');
  noHist();
  passes(ltz(['sweep', S, patFile(S, ONLY)]), 'control: no historyFolders');
});

// ---- flips
test('flips: detects A->B->A across rounds (numeric round order); none for A->B->C', () => {
  const S = makeS();
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'X', 'Y'), fl('A02', 'title', 'P', 'Q')]);
  wjl(path.join(RD(S, 'u1', 2), 'fixlog.jsonl'), [fl('A01', 'title', 'Y', 'X'), fl('A02', 'title', 'Q', 'R'), fl('A03', 'plan', 'M', 'N')]);
  wjl(path.join(RD(S, 'u1', 10), 'fixlog.jsonl'), [fl('A03', 'plan', 'N', 'M ')]);
  const r = fails(ltz(['flips', S, 'u1']), /2 unexplained flip\(s\)/);
  ok(/FLIP A01\.title: returned in r2 to a value first held in r1: "X"/.test(r.out), 'A01 flip');
  ok(/FLIP A03\.plan: returned in r10 to a value first held in r2/.test(r.out), 'A03 flip found in r10 (numeric order, whitespace-normalised)');
  ok(!/A02/.test(r.out.split('\n').filter((l) => l.startsWith('FLIP')).join('\n')), 'A02 (P->Q->R) is not a flip');
  const S2 = makeS();
  wjl(path.join(RD(S2, 'u1', 1), 'fixlog.jsonl'), [fl('A02', 'title', 'P', 'Q')]);
  wjl(path.join(RD(S2, 'u1', 2), 'fixlog.jsonl'), [fl('A02', 'title', 'Q', 'R')]);
  passes(ltz(['flips', S2, 'u1']), 'control: no flips');
});

test('flips: a return carrying a ruling is ruling-explained and passes; without one it fails', () => {
  const S = makeS();
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'X', 'Y')]);
  wjl(path.join(RD(S, 'u1', 2), 'fixlog.jsonl'), [fl('A01', 'title', 'Y', 'X', { ruling: 'D-12' })]);
  const r = passes(ltz(['flips', S, 'u1']));
  ok(/ruling-explained/.test(r.out) && /RULING D-12: A01\.title returned in r2 to a value first held in r1/.test(r.out), r.out);
  ok(/0 unexplained flip\(s\), 1 ruling-explained/.test(r.out) && !/^FLIP/m.test(r.out), r.out);
  const S2 = makeS();
  wjl(path.join(RD(S2, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'X', 'Y', { ruling: 'D-12' })]);
  wjl(path.join(RD(S2, 'u1', 2), 'fixlog.jsonl'), [fl('A01', 'title', 'Y', 'X')]);
  fails(ltz(['flips', S2, 'u1']), /FLIP A01\.title.*\n?.*1 unexplained flip\(s\), 0 ruling-explained/s, 'a ruling on the first change does not explain the return');
  const S3 = makeS();
  wjl(path.join(RD(S3, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'X', 'Y')]);
  wjl(path.join(RD(S3, 'u1', 2), 'fixlog.jsonl'), [fl('A01', 'title', 'Y', 'X', { ruling: ' ' })]);
  fails(ltz(['flips', S3, 'u1']), /1 unexplained flip/, 'an empty ruling explains nothing');
});

test('flips: "judgment:<round>:<id>" explains a flip only when S/judgments.jsonl has that entry', () => {
  const mk = (ruling, entry = {}) => {
    const S = makeS();
    wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'X', 'Y')]);
    wjl(path.join(RD(S, 'u1', 2), 'fixlog.jsonl'), [fl('A01', 'title', 'Y', 'X', { ruling })]);
    wjl(path.join(S, 'judgments.jsonl'), [{ date: '2026-11-05', unit: 'u1', round: 2, id: 'A01', was: 'wrong', now: 'ok', by: 'spot-check', reason: 'the refuter was a different symbol', ...entry }]);
    return S;
  };
  const other = fails(ltz(['flips', mk('judgment:2:A02', { id: 'A02' }), 'u1']), /1 unexplained flip/, 'a judgment about another item');
  ok(/judgment:2:A02 is about A02, and its backprop does not name A01/.test(other.out), other.out);
  passes(ltz(['flips', mk('judgment:2:A02', { id: 'A02', backprop: ['A01', 'A03'] }), 'u1']), 'its backprop names the flipped item');
  const r = passes(ltz(['flips', mk('judgment:2:A01'), 'u1']));
  ok(/RULING judgment:2:A01: A01\.title returned in r2/.test(r.out) && /0 unexplained flip\(s\), 1 ruling-explained/.test(r.out), r.out);
  passes(ltz(['flips', mk('judgment:r2:A01'), 'u1']), 'round written r2');
  let f = fails(ltz(['flips', mk('judgment:2:A99'), 'u1']), /1 unexplained flip/);
  ok(/not explained: judgment:2:A99 names no entry in S\/judgments\.jsonl \(unit u1, round 2, id A99\)/.test(f.out), f.out);
  fails(ltz(['flips', mk('judgment:5:A01'), 'u1']), /names no entry/, 'wrong round');
  f = fails(ltz(['flips', mk('judgment:A01'), 'u1']), /1 unexplained flip/);
  ok(/is not judgment:<round>:<id>/.test(f.out), f.out);
  const S = mk('judgment:2:A01');
  fs.rmSync(path.join(S, 'judgments.jsonl'));
  fails(ltz(['flips', S, 'u1']), /names no entry/, 'no judgments file');
});
test('flips: historyFolders (discovery) fixlogs come first, labelled by folder', () => {
  const S = makeS();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  wjl(path.join(S, 'discovery', 'u1', 'r1', 'fixlog.jsonl'), [fl('A01', 'title', 'X', 'Y')]);
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'Y', 'X')]);
  passes(ltz(['flips', S, 'u1']), 'control: without historyFolders the discovery value is not seen');
  wj(cfgP, { ...base, historyFolders: ['discovery'] });
  const r = fails(ltz(['flips', S, 'u1']), /FLIP A01\.title: returned in r1 to a value first held in discovery\/r1: "X"/, 'discovery r1 before main r1');
  ok(/flips u1: 2 fixlogs \(1 from historyFolders\)/.test(r.out), r.out);
  wj(cfgP, { ...base, historyFolders: ['nope'] });
  fails(ltz(['flips', S, 'u1']), /PROBLEM: config\.json: history folder nope not found/);
  wj(cfgP, { ...base, historyFolders: 'discovery' });
  fails(ltz(['flips', S, 'u1']), /"historyFolders" must be an array/);
  // A judgment explains a return in a history round only from that folder's own judgments.jsonl.
  const S2 = makeS({ config: { historyFolders: ['discovery'] } });
  wjl(path.join(S2, 'discovery', 'u1', 'r1', 'fixlog.jsonl'), [fl('A01', 'title', 'X', 'Y')]);
  wjl(path.join(S2, 'discovery', 'u1', 'r2', 'fixlog.jsonl'), [fl('A01', 'title', 'Y', 'X', { ruling: 'judgment:2:A01' })]);
  const j = { date: '2026-11-05', unit: 'u1', round: 2, id: 'A01', was: 'wrong', now: 'ok', by: 'spot-check', reason: 'r' };
  wjl(path.join(S2, 'judgments.jsonl'), [j]);
  const f = fails(ltz(['flips', S2, 'u1']), /returned in discovery\/r2 to a value first held in discovery\/r1/);
  ok(/names no entry in discovery\/judgments\.jsonl/.test(f.out), `main r2's judgments do not explain discovery r2:\n${f.out}`);
  wjl(path.join(S2, 'discovery', 'judgments.jsonl'), [j]);
  passes(ltz(['flips', S2, 'u1']), 'explained by the discovery folder\'s own judgments');
});
test('flips: "judgment:<folder>/<round>:<id>" resolves in that historyFolders folder\'s judgments.jsonl; an unknown folder is unexplained', () => {
  // The main loop (S/ r1) reverts an edit made in discovery round 2, after a discovery verdict was
  // overturned; the judgments line is in the discovery folder, which holds that verdict's round.
  const j = (extra = {}) => ({ date: '2026-11-08', unit: 'u1', round: 2, id: 'A01', was: 'wrong', now: 'ok', by: 'spot-check', reason: 'r', ...extra });
  const mk = (ruling, { disc = [j()], main = [], other = null, hist = ['discovery'] } = {}) => {
    const S = makeS({ config: { historyFolders: hist } });
    wjl(path.join(S, 'discovery', 'u1', 'r2', 'fixlog.jsonl'), [fl('A01', 'title', 'X', 'Y')]);
    wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'Y', 'X', { ruling })]);
    wjl(path.join(S, 'discovery', 'judgments.jsonl'), disc);
    if (main.length) wjl(path.join(S, 'judgments.jsonl'), main);
    if (other) wjl(path.join(S, 'other', 'judgments.jsonl'), other);
    return S;
  };
  const r = passes(ltz(['flips', mk('judgment:discovery/2:A01'), 'u1']), 'the cross-folder case, with the prefix');
  ok(/RULING judgment:discovery\/2:A01: A01\.title returned in r1 to a value first held in discovery\/r2/.test(r.out) && /0 unexplained flip\(s\), 1 ruling-explained/.test(r.out), r.out);
  passes(ltz(['flips', mk('judgment:discovery/r2:A01'), 'u1']), 'round written r2');
  passes(ltz(['flips', mk('judgment:discovery/2:A01', { hist: ['discovery/'] }), 'u1']), 'a config entry with a trailing slash');
  let f = fails(ltz(['flips', mk('judgment:2:A01'), 'u1']), /1 unexplained flip/, 'control: without the prefix it resolves in S/ (the folder holding the entry)');
  ok(/judgment:2:A01 names no entry in S\/judgments\.jsonl/.test(f.out), f.out);
  // An unknown folder prefix fails, even where S/ or that folder holds a matching line.
  f = fails(ltz(['flips', mk('judgment:other/2:A01', { main: [j()], other: [j()] }), 'u1']), /1 unexplained flip/, 'a folder not in historyFolders');
  ok(/judgment:other\/2:A01 names folder other, which is not in config "historyFolders" \(discovery\)/.test(f.out), f.out);
  f = fails(ltz(['flips', mk('judgment:gone/2:A01', { hist: ['discovery', 'gone'], main: [j()] }), 'u1']), /1 unexplained flip/, 'a listed folder that does not exist');
  ok(/judgment:gone\/2:A01 names history folder gone, which was not found/.test(f.out) && /PROBLEM: config\.json: history folder gone not found/.test(f.out), f.out);
  // The same rules as the plain form: the entry concerns the flipped item, and the round matches.
  f = fails(ltz(['flips', mk('judgment:discovery/2:A02', { disc: [j({ id: 'A02' })] }), 'u1']), /1 unexplained flip/, 'an entry for another item');
  ok(/judgment:discovery\/2:A02 is about A02, and its backprop does not name A01/.test(f.out), f.out);
  passes(ltz(['flips', mk('judgment:discovery/2:A02', { disc: [j({ id: 'A02', backprop: ['A01'] })] }), 'u1']), 'its backprop names the flipped item');
  f = fails(ltz(['flips', mk('judgment:discovery/3:A01'), 'u1']), /judgment:discovery\/3:A01 names no entry in discovery\/judgments\.jsonl \(unit u1, round 3, id A01\)/, 'another round');
  fails(ltz(['flips', mk('judgment:discovery/2:A01', { disc: [j({ unit: 'u2' })] }), 'u1']), /names no entry in discovery\/judgments\.jsonl/, 'another unit');
  fails(ltz(['flips', mk('judgment:discovery/:A01'), 'u1']), /is not judgment:<round>:<id> or judgment:<folder>\/<round>:<id>/, 'no round');
});

// ---- skillcheck (test 0 lints the real docs; here it is tested on a fixture skill)
const SKILLCHECK = path.join(SCRIPTS, 'skillcheck.mjs');
const CLEAN_SKILL = {
  'SKILL.md': [
    '# Skill', '',
    'Run `node <skill>/scripts/ltz.mjs snapshot <S> <unit> <R>` and `ltz queue <S> <unit> <R> status`.',
    'A unit becomes `closed-leads-pending`; a job may be `stopped-limit` or `dropped-by-owner` (`stopped-*` in general).',
    'The verdict `ok`; a writer verdict is `pending-owner`. Use `"repeatReason": "plain-fix-failure"` and `"foundBy": "sweep|audit"`.',
    'Set config `windowSize`, and `maskAllow` in `config.json`.',
    'Files: `loop.md`, `S/<unit>/r<R>/confirmed.json`, `agent-c1-a.jsonl`, `references/x.md`.',
    'See `references/x.md` ("Section One") and (`references/x.md`, "Bold label").',
    'A wrapped pointer: `references/x.md`, "Section',
    'One".',
  ].join('\n') + '\n',
  'lessons.md': '# Lessons\n',
  'references/state-template.md': '# State\n```\nS/\n  config.json\n  loop.md\n  closed-unit-leads.txt\n  <unit>/r<R>/   confirmed.json, agent-<slot>.jsonl\n```\n',
  'references/x.md': '# X\n## Section One\ntext\n- **Bold label.** text\n',
  'tests/README.md': '# Tests\n```\n"verdict": "ok|wrong"\n```\n',
  'scripts/README.md': '# Scripts\nThe config.json example:\n```json\n{"windowSize": 16, "units": {"u1": {"itemFiles": []}}}\n```\n',
  'scripts/hooks/README.md': '# Hooks\nSee `../README.md`.\n',
};
function skillFixture(overrides = {}) {
  const root = path.join(RUN, `skill-${++nS}`);
  for (const [f, body] of Object.entries({ ...CLEAN_SKILL, ...overrides })) {
    if (body === null) continue;
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), body);
  }
  return root;
}
const skillcheck = (root) => {
  const r = spawnSync(process.execPath, [SKILLCHECK, '--root', root], { encoding: 'utf8', env: BASE_ENV });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const withLine = (line) => ({ 'SKILL.md': CLEAN_SKILL['SKILL.md'] + line + '\n' });
const LAST = CLEAN_SKILL['SKILL.md'].split('\n').length; // the line an appended line lands on
test('skillcheck: a clean fixture passes, and every check examined something', () => {
  const r = skillcheck(skillFixture());
  eq(r.code, 0, `clean:\n${r.out}`);
  ok(/0 finding\(s\)/.test(r.out) && /ltz mentions [1-9].*status\/state tokens [1-9].*verdict\/reason values [1-9].*config keys [1-9].*file names [1-9].*pointers [1-9]/.test(r.out), r.out);
});
test('skillcheck [a]: an ltz mention that is not a command', () => {
  const r = skillcheck(skillFixture(withLine('Then run `ltz frobnicate <S>`.')));
  eq(r.code, 1, r.out);
  ok(new RegExp(`SKILL\\.md:${LAST}: \\[a\\] "ltz frobnicate": "frobnicate" is not an ltz command`).test(r.out), r.out);
});
test('skillcheck [b]: a status or queue state the code does not define', () => {
  let r = skillcheck(skillFixture(withLine('The unit is `closed-forever`.')));
  ok(r.code === 1 && new RegExp(`SKILL\\.md:${LAST}: \\[b\\] "closed-forever"`).test(r.out), r.out);
  r = skillcheck(skillFixture(withLine('```\nstate: stopped-paused\n```')));
  ok(r.code === 1 && /\[b\] "stopped-paused"/.test(r.out), `in a code block:\n${r.out}`);
  eq(skillcheck(skillFixture(withLine('Also `final-check`, `closed-*`, `closed-unit-leads.txt`.'))).code, 0, 'control: defined, a family, and a file name');
});
test('skillcheck [c]: verdicts, repeatReason and foundBy values', () => {
  for (const [line, re] of [
    ['```\n"verdict": "maybe"\n```', /\[c\] verdict "maybe" is not one of/],
    ['The verdict `pending` here.', /\[c\] verdict "pending" is not one of/],
    ['Write `pending_owner` there.', /\[c\] "pending_owner" is spelled inconsistently/],
    ['Give `"repeatReason": "tired"`.', /\[c\] repeatReason "tired" is not accepted/],
    ['Set `foundBy` `hunch`.', /\[c\] foundBy "hunch" is not accepted/],
  ]) {
    const r = skillcheck(skillFixture(withLine(line)));
    ok(r.code === 1 && re.test(r.out), `${line}:\n${r.out}`);
  }
  eq(skillcheck(skillFixture(withLine('A verdict `wrong`, `"repeatReason": "new-text|earlier-miss"`, `"verdict": "<value>"`.'))).code, 0, 'control');
});
test('skillcheck [d]: config keys the code does not read', () => {
  let r = skillcheck(skillFixture(withLine('Set config `windowSise`.')));
  ok(r.code === 1 && new RegExp(`SKILL\\.md:${LAST}: \\[d\\] config key "windowSise"`).test(r.out), r.out);
  r = skillcheck(skillFixture(withLine('Read `config.maskKeyz` first.')));
  ok(r.code === 1 && /\[d\] config key "maskKeyz"/.test(r.out), r.out);
  r = skillcheck(skillFixture({ 'scripts/README.md': '# S\nIn config.json:\n```json\n{"windowSize": 16, "unknownKey": 1}\n```\n' }));
  ok(r.code === 1 && /scripts\/README\.md:4: \[d\] config key "unknownKey" \(in a config\.json example\)/.test(r.out), r.out);
  eq(skillcheck(skillFixture(withLine('`countsAsZero` is in measure.json; the config keys are elsewhere.'))).code, 0, 'control: a camelCase name not next to config');
});
test('skillcheck [e]: file names neither in state-template.md nor in the skill', () => {
  let r = skillcheck(skillFixture(withLine('Write `mystery.json`.')));
  ok(r.code === 1 && new RegExp(`SKILL\\.md:${LAST}: \\[e\\] file name "mystery\\.json"`).test(r.out), r.out);
  eq(skillcheck(skillFixture(withLine('Placeholders: `<pattern.json|classfile>`, `<transcript.jsonl>`, `*.md`.'))).code, 0, 'control: placeholders');
  eq(skillcheck(skillFixture(withLine('Hook files: `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`.'))).code, 0, 'control: Claude Code\'s own files');
  r = skillcheck(skillFixture(withLine('Not exempt: `claude/settings.json`.')));
  ok(r.code === 1 && /\[e\] file name "claude\/settings\.json"/.test(r.out), `only a leading .claude/ or ~/ is exempt:\n${r.out}`);
});
test('skillcheck [f]: pointers to missing files or headings', () => {
  let r = skillcheck(skillFixture(withLine('See `references/nope.md`.')));
  ok(r.code === 1 && new RegExp(`SKILL\\.md:${LAST}: \\[f\\] references/nope\\.md does not exist`).test(r.out), r.out);
  r = skillcheck(skillFixture(withLine('See `references/x.md` ("No Such Section").')));
  ok(r.code === 1 && /\[f\] references\/x\.md has no heading "No Such Section"/.test(r.out), r.out);
});
test('skillcheck [file]: a linted file that is missing', () => {
  const r = skillcheck(skillFixture({ 'tests/README.md': null }));
  ok(r.code === 1 && /tests\/README\.md:0: \[file\] tests\/README\.md not found/.test(r.out), r.out);
});
test('skillcheck: CONFIG_KEYS matches the config keys the code reads (both ways)', () => {
  // The CONFIG_KEYS definition itself is cut out, or every key would trivially "appear in the code".
  const src = ['lib', 'hooks']
    .flatMap((d) => fs.readdirSync(path.join(SCRIPTS, d)).filter((f) => f.endsWith('.mjs')).map((f) => fs.readFileSync(path.join(SCRIPTS, d, f), 'utf8')))
    .join('\n')
    .replace(/export const CONFIG_KEYS = \[[\s\S]*?\];/, '');
  ok(!/'windowSize', 'itemFields', 'units'/.test(src), 'the definition was cut out');
  const read = new Set([...src.matchAll(/\bcfg\.([A-Za-z_]\w*)/g)].map((m) => m[1]));
  for (const k of read) ok(CONFIG_KEYS.includes(k), `cfg.${k} is read but not in CONFIG_KEYS`);
  for (const k of CONFIG_KEYS) ok(new RegExp(`cfg\\.${k}\\b|['"]${k}['"]`).test(src), `CONFIG_KEYS lists ${k}, which no code reads`);
});

// ---- estimate
test('estimate: Chapman n1=14, n2=4, m=2 -> N=24, remaining 8', () => {
  eq(chapman(14, 4, 2), 24, 'N');
  eq(estimateRemaining(14, 4, 2), { N: 24, foundByReaders: 16, remaining: 8 }, 'remaining = N - (n1+n2-m)');
  eq(chapman(0, 0, 0), 0, 'no finds');
  let threw = false;
  try {
    chapman(1, 2, 3);
  } catch {
    threw = true;
  }
  ok(threw, 'm > n1 rejected');
});

// ---- cost
test('cost: sums usage, deduped by message id at the max; malformed lines skipped', () => {
  const f = path.join(RUN, 'agent-x.jsonl');
  const u = (id, i, r, c, o) => JSON.stringify({ type: 'assistant', message: { id, usage: { input_tokens: i, cache_read_input_tokens: r, cache_creation_input_tokens: c, output_tokens: o } } });
  fs.writeFileSync(f, [u('m1', 10, 100, 50, 5), u('m1', 10, 100, 50, 20), u('m2', 1, 200, 0, 7), JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }), '{not json'].join('\n') + '\n');
  const r = passes(ltz(['cost', f]));
  ok(/cache reads 300, cache writes 50, other input 11, output 27, total 388/.test(r.out), `totals:\n${r.out}`);
  ok(/1 malformed/.test(r.out), 'malformed line counted');
  const empty = path.join(RUN, 'empty.jsonl');
  fs.writeFileSync(empty, '{"type":"user"}\n');
  fails(ltz(['cost', empty]), /no usage found/);
  fails(ltz(['cost', path.join(RUN, 'nope.jsonl')]), /transcript not found/);
});
const tmsg = (id, ts, input, output = 0, command) =>
  JSON.stringify({
    type: 'assistant', timestamp: ts,
    message: { id, usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, content: command ? [{ type: 'tool_use', name: 'Bash', input: { command } }] : [{ type: 'text', text: 'x' }] },
  });
test('cost --queue sums every transcript stored in the round\'s queue', () => {
  const S = queued();
  const t1 = path.join(RUN, `q-t1-${nS}.jsonl`);
  const t2 = path.join(RUN, `q-t2-${nS}.jsonl`);
  fs.writeFileSync(t1, [tmsg('m1', '2026-11-05T10:00:00Z', 100, 5), tmsg('m2', '2026-11-05T10:01:00Z', 200, 7)].join('\n') + '\n');
  fs.writeFileSync(t2, tmsg('m3', '2026-11-05T10:00:00Z', 10, 1) + '\n');
  fails(ltz(['cost', '--queue', S, 'u1', '1']), /no transcript paths in .*queue\.json; store them at launch/);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'running', '--agent', 'a1', '--transcript', t1]));
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-b', 'running', '--agent', 'a2', '--transcript', t2]));
  const r = passes(ltz(['cost', '--queue', S, 'u1', '1']));
  ok(/2 transcript\(s\) from 2 of 4 slots: cache reads 0, cache writes 0, other input 310, output 13, total 323/.test(r.out), r.out);
  ok(/WARNING: no transcript stored for: c2-a, c2-b/.test(r.out) && /c1-a .*q-t1/.test(r.out), r.out);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c2-b', 'running', '--agent', 'a4', '--transcript', t1]));
  const r1 = passes(ltz(['cost', '--queue', S, 'u1', '1']));
  ok(/2 transcript\(s\) from 3 of 4 slots: .*total 323/.test(r1.out), `a path stored on two slots counts once:\n${r1.out}`);
  const gone = path.join(RUN, `q-gone-${nS}.jsonl`);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c2-a', 'running', '--agent', 'a3', '--transcript', gone]));
  const r2 = fails(ltz(['cost', '--queue', S, 'u1', '1']), /PROBLEM: c2-a: transcript not found: .*q-gone/);
  ok(/total 323/.test(r2.out), `the others are still summed:\n${r2.out}`);
  fails(ltz(['cost', '--queue', S, 'u1', '1', t1]), /cost --queue takes <S> <unit> <R> and no transcript files/);
  fails(ltz(['cost', '--queue', '--timeline', t1, S, 'u1', '1']), /give --queue or --timeline, not both/);
});
test('cost --timeline: tokens per message with times; startup and each render window summed', () => {
  const f = path.join(RUN, `tl-${nS}.jsonl`);
  const render = (from) => `node "/x/scripts/ltz.mjs" render S u1 1 c1-a ${from} 3`;
  fs.writeFileSync(f, [
    tmsg('m1', '2026-11-05T10:00:00Z', 100),
    tmsg('m2', '2026-11-05T10:01:00Z', 50, 10, render(1)),
    tmsg('m2', '2026-11-05T10:01:30Z', 50, 30, render(1)),
    tmsg('m3', '2026-11-05T10:03:00Z', 20, 0, 'node "/x/scripts/ltz.mjs" render S u1 1 c1-a show src/auth.js:3'),
    JSON.stringify({ type: 'user', timestamp: '2026-11-05T10:03:30Z', message: { role: 'user', content: 'tool result' } }),
    tmsg('m4', '2026-11-05T10:04:00Z', 40, 0, render(4)),
    tmsg('m5', '2026-11-05T10:06:00Z', 60),
  ].join('\n') + '\n');
  const r = passes(ltz(['cost', '--timeline', f]));
  ok(/^\s+2 {2}2026-11-05T10:01:00\.000Z \+1:00 .*output 30; message 80, cumulative 180 {3}<< render S u1 1 c1-a 1 3$/m.test(r.out), `per message, deduped at the max with the earliest time:\n${r.out}`);
  ok(/^startup: 1 message\(s\), 100 tokens, 1\.0 min$/m.test(r.out), r.out);
  ok(!/<< render S u1 1 c1-a show/.test(r.out), `"render ... show" is extra reading, not a window:\n${r.out}`);
  ok(/^window 1 \(render S u1 1 c1-a 1 3\): 2 message\(s\), 100 tokens, 3\.0 min$/m.test(r.out), r.out);
  ok(/^window 2 \(render S u1 1 c1-a 4 3\): 2 message\(s\), 100 tokens, 2\.0 min$/m.test(r.out), r.out);
  ok(/cost --timeline: 5 messages over 6\.0 min, 300 tokens; startup 100 tokens before the first render; 2 window\(s\), about 100 tokens and 2\.5 min each/.test(r.out), r.out);
  fails(ltz(['cost', '--timeline', path.join(RUN, 'nope.jsonl')]), /transcript not found/);
  const empty = path.join(RUN, `tl-empty-${nS}.jsonl`);
  fs.writeFileSync(empty, '{"type":"user"}\n');
  fails(ltz(['cost', '--timeline', empty]), /no usage found/);
  fails(ltz(['cost', '--timeline', f, f]), /takes one transcript and nothing else/);
});

// ---- replay
test('replay: recall on confirmed wrongs of the class, and false hits', () => {
  const S = makeS();
  snap(S);
  wj(path.join(RD(S), 'confirmed.json'), { A05: { note: 'docs/spec.md:8', class: 'U1' }, A02: { note: 'src/auth.js:6', class: 'C2' } });
  const r = passes(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1']));
  ok(/u1\/r1 U-only: recall 1\/1; false hits 1 \(A07\)/.test(r.out), `per round:\n${r.out}`);
  const r2 = passes(ltz(['replay', S, patFile(S, [{ ...ONLY, regex: '\\bnever\\b' }], 'cls.json'), '--rounds', 'u1']));
  ok(/recall 0\/1 \(missed A05\)/.test(r2.out), 'missed instance named');
  fails(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u2']), /no round folder of u2/);
  fails(ltz(['replay', S, patFile(S, { ...ONLY, class: undefined }), '--rounds', 'u1']), /has no "class"/);
  // r0 (the measurement round, confirmed.json {} by rule) is never replayed: its hits are not false hits.
  const r0 = path.join(S, 'u1', 'r0');
  fs.cpSync(RD(S), r0, { recursive: true });
  wj(path.join(r0, 'confirmed.json'), {});
  const r3 = passes(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1']));
  ok(!/u1\/r0/.test(r3.out) && /u1\/r1 U-only: recall 1\/1; false hits 1 \(A07\)/.test(r3.out), `r0 skipped:\n${r3.out}`);
});
test('replay: falls back to the readers\' class labels when confirmed.json has none', () => {
  const S = baseCopy();
  wj(path.join(RD(S), 'confirmed.json'), { A03: { note: 'src/auth.js:10' } });
  const r = passes(ltz(['replay', S, patFile(S, { ...ONLY, regex: 'null', knownInstances: ['A03'] }), '--rounds', 'u1']));
  ok(/recall 1\/1/.test(r.out), `reader class U1 used:\n${r.out}`);
});
test('replay: a wrong overturned in S/judgments.jsonl (its latest line says now ok or pending-owner) is not counted', () => {
  const S = makeS();
  snap(S);
  // A bare pending id (written before pending reasons) is still read.
  wj(path.join(RD(S), 'confirmed.json'), { A05: { note: 'docs/spec.md:8', class: 'U1' }, A07: { note: 'src/billing.js:4', class: 'U1' }, pending: ['A09'] });
  const jp = path.join(S, 'judgments.jsonl');
  const j = (now, extra = {}) => ({ date: '2026-11-05', unit: 'u1', round: 1, id: 'A07', was: 'wrong', now, by: 'owner', reason: 'r', ...extra });
  const run = () => passes(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1'])).out;
  ok(/recall 2\/2; false hits 0/.test(run()), 'control: both wrongs count');
  wjl(jp, [j('ok')]);
  let out = run();
  ok(/recall 1\/1; false hits 1 \(A07\); overturned, not counted: A07/.test(out) && /1 overturned wrong\(s\) not counted/.test(out), out);
  wjl(jp, [j('wrong'), j('ok')]);
  ok(/recall 1\/1; false hits 1 \(A07\)/.test(run()), 'the latest line decides: ok');
  wjl(jp, [j('ok'), j('wrong')]);
  ok(/recall 2\/2; false hits 0/.test(run()), 'the latest line decides: wrong again, so counted');
  wjl(jp, [j('pending-owner')]);
  ok(/recall 1\/1; false hits 0; overturned, not counted: A07/.test(run()), 'overturned to pending-owner: neither recalled nor a false hit');
  wjl(jp, [j('ok', { round: 2 }), j('ok', { unit: 'u2' })]);
  ok(/recall 2\/2; false hits 0/.test(run()), 'another round or unit: no effect');
  wjl(jp, [j('ok', { round: 'r1', unit: undefined })]);
  ok(/recall 1\/1; false hits 1 \(A07\)/.test(run()), 'round "r1", and a line with no unit, match as in flips');
});
test('replay: historyFolders rounds are replayed, labelled by folder, with overturns only from that folder\'s own judgments.jsonl', () => {
  const S = makeS();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  const D = path.join(S, 'discovery');
  const conf = { A05: { note: 'docs/spec.md:8', class: 'U1' }, A07: { note: 'src/billing.js:4', class: 'U1' } };
  // A discovery round only: replayed only with historyFolders.
  wjl(path.join(D, 'u1', 'r1', 'snapshot.jsonl'), ITEMS.filter((x) => x.unit === 'u1'));
  wj(path.join(D, 'u1', 'r1', 'confirmed.json'), conf);
  const run = () => passes(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1'])).out;
  fails(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1']), /no round folder of u1/, 'negative control: without historyFolders the discovery round is not replayed');
  wj(cfgP, { ...base, historyFolders: ['discovery'] });
  let out = run();
  ok(/^discovery\/u1\/r1 U-only: recall 2\/2; false hits 0$/m.test(out) && /replay: 1 round\(s\) \(1 from historyFolders\); U-only: recall 2\/2/.test(out), `the history round counts:\n${out}`);
  // With S/'s own round 1 too: the history round comes first.
  snap(S);
  wj(path.join(RD(S), 'confirmed.json'), conf);
  out = run();
  ok(/^discovery\/u1\/r1 U-only: recall 2\/2; false hits 0\nu1\/r1 U-only: recall 2\/2; false hits 0$/m.test(out), `history first, then S/:\n${out}`);
  ok(/replay: 2 round\(s\) \(1 from historyFolders\); U-only: recall 4\/4, false hits 0 over 2 round\(s\)/.test(out), out);
  const j = { date: '2026-11-05', unit: 'u1', round: 1, id: 'A07', was: 'wrong', now: 'ok', by: 'owner', reason: 'r' };
  // An overturn in the discovery folder's judgments.jsonl: honoured there, not in S/'s round 1.
  wjl(path.join(D, 'judgments.jsonl'), [j]);
  out = run();
  ok(/^discovery\/u1\/r1 U-only: recall 1\/1; false hits 1 \(A07\); overturned, not counted: A07$/m.test(out), `honoured in the history round:\n${out}`);
  ok(/^u1\/r1 U-only: recall 2\/2; false hits 0$/m.test(out), `it does not leak into S/'s round 1:\n${out}`);
  ok(/1 overturned wrong\(s\) not counted \(discovery\/judgments\.jsonl\)/.test(out), out);
  // An overturn in S/judgments.jsonl for the same-numbered S/ round: honoured there, not in discovery's.
  fs.rmSync(path.join(D, 'judgments.jsonl'));
  wjl(path.join(S, 'judgments.jsonl'), [j]);
  out = run();
  ok(/^u1\/r1 U-only: recall 1\/1; false hits 1 \(A07\); overturned, not counted: A07$/m.test(out), `honoured in S/'s round:\n${out}`);
  ok(/^discovery\/u1\/r1 U-only: recall 2\/2; false hits 0$/m.test(out), `it does not leak into the discovery round:\n${out}`);
  ok(/1 overturned wrong\(s\) not counted \(S\/judgments\.jsonl\)/.test(out), out);
  // A bad historyFolders is a PROBLEM; S/'s rounds are still replayed.
  wj(cfgP, { ...base, historyFolders: ['nope'] });
  const r = fails(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1']), /PROBLEM: config\.json: history folder nope not found/, 'a missing folder');
  ok(/^u1\/r1 U-only/m.test(r.out), r.out);
  wj(cfgP, { ...base, historyFolders: 'discovery' });
  fails(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1']), /"historyFolders" must be an array/, 'not an array');
  wj(cfgP, base);
  out = run();
  ok(!/discovery/.test(out) && /replay: 1 round\(s\);/.test(out), `control: without historyFolders only S/'s round:\n${out}`);
  // With nothing to replay, the refusal still names the bad history folder.
  const S2 = makeS({ config: { historyFolders: ['nope'] } });
  fails(ltz(['replay', S2, patFile(S2, ONLY), '--rounds', 'u1']), /history folder nope not found .*; and no round folder of u1 has both/, 'nothing replayed');
});

// ---- lock
test('lock: a second session is refused', () => {
  const S = makeS();
  passes(ltz(['lock', S, 'acquire', '--session', 's1']));
  passes(ltz(['lock', S, 'acquire', '--session', 's1']), 're-acquire by the holder');
  fails(ltz(['lock', S, 'acquire', '--session', 's2']), /held by session s1/);
  passes(ltz(['lock', S, 'check', '--session', 's1']));
  fails(ltz(['lock', S, 'check', '--session', 's2']), /held by another session \(s1\)/);
  fails(ltz(['lock', S, 'release', '--session', 's2']), /held by session s1, not s2/);
  passes(ltz(['lock', S, 'release', '--session', 's1']));
  passes(ltz(['lock', S, 'acquire', '--session', 's2']), 'free again');
});
test('lock --session auto: the guard writes the session hint before the command runs; lock reads and deletes it', () => {
  const S = makeS();
  const hint = path.join(S, '.session-hint');
  const dir = path.join(RUN, `auto-${nS}`);
  fs.mkdirSync(dir, { recursive: true });
  const cmd = `node "${LTZ}" lock "${S}" acquire --session auto`;
  fails(ltz(['lock', S, 'acquire', '--session', 'auto']), /--session auto: no session hint in .*\.session-hint; give the id \(--session <id>\), or enable the guard hook/, 'without the guard');
  ok(!fs.existsSync(path.join(S, 'writer.lock')), 'nothing taken');
  // The guard (inert here: no LTZ_STATE, no .ltz-state) still writes the hint, and never blocks.
  eq(guard({ ...bash(cmd), session_id: 'sess-42' }, { cwd: dir }).code, 0, 'the guard allows the command');
  eq(rj(hint).session, 'sess-42', 'hint written');
  const r = passes(ltz(['lock', S, 'acquire', '--session', 'auto']));
  ok(/lock: acquired by sess-42 \(session id from the guard's hint\)/.test(r.out), r.out);
  ok(!fs.existsSync(hint), 'the hint is deleted once read');
  eq(rj(path.join(S, 'writer.lock')).session, 'sess-42', 'the lock holds the real id');
  fails(ltz(['lock', S, 'acquire', '--session', 'auto']), /no session hint/, 'a consumed hint is not reused');
  // release and check take auto too; flags may come first, and --session=auto works.
  guard({ ...bash(`cd "${path.dirname(S)}" && node ltz.mjs lock --session=auto S release`), session_id: 'sess-42' }, { cwd: dir });
  ok(fs.existsSync(hint), 'a relative S after cd, with --session=auto first');
  passes(ltz(['lock', S, 'release', '--session', 'auto']));
  ok(!fs.existsSync(path.join(S, 'writer.lock')), 'released');
  // A stale hint (older than 60 s) is refused, and deleted.
  wj(hint, { session: 'sess-42', at: new Date(Date.now() - 120000).toISOString() });
  fails(ltz(['lock', S, 'acquire', '--session', 'auto']), /the session hint is stale \(written 120 s ago; it is good for 60 s\)/);
  ok(!fs.existsSync(hint), 'a stale hint is deleted too');
  fs.writeFileSync(hint, 'not json');
  fails(ltz(['lock', S, 'acquire', '--session', 'auto']), /\.session-hint is unreadable/);
  // Only a real lock command with --session auto writes a hint.
  for (const c of [`echo "node ltz.mjs lock ${S} acquire --session auto"`, `node "${LTZ}" lock "${S}" acquire --session s1`, `node "${LTZ}" lock "${S}" steal --session auto`, `node "${LTZ}" queue "${S}" u1 1 status --session auto`]) {
    guard({ ...bash(c), session_id: 'sess-9' }, { cwd: dir });
    ok(!fs.existsSync(hint), `no hint for: ${c}`);
  }
  guard({ tool_name: 'Edit', tool_input: { file_path: 'x', command: cmd }, session_id: 'sess-9' }, { cwd: dir });
  ok(!fs.existsSync(hint), 'only for Bash or PowerShell');
  guard({ tool_name: 'PowerShell', tool_input: { command: `& node "${LTZ}" lock "${S}" check --session auto` }, session_id: 'sess-9' }, { cwd: dir });
  eq(rj(hint).session, 'sess-9', 'PowerShell form');
  fs.rmSync(hint);
  guard({ ...bash(`node "${LTZ}" lock "${path.join(RUN, 'no-such-S')}" acquire --session auto`), session_id: 'sess-9' }, { cwd: dir });
  ok(!fs.existsSync(path.join(RUN, 'no-such-S')), 'a missing state folder is not created');
});

// ---- guard
function guardS({ running = true, lockedBy = null } = {}) {
  const S = makeS();
  wj(path.join(RD(S), 'queue.json'), { groups: [], slots: [{ slot: 'c1-a', state: running ? 'running' : 'done' }, { slot: 'c1-b', state: 'done' }] });
  if (lockedBy) wj(path.join(S, 'writer.lock'), { session: lockedBy, since: '2026-11-05T00:00:00Z' });
  return S;
}
function guard(input, { env = {}, cwd } = {}) {
  const dir = cwd || path.join(RUN, 'no-marker');
  fs.mkdirSync(dir, { recursive: true });
  // GIT_ENV keeps the guard's git calls inside scripts/test/tmp (ceiling, no system/global config).
  const r = spawnSync(process.execPath, [GUARD], { input: JSON.stringify({ session_id: 'me', cwd: dir, ...input }), encoding: 'utf8', env: { ...GIT_ENV, ...env }, cwd: dir });
  return { code: r.status, out: (r.stderr || '') + (r.stdout || '') };
}
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
test('guard: inert without LTZ_STATE or .ltz-state (even with a running queue)', () => {
  const S = guardS();
  eq(guard(bash('git commit -m x')).code, 0, 'no env, no marker');
  eq(guard(bash('grep -r x . | head -5')).code, 0, 'no env, no marker');
  eq(guard(bash('git commit -m x'), { env: { LTZ_STATE: path.dirname(S) } }).code, 0, 'LTZ_STATE without config.json is inert');
  eq(guard(bash('git commit -m x'), { env: { LTZ_STATE: S } }).code, 2, 'control: LTZ_STATE active');
});
test('guard: .ltz-state in cwd activates it', () => {
  const S = guardS();
  const dir = path.join(RUN, 'proj-marker');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.ltz-state'), '\ufeff' + S + '\r\n');
  const r = guard(bash('git commit -m x'), { cwd: dir });
  eq(r.code, 2, 'blocked via marker');
  ok(/readers are still reading .*c1-a \(running\)/.test(r.out), r.out);
});
test('guard: git commit blocked while a job is running or stopped; allowed when all done', () => {
  const S = guardS();
  const env = { LTZ_STATE: S };
  for (const c of ['git commit -m x', 'git -C "C:/some repo" commit -am x', 'git -c user.name=x commit', 'cd x && git commit --amend']) {
    eq(guard(bash(c), { env }).code, 2, c);
  }
  eq(guard({ tool_name: 'PowerShell', tool_input: { command: 'git commit -m x' } }, { env }).code, 2, 'PowerShell too');
  eq(guard(bash('git status && git log --grep commit'), { env }).code, 0, 'other git commands allowed');
  const q = path.join(RD(S), 'queue.json');
  wj(q, { groups: [], slots: [{ slot: 'c1-a', state: 'stopped-limit' }] });
  eq(guard(bash('git commit -m x'), { env }).code, 2, 'stopped-limit blocks');
  wj(q, { groups: [], slots: [{ slot: 'c1-a', state: 'done' }, { slot: 'c1-b', state: 'queued' }] });
  eq(guard(bash('git commit -m x'), { env }).code, 2, 'a queued job is open');
  wj(q, { groups: [], slots: [{ slot: 'c1-a', state: 'done' }, { slot: 'c1-b', state: 'replaced' }, { slot: 'c1-c', state: 'dropped-by-owner' }] });
  eq(guard(bash('git commit -m x'), { env }).code, 0, 'done, replaced and dropped-by-owner are closed: allowed');
});
/** A temp repo holding an item file, a decision log and the state folder S/ itself. */
function guardRepo() {
  const S = guardS();
  const repo = path.dirname(S);
  const g = (args) => execFileSync('git', ['-C', repo, ...args], { env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g(['init', '-q']);
  if (!samePath(g(['rev-parse', '--show-toplevel']).trim(), repo)) throw new Error('guard repo is not its own toplevel');
  g(['config', 'core.autocrlf', 'false']);
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'spec.md'), 'items\n');
  fs.writeFileSync(path.join(repo, 'decisions.md'), 'rulings\n');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'init']);
  const cfgP = path.join(S, 'config.json');
  wj(cfgP, { ...rj(cfgP), itemsRoot: repo });
  return { S, repo, g, env: { LTZ_STATE: S } };
}
test('guard: with readers reading, a commit of only non-item files (decision log, S/) is allowed', () => {
  const { repo, g, env } = guardRepo();
  fs.appendFileSync(path.join(repo, 'decisions.md'), 'D-1\n');
  fs.writeFileSync(path.join(repo, 'S', 'u1', 'r1', 'notes.txt'), 'x\n');
  g(['add', 'decisions.md', 'S']);
  eq(guard(bash('git commit -m "D-1"'), { env, cwd: repo }).code, 0, 'staged: decisions.md and S/ files only');
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'unstaged edit\n');
  eq(guard(bash('git commit -m "D-1"'), { env, cwd: repo }).code, 0, 'an unstaged item edit is not committed');
  eq(guard(bash('git commit -m x decisions.md'), { env, cwd: repo }).code, 0, 'pathspec of a non-item file');
  eq(guard({ tool_name: 'PowerShell', tool_input: { command: `git -C "${repo}" commit -m x` } }, { env, cwd: RUN }).code, 0, 'git -C from elsewhere');
});
test('guard: with readers reading, a commit that would include item files is blocked', () => {
  const { repo, g, env } = guardRepo();
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'edit\n');
  for (const c of ['git commit -am x', 'git commit --all -m x', 'git commit -m x docs/spec.md', 'git commit -m x -- docs/']) {
    const r = guard(bash(c), { env, cwd: repo });
    eq(r.code, 2, c);
    ok(/would include item files .*spec\.md/.test(r.out), `${c}: ${r.out}`);
  }
  g(['add', 'docs/spec.md']);
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 2, 'staged item file');
  eq(guard(bash(`cd "${repo}" && git commit -m x`), { env, cwd: RUN }).code, 2, 'cd <repo> && git commit');
  eq(guard(bash(`git -C "${repo}" commit -m x`), { env, cwd: RUN }).code, 2, 'git -C <repo> commit');
  const q = path.join(RD(path.join(repo, 'S')), 'queue.json');
  wj(q, { groups: [], slots: [{ slot: 'c1-a', state: 'done' }] });
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 0, 'control: reading done, item commit allowed');
  wj(q, { groups: [], slots: [{ slot: 'c1-a', state: 'done' }, { slot: 'c1-b', state: 'queued' }] });
  const r = guard(bash('git commit -m x'), { env, cwd: repo });
  eq(r.code, 2, 'a queued job is open: item commit blocked');
  ok(/c1-b \(queued\)/.test(r.out), r.out);
  wj(q, { groups: [], slots: [{ slot: 'c1-a', state: 'done' }, { slot: 'c1-b', state: 'dropped-by-owner' }, { slot: 'c2-a', state: 'replaced' }] });
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 0, 'done, dropped-by-owner and replaced are closed');
});
test('guard: staging in the same command counts (the hook runs before the command)', () => {
  const { repo, env } = guardRepo();
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'unstaged edit\n');
  fs.appendFileSync(path.join(repo, 'decisions.md'), 'D-2\n');
  for (const c of ['git add docs/spec.md && git commit -m x', 'git add -A && git commit -m x', 'git add . && git commit -m x', 'git add docs && git commit -m x', 'git rm --cached docs/spec.md && git commit -m x']) {
    const r = guard(bash(c), { env, cwd: repo });
    eq(r.code, 2, c);
    ok(/would include item files .*spec\.md/.test(r.out), `${c}: ${r.out}`);
  }
  eq(guard({ tool_name: 'PowerShell', tool_input: { command: 'git add docs/spec.md; git commit -m x' } }, { env, cwd: repo }).code, 2, 'PowerShell ; form');
  eq(guard(bash(`cd "${repo}" && git add docs/spec.md && git commit -m x`), { env, cwd: RUN }).code, 2, 'cd, then add, then commit');
  eq(guard(bash('git add decisions.md && git commit -m x'), { env, cwd: repo }).code, 0, 'control: staging a non-item file');
  eq(guard(bash('git status && git add decisions.md && git commit -m x'), { env, cwd: repo }).code, 0, 'control: a read-only git command first');
  for (const c of ['git stash pop && git commit -m x', 'git reset HEAD~1 && git commit -m x', 'git checkout -- . && git commit -m x']) {
    const r = guard(bash(c), { env, cwd: repo });
    eq(r.code, 2, c);
    ok(/could not be determined: "git \w+" runs before the commit/.test(r.out), `${c}: ${r.out}`);
  }
  const r = guard(bash('echo hi > notes.txt && git add -A && git commit -m x'), { env, cwd: repo });
  eq(r.code, 2, 'a non-git command before add -A');
  ok(/another command runs before the commit/.test(r.out), r.out);
  eq(guard(bash('echo hi && git add decisions.md && git commit -m x'), { env, cwd: repo }).code, 0, 'control: a non-git command before an explicit add');
});
test('guard: no unit listing itemFiles blocks commits while reading (fails closed)', () => {
  const { S, repo, g, env } = guardRepo();
  fs.appendFileSync(path.join(repo, 'decisions.md'), 'D-3\n');
  g(['add', 'decisions.md']);
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 0, 'control: itemFiles listed, decision log staged');
  const cfgP = path.join(S, 'config.json');
  const cfg = rj(cfgP);
  for (const u of Object.values(cfg.units)) delete u.itemFiles;
  wj(cfgP, cfg);
  const r = guard(bash('git commit -m x'), { env, cwd: repo });
  eq(r.code, 2, 'no itemFiles anywhere');
  ok(/no unit lists itemFiles/.test(r.out), r.out);
});
test('guard: with readers reading, a commit whose staged set cannot be determined is blocked', () => {
  const { repo, env } = guardRepo();
  const notRepo = path.join(RUN, 'not-a-repo');
  fs.mkdirSync(notRepo, { recursive: true });
  let r = guard(bash('git commit -m x'), { env, cwd: notRepo });
  eq(r.code, 2, 'not a git repository');
  ok(/could not be determined: git could not list the staged files/.test(r.out), r.out);
  r = guard(bash('git commit -m x --pathspec-from-file=list.txt'), { env, cwd: repo });
  eq(r.code, 2, '--pathspec-from-file');
  ok(/could not be determined: --pathspec-from-file/.test(r.out), r.out);
  eq(guard(bash('git --git-dir=.git commit -m x'), { env, cwd: repo }).code, 2, '--git-dir is not followed');
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 0, 'control: nothing staged in a real repo');
});
test('guard: edits to a closed unit\'s item file are blocked; others allowed', () => {
  const S = guardS({ running: false });
  const env = { LTZ_STATE: S };
  const closed = path.join(REPO, 'docs', 'closed.md');
  const r = guard({ tool_name: 'Edit', tool_input: { file_path: closed } }, { env });
  eq(r.code, 2, 'Edit closed');
  ok(/unit u2, which is closed/.test(r.out), r.out);
  if (process.platform === 'win32') {
    const lower = closed.replace(/^[A-Z]:/, (m) => m.toLowerCase());
    eq(guard({ tool_name: 'Write', tool_input: { file_path: lower } }, { env }).code, 2, 'lowercase drive letter');
    eq(guard({ tool_name: 'MultiEdit', tool_input: { file_path: closed.replace(/\\/g, '/') } }, { env }).code, 2, 'forward slashes');
  }
  eq(guard({ tool_name: 'Edit', tool_input: { file_path: path.join(REPO, 'docs', 'spec.md') } }, { env }).code, 0, 'open unit file allowed');
  eq(guard({ tool_name: 'Write', tool_input: { file_path: path.join(RUN, 'notes.txt') } }, { env }).code, 0, 'unrelated file allowed');
});
test('final-check: a unit reopened for the final targeted check is open to the guard and diffcheck', () => {
  const S = guardS({ running: false });
  const env = { LTZ_STATE: S };
  const closed = path.join(REPO, 'docs', 'closed.md');
  const edit = { tool_name: 'Edit', tool_input: { file_path: closed } };
  eq(guard(edit, { env }).code, 2, 'control: closed, its item file is blocked');
  const cfgP = path.join(S, 'config.json');
  const cfg = rj(cfgP);
  wj(cfgP, { ...cfg, units: { ...cfg.units, u2: { ...cfg.units.u2, status: 'final-check' } } });
  eq(guard(edit, { env }).code, 0, 'final-check: edits allowed');
  // diffcheck: a final-check unit's items may change (they are not checked as a closed unit's).
  const S2 = makeS();
  snap(S2);
  passes(ltz(['snapshot', S2, 'u2', '1']));
  setItems(S2, [['B01', 'title', 'closed one edited']]);
  fails(ltz(['diffcheck', S2, 'u1', '1']), /item of closed unit u2 changed/, 'control: closed');
  const c2 = rj(path.join(S2, 'config.json'));
  wj(path.join(S2, 'config.json'), { ...c2, units: { ...c2.units, u2: { ...c2.units.u2, status: 'final-check' } } });
  passes(ltz(['diffcheck', S2, 'u1', '1']), 'final-check: not a closed unit');
  // Setting it back to closed needs a new baseline snapshot of the edited unit.
  wj(path.join(S2, 'config.json'), c2);
  fails(ltz(['diffcheck', S2, 'u1', '1']), /item of closed unit u2 changed since u2\/r1/, 'back to closed without a new snapshot: the final-check edits look like closed-unit edits');
  passes(ltz(['snapshot', S2, 'u2', '2']), 'a new baseline of u2');
  passes(ltz(['diffcheck', S2, 'u1', '1']), 'back to closed after the new snapshot');
});
test('guard: closed item files in a repo other than the evidence repo (cwd or itemsRoot)', () => {
  const S = guardS({ running: false });
  const env = { LTZ_STATE: S };
  const kit = path.join(RUN, 'kit-repo');
  const closed = path.join(kit, 'docs', 'closed.md');
  fs.mkdirSync(path.dirname(closed), { recursive: true });
  fs.writeFileSync(closed, '# items\n');
  const other = path.join(RUN, 'elsewhere');
  eq(guard({ tool_name: 'Edit', tool_input: { file_path: closed } }, { env, cwd: other }).code, 0, 'control: not under any base');
  eq(guard({ tool_name: 'Edit', tool_input: { file_path: closed } }, { env, cwd: kit }).code, 2, 'resolved against the session cwd');
  eq(guard({ tool_name: 'Edit', tool_input: { file_path: 'docs/closed.md' } }, { env, cwd: kit }).code, 2, 'relative file_path from cwd');
  const cfgP = path.join(S, 'config.json');
  wj(cfgP, { ...rj(cfgP), itemsRoot: kit });
  eq(guard({ tool_name: 'Edit', tool_input: { file_path: closed } }, { env, cwd: other }).code, 2, 'resolved against itemsRoot');
  eq(guard({ tool_name: 'Edit', tool_input: { file_path: path.join(kit, 'docs', 'spec.md') } }, { env, cwd: other }).code, 0, 'open unit file in the kit allowed');
});
test('guard: a shared item file is blocked only while every unit listing it is closed', () => {
  const S = guardS({ running: false });
  const env = { LTZ_STATE: S };
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  const shared = path.join(REPO, 'docs', 'shared.md');
  const closedMd = path.join(REPO, 'docs', 'closed.md');
  const units = (u1, u2, extra = {}) => wj(cfgP, { ...base, units: { u1: { status: u1[0], itemFiles: u1[1] }, u2: { status: u2[0], itemFiles: u2[1] }, ...extra } });
  const edit = (p, tool = 'Edit') => guard({ tool_name: tool, tool_input: { file_path: p } }, { env });
  // Open A plus closed B both list F: allowed, in either config order.
  units(['open', ['docs/spec.md', 'docs/shared.md']], ['closed', ['docs/closed.md', 'docs/shared.md']]);
  eq(edit(shared).code, 0, 'open u1 + closed u2 share it: allowed');
  units(['closed', ['docs/closed.md', 'docs/shared.md']], ['open', ['docs/spec.md', 'docs/shared.md']]);
  eq(edit(shared).code, 0, 'closed u1 + open u2 share it: allowed');
  // A file only closed units list: blocked, naming them.
  let r = edit(closedMd);
  eq(r.code, 2, 'a file only closed u1 lists: blocked, as before');
  ok(/holds items of unit u1, which is closed\. Closed units are not edited/.test(r.out), r.out);
  units(['closed-known-wrongs', ['docs/spec.md', 'docs/shared.md']], ['closed', ['docs/closed.md', 'docs/shared.md']]);
  r = edit(shared);
  eq(r.code, 2, 'both closed: blocked');
  ok(/holds items of units u1 \(closed-known-wrongs\) and u2 \(closed\), which are all closed/.test(r.out), r.out);
  units(['closed', ['docs/shared.md']], ['closed', ['docs/shared.md']], { u3: { status: 'closed-leads-pending', itemFiles: ['docs/shared.md'] } });
  ok(/units u1 \(closed\), u2 \(closed\) and u3 \(closed-leads-pending\), which are all closed/.test(edit(shared, 'Write').out), 'three closed units named');
  units(['closed', ['docs/shared.md']], ['closed', ['docs/shared.md']], { u3: { status: 'open', itemFiles: ['docs/shared.md'] } });
  eq(edit(shared, 'NotebookEdit').code, 0, 'two closed and one open: allowed');
  if (process.platform === 'win32') {
    units(['closed', ['docs/shared.md']], ['closed', ['docs/shared.md']]);
    eq(edit(shared.replace(/^[A-Z]:/, (m) => m.toLowerCase()).replace(/\\/g, '/'), 'MultiEdit').code, 2, 'both closed, matched case- and slash-insensitively');
    units(['open', ['docs/shared.md']], ['closed', ['DOCS\\Shared.md']]);
    eq(edit(shared).code, 0, 'one open, matched case- and slash-insensitively');
  }
  // final-check counts as open.
  units(['final-check', ['docs/spec.md', 'docs/shared.md']], ['closed', ['docs/closed.md', 'docs/shared.md']]);
  eq(edit(shared).code, 0, 'final-check u1 + closed u2: allowed');
  // An open unit's folder entry covering a file a closed unit lists by name unblocks it.
  units(['open', ['docs/']], ['closed', ['docs/closed.md']]);
  eq(edit(closedMd).code, 0, 'open u1 lists docs/, closed u2 lists docs/closed.md: allowed');
  units(['open', ['src/']], ['closed', ['docs/closed.md']]);
  eq(edit(closedMd).code, 2, 'control: an open folder entry that does not cover it');
  units(['closed', ['docs/']], ['closed', ['docs/closed.md']]);
  ok(/units u1 \(closed\) and u2 \(closed\)/.test(edit(closedMd).out), 'a closed folder entry counts as a matching unit');
  // A file no unit lists is not an item file.
  units(['closed', ['docs/closed.md']], ['closed', ['docs/shared.md']]);
  eq(edit(path.join(REPO, 'src', 'auth.js')).code, 0, 'a file no unit lists, in the repo');
  eq(edit(path.join(RUN, 'notes.txt')).code, 0, 'a file no unit lists, elsewhere');
  // The writer lock is unchanged: a shared file with an open unit is still the writer's.
  units(['open', ['docs/shared.md']], ['closed', ['docs/shared.md']]);
  wj(path.join(S, 'writer.lock'), { session: 'other', since: '2026-11-05T00:00:00Z' });
  r = edit(shared);
  eq(r.code, 2, 'another session holds the lock');
  ok(/is an item file of unit u1, and S\/writer\.lock is held by session other/.test(r.out) && !/which are all closed|which is closed/.test(r.out), r.out);
});
test('guard lock: another session may not edit item files, the decision log or top-level state files', () => {
  const S = guardS({ running: false, lockedBy: 'other' });
  const cfgP = path.join(S, 'config.json');
  wj(cfgP, { ...rj(cfgP), decisionLog: '../decision-log.md' });
  const env = { LTZ_STATE: S };
  const write = (p, session) => guard({ tool_name: 'Write', tool_input: { file_path: p }, ...(session ? { session_id: session } : {}) }, { env });
  const blocked = [
    path.join(S, 'classes.md'), path.join(S, 'items.jsonl'), path.join(S, 'loop.md'), path.join(S, 'config.json'), path.join(S, 'lessons.md'),
    path.join(S, 'judgments.jsonl'), path.join(S, 'decisions.md'), path.join(S, 'cross-unit-edits.txt'), path.join(S, 'closed-unit-leads.txt'),
    path.join(S, 'canaries.jsonl'), path.join(path.dirname(S), 'decision-log.md'), path.join(REPO, 'docs', 'spec.md'),
  ];
  for (const p of blocked) {
    const r = write(p);
    eq(r.code, 2, `blocked: ${p}`);
    ok(/held by session other/.test(r.out), r.out);
  }
  ok(/is the decision log/.test(write(path.join(path.dirname(S), 'decision-log.md')).out), 'names the decision log');
  ok(/is an item file of unit u1/.test(write(path.join(REPO, 'docs', 'spec.md')).out), 'names the item file');
  eq(write(path.join(S, 'classes.md'), 'other').code, 0, 'the holder may write');
  eq(guard(bash('ls'), { env }).code, 0, 'reads allowed');
});
test('guard lock: a round folder\'s writer files are locked too; agent outputs are not', () => {
  const S = guardS({ running: false, lockedBy: 'other' });
  const env = { LTZ_STATE: S };
  const rd = RD(S);
  const write = (p) => guard({ tool_name: 'Write', tool_input: { file_path: p } }, { env });
  for (const f of ['confirmed.json', 'fixlog.jsonl', 'queue.json', 'report.json', 'measure.json', 'retro.md', 'canary-plan.json', 'fixcheck-1-c1-input.jsonl', 'fixcheck-2-c3-input.jsonl']) {
    const r = write(path.join(rd, f));
    eq(r.code, 2, `locked: ${f}`);
    ok(/is the round file S\/u1\/r1\//.test(r.out), r.out);
  }
  for (const f of ['agent-c1-a.jsonl', 'render-c1-a.jsonl', 'w-c1-a-1.txt', 'fixcheck-1-c1.jsonl', 'fixcheck-2-c3.jsonl']) eq(write(path.join(rd, f)).code, 0, `agent output allowed: ${f}`);
  eq(write(path.join(rd, 'sub', 'confirmed.json')).code, 0, 'not a round-folder file');
  eq(guard({ tool_name: 'Write', tool_input: { file_path: path.join(rd, 'confirmed.json') }, session_id: 'other' }, { env }).code, 0, 'the holder may write it');
});
test('guard lock: readers and fresh fix checkers write their result files and scratch freely', () => {
  const S = guardS({ running: false, lockedBy: 'other' });
  const env = { LTZ_STATE: S };
  const rd = RD(S);
  for (const p of [
    path.join(rd, 'agent-c1-a.jsonl'), path.join(rd, 'render-c1-a.jsonl'), path.join(rd, 'w-c1-a-1.txt'), path.join(rd, 'fixcheck-1-c1.jsonl'),
    path.join(RUN, 'scratch', 'c1-a', 'helper.mjs'), path.join(RUN, 'notes.txt'), path.join(S, 'u1', 'notes.md'),
  ]) {
    eq(guard({ tool_name: 'Write', tool_input: { file_path: p } }, { env }).code, 0, `allowed: ${p}`);
  }
});
test('guard lock: another session\'s commit may not include the writer\'s files', () => {
  const { S, repo, g, env } = guardRepo();
  wj(path.join(RD(path.join(repo, 'S')), 'queue.json'), { groups: [], slots: [{ slot: 'c1-a', state: 'done' }] });
  wj(path.join(S, 'writer.lock'), { session: 'other', since: '2026-11-05T00:00:00Z' });
  fs.writeFileSync(path.join(RD(S), 'agent-c1-a.jsonl'), '{}\n');
  g(['add', 'S/u1/r1/agent-c1-a.jsonl']);
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 0, 'a reader output only');
  fs.appendFileSync(path.join(S, 'classes.md'), 'edit\n');
  g(['add', 'S/classes.md']);
  const r = guard(bash('git commit -m x'), { env, cwd: repo });
  eq(r.code, 2, 'a top-level state file staged');
  ok(/would include the writer's files .*classes\.md/.test(r.out), r.out);
  g(['reset', '-q', 'S/classes.md']);
  eq(guard(bash('git add docs/spec.md && git commit -m x'), { env, cwd: repo }).code, 2, 'an item file');
  eq(guard(bash('git commit -m x'), { env: { ...env }, cwd: repo, }).code, 0, 'control: only the reader output staged again');
  eq(guard({ tool_name: 'Bash', tool_input: { command: 'git add S/classes.md && git commit -m x' }, session_id: 'other' }, { env, cwd: repo }).code, 0, 'the holder may commit them');
});
test('guard lock: each historyFolders folder\'s judgments.jsonl is a writer file; nothing else in that folder is', () => {
  const S = guardS({ running: false, lockedBy: 'other' });
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  const env = { LTZ_STATE: S };
  const D = path.join(S, 'discovery');
  const dj = path.join(D, 'judgments.jsonl');
  fs.mkdirSync(path.join(D, 'u1', 'r1'), { recursive: true });
  const write = (p, session) => guard({ tool_name: 'Write', tool_input: { file_path: p }, ...(session ? { session_id: session } : {}) }, { env });
  eq(write(dj).code, 0, 'control: without historyFolders it is not a writer file');
  const others = [path.join(D, 'classes.md'), path.join(D, 'config.json'), path.join(D, 'items.jsonl'), path.join(D, 'u1', 'r1', 'confirmed.json'), path.join(D, 'u1', 'r1', 'fixlog.jsonl')];
  for (const h of ['discovery', 'discovery/']) {
    wj(cfgP, { ...base, historyFolders: [h] });
    const r = write(dj);
    eq(r.code, 2, `blocked under another session's lock (historyFolders ["${h}"])`);
    ok(/is S\/discovery\/judgments\.jsonl, and S\/writer\.lock is held by session other/.test(r.out), r.out);
    eq(write(dj, 'other').code, 0, `the holder may write it (["${h}"])`);
    for (const p of others) eq(write(p).code, 0, `still writable: ${p} (["${h}"])`);
    eq(write(path.join(S, 'judgments.jsonl')).code, 2, `S/judgments.jsonl stays locked (["${h}"])`);
  }
  // A listed folder that does not exist is no guard error; its judgments.jsonl path is still the writer's.
  wj(cfgP, { ...base, historyFolders: ['discovery', 'nope'] });
  eq(write(path.join(RUN, 'notes.txt')).code, 0, 'a missing listed folder is not a guard error');
  eq(write(path.join(S, 'nope', 'judgments.jsonl')).code, 2, 'the missing folder\'s judgments.jsonl path is locked too');
  eq(write(dj).code, 2, 'the other folder still counts');
  fs.rmSync(path.join(S, 'writer.lock'));
  eq(write(dj).code, 0, 'no lock: allowed');
  // A historyFolders that is present but not an array of folder paths is a guard error (fail closed).
  for (const bad of ['discovery', null, [5], ['discovery', ' '], {}]) {
    wj(cfgP, { ...base, historyFolders: bad });
    const r = write(path.join(RUN, 'notes.txt'));
    eq(r.code, 2, `a guard error for historyFolders ${JSON.stringify(bad)}`);
    ok(/guard error: config\.json: "historyFolders" must be an array of folder paths \(relative to S\/\).*; fix or disable the guard/.test(r.out), r.out);
  }
  wj(cfgP, { ...base, historyFolders: [] });
  eq(write(path.join(RUN, 'notes.txt')).code, 0, 'control: an empty list is fine');
});
test('guard lock: another session\'s commit may not include a historyFolders folder\'s judgments.jsonl', () => {
  const { S, repo, g, env } = guardRepo();
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  wj(path.join(RD(S), 'queue.json'), { groups: [], slots: [{ slot: 'c1-a', state: 'done' }] });
  wj(path.join(S, 'writer.lock'), { session: 'other', since: '2026-11-05T00:00:00Z' });
  fs.mkdirSync(path.join(S, 'discovery'), { recursive: true });
  fs.writeFileSync(path.join(S, 'discovery', 'judgments.jsonl'), '{}\n');
  fs.writeFileSync(path.join(S, 'discovery', 'classes.md'), '# c\n');
  g(['add', 'S/discovery/classes.md']);
  wj(cfgP, { ...base, historyFolders: ['discovery'] });
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 0, 'another discovery file only');
  g(['add', 'S/discovery/judgments.jsonl']);
  const r = guard(bash('git commit -m x'), { env, cwd: repo });
  eq(r.code, 2, 'the discovery judgments.jsonl staged');
  ok(/would include the writer's files .*discovery[\\/]judgments\.jsonl/.test(r.out), r.out);
  eq(guard({ ...bash('git commit -m x'), session_id: 'other' }, { env, cwd: repo }).code, 0, 'the holder may commit it');
  wj(cfgP, base);
  eq(guard(bash('git commit -m x'), { env, cwd: repo }).code, 0, 'control: without historyFolders it is not a writer file');
});
test('guard: an unreadable writer.lock counts as held; an unreadable queue.json counts as open', () => {
  const S = guardS({ running: false });
  const env = { LTZ_STATE: S };
  const classes = { tool_name: 'Write', tool_input: { file_path: path.join(S, 'classes.md') } };
  eq(guard(classes, { env }).code, 0, 'control: no lock');
  fs.writeFileSync(path.join(S, 'writer.lock'), 'garbage');
  const r = guard(classes, { env });
  eq(r.code, 2, 'unreadable lock');
  ok(/unreadable writer\.lock/.test(r.out), r.out);
  fs.rmSync(path.join(S, 'writer.lock'));
  const { repo, g, env: env2 } = guardRepo();
  wj(path.join(RD(path.join(repo, 'S')), 'queue.json'), { groups: [], slots: [{ slot: 'c1-a', state: 'done' }] });
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'edit\n');
  g(['add', 'docs/spec.md']);
  eq(guard(bash('git commit -m x'), { env: env2, cwd: repo }).code, 0, 'control: all jobs done');
  fs.writeFileSync(path.join(RD(path.join(repo, 'S')), 'queue.json'), '{ broken');
  const r2 = guard(bash('git commit -m x'), { env: env2, cwd: repo });
  eq(r2.code, 2, 'unreadable queue.json');
  ok(/u1\/r1 queue\.json \(unreadable\)/.test(r2.out), r2.out);
});
test('guard: its own errors block (exit 2) with a clear message', () => {
  const S = guardS({ running: false });
  const env = { LTZ_STATE: S };
  const cfgP = path.join(S, 'config.json');
  const good = fs.readFileSync(cfgP, 'utf8');
  eq(guard({ tool_name: 'Edit', tool_input: { file_path: path.join(RUN, 'x.txt') } }, { env }).code, 0, 'control: a sound config');
  wj(cfgP, { ...JSON.parse(good), units: { u1: { status: 'open', itemFiles: ['docs/spec.md'] }, u2: { status: 'closed', itemFiles: 5 } } });
  let r = guard({ tool_name: 'Edit', tool_input: { file_path: path.join(RUN, 'x.txt') }, session_id: 'me' }, { env });
  eq(r.code, 2, 'a malformed itemFiles makes the guard throw');
  ok(/guard error: .*; fix or disable the guard/.test(r.out), r.out);
  ok(r.out.includes(`(state folder ${S})`), `names the state folder:\n${r.out}`);
  fs.writeFileSync(cfgP, '{ not json');
  r = guard({ tool_name: 'Edit', tool_input: { file_path: path.join(RUN, 'x.txt') } }, { env });
  eq(r.code, 2, 'an unreadable config.json');
  ok(/guard error: S\/config\.json could not be read/.test(r.out), r.out);
  fs.writeFileSync(cfgP, good);
  const raw = spawnSync(process.execPath, [GUARD], { input: 'not json', encoding: 'utf8', env: { ...GIT_ENV, LTZ_STATE: S }, cwd: RUN });
  eq(raw.status, 2, 'hook input that is not JSON');
  ok(/guard error: the hook input was not JSON/.test(raw.stderr), raw.stderr);
  const inert = spawnSync(process.execPath, [GUARD], { input: 'not json', encoding: 'utf8', env: GIT_ENV, cwd: path.join(RUN, 'no-marker') });
  eq(inert.status, 0, 'control: inert without a state folder');
});
test('guard: a search piped into head / Select-Object -First is blocked', () => {
  const S = guardS({ running: false });
  const env = { LTZ_STATE: S };
  for (const c of ['grep -rn only src | head -20', 'rg -l foo | sort | head', 'findstr /s x *.md | head -n 3']) eq(guard(bash(c), { env }).code, 2, c);
  const ps = (command) => ({ tool_name: 'PowerShell', tool_input: { command } });
  eq(guard(ps('Select-String -Path *.md -Pattern only | Select-Object -First 5'), { env }).code, 2, 'PowerShell Select-Object -First');
  eq(guard(ps('rg foo | select -First 3'), { env }).code, 2, 'select alias');
  const r = guard(bash('grep x a | head'), { env });
  ok(/a search backing a bound must be unlimited/.test(r.out), r.out);
  eq(guard(bash('rg -c only src'), { env }).code, 0, 'unlimited search allowed');
  eq(guard(ps('Get-Content a.txt | Select-Object -First 5'), { env }).code, 0, 'head without a search allowed');
  eq(guard({ tool_name: 'Edit', tool_input: { file_path: path.join(RUN, 'x.txt') } }, { env }).code, 0, 'normal edit allowed');
});

// ---- batch 1 (skill survey): dismissed wrongs need a reason; folder evidence is checksummed
test('record: every reader wrong left unconfirmed needs a "rejected" entry with its reason and the file:line that answers it', () => {
  const S = baseCopy();
  const conf = path.join(RD(S), 'confirmed.json');
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  const bare = { ...CONFIRMED, rejected: [] };
  // c2-b marked A09 wrong and the writer did not confirm it: a silent dismissal is refused.
  wj(conf, bare);
  fails(rec(), /PROBLEM: confirmed.json: A09 was marked wrong by c2-b but is not confirmed, pending, a defect, withdrawn, outside the bar or restated, and has no "rejected" entry/);
  const NOTE = 'config/app.json:2 is 30, as the item says; the reader misread the unit';
  wj(conf, { ...bare, rejected: [{ id: 'A09', note: NOTE }] });
  const r = passes(rec(), 'with its reason');
  const m = rj(path.join(RD(S), 'measure.json'));
  eq([m.chunks.c2.falseAlarms['c2-b'], m.chunks.c2.falseAlarmIds['c2-b']], [1, ['A09']], 'still a false alarm');
  const by = Object.fromEntries(rj(path.join(RD(S), 'report.json')).items.map((x) => [x.id, x]));
  eq(by.A09.verdict, 'ok', 'reported ok');
  ok(by.A09.note.includes(`rejected: ${NOTE}`), `the reason is in the report: ${by.A09.note}`);
  ok(/rejected 1/.test(r.out), `counted in the summary:
${r.out}`);
  // An earlier reasoned ok may stand in for the file:line.
  wj(conf, { ...bare, rejected: [{ id: 'A09', note: 'history: u1 r0 slot x reasoned ok on this exact point holds' }] });
  passes(rec(), 'a history reason');
  for (const [extra, re] of [
    [{ ...bare, rejected: [{ id: 'A09', note: 'looks fine to me' }] }, /PROBLEM: confirmed.json: rejected A09 has no file:line that answers the refuter \(or a note starting "history:" that names the earlier reasoned ok\)/],
    [{ ...bare, rejected: [{ id: 'A09' }] }, /rejected A09 has no file:line/],
    [{ ...bare, rejected: 'A09' }, /PROBLEM: confirmed.json: "rejected" must be an array of {"id", "note"} entries/],
    [{ ...bare, rejected: [{ id: 'A09', note: NOTE }, { id: 'A09', note: NOTE }] }, /"rejected" lists A09 twice/],
    [{ ...bare, rejected: [{ id: 'A02', note: NOTE }, { id: 'A09', note: NOTE }] }, /A02 is both rejected and confirmed wrong/],
    [{ ...bare, rejected: [{ id: 'A09', note: NOTE }], outsideBar: [{ id: 'A09', note: NOTE }] }, /A09 is both rejected and outside the bar/],
    [{ ...bare, rejected: [{ id: 'Z9', note: NOTE }, { id: 'A09', note: NOTE }] }, /rejected id Z9 is not an item in this round's snapshot/],
  ]) {
    wj(conf, extra);
    fails(rec(), re);
  }
  wj(conf, { ...bare, rejected: [{ id: 'A09', note: NOTE }, { id: 'A10', note: NOTE }] });
  ok(/WARNING: confirmed.json: A10 is rejected, but no reader marked it wrong/.test(passes(rec()).out), 'a warning only');
});
test('evidence: a dir source with "sha256" is refused once its files change; without one, snapshot prints the hash to pin', () => {
  const root = path.join(RUN, `export-${++nS}`);
  fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(root, 'policy.md'), '# Policy\nRotation: 90 days\n');
  fs.writeFileSync(path.join(root, 'sub', 'b.md'), 'b\n');
  const S = makeS({ config: { evidence: { type: 'dir', root } } });
  const r0 = snap(S);
  const m = /evidence dir .* has no "sha256"; to pin it, set "sha256": "([0-9a-f]{64})" on that source/.exec(r0.out);
  ok(m, `snapshot names the hash to pin:
${r0.out}`);
  const cfgP = path.join(S, 'config.json');
  const cfg = rj(cfgP);
  wj(cfgP, { ...cfg, evidence: { ...cfg.evidence, sha256: m[1] } });
  ok(!/has no "sha256"/.test(snap(S).out), 'no hint once pinned');
  const show = () => ltz(['show', S, 'u1', '1', 't-a', 'policy.md:2']);
  ok(/Rotation: 90 days/.test(passes(show(), 'control: unchanged').out), 'reads while unchanged');
  fs.writeFileSync(path.join(root, 'sub', 'b.md'), 'b changed\n');
  fails(show(), /evidence dir .* has changed since it was pinned: sha256 [0-9a-f]{64}, config "sha256" [0-9a-f]{64}/);
  fs.writeFileSync(path.join(root, 'sub', 'b.md'), 'b\n');
  passes(show(), 'restored');
  fs.writeFileSync(path.join(root, 'new.md'), 'x\n');
  fails(show(), /has changed since it was pinned/, 'an added file');
  fs.rmSync(path.join(root, 'new.md'));
  fs.renameSync(path.join(root, 'sub', 'b.md'), path.join(root, 'sub', 'c.md'));
  fails(show(), /has changed since it was pinned/, 'a renamed file');
  wj(cfgP, { ...cfg, evidence: { ...cfg.evidence, sha256: 'abc' } });
  fails(show(), /evidence: "sha256" must be 64 hex characters/);
});

// ---- batch 2a (skill survey): what a clean round can show
test('estimate: a 95% range on the remaining wrongs (Chapman variance), and lowConfidence when the overlap is under 3', () => {
  eq(estimateRange(14, 4, 2), { remainingLow: 0, remainingHigh: 21.86, lowConfidence: true, why: 'overlap m = 2 (under 3): the estimate is unstable' }, 'small overlap');
  eq(estimateRange(20, 20, 10), { remainingLow: 0, remainingHigh: 19.89, lowConfidence: false }, 'good overlap');
  eq(estimateRange(0, 0, 0), { remainingLow: 0, remainingHigh: 0, lowConfidence: true, why: 'no reader found a wrong: the estimate is 0 by construction and shows nothing' }, 'a zero pass');
  eq(estimateRange(40, 40, 30).lowConfidence, false, 'control');
  ok(estimateRange(40, 40, 30).remainingHigh > 0, 'a positive upper bound');
});
test('record: each chunk estimate carries its range and lowConfidence, and the total says whether any chunk is low-confidence', () => {
  const S = baseCopy();
  passes(ltz(['record', S, 'u1', '1', ...READERS]));
  const m = rj(path.join(RD(S), 'measure.json'));
  const c1 = m.chunks.c1.estimate;
  ok(Array.isArray(c1.range) && c1.range.length === 2 && c1.range[0] <= c1.remaining && c1.range[1] >= c1.remaining, `c1 range brackets remaining: ${JSON.stringify(c1)}`);
  eq(c1.lowConfidence, true, 'c1 overlap is 1');
  eq(m.total.estimate.lowConfidence, true, 'total flags it');
  ok(Array.isArray(m.total.estimate.range), 'total range');
});

// ---- batch 2b (skill survey): held-out replay, seeded spot-checks
test('replay --holdout: recall is also reported without the rounds the rule came from', () => {
  const S = makeS();
  snap(S);
  wj(path.join(RD(S), 'confirmed.json'), { A05: { note: 'docs/spec.md:8', class: 'U1' } });
  passes(ltz(['snapshot', S, 'u1', '2', '--chunk-size', '6']), 'snapshot r2');
  wj(path.join(S, 'u1', 'r2', 'confirmed.json'), { A07: { note: 'src/billing.js:4', class: 'U1' } });
  const r = passes(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1', '--holdout', 'u1/r2']));
  ok(/U-only: recall 2\/2, false hits \d+ over 2 round\(s\)/.test(r.out), `all rounds:\n${r.out}`);
  ok(/held out u1\/r2: U-only: recall 1\/1, false hits \d+ over 1 round\(s\)/.test(r.out), `held-out line:\n${r.out}`);
  fails(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1', '--holdout', 'u1/r9']), /--holdout u1\/r9 names no replayed round/);
  fails(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1', '--holdout', 'u1/r1,u1/r2']), /--holdout leaves no round to replay/);
});
test('spotcheck: seeded random ok picks per reader, spread over early and late positions, recorded in spotchecks.json', () => {
  const run = (S, extra = []) => ltz(['spotcheck', S, 'u1', '1', '--seed', '7', '--per-slot', '2', ...extra]);
  const S = baseCopy();
  const r = passes(run(S, ['--extra', 'c2-b=2']));
  const sp = rj(path.join(RD(S), 'spotchecks.json'));
  eq([sp.seed, sp.perSlot], [7, 2], 'seed and count recorded');
  eq(Object.keys(sp.picks).sort(), ['c1-a', 'c1-b', 'c2-a', 'c2-b'], 'one entry per reader file');
  eq([sp.picks['c1-a'].length, sp.picks['c2-b'].length], [2, 4], 'per slot, plus --extra');
  for (const [slot, picks] of Object.entries(sp.picks)) {
    const wrongs = new Set(rjl(path.join(RD(S), `agent-${slot}.jsonl`)).filter((o) => o.verdict === 'wrong').map((o) => o.id));
    ok(picks.every((x) => !wrongs.has(x.id)), `${slot}: only items it marked ok`);
    ok(picks.some((x) => x.half === 'early') && picks.some((x) => x.half === 'late'), `${slot}: early and late both picked: ${JSON.stringify(picks)}`);
  }
  ok(/spotcheck u1 r1: seed 7/.test(r.out), r.out);
  fails(run(S), /refusing: .*spotchecks\.json already exists/);
  const S2 = baseCopy();
  passes(run(S2, ['--extra', 'c2-b=2']));
  eq(rj(path.join(RD(S2), 'spotchecks.json')).picks, sp.picks, 'the same seed gives the same picks');
  fails(ltz(['spotcheck', baseCopy(), 'u1', '1', '--per-slot', '2']), /spotcheck needs --seed N/);
  fails(ltz(['spotcheck', baseCopy(), 'u1', '1', '--seed', '7', '--extra', 'zz=1']), /--extra names zz, which has no reader file/);
});

// ---- batch 3 (skill survey): templated ok notes
test('record: a reader whose ok notes repeat one text on 5 or more items gets a template warning', () => {
  const S = baseCopy();
  const rec = () => passes(ltz(['record', S, 'u1', '1', ...READERS])).out;
  let out = rec();
  ok(/WARNING: c2-a: 6 ok notes share one text \("holds at the pin"\): A07, A08, A09, A10, A11, A12; a template is not a reading/.test(out), out);
  // Notes that differ only in file:line and numbers are still one template.
  const fp = path.join(RD(S), 'agent-c2-a.jsonl');
  editJsonl(fp, (rows) => rows.map((r, i) => ({ ...r, note: `holds at src/f${i}.js:${i + 3}` })));
  out = rec();
  ok(/WARNING: c2-a: 6 ok notes share one text/.test(out), `refs and numbers ignored:\n${out}`);
  // Distinct, reasoned notes: no warning for that reader.
  editJsonl(fp, (rows) => rows.map((r, i) => ({ ...r, note: ['the universal holds: no other writer', 'the default is 30 s at the cited line', 'the list is closed by the switch', 'the flag gates it as stated', 'the count is 3, as the loop shows', 'the name matches the export'][i] })));
  out = rec();
  ok(!/WARNING: c2-a: .*share one text/.test(out), `distinct notes:\n${out}`);
  ok(/WARNING: c2-b: 5 ok notes share one text/.test(out), 'control: c2-b still templated');
});

// ---- code-versus-docs audit: searches, diffcheck, flips, replay
test('searches at the pin: globs that select no file fail (diffcheck, searches, reach)', () => {
  // A misspelt folder, a brace glob and a bare folder name select nothing: "0 hits" over no file would
  // back any "no X" claim.
  const S = makeS();
  snap(S);
  fails(verifyRun(S, { regex: 'RATE', paths: ['scr/**'] }, 0), /MISMATCH: A01\.title \(fixlog line 1\): the search's globs \(scr\/\*\*\) select no file at the pin/, 'a misspelt folder');
  fails(verifyRun(S, { regex: 'RATE', paths: ['src/**/*.{js,md}'] }, 0), /select no file at the pin/, 'a brace glob is a literal');
  passes(verifyRun(S, { regex: 'RATE', paths: ['src/**'] }, 2, { at: RATE_SRC }), 'control: a glob that selects files');
  const S2 = makeS({ config: { boundaryPaths: ['src'] } });
  snap(S2);
  fails(verifyRun(S2, { regex: 'RATE' }, 0), /the search's globs \(src\) select no file at the pin/, 'a bare folder name in boundaryPaths');
  fails(ltz(['searches', S2]), /PROBLEM: u1\/r1 A01\.title \(fixlog line 1\): the search's globs \(src\) select no file at the pin/, 'searches');
  fails(ltz(['reach', S2, '--to', 'HEAD']), /boundaryPaths \(src\) select no file at v1 or at HEAD/, 'reach');
  const S3 = makeS({ config: { boundaryPaths: ['src/'] } });
  snap(S3);
  ok(/between v1 and HEAD: 1 file\(s\) \(src\/auth\.js\)/.test(passes(ltz(['reach', S3, '--to', 'HEAD']), 'control: a trailing slash covers the folder').out), 'reach control');
});
test('searches at the pin: a pinned folder that has changed since is not searched', () => {
  const root = path.join(RUN, `export-${++nS}`);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'const RATE = 1;\nuse(RATE);\n');
  const S = makeS({ config: { evidence: { type: 'dir', root } } });
  const m = /set "sha256": "([0-9a-f]{64})"/.exec(snap(S).out);
  ok(m, 'snapshot names the hash');
  const cfgP = path.join(S, 'config.json');
  const cfg = rj(cfgP);
  wj(cfgP, { ...cfg, evidence: { ...cfg.evidence, sha256: m[1] } });
  snap(S); // pin.json now records the sha256
  const A = ['src/a.js:1', 'src/a.js:2'];
  passes(verifyRun(S, { regex: 'RATE' }, 2, { at: A }), 'control: the folder matches its pin');
  fs.writeFileSync(path.join(root, 'src', 'b.js'), 'RATE again\n');
  fails(verifyRun(S, { regex: 'RATE' }, 2, { at: A }), /MISMATCH: A01\.title \(fixlog line 1\): evidence dir .* has changed since it was pinned/, 'diffcheck does not search a folder that no longer matches its sha256');
  // The folder is pinned again at its new content: the round recorded the old sha256, which is gone.
  const now = /has changed since it was pinned: sha256 ([0-9a-f]{64}),/.exec(ltz(['show', S, 'u1', '1', 't-a', 'src/a.js:1']).out);
  ok(now, 'show names the current hash');
  wj(cfgP, { ...cfg, evidence: { ...cfg.evidence, sha256: now[1] } });
  const r = fails(ltz(['searches', S, '--rounds', 'u1']), /PROBLEM: u1\/r1: its searches cannot be re-run at the pin it recorded: evidence dir .* has changed since it was pinned/);
  ok(!/re-run at their own snapshot pin/.test(r.out), `not reported as re-run at its own pin:\n${r.out}`);
});
test('diffcheck: the removal of another unit\'s item is logged as a cross-unit entry', () => {
  const S = crossS();
  const c02 = rjl(path.join(S, 'items.jsonl')).find((x) => x.id === 'C02');
  editJsonl(path.join(S, 'items.jsonl'), (rows) => rows.filter((x) => x.id !== 'C02'));
  fixlog(S, [fl('C02', '*', c02, null, { unit: 'u3' })]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'the removed item is in neither u1\'s snapshot nor the current items, and that is fine');
  fixlog(S, [fl('C02', '*', c02, null, { unit: 'u3' }), fl('C99', '*', { id: 'C99' }, null, { unit: 'u3' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /C99\.\* is logged for unit u3 but did not change since u3\/r1/, 'control: an id that was never an item');
  fixlog(S, [fl('C02', '*', c02, null, { unit: 'u3' }), fl('Z99', 'title', 'a', 'b')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /Z99 is not an item/, 'control: an entry of this unit still needs a real item');
});
test('diffcheck: a field added to an item, or removed from one, is logged with null for the missing side', () => {
  const S = makeS();
  snap(S);
  setItems(S, [['A01', 'owner', 'ops']]);
  fixlog(S, [fl('A01', 'owner', null, 'ops')]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'a field added: "old": null');
  fixlog(S, [fl('A01', 'owner', 'someone', 'ops')]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /A01\.owner: fixlog "old" \(line 1\) is not the snapshot value/, 'control: a wrong "old"');
  editJsonl(path.join(S, 'items.jsonl'), (rows) => rows.map((x) => {
    if (x.id !== 'A02') return x;
    const { reason, ...rest } = x;
    return rest;
  }));
  fixlog(S, [fl('A01', 'owner', null, 'ops'), fl('A02', 'reason', 'per the source', null)]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'a field removed: "new": null');
});
test('diffcheck: an entry naming a closed unit must still be a real change', () => {
  const S = makeS();
  snap(S);
  passes(ltz(['snapshot', S, 'u2', '1']), 'u2 baseline');
  fixlog(S, [fl('B01', 'title', 'closed one', 'closed one, edited', { unit: 'u2' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /MISMATCH: fixlog\.jsonl line 1: B01\.title is logged for closed unit u2 but did not change since u2\/r1/);
  setItems(S, [['B01', 'title', 'closed one, edited']]);
  const r = fails(ltz(['diffcheck', S, 'u1', '1']), /B01: item of closed unit u2 changed since u2\/r1/, 'control: a real change is flagged by the closed-unit check');
  ok(!/did not change since/.test(r.out), r.out);
});
test('diffcheck: r0\'s snapshot is no baseline for another unit\'s cross-unit edits', () => {
  const S = makeS({
    items: [...ITEMS, { id: 'C01', unit: 'u3', title: 'third one', plan: 'keep', reason: 'r', cites: [] }],
    config: { units: { u1: { status: 'open', itemFiles: [] }, u2: { status: 'closed', itemFiles: [] }, u3: { status: 'open', itemFiles: [] } } },
  });
  snap(S);
  passes(ltz(['snapshot', S, 'u3', '0']), 'u3 has only its r0');
  setItems(S, [['C01', 'title', 'edited']]);
  fixlog(S, [fl('C01', 'title', 'third one', 'edited', { unit: 'u3' })]);
  fails(ltz(['diffcheck', S, 'u1', '1']), /unit u3 has no round snapshot to compare its cross-unit edits with/);
  passes(ltz(['snapshot', S, 'u3', '1']), 'a baseline');
  setItems(S, [['C01', 'title', 'changed text']]);
  fixlog(S, [fl('C01', 'title', 'edited', 'changed text', { unit: 'u3' })]);
  passes(ltz(['diffcheck', S, 'u1', '1']), 'control: with a round 1 baseline it is compared');
});
test('diffcheck: a last word or number that only got longer is not an appended clause', () => {
  const S = makeS();
  snap(S);
  const change = (id, from, to) => {
    setItems(S, [['A10', 'title', 'retries is 3'], ['A01', 'title', 'login calls check'], [id, 'title', to]]);
    fixlog(S, [fl(id, 'title', from, to)]);
    return ltz(['diffcheck', S, 'u1', '1']);
  };
  passes(change('A10', 'retries is 3', 'retries is 30'), '"3" -> "30" is a changed value');
  passes(change('A10', 'retries is 3', 'retries is 3.5'), '"3" -> "3.5"');
  passes(change('A01', 'login calls check', 'login calls checkUser'), '"check" -> "checkUser"');
  fails(change('A01', 'login calls check', 'login calls check and then logs'), /A01\.title: clause appended with no sentence stop: "\.\.\. and then logs"/, 'control: a new clause');
});
test('flips: a cross-unit edit logged in another unit\'s fixlog belongs to this unit\'s history', () => {
  const mk = (title) => makeS({
    items: [...ITEMS, { id: 'C01', unit: 'u3', title, plan: 'keep', reason: 'r', cites: [] }],
    config: { units: { u1: { status: 'open', itemFiles: [] }, u2: { status: 'closed', itemFiles: [] }, u3: { status: 'open', itemFiles: [] } } },
  });
  // u3 changed the title, then u1's round changed it back: the item now holds the first value again.
  const S = mk('third one');
  wjl(path.join(RD(S, 'u3', 1), 'fixlog.jsonl'), [fl('C01', 'title', 'third one', 'third 1')]);
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('A01', 'title', 'X', 'Y'), fl('C01', 'title', 'third 1', 'third one', { unit: 'u3' })]);
  const r = fails(ltz(['flips', S, 'u3']), /1 unexplained flip\(s\)/, 'the return was made by u1\'s round');
  ok(/FLIP C01\.title: returned in u1\/r1 to a value first held in r1: "third one"/.test(r.out), r.out);
  ok(/2 entries \(1 logged for u3 in other units' fixlogs\)/.test(r.out), r.out);
  const r1 = passes(ltz(['flips', S, 'u1']), 'u1 has no flip of its own');
  ok(/flips u1: 1 fixlogs, 1 entries; 0 unexplained/.test(r1.out), `the entry tagged for u3 is not u1's:\n${r1.out}`);
  // With a ruling on the return, a later u3 entry that starts from the returned value explains nothing new.
  wjl(path.join(RD(S, 'u1', 1), 'fixlog.jsonl'), [fl('C01', 'title', 'third 1', 'third one', { unit: 'u3', ruling: 'D-12' })]);
  wjl(path.join(RD(S, 'u3', 3), 'fixlog.jsonl'), [fl('C01', 'title', 'third one', 'third uno')]);
  const r2 = passes(ltz(['flips', S, 'u3']), 'ruling-explained, and no gap in u3\'s chain');
  ok(/0 unexplained flip\(s\), 1 ruling-explained/.test(r2.out) && /RULING D-12: C01\.title returned in u1\/r1 to a value first held in r1/.test(r2.out), r2.out);
  // The other order: u1's round edited the title first, then u3 changed it back. The same two entries,
  // but the item now holds u3's value, so the return is u3's.
  const S2 = mk('third 1');
  wjl(path.join(RD(S2, 'u1', 1), 'fixlog.jsonl'), [fl('C01', 'title', 'third 1', 'third one', { unit: 'u3' })]);
  wjl(path.join(RD(S2, 'u3', 1), 'fixlog.jsonl'), [fl('C01', 'title', 'third one', 'third 1')]);
  const r3 = fails(ltz(['flips', S2, 'u3']), /1 unexplained flip\(s\)/);
  ok(/FLIP C01\.title: returned in r1 to a value first held in u1\/r1: "third 1"/.test(r3.out), r3.out);
});
test('replay: hits on items not read in the round, or found wrong there by a later round, are not false hits', () => {
  const S = makeS();
  snap(S);
  wj(path.join(RD(S), 'confirmed.json'), { A05: { note: 'docs/spec.md:8', class: 'U1' } });
  const run = () => passes(ltz(['replay', S, patFile(S, ONLY), '--rounds', 'u1'])).out;
  ok(/u1\/r1 U-only: recall 1\/1; false hits 1 \(A07\)/.test(run()), 'control: A07 is a false hit');
  // A later round found A07 wrong in text round 1 had read: an earlier miss.
  fs.writeFileSync(path.join(S, 'judgments.jsonl'), JSON.stringify({ date: '2026-01-02', unit: 'u1', round: 1, id: 'A07', was: 'ok', now: 'wrong', by: 'reader', reason: 'earlier miss' }) + '\n');
  let out = run();
  ok(/recall 1\/1; false hits 0; hits on items a later round found wrong here, not false hits: A07/.test(out), out);
  fs.rmSync(path.join(S, 'judgments.jsonl'));
  // No reader read A07 in this round (a final-check round's unqueued chunk, a dropped range).
  wj(path.join(RD(S), 'report.json'), { unit: 'u1', round: 1, items: [{ id: 'A05', verdict: 'wrong' }, { id: 'A07', verdict: 'unread' }] });
  out = run();
  ok(/recall 1\/1; false hits 0; hits on items not read in this round, not counted: A07/.test(out), out);
});

// ---- code-versus-docs audit, part 1: record, spotcheck, canary, crosscheck, cites
/** A state folder over a folder of evidence whose paths hold characters a file:line pattern cuts short. */
function oddPathsS() {
  const root = path.join(RUN, `dir-odd-${++nS}`);
  const put = (rel, lines) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), lines.join('\n') + '\n');
  };
  put('app/[slug]/page.tsx', ['// page', 'export default function Page() {}', '// end']);
  put('docs/my notes.md', ['# Notes', 'The limit is 5.', 'End.']);
  put('docs/\u00fcbersicht.md', ['# Overview', '', 'The owner is the platform team.']);
  put('src/(auth)/login.ts', ['export function login() {}', '// end']);
  put('src/C#/a.cs', ['class A {', '  static void Main() {}', '}']);
  put('data/a,b.txt', ['one', 'two', 'three']);
  const items = [
    item('P01', 'the page takes the slug', ['app/[slug]/page.tsx:2']),
    item('P02', 'the notes give a limit of 5', ['docs/my notes.md:2']),
    item('P03', 'the overview names the owner', ['docs/\u00fcbersicht.md:3']),
    item('P04', 'login takes a user', ['src/(auth)/login.ts:1']),
    item('P05', 'Main takes no arguments', ['src/C#/a.cs:2']),
    item('P06', 'the data file has three lines', ['data/a,b.txt:1-3']),
  ];
  const S = makeS({ items, config: { evidence: { type: 'dir', root } } });
  snap(S);
  return S;
}
test('record: a wrong\'s note may name a rendered path holding brackets, a space, a comma, "#" or a non-ASCII letter, and a range in either order', () => {
  const S = oddPathsS();
  const w = fs.readFileSync;
  const notes = {
    P01: 'app/[slug]/page.tsx:2 takes no slug',
    P02: 'docs/my notes.md:2 says 5, not 6',
    P03: 'docs/\u00fcbersicht.md:3 names the platform team',
    P04: 'src/(auth)/login.ts:1 takes no argument',
    P05: 'src/C#/a.cs:2 takes none',
    P06: 'data/a,b.txt:3-1 are the three lines',
  };
  reader(S, 'c1-a', 1, 6, Object.fromEntries(Object.entries(notes).map(([id, note]) => [id, { verdict: 'wrong', note, class: ['C2'] }])));
  reader(S, 'c1-b', 1, 6);
  ok(/static void Main/.test(w(path.join(RD(S), 'w-c1-a-4.txt'), 'utf8')), 'the line under the "#" folder is rendered');
  wj(path.join(RD(S), 'confirmed.json'), { ...Object.fromEntries(Object.keys(notes).map((id) => [id, { note: notes[id] }])), rejected: [] });
  const rec = () => ltz(['record', S, 'u1', '1', '--chunk-readers', 'c1=c1-a,c1-b']);
  passes(rec(), 'each note names a line its reader rendered');
  eq(rj(path.join(RD(S), 'measure.json')).chunks.c1.foundBy['c1-a'], 6, 'all six counted as c1-a\'s finds');
  // Controls: a line the reader did not render, and only the tail of a rendered path, are still refused.
  const fp = path.join(RD(S), 'agent-c1-a.jsonl');
  const keep = w(fp, 'utf8');
  editJsonl(fp, (rows) => rows.map((x) => (x.id === 'P02' ? { ...x, note: 'docs/my notes.md:99 says 5' } : x)));
  fails(rec(), /c1-a: P02 \(line 2\): wrong, but none of the file:line refs in its note \(notes\.md:99\) is in its render log/, 'a line never rendered');
  editJsonl(fp, (rows) => rows.map((x) => (x.id === 'P02' ? { ...x, note: 'notes.md:2 says 5' } : x)));
  fails(rec(), /c1-a: P02 \(line 2\): wrong, but none of the file:line refs in its note \(notes\.md:2\) is in its render log/, 'the tail of a rendered path is not that path');
  fs.writeFileSync(fp, keep);
  passes(rec());
});
test('cites: a "#" in a folder name does not make a key path', () => {
  eq(parseCite('src/C#/a.cs:1'), { kind: 'lines', path: 'src/C#/a.cs', from: 1, to: 1, norm: 'src/C#/a.cs:1' }, 'a line cite under a "#" folder');
  eq(parseCite('src/C#x/a.cs:3-5').kind, 'lines', 'a folder name holding "#"');
  eq([parseCite('docs/C#/readme.md:Install').kind, parseCite('docs/C#/readme.md:Install').path], ['key', 'docs/C#/readme.md'], 'a key cite under a "#" folder');
  // Controls: the key-path form is unchanged, a "/" inside a key included.
  eq(parseCite('config/nested.json#server.http.port').keys, ['server', 'http', 'port'], 'a key path');
  eq(parseCite('package.json#dependencies.@babel/core').keys, ['dependencies', '@babel/core'], 'a key holding "/"');
});
test('crosscheck: a number before a full stop or against a unit is seen; one line cited in two spellings is one family', () => {
  const S = makeS({ items: [
    item('X1', 'The timeout is 30.', ['config/app.json:2']),
    item('X2', 'The timeout is 45.', ['./config/app.json:2']),
    item('X3', 'retries wait 30s', ['config/app.json:3']),
    item('X4', 'retries wait 60s', ['config\\app.json:3']),
    item('X5', 'ships with version 1.2.3', ['docs/spec.md:1']),
    item('X6', 'ships with version 1.2.4', ['docs/spec.md:1']),
  ] });
  const r = passes(ltz(['crosscheck', S]));
  ok(/config\/app\.json:2: 2 items \(X1, X2\); numbers differ: X1 \[30\], X2 \[45\]/.test(r.out), r.out);
  ok(/config\/app\.json:3: 2 items \(X3, X4\); numbers differ: X3 \[30\], X4 \[60\]/.test(r.out), r.out);
  ok(/docs\/spec\.md:1: 2 items \(X5, X6\)$/m.test(r.out), 'control: a dotted version is not a number:\n' + r.out);
  ok(/3 shared cite\(s\), 2 with differing numbers/.test(r.out), r.out);
});
test('record: a reader the queue holds must be named in --chunk-readers, unless its slot is closed as replaced', () => {
  const S = baseCopy();
  passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
  passes(ltz(['record', S, 'u1', '1', ...READERS]), 'control: every queued reader named');
  // c1-b marked A02 wrong; left out, its lines would not be read at all.
  const short = ['--chunk-readers', 'c1=c1-a', 'c2=c2-a,c2-b'];
  fs.rmSync(path.join(RD(S), 'report.json'));
  fails(ltz(['record', S, 'u1', '1', ...short]), /PROBLEM: queue\.json holds slot c1-b \(chunk c1, state queued\), which --chunk-readers does not name, so its lines would be left out; name it, or close it with "queue <S> <unit> <R> mark c1-b replaced"/);
  ok(!fs.existsSync(path.join(RD(S), 'report.json')), 'nothing written');
  // A final-check unit may leave a chunk out of the queue, not a queued reader out of record.
  const cfgP = path.join(S, 'config.json');
  const base = rj(cfgP);
  wj(cfgP, { ...base, units: { ...base.units, u1: { ...base.units.u1, status: 'final-check' } } });
  fails(ltz(['record', S, 'u1', '1', '--chunk-readers', 'c2=c2-a,c2-b']), /queue\.json holds slot c1-a .*\n.*queue\.json holds slot c1-b /, 'a final-check round too');
  wj(cfgP, base);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-b', 'replaced']));
  passes(ltz(['record', S, 'u1', '1', ...short]), 'an abandoned slot, closed as replaced, is not needed');
});
test('record: a wrong marked only by a wholly superseded rerun still warns; a parent whose whole range was re-read needs no files', () => {
  const S = baseCopy();
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c2-a', '--from', '10', '--to', '12']));
  const [x] = rerunsOf(S, 'c2-a');
  reader(S, x.slot, 10, 12, { A11: { verdict: 'wrong', note: 'docs/spec.md:4 names a password only', class: ['U1'] } });
  fails(rec(), new RegExp(`A11 was marked wrong by ${x.slot} but is not confirmed`), 'control: the rerun alone, its wrong unaccounted');
  // A second rerun of the same range marks A11 ok: the first rerun supplies no position now.
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c2-a', '--from', '10', '--to', '12']));
  const y = rerunsOf(S, 'c2-a')[1];
  reader(S, y.slot, 10, 12);
  let r = passes(rec());
  ok(new RegExp(`WARNING: A11 \\(position 11\\): ${x.slot} \\(rerun of c2-a\\) marked it wrong, but rerun ${y.slot}, which replaces those lines, marks it ok; it leaves the union`).test(r.out), r.out);
  fs.rmSync(path.join(RD(S), `agent-${x.slot}.jsonl`));
  r = passes(rec(), 'the wholly superseded rerun\'s file is not needed');
  ok(!/A11 \(position 11\)/.test(r.out), r.out);
  // A rerun of a parent's whole range: the parent's own result file and render log are not needed.
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-b', '--from', '1', '--to', '6']));
  const [z] = rerunsOf(S, 'c1-b');
  reader(S, z.slot, 1, 6, { A02: { verdict: 'wrong', note: 'src/auth.js:7 is the only return path', class: ['C2'] } });
  passes(rec(), 'control: the parent\'s files still there');
  fs.rmSync(path.join(RD(S), 'agent-c1-b.jsonl'));
  fs.rmSync(path.join(RD(S), 'render-c1-b.jsonl'));
  passes(rec(), 'the parent supplies no position, so neither file is needed');
  eq(rj(path.join(RD(S), 'measure.json')).reruns.find((q) => q.slot === z.slot).positionsTaken, 6, 'the rerun supplies all six');
  ok(Object.values(rj(path.join(RD(S), 'report.json')).items.find((q) => q.id === 'A02').readers).every((q) => q.verdict === 'wrong'), 'A02 still marked by both');
});
test('record: prints the canary scores, with a warning for each canary missed, falsely alarmed on or not judged', () => {
  const plant = (S2) => {
    wjl(path.join(S2, 'canaries.jsonl'), CANARIES);
    wj(path.join(RD(S2), 'canary-plan.json'), { 'c1-a': [{ canaryId: 'A13', atPosition: 2 }, { canaryId: 'A14', atPosition: 5 }], 'c1-b': [{ canaryId: 'A13', atPosition: 3 }] });
  };
  const line = (id, verdict) => ({ unit: 'u1', id, verdict, class: [], note: 'src/auth.js:10 returns null', cites: ['src/auth.js:9-10'] });
  const S = fullRound({ beforeRead: plant, canaryLinesA: { 2: [line('A13', 'ok')], 5: [line('A14', 'wrong')] } });
  const r = passes(ltz(['record', S, 'u1', '1', ...READERS]));
  ok(/WARNING: canary missed: c1-a: the planted wrong A13 \(before position 2\) was marked ok; that reader's range gets a supplementary read/.test(r.out), r.out);
  ok(/WARNING: canary false alarm: c1-a: the planted ok A14 \(before position 5\) was marked wrong/.test(r.out), r.out);
  ok(/WARNING: canary not judged: c1-b: the planted wrong A13 \(before position 3\) has no line in the reader's file/.test(r.out), r.out);
  ok(/; canaries: c1-a caught 0 of 1, 1 false alarm\(s\) on 1 ok; c1-b caught 0 of 1, 1 not judged; /.test(r.out), r.out);
  // Control: both caught and passed, so the scores are printed with no warning.
  const S2 = fullRound({ beforeRead: plant, canaryLinesA: { 2: [line('A13', 'wrong')], 5: [line('A14', 'ok')] } });
  editJsonl(path.join(RD(S2), 'agent-c1-b.jsonl'), (rows) => [...rows.slice(0, 2), line('A13', 'wrong'), ...rows.slice(2)]);
  const r2 = passes(ltz(['record', S2, 'u1', '1', ...READERS]));
  ok(/; canaries: c1-a caught 1 of 1, 0 false alarm\(s\) on 1 ok; c1-b caught 1 of 1; /.test(r2.out), r2.out);
  ok(!/WARNING: canary/.test(r2.out), r2.out);
  ok(!/canar/.test(passes(ltz(['record', baseCopy(), 'u1', '1', ...READERS])).out), 'no canaries planted: nothing printed');
});
test('record: blank ok notes on 5 or more items get the template warning', () => {
  const S = baseCopy();
  const fp = path.join(RD(S), 'agent-c2-a.jsonl');
  editJsonl(fp, (rows) => rows.map((x) => ({ ...x, note: '' })));
  let out = passes(ltz(['record', S, 'u1', '1', ...READERS])).out;
  ok(/WARNING: c2-a: 6 ok notes are blank: A07, A08, A09, A10, A11, A12; a blank note is not a reading of each item, so give that reader's whole range a supplementary read/.test(out), out);
  editJsonl(fp, (rows) => rows.map(({ note, ...x }) => x));
  out = passes(ltz(['record', S, 'u1', '1', ...READERS])).out;
  ok(/WARNING: c2-a: 6 ok notes are blank/.test(out), 'no "note" key at all:\n' + out);
  editJsonl(fp, (rows) => rows.map((x, i) => (i < 2 ? { ...x, note: 'the cited line states it' } : x)));
  out = passes(ltz(['record', S, 'u1', '1', ...READERS])).out;
  ok(!/WARNING: c2-a: .* ok notes are blank/.test(out), 'control: four blank notes are under the threshold:\n' + out);
});
test('record: a "rejected" note needs a file:line that can be one, or "history:" with what it names', async () => {
  const S = baseCopy();
  const conf = path.join(RD(S), 'confirmed.json');
  const rec = () => ltz(['record', S, 'u1', '1', ...READERS]);
  const withNote = (note) => wj(conf, { ...CONFIRMED, rejected: [{ id: 'A09', note }] });
  for (const [note, shown] of [['history:', null], ['history:   ', null], ['see http://localhost:8080', '//localhost:8080'], ['localhost:8080 answers it', 'localhost:8080'], ['node:18 is fine', 'node:18']]) {
    withNote(note);
    const r = fails(rec(), /PROBLEM: confirmed\.json: rejected A09 has no file:line that answers the refuter \(or a note starting "history:" that names the earlier reasoned ok\)/, JSON.stringify(note));
    if (shown) ok(r.out.includes(`; ${shown} is not one: a file:line has a path with a folder or a file extension, or one a reader rendered`), r.out);
  }
  for (const note of ['config/app.json:2 is 30, as the item says', 'app.json:2 is 30', 'history: u1 r0 slot x reasoned ok on this point holds']) {
    withNote(note);
    passes(rec(), `control: ${note}`);
  }
  // A path with no folder and no extension counts once a reader rendered it.
  const cov = await import('../lib/coverage.mjs');
  ok(typeof cov.fileRefs === 'function', 'coverage.mjs exports fileRefs');
  eq([cov.fileRefs('Makefile:12 has the target').length, cov.fileRefs('Makefile:12 has the target', new Set(['Makefile'])).length], [0, 1], 'a rendered path');
});
test('record: with one reader per chunk the summary says the remaining wrongs were not estimated', () => {
  const S = makeS();
  snap(S);
  const r0 = passes(ltz(['queue', S, 'u1', '1', 'init', '--opaque', '--per-chunk', '1']));
  for (const g of rj(path.join(RD(S), 'queue.json')).groups) reader(S, g.slots[0], g.chunk === 'c1' ? 1 : 7, g.chunk === 'c1' ? 6 : 12);
  wj(path.join(RD(S), 'confirmed.json'), { rejected: [] });
  const r = passes(ltz(['record', S, 'u1', '1', '--chunk-readers', .../--chunk-readers (.+)$/m.exec(r0.out)[1].split(' ')]));
  ok(/; remaining wrongs not estimated \(needs two readers per chunk\) -> report\.json, measure\.json/.test(r.out) && !/estimated remaining/.test(r.out), r.out);
  const e = rj(path.join(RD(S), 'measure.json')).total.estimate;
  eq([e.estimated, e.lowConfidence, e.reason, e.chunksEstimated], [false, true, 'needs two readers per chunk', []], 'measure.json says so too');
  // Control: two readers per chunk.
  const S2 = baseCopy();
  const r2 = passes(ltz(['record', S2, 'u1', '1', ...READERS]));
  ok(/; estimated remaining \d/.test(r2.out) && !/not estimated/.test(r2.out), r2.out);
  eq(rj(path.join(RD(S2), 'measure.json')).total.estimate.estimated, true, 'estimated');
});
test('record: an unknown repeatReason is a PROBLEM on any entry; an accepted repeat is named in the summary and the report', () => {
  const S = baseCopy();
  const conf = path.join(RD(S), 'confirmed.json');
  wj(conf, { ...CONFIRMED, A08: { ...CONFIRMED.A08, repeatReason: 'made-up-reason' } });
  fails(ltz(['record', S, 'u1', '1', ...READERS]), /PROBLEM: confirmed\.json: A08 has repeatReason "made-up-reason"; the accepted values are "plain-fix-failure", "new-text", "earlier-miss"/, 'not a repeat, and the value is still checked');
  wj(conf, { ...CONFIRMED, A08: { ...CONFIRMED.A08, repeatReason: 'new-text', repeatNote: 'n', rulingsChecked: [] } });
  const r = passes(ltz(['record', S, 'u1', '1', ...READERS]));
  ok(/WARNING: confirmed\.json: A08 has repeatReason "new-text", but no earlier round's standing wrong names it .*; it is not counted as a repeat/.test(r.out), r.out);
  ok(!/repeat\(s\)/.test(r.out), r.out);
  eq(rj(path.join(RD(S), 'measure.json')).repeats, [], 'no repeat counted');
  // A real repeat, kept wrong with its reason.
  const S2 = baseCopy();
  asRound2(S2);
  wj(path.join(RD(S2, 'u1', 1), 'confirmed.json'), { A02: { note: 'src/auth.js:6', class: 'C2' } });
  wj(path.join(RD(S2, 'u1', 2), 'confirmed.json'), { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'plain-fix-failure', repeatNote: 'r1 edited the plan field only', rulingsChecked: [] } });
  const r2 = passes(ltz(['record', S2, 'u1', '2', ...READERS]));
  ok(/confirmed 3 \(1 repeat\(s\): A02 plain-fix-failure, of r1\), found by one reader/.test(r2.out), r2.out);
  const a02 = rj(path.join(RD(S2, 'u1', 2), 'report.json')).items.find((x) => x.id === 'A02');
  eq([a02.repeatReason, a02.repeatOf], ['plain-fix-failure', ['r1']], 'on the item in report.json');
  eq(rj(path.join(RD(S2, 'u1', 2), 'measure.json')).repeats, [{ id: 'A02', repeatReason: 'plain-fix-failure', of: ['r1'] }], 'and in measure.json');
});
test('spotcheck: with a queue, draws only from the lines record uses', () => {
  const S = baseCopy();
  passes(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
  // A rerun replaces all of c2-a's lines, a rerun replaces positions 2-5 of c1-a, and a stray file sits in the folder.
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c2-a', '--from', '7', '--to', '12']));
  const [x] = rerunsOf(S, 'c2-a');
  reader(S, x.slot, 7, 12);
  passes(ltz(['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '2', '--to', '5']));
  const [y] = rerunsOf(S, 'c1-a');
  reader(S, y.slot, 2, 5);
  fs.copyFileSync(path.join(RD(S), 'agent-c2-b.jsonl'), path.join(RD(S), 'agent-zz99.jsonl'));
  const r = passes(ltz(['spotcheck', S, 'u1', 'r1', '--seed', '7', '--per-slot', '2']));
  const picks = rj(path.join(RD(S), 'spotchecks.json')).picks;
  eq(Object.keys(picks).sort(), ['c1-a', 'c1-b', 'c2-b', x.slot, y.slot].sort(), 'no picks from the wholly replaced c2-a, nor from the stray file');
  eq(picks['c1-a'].map((q) => q.position), [1, 6], 'c1-a: only the positions its own lines still supply');
  ok(picks[y.slot].every((q) => q.position >= 2 && q.position <= 5), JSON.stringify(picks[y.slot]));
  ok(/^spotcheck u1 r1: seed 7/m.test(r.out), 'the round is printed once, however it was typed:\n' + r.out);
  const S2 = baseCopy();
  passes(ltz(['queue', S2, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b']));
  fails(ltz(['spotcheck', S2, 'u1', '1', '--seed', '7', '--extra', 'zz99=1']), /--extra names zz99, which has no reader file/);
});
test('canary gitignore: a later "!" line that re-includes a canary file is refused; a scratch line that reaches one level only is refused', () => {
  const S = makeS();
  const gi = path.join(S, '.gitignore');
  const LINES = 'canaries.jsonl\n**/canary-plan.json\ncanaries-src/\n**/scratch/\n';
  fs.writeFileSync(gi, LINES);
  passes(ltz(['canary', 'gitignore', S]), 'control: the four lines');
  for (const [neg, file] of [['!canaries.jsonl', 'canaries\\.jsonl'], ['!**/canary-plan.json', 'any-unit/r1/canary-plan\\.json'], ['!canaries-src/', 'canaries-src/k7f2\\.jsonl']]) {
    fs.writeFileSync(gi, LINES + neg + '\n');
    fails(ltz(['canary', 'gitignore', S]), new RegExp(`PROBLEM: .*\\.gitignore has the canary lines, but git does not ignore the canary files: a later "!" line re-includes them; not ignored: .*${file}`), neg);
  }
  // No nested state folder has a round yet, and "*/r*/scratch/" already misses one.
  fs.writeFileSync(gi, 'canaries.jsonl\n**/canary-plan.json\ncanaries-src/\n*/r*/scratch/\n');
  fails(ltz(['canary', 'gitignore', S]), /does not ignore the readers' scratch folders.*not ignored: .*any-folder\/any-unit\/r1\/scratch\//, 'a made-up nested unit is probed');
});
test('record: with rulingIdPattern set, a ruled ok\'s ruling is taken whole, brackets included', () => {
  const S = baseCopy();
  const cfgP = path.join(S, 'config.json');
  wj(cfgP, { ...rj(cfgP), rulingIdPattern: 'R-\\d+(?:\\([a-z]\\))?' });
  editJsonl(path.join(RD(S), 'agent-c1-a.jsonl'), (rows) => rows.map((x) => {
    if (x.id === 'A04') return { ...x, note: 'ruled: R-4(a) src/billing.js:2 says 0.2; the approved wording says 20 percent' };
    if (x.id === 'A05') return { ...x, note: 'ruled: D-12. docs/spec.md:8 says only admins' };
    if (x.id === 'A06') return { ...x, note: 'ruled: R-7, config/app.json:2 holds' };
    return x;
  }));
  wj(path.join(RD(S), 'confirmed.json'), { ...CONFIRMED, ruledKept: [{ id: 'A04', ruling: 'R-4(a)' }] });
  const r = passes(ltz(['record', S, 'u1', '1', ...READERS]), 'the ruling is compared as written');
  eq(rj(path.join(RD(S), 'measure.json')).ruledOks.map((x) => [x.id, x.ruling]), [['A04', 'R-4(a)'], ['A05', 'D-12'], ['A06', 'R-7']], 'whole ids; one the pattern does not match is read as before');
  ok(!/ruled ok: A04/.test(r.out) && /ruled ok: A05/.test(r.out), r.out);
});
test('record: a queue.json or canary-plan.json that is not an object is refused with a message', () => {
  const S = baseCopy();
  fs.writeFileSync(path.join(RD(S), 'queue.json'), 'null\n');
  let r = fails(ltz(['record', S, 'u1', '1', ...READERS]), /ERROR: queue\.json must be a JSON object/);
  eq(r.code, 1, 'a refusal, not an internal error');
  fs.rmSync(path.join(RD(S), 'queue.json'));
  fs.writeFileSync(path.join(RD(S), 'canary-plan.json'), 'null\n');
  r = fails(ltz(['record', S, 'u1', '1', ...READERS]), /ERROR: canary-plan\.json must be a JSON object/);
  eq(r.code, 1, 'a refusal, not an internal error');
});

// ---- code-versus-docs audit, part 3a: evidence at the pin, searches, snapshot, items, the entry check
/** A state folder over a folder of evidence holding these files ({relative path: text or Buffer}). */
function dirS(filesByPath, config = {}) {
  const root = path.join(RUN, `dir-ev-${++nS}`);
  for (const [rel, body] of Object.entries(filesByPath)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  const S = makeS({ config: { evidence: { type: 'dir', root }, ...config } });
  snap(S);
  return { S, root };
}
const showIn = (S, ...cites) => ltz(['show', S, 'u1', '1', 't-a', ...cites]);
test('ltz: a skill folder reached through a link still runs its commands', () => {
  const link = path.join(RUN, `link-${++nS}`);
  fs.symlinkSync(SCRIPTS, link, 'junction');
  const r = spawnSync(process.execPath, [path.join(link, 'ltz.mjs'), 'frobnicate'], { encoding: 'utf8', env: BASE_ENV, cwd: RUN });
  eq(r.status, 1, `through the link the command runs and fails as it should:\n${r.stdout}${r.stderr}`);
  ok(/unknown command/.test(r.stderr), r.stderr);
  const h = spawnSync(process.execPath, [path.join(link, 'ltz.mjs'), 'snapshot', '--help'], { encoding: 'utf8', env: BASE_ENV, cwd: RUN });
  ok(h.status === 0 && /snapshot <S> <unit> <R>/.test(h.stdout), 'control: help through the link');
});
test('searches at the pin: a git source whose repo is a folder inside its repository is read from the top level', () => {
  const S = makeS({ config: { evidence: { type: 'git', repo: path.join(REPO, 'src'), pin: 'v1' } } });
  snap(S);
  ok(/V1-LINE-3/.test(passes(showIn(S, 'src/auth.js:3')).out), 'control: render reads paths from the top level');
  fails(verifyRun(S, { regex: 'RATE' }, 0), /logs hits 0, but the pin has 2 matches/, 'the search reads the same files, so 0 hits is refused');
  passes(verifyRun(S, { regex: 'RATE' }, 2, { at: RATE_SRC }), 'with paths from the top level');
});
test('evidence: a UTF-8 byte order mark is not part of line 1', () => {
  const { S } = dirS({ 'src/bom.cs': '\uFEFFusing System;\nusing System.IO;\n', 'conf/bom1.yml': '\uFEFFserver:\n port: 8080\n host: x\n' });
  const r = passes(showIn(S, 'src/bom.cs:1'));
  ok(/1 \| using System;/.test(r.out) && !r.out.includes('\uFEFF'), JSON.stringify(r.out));
  ok(/port: 8080/.test(passes(showIn(S, 'conf/bom1.yml#server.port'), 'a key path under a one-space indent').out), 'the key path resolves');
  passes(verifyRun(S, { regex: '^using System', paths: ['src/bom.cs'] }, 2, { at: ['src/bom.cs:1', 'src/bom.cs:2'] }), 'a "^" search sees line 1');
  fails(verifyRun(S, { regex: '^using System', paths: ['src/bom.cs'] }, 1, { at: ['src/bom.cs:2'] }), /the pin has 2 matches/);
});
test('evidence: a file that is not text (UTF-16, binary) is not rendered, and a search says what it skipped', () => {
  const { S } = dirS({
    'export/utf16.txt': Buffer.from('\uFEFFpassword: hunter2\r\nRATE = 1\r\n', 'utf16le'),
    'export/plain.txt': 'nothing here\n',
    'bin/blob.bin': Buffer.from([0, 1, 2, 0, 82, 65, 84, 69]),
  });
  const r = fails(showIn(S, 'export/utf16.txt:1-3'), /could not be shown/);
  ok(/nothing rendered: binary/.test(r.out) && !r.out.includes('\u0000') && !/hunter2/.test(r.out), JSON.stringify(r.out));
  fails(showIn(S, 'bin/blob.bin:1'), /nothing rendered: binary/);
  ok(/nothing here/.test(passes(showIn(S, 'export/plain.txt:1')).out), 'control: a text file');
  const w = passes(verifyRun(S, { regex: 'RATE', paths: ['export/**'] }, 0), '0 hits in the one text file');
  ok(/WARNING: the searches skipped 1 file\(s\) in their scope that are not text \(binary, or UTF-16\), so no count covers them: export\/utf16\.txt;/.test(w.out), w.out);
  fails(verifyRun(S, { regex: 'RATE', paths: ['bin/**'] }, 0), /select only files that are not text \(binary, or UTF-16\), so it read nothing: bin\/blob\.bin/);
  ok(!/WARNING: the searches skipped/.test(passes(verifyRun(S, { regex: 'RATE', paths: ['export/plain.txt'] }, 0)).out), 'control: no warning when every file is text');
});
test('render: a line cite that starts before line 1 is marked not rendered, never a crash', () => {
  const S = makeS({ items: ITEMS.map((x) => (x.id === 'A02' ? { ...x, cites: ['src/auth.js:0-2'] } : x)) });
  snap(S);
  passes(ltz(['render', S, 'u1', '1', 't-a', '1', '3']), 'the window is still written');
  const w = fs.readFileSync(path.join(RD(S), 'w-t-a-1.txt'), 'utf8');
  ok(/src\/auth\.js:0-2 .*lines count from 1/.test(w) && /nothing rendered: bad-line/.test(w) && !/undefined/.test(w), w);
  const r = fails(showIn(S, 'src/auth.js:0'), /could not be shown/);
  eq(r.code, 1, 'a refusal, not an internal error');
  ok(rjl(path.join(RD(S), 'render-t-a.jsonl')).some((e) => e.t === 'cite' && e.cite === 'src/auth.js:0' && e.status === 'bad-line'), 'logged as an attempt');
});
test('cites: path:Key takes a "#" line for a heading only in a markdown file', () => {
  const { S } = dirS({
    'config/app.yml': '# Settings. The timeout below is in seconds.\nname: x\ntimeout: 30\n',
    'docs/x.md': 'intro\ntimeout: 1\n\n\n## timeout\nbody\n',
  });
  ok(/key found on line 3/.test(passes(showIn(S, 'config/app.yml:timeout')).out), 'a YAML comment does not outrank the key\'s own line');
  ok(/key found on line 5/.test(passes(showIn(S, 'docs/x.md:timeout')).out), 'control: in markdown the heading comes first');
});
test('masking: an escaped or doubled quote does not end a quoted value; a key may start with a digit or follow "-"', () => {
  const M = '\u00abmasked\u00bb';
  const m = (line) => maskSecrets(line).text;
  eq(m('{"password": "ab\\"cd-REST", "user": "bob"}'), `{"password": "${M}", "user": "bob"}`, 'a backslash-escaped quote');
  eq(m("password: 'it''s-a-secret'"), `password: '${M}'`, 'a doubled quote');
  eq(m('deploy --user=bob --password=hunter2'), `deploy --user=bob --password=${M}`, 'a long option');
  eq(m('java -jar x.jar -Dpassword=hunter2'), `java -jar x.jar -Dpassword=${M}`, 'a -D option');
  eq(m('"2fa_secret": "JBSWY3DP"'), `"2fa_secret": "${M}"`, 'a key that starts with a digit');
  // Controls.
  eq(m('"password": "", "user": "bob"'), '"password": "", "user": "bob"', 'an empty value');
  eq(m('"password": "abc", "user": "bob"'), `"password": "${M}", "user": "bob"`, 'a plain quoted value, as before');
  eq([maskSecrets('--max-tokens=5').masked, maskSecrets('-Debug=true').masked, maskSecrets('at 12:30 the job ran').masked], [false, false, false], 'not secret keys');
});
test('render: a folder cited in a git source is not found, not rendered as its listing', () => {
  const S = makeS();
  snap(S);
  const r = fails(showIn(S, 'src:1'), /could not be shown/);
  ok(!/tree v1:src/.test(r.out) && /not-found-at-pin/.test(r.out), r.out);
  ok(/RATE = 0\.2/.test(passes(showIn(S, 'src/billing.js:2')).out), 'control: a file');
});
test('hashes: a copy that differs only in line endings (a CRLF checkout) still matches', async () => {
  const S = baseCopy();
  const sp = path.join(RD(S), 'snapshot.jsonl');
  const lf = fs.readFileSync(sp, 'utf8');
  fs.writeFileSync(sp, lf.replace(/\n/g, '\r\n'));
  passes(ltz(['render', S, 'u1', '1', 't-z', '1', '3']), 'the snapshot with \\r\\n line endings');
  passes(ltz(['record', S, 'u1', '1', ...READERS]), 'record too');
  fs.writeFileSync(sp, lf.replace(/\n/g, '\r\n').replace('login calls check', 'login calls nothing'));
  fails(ltz(['render', S, 'u1', '1', 't-z', '1', '3']), /snapshot\.jsonl was changed after the snapshot/, 'control: a real change');
  // A folder of evidence pinned by sha256.
  const { treeHash } = await import('../lib/evidence.mjs');
  const root = path.join(RUN, `dir-eol-${++nS}`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\ntwo\n');
  const S2 = makeS({ config: { evidence: { type: 'dir', root, sha256: treeHash(root) } } });
  snap(S2);
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\r\ntwo\r\n');
  ok(/1 \| one/.test(passes(showIn(S2, 'a.txt:1'), 'the folder with \\r\\n line endings').out), 'rendered');
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\r\nthree\r\n');
  fails(showIn(S2, 'a.txt:1'), /has changed since it was pinned/, 'control: a real change');
});
test('snapshot: a git pin that does not resolve, or a missing evidence folder, is refused with a message', () => {
  const S = makeS({ config: { evidence: { type: 'git', repo: REPO, pin: 'no-such-tag' } } });
  fails(ltz(['snapshot', S, 'u1', '1']), /ERROR: the evidence pin no-such-tag does not resolve to a commit in .*; nothing was snapshotted/);
  ok(!fs.existsSync(RD(S)), 'no round folder written');
  for (const extra of [{}, { sha256: 'a'.repeat(64) }]) {
    const S2 = makeS({ config: { evidence: { type: 'dir', root: path.join(RUN, 'no-such-evidence-folder'), ...extra } } });
    const r = fails(ltz(['snapshot', S2, 'u1', '1']), /ERROR: evidence root not found: /, JSON.stringify(extra));
    eq(r.code, 1, 'a refusal, not an internal error');
  }
});
test('items: "cites" that is not a list is refused', () => {
  const S = makeS({ items: ITEMS.map((x) => (x.id === 'A01' ? { ...x, cites: 'src/auth.js:3' } : x)) });
  fails(ltz(['snapshot', S, 'u1', '1']), /S\/items\.jsonl line 1: item A01: "cites" must be an array \(got "src\/auth\.js:3"\)/);
  const S2 = makeS({ items: ITEMS.map(({ cites, ...x }) => (x.id === 'A01' ? x : { ...x, cites })) });
  passes(ltz(['snapshot', S2, 'u1', '1']), 'control: an item with no "cites" at all');
});
test('mixed evidence: "prefix": "." is the source\'s own folder', () => {
  const { exp } = mixedFolders();
  const S = makeS({ config: { evidence: [{ type: 'git', repo: REPO, pin: 'v1', prefix: '.' }, { type: 'dir', root: exp, prefix: 'export' }] } });
  snap(S);
  ok(/V1-LINE-3/.test(passes(showIn(S, 'src/auth.js:3'), 'a path under "."').out), 'read from the git source');
  ok(/EXPORT-LINE-1/.test(passes(showIn(S, 'export/notes.md:1')).out), 'control: the other source');
});
test('queue: a slot with no name or no state is refused with a message', () => {
  const S = queued();
  const qp = path.join(RD(S), 'queue.json');
  const q = rj(qp);
  passes(ltz(['queue', S, 'u1', '1', 'status']), 'control');
  for (const drop of ['slot', 'state']) {
    const { [drop]: gone, ...rest } = q.slots[0];
    wj(qp, { ...q, slots: [rest, ...q.slots.slice(1)] });
    for (const sub of [['status'], ['next', '--cap', '2']]) {
      const r = fails(ltz(['queue', S, 'u1', '1', ...sub]), /ERROR: queue\.json: slots\[0\] needs a "slot" name and a "state"/, `${drop} missing, ${sub[0]}`);
      eq(r.code, 1, 'a refusal, not an internal error');
    }
  }
});

test('record: a repeat only the new evidence refutes after a pin move takes repeatReason "evidence-moved"', () => {
  const S = baseCopy();
  asRound2(S);
  wj(path.join(RD(S, 'u1', 1), 'confirmed.json'), { A02: { note: 'src/auth.js:6', class: 'C2' } });
  const r2 = path.join(RD(S, 'u1', 2), 'confirmed.json');
  const entry = (extra) => ({ ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatNote: 'only pin v2 refutes the r1 fix (P-6)', rulingsChecked: [], ...extra } });
  wj(r2, entry({ repeatReason: 'evidence-moved' }));
  const r = passes(ltz(['record', S, 'u1', '2', ...READERS]), 'evidence-moved is an accepted reason');
  ok(/confirmed 3 \(1 repeat\(s\): A02 evidence-moved, of r1\)/.test(r.out), r.out);
  eq(rj(path.join(RD(S, 'u1', 2), 'report.json')).items.find((x) => x.id === 'A02').repeatReason, 'evidence-moved', 'on the item');
  fs.rmSync(path.join(RD(S, 'u1', 2), 'report.json'));
  // It still needs its note, like any reason; the flag names it among the ways out.
  wj(r2, { ...CONFIRMED, A02: { ...CONFIRMED.A02, repeatReason: 'evidence-moved', rulingsChecked: [] } });
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /A02 has repeatReason "evidence-moved" but no "repeatNote"/);
  wj(r2, CONFIRMED);
  fails(ltz(['record', S, 'u1', '2', ...READERS]), /or "evidence-moved" \(only the new evidence refutes it, after a pin move\) and a "repeatNote"/, 'the PROBLEM names it');
});

// ---- code-versus-docs audit, part 4: the guard hook and skillcheck
// ---- audit 4: guard.mjs and skillcheck.mjs
// The guard now reads CLAUDE_PROJECT_DIR; the tests set it themselves, so it is dropped from what they inherit.
delete BASE_ENV.CLAUDE_PROJECT_DIR;
delete GIT_ENV.CLAUDE_PROJECT_DIR;
/** Run a hook script by any path to it (the guard helper above always uses the real path). */
function guardAuditAt(script, input, { env = {}, cwd } = {}) {
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify({ session_id: 'me', cwd, ...input }), encoding: 'utf8', env: { ...GIT_ENV, ...env }, cwd });
  return { code: r.status, out: (r.stderr || '') + (r.stdout || '') };
}
const guardAuditPs = (command) => ({ tool_name: 'PowerShell', tool_input: { command } });
/** A junction to a folder, made inside RUN. Remove it with guardAuditUnlink, which never follows it. */
function guardAuditLink(target) {
  const link = path.join(RUN, `link-${++nS}`);
  fs.symlinkSync(target, link, 'junction');
  return link;
}
const guardAuditUnlink = (link) => fs.rmSync(link, { force: true });

test('guard (audit 4.1): run through a junction to the scripts folder, the guard and skillcheck still do their work', () => {
  const { repo, g, env } = guardRepo();
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'edit\n');
  g(['add', 'docs/spec.md']);
  const link = guardAuditLink(SCRIPTS);
  try {
    const viaLink = path.join(link, 'hooks', 'guard.mjs');
    eq(guardAuditAt(GUARD, bash('git commit -m x'), { env, cwd: repo }).code, 2, 'control: by its real path the guard blocks the commit');
    const r = guardAuditAt(viaLink, bash('git commit -m x'), { env, cwd: repo });
    eq(r.code, 2, `through the junction it blocks the same commit:\n${r.out}`);
    ok(/would include item files .*spec\.md/.test(r.out), r.out);
    eq(guardAuditAt(viaLink, bash('git status'), { env, cwd: repo }).code, 0, 'control: through the junction, a harmless command is allowed');
    const missing = path.join(RUN, 'no-such-skill');
    const sc = (script) => spawnSync(process.execPath, [script, '--root', missing], { encoding: 'utf8', env: BASE_ENV });
    eq(sc(SKILLCHECK).status, 1, 'control: skillcheck by its real path refuses a missing folder');
    const v = sc(path.join(link, 'skillcheck.mjs'));
    ok(v.status !== 0 && v.status !== null, `skillcheck through the junction exits non-zero, got ${v.status}`);
    ok(/skill folder not found/.test(v.stderr), `and says why:\n${v.stderr}`);
  } finally {
    guardAuditUnlink(link);
  }
  ok(fs.existsSync(GUARD), 'removing the junction left the scripts folder alone');
});

test('guard (audit 4.2): .ltz-state is found from a subfolder and through CLAUDE_PROJECT_DIR; a relative LTZ_STATE resolves from CLAUDE_PROJECT_DIR', () => {
  const { S, repo, g } = guardRepo();
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'edit\n');
  g(['add', 'docs/spec.md']);
  const marker = path.join(repo, '.ltz-state');
  fs.writeFileSync(marker, 'S\n'); // a relative path: it resolves from the folder that holds the file
  const commit = bash('git commit -m x');
  const docs = path.join(repo, 'docs');
  const away = path.join(RUN, `away-${nS}`);
  eq(guard(commit, { cwd: repo }).code, 2, 'control: the hook cwd is the project folder');
  let r = guard(commit, { cwd: docs });
  eq(r.code, 2, `after "cd docs" the marker in the parent folder still counts:\n${r.out}`);
  ok(/would include item files .*spec\.md/.test(r.out), r.out);
  fs.writeFileSync(path.join(docs, '.ltz-state'), 'no-such-folder\n');
  eq(guard(commit, { cwd: docs }).code, 2, 'a nearer .ltz-state that names no state folder is passed over for the next one up');
  fs.rmSync(path.join(docs, '.ltz-state'));
  const cfgP = path.join(S, 'config.json');
  wj(cfgP, { ...rj(cfgP), units: { u1: { status: 'closed', itemFiles: ['docs/spec.md'] } } });
  r = guard({ tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'docs', 'spec.md') } }, { cwd: path.join(S, 'u1', 'r1') });
  eq(r.code, 2, `three folders down:\n${r.out}`);
  ok(/unit u1, which is closed/.test(r.out), r.out);
  // A folder outside the project (a worktree does not hold the git-ignored marker).
  const fromAway = bash(`git -C "${repo}" commit -m x`);
  eq(guard(fromAway, { cwd: away }).code, 0, 'control: no marker above the cwd and no CLAUDE_PROJECT_DIR: inert');
  r = guard(fromAway, { cwd: away, env: { CLAUDE_PROJECT_DIR: repo } });
  eq(r.code, 2, `the marker in CLAUDE_PROJECT_DIR counts:\n${r.out}`);
  ok(/would include item files .*spec\.md/.test(r.out), r.out);
  // LTZ_STATE as a relative path.
  fs.rmSync(marker);
  eq(guard(commit, { cwd: docs }).code, 0, 'control: marker gone, inert');
  eq(guard(commit, { cwd: repo, env: { LTZ_STATE: 'S' } }).code, 2, 'control: a relative LTZ_STATE resolves from the cwd when CLAUDE_PROJECT_DIR is not set');
  eq(guard(commit, { cwd: docs, env: { LTZ_STATE: 'S' } }).code, 0, 'control: from docs, without CLAUDE_PROJECT_DIR, docs/S is no state folder');
  eq(guard(commit, { cwd: docs, env: { LTZ_STATE: 'S', CLAUDE_PROJECT_DIR: repo } }).code, 2, 'with CLAUDE_PROJECT_DIR set, a relative LTZ_STATE resolves from it');
});

test('guard (audit 4.4): a renamed item file is seen by the commit rule', () => {
  const { repo, g, env } = guardRepo();
  const o = { env, cwd: repo };
  g(['mv', 'decisions.md', 'decisions-2.md']);
  eq(guard(bash('git commit -m x'), o).code, 0, 'control: a staged rename of a non-item file');
  g(['mv', 'docs/spec.md', 'docs/spec-renamed.md']);
  let r = guard(bash('git commit -m x'), o);
  eq(r.code, 2, `a staged rename of an item file:\n${r.out}`);
  ok(/would include item files .*docs[\\/]spec\.md/.test(r.out), r.out);
  // The working-tree listing: the item file moved on disk, the new name added with intent-to-add.
  const second = guardRepo();
  fs.renameSync(path.join(second.repo, 'docs', 'spec.md'), path.join(second.repo, 'docs', 'moved.md'));
  second.g(['add', '-N', 'docs/moved.md']);
  eq(guard(bash('git commit -m x'), { env: second.env, cwd: second.repo }).code, 0, 'control: nothing staged, so a plain commit takes no item file');
  r = guard(bash('git commit -am x'), { env: second.env, cwd: second.repo });
  eq(r.code, 2, `commit -a after an unstaged rename of an item file:\n${r.out}`);
  ok(/would include item files .*docs[\\/]spec\.md/.test(r.out), r.out);
});

test('guard (audit 4.5): a project reached through a junction is protected (paths are compared as real paths)', () => {
  const { S, repo, g, env } = guardRepo();
  const cfgP = path.join(S, 'config.json');
  const cfg = rj(cfgP);
  fs.writeFileSync(path.join(repo, 'docs', 'closed.md'), 'items of the closed unit\n');
  const link = guardAuditLink(repo);
  try {
    const edit = (p, e = env) => guard({ tool_name: 'Edit', tool_input: { file_path: p } }, { env: e });
    const write = (p, e = env) => guard({ tool_name: 'Write', tool_input: { file_path: p } }, { env: e });
    // The closed-unit rule. config.itemsRoot is the real path; the hook cwd is neither.
    eq(edit(path.join(repo, 'docs', 'closed.md')).code, 2, 'control: the closed unit\'s item file by its real path');
    let r = edit(path.join(link, 'docs', 'closed.md'));
    eq(r.code, 2, `the same file through the junction:\n${r.out}`);
    ok(/unit u2, which is closed/.test(r.out), r.out);
    eq(edit(path.join(link, 'docs', 'spec.md')).code, 0, 'control: the open unit\'s item file through the junction');
    eq(edit(path.join(link, 'docs', 'other.md')).code, 0, 'control: a file no unit lists, through the junction');
    // The commit rule. config names the junction; git reports the real top level.
    wj(cfgP, { ...cfg, itemsRoot: link, evidence: { ...cfg.evidence, repo: link } });
    eq(guard(bash('git commit -m x'), { env: { LTZ_STATE: path.join(link, 'S') }, cwd: link }).code, 0, 'control: no item file staged');
    fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'edit\n');
    g(['add', 'docs/spec.md']);
    r = guard(bash('git commit -m x'), { env: { LTZ_STATE: path.join(link, 'S') }, cwd: link });
    eq(r.code, 2, `item file staged, itemsRoot and cwd are the junction path:\n${r.out}`);
    ok(/would include item files .*spec\.md/.test(r.out), r.out);
    // The lock rule, with the state folder named one way and the file the other way.
    wj(cfgP, cfg);
    wj(path.join(S, 'writer.lock'), { session: 'other', since: '2026-11-05T00:00:00Z' });
    eq(write(path.join(S, 'classes.md')).code, 2, 'control: a writer file by its real path');
    r = write(path.join(link, 'S', 'classes.md'));
    eq(r.code, 2, `a top-level state file through the junction:\n${r.out}`);
    ok(/is S\/classes\.md, and S\/writer\.lock is held by session other/.test(r.out), r.out);
    const viaLinkS = { LTZ_STATE: path.join(link, 'S') };
    eq(write(path.join(RD(S), 'confirmed.json'), viaLinkS).code, 2, 'LTZ_STATE through the junction, the round file by its real path');
    eq(write(path.join(link, 'S', 'u1', 'r2', 'confirmed.json')).code, 2, 'a round file whose folder does not exist yet, through the junction');
    eq(write(path.join(link, 'S', 'u1', 'r1', 'agent-c1-a.jsonl')).code, 0, 'control: a reader output through the junction stays writable');
    eq(write(path.join(link, 'S', 'u1', 'r2', 'agent-c1-a.jsonl'), viaLinkS).code, 0, 'control: so does one in a folder that does not exist yet');
  } finally {
    guardAuditUnlink(link);
  }
  ok(fs.existsSync(cfgP), 'removing the junction left the project alone');
});

test('guard (audit 4.6): under another session\'s lock, "git add <folder> && git commit" may not include the writer\'s files', () => {
  const { S, repo, g, env } = guardRepo();
  wj(path.join(RD(S), 'queue.json'), { groups: [], slots: [{ slot: 'c1-a', state: 'done' }] });
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'state']);
  wj(path.join(S, 'writer.lock'), { session: 'other', since: '2026-11-05T00:00:00Z' });
  const o = { env, cwd: repo };
  fs.mkdirSync(path.join(RD(S), 'scratch'), { recursive: true });
  fs.writeFileSync(path.join(RD(S), 'scratch', 'notes.md'), 'x\n');
  fs.writeFileSync(path.join(RD(S), 'agent-c1-a.jsonl'), '{}\n');
  eq(guard(bash('git add S && git commit -m x'), o).code, 0, 'control: the folder holds only reader outputs and scratch');
  fs.writeFileSync(path.join(RD(S), 'confirmed.json'), '{}\n'); // untracked
  fs.appendFileSync(path.join(S, 'classes.md'), 'edit\n'); // tracked, modified
  for (const c of ['git add S && git commit -m x', 'git add S/ && git commit -m x', 'git add S/u1 && git commit -m x', 'git add S/u1/r1/ && git commit -m x', 'git stage S/u1/r1 && git commit -m x', 'cd S/u1 && git add r1 && git commit -m x']) {
    const r = guard(bash(c), o);
    eq(r.code, 2, `${c}:\n${r.out}`);
    ok(/would include the writer's files .*(confirmed\.json|classes\.md)/.test(r.out), `${c}: ${r.out}`);
  }
  ok(/classes\.md/.test(guard(bash('git add S && git commit -m x'), o).out), 'a modified tracked file under the folder is named');
  ok(!/classes\.md/.test(guard(bash('git add S/u1 && git commit -m x'), o).out), 'the listing is limited to the folder');
  eq(guard(bash('git add S/u1/r1/scratch && git commit -m x'), o).code, 0, 'control: a folder with no writer file in it');
  eq(guard(bash('git add S/u1/r1/agent-c1-a.jsonl && git commit -m x'), o).code, 0, 'control: a single reader output');
  eq(guard({ ...bash('git add S && git commit -m x'), session_id: 'other' }, o).code, 0, 'control: the holder may commit them');
  const r = guard(bash('echo hi > S/u1/r1/confirmed.json && git add S && git commit -m x'), o);
  eq(r.code, 2, 'another command before a folder add: what the folder will hold is unknown');
  ok(/another command runs before the commit/.test(r.out), r.out);
});
test('guard (audit 4.6): "git add -A" in a subfolder counts the whole tree\'s untracked files', () => {
  const { S, repo, g, env } = guardRepo();
  wj(path.join(RD(S), 'queue.json'), { groups: [], slots: [{ slot: 'c1-a', state: 'done' }] });
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'state']);
  wj(path.join(S, 'writer.lock'), { session: 'other', since: '2026-11-05T00:00:00Z' });
  fs.writeFileSync(path.join(repo, 'docs', 'notes.txt'), 'x\n');
  eq(guard(bash('cd docs && git add -A && git commit -m x'), { env, cwd: repo }).code, 0, 'control: only a non-writer file is untracked');
  fs.writeFileSync(path.join(RD(S), 'confirmed.json'), '{}\n');
  const r = guard(bash('cd docs && git add -A && git commit -m x'), { env, cwd: repo });
  eq(r.code, 2, `an untracked writer file outside the subfolder:\n${r.out}`);
  ok(/would include the writer's files .*confirmed\.json/.test(r.out), r.out);
});

test('guard (audit 4.8): a command whose name only starts with "git" is another command before "git commit -a"', () => {
  const { repo, env } = guardRepo();
  const o = { env, cwd: repo };
  eq(guard(bash('git commit -am x'), o).code, 0, 'control: no item file changed in the working tree');
  eq(guard(bash('git status && git commit -am x'), o).code, 0, 'control: a read-only git command first');
  for (const c of [
    'sh fix.sh && git commit -am x', // blocked before this fix too
    'sh gitfix.sh && git commit -am x',
    'node gitsync.mjs; git commit -am x',
    'python git_apply_fixes.py && git add -A && git commit -m x',
    'gitleaks detect && git commit -am x',
    'npx git-cz --apply && git commit -am x',
    'cp /tmp/new.md docs/spec.md # git\ngit commit -am x',
    'sed -i s/a/b/ docs/spec.md # git status\ngit commit -am x',
  ]) {
    const r = guard(bash(c), o);
    eq(r.code, 2, `${JSON.stringify(c)}:\n${r.out}`);
    ok(/another command runs before the commit/.test(r.out), `${c}: ${r.out}`);
  }
  const r = guard(guardAuditPs('pwsh gitfix.ps1; git add -A; git commit -m x'), o);
  eq(r.code, 2, 'PowerShell');
  ok(/another command runs before the commit/.test(r.out), r.out);
  eq(guard(bash('git status # sh fix.sh\ngit commit -am x'), o).code, 0, 'control: a comment after a git command changes nothing');
});

test('guard (audit 4.9): more spellings of a commit are seen as a commit; commit-tree and commit-graph are not one', () => {
  const { repo, g, env } = guardRepo();
  const o = { env, cwd: repo };
  const spellings = [
    'git --namespace ns commit -m x',
    'git --exec-path /x commit -m x',
    '"C:/Program Files/Git/cmd/git.exe" commit -m x',
    "'C:/Program Files/Git/cmd/git.exe' commit -m x",
    '/usr/bin/git commit -m x',
    'git \\\n  commit -m x',
  ];
  const psSpellings = ['& "C:\\Program Files\\Git\\cmd\\git.exe" commit -m x', 'git `\n  commit -m x'];
  // With no item file staged each is allowed: it is read as a commit, not given up on.
  for (const c of spellings) eq(guard(bash(c), o).code, 0, `control, nothing staged: ${JSON.stringify(c)}`);
  for (const c of psSpellings) eq(guard(guardAuditPs(c), o).code, 0, `control, nothing staged (PowerShell): ${JSON.stringify(c)}`);
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'edit\n');
  // A pathspec that starts with ":" is handled as a glob is: every working-tree change counts.
  eq(guard(bash('git commit -m x decisions.md'), o).code, 0, 'control: an unstaged item edit, a pathspec of another file');
  for (const c of ['git commit -m x :/docs/spec.md', 'git commit -m x ":(top)docs/spec.md"', 'git commit -m x -- :/docs']) {
    const r = guard(bash(c), o);
    eq(r.code, 2, `${c}:\n${r.out}`);
    ok(/would include item files .*spec\.md/.test(r.out), `${c}: ${r.out}`);
  }
  g(['add', 'docs/spec.md']);
  for (const [input, c] of [...spellings.map((c) => [bash(c), c]), ...psSpellings.map((c) => [guardAuditPs(c), c])]) {
    const r = guard(input, o);
    eq(r.code, 2, `item file staged: ${JSON.stringify(c)}:\n${r.out}`);
    ok(/would include item files .*spec\.md/.test(r.out), `${c}: ${r.out}`);
  }
  // --git-dir and --work-tree stay blocked in every form: what the commit includes cannot be determined.
  for (const c of ['git --work-tree . commit -m x', 'git --git-dir ../x commit -m x', 'git --git-dir .git commit -m x', 'git --git-dir=.git commit -m x', 'git --work-tree=. commit -m x']) {
    const r = guard(bash(c), o);
    eq(r.code, 2, `${c}:\n${r.out}`);
    ok(/could not be determined: --(?:git-dir|work-tree) is not followed/.test(r.out), `${c}: ${r.out}`);
  }
  for (const c of ['git commit-tree HEAD^{tree} -m x', 'git commit-graph write --reachable', 'git -C . commit-graph verify']) eq(guard(bash(c), o).code, 0, `not a commit: ${c}`);
});

test('guard (audit 4.10): on Windows a Git Bash path (/c/...) in the command is read as a drive path', () => {
  if (process.platform !== 'win32') return;
  const msys = (p) => '/' + p[0].toLowerCase() + p.slice(2).replace(/\\/g, '/');
  const { S, repo, g, env } = guardRepo();
  fs.appendFileSync(path.join(repo, 'decisions.md'), 'D-1\n');
  g(['add', 'decisions.md']);
  // The hook cwd is elsewhere (the helper's default folder).
  eq(guard(bash(`cd "${repo}" && git commit -m "D-1"`), { env }).code, 0, 'control: a Windows path, only the decision log staged');
  let r = guard(bash(`cd ${msys(repo)} && git commit -m "D-1"`), { env });
  eq(r.code, 0, `cd /c/... && git commit:\n${r.out}`);
  r = guard(bash(`git -C ${msys(repo)} commit -m "D-1"`), { env });
  eq(r.code, 0, `git -C /c/... commit:\n${r.out}`);
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'edit\n');
  g(['add', 'docs/spec.md']);
  for (const c of [`cd ${msys(repo)} && git commit -m x`, `git -C ${msys(repo)} commit -m x`, `cd "${msys(repo)}/docs" && git commit -m x`]) {
    r = guard(bash(c), { env });
    eq(r.code, 2, c);
    ok(/would include item files .*spec\.md/.test(r.out), `${c}: ${r.out}`);
  }
  // The session hint.
  const hint = path.join(S, '.session-hint');
  guard({ ...bash(`node "${LTZ}" lock ${msys(S)} acquire --session auto`), session_id: 'sess-7' });
  ok(fs.existsSync(hint) && rj(hint).session === 'sess-7', 'a hint for <S> given as /c/...');
  fs.rmSync(hint);
  guard({ ...bash(`cd ${msys(repo)} && node "${LTZ}" lock S check --session auto`), session_id: 'sess-8' });
  ok(fs.existsSync(hint) && rj(hint).session === 'sess-8', 'a hint for a relative <S> after cd /c/...');
});

test('guard (audit 4.11): the search rule reads one pipeline at a time and looks at command words', () => {
  const S = guardS({ running: false });
  const env = { LTZ_STATE: S };
  // No search is piped into a truncating command.
  for (const c of [
    'grep -n "login" src/auth.js; git show v1:src/auth.js | head -40',
    'grep -c foo f && git log --oneline | head -3',
    'grep -c foo f || ls | head -3',
    'grep -c foo f & ls | head -3',
    'rg -l login src > hits.txt\ncat hits.txt | wc -l\ngit log --oneline | head -5',
    'git show v1:src/grep.js | head -40',
    'cat notes-on-grep.txt | head -3',
    'ls scripts/grep | head -3',
    'git log --author=rg | head -3',
    'node x.mjs --grep foo | head -3',
    'npm run grep | head',
    'echo "use rg here" | head -1',
    'git commit -m "grep | head is blocked"',
    'grep foo f | tail -5',
    'head -5 f | grep foo',
  ]) eq(guard(bash(c), { env }).code, 0, `allowed: ${JSON.stringify(c)}`);
  for (const c of ['Select-String foo f; Get-ChildItem | Select-Object -First 3', 'Get-Content sls.txt | Select-Object -First 3', 'Select-String foo *.md | Select-Object Path | Format-List -Force']) {
    eq(guard(guardAuditPs(c), { env }).code, 0, `allowed (PowerShell): ${c}`);
  }
  // A search is piped into one.
  for (const c of [
    'grep foo f | head -5', // blocked before this fix too, as are the next ones down to the blank line
    'grep -rn foo . 2>&1 | head -n 20',
    'cd src && grep -rn foo . | head',
    'rg foo |\n head',
    'GREP -rn foo . | HEAD -5',
    'cat f | grep foo | tee out.txt | head',
    'git grep foo | head',
    'find . -name "*.md" | xargs grep -n foo | head -3',
    'for f in a b; do grep foo $f | head -3; done',
    'x=$(grep -rl foo . | head -1)',

    'grep foo f | /usr/bin/head -5',
    'grep foo f |& head -5',
    'grep foo f | command head -5',
    'grep foo f | env head -5',
  ]) {
    const r = guard(bash(c), { env });
    eq(r.code, 2, `blocked: ${JSON.stringify(c)}`);
    ok(/a search backing a bound must be unlimited/.test(r.out), r.out);
  }
  for (const c of ['/usr/bin/grep foo f | head -5', 'LC_ALL=C grep foo f | head', 'command grep foo f | head']) eq(guard(bash(c), { env }).code, 2, `blocked: ${c}`);
  for (const c of [
    'Select-String foo *.md |\n  Select-Object -First 5', // blocked before this fix too, as are the next three
    'Select-String foo *.md | Select-Object `\n -First 5',
    '$hits = Select-String foo *.md | Select-Object -First 5',
    'gci -r | Select-String foo | Sort-Object Path | select -fir 2',
    'Select-String foo *.md | Microsoft.PowerShell.Utility\\Select-Object -First 5',
  ]) eq(guard(guardAuditPs(c), { env }).code, 2, `blocked (PowerShell): ${JSON.stringify(c)}`);
});

test('guard (audit 4.14): the session hint is written only for a command that runs ltz, not for text that names it', () => {
  const S = makeS();
  const hint = path.join(S, '.session-hint');
  const wrote = (command, tool = 'Bash') => {
    fs.rmSync(hint, { force: true });
    guard({ tool_name: tool, tool_input: { command }, session_id: 'sess-5' }, { cwd: path.dirname(S) });
    return fs.existsSync(hint);
  };
  for (const c of [
    'node ltz.mjs lock S acquire --session auto',
    'ltz lock S check --session auto',
    `node.exe "${LTZ}" lock "${S}" release --session=auto`,
    `"C:/Program Files/nodejs/node.exe" "${LTZ}" lock S acquire --session auto`,
    `node "${LTZ}" lock S acquire --session auto # take the lock`,
    `echo start && node "${LTZ}" lock S acquire --session auto`,
  ]) ok(wrote(c), `control, a hint for: ${c}`);
  ok(wrote(`& "C:\\Program Files\\nodejs\\node.exe" "${LTZ}" lock S check --session auto`, 'PowerShell'), 'control: PowerShell & with a quoted node path');
  for (const c of [
    'echo node ltz.mjs lock S acquire --session auto',
    'grep -rn -e ltz lock S acquire --session auto',
    'ls # node ltz.mjs lock S acquire --session auto',
    'cat notes.txt ltz lock S acquire --session auto',
  ]) ok(!wrote(c), `no hint for: ${c}`);
});

// ---- audit 4: skillcheck
const guardAuditTpl = { 'references/state-template.md': CLEAN_SKILL['references/state-template.md'].replace('agent-<slot>.jsonl', 'agent-<slot>.jsonl, drafts/<id>.md\n  briefs/<slot>.md') };
test('skillcheck (audit 4.7) [e]: a .md name is still checked when state-template.md lists drafts/<id>.md', () => {
  ok(/drafts\/<id>\.md/.test(guardAuditTpl['references/state-template.md']), 'the fixture template lists the two placeholder names');
  const withTpl = (line) => skillFixture({ ...guardAuditTpl, ...withLine(line) });
  eq(skillcheck(withTpl('Write `S/<unit>/r<R>/drafts/A01.md`, `drafts/<id>.md`, `briefs/c1-a.md` and `S/loop.md`.')).code, 0, 'control: names the template lists');
  for (const [line, name] of [['Write `nonsense-file.md`.', 'nonsense-file\\.md'], ['Read `S/loops.md`.', 'S/loops\\.md'], ['Write `S/HANDOF.md`.', 'S/HANDOF\\.md'], ['Write `c1-a.md` there.', 'c1-a\\.md']]) {
    const r = skillcheck(withTpl(line));
    ok(r.code === 1 && new RegExp(`SKILL\\.md:${LAST}: \\[e\\] file name "${name}"`).test(r.out), `${line}:\n${r.out}`);
  }
  // A skill file is named by a path that ends one of the skill's real paths.
  eq(skillcheck(skillFixture(withLine('See `x.md`, `references/x.md`, `<skill>/references/x.md`, `README.md` and `<skill>/scripts/hooks/README.md`.'))).code, 0, 'control: real skill files');
  const r = skillcheck(skillFixture(withLine('See `lessons/x.md`.')));
  ok(r.code === 1 && /\[e\] file name "lessons\/x\.md"/.test(r.out), `only the last segment is a skill file's:\n${r.out}`);
});
test('skillcheck (audit 4.12) [c]: a value with other characters in it is checked too', () => {
  for (const [line, re] of [
    ['Give `"foundBy": "spot_check"`.', /\[c\] foundBy "spot_check" is not accepted/],
    ['Give `"foundBy": "Sweep"`.', /\[c\] foundBy "Sweep" is not accepted/],
    ['Give `"foundBy": "sweep2"`.', /\[c\] foundBy "sweep2" is not accepted/],
    ['Give `"repeatReason": "new_text"`.', /\[c\] repeatReason "new_text" is not accepted/],
    ['A verdict `not_ok` here.', /\[c\] verdict "not_ok" is not one of/],
    ['A verdict `wrong2` here.', /\[c\] verdict "wrong2" is not one of/],
  ]) {
    const r = skillcheck(skillFixture(withLine(line)));
    ok(r.code === 1 && re.test(r.out), `${line}:\n${r.out}`);
  }
  eq(skillcheck(skillFixture(withLine('A verdict `wrong`, `"repeatReason": "new-text|earlier-miss"`, `"foundBy": "sweep"`, `"verdict": "<value>"`, verdict `<value>`.'))).code, 0, 'control');
});
test('skillcheck (audit 4.13) [f]: a section name must equal a heading or start one', () => {
  for (const s of ['ection', 'One', 'label']) {
    const r = skillcheck(skillFixture(withLine(`See \`references/x.md\` ("${s}").`)));
    ok(r.code === 1 && new RegExp(`\\[f\\] references/x\\.md has no heading "${s}"`).test(r.out), `"${s}" is only part of a heading:\n${r.out}`);
  }
  eq(skillcheck(skillFixture(withLine('See `references/x.md` ("Section One"), `references/x.md` ("Section") and `references/x.md` ("Bold").'))).code, 0, 'control: a whole heading, and the start of one');
});

// ---- code-versus-docs audit, part 4, finding 3: the writer and the agents it launches
test('guard lock: an agent the writer launched is not the writer, though it shares the session id', () => {
  const S = guardS({ running: false, lockedBy: 'me' });
  const env = { LTZ_STATE: S };
  const write = (p, extra = {}) => guard({ tool_name: 'Write', tool_input: { file_path: p }, ...extra }, { env });
  const conf = path.join(RD(S), 'confirmed.json');
  eq(write(conf).code, 0, 'control: the writer itself (session "me", no agent_id)');
  const r = write(conf, { agent_id: 'a1', agent_type: 'general-purpose' });
  eq(r.code, 2, 'an agent of the same session may not edit a writer file');
  ok(/held by session me since .* \(this call comes from agent a1 of that session, which is not the holder\)/.test(r.out), r.out);
  eq(write(path.join(REPO, 'docs', 'spec.md'), { agent_id: 'a1' }).code, 2, 'nor an item file');
  eq(write(path.join(RD(S), 'agent-c1-a.jsonl'), { agent_id: 'a1' }).code, 0, 'its own result file is still allowed');
  eq(write(path.join(RD(S), 'scratch', 'a1', 'probe.txt'), { agent_id: 'a1' }).code, 0, 'and its scratch folder');
  // A writer that itself runs as an agent: the lock records its agent id, and only that agent holds it.
  wj(path.join(S, 'writer.lock'), { session: 'me', agent: 'w9', since: '2026-11-05T00:00:00Z' });
  eq(write(conf, { agent_id: 'w9' }).code, 0, 'the agent that holds the lock');
  const main = write(conf);
  eq(main.code, 2, 'the main conversation of that session is not the holder');
  ok(/held by session me \(agent w9\) since .* \(this call comes from the main conversation of that session/.test(main.out), main.out);
  eq(write(conf, { agent_id: 'a1' }).code, 2, 'nor another agent');
  eq(write(conf, { session_id: 'other', agent_id: 'w9' }).code, 2, 'nor that agent id under another session');
});
test('lock --session auto: an agent that takes the lock is recorded with its agent id', () => {
  const S = makeS();
  const dir = path.join(RUN, `auto-agent-${++nS}`);
  fs.mkdirSync(dir, { recursive: true });
  const hint = path.join(S, '.session-hint');
  const ask = (action, extra = {}) => {
    guard({ ...bash(`node "${LTZ}" lock "${S}" ${action} --session auto`), session_id: 'sess-7', ...extra }, { cwd: dir });
    return ltz(['lock', S, action, '--session', 'auto']);
  };
  guard({ ...bash(`node "${LTZ}" lock "${S}" acquire --session auto`), session_id: 'sess-7', agent_id: 'w9' }, { cwd: dir });
  eq([rj(hint).session, rj(hint).agent], ['sess-7', 'w9'], 'the hint carries the agent id');
  const r = passes(ltz(['lock', S, 'acquire', '--session', 'auto']));
  ok(/lock: acquired by sess-7, agent w9 \(session id from the guard's hint\)/.test(r.out), r.out);
  eq([rj(path.join(S, 'writer.lock')).session, rj(path.join(S, 'writer.lock')).agent], ['sess-7', 'w9'], 'and so does the lock');
  ok(/held by this session \(sess-7, agent w9\)/.test(passes(ask('check', { agent_id: 'w9' })).out), 'the same agent');
  fails(ask('check'), /held by another session \(sess-7, agent w9\) .*; this session is sess-7 /, 'the main conversation of that session');
  fails(ask('check', { agent_id: 'a1' }), /held by another session \(sess-7, agent w9\) .*; this session is sess-7, agent a1/, 'another agent');
  fails(ask('release', { agent_id: 'a1' }), /refusing: S\/writer\.lock is held by session sess-7, agent w9, not sess-7, agent a1/);
  // A session id typed by hand carries no agent: it is compared on the session alone.
  ok(/held by this session/.test(passes(ltz(['lock', S, 'check', '--session', 'sess-7'])).out), 'by hand');
  passes(ask('release', { agent_id: 'w9' }));
  ok(!fs.existsSync(path.join(S, 'writer.lock')), 'released by the agent that held it');
  // No agent: the lock is as before.
  passes(ask('acquire'));
  eq(rj(path.join(S, 'writer.lock')).agent, undefined, 'no "agent" key for the main conversation');
});
test('guard: hook input that is JSON but not an object blocks when the guard is active; "git commit -p" counts the working tree', () => {
  const { repo, env } = guardRepo();
  const raw = (text, e) => spawnSync(process.execPath, [GUARD], { input: text, encoding: 'utf8', env: { ...GIT_ENV, ...e }, cwd: repo });
  eq(raw('[]', env).status, 2, 'an array is not a hook input');
  eq(raw('[]', {}).status, 0, 'control: inert, so nothing is checked');
  // An unstaged item edit, a reader still reading: -p and --patch pick from the working tree, as -a does.
  fs.appendFileSync(path.join(repo, 'docs', 'spec.md'), 'edit\n');
  const at = (cmd) => guard(bash(cmd), { env, cwd: repo }).code;
  eq([at('git commit -p -m x'), at('git commit --patch -m x'), at('git commit --interactive -m x'), at('git commit -a -m x')], [2, 2, 2, 2], 'blocked');
  eq(at('git commit -m x'), 0, 'control: nothing staged, so nothing of the item file is committed');
});

// ---- code-versus-docs audit, part 3b: queue, cost, lock, config
// ---- audit 3b: queue, cost, lock, loadConfig
/** Run ltz without blocking, so several commands can run at the same moment. */
function queueLtzAsync(args) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [LTZ, ...args], { env: BASE_ENV, cwd: RUN, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
}
const queueSlot = (S, slot) => rj(path.join(RD(S), 'queue.json')).slots.find((s) => s.slot === slot);

test('queue: four marks started at the same moment all land (queue.json.lock serialises the read-change-write)', async () => {
  const slots = ['c1-a', 'c1-b', 'c2-a', 'c2-b'];
  for (let trial = 1; trial <= 8; trial++) {
    const S = queued();
    const rs = await Promise.all(slots.map((s) => queueLtzAsync(['queue', S, 'u1', '1', 'mark', s, 'running', '--agent', `ag-${s}`])));
    rs.forEach((r, i) => {
      passes(r, `trial ${trial}, mark ${slots[i]}:`);
      ok(new RegExp(`queue mark: ${slots[i]} queued -> running \\(agent ag-${slots[i]}\\)`).test(r.out), r.out);
    });
    eq(rj(path.join(RD(S), 'queue.json')).slots.map((s) => [s.slot, s.state, s.agent]), slots.map((s) => [s, 'running', `ag-${s}`]), `trial ${trial}: every mark that reported success is in queue.json`);
    ok(!fs.existsSync(path.join(RD(S), 'queue.json.lock')), `trial ${trial}: the lock file is removed`);
  }
});
test('queue: a held queue.json.lock makes every writing subcommand wait, then fail naming it; a lock older than 30 s is replaced', async () => {
  const S = queued();
  const qp = path.join(RD(S), 'queue.json');
  const lockP = `${qp}.lock`;
  const pairs = ['--pairs', 'c1=c1-a,c1-b', 'c2=c2-a,c2-b'];
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'running', '--agent', 'ag1']), 'control: no lock held');
  ok(!fs.existsSync(lockP), 'the lock file is removed after a mark');
  fails(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'sleeping']), /state must be one of/);
  ok(!fs.existsSync(lockP), 'and after a refused mark');
  const S2 = makeS();
  snap(S2);
  const qp2 = path.join(RD(S2), 'queue.json');
  const before = fs.readFileSync(qp, 'utf8');
  fs.writeFileSync(lockP, 'held by the test\n');
  fs.writeFileSync(`${qp2}.lock`, 'held by the test\n');
  // The subcommands that only read take no lock.
  passes(ltz(['queue', S, 'u1', '1', 'status']), 'status while the lock is held');
  passes(ltz(['queue', S, 'u1', '1', 'next', '--cap', '2']), 'next while the lock is held');
  const t0 = Date.now();
  const held = await Promise.all([
    queueLtzAsync(['queue', S, 'u1', '1', 'mark', 'c1-b', 'running', '--agent', 'ag2']),
    queueLtzAsync(['queue', S, 'u1', '1', 'replace', 'c1-a', '--agent', 'ag9']),
    queueLtzAsync(['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '1', '--to', '2']),
    queueLtzAsync(['queue', S2, 'u1', '1', 'init', ...pairs]),
  ]);
  ['mark', 'replace', 'rerun', 'init'].forEach((sub, i) => {
    fails(held[i], /ERROR: .*could not take .*queue\.json\.lock within 10 seconds.*another queue command holds it/s, `${sub} with the lock held:`);
    eq(held[i].code, 1, `${sub}: a refusal, not an internal error`);
    ok(held[i].out.includes(i === 3 ? `${qp2}.lock` : lockP), `${sub} names the lock file:\n${held[i].out}`);
  });
  ok(Date.now() - t0 >= 9000, `they waited for the lock first (${Date.now() - t0} ms)`);
  eq(fs.readFileSync(qp, 'utf8'), before, 'nothing was written');
  ok(!fs.existsSync(qp2), 'init wrote nothing');
  ok(fs.existsSync(lockP) && fs.existsSync(`${qp2}.lock`), "another command's lock is left alone");
  // A lock file older than 30 seconds was left by a crashed command: it is replaced, then removed.
  const old = new Date(Date.now() - 60 * 1000);
  fs.utimesSync(lockP, old, old);
  fs.utimesSync(`${qp2}.lock`, old, old);
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-b', 'running', '--agent', 'ag2']), 'mark with a stale lock:');
  eq([queueSlot(S, 'c1-b').state, fs.existsSync(lockP)], ['running', false], 'the stale lock is replaced and removed');
  passes(ltz(['queue', S2, 'u1', '1', 'init', ...pairs]), 'init with a stale lock:');
  eq([rj(qp2).slots.length, fs.existsSync(`${qp2}.lock`)], [4, false], 'init wrote the queue and removed the lock');
  // A command that is waiting goes through once the lock is free.
  fs.writeFileSync(lockP, 'held by the test\n');
  const waiting = queueLtzAsync(['queue', S, 'u1', '1', 'mark', 'c2-a', 'running', '--agent', 'ag3']);
  await new Promise((r) => setTimeout(r, 1500));
  eq(queueSlot(S, 'c2-a').state, 'queued', 'not written while the lock is held');
  fs.rmSync(lockP);
  passes(await waiting, 'the waiting mark:');
  eq([queueSlot(S, 'c2-a').state, fs.existsSync(lockP)], ['running', false], 'written once the lock was free');
});
test('queue next: during a known limit wait (a stopped-limit reset in the future) it lists nothing to launch', () => {
  const S = queued();
  const next = () => passes(ltz(['queue', S, 'u1', '1', 'next', '--cap', '4']));
  const mark = (...a) => passes(ltz(['queue', S, 'u1', '1', 'mark', ...a]));
  mark('c1-a', 'running', '--agent', 'ag1');
  // Control: a reset in the past holds nothing back.
  mark('c1-a', 'stopped-limit', '--reset', '2000-01-01T00:00:00Z');
  let r = next();
  ok(/^continue c1-a \(agent ag1\)/m.test(r.out) && /^launch\s+c1-b/m.test(r.out) && /^launch\s+c2-a/m.test(r.out) && /^launch\s+c2-b/m.test(r.out), `a past reset:\n${r.out}`);
  ok(/^queue next \(cap 4\): 1 active, 3 to launch, 0 still queued$/m.test(r.out) && !/held/.test(r.out), r.out);
  // Control: a stopped-limit slot with no reset recorded holds nothing back.
  mark('c1-a', 'running');
  mark('c1-a', 'stopped-limit');
  eq(queueSlot(S, 'c1-a').reset, null, 'no reset recorded');
  r = next();
  ok(/^continue c1-a \(agent ag1\)/m.test(r.out) && /^launch\s+c1-b/m.test(r.out) && /1 active, 3 to launch, 0 still queued$/m.test(r.out) && !/held/.test(r.out), `no reset:\n${r.out}`);
  // A reset in the future: the wait line stays, nothing is listed to launch, and the held slots are counted.
  mark('c1-a', 'stopped-limit', '--reset', '2099-01-01T03:00');
  r = next();
  ok(/^wait\s+c1-a \(agent ag1\) until 2099-01-01T03:00, then continue from position 1$/m.test(r.out), `the wait line:\n${r.out}`);
  ok(!/^launch/m.test(r.out), `no launches during the wait:\n${r.out}`);
  ok(/^hold\s+3 queued slot\(s\) until 2099-01-01T03:00\b/m.test(r.out), `one line for the held slots:\n${r.out}`);
  ok(/^queue next \(cap 4\): 1 active, 0 to launch, 3 still queued \(3 held until 2099-01-01T03:00\)$/m.test(r.out), `the summary counts them:\n${r.out}`);
  // Two waits: the latest reset holds. A stopped-context slot is still listed to continue.
  mark('c1-b', 'running', '--agent', 'ag2');
  mark('c1-b', 'stopped-limit', '--reset', '2099-06-01T03:00');
  mark('c2-a', 'running', '--agent', 'ag3');
  mark('c2-a', 'stopped-context');
  r = next();
  ok(/^wait\s+c1-a .*until 2099-01-01T03:00/m.test(r.out) && /^wait\s+c1-b .*until 2099-06-01T03:00/m.test(r.out), r.out);
  ok(/^continue c2-a \(agent ag3\): SendMessage "continue from position 7"$/m.test(r.out), `continue lines stay:\n${r.out}`);
  ok(/^hold\s+1 queued slot\(s\) until 2099-06-01T03:00\b/m.test(r.out) && !/^launch/m.test(r.out), `the latest reset:\n${r.out}`);
  ok(/3 active, 0 to launch, 1 still queued \(1 held until 2099-06-01T03:00\)$/m.test(r.out), r.out);
  // Control: once no reset is ahead, the free place is used again.
  mark('c1-a', 'running');
  mark('c1-b', 'running');
  r = next();
  ok(/^launch\s+c2-b/m.test(r.out) && /3 active, 1 to launch, 0 still queued$/m.test(r.out) && !/^hold/m.test(r.out), `after the waits:\n${r.out}`);
});
test('queue next: a chunk with more queued readers than the cap itself is a PROBLEM (it launches whole, so it never would)', () => {
  const S = makeS();
  snap(S);
  passes(ltz(['queue', S, 'u1', '1', 'init', '--opaque', '--per-chunk', '3']));
  const next = (cap) => ltz(['queue', S, 'u1', '1', 'next', '--cap', cap]);
  let r = fails(next('2'), /PROBLEM: chunk c1 has 3 queued readers and the cap is 2: a chunk's readers launch together, so it can never launch\. Raise --cap to 3 \(the cap is the owner's decision\)/);
  eq(r.code, 1, 'exit 1');
  ok(/PROBLEM: chunk c2 has 3 queued readers and the cap is 2/.test(r.out) && !/^launch/m.test(r.out) && /0 active, 0 to launch, 6 still queued -> FAIL$/m.test(r.out), r.out);
  // Control: at cap 3 one chunk launches whole.
  r = passes(next('3'), 'cap 3:');
  eq([(r.out.match(/^launch\s+\S+ \(chunk c1, /gm) || []).length, /PROBLEM/.test(r.out), /0 active, 3 to launch, 3 still queued$/m.test(r.out)], [3, false, true], `cap 3 launches c1's three:\n${r.out}`);
  // Chunks that only wait for free places are unchanged: no PROBLEM, exit 0.
  for (const s of rj(path.join(RD(S), 'queue.json')).groups[0].slots) passes(ltz(['queue', S, 'u1', '1', 'mark', s, 'running', '--agent', `ag-${s}`]));
  for (const cap of ['3', '5']) {
    r = passes(next(cap), `cap ${cap} with 3 running:`);
    ok(!/PROBLEM|^launch/m.test(r.out) && new RegExp(`\\(cap ${cap}\\): 3 active, 0 to launch, 3 still queued$`, 'm').test(r.out), `c2 waits for free places at cap ${cap}:\n${r.out}`);
  }
  // A pair under an owner's cap of 1; a half-launched pair's one queued reader is no problem.
  const S2 = queued();
  r = fails(ltz(['queue', S2, 'u1', '1', 'next', '--cap', '1']), /PROBLEM: chunk c1 has 2 queued readers and the cap is 1: .*Raise --cap to 2/);
  ok(/PROBLEM: chunk c2 has 2 queued readers and the cap is 1/.test(r.out), r.out);
  passes(ltz(['queue', S2, 'u1', '1', 'mark', 'c1-a', 'running', '--agent', 'ag1']));
  r = fails(ltz(['queue', S2, 'u1', '1', 'next', '--cap', '1']), /PROBLEM: chunk c2 has 2 queued readers/);
  ok(!/PROBLEM: chunk c1/.test(r.out), `c1's one queued reader only waits:\n${r.out}`);
  passes(ltz(['queue', S2, 'u1', '1', 'next', '--cap', '2']), 'control: cap 2');
});
test('queue: a result file that lacks no position but is not clean gets no resume position; dropped-by-owner and replace are refused', () => {
  const S = queued();
  const rd = RD(S);
  const q = (...a) => ltz(['queue', S, 'u1', '1', ...a]);
  const fileA = path.join(rd, 'agent-c1-a.jsonl');
  reader(S, 'c1-a', 1, 6);
  passes(q('mark', 'c1-a', 'running', '--agent', 'ag1'));
  // Positions 1-6, and position 4 a second time.
  editJsonl(fileA, (rows) => [...rows, rows[3]]);
  let st = passes(q('status'));
  ok(/^c1-a .*lines 7\s+resume none \(not clean: duplicate positions 4\)$/m.test(st.out), `status gives no resume position:\n${st.out}`);
  let r = fails(q('mark', 'c1-a', 'done'), /refusing: c1-a does not cover its range 1-6 \(duplicate positions 4\)\. No position is missing: remove the duplicate or stray lines from agent-c1-a\.jsonl, then mark it done/);
  ok(!/continue from position|stopped-context/.test(r.out), `no "continue from position" advice:\n${r.out}`);
  r = fails(q('mark', 'c1-a', 'dropped-by-owner', '--ruling', 'P-1'), /refusing: no position of c1-a's range 1-6 is missing, but its result file is not clean \(duplicate positions 4\): remove the duplicate or stray lines from agent-c1-a\.jsonl, then mark it done/);
  eq([queueSlot(S, 'c1-a').state, queueSlot(S, 'c1-a').dropped], ['running', undefined], 'nothing is recorded as dropped');
  r = fails(q('replace', 'c1-a', '--agent', 'ag4'), /refusing: no position of c1-a's range 1-6 is missing, but its result file is not clean \(duplicate positions 4\): remove the duplicate or stray lines/);
  fails(q('replace', 'c1-a', '--agent', 'ag4', '--from', '1'), /no position of c1-a's range 1-6 is missing/, 'replace --from 1:');
  eq([queueSlot(S, 'c1-a').agent, queueSlot(S, 'c1-a').agentHistory], ['ag1', undefined], 'the agent is not replaced');
  passes(q('mark', 'c1-a', 'stopped-context'));
  let n = passes(q('next', '--cap', '4'));
  ok(/^unclean\s+c1-a \(agent ag1\): no position of c1-a's range 1-6 is missing, but its result file is not clean \(duplicate positions 4\)/m.test(n.out), `next names the unclean file:\n${n.out}`);
  ok(!/c1-a.*continue from position/.test(n.out), `next sends no "continue" for it:\n${n.out}`);
  // A line outside the range, and an unparseable line, are the same case.
  reader(S, 'c1-a', 1, 6);
  const clean = fs.readFileSync(fileA, 'utf8');
  const a09 = rjl(path.join(rd, 'snapshot.jsonl')).find((x) => x.id === 'A09');
  fs.writeFileSync(fileA, clean + JSON.stringify({ unit: 'u1', id: 'A09', verdict: 'ok', class: [], note: 'holds', cites: a09.cites }) + '\n');
  fails(q('mark', 'c1-a', 'done'), /\(1 line\(s\) outside its range\)\. No position is missing: remove the duplicate or stray lines/, 'a stray line:');
  fails(q('mark', 'c1-a', 'dropped-by-owner', '--ruling', 'P-1'), /no position of c1-a's range 1-6 is missing, .*\(1 line\(s\) outside its range\)/, 'a stray line:');
  ok(/^c1-a .*resume none \(not clean: 1 line\(s\) outside its range\)$/m.test(passes(q('status')).out), 'status, a stray line');
  fs.writeFileSync(fileA, clean + '{not json\n');
  fails(q('mark', 'c1-a', 'done'), /\(1 unparseable line\(s\)\)\. No position is missing: remove the duplicate or stray lines/, 'an unparseable line:');
  fails(q('replace', 'c1-a', '--agent', 'ag4'), /no position of c1-a's range 1-6 is missing, .*\(1 unparseable line\(s\)\)/, 'an unparseable line:');
  n = passes(q('next', '--cap', '4'));
  ok(/^unclean\s+c1-a .*\(1 unparseable line\(s\)\)/m.test(n.out), n.out);
  // Control: with the stray line removed the slot is complete.
  fs.writeFileSync(fileA, clean);
  ok(/^c1-a .*lines 6\s+resume complete$/m.test(passes(q('status')).out), 'control: a clean, complete file');
  passes(q('mark', 'c1-a', 'done'), 'control: a clean file is marked done');
  // Control: a file with a real gap keeps its resume position everywhere.
  reader(S, 'c1-b', 1, 4);
  passes(q('mark', 'c1-b', 'running', '--agent', 'ag2'));
  fails(q('mark', 'c1-b', 'done'), /\(missing positions 5-6\)\. Mark it stopped-context and send "continue from position 5": node <skill>\/scripts\/ltz\.mjs queue .* u1 1 mark c1-b stopped-context/, 'control: a gap');
  ok(/^c1-b .*lines 4\s+resume 5$/m.test(passes(q('status')).out), 'control: status resume 5');
  passes(q('mark', 'c1-b', 'stopped-context'));
  ok(/^continue c1-b \(agent ag2\): SendMessage "continue from position 5"$/m.test(passes(q('next', '--cap', '4')).out), 'control: next continues from 5');
  r = passes(q('replace', 'c1-b', '--agent', 'ag5', '--from', '5'), 'control: replace from the gap');
  ok(/agent ag5 reads c1-b from position 5/.test(r.out), r.out);
  r = passes(q('mark', 'c1-b', 'dropped-by-owner', '--ruling', 'P-2'), 'control: drop the uncovered tail');
  eq(queueSlot(S, 'c1-b').dropped, { from: 5, to: 6, ruling: 'P-2' }, 'the dropped tail');
});
test('cost --timeline: a quoted <S> holding a space does not turn "render ... show" into a window', () => {
  const f = path.join(RUN, `tl-space-${nS}.jsonl`);
  const cmd = (rest) => `node "/x/scripts/ltz.mjs" render "C:/Users/x/NPM Project/S" u1 1 k7f2 ${rest}`;
  fs.writeFileSync(f, [
    tmsg('m1', '2026-11-05T10:00:00Z', 100),
    tmsg('m2', '2026-11-05T10:01:00Z', 100, 0, cmd('1 16')),
    tmsg('m3', '2026-11-05T10:02:00Z', 100, 0, cmd('show src/a.js:3')),
    tmsg('m4', '2026-11-05T10:03:00Z', 100, 0, "node '/x/scripts/ltz.mjs' render 'C:/Users/x/NPM Project/S' u1 1 k7f2 show src/a.js:4"),
    tmsg('m5', '2026-11-05T10:04:00Z', 100, 0, 'node /x/scripts/ltz.mjs render C:/Users/x/"NPM Project"/S u1 1 k7f2 show src/a.js:5'),
    tmsg('m6', '2026-11-05T10:05:00Z', 100, 0, cmd('17 16')),
    tmsg('m7', '2026-11-05T10:06:00Z', 100),
  ].join('\n') + '\n');
  const r = passes(ltz(['cost', '--timeline', f]));
  ok(!/<< render .* show /.test(r.out), `no "render ... show" call is a window:\n${r.out}`);
  ok(/^window 1 \(render "C:\/Users\/x\/NPM Project\/S" u1 1 k7f2 1 16\): 4 message\(s\), 400 tokens, 4\.0 min$/m.test(r.out), r.out);
  ok(/^window 2 \(render "C:\/Users\/x\/NPM Project\/S" u1 1 k7f2 17 16\): 2 message\(s\), 200 tokens, 1\.0 min$/m.test(r.out), r.out);
  ok(/cost --timeline: 7 messages over 6\.0 min, 700 tokens; startup 100 tokens before the first render; 2 window\(s\), about 300 tokens and 2\.5 min each/.test(r.out), r.out);
});
test('cost --queue: one transcript stored under two spellings of its path is counted once', () => {
  const S = queued();
  const t1 = path.join(RUN, `q-spell-${nS}.jsonl`);
  const t2 = path.join(RUN, `q-other-${nS}.jsonl`);
  fs.writeFileSync(t1, [tmsg('m1', '2026-11-05T10:00:00Z', 100, 5), tmsg('m2', '2026-11-05T10:01:00Z', 200, 7)].join('\n') + '\n');
  fs.writeFileSync(t2, tmsg('m3', '2026-11-05T10:00:00Z', 10, 1) + '\n');
  // The same file spelled another way: in other letter case on Windows, through a link elsewhere.
  let alt;
  if (process.platform === 'win32') alt = path.join(path.dirname(t1), path.basename(t1).toUpperCase());
  else {
    alt = path.join(RUN, `q-spell-link-${nS}.jsonl`);
    fs.symlinkSync(t1, alt);
  }
  ok(alt !== t1 && fs.existsSync(alt), 'a second spelling of the same file');
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-a', 'running', '--agent', 'a1', '--transcript', t1]));
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c1-b', 'running', '--agent', 'a2', '--transcript', alt]));
  eq([queueSlot(S, 'c1-a').transcripts, queueSlot(S, 'c1-b').transcripts], [[t1], [alt]], 'stored as given');
  let r = passes(ltz(['cost', '--queue', S, 'u1', '1']));
  ok(/1 transcript\(s\) from 2 of 4 slots: cache reads 0, cache writes 0, other input 300, output 12, total 312/.test(r.out), `counted once:\n${r.out}`);
  // Control: a different file is still counted on its own.
  passes(ltz(['queue', S, 'u1', '1', 'mark', 'c2-a', 'running', '--agent', 'a3', '--transcript', t2]));
  r = passes(ltz(['cost', '--queue', S, 'u1', '1']));
  ok(/2 transcript\(s\) from 3 of 4 slots: .*other input 310, output 13, total 323/.test(r.out), `control: another file adds:\n${r.out}`);
});
test('queue and cost --queue: a queue.json that is not a JSON object, or holds a slot that is not one, is refused with a message', () => {
  const S = queued();
  const qp = path.join(RD(S), 'queue.json');
  const good = fs.readFileSync(qp, 'utf8');
  const cmds = [
    ['queue', S, 'u1', '1', 'status'],
    ['queue', S, 'u1', '1', 'next', '--cap', '2'],
    ['queue', S, 'u1', '1', 'mark', 'c1-a', 'running', '--agent', 'ag1'],
    ['queue', S, 'u1', '1', 'replace', 'c1-a', '--agent', 'ag2'],
    ['queue', S, 'u1', '1', 'rerun', 'c1-a', '--from', '1', '--to', '2'],
    ['cost', '--queue', S, 'u1', '1'],
  ];
  for (const body of ['null', '[]', '"queue"', '5']) {
    fs.writeFileSync(qp, body + '\n');
    for (const c of cmds) {
      const r = fails(ltz(c), /ERROR: queue\.json must be a JSON object/, `${c.slice(0, 5).join(' ')} with queue.json = ${body}:`);
      eq(r.code, 1, `a refusal, not an internal error (${c[0]} ${c[4]}, ${body})`);
    }
    eq(fs.readFileSync(qp, 'utf8'), body + '\n', 'nothing written');
  }
  for (const slot of ['null', '"c1-a"', '[]', '7']) {
    fs.writeFileSync(qp, `{"groups": [], "slots": [${slot}]}\n`);
    for (const c of cmds) {
      const r = fails(ltz(c), /ERROR: queue\.json: slots\[0\] must be a JSON object/, `${c.slice(0, 5).join(' ')} with a slot = ${slot}:`);
      eq(r.code, 1, `a refusal, not an internal error (${c[0]} ${c[4]}, slot ${slot})`);
    }
  }
  fs.writeFileSync(qp, good);
  passes(ltz(cmds[0]), 'control: status on the sound queue');
  passes(ltz(cmds[2]), 'control: mark on the sound queue');
});
test('lock: a writer.lock that is not {"session": "<id>", ...} counts as held, and the message says to delete it', () => {
  const S = makeS();
  const p = path.join(S, 'writer.lock');
  const lk = (action, session = 's1') => ltz(['lock', S, action, '--session', session]);
  for (const body of ['null', '{}', '[]', '"s1"', '{"session": ""}', '{"session": 5}', '{ not json']) {
    fs.writeFileSync(p, body + '\n');
    const c = fails(lk('check'), /lock: S\/writer\.lock is unreadable .*so it counts as held by another session; delete the file \(.*writer\.lock\) if no session holds it/, `check, ${body}:`);
    eq(c.code, 1, `check exits 1 for ${body}`);
    ok(!/lock: free/.test(c.out), c.out);
    fails(lk('acquire'), /refusing: S\/writer\.lock is unreadable .*delete the file \(.*writer\.lock\) if no session holds it/, `acquire, ${body}:`);
    fails(lk('release'), /refusing: S\/writer\.lock is unreadable .*delete the file \(.*writer\.lock\) if no session holds it/, `release, ${body}:`);
    eq(fs.readFileSync(p, 'utf8'), body + '\n', 'the file is left as it is');
  }
  // Control: with the file deleted the lock is free, and a sound lock reads as before.
  fs.rmSync(p);
  ok(/lock: free/.test(passes(lk('check')).out), 'control: no file is free');
  passes(lk('acquire'));
  ok(/lock: held by this session \(s1\)/.test(passes(lk('check')).out), 'control: a sound lock');
  fails(lk('check', 's2'), /lock: held by another session \(s1\) since \d{4}-/, 'control: another session');
  passes(lk('release'));
});
/** A state folder with the given config (whole, not merged), snapshotted when the config is accepted. */
function queueCfgRun(cfg) {
  const S = makeS();
  fs.writeFileSync(path.join(S, 'config.json'), typeof cfg === 'string' ? cfg : JSON.stringify(cfg, null, 2) + '\n');
  return ltz(['snapshot', S, 'u1', '1', '--chunk-size', '6']);
}
const QUEUE_CFG = () => ({
  evidence: { type: 'git', repo: REPO, pin: 'v1' },
  windowSize: 3,
  itemFields: ['title', 'plan', 'reason'],
  units: { u1: { status: 'open', itemFiles: ['docs/spec.md'] }, u2: { status: 'closed', itemFiles: ['docs/closed.md'] } },
});
test('config: a unit status outside the list is refused; a unit with no status counts as open', () => {
  const withStatus = (status) => ({ ...QUEUE_CFG(), units: { u1: { ...(status === undefined ? {} : { status }), itemFiles: ['docs/spec.md'] }, u2: { status: 'closed', itemFiles: ['docs/closed.md'] } } });
  for (const bad of ['Closed', 'CLOSED', 'close', 'final_check', 'Open', '', 5, null, ['closed']]) {
    const r = fails(queueCfgRun(withStatus(bad)), /ERROR: config\.json: unit u1: "status" must be one of open, final-check, closed, closed-leads-pending, closed-owner-questions-open, closed-known-wrongs, closed-by-stopping-rule \(got /, `status ${JSON.stringify(bad)}:`);
    ok(r.out.includes(`(got ${JSON.stringify(bad)})`), r.out);
    eq(r.code, 1, 'a refusal');
  }
  for (const good of ['open', 'final-check', 'closed', 'closed-leads-pending', 'closed-owner-questions-open', 'closed-known-wrongs', 'closed-by-stopping-rule']) {
    passes(queueCfgRun(withStatus(good)), `control: status ${good}:`);
  }
  // No status at all: accepted, and the unit counts as open (queue init wants every chunk queued).
  const S = makeS();
  wj(path.join(S, 'config.json'), withStatus(undefined));
  snap(S);
  fails(ltz(['queue', S, 'u1', '1', 'init', '--pairs', 'c1=c1-a,c1-b']), /chunks with no readers: c2 \(every chunk must be queued\)/, 'no status counts as open:');
});
test('config: "units" and "universalWords" of the wrong shape are refused', () => {
  for (const bad of ['u1', ['u1'], 5, null]) {
    fails(queueCfgRun({ ...QUEUE_CFG(), units: bad }), /ERROR: config\.json: "units" must be an object, \{"<unit>": \{"status", "itemFiles"\}\}/, `units ${JSON.stringify(bad)}:`);
  }
  for (const bad of ['open', null, ['docs/spec.md']]) {
    fails(queueCfgRun({ ...QUEUE_CFG(), units: { u1: bad } }), /ERROR: config\.json: unit u1 must be an object, \{"status", "itemFiles"\}/, `unit ${JSON.stringify(bad)}:`);
  }
  for (const bad of ['only, every', [], [5], ['only', ''], ['only', ' '], {}, null]) {
    const r = fails(queueCfgRun({ ...QUEUE_CFG(), universalWords: bad }), /ERROR: config\.json: "universalWords" must be a non-empty array of non-empty strings/, `universalWords ${JSON.stringify(bad)}:`);
    eq(r.code, 1, 'a refusal');
  }
  passes(queueCfgRun({ ...QUEUE_CFG(), universalWords: ['solely', 'no caller'] }), 'control: a list of words:');
  passes(queueCfgRun(QUEUE_CFG()), 'control: neither key overridden:');
  const { units, ...noUnits } = QUEUE_CFG();
  fails(queueCfgRun(noUnits), /unit u1 is not in config\.json "units" \(known: none\)/, 'control: no "units" key is not a shape error:');
  ok(units.u1, 'the control config had units');
});
test('config: a key that differs from a known key only in case, "-" or "_" is refused (top level, unit, evidence source); any other unknown key loads and snapshot names it', () => {
  let r = fails(queueCfgRun({ ...QUEUE_CFG(), windowsize: 4 }), /ERROR: config\.json: unknown key "windowsize" \(did you mean "windowSize"\?\)\. The keys are: evidence, windowSize, itemFields, units, universalWords, itemsRoot, maskSecrets, maskKeys, maskAllow, maskExclude, boundaryPaths, ownerQuestionsBlock, defectsBlock, decisionLog, rulingIdPattern, requireRulingEntries, historyFolders/);
  eq(r.code, 1, 'a refusal');
  fails(queueCfgRun({ ...QUEUE_CFG(), maskkeys: ['dsn'] }), /config\.json: unknown key "maskkeys" \(did you mean "maskKeys"\?\)\. The keys are: .*maskKeys/, 'maskkeys:');
  fails(queueCfgRun({ ...QUEUE_CFG(), mask_keys: ['dsn'] }), /config\.json: unknown key "mask_keys" \(did you mean "maskKeys"\?\)/, 'mask_keys:');
  r = passes(queueCfgRun({ ...QUEUE_CFG(), comment: 'x' }), 'a comment key loads:');
  ok(/WARNING: config\.json holds key\(s\) the tools do not read, which are ignored: comment/.test(r.out), r.out);
  const unit = (extra) => ({ ...QUEUE_CFG(), units: { u1: { status: 'open', itemFiles: ['docs/spec.md'], ...extra }, u2: { status: 'closed', itemFiles: ['docs/closed.md'] } } });
  fails(queueCfgRun(unit({ itemfiles: ['docs/x.md'] })), /ERROR: config\.json: unit u1: unknown key "itemfiles" \(did you mean "itemFiles"\?\)\. The keys are: status, itemFiles/, 'a unit key:');
  fails(queueCfgRun(unit({ Status: 'closed' })), /config\.json: unit u1: unknown key "Status" \(did you mean "status"\?\)\. The keys are: status, itemFiles/, 'a unit key:');
  fails(queueCfgRun({ ...QUEUE_CFG(), evidence: { type: 'git', repo: REPO, pin: 'v1', Pin: 'v2' } }), /ERROR: config\.json: evidence: unknown key "Pin" \(did you mean "pin"\?\)\. The keys are: type, repo, pin, root, prefix, sha256/, 'a source key:');
  fails(queueCfgRun({ ...QUEUE_CFG(), evidence: [{ type: 'git', repo: REPO, pin: 'v1', prefix: '' }, { type: 'dir', root: path.join(REPO, 'docs'), prefix: 'export/', SHA256: 'x' }] }),
    /ERROR: config\.json: evidence\[1\]: unknown key "SHA256" \(did you mean "sha256"\?\)\. The keys are: type, repo, pin, root, prefix, sha256/, 'a key of a listed source:');
  r = passes(queueCfgRun({ ...QUEUE_CFG(), evidence: [{ type: 'git', repo: REPO, pin: 'v1', prefix: '' }, { type: 'dir', root: path.join(REPO, 'docs'), prefix: 'export/', sha: 'x' }] }), 'a key no known key resembles loads:');
  ok(/ignored: evidence\[1\]: sha/.test(r.out), r.out);
  r = passes(queueCfgRun(unit({ note: 'reopened 2026-11-01' })), 'a note on a unit loads:');
  ok(/ignored: unit u1: note/.test(r.out), r.out);
  // Control: every key the lists hold, in its documented form, is accepted.
  const full = {
    ...QUEUE_CFG(),
    evidence: [{ type: 'git', repo: REPO, pin: 'v1', prefix: '' }, { type: 'dir', root: path.join(REPO, 'docs'), prefix: 'export/' }],
    universalWords: ['only', 'every'], itemsRoot: REPO,
    maskSecrets: true, maskKeys: [], maskAllow: [], maskExclude: [],
    boundaryPaths: ['src/**', 'docs/**'],
    ownerQuestionsBlock: true, defectsBlock: false,
    decisionLog: 'decisions.md', rulingIdPattern: 'D-\\d+', requireRulingEntries: false,
    historyFolders: [],
  };
  eq(Object.keys(full).sort(), [...CONFIG_KEYS].sort(), 'the control holds every key in CONFIG_KEYS');
  r = passes(queueCfgRun(full), 'control: every documented key:');
  ok(!/the tools do not read/.test(r.out), `no warning for documented keys:\n${r.out}`);
  passes(queueCfgRun({ ...QUEUE_CFG(), evidence: { type: 'dir', root: REPO } }), 'control: folder evidence:');
});
test('config: a note key on an evidence source (an earlier pass\'s pin) loads, and snapshot names it', () => {
  const r = passes(queueCfgRun({ ...QUEUE_CFG(), evidence: { type: 'git', repo: REPO, pin: 'v1', pinPass1: 'v1', pinPass2: 'v1' } }), 'pinPass1 and pinPass2 load:');
  ok(/WARNING: config\.json holds key\(s\) the tools do not read, which are ignored: evidence: pinPass1, evidence: pinPass2/.test(r.out), r.out);
  passes(ltz(['show', path.join(RUN, `case-${nS}`, 'S'), 'u1', '1', 't-a', 'src/auth.js:3']), 'other commands read the folder too');
  fails(queueCfgRun({ ...QUEUE_CFG(), windowsize: 4 }), /unknown key "windowsize" \(did you mean "windowSize"\?\)/, 'control: a misspelled key is still refused:');
});
test('config: a config.json that is not a JSON object is refused with a message', () => {
  for (const body of ['null', '[]', '"config"', '5']) {
    const r = fails(queueCfgRun(body + '\n'), /ERROR: config\.json must be a JSON object/, `config.json = ${body}:`);
    eq(r.code, 1, `a refusal, not an internal error (${body})`);
  }
  fails(queueCfgRun('{ not json'), /S\/config\.json is not valid JSON/, 'control: unparseable JSON keeps its message:');
  passes(queueCfgRun(QUEUE_CFG()), 'control: a sound config:');
});
test('diffcheck --verify-searches: the help and the README name it, as the default', () => {
  const h = passes(ltz(['diffcheck', '--help']));
  ok(/^diffcheck <S> <unit> <R> \[--verify-searches\|--no-verify-searches\]$/m.test(h.out), `the usage line:\n${h.out}`);
  ok(/--verify-searches is the default: it is accepted and changes nothing/.test(h.out.replace(/\s+/g, ' ')), `the help says it is the default:\n${h.out}`);
  const readme = fs.readFileSync(path.join(SCRIPTS, 'README.md'), 'utf8');
  ok(/ltz\.mjs diffcheck <S> <unit> <R> \[--verify-searches\\\|--no-verify-searches\]` \| .*`--verify-searches` is the default/.test(readme), 'the README command row names it');
  // Control: it is accepted and changes nothing.
  const S = makeS();
  snap(S);
  const plain = passes(ltz(['diffcheck', S, 'u1', '1']));
  eq(passes(ltz(['diffcheck', S, 'u1', '1', '--verify-searches'])).out, plain.out, 'the same output with the flag');
  fails(ltz(['diffcheck', S, 'u1', '1', '--verify-searches', '--no-verify-searches']), /give --verify-searches or --no-verify-searches, not both/);
});

// ================================================================ run
async function main() {
  fs.mkdirSync(RUN, { recursive: true });
  let failed = 0;
  let passed = 0;
  // LTZ_TEST_ONLY=<regex> runs only the tests whose name matches (for quick iteration; run them all after).
  const only = process.env.LTZ_TEST_ONLY ? new RegExp(process.env.LTZ_TEST_ONLY) : null;
  const chosen = only ? tests.filter((t) => only.test(t.name)) : tests;
  if (only) console.log(`LTZ_TEST_ONLY /${only.source}/: ${chosen.length} of ${tests.length} tests`);
  try {
    buildRepo();
    for (const t of chosen) {
      try {
        await t.fn();
        passed++;
        console.log(`PASS ${t.name}`);
      } catch (e) {
        failed++;
        const msg = e instanceof AssertionError ? e.message : e && e.stack ? e.stack : String(e);
        console.log(`FAIL ${t.name}\n     ${msg.split('\n').slice(0, 25).join('\n     ')}`);
      }
    }
  } finally {
    const resolved = path.resolve(RUN);
    if (resolved.startsWith(path.resolve(TMP_ROOT) + path.sep) && !process.env.LTZ_KEEP_TMP) {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      try {
        if (!fs.readdirSync(TMP_ROOT).length) fs.rmdirSync(TMP_ROOT);
      } catch {
        /* leave it */
      }
    }
  }
  console.log(`\n${passed} passed, ${failed} failed, ${chosen.length} total${only ? ` (filtered from ${tests.length})` : ''}`);
  process.exitCode = failed ? 1 : 0;
}
main();
