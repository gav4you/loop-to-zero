#!/usr/bin/env node
// ltz: tools for a "loop to zero" verification loop. Node >= 18, ESM, no dependencies.
// Usage: node <skill>/scripts/ltz.mjs <command> [args]   (... <command> --help)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LtzError, parseArgs } from './lib/util.mjs';
import { snapshot } from './lib/snapshot.mjs';
import { render, show } from './lib/render.mjs';
import { record } from './lib/record.mjs';
import * as queue from './lib/queue.mjs';
import { diffcheck } from './lib/diffcheck.mjs';
import { sweep, replay } from './lib/patterns.mjs';
import { spotcheck } from './lib/spotcheck.mjs';
import { crosscheck } from './lib/crosscheck.mjs';
import { reach } from './lib/reach.mjs';
import { flips } from './lib/flips.mjs';
import * as canary from './lib/canary.mjs';
import { cost, costQueue, timeline } from './lib/cost.mjs';
import { lock } from './lib/lock.mjs';
import { rulings } from './lib/rulings.mjs';
import { searches } from './lib/searchverify.mjs';

// Every command runs as: node <skill>/scripts/ltz.mjs <command> ... (loops run from the project
// folder). <R> (the briefs' {R}) is the round number in digits, such as 3; its folder is r<R>.
const HELP = {
  snapshot: `snapshot <S> <unit> <R> [--chunk-size N] [--order <file>]
  Copy the unit's items from S/items.jsonl to S/<unit>/r<R>/snapshot.jsonl, copy S/classes.md to
  r<R>/classes.md, and write list.json (ordered ids), chunks.json (1-based ranges, about 70 items cut
  on window boundaries) and snapshot.sha256. <R> is the round number in digits. --order takes a file
  of ids (one per line, or a JSON array) and writes list.json in that order; it must be a permutation
  of the unit's ids. For r0 (the cost-measurement read) list.json and chunks.json hold the first
  window only (of the --order order, if given). Refuses once reading
  has started, and (with config "requireRulingEntries": true) while a ruling id in the decision log
  is not found, as whole text, in S/classes.md's "accepted by ruling" section (as for rulings). An
  item's optional "type" ("requirement" or
  "description") is passed through; another value is warned about.`,
  render: `render <S> <unit> <R> <slot> <from> <count> [--list <items.jsonl>]
render <S> <unit> <R> <slot> show <cite>...
  Write r<R>/w-<slot>-<from>.txt: each item in full and every cited line at the pin, with line
  numbers. Cites: path:12, path:20-25, path:Key (the matching line plus 10 after) and path#a.b.c (a
  nested JSON/YAML key: its line plus its block). Positions are 1-based. Every rendered line is
  appended to r<R>/render-<slot>.jsonl. Values of secret keys (whole key segments such as password,
  token, secret, api_key; a key may be several words, "Password rotation"; config "maskKeys" adds
  names, "maskAllow" names are never masked, "maskExclude" lists path globs never masked,
  "maskSecrets": false turns it off) are shown as «masked», up to , ; } ] ) a " #" comment or the end
  of the line, except an unquoted plain number, boolean or duration (12, true, 30s, 90 days) under a
  key with a setting segment (min, max, length, ttl, rotation, timeout, count and similar:
  password_min_length: 12 and "Password rotation: 90 days" are shown, password: 1234 and pin: 0000
  are masked); the summary counts masked lines. With several evidence sources, each cite goes to the source with the longest matching
  prefix, which is stripped before the file is read.
  --list renders from a JSONL file of full items instead of list.json (the fix-checker input):
  an item with a "changed" field (one {field, old?, new} or an array of them) is a changed item;
  one without is a named item, shown marked
  "(named item, for context)". Positions count the file's items (a blank line is skipped). Canaries in r<R>/canary-plan.json
  are inserted before their position.`,
  show: `show <S> <unit> <R> <slot> <cite>...
  Print those lines at the pin (path:12, path:20-25, path:Key or path#a.b.c) and log them to
  render-<slot>.jsonl. Masking as for render.`,
  record: `record <S> <unit> <R> --chunk-readers <chunk>=<slotA>,<slotB> ...
  Check every reader's coverage (each list position exactly once per reader, except a range the owner
  dropped; every cite in its render log; every wrong names a file:line it rendered, or a cited file it
  found missing at the pin, unless its note starts "self-contradiction:"); every chunk must
  have readers, except in a unit whose config status is final-check: there, chunks left out of
  --chunk-readers (all of them, if it is not given) are reported "not read (final check)", and the
  round never counts as a zero. A rerun slot (queue rerun) supplies its positions in place of its parent's lines (the
  latest rerun wins), checked against its own render log; name only the parents. Needs
  r<R>/confirmed.json ({"<id>": {"note", "foundBy"?: "sweep"|"spot-check"|"audit"|"fixcheck"|"extract",
  "class"?, "repeatReason"?, "repeatNote"?, "rulingsChecked"?: [{"ruling", "why"}]}, "pending": [{"id",
  "pendingReason": "rule-meaning"|"boundary-silent"|"ruled-wording"}], "withdrawn": [{"id", "ruling"}],
  "outsideBar": [{"id", "note"}], "ruledKept": [{"id", "ruling"}], "restated": [{"id", "of"}], "defects": [ids]});
  a pending id without a valid pendingReason is a PROBLEM. A withdrawn id (a reader wrong a ruling
  given mid-round overturned) is not a false alarm (withdrawnByRuling.<slot>) and not confirmed; its
  ruling must match config "rulingIdPattern" and be in the decision log. An outsideBar id (a reader
  wrong that fits no class of a frozen bar; its note says what the evidence shows, with file:line) is
  listed for the owner and not counted: not a false alarm (outsideBar.<slot>, outsideBarItems), not
  confirmed, reported "outside-bar" when a reader read it, named in the summary; it never blocks a
  zero. A restated id (a final-check unit's round only: a reader wrong restating a known wrong, or a
  revert or stale lead's flaw, that the round fixes without confirming; "of" names it) is neither
  confirmed nor a false alarm (measure.json restated), reported "wrong" with "restated" when a reader read it (unread otherwise), and it blocks a zero as a wrong does; in any other
  unit, or also confirmed, pending, a defect, withdrawn, outsideBar or rejected, it is a PROBLEM. Every ok whose note starts
  "ruled: <ruling id>", in a reader's lines or a fix checker's fixcheck-<K>-<part>.jsonl, is listed
  in measure.json ruledOks, with a warning unless the id is pending
  as ruled-wording or listed in "ruledKept" with the same ruling (the writer checked it and the owner
  kept the ruling). A ruledKept entry whose id is not a ruled ok of the round, whose ruling differs
  from the ruled ok's, whose id is also confirmed, pending, a defect, withdrawn, outsideBar or restated, or
  that lacks an id or ruling, is a PROBLEM. A wrong in a parent's (or earlier rerun's) lines that
  the replacing rerun does not mark is a warning. A confirmed id that an earlier round (or, with config "historyFolders",
  any round but r0 under <folder>/<unit>/) also confirmed with an overlapping class (unless its latest
  judgments.jsonl line for that unit and round says "now" "ok" or "pending-owner") is a PROBLEM
  unless it is pending, or has "repeatReason" "plain-fix-failure", "new-text", "earlier-miss" or "evidence-moved" with
  a non-empty "repeatNote" and a "rulingsChecked" list: every bar ruling in the decision log, each
  as {"ruling", "why"} with why it does not cover the item. With config "decisionLog" and
  "rulingIdPattern" set, the listed rulings must equal the ruling ids the log holds (as for rulings):
  a log id left out, an id not in the log, an empty why or a ruling listed twice is a PROBLEM.
  With either setting absent, only [] is accepted (an INFO line says it was not checked); a pattern
  that does not compile, or a log that is missing, unreadable or has no ruling id, is a PROBLEM. A
  foundBy wrong no reader marked counts as found by none. Writes report.json (verdict ok, wrong, pending-owner, defect, unread or outside-bar; cites_read
  only from render logs) and measure.json (finds per reader, false alarms, Chapman estimate, canary
  scores, reruns, fixChecker: the fixcheck-<K>-<part>.jsonl items checked and wrongs per iteration,
  fullDepth, countsAsZero, zeroBlockers). countsAsZero needs full depth, no wrong and nothing unread;
  boundary-silent and ruled-wording pending items always block it, rule-meaning ones when config
  "ownerQuestionsBlock" is true (the default), defects when "defectsBlock" is true (default false).
  Every slot queue.json holds must be named in --chunk-readers (reruns and slots closed as replaced
  aside). The summary names each repeat kept wrong and prints each slot's canary score; a canary
  missed, falsely alarmed on or not judged is a warning. With one reader per chunk it says the
  remaining wrongs were not estimated. Writes nothing if any PROBLEM is found.`,
  queue: `queue <S> <unit> <R> init --pairs <chunk>=<slotA>,<slotB> ...
queue <S> <unit> <R> init --opaque [--per-chunk N] [--chunks <chunk>,...]
queue <S> <unit> <R> init   (a final-check unit only: an empty queue)
queue <S> <unit> <R> next --cap N
queue <S> <unit> <R> mark <slot> <state> [--agent <id>] [--transcript <path>] [--reset <date-time>] [--ruling <id>]
queue <S> <unit> <R> replace <slot> --agent <newId> [--from P] [--transcript <path>]
queue <S> <unit> <R> rerun <slot> --from P --to Q
queue <S> <unit> <R> status
  States: queued, running, stopped-limit, stopped-credits, stopped-context, done, replaced,
  dropped-by-owner (done, replaced and dropped-by-owner are closed; the rest are open). "init --opaque"
  names the slots with short random ids (N per chunk, default 2), so a reader cannot infer that
  another reader shares its range; queue.json keeps the chunk-to-slots map, and init prints the
  --chunk-readers arguments for record. Every chunk must be queued, except in a unit whose config
  status is final-check: it may queue a subset (--pairs naming some chunks, or --opaque --chunks), or
  none. "next" lists stopped jobs to continue, then slots to launch
  within the cap (running and stopped jobs count against it): pairs whole, reruns one by one.
  While a stopped-limit job's recorded reset is still ahead, "next" lists nothing to launch: a "hold"
  line gives the number of queued slots and the latest such reset, and the summary counts them. A
  chunk with more queued readers than the cap itself can never launch whole: "next" reports it as a
  PROBLEM (non-zero exit) naming the chunk, its reader count and the cap.
  init, mark, replace and rerun hold the lock file queue.json.lock, beside queue.json, while they
  read, change and write the queue. A command waits up to 10 seconds for it, then fails naming the
  file and writes nothing. A lock file older than 30 seconds (left by a crashed command) is replaced.
  "mark <slot> done" refuses unless the result file covers the whole range exactly once.
  A result file that lacks no position but holds a duplicate, a line outside the range or an
  unparseable line has no resume position: "status" prints "resume none (not clean: ...)", "next"
  lists a stopped slot as "unclean", and "mark <slot> dropped-by-owner" and "replace" refuse it
  until those lines are removed.
  "--transcript <path>" stores the agent's transcript path on the slot (for cost --queue).
  "--reset <date-time>" records when a limit resets (for stopped-limit; "next" waits until then). It
  takes an ISO 8601 date and time, YYYY-MM-DDTHH:MM[:SS[.fff]][Z|+HH:MM|-HH:MM], such as
  2026-11-10T03:00 (local time, with no Z or offset). A bare clock time (03:00), a date with no time
  (2026-11-10) or no year (Nov 10 03:00), and an invalid date or time (such as 2026-11-31T03:00, or
  24:00, which ISO 8601 allows) are refused.
  "mark <slot> replaced" closes an abandoned slot. "mark <slot> dropped-by-owner --ruling <id>" records
  the rest of the slot's range as dropped, with its decision id (usually P-n); record then marks the
  chunk not full depth, unless reruns read the whole dropped tail (each position counts for the
  latest rerun covering it). "rerun <slot> --from P --to Q" adds a new opaque slot that reads P-Q
  again (a re-run of trimmed, unrendered or failed evidence, a supplementary read of a skimming
  reader's range, or, with the owner's OK, a read of an owner-dropped tail), with its parent
  recorded; record uses its lines for P-Q, except where a later rerun overlaps.
  "replace <slot> --agent <newId>" (after an account change or in a new session) puts a
  fresh agent on the same slot, which stays open (running); the old agent goes to agentHistory. The
  order: take the resume position P from "status", launch the fresh agent with the slot's kept brief followed
  by "continue from position P", then run "replace <slot> --agent <newId> --from P" at once; --from must equal the result file's resume
  position when replace runs. "status" prints each slot's result lines, resume position and earlier
  agents.`,
  diffcheck: `diffcheck <S> <unit> <R> [--verify-searches|--no-verify-searches]
  Compare r<R>/snapshot.jsonl with S/items.jsonl field by field; the changed set must equal
  r<R>/fixlog.jsonl ({id, field, old, new, unit?, search?, hits?, judged?, blindSpots?,
  scopeNote?, scopeText?, ruling?, basis?, source?}). A changed field of an item whose "type" is
  "requirement" needs, on each entry, "basis": "copying-error" with a non-empty "source" (the
  file:line it copies) or a "ruling"; otherwise it is a PROBLEM (a requirement the evidence does not
  meet is a defect, not a fix). An entry for another unit's item needs "unit": "<that unit>";
  each open unit named so must have its changes since its latest snapshot explained by those
  entries, its own latest round's fixlog, or other rounds' entries with that "unit", and this
  round's edits there get the text checks below. Flags every changed clause holding a universal word (added or kept) and any and/or list
  inside one; a flagged clause is cleared only by a fixlog search + hits for that id and field, or by
  the edit removing the universal word from that clause (a qualifier alone, such as "probably", does
  not clear it). Also flags new 3+ item lists with no "such as"/"for example"/"among others", shape
  problems, changed items still matching a regression pattern in S/checks/patterns/*.json, and edits
  to a closed unit. Searches are verified by default: each structured search ({"regex", "flags"?,
  "paths"?: [globs], "count"?: "matches"|"lines"|"files"}) is run at the pin (every evidence source,
  routed by prefix) and fails when "hits" differs; a free-text search fails; "paths" narrower than
  config "boundaryPaths" fail unless the entry has a "scopeNote"; a "scopeNote" needs a "scopeText"
  (the scope words) that appears in the new text; and every structured search needs a "blindSpots"
  text and a "judged" list: one {"at": "path:line" ("path" for count "files"), "why": "<reason>"}
  per hit, whose locations must equal the hit locations at the pin (a line with two matches is
  judged twice; compared case- and slash-insensitively). "hitsJudged" is refused.
  --no-verify-searches skips running them (blindSpots, scopeText and the shape of "judged", with
  one entry per hit, are still checked). --verify-searches is the default: it is accepted and
  changes nothing. Exits
  non-zero on any mismatch or flag.`,
  sweep: `sweep <S> <pattern.json|classfile> [--unit U] [--count]
  Pattern: {"id","class","regex","flags","fields":[...],"knownInstances":[ids],"regression":bool}; a
  class file is a JSON array of patterns. Prints hits. Refuses if any known instance is not hit
  (checked against the current items, every round's snapshot, and every round's fixlog "new"
  values, in S/ and, with config "historyFolders", in each folder's <folder>/<unit>/r*/), if
  knownInstances is empty (except with --count), or if a field is in no item. A history folder that
  is missing, or a "historyFolders" that is not an array, is a PROBLEM. The regex
  runs as written. --count prints only hit counts per pattern and unit, never the hits; a pattern
  without knownInstances is counted and marked as untested.`,
  searches: `searches <S> [--rounds <unit>,...|all] [--at-current]
  Re-run every structured fixlog search of those rounds (default all) at the pin over config
  "boundaryPaths" (every file without it) instead of the logged paths, and report each whose
  boundary-wide count differs from its logged "hits": a scope that was too narrow. Entries with a
  "scopeNote" are listed apart and do not fail. Works for past and closed rounds. Exits non-zero when
  any differs, or when there is no structured search to re-run. Each round runs at the pin its
  pin.json recorded; --at-current runs every round at the current pin instead (after a pin move: do
  the bounds still hold at the new evidence?).`,
  flips: `flips <S> <unit>
  Across S/<unit>/r*/fixlog.jsonl, report any (id, field) whose value returns to one it held before.
  With config "historyFolders", each folder's <folder>/<unit>/r*/fixlog.jsonl is read first (rounds
  labelled such as discovery/r3). A flip whose returning fixlog entry carries "ruling": "<id>", or
  "judgment:<round>:<id>" naming an entry in that state folder's judgments.jsonl for this unit whose id
  is the flipped item or whose backprop lists it (for an overturn that was not a ruling), is listed as
  explained and does not fail. "judgment:<folder>/<round>:<id>"
  names an entry in that history folder's judgments.jsonl instead (<folder> as in config
  "historyFolders" with any trailing / dropped, such as discovery); a folder not listed there leaves
  the flip unexplained. Exits non-zero when an unexplained flip is found, or a history folder is
  missing.`,
  canary: `canary add <S> <unit> <R> --from <canaries.jsonl>
canary plan <S> <unit> <R> --per-slot K --seed N
canary gitignore <S>
  add: validate writer-authored planted items ({"id","unit","kind":"wrong|ok", fields..., "cites"}) and
  append them to S/canaries.jsonl (never to S/items.jsonl or a repo). plan: place K canaries per queue
  slot at seeded random positions in r<R>/canary-plan.json; render inserts them, record scores them.
  gitignore: print the S/.gitignore lines that keep canaries.jsonl, canary-plan.json and the writer's
  canaries-src/ out of git (they must never be committed), and the readers' scratch folders
  (S/<unit>/r<R>/scratch/, probe copies of the code with its secrets). The canary lines must be there
  as written, with no later "!" line re-including a canary file; for the scratch folders any line will do that git treats as ignoring every
  <unit>/r<R>/scratch/ folder (such as **/scratch/), checked on real paths with git check-ignore in a
  throwaway repo (by a glob match when git is not found). Exits non-zero when any is missing.`,
  cost: `cost <transcript.jsonl>...
cost --queue <S> <unit> <R>
cost --timeline <transcript.jsonl>
  Sum message.usage per transcript (deduped by message id, max per field): cache reads, cache writes,
  other input, output, total. --queue sums every transcript path stored in r<R>/queue.json (queue
  mark ... --transcript); a missing file is a PROBLEM, the rest are still summed. --timeline prints
  each message's tokens with its timestamp, elapsed time and the running total, marks each "ltz
  render" call as a window ("render ... show" is extra reading and starts none), and sums the startup
  (before the first render) and each window: tokens, messages and minutes.`,
  replay: `replay <S> <pattern.json|classfile> --rounds <unit>[,<unit>...|all] [--holdout <unit>/r<R>[,...]]
  Run the pattern(s) over each past round's snapshot.jsonl that has a confirmed.json, and report recall
  on confirmed wrongs of the pattern's class and false hits on items not confirmed wrong (some hits count
  as neither, such as one on a restated, pending or unread item: scripts/README.md, "Replay"). With config
  "historyFolders", each folder's <folder>/<unit>/r* rounds are replayed too, first (labelled such as
  discovery/u1/r3); a missing folder is a PROBLEM. A confirmed wrong whose latest judgments.jsonl
  line for that unit and round, in the state folder holding the round (S/ or the history folder), has
  "now" "ok" or "pending-owner" was overturned and is not counted. A class file is a JSON array of
  patterns (or {"patterns": [...]}). --holdout names the rounds a rule was written from (a history round
  by its label, such as discovery/u1/r3); the summary then also gives each pattern's recall and false hits
  without them, which is the figure to judge the rule on.`,
  crosscheck: `crosscheck <S> [--unit <unit>]
  List every cite two or more items share (a family to judge together: readers see one window at a
  time and never compare items), and flag the families whose items state different numbers. Cites
  are grouped by the line cited, however the path is spelled. A unit written against a number is left
  out (30s is 30); a number inside a word or a dotted version (v2, 1.2.3) is not compared. Reports
  only; never fails or judges.`,
  reach: `reach <S> --to <rev> [--unit <unit>]
  Before a pin move: list the files changed between the pin and <rev> inside boundaryPaths (renames
  under both paths), then per unit the items that cite one; the items that hold a universal word, cite
  none, and whose last structured fixlog search finds different hits at <rev> than at the pin; and the
  universal items with no search to re-run (check those by hand, or count them in). One git source
  only. Reports only; never judges.`,
  spotcheck: `spotcheck <S> <unit> <R> --seed N [--per-slot K] [--extra <slot>=<K> ...]
  Draw each reader's random spot-checks: K (default 5) of the items its result file marked ok (canaries
  excluded), half from the early half of its positions and half from the late half, reproducibly from the
  seed. --extra adds picks for one reader (one that missed a canary or skims late windows). Writes
  r<R>/spotchecks.json {seed, perSlot, extra, picks: {<slot>: [{id, position, half}]}}; refuses if it
  exists. With a queue.json, it draws from the files of the queue's slots that are not replaced, and
  of each only the lines record uses (a rerun's lines in place of its parent's); without one, from
  every agent-<slot>.jsonl. The weighted picks are the writer's own choice and are not drawn here.`,
  lock: `lock <S> acquire|release|check --session <id>|auto
  S/writer.lock {session, since}. acquire refuses if another session holds it; release refuses for
  another session; check exits non-zero only when another session holds it. A writer.lock that does
  not hold {"session": "<id>", ...} counts as held by another session: every action fails and says
  to delete the file if no session holds it. --session auto reads the
  id from S/.session-hint, which the guard hook writes just before the command runs (the writer cannot
  learn its own session id), and deletes it; without the guard, or with a hint older than 60 s, it
  fails: give the id, or enable the guard.`,
  rulings: `rulings <S>
  List every ruling id in the decision log (config "decisionLog", a path; relative to S/) matched by
  config "rulingIdPattern" (a regex) as whole text (no letter or digit just before or after it, so
  PR-12 holds no R-12) that is not found in the "accepted by ruling" section of
  S/classes.md (under a heading containing those words, up to the next heading of the same or a
  higher level). An id is found when it appears there as whole text (R-1 is not found inside R-12).
  Exits non-zero if any are missing, or if the pattern matches no id.`,
};

