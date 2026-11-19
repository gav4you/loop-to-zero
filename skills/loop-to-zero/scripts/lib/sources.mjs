// Evidence sources. config.evidence is one source or a list of sources, each with a "prefix":
//   {"type":"git","repo":"..","pin":"..","prefix":""}  or  {"type":"dir","root":"..","prefix":"export/","sha256":".."}
// A dir source's optional "sha256" pins its files: every tool refuses the folder once they change.
// A cite's path goes to the source with the longest matching prefix, and the prefix is stripped
// before that source reads the file. A single object (no prefix) is the source for every path.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fail, normPath } from './util.mjs';

function normPrefix(p, where) {
  if (p === undefined || p === null || p === '') return '';
  if (typeof p !== 'string') fail(`${where}: "prefix" must be a string`);
  let s = normPath(p);
  if (s && !s.endsWith('/')) s += '/';
  if (s.split('/').includes('..') || s.startsWith('/')) fail(`${where}: "prefix" must be a relative folder (got ${JSON.stringify(p)})`);
  return s;
}

/** The validated list of sources: [{type, repo?, pin?, root?, prefix}]. Fails on a bad config. */
export function evidenceSources(cfg) {
  const ev = cfg.evidence;
  if (!ev || typeof ev !== 'object') fail('config.json: "evidence" is required');
  const list = Array.isArray(ev) ? ev : [ev];
  if (!list.length) fail('config.json: "evidence" is an empty list');
  const seen = new Set();
  return list.map((s, i) => {
    const where = Array.isArray(ev) ? `config.json: evidence[${i}]` : 'config.json: evidence';
    if (!s || typeof s !== 'object' || Array.isArray(s)) fail(`${where} must be an object`);
    if (s.type === 'git') {
      if (!s.repo || !s.pin) fail(`${where}: git evidence needs "repo" and "pin"`);
    } else if (s.type === 'dir') {
      if (!s.root) fail(`${where}: dir evidence needs "root"`);
      if (s.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(String(s.sha256))) fail(`${where}: "sha256" must be 64 hex characters (the hash snapshot prints)`);
    } else {
      fail(`${where}: "type" must be "git" or "dir" (got ${JSON.stringify(s.type)})`);
    }
    const prefix = normPrefix(s.prefix, where);
    if (seen.has(prefix)) fail(`config.json: two evidence sources share the prefix ${JSON.stringify(prefix)}`);
    seen.add(prefix);
    return { ...s, prefix };
  });
}

/** {source, rel} for a repo-relative path, by the longest matching prefix; null when none matches. */
export function routeSource(sources, p) {
  const n = normPath(p);
  let best = null;
  for (const s of sources) {
    if (n.startsWith(s.prefix) && (!best || s.prefix.length > best.prefix.length)) best = s;
  }
  if (!best) return null;
  const rel = n.slice(best.prefix.length);
  return rel ? { source: best, rel } : null;
}

/** Every folder or repo the evidence lives in (for "is S inside the evidence?" checks). */
export function sourceBases(cfg) {
  const list = Array.isArray(cfg.evidence) ? cfg.evidence : [cfg.evidence || {}];
  return list.flatMap((s) => [s && s.repo, s && s.root]).filter(Boolean);
}

/**
 * The pin a round reads, as snapshot writes it to <round>/pin.json: each source with its git pin
 * resolved to a commit (so a moved branch or tag still names what was read), or its folder and sha256.
 */
export function pinRecord(cfg) {
  return evidenceSources(cfg).map((s) => {
    if (s.type === 'git') {
      let commit;
      try {
        commit = execFileSync('git', ['-C', s.repo, 'rev-parse', '--verify', '--quiet', `${s.pin}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() || undefined;
      } catch {
        commit = undefined;
      }
      return { type: 'git', prefix: s.prefix, repo: s.repo, pin: s.pin, ...(commit ? { commit } : {}) };
    }
    return { type: 'dir', prefix: s.prefix, root: s.root, ...(s.sha256 !== undefined ? { sha256: s.sha256 } : {}) };
  });
}

/** A round's recorded pin, or null when the round has no pin.json (rounds snapshotted before it existed). */
export function loadPinRecord(roundDir) {
  const p = path.join(roundDir, 'pin.json');
  if (!fs.existsSync(p)) return null;
  let o;
  try {
    o = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`${p}: not valid JSON (${e.message})`);
  }
  if (!o || !Array.isArray(o.sources)) fail(`${p}: needs {"sources": [...]}`);
  return o.sources;
}

/** How two pin records differ, as text, or null when every source reads the same evidence. */
export function pinDifference(was, now) {
  const key = (s) => (s.type === 'git' ? `git ${s.repo} @ ${s.commit || s.pin}` : `dir ${s.root}${s.sha256 ? ` sha256 ${s.sha256.slice(0, 12)}` : ''}`);
  const a = new Map(was.map((s) => [s.prefix || '', key(s)]));
  const b = new Map(now.map((s) => [s.prefix || '', key(s)]));
  const out = [];
  for (const p of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(p) !== b.get(p)) out.push(`${p || '(no prefix)'}: ${a.get(p) || 'none'} -> ${b.get(p) || 'none'}`);
  }
  return out.length ? out.join('; ') : null;
}

/** The config with its evidence set back to a recorded pin (a git source reads its recorded commit). */
export function configAtPin(cfg, rec) {
  return {
    ...cfg,
    evidence: rec.map((s) =>
      s.type === 'git'
        ? { type: 'git', repo: s.repo, pin: s.commit || s.pin, prefix: s.prefix }
        : { type: 'dir', root: s.root, prefix: s.prefix, ...(s.sha256 !== undefined ? { sha256: s.sha256 } : {}) }),
  };
}
