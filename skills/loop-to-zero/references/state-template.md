# The state folder (`S/`)

The state folder lives somewhere durable, outside every repo the loop edits, unless the owner names a place.
A good default is the project's Claude folder: `~/.claude/projects/<project>/loop-to-zero/<loop-name>/`.
Everything the loop needs to resume lives here, so no work depends on the transcript.

```
S/
  config.json        what the tools read: evidence (git repo + pin, or a folder), window size, item fields,
                     units (status and item files), boundaryPaths, maskKeys, maskExclude, decisionLog,
                     rulingIdPattern (bar rulings only), requireRulingEntries, ownerQuestionsBlock,
                     defectsBlock, optional universal-word override (scripts/README.md)
  loop.md            terms, units, evidence + pin + boundary, item type, ruling ids, modes, bar,
                     cross-unit policy, trend, cost, "Next step" (one line, always current)
  decisions.md       the decision log when question 9 puts it here (always at first, provisionally; also kept beside
                     a project log whose ids can't mark bar rulings): every owner decision verbatim, dated, numbered
                     (bar rulings R-n, process decisions P-n)
  rules.md           the verification rules, if the project had none (drafted at setup, owner-approved)
  research.md        the setup research: terms with their repo sources, claim-shape counts, evidence kinds,
                     past-error groups, rulings, proposed classes with examples, tested sweeps, replay results
  classes.md         the bar: the owner-approved classes, "accepted by ruling", and quoted copies of the
                     three lenses, the universal words, "When two classes fit" and "Accepted forms"
  precedents.md      optional: worked examples of judged items that the owner approved (made-up items, or real
                     ones removed from it before any round or fix check that would read them, round F
                     included, so reading stays cold)
  lessons.md         project lessons (the format in references/learning.md)
  judgments.jsonl    one line per changed verdict per round, for this folder's rounds (a discovery pass's
                     verdicts go in S/discovery/judgments.jsonl):
                     {date, unit, round, id, was, now,
                      by: owner|reader|spot-check|fixcheck|sweep|audit|extract,
                      reason, lesson, backprop: [ids re-judged]}
  cross-unit-edits.txt    edits in units not yet closed, made from another unit's round
                          (unit, id, verdict, refuter, source unit+round, commit, and for a fix a note on
                          why exclusivity is or isn't the item's point). The verdict is "wrong" for a fix
                          (refuter: file:line or ruling id); "ok" for an edit to an item right at the pin,
                          which is no find (a revert, refuter: its fixlog entry's ruling; a dependent made
                          stale only by a fix's new text, refuter: the changed item's id); or "deferred" for
                          a hit or re-judge left to that unit's round (refuter: the hit's file:line, or the
                          lesson or ruling the re-judge follows; no commit). A "deferred" line also has
                          status open|settled (round, date)
  closed-unit-leads.txt   matches in closed units (unit, id, kind wrong|revert|stale|re-judge|evidence-moved, class,
                          refuter: a refuting file:line, a ruling id or a judgment reference (stale: a dependent another unit's fix made stale, class none, refuter the changed item's id; re-judge: a back-propagation re-judge, class the flaw's class (or none), refuter the lesson or ruling it follows, as in cross-unit-edits.txt; evidence-moved: what reached the item (a changed file it cites, the search whose hits changed, the diff lines that touch its claim, or "counted in") and the pin decision id; class none; source the pin decision), source unit+round (or an outside review and its date, or the decision id of an answer or a new or amended ruling), ruling-level: yes|no,
                          status open|settled (round F, date))
  defects.md         `defect` verdicts (behaviour defects and unmet requirements), in the entry form of
                     references/debugging.md (expected, actual, reproduction, root cause, proposed fix,
                     prevention), and code faults noticed while
                     fixing, for the owner; each line names
                     its unit and item ids ("none" for a gap no item covers), and is open or closed (with the
                     owner's decision id)
  owner-questions.md the open owner questions: the setup census from every governing document, and each ask
                     made since (with the date asked and the unit and item ids that wait on it), each with its decision
                     id (R-n or P-n) once answered
  owed-rechecks.txt  items owed to an external reviewer: every item a stand-in judged, every fix made on its
                     finds (references/modes.md), and categorical value changes (references/fixing.md, section 5),
                     each with status open|settled (date)
  boundaries.md      near-misses: items confirmed ok only after real doubt, added by the writer at round
                     step 3 and re-judged by a stronger reviewer at round step 5
  canaries.jsonl     planted test items, written by the writer; never copied into items or any repo, and kept
                     out of any commit of S/ (.gitignore, with every canary-plan.json, canaries-src/ and the rounds' scratch/
                     folders; ltz canary gitignore checks it)
  canaries-src/      the writer's source files for `ltz canary add --from` (same rules as canaries.jsonl)
  writer.lock        the writing session (ltz lock)
  HANDOFF.md         one current paste-ready prompt to resume in a new session: use this skill (its name and folder), read S/loop.md, take over the
                     writer's lock, run `ltz queue <S> <unit> <R> status` for each open round (while discovery runs, <S> for the lock and the queues is S/discovery), re-read the lessons, the decision log and S/classes.md (solo: after the reading). If an earlier handoff was saved elsewhere (memory, a dated copy), mark that one SUPERSEDED at its top. Update it after every round.
  items.jsonl        the extracted items (stable ids)
  inputs/            outside findings (audits, reviews), closed to readers
  checks/            the project's extract script and any project checks
  checks/patterns/   class patterns (JSON); those marked "regression": true are re-run by ltz diffcheck
  discovery/         the discovery state folder, if discovery runs: the tools read it as the state folder
                     (references/setup.md, step 9); lessons, defects, owner questions and
                     cross-unit-edits.txt stay in S/
  known-wrongs.txt   items a `closed-known-wrongs` unit closed with, and ranges dropped by override, for the final
                     targeted check: one line each, with the date and status open|settled (round F, date). A known
                     wrong's line has unit, id, refuter, decision id and the drafted fix's path
                     (<unit>/r<R>/drafts/<id>.md, if any); a dropped range's has unit, round, slot, positions
                     from-to, the range's first and last item ids, and decision id
  inputs/audit-map.json   outside findings mapped to item ids (closed to readers)
  evidence/<date>/   a dated export or text conversion, if the evidence is live or not text: read-only once
                     pinned by its sha256 in config.json's evidence (type dir), and named in the readers' paths
  <unit>/r<R>/       one folder per unit and round (r0 is the cost-measurement read):
                     snapshot.jsonl + snapshot.sha256, pin.json (the evidence pin this round reads),
                     classes.md (the bar's copy for this round), precedents.md (its copy of S/precedents.md, if
                     one exists), list.json,
                     chunks.json,
                     window files (w-<slot>-<from>.txt), render-<slot>.jsonl logs, agent-<slot>.jsonl, queue.json, canary-plan.json,
                     confirmed.json (the find list), report.json (per item: verdict, note, cites_read),
                     spotchecks.json (the random spot-check picks and their seed, from ltz spotcheck),
                     measure.json, fixlog.jsonl (id, unit for a cross-unit edit, field, old, new, search, hits, judged, blindSpots, scopeNote, scopeText, ruling, basis and source for a requirement item),
                     fixcheck-<K>-<part>-input.jsonl, fixcheck-<K>-<part>.jsonl, retro.md,
                     drafts/<id>.md (fixes drafted before they may be applied), briefs/<slot>.md (each filled
                     brief as sent; a fix checker's is briefs/fixcheck-<K>-<part>.md), scratch/<slot>/ (one per agent, and scratch/writer/ for your own probes; never committed)
```