const FLAGS = {
  snapshot: { 'chunk-size': 'string', order: 'string' },
  render: { list: 'string' },
  show: {},
  record: { 'chunk-readers': 'multi' },
  queue: { pairs: 'multi', opaque: 'bool', 'per-chunk': 'string', chunks: 'string', cap: 'string', agent: 'string', reset: 'string', ruling: 'string', from: 'string', to: 'string', transcript: 'string' },
  diffcheck: { 'verify-searches': 'bool', 'no-verify-searches': 'bool' },
  sweep: { unit: 'string', count: 'bool' },
  searches: { rounds: 'string', 'at-current': 'bool' },
  flips: {},
  canary: { from: 'string', 'per-slot': 'string', seed: 'string' },
  cost: { queue: 'bool', timeline: 'string' },
  replay: { rounds: 'string', holdout: 'string' },
  spotcheck: { seed: 'string', 'per-slot': 'string', extra: 'multi' },
  crosscheck: { unit: 'string' },
  reach: { to: 'string', unit: 'string' },
  lock: { session: 'string' },
  rulings: {},
};

function need(pos, n, cmd) {
  if (pos.length < n) throw new LtzError(`${cmd}: missing arguments\nusage: ${HELP[cmd].split('\n')[0]}`);
}

function run(cmd, argv) {
  const { pos, flags } = parseArgs(argv, FLAGS[cmd]);
  if (flags.help) return { output: HELP[cmd], summary: '' };
  switch (cmd) {
    case 'snapshot':
      need(pos, 3, cmd);
      return snapshot({ S: pos[0], unit: pos[1], R: pos[2], chunkSize: flags['chunk-size'], order: flags.order });
    case 'render':
      need(pos, 5, cmd);
      if (pos[4] === 'show') return show({ S: pos[0], unit: pos[1], R: pos[2], slot: pos[3], cites: pos.slice(5) });
      need(pos, 6, cmd);
      return render({ S: pos[0], unit: pos[1], R: pos[2], slot: pos[3], from: pos[4], count: pos[5], listFile: flags.list });
    case 'show':
      need(pos, 5, cmd);
      return show({ S: pos[0], unit: pos[1], R: pos[2], slot: pos[3], cites: pos.slice(4) });
    case 'record':
      need(pos, 3, cmd);
      return record({ S: pos[0], unit: pos[1], R: pos[2], chunkReaders: flags['chunk-readers'] });
    case 'queue': {
      need(pos, 4, cmd);
      const [S, unit, R, sub] = pos;
      if (sub === 'init') return queue.init({ S, unit, R, pairs: flags.pairs, opaque: !!flags.opaque, perChunk: flags['per-chunk'], only: flags.chunks });
      if (sub === 'next') {
        if (!flags.cap) throw new LtzError('queue next needs --cap N');
        return queue.next({ S, unit, R, cap: flags.cap });
      }
      if (sub === 'mark') {
        need(pos, 6, cmd);
        return queue.mark({ S, unit, R, slot: pos[4], state: pos[5], agent: flags.agent, reset: flags.reset, ruling: flags.ruling, transcript: flags.transcript });
      }
      if (sub === 'replace') {
        need(pos, 5, cmd);
        return queue.replace({ S, unit, R, slot: pos[4], agent: flags.agent, from: flags.from, transcript: flags.transcript });
      }
      if (sub === 'rerun') {
        need(pos, 5, cmd);
        return queue.rerun({ S, unit, R, slot: pos[4], from: flags.from, to: flags.to });
      }
      if (sub === 'status') return queue.status({ S, unit, R });
      throw new LtzError(`queue: unknown subcommand ${JSON.stringify(sub)} (init, next, mark, replace, rerun, status)`);
    }
    case 'diffcheck':
      need(pos, 3, cmd);
      if (flags['verify-searches'] && flags['no-verify-searches']) throw new LtzError('give --verify-searches or --no-verify-searches, not both');
      return diffcheck({ S: pos[0], unit: pos[1], R: pos[2], verifySearches: !flags['no-verify-searches'] });
    case 'sweep':
      need(pos, 2, cmd);
      return sweep({ S: pos[0], patternFile: pos[1], unit: flags.unit, count: !!flags.count });
    case 'searches':
      need(pos, 1, cmd);
      return searches({ S: pos[0], rounds: flags.rounds, atCurrent: !!flags['at-current'] });
    case 'flips':
      need(pos, 2, cmd);
      return flips({ S: pos[0], unit: pos[1] });
    case 'canary': {
      if (pos[0] === 'gitignore') {
        need(pos, 2, cmd);
        return canary.gitignore({ S: pos[1] });
      }
      need(pos, 4, cmd);
      const [sub, S, unit, R] = pos;
      if (sub === 'add') return canary.add({ S, unit, R, from: flags.from });
      if (sub === 'plan') {
        if (!flags['per-slot'] || flags.seed === undefined) throw new LtzError('canary plan needs --per-slot K and --seed N');
        return canary.plan({ S, unit, R, perSlot: flags['per-slot'], seed: flags.seed });
      }
      throw new LtzError(`canary: unknown subcommand ${JSON.stringify(sub)} (add, plan, gitignore)`);
    }
    case 'cost':
      if (flags.queue && flags.timeline !== undefined) throw new LtzError('give --queue or --timeline, not both');
      if (flags.queue) {
        if (pos.length !== 3) throw new LtzError('cost --queue takes <S> <unit> <R> and no transcript files');
        return costQueue({ S: pos[0], unit: pos[1], R: pos[2] });
      }
      if (flags.timeline !== undefined) {
        if (pos.length) throw new LtzError('cost --timeline takes one transcript and nothing else');
        return timeline({ file: flags.timeline });
      }
      return cost({ files: pos });
    case 'replay':
      need(pos, 2, cmd);
      return replay({ S: pos[0], patternFile: pos[1], rounds: flags.rounds, holdout: flags.holdout });
    case 'spotcheck':
      need(pos, 3, cmd);
      return spotcheck({ S: pos[0], unit: pos[1], R: pos[2], seed: flags.seed, perSlot: flags['per-slot'], extra: flags.extra });
    case 'crosscheck':
      need(pos, 1, cmd);
      return crosscheck({ S: pos[0], unit: flags.unit });
    case 'reach':
      need(pos, 1, cmd);
      return reach({ S: pos[0], to: flags.to, unit: flags.unit });
    case 'lock':
      need(pos, 2, cmd);
      return lock({ S: pos[0], action: pos[1], session: flags.session });
    case 'rulings':
      need(pos, 1, cmd);
      return rulings({ S: pos[0] });
    default:
      throw new LtzError(`unknown command ${cmd}`);
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(
      'node <skill>/scripts/ltz.mjs <command> [args]   (... <command> --help)\n' +
        '<R> is the round number in digits (3); its folder is r<R>. Positions are 1-based.\n\n' +
        Object.values(HELP).map((h) => h.split('\n')[0]).join('\n'),
    );
    return cmd ? 0 : 1;
  }
  if (!HELP[cmd]) {
    console.error(`ERROR: unknown command ${JSON.stringify(cmd)}. Commands: ${Object.keys(HELP).join(', ')}`);
    return 1;
  }
  let res;
  try {
    res = run(cmd, rest);
  } catch (e) {
    if (e instanceof LtzError) {
      console.error(`ERROR: ${e.message}`);
      return 1;
    }
    console.error(`ERROR (internal): ${e && e.stack ? e.stack : e}`);
    return 2;
  }
  if (res.output) console.log(res.output);
  for (const w of res.warnings || []) console.log(`WARNING: ${w}`);
  for (const m of res.mismatches || []) console.log(`MISMATCH: ${m}`);
  for (const f of res.flags || []) console.log(`FLAG: ${f}`);
  for (const p of res.problems || []) console.log(`PROBLEM: ${p}`);
  const failed = res.failed || (res.problems || []).length || (res.mismatches || []).length || (res.flags || []).length;
  if (res.summary) console.log(res.summary + (failed && !/FAIL|REFUSED/.test(res.summary) ? ' -> FAIL' : ''));
  else if (failed) console.log(`${cmd}: FAIL`);
  return failed ? 1 : 0;
}

// The command names, for scripts/skillcheck.mjs.
export const COMMANDS = Object.keys(HELP);

// Run only when invoked as a program, so skillcheck can import COMMANDS.
// Real paths on both sides: node resolves links for the module's own path, so a skill folder reached
// through a symlink or junction would otherwise never match, and every command would do nothing.
const realPath = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
const self = realPath(fileURLToPath(import.meta.url));
const entry = process.argv[1] ? realPath(process.argv[1]) : '';
if (process.platform === 'win32' ? entry.toLowerCase() === self.toLowerCase() : entry === self) {
  process.exitCode = main(process.argv.slice(2));
}
