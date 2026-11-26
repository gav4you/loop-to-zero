# Each round in detail

Tool commands are `node <skill>/scripts/ltz.mjs <command>` (see `scripts/README.md`).

## 1. Start
- **Hold the writer lock:** `lock <S> acquire` (`--session auto` with the guard hook; without it, an id of your
  own). Only one session writes to a loop. A new session takes over with `lock <S> release` by the old session (or
  with the id `S/writer.lock` names), then `lock <S> acquire`.
- **Re-read both lessons files and `S/classes.md`.** In solo mode, once the snapshot and queue below are made,
  read each chunk in its own session after a context reset, with that chunk's filled reader brief (`r<R>/briefs/<slot>.md`) as the first prompt, chunks in
  order, not `S/HANDOFF.md`, which leads to `loop.md`. After the last chunk's session, the writer's steps start
  after another context reset, from `S/HANDOFF.md` (the briefs' limits end with the reading sessions). Run the handoff's
  resume steps and re-read the lessons only after step 2's reading, before step 3, so the reading stays cold.
- **Snapshot:** `snapshot` writes `snapshot.jsonl` and its hash, copies `S/classes.md` into the round folder
  (readers use that copy all round), writes `list.json`, and cuts the list into `chunks.json` (about 70 items
  each, on window boundaries; positions are counted from 1). It refuses once anything in the round has been
  rendered. Later tools refuse a snapshot whose hash no longer matches. If `S/precedents.md` exists, copy it to
  `r<R>/precedents.md` yourself before any reader starts: readers use that copy all round (a real item removed from `S/precedents.md` for a fix check
  that would read it is removed from this copy too), and a precedent the owner approves mid-round waits for the
  next round's copy, as an approved bar wording does
  (`references/learning.md`, "Changing the bar's wording", step 3).
- **Queue:** each chunk's readers are one job each, queued together with `queue init`
  (`references/queue-and-outages.md`).
- **Canaries, if the owner approved them** (never in solo mode, where the writer is the only reader):
  `canary plan` places one or two planted items per reader in their windows only (see "Canaries" below).

## 2. Read
- Readers read cold and cover every item, in the owner's mode (`references/modes.md`), with the briefs in
  `references/briefs.md`.
- No item edits are committed in any unit until the round's reading is done. Decision-log entries may be
  committed at any time; the guard allows a commit that holds no item files.
- **Read-only work may run during the reading,** in agent or external-reviewer mode: confirming wrongs already reported,
  weighted spot-checks of readers already done (a pick on a line a supplementary read later replaces is drawn
  again in step 3; the random draw waits for step 3), sweeps to find hits, and drafting fixes in the round's `drafts/<id>.md` (applied after the
  reading). No item file is edited or committed. While Claude agents read (agent mode, or a stand-in for the external
  reviewer), during a known limit wait this work spends the same limit: save
  state first, then only confirm the wrongs already reported (reading the files the confirm checks need, such as
  earlier fixlogs, is part of that). Spot-checks, sweeps, drafts and the search for a refuted universal's other refuters (`references/fixing.md`, "The
  refuter") wait for the reset; a local tool run you
  don't read hit by hit (`ltz queue status`, `ltz sweep --count`) is fine.
  Whoever is reading (the reader agents, or you in
  solo mode) finishes the current window before stopping or turning to other work, so positions end on multiples of
  the window size. In solo mode, run sweeps only after your own reading
  is done, so their hits don't colour items you haven't read yet. A count-only check (`ltz sweep` hit counts,
  not the hits) is allowed mid-read. If a sweep did show you unread items, re-read them
  after a context reset, as a re-run of their range (`references/modes.md`), before step 3 (`record` and the
  spot-check draw wait for it), and note them in `retro.md`.
- **Reading order.** Readers keep list order, so chunks stay contiguous.
- A reader stopped by a limit, or stopped early with a resume position, is continued. Its range still counts
  as part of the pass.

