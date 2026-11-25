// Text heuristics for the diff check: universal words, closed lists, shape.
import { escapeRe } from './util.mjs';

function wordRe(w) {
  return new RegExp('\\b' + w.trim().split(/\s+/).map(escapeRe).join('\\s+') + '\\b', 'gi');
}

export function countWord(text, w) {
  return (String(text ?? '').match(wordRe(w)) || []).length;
}

/** Universal words whose count rose from old to new: [{word, old, new}] */
export function addedUniversals(oldT, newT, words) {
  const out = [];
  for (const w of words) {
    const a = countWord(oldT, w);
    const b = countWord(newT, w);
    if (b > a) out.push({ word: w, old: a, new: b });
  }
  return out;
}

// Words that open a list ("e.g." is rewritten to "for example" before this runs).
const OPENERS = /\b(such as|for example|among others)\b/i;
// A series of 3+ items joined by ", and " or ", or ": "A, B, and C", "A, B, C, or D".
const SERIES = /,\s*[^,\s][^,]*,\s+(?:and|or)\s+\S/i;

function segments(text) {
  return String(text ?? '')
    .replace(/\be\.g\./gi, 'for example')
    .replace(/\bi\.e\./gi, 'that is')
    .split(/[;:!?()\n]|\.(?=\s|$)/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

/** Clause segments holding a 3+ item list with no "such as"/"for example". */
export function closedLists(text) {
  return segments(text).filter((s) => SERIES.test(s) && !OPENERS.test(s));
}

/** Closed lists in new text that are not in the old text (a reworded list counts as new). */
export function newClosedLists(oldT, newT) {
  const before = new Set(closedLists(oldT));
  return closedLists(newT).filter((s) => !before.has(s));
}

/**
 * Clauses: text split at sentence stops, ";", ":", parentheses, line breaks and spaced dashes
 * (not at commas, so a list stays inside its clause).
 */
export function clauses(text) {
  return String(text ?? '')
    .replace(/\be\.g\./gi, 'for example')
    .replace(/\bi\.e\./gi, 'that is')
    .split(/[;:()\n]|[.!?](?=\s|$)|\s[-–—]\s/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

/** Clauses of the new text that are not clauses of the old text. */
export function changedClauses(oldT, newT) {
  const before = new Set(clauses(oldT));
  return clauses(newT).filter((c) => !before.has(c));
}

const JOINED = /\S\s+(and\/or|and|or|nor)\s+\S/gi;

/**
 * Changed clauses that hold a universal word, whether the word was added or kept:
 * [{clause, words, joins}] where joins lists the and/or words joining list members in it.
 */
export function universalClauses(oldT, newT, words) {
  const out = [];
  for (const c of changedClauses(oldT, newT)) {
    const found = words.filter((w) => countWord(c, w) > 0);
    if (!found.length) continue;
    const joins = [...c.matchAll(new RegExp(JOINED.source, 'gi'))].map((m) => m[1].toLowerCase());
    out.push({ clause: c, words: found, joins });
  }
  return out;
}

export function sentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Shape problems in a changed field (whole field, not a window around the edit). */
export function shapeFlags(oldT, newT) {
  const flags = [];
  const t = String(newT ?? '');
  const stacked = t.match(/\)\s*\(/g);
  if (stacked) flags.push(`stacked parentheticals ") (" x${stacked.length}`);
  for (const s of sentences(t)) {
    const words = s.split(/\s+/).filter(Boolean).length;
    if (words > 60) flags.push(`sentence of ${words} words (> 60): "${s.slice(0, 80)}..."`);
  }
  const o = String(oldT ?? '').replace(/\s+$/, '');
  const base = o.replace(/[.!?]+$/, '');
  if (base && t.length > o.length && t.startsWith(base)) {
    const rest = t.slice(base.length);
    const startsSentence = /^[.!?]+\s+\S/.test(rest);
    const onlyStop = /^[.!?]*\s*$/.test(rest);
    // Only text that starts a new word or clause is an appended clause: a last word or number that
    // just got longer ("3" -> "30", "check" -> "checkUser") is a changed value, not an appended clause.
    const startsClause = /^[\s,;:(\-–—]/.test(rest);
    if (!startsSentence && !onlyStop && startsClause) flags.push(`clause appended with no sentence stop: "...${rest.slice(0, 60)}"`);
  }
  if (/[.!?]\s*$/.test(o) && t.trim() && !/[.!?]["')\]]?\s*$/.test(t)) flags.push('the field lost its final sentence stop');
  return flags;
}
