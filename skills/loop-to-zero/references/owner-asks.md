# Asking the owner

The owner decides on substance, not on citations. Each ask, using AskUserQuestion or plain text:
1. **What it affects, in plain words.** Say what users, the product, cost or time would notice. Give no rule
   numbers without their meaning.
2. **The recommendation, and why.**
3. **The honest case for each alternative,** and its cost.
4. **Every real option.** An option that conflicts with a past ruling, even the owner's own, is offered as
   "amend <ruling>", with the ruling's original reason and the cost of amending it. Never leave it out.
5. **One question per decision.**

Then record the answer verbatim, with the date, in the decision log (`references/setup.md`), and commit it
if the log is in git. Mirror how the previous decision was recorded. The log holds every owner decision,
including "knowingly amends" overrides, not only rulings. List each ask in `S/owner-questions.md` when you make it,
with the date asked and the unit and item ids that wait on it, and add its decision id once it is answered, so a later session can
see what is still open.

**Each decision-log entry records** the question as asked, the options offered, the owner's words verbatim, the
choice, and why each rejected option was rejected (the owner's reason if given; otherwise your recommendation's
reason, labelled as yours). A later reader can then tell what was weighed, not only what won.

**Before each report, check every open question against the decisions recorded since it was asked.** A later
decision whose words settle it, even one given on another topic, withdraws it: mark it in `S/owner-questions.md`
with that decision id and the date, report it as withdrawn (with your reading of how the decision settles it,
labelled for the owner to correct), and stop asking it.

**Unprompted rulings** are recorded the same way, for example "stop flagging those" or "that's covered by
R-12". An owner's overturn of a verdict that rests on a rule, scope or definition ("those are in scope") is recorded as
a bar ruling (`R-n`) with its accepted-by-ruling entry, so the overturned reader wrong can go in `withdrawn`. When
it names an existing ruling ("that's covered by R-12"): if R-12's entry already covers the point, record no new
ruling and no amendment: log the owner's words, dated, in the decision log as a note under R-12, and the wrong goes in `rejected` with the entry's `S/classes.md:<line>`; if the owner's words extend it,
record a dated amendment on R-12, and the wrong goes in `withdrawn`. A bare "that item is fine" about an item the evidence plainly refutes is a wish: answer
it with options, including the override path (SKILL.md, "Owner overrides").
- Add each bar ruling to `S/classes.md` under accepted by ruling (`references/reading-classes.md`). The entry's
  wording is yours, so quote the ruling verbatim, replay a pattern that encodes its point (or write n/a), and show the entry's text to the owner
  in the report.
- A ruling that clarifies or extends an existing one becomes a dated amendment on that id, in its
  accepted-by-ruling entry. A new standing
  instruction gets a new id. When the owner names an existing ruling and the words extend
  it, it is an amendment on that id; if its entry already covers the point, no amendment is recorded (above).
- Any answer to an "amend <ruling>?" question that keeps the ruling ("keep it", "stop flagging those") counts as the
  owner keeping it. Record it in that ruling's accepted-by-ruling entry ("kept after 'amend?', <date>", with the
  owner's words); it
  enters at once, like a ruling, and confirm check 1 then treats the item as ok.
- If its scope is unclear, ask one narrowing question rather than guess. A scope is unclear when the ruling's
  text admits two readings that would change at least one verdict. Record as `pending-owner` (`rule-meaning`) only
  the verdicts whose truth depends on that scope. An item the evidence refutes under either reading stays `wrong`;
  its fix is drafted, and held until the answer only if the answer would change its wording (as in SKILL.md, "Cross-unit effects"). Never record as `pending-owner` an item the evidence plainly refutes, except under the three
  Verdicts exceptions in SKILL.md (a rule's meaning, a silent boundary, wording a ruling approved). Ask "amend
  <ruling>?" only when the evidence refutes the wording the ruling approved; otherwise the item is simply ok.
- **A ruling enters the bar at once** because it is the owner's own change (one given in a solo reading or
  fix-check session enters at the hand-back: `references/modes.md`). Your entry wording is shown to the owner
  in the report. That is not the "never change the rule text without asking" case, and neither is a class
  found mid-pass on an open bar: the owner chose the open bar, the class is replayed where there is history,
  and the report names it so the owner may drop it (`references/round.md`, "Between rounds only").
- A wish is not a ruling ("close it tonight", "we're so close"). Answer a wish with options. Work continues
  under the current rules while the owner decides: fixes to the items an open override question names are
  drafted, not committed (SKILL.md, "Owner overrides"), and while such drafts are held the next round waits
  (`references/round.md`, "Blocked only by what a re-read can't clear"). A wish appears in the report, not in the
  decision log; until the report is written, note it in the round's `retro.md`.
