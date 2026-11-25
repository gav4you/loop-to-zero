// lock <S> acquire|release|check --session <id>: S/writer.lock {session, agent?, since}
import fs from 'node:fs';
import path from 'node:path';
import { fail, readText } from './util.mjs';

export function lockPath(S) {
  return path.join(S, 'writer.lock');
}

// What readLock returns for a lock file that is not {"session": "<id>", ...}: it counts as held by
// another session, as the guard treats it.
const UNREADABLE = { session: '(unreadable lock file)', since: null };

export function readLock(S) {
  const p = lockPath(S);
  if (!fs.existsSync(p)) return null;
  try {
    const v = JSON.parse(readText(p));
    return v && typeof v === 'object' && typeof v.session === 'string' && v.session ? v : UNREADABLE;
  } catch {
    return UNREADABLE;
  }
}

// --session auto: the writer cannot learn its own session id, but the guard (a PreToolUse hook) sees
// it, and writes it to S/.session-hint just before a "lock ... --session auto" command runs.
export const HINT_FILE = '.session-hint';
export const HINT_MAX_AGE_MS = 60 * 1000;

/**
 * The caller from S/.session-hint, which is deleted once read (a stale one too): {session, agent}.
 * agent is the caller's agent id when the command was run by an agent, else null.
 */
export function sessionFromHint(S) {
  const p = path.join(S, HINT_FILE);
  const how = 'give the id (--session <id>), or enable the guard hook, which writes the hint just before the command runs (scripts/hooks/README.md)';
  if (!fs.existsSync(p)) fail(`--session auto: no session hint in ${p}; ${how}`);
  let h = null;
  try {
    h = JSON.parse(readText(p));
  } catch {
    h = null;
  }
  try {
    fs.unlinkSync(p);
  } catch {
    /* already gone */
  }
  if (!h || typeof h.session !== 'string' || !h.session.trim() || typeof h.at !== 'string' || Number.isNaN(Date.parse(h.at))) {
    fail(`--session auto: ${p} is unreadable (it needs {"session", "at"}); ${how}`);
  }
  const age = Date.now() - Date.parse(h.at);
  if (age > HINT_MAX_AGE_MS || age < -HINT_MAX_AGE_MS) {
    fail(`--session auto: the session hint is stale (written ${Math.round(age / 1000)} s ago; it is good for ${HINT_MAX_AGE_MS / 1000} s); run the command again with the guard on, or give --session <id>`);
  }
  return { session: h.session.trim(), agent: typeof h.agent === 'string' && h.agent.trim() ? h.agent.trim() : null };
}

export function lock({ S, action, session }) {
  if (!S || !fs.existsSync(S)) fail(`state folder not found: ${S}`);
  if (!['acquire', 'release', 'check'].includes(action)) fail(`lock action must be acquire, release or check (got ${JSON.stringify(action)})`);
  if (!session) fail('--session <id> is required (or --session auto, with the guard on)');
  const auto = session === 'auto';
  // With --session auto the guard's hint also says whether an agent ran the command. The lock then
  // belongs to that agent, not to every caller that shares its session id. A session id typed by hand
  // carries no agent, so it is compared on the session alone.
  let agent = null;
  if (auto) ({ session, agent } = sessionFromHint(S));
  const from = auto ? ' (session id from the guard\'s hint)' : '';
  const who = (x) => `${x.session}${x.agent ? `, agent ${x.agent}` : ''}`;
  const mine = (x) => x.session === session && (!auto || (x.agent || null) === agent);
  const p = lockPath(S);
  const held = readLock(S);
  if (held === UNREADABLE) {
    const msg = `S/writer.lock is unreadable (it must hold {"session": "<id>", "since": "<time>"}), so it counts as held by another session; delete the file (${p}) if no session holds it`;
    if (action === 'check') return { failed: true, summary: `lock: ${msg}${from}` };
    fail(`refusing: ${msg}`);
  }
  if (action === 'check') {
    if (!held) return { summary: `lock: free${from}` };
    if (mine(held)) return { summary: `lock: held by this session (${who(held)}) since ${held.since}${from}` };
    return { failed: true, summary: `lock: held by another session (${who(held)}) since ${held.since}; this session is ${who({ session, agent })}${from}` };
  }
  if (action === 'acquire') {
    if (held) {
      if (mine(held)) return { summary: `lock: already held by this session (${who(held)}) since ${held.since}${from}` };
      fail(`refusing: S/writer.lock is held by session ${who(held)} since ${held.since}`);
    }
    const body = JSON.stringify({ session, ...(agent ? { agent } : {}), since: new Date().toISOString() }) + '\n';
    try {
      fs.writeFileSync(p, body, { flag: 'wx' });
    } catch (e) {
      if (e.code === 'EEXIST') fail('refusing: another session took S/writer.lock just now');
      throw e;
    }
    return { summary: `lock: acquired by ${who({ session, agent })}${from}` };
  }
  // release
  if (!held) return { summary: `lock: was not held${from}` };
  if (!mine(held)) fail(`refusing: S/writer.lock is held by session ${who(held)}, not ${who({ session, agent })}`);
  fs.unlinkSync(p);
  return { summary: `lock: released by ${who({ session, agent })}${from}` };
}
