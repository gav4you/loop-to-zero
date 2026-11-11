// lock <S> acquire|release|check --session <id>: S/writer.lock {session, since}
import fs from 'node:fs';
import path from 'node:path';
import { fail, readText } from './util.mjs';

export function lockPath(S) {
  return path.join(S, 'writer.lock');
}

export function readLock(S) {
  const p = lockPath(S);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(readText(p));
  } catch {
    return { session: '(unreadable lock file)', since: null };
  }
}

// --session auto: the writer cannot learn its own session id, but the guard (a PreToolUse hook) sees
// it, and writes it to S/.session-hint just before a "lock ... --session auto" command runs.
export const HINT_FILE = '.session-hint';
export const HINT_MAX_AGE_MS = 60 * 1000;

/** The session id from S/.session-hint, which is deleted once read (a stale one too). */
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
  return h.session.trim();
}

export function lock({ S, action, session }) {
  if (!S || !fs.existsSync(S)) fail(`state folder not found: ${S}`);
  if (!['acquire', 'release', 'check'].includes(action)) fail(`lock action must be acquire, release or check (got ${JSON.stringify(action)})`);
  if (!session) fail('--session <id> is required (or --session auto, with the guard on)');
  const auto = session === 'auto';
  if (auto) session = sessionFromHint(S);
  const from = auto ? ' (session id from the guard\'s hint)' : '';
  const p = lockPath(S);
  const held = readLock(S);
  if (action === 'check') {
    if (!held) return { summary: `lock: free${from}` };
    if (held.session === session) return { summary: `lock: held by this session (${session}) since ${held.since}${from}` };
    return { failed: true, summary: `lock: held by another session (${held.session}) since ${held.since}; this session is ${session}${from}` };
  }
  if (action === 'acquire') {
    if (held) {
      if (held.session === session) return { summary: `lock: already held by this session (${session}) since ${held.since}${from}` };
      fail(`refusing: S/writer.lock is held by session ${held.session} since ${held.since}`);
    }
    const body = JSON.stringify({ session, since: new Date().toISOString() }) + '\n';
    try {
      fs.writeFileSync(p, body, { flag: 'wx' });
    } catch (e) {
      if (e.code === 'EEXIST') fail('refusing: another session took S/writer.lock just now');
      throw e;
    }
    return { summary: `lock: acquired by ${session}${from}` };
  }
  // release
  if (!held) return { summary: `lock: was not held${from}` };
  if (held.session !== session) fail(`refusing: S/writer.lock is held by session ${held.session}, not ${session}`);
  fs.unlinkSync(p);
  return { summary: `lock: released by ${session}${from}` };
}