## 3. Verify
In this order (the checks of the readers' work are `references/briefs.md`, "Verifying the readers' work"; the cite
groups and the deferred lines below are this step's own):
- coverage, computed from the files;
- confirm every wrong in the union with the confirm checks in `references/fixing.md`, and the unit's mapped
  outside findings that no reader marked (`foundBy: "audit"`; `references/setup.md`, "Existing outside findings");
- run `ltz crosscheck <S> --unit <unit>`: it lists the cites two or more items share and flags those whose
  items state different numbers. Readers see one window at a time and never compare items, so judge each
  flagged cite group together, at the evidence, whether or not it holds a confirmed wrong;
- handle this unit's open lines in `S/cross-unit-edits.txt` with verdict "deferred" (hits another unit's round
  logged for it, and back-propagation re-judges logged for it: `references/learning.md`, "Back-propagation"; a
  discovery pass leaves them to main round 1: `references/setup.md`, step 9): judge each with the confirm checks, add a hit confirmed wrong that no reader marked to
  `confirmed.json` (`"foundBy": "sweep"` for a logged hit, `"spot-check"` for a back-propagation re-judge, or `"sweep"` when its `ltz sweep` run found it: `references/learning.md`, "Counting"), make any reverts they call for in step 4, and mark each settled (round, date);
- write `confirmed.json` (the find list) and run `record`: it writes `report.json` and `measure.json` and, once
  its checks pass, prints the canary scores. Give any supplementary read not yet given, before the spot-check
  draw: a reader that missed a canary gets one ("What a miss shows", below; its score shows only now), and so
  does one whose ok notes `record` flags or that admitted shortcuts (these show at coverage, and their reads may
  start then: `references/briefs.md`). Confirm the wrongs a supplementary read marks, as above, and run `record`
  again;
