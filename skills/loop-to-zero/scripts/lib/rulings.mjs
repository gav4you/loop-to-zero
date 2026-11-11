// rulings <S>: every ruling id in the decision log must appear, as whole text, in S/classes.md's
// "accepted by ruling" section, so readers see each ruling in the bar.
import fs from 'node:fs';
import path from 'node:path';
import { fail, readText, escapeRe } from './util.mjs';
import { loadConfig } from './state.mjs';

/**
 * The lines of the markdown section whose heading contains "accepted by ruling" (the first such
 * heading, up to the next heading of the same or a higher level): [{n (1-based line in the file),
 * text}], or null when there is no such heading.
 */
export function acceptedSectionLines(md) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && /accepted by ruling/i.test(l));
  if (start < 0) return null;
  const level = /^(#+)/.exec(lines[start])[1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = /^(#{1,6})\s/.exec(lines[i]);
    if (h && h[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).map((text, i) => ({ n: start + 2 + i, text }));
}

// The characters that may not touch an id for it to be whole text.
const ID_CHAR = 'A-Za-z0-9';
const ID_CHAR_RE = new RegExp(`[${ID_CHAR}]`);

/** Whether `needle` appears in `text` as whole text: `R-1` is not found inside `R-12` or `XR-1`. */
export function hasWhole(text, needle) {
  return new RegExp(`(?<![${ID_CHAR}])${escapeRe(needle)}(?![${ID_CHAR}])`).test(text);
}

/** Whether the match `m` (from matchAll over `text`) is whole text: no letter or digit just before or after it. */
function wholeMatch(text, m) {
  return !ID_CHAR_RE.test(text.charAt(m.index - 1)) && !ID_CHAR_RE.test(text.charAt(m.index + m[0].length));
}

/**
 * The ruling ids in the decision log: every match of config "rulingIdPattern" that is whole text
 * (wholeMatch: "PR-12" or "XR-5" holds no R-n id, "SHA256" no A256; the pattern itself runs as
 * written): {ids, logPath}, or {error} when the config or the log is unusable. Never throws.
 */
export function decisionLogIds(S, cfg) {
  if (typeof cfg.decisionLog !== 'string' || !cfg.decisionLog.trim()) return { error: 'config.json: "decisionLog" (the path of the decision log) is required' };
  if (typeof cfg.rulingIdPattern !== 'string' || !cfg.rulingIdPattern) return { error: 'config.json: "rulingIdPattern" (a regex for ruling ids) is required' };
  const logPath = path.isAbsolute(cfg.decisionLog) ? cfg.decisionLog : path.resolve(S, cfg.decisionLog);
  if (!fs.existsSync(logPath)) return { error: `decision log not found: ${logPath}` };
  let re;
  try {
    re = new RegExp(cfg.rulingIdPattern, 'g');
  } catch (e) {
    return { error: `config.json: rulingIdPattern does not compile: ${e.message}` };
  }
  let text;
  try {
    text = readText(logPath);
  } catch (e) {
    return { error: `decision log cannot be read: ${logPath} (${e.code || e.message})` };
  }
  const ids = [...new Set([...text.matchAll(re)].filter((m) => m[0] && wholeMatch(text, m)).map((m) => m[0]))];
  return { ids, logPath };
}

/**
 * The bar rulings a repeat's "rulingsChecked" list is checked against. Never throws. One of:
 * - {state: "ok", ids (Set: every ruling id in the decision log, see decisionLogIds), logPath, pattern,
 *   whole (RegExp: a whole ruling id)};
 * - {state: "none", reason}: config "decisionLog" or "rulingIdPattern" is absent, so there is nothing
 *   to check a list against;
 * - {state: "bad", reason}: a setting is present but not a non-empty string, the pattern does not
 *   compile (both checked first, even when the other setting is absent), the log is missing or
 *   unreadable, or the pattern matches no id in it.
 */
export function barRulings(S, cfg) {
  const keys = ['decisionLog', 'rulingIdPattern'];
  for (const k of keys) {
    if (cfg[k] !== undefined && (typeof cfg[k] !== 'string' || !cfg[k].trim())) return { state: 'bad', reason: `config "${k}" must be a non-empty string` };
  }
  if (cfg.rulingIdPattern !== undefined) {
    try {
      new RegExp(cfg.rulingIdPattern);
    } catch (e) {
      return { state: 'bad', reason: `config "rulingIdPattern" does not compile: ${e.message}` };
    }
  }
  const absent = keys.filter((k) => cfg[k] === undefined);
  if (absent.length) return { state: 'none', reason: `config ${absent.map((k) => `"${k}"`).join(' and ')} ${absent.length > 1 ? 'are' : 'is'} not set` };
  const d = decisionLogIds(S, cfg);
  if (d.error) return { state: 'bad', reason: d.error };
  if (!d.ids.length) return { state: 'bad', reason: `rulingIdPattern /${cfg.rulingIdPattern}/ matched no ids in ${d.logPath}; nothing would be checked` };
  return { state: 'ok', ids: new Set(d.ids), logPath: d.logPath, pattern: cfg.rulingIdPattern, whole: new RegExp(`^(?:${cfg.rulingIdPattern})$`) };
}

/**
 * {ids, missing, sectionFound, logPath}; fails when the config or the log is unusable. A decision-log
 * id is present when some line of the accepted-by-ruling section holds it as whole text (hasWhole);
 * any other id is missing.
 */
export function rulingCheck(S, cfg) {
  const d = decisionLogIds(S, cfg);
  if (d.error) fail(d.error);
  const { ids, logPath } = d;
  if (!ids.length) fail(`rulingIdPattern /${cfg.rulingIdPattern}/ matched no ids in ${logPath}; nothing would be checked`);
  const classesPath = path.join(S, 'classes.md');
  if (!fs.existsSync(classesPath)) fail(`S/classes.md is missing (${classesPath})`);
  const section = acceptedSectionLines(readText(classesPath));
  const missing = ids.filter((id) => !(section || []).some((l) => hasWhole(l.text, id)));
  return { ids, missing, sectionFound: section !== null, logPath };
}

export function rulings({ S }) {
  const cfg = loadConfig(S);
  const r = rulingCheck(S, cfg);
  const out = r.missing.map((id) => `MISSING ${id}: in the decision log, but not found in S/classes.md's "accepted by ruling" section`);
  if (!r.sectionFound) out.unshift('S/classes.md has no heading containing "accepted by ruling"');
  return {
    output: out.join('\n'),
    failed: r.missing.length > 0,
    summary: `rulings: ${r.ids.length} ruling id(s) in ${r.logPath}; ${r.missing.length} not found in the "accepted by ruling" section`,
  };
}