- **A deadline question** ("tonight?") gets a plain "no, not under the current rules" when the facts rule it
  out, followed by the options, including any override, then the fixed facts and
  the earliest condition for a close, never a total-time estimate.
- **A wish and a ruling.** A wish asks for an outcome ("close it", "park it"). A ruling decides a rule, a
  scope or a definition. "Park a refuted item and close" asks to close with a known wrong, so the owner-override
  path in SKILL.md applies; a costed options message that names the risk counts as its one challenge.

## Recording answers well (from a long project's decision history)
- **Label your interpretations.** Record your reading of an answer separately from the owner's words, marked
  "for the owner to correct".
  - When an answer merges options or is free text, restate it as one compact rule, show how it covers each
    option, and confirm it if it changes scope.
  - When the owner hands a choice back ("what would be best?"), state your choice and its reason, then get a
    confirm.
- **Challenge a risky override once.** When the owner picks against a safety recommendation:
  1. challenge once, naming the concrete risk;
  2. record the choice as "knowingly amends X", with the risk the owner accepted;
  3. note in that decision-log entry, and in its `S/owner-questions.md` line, that it is not to be asked again.
- **Keep amendments narrow and explicit.**
  - Each reversal names the rulings it supersedes and how far it reaches ("for this one column", "for the
    outage only").
  - Keep the dated amendment chain under the id it amends.
  - Record any edit the owner makes to the recorded text.
  - Build the list of changed rulings by comparing the answers against earlier rulings, not from memory.
- **Check every premise, and compute every count you report with a tool.** A false premise is worse than a
  typo. When a premise or count you reported was wrong, record the correction in that decision's decision-log entry
  (never in `classes.md`) and tell the owner.
- **A rejected question shows a preference.** When the owner rejects a question, write the preference behind
  it as a choice rule and apply it to the remaining questions.
  - Ask how far the rule reaches.
  - Re-ask any earlier answer it conflicts with; never quietly re-decide it.
  - A later explicit ruling overrides the rule for its own question.
- **Delegated answers are marked as yours.** When the owner delegates, mark the answers so they can never
  pass for the owner's words, and test each recommendation hard before recording it.
  - Still send the owner anything that needs the owner's facts or authority, or that reads or extends the
    owner's own rulings.
  - List the working assumptions only the owner can confirm, each with a due date, in `S/owner-questions.md`
    (marked as assumptions) and in the next report.
- **A standing instruction inside an answer gets its own record.**
  - A "from now on" instruction becomes its own decision, applied at every later step: a bar ruling only if it
    changes how items are judged, otherwise a process decision (`references/setup.md`).
- **Before proposing a guard or refusal rule,** list everything that already relies on the old behaviour
  (test builds, replays, tools), and put the escape hatch in the same question. Two such rulings each needed
  a later amendment.
- **Never change the rule text readers judge by without asking the owner,** or without replaying the new
  wording first (`references/learning.md`, "Changing the bar's wording"; "n/a" where no pattern can encode it).
  - One wording addendum took a pass from 1 wrong to 43.
  - Treat a jump in the count right after a rule edit as caused by the edit.
  - Before asking, measure how far the change reaches: search every item it would affect. Guesses of "a
    few items" missed three times, by up to 43 and 93 items.

## Asking about stopping or changing method
- **Bring it up yourself.** When the count stops falling, bring the owner the trend, the cost per round and
  a concrete change of method. Don't wait to be asked: in one project, three of four course changes came
  from the owner.
- **Asking doesn't pause the loop.** Rounds go on under the current rules while the owner decides
  (`references/round.md`, "Blocked only by what a re-read can't clear", says when a round waits).
- **Every stopping-rule or method question carries:**
  - the counts per pass;
  - the token and time cost per pass;
  - whether the new finds sit in items an earlier pass accepted;
  - how much each kind matters;
  - what later safeguard would catch each kind.
- **Always include the full-rigour option.** That owner chose it every time.
- **Give the cost per round and the trend, never a total-time estimate.** The counts rarely fall steadily. Never
  multiply the cost per round into a finish time.
- **Switching accounts mid-round to beat a usage limit** is the owner's call, and is done only with their OK.
  Waiting is the default; you may offer the switch as an option, with what it saves.
- **Recommend small, serial, resumable steps:** one unit at a time, a queue on disk, low concurrency, and a
  report-and-ask at each unit boundary. In one project, the owner rejected "all units in one go" and set "two at a
  time" after a mass limit stop.
- **When a definition keeps flipping,** take it to the owner with each reader's actual reading as an option,
  and examples. Then add the ruling to `S/classes.md` under accepted by ruling (above). A ruling left only in hints or memory
  gets judged afresh every pass.
- **When the same reader both reads and fixes,** never recommend that as the design. If it is forced, say
  what is given up and measure it early with a cold sample.

## Decisions that belong to the owner (never default them)
Every setup question (`references/setup.md`) belongs to the owner, including:
- The evidence boundary and pin, discovery (for a fresh loop: an adopted loop runs none, SKILL.md, setup checklist
  step 9), and the escalation trigger.
- Canaries, hooks and probes.
- The decision log's home, the branch and the approver.
- The names and classes from the setup research.
- What zero is for, what a zero pass means, and whether questions about a rule's meaning block a close.
- Whether the bar freezes, or whether a stopping rule replaces loop to zero. A stopping rule closes a unit
  on some condition other than a pass at 0, for example "two rounds in a row with at most 2 wrongs, each
  fixed and checked".
- The reader mode (solo, agents or an external reviewer), readers per chunk, concurrency, and the
  fix-checker mode.
- The item type, softening, and whether defects block a close.
- The cross-unit policy. The recommendation is to defer leads in closed units; it applies once the owner
  decides.
- Anything that changes what a ruling, decision record or approved exception permits.
- Push, publish, a tag, or freezing a release or the items as the reference (setup question 0).

## Reporting a round (information, not a stop)
Open with two things, before item 1:
- **A headline:** one or two sentences on what the round found and whether the unit can close, stamped with
  the round and pin its figures are as of ("round 5, at v3.2"). Take every figure from `record`'s output; whether the unit can close is `countsAsZero` (or step 8's conditions where
  they override it: a defect closed by owner decision, a past round adjusted to 0) plus
  `references/round.md` step 8's own checks (`S/defects.md`, skimmed ranges, edits after the read, open "deferred"
  lines logged after step 3).