- spot-check 10 ok items per reader: 5 at random, and 5 weighted toward items an earlier fix changed and
  toward classes that produced wrongs. Draw the random 5 with `ltz spotcheck <S> <unit> <R> --seed <N>`, once
  any supplementary read is done (a rerun slot's file gets random picks of its own): it spreads them over each
  reader's early and late positions and records the picks and seed in `spotchecks.json`. A reader's 5 weighted
  picks come from the lines `record` uses for it (a rerun's in place of its own, in the rerun's range); a rerun
  slot gets no weighted picks of its own. A reader that missed a canary also gets more random picks on the rerun
  slot's file (`--extra <rerun slot>=5` gives it 5 more random picks than its own 5). Before the draw, take
  each reader's depth from its render log (extra lines read per item: `scripts/README.md`, "File formats"),
  over the early half of its windows and over the late half. A reader whose late depth is under half its early
  depth, with no other sign of a skim, only reads less deeply late: it gets `--extra <slot>=5`, and the next
  round's snapshot gets shorter chunks (`snapshot --chunk-size`). Note the weighted picks and why in `retro.md`;
- add the spot-checks' finds to `confirmed.json` (`"foundBy": "spot-check"`) and run `record` again.

## 4. Fix
Follow `references/fixing.md`:
1. sweep;
2. fix the seed and the hits;
3. fix the dependents;
4. re-read;
5. `diffcheck`;
6. commit.

Add the sweep's confirmed finds, and finds from a whole-unit re-read, to `confirmed.json`
(`"foundBy": "sweep"`) as each is confirmed, before its fix. After the commit, re-run `record`, so the
measure counts them as found by none.

## 5. Check the fixes
- A cold fix checker reads every changed item (cross-unit edits included), and every item the new text names.
  Build its `--list` input file from the changed items (with `changed`, each edited field's `old` text included) plus the named items (without it).
- Fix its real wrongs as a follow-up commit, as `references/fixing.md` says (a find in old text is swept first), and
  check that follow-up too, until a check returns 0. Its finds in
  this unit's old text (snapshot text the fix did not change: a named item or an unchanged field) go into
  `confirmed.json` (`"foundBy": "fixcheck"`). An "old text held" find is not one: it overturns the fix's wrong
  (`references/fixing.md`, "After the fix checker"). Re-run `record` after every fix check, a clean one included: it reads the checker's
  result files (the fix-check counts, and any "ruled:" ok). A find in another
  unit's item is handled like a sweep hit there (SKILL.md, "Cross-unit effects", under the owner's cross-unit
  policy).
- If a stronger reviewer is available (an advisor, say), have it re-judge the find list, the dismissed reader
  wrongs in `confirmed.json`'s `rejected` list, the wrongs dismissed in `retro.md` (`references/fixing.md`,
  "The confirm checks" and "After the fix checker") and the near-misses in `S/boundaries.md` before the round ends. A wrong it raises that you confirm is handled like a
  fix checker's find (above), with `"foundBy": "spot-check"` where it goes into `confirmed.json`; one from the
  `rejected` list instead moves out of `rejected` into the wrongs with no `foundBy` (the reader's find, confirmed late). The writer
  adds to `boundaries.md` in step 3: an
  item confirmed ok after real doubt (a near-miss), with one line on why.

## 6. Learn
The retro, as in `references/learning.md`.

## 7. Report
- Update `S/loop.md` (trend, cost, Next step) and `S/HANDOFF.md`, and the runtime's memory if there is one
  (pointers only: it can load into every session, readers' and fix checkers' included).
  Commit a checkpoint of `S/` if it is under version control, or copy it to a dated backup if not (`references/state-template.md`, "Checkpoints").
- Report to the owner in the order of `references/owner-asks.md` ("Reporting a round"). It is information,
  not a stop.

## 8. Close or continue
The unit closes when one pass meets all of these:
- every item was read at full depth (a filtered or tiered pass never counts; a partly skimmed one counts only once supplementary reads have re-read every skimmed range);
- 0 confirmed wrongs;
- no `boundary-silent` or `ruled-wording` `pending-owner` verdicts (no close setting lets these through); and no `rule-meaning` ones, unless the
  owner decided (a process decision) that they don't block a close (see the closed statuses below);
- no open defect for the unit in `S/defects.md`, if the owner decided that defects block a close (check the file:
  readers mark ok an item that describes a code fault accurately, so the round's verdicts can miss one);
- none of its items edited after the pass read them (a past round adjusted to 0 included).

Before the close, judge as step 3 does each open "deferred" line in `S/cross-unit-edits.txt` logged for the unit
after its step 3. A wrong it confirms is a wrong of this pass, and a revert it calls for is an edit after the
read: either goes through steps 4 and 5, and the unit stays open.

**Blocked only by what a re-read can't clear.** When a pass's only blockers are `pending-owner` items, or open
defects when `defectsBlock` is set, and nothing was edited after it was read, don't start another round:
re-reading unchanged text can't clear a question or a defect. Wait for the owner's answer or decision. If the owner keeps the ruling (or the answer makes the item ok), the item leaves
`pending` (a kept ruled ok goes into `ruledKept`: `references/briefs.md`; a reader wrong the answer clears goes into
`withdrawn` with the answer's ruling id when the answer is a new ruling or a dated amendment; after a keep, or an
answer an existing entry already covers, it goes in `rejected` with the entry's `S/classes.md:<line>`) and `record` is re-run. Make any edits the answer calls for first
(`references/fixing.md`, "Carrying a ruling into the items" and "Reverting"); then that pass counts if it still meets the conditions
above. If the answer makes the item wrong, it is a wrong of that
pass: fix it and continue.
The same holds while any open owner question holds drafted fixes (such as an override question or a ruling-level lead):
a new round would read text known to be wrong. Wait for the answer, then apply the drafts (or close as the owner
chose).
A defect marked closed in `S/defects.md` by an owner decision no longer blocks, though that pass's `zeroBlockers`
may still count it. If a later round finds it again at the same pin, it stays closed: list the id in `confirmed.json`'s
`defects` as before, and don't log a new open entry without a new owner decision.

**Closed statuses:**
- `closed`;
- `closed-owner-questions-open`, if the owner decided that owner questions (`rule-meaning`) don't block and the
  closing pass left `rule-meaning` items open (with none, the status is `closed`). If a later answer makes one of
  its items wrong, log that as a lead (SKILL.md, "Cross-unit effects"). When the last of them is
  answered (`S/owner-questions.md` shows each one's decision id), the status becomes `closed`; if the unit is `closed-leads-pending` or `final-check` by then, its "was"
  status does. Only a unit closed on a zero pass takes this status: one that closes by an override or a stopping
  rule is `closed-known-wrongs` or `closed-by-stopping-rule` (below), which win, and its open `rule-meaning`
  questions are noted on `loop.md`'s Units line;
- `closed-leads-pending`, once a lead is logged against the closed unit. It stays that way until the
  final targeted check settles the lead, even one that has since become moot. `loop.md`'s Units line keeps the closed status it returns to ("was
  <status>", at first the status it replaced);
- `closed-known-wrongs`, if the owner chose to close by an override (SKILL.md, "Owner
  overrides"). It is never reported as clean;
- `closed-by-stopping-rule`, if the owner approved a stopping rule and it was met. It is reported as such,
  never as a zero. A unit that closes with a confirmed wrong still unfixed, or over a dropped range, is
  `closed-known-wrongs` instead (SKILL.md, "Owner overrides"), whatever rule closed it.

`final-check` is not a closed status: the tools treat it as open (the cross-unit rules count it as closed: SKILL.md,
"Cross-unit effects"). It marks a closed unit reopened, with the
owner's OK, for the final targeted check. The check runs as the unit's next round, F (a round that so far holds only a baseline snapshot is taken again as F): `ltz snapshot <S> <unit> <F>`
before any edit, then the reading of any chunk it queues (below) and step 3's checks of its readers' work, then
the fixes, `diffcheck` and the fix checker as usual. Just before setting it back (after any edits an owner answer
calls for, below), take a new baseline with `ltz snapshot <S> <unit> <F+1>`, so `diffcheck` doesn't flag the
final-check edits. Then set the unit back to the
closed status `loop.md` kept for it ("was <status>", carried forward from `closed-leads-pending`, never
`closed-leads-pending` itself), or to `closed-leads-pending` again, with the same "was" status, if a lead logged since
round F's snapshot is still open. A `pending-owner` verdict round F records that blocks a close, or an open
defect when `defectsBlock` is set, keeps the unit in `final-check` until the owner answers, as "Blocked only by
what a re-read can't clear" says. If round F confirmed any wrong (other than an "evidence moved" one, or a "missing ruling" one that a ruling amended or a question answered after the close made wrong: report those apart; and other than an id the closing count already holds: "Known wrongs", below), the unit is reported with its adjusted closing
count (`<closing count> (adj <closing count + n>, fixed in the final check, <date>)`), never as a clean zero. A `closed-known-wrongs` unit whose
known wrongs are all fixed stays `closed-known-wrongs`, with `loop.md` noting "known wrongs fixed in the final check
(date)". If a known wrong remains unfixed, follow SKILL.md's "Owner overrides" (one challenge, the owner's choice).
- **Round F needs readers only for a dropped range** from `S/known-wrongs.txt`, or for `evidence-moved` leads: queue just the chunks that cover them (a dropped range by its first and last item ids, not its old positions),
  read in the loop's reader mode even where another reader read it (`ltz queue <S> <unit> <F> init --opaque --per-chunk <readers per chunk> --chunks <chunk names, such as c2,c3>`; with neither a dropped range nor an `evidence-moved` lead, `init` alone writes an empty
  queue). Other `wrong` leads, unless a reader marks them, are confirmed by you (`foundBy: "sweep"` or `"spot-check"`, or `"audit"` for a lead from an outside review). If the pin moved since the unit closed, count each wrong round F confirms by the two-pin test in "Reopening a closed unit for the move" (below), whether or not the owner reopened the unit for the move. A `revert` lead is applied as a revert (`references/fixing.md`, "Reverting", steps 1 to 4), never itself entered in `confirmed.json`, and adjusts no closing count: the earlier round whose wrong it overturns is written as adjusted, unless that round is the closing pass (a unit closed with known wrongs or by a stopping rule), whose count stays as it was (`references/learning.md`, "Counting"). A `stale` lead is applied as the dependent's edit (`references/fixing.md`, "3. Dependents"), never itself entered in `confirmed.json`, and adjusts no count. A `re-judge` lead is judged with the confirm checks: an ok it overturns is then handled as a `wrong` lead, and a wrong it overturns as a `revert` lead. `ltz record` accepts a `final-check`
  unit with chunks left unqueued, and reports them as not read.
- **Known wrongs** from `S/known-wrongs.txt` are not confirmed again in round F: they stay confirmed in the round
  that closed with them, and a lead that restates one is settled with it, not confirmed again. Re-check the held
  draft against today's bar, rulings and pin (or draft the fix now if its line names none), apply it, log it in round F's fixlog, and
  fix-check it. A round-F reader's wrong that restates a known wrong, or the flaw a `revert` or `stale` lead's
  edit fixes, goes in `confirmed.json`'s `restated` list (`{"id", "of"}`, `of` naming the `known-wrongs.txt`
  line or the lead): it is not confirmed again, so it adds to no count and logs no lesson. A reader's wrong on
  another claim of such an item is judged as any round-F reader wrong is; the id stays one wrong
  (`references/fixing.md`, "Partly true items"), so where the closing count already holds it, it adds nothing to
  that count.
- **Mark each lead settled** in `closed-unit-leads.txt`, and each known wrong and dropped range in `known-wrongs.txt` (round F, date). If new leads are logged
  against a unit after its round F (by round F's sweeps or otherwise), the final targeted check repeats for those
  units, with the owner's OK, until none is open.
- **At the loop's end** (the owner's call), report every unit's status as it stands, and turn the guard off for
  the project if it is on (`scripts/hooks/README.md`, "Enabling it for one project").

Before a `closed-by-stopping-rule` or `closed-known-wrongs` status is set on a unit with fixes committed after its
closing round was read, take a baseline with `ltz snapshot <S> <unit> <R+1>`, so `diffcheck` doesn't flag them as
edits to a closed unit. When the unit closes, set its status in `S/loop.md` and `S/config.json`, checkpoint `S/` again as in step 7,
and tell the owner, naming any open defect for the unit (`S/defects.md`) and recommending an independent audit by a
different model or lens before the close is treated as final (`references/modes.md`, "External reviewer"); the next unit starts as setup question 2
decided (`references/setup.md`). Otherwise, start
the next round (or wait; see "Blocked only by what a re-read can't clear" above).

**A round that can no longer reach zero still finishes its reading.** Full coverage feeds the fixes and the
measure.

A reader's range dropped with the owner's approval (queue state `dropped-by-owner`, with the decision id, `P-n`) means the
pass was not full depth, so it cannot close the unit, unless reruns read the whole dropped tail before any of the
unit's items is edited (`scripts/README.md`, "Re-runs and supplementary reads").

## Between rounds only
- **Change modes only between rounds:** readers, concurrency, a stand-in for an external reviewer, canaries,
  freezing the bar.
- **If a reader or the external reviewer becomes unavailable mid-round, wait** (`references/queue-and-outages.md`, "Limits
  and credits"), rather than switch.
- **Moving the evidence pin** (the owner's decision, setup question 5) is also between rounds only, and even when the owner
  asks for it, measure it first with `ltz reach <S> --to <commit>` (`scripts/README.md`). The reach is three
  groups per unit, never only the first: the items that cite a changed file; the universal items ("no caller does
  X") that cite none but whose last search finds different hits at the new commit; and the universal items with
  no search to re-run, which you check against the changed files by hand or count in (an "N per …" claim is in no
  group, since the tools' universal check misses it by default: treat it as this group; `references/reading-classes.md`, "The
  universal words"). A hand clearance needs a
  cite or a structured search at the new commit, listed with the item's id in the ask, so the owner sees which
  items you cleared and how. A changed file can break a universal claim it was never cited for. The groups are a
  floor: a logged search can miss new code (a path built at run time), so read the diff itself and add any item
  whose claim it touches. Take that reach to the owner with the options (move now, at a
  unit's close, or not), and move only on their answer. Set it to a tag or commit, never a branch name (`snapshot` records the commit it resolves to). `reach` needs a single git evidence source: with folder or several sources, build the same three groups by hand from a diff of the old and new evidence (for the logged searches, run `ltz searches <S> --rounds all --at-current` on a scratch copy of the state folder whose `config.json` points at the new evidence), and pin a new folder by its sha256. Closed units stay closed at the pin they closed at (write it on `loop.md`'s Units
  line); tell the owner how many of their items the move reaches, and ask whether to reopen them.
  Re-check earlier fixes' bounds at the new pin with `ltz searches <S> --rounds all --at-current` (and on
  `S/discovery` too, if discovery ran, after pointing its `config.json` evidence at the new pin). A wrong only
  the new evidence refutes has origin "evidence moved" (`references/learning.md`, "The retro"). When its fix
  returns a field to a value it held before, put the move's decision id in that fixlog entry's `ruling` (on a requirement item, only
  beside `"basis": "copying-error"`), so `ltz flips` takes the return as explained (`scripts/README.md`, "Flips").
  - **The move is a process decision** (`P-n`; `references/setup.md`, "Which answers are bar rulings"): record it in
    `config.json` and `loop.md`'s Evidence line, never in `classes.md`. It doesn't touch a frozen bar. An answer
    that also says whether to reopen closed units is the same decision (one id).
  - **Don't wait for the answer.** The next round runs at the current pin. The ask, in `S/owner-questions.md`, states
    what waiting costs: the reached items that this round reads at the old pin and will read again after the move. Wait only if the owner says so (recommend it when that reach is over a third of the open unit).
  - **A unit that reaches zero while the move is still asked closes at the current pin.** Its close report names that
    pin and the open ask, and if the owner then moves and wants it reopened, the next bullet applies. Don't hold a
    close for the answer, and don't close it "at the new pin" before the move.
  - **Reopening a closed unit for the move uses the final targeted check**, never a full re-read. Log each of its
    reached items in `closed-unit-leads.txt` (kind `evidence-moved`; in place of a refuter, the decision id and
    what reached the item: a changed file it cites, the search whose hits changed, the diff lines that touch its
    claim, or "counted in"; a universal item you cleared by hand is not logged), which makes the unit `closed-leads-pending`. Round F queues readers only for
    the chunks holding those items (`--chunks`), read at the new pin. A wrong it confirms that only the new pin refutes
    is fixed with origin "evidence moved" and does not adjust the unit's closing count: that count was true at its
    pin. A wrong the old pin also refutes is an earlier miss, which does. The
    check runs when leads' final targeted check does (after every unit closes) unless the owner asks for it
    sooner, and then only between rounds of the open units. The Units line keeps the old pin and adds "checked at
    <new pin>, round F".

There are two exceptions mid-round:
- **A new class on an open bar.** Sweep every unit for it as soon as step 2 lets sweeps run (a count-only
  `ltz sweep --count` may run now), and confirm its hits as any sweep's (step 4). It
  joins `S/classes.md` for the next round's copy, and the report names it; the owner may drop it.
- **A ruling.** It applies to this round's verdicts at once and goes into the decision log and
  `S/classes.md` (one given in a solo reading or fix-check session, after the hand-back: `references/modes.md`). Readers
  see it from the next round's copy.

## Pending owner, defects, wishes
- **`pending-owner`.** A verdict that turns on an open owner question, for one of the three `pendingReason`s
  (SKILL.md, Verdicts); any other item the evidence plainly refutes stays `wrong`. Nothing it touches is edited until the
  owner answers. The question pauses only what it touches (those verdicts, and the fixes that depend on its answer); the
  rest of the round goes on.
- **`defect`.** Either the evidence itself is at fault (the code, or a config that differs from the policy it
  implements), or a requirement item states something the evidence does not meet. Work it through
  `references/debugging.md` (reproduce, isolate, diagnose, propose), log it in `S/defects.md` in that file's entry
  form, and tell the owner. The item is not "fixed" to match the evidence. For a descriptive item, a mismatch with the
  evidence is `wrong`; `defect` is for a fault in evidence the item describes accurately (a policy-vs-config
  mismatch whose two values it states correctly: `references/setup.md`, "Policy and config evidence"). A
  descriptive item that gives the policy's value as what the system does is `wrong`, and the mismatch is logged
  as the next sentence says.
  A fault in the evidence (code, or a config that differs from its policy) found with a wrong item, or while
  fixing one, goes in `S/defects.md` as its own entry naming that item; in
  `confirmed.json` the item stays `wrong` (an id can't be both). A defect closes only by an owner decision (the
  owner may record that the code was fixed); mark it closed in `defects.md` with the decision id.
- **A wish raised mid-round** goes in that round's report, when the report is written.
- **An override while reading is still open:** the status flips after the whole round's reading finishes (or after
  the owner drops what is still unread, as its own decision).
- **A stopping rule adopted mid-round** counts only from the owner's approval: only rounds whose snapshot is
  taken after the approval count toward it.
- **Switching accounts with `queue replace`** is a recovery, not a mode change (with the owner's OK).
- **A wish is not a rule change.** An owner's wish to finish sooner ("close it tonight") doesn't change a
  rule. Answer it with options, including "amend <rule>" and its cost.

## Canaries (planted test items)
- **What they are.** The writer writes them in a file and adds them with `ltz canary add <S> <unit> <R> --from
  <file>`. They are known-wrong items, with the wrong varied in kind and class, plus known-ok tricky items. They are shown only inside readers' windows.
- **What must never happen.** They are never written into the items or the evidence. If `S/` is
  under version control, `canaries.jsonl`, every `canary-plan.json` and `canaries-src/` go in its `.gitignore`,
  with the readers' `scratch/` folders (probe copies of the code); `ltz canary gitignore` checks the file.
- **Scoring.** `record` scores them apart: per reader, the canaries caught and the false alarms on ok
  canaries. They are excluded from coverage and from the estimate.
- **Keep readers unaware.** Never tell readers about canaries. Make them look like real items, and change
  their style each round so readers can't learn to spot them.
  - Readers may not open `list.json`, because a canary's id is not in it.
  - A window that holds a canary shows one item more than its range. That is a known tell: keep canaries to
    one or two per reader.
- **What a miss shows.** A reader who misses a canary gets a supplementary read of its whole range (its slot's FROM to TO, short of any tail the owner dropped) by a fresh reader of the round's kind,
  as for trimmed evidence, before the pass counts. The rerun carries no canaries (`canary plan` runs once, before
  the reading starts); its spot-checks check it (step 3). If its misses are in late windows only (it is tiring), also
  shorten the chunks from the next round's snapshot (`snapshot --chunk-size`), and say so in the report.

## The remaining-wrongs estimate
`record` estimates how many wrongs each chunk still holds, from the overlap of its two readers (the Chapman
capture-recapture estimator: N = (n1+1)(n2+1)/(m+1) − 1).
- **Always report it with its caveat.** The readers share a brief, so they are not independent,
  and the estimate runs low. Wrongs found by none add to it.
- **Use it to answer "when will it end?"** as a count of wrongs likely still unfound, never as a date. A large
  estimate with a small overlap means more readers per chunk would pay.
- **Give its range and confidence.** `record` writes a rough 95% range (`range`) for each chunk and the total,
  and flags `lowConfidence` when the two readers share fewer than 3 finds. Quote the range, and say when it is
  low-confidence.
- **Correct it by the unit's own history** before relying on it: compare each earlier round's estimate with the
  wrongs later rounds found in text that round had read, unedited since, "evidence moved" ones aside (the retro, step 3). If the estimate ran
  low by a factor, say so with the figure.

## What a clean result shows
A round with no finds is still a sample. Say what each clean result can and cannot show:
- **The estimate is 0 by construction** when no reader found anything, and its range is 0–0 for the same reason:
  report both as showing nothing, not as a precise zero.
- **Clean spot-checks bound only loosely the share of a reader's ok verdicts that are wrong** (not the share of
  real wrongs it missed: with few wrongs left, the two differ a lot). With none wrong out of n random picks, the
  95% upper bound on that share is 1 − 0.05^(1/n): 45% for 5 (one reader's random picks in a round), 26% for 10,
  14% for 20, 7% for 40. Only random picks count; weighted picks don't estimate a rate. Quote each reader's
  bound, and the round's random picks pooled for the readers as a group. Compute the figure with a tool for the
  n you have.
- **Caught canaries show little alone.** 2 of 2 is consistent with a reader who misses most wrongs (the same
  bound gives 78%). Readers are new agents each round, so pool canaries across all readers and rounds of the
  unit before quoting a rate (8 of 8 still allows 31%), and remember they test only the kinds of wrong you
  planted.
- **What a zero pass does show** is that the bar's classes, read at full depth, found nothing this round. The
  close rests on that, not on an estimate of zero.
