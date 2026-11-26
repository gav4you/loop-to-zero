---
name: loop-to-zero
description: Use when a body of items (doc ledger rows, spec claims, parity requirements, audit findings, test expectations, policy statements) is verified and fixed in repeated rounds until one full pass finds zero wrong, grouped into units called waves, slices, batches, phases, modules, chapters or areas; when findings keep coming back round after round; or when asked to "loop to zero", re-verify until clean, or close a unit. Not for running a command on a timer.
---

# Loop to zero

**If you are a reader or a fix checker that a loop's writer launched, do not use this skill.** Follow your
brief only. This skill holds the lessons and the reading design, and reading them would break the cold read
you were launched to do.

A unit closes only when one full pass over all of its items finds 0 wrong. Each round has four parts:
- **read:** cold, full coverage;
- **fix:** narrowly, with a sweep by class;
- **check the fixes;**
- **learn.**

Every correction to your judgment becomes a lesson. Each lesson is applied forwards, and also backwards to
the earlier verdicts and edits it could have spoiled. **The owner's decisions override everything here,** through the paths this skill gives them: bar rulings, and
process decisions such as an approved stopping rule or an override.

## Terms
Map the project's own words onto these, and use the project's words with the owner.

| Term | Meaning |
|---|---|
| owner | The person who decides for the project. |
| writer | You: the only one who records, fixes and commits. |
| unit | What closes. The project may call it a wave, slice, batch, phase, module, chapter or area. |
| item | What is judged: a row, claim, requirement, statement or test. |
| round | One read, fix, check and learn cycle on one unit. |
| pass | One read of every item in a unit from one snapshot. It counts toward zero only at full depth. A discovery pass is one such read of every unit. |
| chunk | A range of about 70 items. Each of its readers is one job. |
| part | A fix-check part: a split of a fix set into about 70 changed items, one fix checker each, named `p1`, `p2`, ... (`fixcheck-<K>-<part>`). Not a chunk. |
| window | The items a reader renders at once, about 16. |
| evidence | What the items are judged against. It is fixed at a **pin** (a tag, commit or dated export) and limited by the **evidence boundary** (which kinds count). |
| bar | What counts as wrong, kept in `classes.md`: the approved classes, the accepted-by-ruling entries, the three lenses, the universal words, "When two classes fit", "Accepted forms" and any reader guidance. Open: classes found later are added and reported. Frozen: no new classes after a stated round (owner rulings still enter); a wrong outside the classes in snapshot text goes in `confirmed.json`'s `outsideBar` list (not a false alarm) and is listed for the owner, not counted. |
| class | A named kind of wrong, with a definition and a fix form. |
| sweep / seed | A search over every item for one class. The seed is the confirmed wrong that starts it. |
| refuter | The file:line at the pin that shows an item wrong. A lead or a `cross-unit-edits.txt` line with no such line (a revert, a stale dependent, a re-judge, a pin move's reach) holds instead what its format in `references/state-template.md` gives. |
| cold | Reading without earlier verdicts, fix reasons or lessons. |
| union | Every wrong that any reader of a chunk marked. |
| find list | `confirmed.json`: the round's confirmed wrongs. |
| fix checker | A cold reader of the items a fix changed. |
| gate | The scripts that must pass before a commit is accepted. |
| discovery | Repeated pre-loop passes over every item under the three lenses. They end at zero or when the owner says. |
| lead | An item in a closed unit that needs action (such as a sweep match, a revert, a dependent another unit's fix made stale, an amended ruling's item, an outside review's find, or one a pin move reaches), logged in `closed-unit-leads.txt` rather than edited. |
| adjusted | A past count restated after a verdict changed, written `n (adj m, reason, date)`. |
| canary | A planted test item (known wrong or known ok), shown only inside readers' windows. |
| ruling / decision log | A ruling is an owner decision about how items are judged (a bar ruling, numbered like `R-n`). A process decision (`P-n`) covers how the loop runs, including the close rules and the approval of the class set (its content is `classes.md` itself). The decision log holds both, verbatim, and is the master copy. Readers never open it. |
| zero rule | A unit closes only on a full-depth pass with 0 confirmed wrongs. |
| ruling-level lead | A lead that would change what a ruling permits. It goes to the owner at once ("Cross-unit effects", below). A lead whose refuter is a ruling id, such as a revert under a ruling, is not one. |
| supplementary read | A fresh reader of the round's kind (a new agent; a fresh run of the external reviewer when it is the reader mode; in solo mode, you after a context reset: `references/modes.md`) re-reads a range whose reader skimmed. Like a re-run of a range whose cites were never rendered (or of a reader's whole range after it trimmed its cites), it is recorded with `ltz queue rerun` (`references/queue-and-outages.md`). |
| named item | An item the new text of a fix names, given to the fix checker for context. |
| snapshot | The unit's items frozen at a round's start (`snapshot.jsonl`, hashed). Readers judge it. |
| full depth | Every item read in full, with every cited line rendered. Never filtered, tiered or skimmed. |
| skim | What a reader did when it misses a canary, admits shortcuts or unchecked areas, or `record` flags its ok notes as templated. A supplementary read comes before the pass counts: of the reader's whole range (its slot's FROM to TO, short of any tail the owner dropped) after a canary miss or templated notes, and of the ranges it names after admitted shortcuts (its whole range when it names none). A late fall in lines read per item alone is not a skim: that reader gets extra spot-check picks, and the next snapshot shorter chunks (`references/round.md`, step 3). |
| measure / found by none | `measure.json`'s counts. "Found by none" means confirmed by the writer's own check (`spot-check`, which also covers a raise no other value names, such as a stronger reviewer's), a sweep, a mapped outside finding (`audit`), the fix checker in old text (`fixcheck`) or the extract (`extract`), not by any reader. |
| r0 | The setup's cost-measurement read of one window. Its verdicts don't count. |
| stopping rule | An owner-approved condition for closing a unit other than a zero pass. A unit closed that way is `closed-by-stopping-rule`, unless it closes with a confirmed wrong unfixed or over a dropped range (then `closed-known-wrongs`: `references/round.md`, "Closed statuses"). |
| hint | Same as reader guidance. |
| rule | In the `rule-meaning` exception: a verification rule (the text the briefs quote as `{RULES}`: the project's own, or `S/rules.md` when drafted at setup) or a bar ruling's text. A dispute over a class's wording is not one: it is a bar-wording change (`references/learning.md`, "Changing the bar's wording"), and the item goes through the confirm checks meanwhile. |
| outside finding | An audit's or review's finding, mapped to items and confirmed as `foundBy: "audit"` (`references/setup.md`, "Existing outside findings"). Not an outside report: a user report, ticket, incident note or log, which is only something to reproduce (`references/debugging.md`). |
| origin | Where a wrong came from: pre-existing text, your own edit, a new class, a missing ruling, writer misjudgment (a verdict of yours later overturned; `references/learning.md`), or evidence moved (only a new pin refutes it; `references/round.md`, "Between rounds only"). |
| writer's lock | `S/writer.lock`: only one session writes to a loop (`ltz lock`). |
| session | One Claude Code conversation. The writer and each agent count as separate sessions: each has its own context. Under the writer's lock an agent the writer launches is not the writer, though Claude Code runs it under the launching conversation's session id; a writer that itself runs as an agent holds the lock by its agent id (`scripts/hooks/README.md`, "Who the holder is"). |
| handoff | `S/HANDOFF.md`: the paste-ready prompt to resume in a new session. |
| hand-back | In solo mode, and after a fix check run in a fresh session or as a self-check: the point where the writer's steps resume after the round's reading sessions, or after a fix-check session (`references/modes.md`). |
| item type / softening | Whether items describe the evidence or state requirements, and whether fixes may hedge ("such as"). Both are setup questions. |
| hooks | An optional guard (`scripts/hooks/`) that refuses unsafe commits and edits. |
| job / slot | One reader's run over one chunk, and its name in `queue.json` (opaque, from `queue init --opaque`, so a reader can't infer another). A fix checker is not queued: it renders under the name `fixcheck-<K>-<part>`, where `<part>` names a part of the fix set (about 70 changed items), and its cost is counted with `ltz cost <transcript>`. |
| stronger reviewer | A more capable model or advisor, used if available to re-judge the find list. It is a second opinion, not a cold read, and never replaces the fix checker. |
| external reviewer | A model that is not a Claude agent, used as the reader mode: it reads the chunks, checks the fixes, or both, as the owner set at setup question 6, under the same briefs (`references/modes.md`). Not the stronger reviewer. |
| sibling / family | Items that share a class, subject, cited range or named file with a confirmed wrong. |
| history check | The confirm check that looks an item up in its earlier verdicts and this round's other reader's, reasoned oks as well as wrongs (`references/fixing.md`, "History"). |
| reasoned ok | An ok whose note says why the claim holds: the claim tested hardest and the line that holds it. A blank note, or one text repeated across items, is not one. |
| flip | A field returning to a value it held in an earlier round (`ltz flips`). |
| probes | Running the code (or a config loader or parser) in a scratch copy to test a claim, if the owner allows it. |
| reader guidance | Notes that state what to bound, carried to readers only in `classes.md`'s "Reader guidance" section. Never new facts. |
| hedge | Opening a claim with "such as", "for example", "e.g." or "among others" (softening). Stating a proven scope ("outside tests") is not a hedge. Subtraction (dropping a false or unproven clause) is never softening, and is always allowed for descriptive items. A requirement item is never narrowed to fit the evidence (a copying error from its own source is fixed: `references/fixing.md`, "Requirement items"). A qualifier like "probably" fixes nothing. |
| context reset | A fresh session, or the owner clearing the conversation. What follows starts from `S/HANDOFF.md` (the writer's steps resume) or from the brief of a cold read it runs (such as a solo reading or a fix-check self-check). The writer can't reset itself mid-session: when a step calls for resets, it first gives the owner their order, each with its first prompt, through to the one that resumes from `S/HANDOFF.md`. |
| final targeted check | After every unit closes (or sooner, between rounds, if the owner asks: `references/round.md`, "Between rounds only"), with the owner's OK per unit: the unit is reopened as `final-check`, and its round F reads its dropped ranges and the chunks holding `evidence-moved` leads, confirms its other `wrong` leads, judges its `re-judge` leads, and applies its `revert` and `stale` leads, fixes the real ones, applies its known wrongs' held drafts, and fix-checks them. It then returns to the closed status `loop.md` kept for it ("was <status>"), unless a hold in `references/round.md`, step 8, applies: a lead logged since its snapshot still open, an owner question that blocks a close, or an open defect for the unit when `defectsBlock` is set. |
| escalation trigger | The owner's rule for when a stalled loop goes back to them (setup question 0). |
| `boundaries.md` | Near-misses: items confirmed ok only after real doubt (`references/round.md`). |
| `ltz` / `<skill>` | `node <skill>/scripts/ltz.mjs`, where `<skill>` is this skill's folder. |

**Verdicts:**
- readers give `ok` or `wrong`;
- the writer may also record `pending-owner` (an item one of the three exceptions below sends to the owner), or `defect` (a
  behaviour defect in the evidence itself, or a requirement item the evidence doesn't meet), or `outside-bar`
  (a wrong outside a frozen bar, listed for the owner). None counts as a wrong.
- **An item the evidence plainly refutes is always `wrong`** (or `defect`, when it states a requirement the
  evidence doesn't meet, a policy its config differs from included: see `defect` above), even on a repeat, when the refuter is inside
  the bar (on an open bar, a class found mid-pass included) and the evidence boundary. It is never parked as `pending-owner`. Three exceptions make it
  `pending-owner`, each recorded with a `pendingReason`:
  - a rule's meaning is in dispute (readers and writer read it differently, or its own text admits two readings), and
    the item's truth turns on that meaning (`rule-meaning`);
  - the boundary is silent on the refuter's kind of evidence (`boundary-silent`);
  - a ruling approved the refuted wording (`ruled-wording`). The ruling wins for its point: readers mark it ok
    with a "ruled:" note (`references/briefs.md`), and the writer records `pending-owner` with the question
    "amend <ruling>?" until the owner amends or keeps it.

  `boundary-silent` and `ruled-wording` items always block a close, because the evidence refutes them;
  `ownerQuestionsBlock` governs only `rule-meaning` items. These apply in the order of `references/fixing.md`'s
  confirm checks: rulings first, then the boundary, then an
  earlier (or same-round) reasoned ok the new wrong can't answer, then the refutation.

**Owner overrides.** If, after one challenge, the owner still chooses to close a unit that holds a known
wrong:
- the decision log records it as "knowingly amends the zero rule", listing the items;
- the unit's status is `closed-known-wrongs`, which is never reported as clean, even after the final targeted
  check fixes its known wrongs (it never had a zero pass);
- those items, and any dropped range (a reader's range dropped unread, with a decision id, `P-n`, even where
  another reader read it), go to `S/known-wrongs.txt` for the
  final targeted check. By default the remaining reading still finishes, and its finds are logged there too.
  Dropping a range still unread is its own question, with its own decision id.

A close the owner chooses over a dropped range alone, with no known wrong, takes the same path.

While the override question is open, the items stay `wrong` (not `pending-owner`). Draft their fixes in the round's
`drafts/<id>.md`, but hold the commit until the owner answers. If the owner closes the unit, the drafts wait for
the final targeted check: a closed unit is never edited.

A costed options message that names the risk counts as the one challenge. A wish asks for an outcome ("close
it", "park it"); a ruling decides a rule, a scope or a definition.

**Paths:** `S/` is the state folder, and `S/<unit>/r<R>/` is a round folder.

## Files
| File | What it covers |
|---|---|
| `references/setup.md` | Setup order, the repo research, the questions |
| `references/round.md` | Each round in detail, mid-round rules, closing |
| `references/learning.md` | Triggers, lessons, back-propagation, retro, promotion, replay |
| `references/briefs.md` | The reader and fix-checker briefs, and verifying their work |
| `references/modes.md` | Agents, solo or an external reviewer |
| `references/queue-and-outages.md` | Sizing, the queue, limits, cost |
| `references/fixing.md` | Confirm checks and fix steps |
| `references/debugging.md` | Working a `defect`: reproduce, isolate, diagnose, propose; the `defects.md` entry |
| `references/reading-classes.md` | The starter classes, the three lenses, the universal words |
| `references/owner-asks.md` | Asking, recording rulings, reporting |
| `references/state-template.md` | The state folder |
| `lessons.md` | The global lessons (read at setup and every round) |
| `scripts/` | The tools: `node <skill>/scripts/ltz.mjs <command>`, tested by `node <skill>/scripts/test/run.mjs` |
| `tests/` | The skill's own tests: re-run the ones `tests/README.md` names for each edit to SKILL.md, `references/` or `scripts/`. A lesson promotion is tested by its replay, and still runs `skillcheck` |

## Setup checklist (`references/setup.md`)
Nothing is edited and no counted reader runs until the owner has answered. Only r0's test read may run (its reader, and an external reviewer on the same window when that mode is offered).
1. Read both lessons files.
2. Create `S/`, take the writer's lock (`ltz lock <S> acquire`: `--session auto` if the guard hook is installed,
   otherwise an id of your own; `references/setup.md`), then create a provisional decision log, `loop.md` and
   `HANDOFF.md`.
3. Explore read-only, and count the items.
4. Build `S/config.json` and the extract script. Run the tools' own tests and the extract script's tests,
   then extract the items with stable ids. To adopt a loop that already runs, also map its round files into
   `S/<unit>/r<R>/` here, so step 5 can replay its history.
5. **Research the repo, then predefine the names and classes.** Use the repo's own words, and five sources
   for the classes. Each class gets its record (`references/setup.md`, "Each class records") and is replayed on any
   recorded history. If the evidence is live or not text, settle question 5's pin and export scope and take the
   export or conversion first (the boundary is asked later, with the research) (`references/setup.md`, step 6).
6. Measure one test reader on one window, in r0/.
7. **Ask the setup questions:**
   - what zero is for, and the zero definition;
   - whether questions about a rule's meaning block a close;
   - the escalation trigger;
   - the names, classes and drafted verification rules, and the rulings logged from the governing documents;
   - discovery first (with a pass cap), the unit order, and whether the next unit waits for the owner's go;
   - item type (with granularity, if still open), and whether open defects block a close (and, if a tracker is
     connected, whether defects may be filed as tickets);
   - softening;
   - the evidence boundary and pin;
   - the config-to-policy mapping (question 5a);
   - the reader mode, readers per chunk, concurrency, the fix-checker mode and probes, and, if the owner decides
     against subagents, whether a fresh session the owner opens counts;
   - canaries, hooks and masking;
   - an open or frozen bar;
   - the cross-unit policy;
   - the decision log, branch and approver, and whether `S/` goes under git or gets dated backups;
   - push and publish.

   Recommend; never default.
8. Pin the evidence. Complete `loop.md`, the decision log and `classes.md`, and write the handoff. Bar rulings (ids like `R-n`) each get an
   accepted-by-ruling entry (`ltz rulings` checks that each id appears in that section). Process decisions (`P-n`: canaries, readers, concurrency) never
   enter `classes.md`, because readers read it.
9. Run discovery if approved, then start round 1. An adopted loop runs no discovery: it continues from its next round, and
   changes practice only at a round boundary with the owner's OK.

## Round checklist (`references/round.md`)
1. **Start:** take the writer's lock; snapshot, which also copies the bar, lists and chunks; queue; plan the
   canaries.
2. **Read:** cold readers in the owner's mode. No item file is edited or committed until the reading is done (fixes are
   drafted in `drafts/<id>.md`).
3. **Verify:** coverage from the files; confirm every wrong in the union (`references/fixing.md`), and judge the
   cite groups `ltz crosscheck` flags and this unit's open `cross-unit-edits.txt` lines with verdict "deferred"
   (`references/round.md`, step 3); write the find
   list and run `record` (it scores the canaries); give any supplementary reads; spot-check 10 oks per reader, add
   their finds and run `record` again. Work each new `defect` through
   `references/debugging.md`, and never edit the evidence.
4. **Fix:** sweep, fix the seed and hits, fix dependents, re-read, re-run extract, diff check, commit. Then
   re-record the measure with the sweep's finds counted as "found by none". Finds in other units go to
   their logs, never into this unit's find list.
5. **Check:** the fix checker reads every changed and named item; follow-ups are checked until a check
   returns 0. A stronger reviewer, if available, re-judges the find list, the `rejected` list, the wrongs
   dismissed in `retro.md` (`references/fixing.md`, "The confirm checks" and "After the fix checker"), the
   `restated` list and the near-misses in `boundaries.md`.
6. **Learn:** the retro (`references/learning.md`).
7. **Report:** update `loop.md`, the handoff and memory, and report to the owner in the order of
   `references/owner-asks.md` ("Reporting a round"). It is information, not a stop.
8. **Close** only on a full-depth pass with 0 confirmed wrongs (other conditions in `round.md`). Otherwise
   start the next round, unless a re-read can't clear what blocks it (`references/round.md`, "Blocked only by
   what a re-read can't clear"): then wait for the owner.

## Cross-unit effects
- **Units not yet closed** (a unit in `final-check` counts as closed here and in every cross-unit rule of the
  references, though the tools treat it as open) may be edited from another unit's round, such as for a sweep hit. Log each edit in `cross-unit-edits.txt` (the line carries
  the verdict and the refuter). The round's fix checker reads those items with the rest; that unit's next round
  then reads them normally. A unit with no snapshot yet (r0's doesn't count) needs a baseline before the first such edit:
  `ltz snapshot <S> <unit> 1`, which that unit's round 1 takes again when it starts. Re-take it only after the
  editing round's last `diffcheck` and commit (its fix checks' follow-ups and any reverts included), or that diffcheck fails on its own logged edits.
- **Units whose round 1 hasn't started** may instead have their hits logged for them, verdict "deferred", in
  `cross-unit-edits.txt`, if the owner chose that at setup (`references/setup.md`, question 8; never during
  discovery, whose fixes edit every unit). That unit's
  round step 3 judges them. They are not leads, which only closed units have. Back-propagation's re-judges in any
  other unit not yet closed are logged for it the same way, whatever the policy (`references/learning.md`,
  "Back-propagation").
- **Closed units** are never edited. Log each match as a lead.
  - Leads are deferred under the recommended policy, once the owner decides it.
  - A final targeted check handles all leads after every unit closes (or sooner, between rounds, if the owner asks).
  - A lead that would change what a ruling permits goes to the owner at once. Items in open units that depend
    on the answer (it would change their verdict, or the wording of their fix): `ruled-wording` where the evidence refutes wording the ruling approved; `rule-meaning` where
    the item's truth turns on the ruling's meaning; an item plainly refuted otherwise stays `wrong`, with its
    fix drafted and held.

## Red flags: stop
| Thought | Reality |
|---|---|
| "One wrong left, close it anyway" | Closing needs a full-depth pass at 0 |
| "Stitch this round's partial pass to the last one" | A pass is one full read of one snapshot |
| "This pass skimmed the tail; it still counts" | Only a full-depth pass counts: re-read the skimmed range with a supplementary read first |
| "The reader stopped at the limit; relaunch it fresh" | Continue it. Launch fresh only in the cases `references/queue-and-outages.md` lists ("When a fresh launch is allowed") |
| "Commit fixes while a reader is still reading" | Readers judge the snapshot |
| "Copy the item's cites into cites_read", or "fill a missing item myself" | The coverage check would pass while checking nothing |
| "`grep \| head` is enough" | Truncation at any layer hides the refuter |
| "Change 'only A' to 'only A and B'" | That is a new universal. Prove it with an unlimited search, or rewrite it without the universal word (subtract, or hedge if softening is allowed); a list of 3 or more with no hedge word still needs the logged search (`references/fixing.md`, "5. The diff check") |
| "The sweep for the fixed wording came back clean" | That proves no regression. Sweep by subject, cite and file |
| "I read the diff; the fix is fine" | Open every named item, and every field of the changed item |
| "My fix is obviously right; skip the fix checker" | Your own clauses are the most-missed wrongs |
| "It was flagged again; park it with the owner" | If the evidence plainly refutes it, your earlier fix failed or an earlier pass missed it (after a pin move, a repeat only the new evidence refutes is neither, and logs no lesson: `references/fixing.md`): it is `wrong`, so fix it and log a lesson. Only the Verdicts exceptions go to the owner: a dispute over a rule's meaning, a boundary silent on the refuter, or wording a ruling approved |
| "The option conflicts with a past ruling; leave it out" | Offer it as "amend <ruling>" |
| "Make up a class now" | Classes come from repo research; a new one also logs a lesson |
| "Freeze the bar to finish faster" | That is the owner's call |
| "The count rose, so the fixes are failing" | Check the origins first; usually the bar moved |
| "Launch every reader at once" | They all stop at the same limit. Launch up to the owner's concurrency cap (recommend starting at one chunk's readers, 2 for a pair), with the rest queued |
| "Tell the readers about the canaries or the other reader" | That breaks the measurement |