- **Decisions needed:** each open owner question that blocks a close or holds drafted fixes, one line each:
  what it blocks and by when the answer is needed (for example, before the next round's snapshot). Write "none"
  when there are none.

Then report, in this order:
1. **The trend:** wrongs per round, with adjusted counts shown, and per class (`references/learning.md`, "The
   retro", step 2), naming any class that is not falling.
   - **Bridge each count from the last round's; never give it alone.** Say what became of the last round's
     wrongs and where this round's came from: "round 4 found 7, all fixed (fix check returned 0); round 5 found
     4, all new: none is a repeat or in text I edited". Split the new ones into repeats (from `record`'s output; an `evidence-moved` one apart, as no fix failure), finds in your
     own edits (from the retro's origin axis: `references/learning.md`, "The retro", step 1) and the rest.
2. **This round's wrongs, on the two axes** (`references/learning.md`, "The retro"): by origin (pre-existing text,
   your own edit, a new class, a missing ruling, writer misjudgment, evidence moved) and by who found them (every reader of the chunk, some but not all, none), plus
   reader false alarms. A round still being read is reported as "at least n (reading incomplete)".
3. **How much is likely still unfound:**
   - the remaining-wrongs estimate, with its caveat, its range and any low-confidence flag from `measure.json`;
   - how far this unit's earlier estimates ran low: each earlier round's estimate against the wrongs later rounds
     found in text that round had read, unedited since, "evidence moved" ones aside (`references/learning.md`, "The retro", step 3);
   - the canary scores per reader (caught, false alarms);
   - the found-by-only-one-reader count;
   - what the clean results can and cannot show (`references/round.md`, "What a clean result shows"). Never
     present a clean round as proof that nothing is left.
4. **Cross-unit counts:** edits and open "deferred" lines in units not yet closed, and leads in closed units.
5. **Cost:** tokens and wall-clock time, against the estimate.
6. **Lessons logged**, and any change to the skill that you propose to its maintainer (to SKILL.md, `references/`,
   `scripts/` or `tests/`): the report is where each such proposal is written.
7. **Open questions and defects:** every open owner question (such as `pending-owner` items, an override
   question or a ruling-level lead), ranked by what it blocks (a close, then held drafts, then nothing), each with
   its age in days since it was asked, and the questions withdrawn since the last report, `outsideBar` items, this round's `defect` verdicts (each with its root cause
   and proposed fix, one line each: `references/debugging.md`), and every open defect in `S/defects.md`.
8. **What other steps send to the report,** such as a new ruling entry's text, a class added mid-pass, a
   proposed wording change with its replay numbers, a lesson promotion, a wish, and hedges left in place of a
   revert. Note each in the round's `retro.md` when it happens, so the report can list it.

**If the count rose, say why.** A widened bar is not a regression; wrongs in items you edited are.