**Verdicts:**
- `ok` and `wrong`, from readers;
- `pending-owner`, `defect` and `outside-bar`, recorded by the writer only. None counts as a wrong.

**Checkpoints:** if `S/` is under version control, commit it after every round. If not, copy it to a dated
folder outside every repo (beside `S/`, when `S/` is outside them).

## loop.md skeleton
```markdown
# <loop name>
Terms: unit = <the repo's word>; item = <the repo's word> (sources in research.md)
Evidence: <what the items are judged against>, pinned at <tag/commit/dated export>
Evidence boundary: <what counts; what is excluded>
Zero: <what it is for>; `rule-meaning` questions block close: <yes|no>; escalation trigger: <rule>
Item type: <describes evidence | states requirements>; defects block close: <yes|no>; softening: <yes|no>
Units: <id: item count, status open|closed|closed-leads-pending|closed-owner-questions-open|closed-known-wrongs|closed-by-stopping-rule|final-check (date, round, and the pin a closed unit closed at); for closed-leads-pending and final-check, "was <status>": the closed status it returns to (references/round.md, "Closed statuses"), which final-check carries forward from closed-leads-pending; and any note references/round.md adds: "checked at <new pin>, round F", "known wrongs fixed in the final check (date)", or the open rule-meaning questions of a unit closed by an override or a stopping rule, or left open by its round F>
Unit order: <ids in order>; the next unit waits for the owner's go: <yes|no>
Rulings: <ids with one-line summaries; the decision log is the master copy>
Reader mode: <solo | N readers per chunk | external>; chunk ≈ 70 items; concurrency cap <n>; probes <yes|no>
Fix-checker mode: <agent | fresh session | self-check after reset | external>
Canaries: <per reader per round, or off>; hooks: <on (project settings) | off>
Bar: <open | frozen at round R (owner, date)>
Cross-unit policy: <as decided>
Gate: <the commands that must pass before a fix commit: extract, ltz diffcheck (never with --no-verify-searches), the project's own checks>; branch <name>; approver <who>
Trend: <unit>: r1 <n>, r2 <n>, … (adjusted written "n (adj m, reason, date)")
Cost: per agent: startup <a>, per item <b> (floor), context re-reads <c>; measured per round <list>
Next step: <one line>
```
