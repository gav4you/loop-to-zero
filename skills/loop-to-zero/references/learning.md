# Learning: the self-correcting part

## Triggers
Each of these writes a lesson to `S/lessons.md`, and a line for each changed verdict (one line per verdict per
round) to the `judgments.jsonl` of the state folder that holds that verdict's round (for a discovery pass,
`S/discovery/judgments.jsonl`; for a closed unit's verdicts, at its final targeted check: "Counting"):

| Trigger | What it shows |
|---|---|
| The owner overrules a verdict, or gives a ruling (asked or not) | Your reading of a rule was off, or a ruling was missing from the bar |
| A reader, a later round or the fix checker finds a wrong in an item you edited, or in one a past pass marked ok | Your fix overreached, or an earlier pass missed it |
| Confirmation overturns a reader's wrong, or a spot-check overturns one of its oks | The brief or the classes are unclear |
| A repeat: an id an earlier round confirmed is confirmed again for an overlapping class (`ltz record` flags it) | The evidence plainly refutes it: your fix failed, or an earlier pass missed it (`earlier-miss`), so it is `wrong`. A rule's meaning is in dispute, and the item's truth turns on that meaning: it is `pending-owner` (`references/fixing.md`) |
| Only one of two readers found a confirmed wrong | Check the missing reader's render log first ("The retro", step 1). It showed the refuter and still passed: the class is easy to miss, so propose a sharper wording. It never showed it: it failed to look, so the remedy is reading depth, not wording |
| A reader misses a canary | Give that reader's range a supplementary read. Misses in late windows only mean it is tiring: also shorten the chunks from the next snapshot |
| A sweep or search later proves to have missed siblings | Your search was too narrow, or a tool truncated it |
| A class turns up that the setup research did not predefine | The research missed a source. Add it to `S/research.md`, and propose adding it to `references/setup.md`'s research sources to the skill's maintainer |
| An item's field returns to a value it held in an earlier round, unexplained by a ruling (`ltz flips <S> <unit>`, run at each retro, over every round's `fixlog.jsonl`, the `historyFolders` (discovery) included) | A definition is unclear. Take it to the owner with each reading as an option. Until the answer, the item's verdict follows SKILL.md "Verdicts" |
| The agreed escalation trigger fires | The loop may not converge. Take the owner the trend, the classes and the cost per pass |
| The count jumps right after the rules or reader guidance changed | Treat the edit as the cause. Re-check the edited line first |
| The owner rules, or amends a ruling | If it changes behaviour, carry it into every affected item (`references/fixing.md`). If it only changes how items are judged, back-propagate to the verdicts and edits it overturns (below) |
| An estimate is off by more than 25% of the measured value | Your cost model was wrong. Tell the owner the corrected figure |
| A process failure loses work or time | The run needs a recovery rule |

**Changing the bar's wording.** A sharpened class wording is never edited straight into the bar mid-round.
1. Try it with `ltz replay` (below), using a pattern that encodes the wording's point, or write "n/a" if no
   pattern can, and measure its reach.
2. Propose it to the owner in the report, with the replay numbers.
3. Once approved, it waits in its `S/owner-questions.md` entry until the current round's last fix check is
   done, and is then written into `S/classes.md` before the next `snapshot`, so it enters the next round's copy.

**A ruling** (the owner's own words) enters `S/classes.md` at once, because fix checkers read the current bar
(one given in a solo reading or fix-check session enters at the hand-back: `references/modes.md`).
Replay its entry before the next snapshot, and watch that round's count. Your rewording of an entry's text is a
bar-wording change instead (steps 1 to 3).

A class found mid-pass on an open bar is the other mid-round exception, as set out in `references/reading-classes.md`
("A class found mid-pass"). It is still replayed before it joins the next round's copy.

## Lesson format
The same format is used in `S/lessons.md` and in the global `lessons.md`:
- **a title:** the rule in short, marked ✓ (it worked) or ✗ (it went wrong);
- **Rule:** optional, when the title already says it;
- **Why:** what was judged, what was right, the root cause, and the cost;
- **Replay:** the replay's recall and false hits. Or "no history yet" (lessons seeded from history), or "n/a
  (process lesson)" for cost or process lessons. Required before a lesson is promoted;
- **Change:** the file or step it changed, named only once that text carries the lesson; until then, "none yet";
- **Seen:** the count. Project names go only in `S/lessons.md`.

**Keeping `S/lessons.md` live.** Each project lesson also carries **Last confirmed:** the round it last recurred or
was applied; update it at every retro. A lesson a tool now refuses mechanically (shown with a negative test, such
as `ltz diffcheck` refusing an unlogged universal) is marked "Retired: enforced by <check>, <date>" and moved under
a "Retired" heading at the end of the file: it is not deleted (back-propagation and `judgments.jsonl` still name
it), but it no longer counts among the lessons re-read at each round start. At each retro, list the live lessons
not confirmed for 5 or more rounds, for review; quiet is not a reason to delete one.

## Counting
- **A wrong that an earlier pass missed counts in the round that finds it.** The latest full pass that marked
  it ok is shown as adjusted (`n (adj n+1, reason, date)`), never added into the trend a second time. Skip the
  adjustment if that pass read text that was changed afterwards.
- **Closed units' earlier rounds:** their `judgments.jsonl` lines and adjusted counts are written at the final
  targeted check.
- **Fix-checker finds** on text written after the snapshot count in the retro as "own edit". They are not part
  of the round's reading count.
- **Past rounds' `confirmed.json` and `report.json` stay as history.** Only `loop.md`'s trend shows adjusted
  counts. A ruling given during the current round edits that round's `confirmed.json`, and `record` is re-run.
- **`judgments.jsonl` "was"** is the latest verdict on record for the item, or `"fix-text"` for a find in text
  a fix wrote. `"fix-text"` wins when both apply (a fix checker passed that text); the checker's miss is counted
  in the retro. An overturn that reaches back writes one line per past verdict, each with its own round.
- **Reverts of earlier rounds' edits** go in the current round's `fixlog.jsonl`.
- **Fix-checker misses.** A later round's find in text the fix checker passed counts in the retro as a fix-checker
  miss.
- **Fix-checker finds in this unit's old text** (a named item, an unchanged field) go into this round's
  `confirmed.json` with `foundBy: "fixcheck"`; finds in another unit's items are handled as in
  `references/round.md`, step 5. Finds in text a fix wrote stay out of it (origin "own edit").
- **Revert leads.** A revert lead alone sets `closed-leads-pending`. The closing count (the confirmed count of the
  pass that closed the unit) changes for wrongs the final targeted check confirms, never for reverts.
- **The escalation trigger counts per unit.** Finds in other units count toward their own unit.
- **"Who found it"** includes "none (writer)" for the writer's own re-check of a past verdict, recorded as
  `foundBy: "spot-check"` unless a sweep found it.
- **A round still being read** is reported as "r9: at least 1 (reading incomplete)".
- **A chunk's measure counts only when all its readers are done.**

## Back-propagation
A lesson that exposes a flaw also re-judges the earlier verdicts the same flaw could have produced, and
re-reads the edits those verdicts caused (`references/fixing.md`, "Reverting").
- **What it covers:** the items the flaw's class pattern hits, in the rounds where that flaw applied. Run the
  pattern with `ltz sweep` or `ltz replay`, so the bound is mechanical. When the flaw is a search scope that was
  too narrow, also run `ltz searches <S> --rounds all` (and on `S/discovery`, if discovery ran). It re-runs every logged search over the whole boundary,
  closed units included, and lists those whose hit counts change. It can't catch a regex that was too narrow:
  for a narrowing fix, also re-judge the fixes that narrowed a universal by adding a qualifier, and widen the
  regression pattern.
- **Where it runs:**
  - in the current unit: re-judge now; the reverts (here, and of the cross-unit edits its false wrongs caused)
    follow after the round's reading (`references/fixing.md`, "Reverting");
  - in units not yet closed, their own verdicts at their next round: log them for that unit
    (`cross-unit-edits.txt`, verdict "deferred"), which that round handles (`references/round.md`, step 3);
  - in closed units, as leads.

Every earlier count it changes is written as adjusted. A closed unit's closing count is adjusted only when
the final targeted check confirms a wrong in it, never for an "evidence moved" wrong. Its status is `closed-leads-pending` from when the first lead is logged
until that check.

## The retro (`r<R>/retro.md`)
1. **Sort each confirmed wrong on two axes.**
   - **Origin:** pre-existing text; your own edit; a new class; a missing ruling; evidence moved (the owner moved the pin and only the new evidence
     refutes the item: `record` warns when the pin moved since the round's snapshot; such a wrong adjusts no
     earlier round's count, is no reader miss and does not count toward the escalation trigger;
     `references/round.md`, "Between rounds only"). A verdict of yours later overturned is "writer misjudgment"; when
     a ruling overturns it, it is "missing ruling" if the bar lacked the ruling's point, and "writer misjudgment"
     if the entry covered it and you misread it.
   - **Who found it:** both readers; one reader only; none (the writer's own check (`spot-check`), a sweep, an audit, the fix
     checker in old text, or the extract).

   **For each wrong a reader missed, check its render log** before choosing a remedy. If the reader never
   showed the refuting line, it failed to look: the remedy is reading depth (window size, through a side-by-side trial: "Changing the reader setup"; the whole-context
   lens, a supplementary read), not a sharper class wording. If it showed the line and still marked ok, it
   misjudged: then a sharper wording is the remedy (Triggers, "Only one of two readers found a confirmed
   wrong").

   Count reader false alarms separately. A reader wrong overturned by a ruling given mid-round is not a false
   alarm: it goes under "missing ruling", listed apart from the origin counts, and it is not in the round's count. Record it in `confirmed.json`'s
   `withdrawn` list with the ruling id, so `ltz record` counts it apart. A wrong outside a frozen bar is not a false
   alarm either: it goes in the `outsideBar` list.
2. **If the count rose,** say whether the bar moved (old text, newly seen) or your edits regressed.
   **Break the trend down by class** from the rounds' `confirmed.json` files (wrongs per class per round, each
   wrong under its first-listed class, computed with a tool). A
   falling total can hide a class that is flat or rising; name any such class in the report.
3. **The scores:** the canary scores, the remaining-wrongs estimate, the early-versus-late reading depth, and the
   recall of the unit's outside findings (`references/setup.md`, "Existing outside findings").
   **Calibrate the estimate:** for each earlier round of the unit, compare its total estimate with the wrongs
   later rounds confirmed in items that round read and nobody edited since (repeats with `earlier-miss`, and
   `judgments.jsonl` lines that turned that round's ok to wrong). Record the ratio found-later / estimated in
   `retro.md`; the report quotes it (`references/owner-asks.md`, "Reporting a round", item 3). A round whose
   estimate was 0 has no ratio: record its later finds as "found later despite an estimate of 0". The latest
   rounds' ratios have had few later rounds to be checked against, and a zero round finds nothing to count
   against them, so they look better than they are: say so.
4. **Lessons:** which lessons were applied this round, and which were broken. Promote each project lesson that
   qualifies ("Promotion", below).
5. **Cost:** the estimate against the actual (`ltz cost`).
6. **The triggers:** check whether the escalation trigger fired this round, and run `ltz flips <S> <unit>`
   ("Triggers", above).
7. **Cost timing:** measure at round end with `ltz cost` over the agents. Report the writer's own tokens separately,
   if they are available.
8. **Applied check** (last, after any id the retro added): every id in `confirmed.json` is settled. A wrong has a
   fixlog entry, a held draft (`drafts/<id>.md`) under an open owner question (listed in `S/owner-questions.md`), or a line in `S/known-wrongs.txt`; a withdrawn id has its
   ruling id; an `outsideBar` id has its note, for the report's list; a pending id has its reason; a defect has its `defects.md`
   line; a `ruledKept` id names a ruling whose entry records the keep; a `rejected` id has its note (a file:line or "history:"). Settle any id that isn't as its kind says
   here: a wrong the owner closed the unit with gets its `S/known-wrongs.txt` line (SKILL.md, "Owner overrides");
   any other wrong whose fix no open owner question holds goes through round steps 4 and 5. Then run retro steps 1
   to 8 again, until step 8 finds nothing to settle.

## Replay: test a rule on history before adopting it
Before a lesson is promoted, a class is added, or a class wording is sharpened, replay it on the recorded
rounds with `ltz replay`:
- **recall:** which past confirmed wrongs of that class it catches;
- **false hits:** which items it hits that were not wrong.

A rule that catches nothing it should, or floods with false hits, is not adopted as written. Put the replay
numbers in the lesson's **Replay** field.

**Hold out the rounds a rule came from.** A pattern or wording written from a wrong will recall that wrong, so
its recall there proves nothing. Run `ltz replay ... --holdout <unit>/r<R>` naming the round(s) it was written
from, and judge the rule on the held-out recall and false hits. If no other round holds a wrong of the class,
say "no held-out history yet" rather than quoting the in-sample recall.

## Trying a new check or a new method
- **A new mechanical check in the gate** (a project check in `S/checks/`, or a new hook rule) runs warn-only for
  one round first: it reports what it would have blocked, and you judge each hit, before it is allowed to block.
  Hits that turn out right are candidate wrongs (confirm checks as usual); false hits mean the check is fixed first.
  Regression patterns are the exception: they block at once, because their known instances test them.
- **A new method for a round** (narrow falsifiers, a different sweep, a new reading order): before trying it,
  write in the round's `retro.md` the test that decides whether to keep it, for example "keep if it confirms at
  least as many wrongs as the last sweep of the class did, at no more cost". After the round, apply that test and
  record the result. A test written after seeing the result decides nothing.

## Changing the reader setup (model, brief, window size)
A labelled stand-in for an unavailable external reviewer (`references/modes.md`) is not a setup change and needs
no trial: its items go on `S/owed-rechecks.txt`.

Never switch the readers' model, cut or reword the reader brief, or change the window size on a hunch, even to
save cost. First run the old and the new setup side by side, uncounted, on the same chunk of the last recorded
round (its snapshot), and compare: the confirmed wrongs each finds, false alarms, canaries if planted, and cost
(`ltz cost --queue`). Run the trial in its own state folder (a copy of `config.json` with no `historyFolders`,
`classes.md` and that chunk's items, snapshotted there), never in a slot of a real round, so `record` and the
commit guard never see it. Adopt the new setup only if it finds every confirmed wrong the old one found, and take the
comparison to the owner (it is their mode decision). It takes effect from the next snapshot, never mid-round.

## Promotion
- **Moving a lesson up.** A project lesson goes into the skill's `lessons.md`, as a new lesson or merged into one
  that says the same thing, only when:
  - it can be stated without project names: the promoted text names no item, unit, file, path, ruling id or
    project term;
  - and it has a **Replay** result that held up, or "n/a (process lesson)" for a cost or process lesson.
    - "Held up" means the replay ran with the source rounds held out, recalled past wrongs of its kind, and its
      false hits were judged. "No history yet" and "no held-out history yet" are not results that held up: the
      lesson stays in `S/lessons.md` and is replayed again at each later retro until one holds up.
    - "Process lesson" means a lesson about cost, timing or the loop's own steps (such as which check runs
      before a verdict is kept). A lesson about a kind of claim, a fix's wording or a class (a fix that missed a
      member, a wording readers misjudge) is not one: it needs the replay.

  A merge bumps the global lesson's Seen count. Add the global lesson's title to the
  project lesson's Change field in `S/lessons.md`: a lesson whose Change field names one is already promoted.
- **Promotions need no approval,** but each one is reported to the owner.
- **No skill file except the global `lessons.md` is edited on your own** (it takes promotions, above). Propose a
  change to the skill's maintainer (usually the owner) when a global lesson:
  - contradicts SKILL.md or a reference file;
  - or keeps recurring although SKILL.md already states it. Then propose a mechanical check (a tool, a gate
    or a hook), not more words.

  Also propose a new scenario for `tests/` when a real loop exposes a failure no current scenario would catch
  (`tests/README.md`).
- **After any edit to SKILL.md, `references/` or `scripts/`,** re-run the skill's tests (`tests/README.md`). A
  lesson promotion is tested by its replay, and `skillcheck` runs after any edit to `lessons.md`.
