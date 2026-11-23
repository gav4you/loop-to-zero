# Loop-to-zero lessons (global, all projects)

This is the skill's memory.
- **When to read it:** at setup, and at the start of every round (in solo mode, after the round's reading).
- **When to add to it:** in each round's retro, by promoting project lessons that can be stated without
  project names and have a Replay result that held up (or "n/a (process lesson)") (`references/learning.md`, "Promotion").
- **Keeping it short:** merge a new lesson into an existing one that says the same thing, and drop a lesson
  a later one supersedes, noting what superseded it.

**Format:** see `references/learning.md` ("Lesson format"). **Rule** is optional when the title states it. **Seen** counts occurrences. **Replay:** these lessons were seeded by the skill's maintainer (from history and from the skill's own test loops), not promoted, so their Replay is "no history yet" (except where stated) until a project replays them. **When to read:** in solo mode, read the lessons after the round's reading, not before it. Marked ✓ = it worked, ✗ = it went
wrong.

Lessons change behaviour from now on, and reach back to the earlier verdicts and edits they could have spoiled
(`references/learning.md`, "Back-propagation"). They never edit another skill file by themselves: when such a change
is due, propose it to the skill's maintainer (`references/learning.md`, "Promotion").

All lessons below come from 1 project's history (about 70 verification rounds, 3 discovery phases and a
large plan review), unless a lesson says otherwise. A lesson that names "an improve-and-harden loop" comes from
the loop that improves this skill's own text: repeated cold reads of one text, each followed by fixes.

## Setup
- **✗ Predefine the names and classes from repo research.**
  - **Rule:** classes come from claim shapes, evidence kinds, past errors and rulings, and the owner approves
    them before any counted reading.
  - **Why:** classes invented mid-loop kept widening the bar (one round went from 14 to 25 wrongs, all newly
    seen classes in old text). The owner asked for them up front.
  - **Change:** setup step 5.
  - **Seen:** 1 (an owner directive).
- **✗ Put every ruling into the bar.**
  - **Why:** readers who never saw the rulings re-flagged settled items, so a unit could never reach zero.
  - **Change:** `classes.md`, accepted by ruling.
  - **Seen:** several.
- **✗ Ask what zero is for.**
  - **Rule:** a frozen reference needs less than a fully correct one.
  - **Why:** a fix loop on a reference grew (4, 6, 13, 18 findings, about 3 hours a round) until the owner
    stopped it as wasteful, and kept the items as the reference instead (a stopping rule).
  - **Change:** setup question 0.
  - **Seen:** 1.
- **✗ Census the owner questions from every governing document.**
  - **Why:** a census keyed on the items missed spec-level owner items twice (more than 16 items).
  - **Change:** `setup.md`, "Gathering the owner questions".
  - **Seen:** 2.
- **✗ Fix one canonical line numbering up front.**
  - **Why:** tolerating two numberings "below the bar" later cost about 28 edits.
  - **Change:** `setup.md`.
  - **Seen:** 1.
- **✓ Discovery before looping, but with a different reading order each pass.**
  - **Why:** a narrow claim-vs-citation loop ran 47 rounds and missed 13 wrongs about behaviour that an outside
    audit found. Three discovery phases found 185, 156 and 254 (the last over 15 passes, using 11 different orders). It still never reached zero
    in 15 passes, so the owner ends it.
  - **Change:** setup step 9.
  - **Seen:** 1.

- **✗ The loop's own checks are its riskiest code.**
  - **Rule:** give every check a negative test for each way it can pass while checking nothing.
  - **Why:** reviews found more than 15 fail-open checks, for example a substring accepted as a whole match,
    or a catch-all that turned an error into a PASS.
  - **Change:** `setup.md` step 8.
  - **Seen:** more than 15.
- **✓ Agree a numeric escalation trigger up front.**
  - **Why:** "more than about 3 new wrongs in items passed earlier" fired once and brought the owner a
    decision with data. Without a trigger, long tails ran unnoticed.
  - **Change:** setup question 0.
  - **Seen:** 2.
- **✗ Say what makes a class wrong as a refuter, not as the claim's proper scope.**
  - **Why:** in one improve-and-harden loop, a class's "wrong when" text said that a claim "covers only" the
    bounded cases. Read literally, that excused the unbounded claim the class exists to catch. It stood through
    many cold reads before one reader reported it.
  - **Replay:** no history yet.
  - **Change:** none in the steps yet; the starter row U2 in `reading-classes.md` was reworded this way.
  - **Seen:** 1.

## Reading and verifying
- **✗ A zero from a sample is not a zero.**
  - **Rule:** coverage is computed from the files.
  - **Why:**
    - sampled rounds closed units fast, but one left 384 items unchecked;
    - the first full-coverage round then found 31 wrong;
    - a unit closed on samples later showed 39 wrong in items earlier rounds had passed.
  - **Change:** `briefs.md`, "Coverage".
  - **Seen:** 5 units.
- **✗ Readers game a strict checker.**
  - **Rule:** a reader that trims its evidence to pass gets that range re-read; one that admits shortcuts
    gets a supplementary read.
  - **Why:** verifiers dropped 28 and then 19 "lines read" entries to pass, and one read long ranges only
    through their first lines.
  - **Change:** `briefs.md`.
  - **Seen:** 5.
- **✗ Quote rules word for word in every brief and hint.**
  - **Why:** a paraphrase became a second, hidden rule 7 times. One prompt's paraphrase decided 16 items
    wrongly, and another skipped 148 and 78 proposals.
  - **Change:** `briefs.md`, "Read first".
  - **Seen:** 7.
- **✓ Reviewers who run the work find what readers miss.**
  - **Why:** in one plan's reviews, the most serious faults came from probes that ran the code.
  - **Change:** `reading-classes.md`, the adversarial lens.
  - **Seen:** 3.
- **✗ One reader who also fixes settles at a false low.**
  - **Why:** single-reader rounds found 9, 14, 25, 1 and 9. A cold test reader on one window caught 2 more,
    and the first round with independent readers confirmed 51.
  - **Change:** `modes.md`.
  - **Seen:** 1.
- **✓ Readers overlap little; take the union and run the writer's own sweep.**
  - **Why:** of 51 confirmed wrongs, both readers found 8, one alone found 29, and neither found 14 (the
    writer's sibling sweep did). In one improve-and-harden loop, two cold reads of one text shared 1 find in 10;
    three more reads added 5, then 3, then none. In a later round of that loop, two reads' overlap put the total
    at about 7 (5 found); six more reads then added 6, 3, 3, 2, 4 and 3. The round after, on the corrected text,
    two reads found 9 and two more added 6 and 3.
  - **Change:** `briefs.md`, "Measure".
  - **Seen:** 4.
- **✓ Only a full-depth pass counts as zero.**
  - **Why:** a filtered pass found 9, and the full-depth pass after it found 14. The filtered tail had found
    nothing.
  - **Change:** `references/round.md`, step 8.
  - **Seen:** 2.
- **✓ In discovery passes, read items an earlier fix changed first** (rounds keep list order and weight
  spot-checks instead).
  - **Why:** about 40% of later finds sat on fixed items, against a 7% base rate. The pass ordered this way
    went from finding 3 to finding 9.
  - **Change:** setup step 9.
  - **Seen:** 1.
- **✗ A rising count usually means the bar moved.**
  - **Rule:** check whether the wrongs are in items you edited before calling it a regression.
  - **Why:** a widened bar spiked a round from 14 to 25, all in old text. With the bar steady, the next
    round found 1. In one improve-and-harden loop, a stronger reader model took the count from 6 to 13, with
    none of the 13 in the previous round's edits.
  - **Change:** retro.
  - **Seen:** 2.
- **✗ A change to the reader rules can multiply errors.**
  - **Why:** one wording addendum took a pass from 1 wrong to 43, and 27 of the 43 were later rejected.
  - **Change:** `owner-asks.md`, and `references/learning.md`, Triggers.
  - **Seen:** 1.
- **✗ Hints carried to readers cause errors.**
  - **Rule:** state bounds, never new facts, and re-check every hint against later rulings.
  - **Why:** hint lines caused 9 extra wrongs in one round and 3 in another. Four hint lines were corrected.
  - **Change:** `setup.md`.
  - **Seen:** 6.
- **✗ Universals count every piece of code unless bounded.**
  - **Why:** this one class produced every wrong of a full round.
  - **Change:** starter class U1.
  - **Seen:** many.
- **✗ Universals over requests miss earlier gates.**
  - **Rule:** bound "every request does X" to the stage that does it. Bound "every value is validated" to inputs
    that can arrive through the interface.
  - **Why:** a rate limiter and a body parser answered before the described check, and crafted
    in-process objects bypassed validation. Readers confirmed both.
  - **Change:** `reading-classes.md`, U2.
  - **Seen:** 1.
- **✗ Write-set and existence claims miss side effects and operator artefacts.**
  - **Rule:** "writes only X" counts trigger, cascade and other-mode writes. "Every table has RLS" counts what
    operator commands create.
  - **Why:** an audit trigger's extra row, a memory-mode upsert and a DR test's table each refuted such claims.
  - **Change:** `reading-classes.md`, U3 and U6.
  - **Seen:** 1.
- **✓ A flip register settles definitions.**
  - **Rule:** when `ltz flips` reports a field's return to an earlier value as unexplained, take the definition to
    the owner with each reading as an option.
  - **Why:** 12 rulings settled one field family. An old script that missed flips reported 0 when the true
    count was 4.
  - **Change:** `references/learning.md`, Triggers.
  - **Seen:** many.
- **✗ Readers tire on long jobs.**
  - **Why:** one long reader's extra reading per item fell from about 56 lines to 4.5 after its first windows
    (partial data).
  - **Change:** `queue-and-outages.md`, chunks of about 70 items.
  - **Seen:** 1.
- **✗ Verdicts come only from result files.**
  - **Why:** a reader changed verdicts in its reply only; 2 of 4 "found by neither" items existed only in a
    reply.
  - **Change:** `queue-and-outages.md`.
  - **Seen:** 1.
- **✗ A point raised again after it was cleared needs a fresh test, not the earlier call.**
  - **Rule:** when a later round's reader raises a point an earlier round cleared, test it afresh for a dispute
    over a rule's meaning (`rule-meaning`) and for an item that reads two ways (the ambiguity class), before
    counting another false alarm.
  - **Why:** in one improve-and-harden loop, three passages that earlier rounds had cleared by citing the earlier
    call (one of them three rounds running) were raised again by a new reader, and each turned out to need a
    change. A doubt listed in two rounds of test runs, and cleared each time, became a missed test point in the
    third. In the two rounds after, thirteen more points cleared earlier were raised again, and each needed a change.
  - **Replay:** n/a (process lesson).
  - **Change:** `fixing.md`, the confirm checks.
  - **Seen:** 17.


## Fixing
- **✗ Your own fixes are a growing source of wrongs.**
  - **Rule:** fix by subtraction, a hedge if softening is allowed, or a proven bound. Add no new
    list, count or "only" without a search run at that moment.
  - **Why:** the writer's own fix text was found wrong at least 9 times across rounds and passes, including
    "only A" becoming "only A and B". In one improve-and-harden loop, of 13 changes the one that added a
    sentence of new procedure was the only one two cold checkers refuted; the 12 that removed, narrowed or
    reworded text passed both. In a later round, one edit that added an item to a list passed three cold checkers,
    and two of the nine finds of the next round's first two reads came from it.
  - **Change:** `fixing.md`, step 2.
  - **Seen:** 11 or more.
- **✓ Check each drafted fix against your own earlier fix errors before applying the batch.**
  - **Rule:** the list of errors is the lessons your own edits have logged in `S/lessons.md`.
  - **Why:** in one improve-and-harden loop, reviewing 22 drafted edits against a written list of nine kinds of
    error its earlier fixes had made changed 3 of them before they were applied; one would have contradicted
    another rule. In the next two rounds the same review changed 3 of 36 drafts, then 6 of 51; two cold checkers
    found nothing to refute in those 51. The round after, it changed 4 of 36.
  - **Replay:** n/a (process lesson).
  - **Change:** none in the steps yet; it applies where fixes are drafted (`fixing.md`, step 2).
  - **Seen:** 4.
- **✗ A sweep by wording only proves no regression.**
  - **Rule:** sweep by subject, cited range, phrasing variants and named file.
  - **Why:** wording sweeps missed siblings in 8 of 15 discovery passes; cite sweeps found them. In one
    improve-and-harden loop, a fix removed a rule from one file and left it standing in another, because the
    sibling search used the removed sentence's words; both cold checkers found it. A later round first listed,
    for every rule, each place that states it, and looked each fix up there: two cold checkers counted no defect
    in 51 edits, and the one sibling they noted as still unswept belonged to a fix searched by phrase alone.
  - **Change:** `fixing.md`, step 1.
  - **Seen:** 10 or more.
- **✗ Rulings not carried into every item were the largest class of wrongs.**
  - **Rule:** carry each ruling into every field that carries the behaviour, not just titles.
  - **Why:** 103 of 312 findings in one phase's findings file (its 254 discovery finds plus later verify-round finds), and 60 of 156 in another.
  - **Change:** `fixing.md`, "Carrying a ruling".
  - **Seen:** 3 phases.
- **✓ Re-read the whole unit in its first fix round.**
  - **Why:** whole-unit re-reads found 126 more instances than the readers named, over 3 occasions.
  - **Change:** `fixing.md`.
  - **Seen:** 3.
- **✗ Open every item the new text names.**
  - **Why:** reading only the diffs missed three wrong cross-references, which opening the named items caught.
  - **Change:** `fixing.md`, step 4, and the fix-checker brief.
  - **Seen:** 3.
- **✗ A fix to one field leaves the claim stale in the others.**
  - **Why:** paraphrase defeated word matching 4 times.
  - **Change:** `fixing.md`, step 4.
  - **Seen:** 4.
- **✓ Make every class a permanent regression pattern.**
  - **Rule:** write the pattern before the fix, and re-run all patterns after each fix batch.
  - **Why:** the patterns grew to 217 with 0 hits, and they caught one follow-up regression.
  - **Change:** `fixing.md`, steps 1 and 5.
  - **Seen:** 14 passes.
- **✓ Diff every field against the round's snapshot.**
  - **Rule:** the changed set must equal the logged set.
  - **Why:** it caught a categorical change the fix log missed.
  - **Change:** `fixing.md`, step 5.
  - **Seen:** every pass.
- **✗ Gates hid failures through pipes.**
  - **Rule:** prove a gate fails on bad input before trusting it.
  - **Why:** twice; the second time meant re-checking 37 fix files.
  - **Change:** `fixing.md`, step 6.
  - **Seen:** 2.
- **✗ Appended clauses make run-ons and stacked parentheticals.**
  - **Rule:** shape-check the whole changed field.
  - **Why:** a check that looked at a 40-character window around each edit missed two stacked parentheticals.
    A zero-wrong round missed run-ons after appended clauses.
  - **Change:** `fixing.md`, step 5.
  - **Seen:** 4 or more.
- **✓ One wording per class, reused from an earlier fix found correct.**
  - **Why:** fresh prose for each item kept producing new overreaches. A shared wording was checked once,
    against that earlier fix, before the batch.
  - **Change:** `fixing.md`, step 2.
  - **Seen:** several.
- **✓ Drain a recurring class with narrow falsifiers.**
  - **Rule:** extract every claim clause of the class, and report only what can be proven false.
  - **Why:** this checked 706 claims for about 2.4M tokens and found 16 new wrongs. A heavy pre-sweep had
    cost 7.4M for half its chunks, and single-agent sweeps had missed what verifiers then found.
  - **Change:** `fixing.md`, step 1.
  - **Seen:** 1.
- **✗ Never exempt from a sweep a range of items that once came back clean.**
  - **Why:** an excluded "clean" range held 5 wrongs.
  - **Change:** `fixing.md`, step 1.
  - **Seen:** 1.
- **✗ Measure a rule change's reach before adopting it.**
  - **Why:** guesses of "a few items" missed by up to 43 and 93 items, three times.
  - **Change:** `owner-asks.md`.
  - **Seen:** 3.
- **✗ Fields filled in bulk were write-checked, not judged.**
  - **Why:** a re-judge of 62 found 10 wrong.
  - **Change:** `fixing.md`.
  - **Seen:** 1.
- **✗ When an item states a rule and its exceptions, read the whole implementation once.**
  - **Why:** patching one exception per round kept one item wrong for 3 rounds.
  - **Change:** `fixing.md`, "Searches".
  - **Seen:** 1.
- **✓ A stronger reviewer re-judging the find list and the near-misses at pass end adds finds.**
  - **Why:** about 5 extra finds across 3 passes.
  - **Change:** `references/round.md`, step 5.
  - **Seen:** 3.

- **✗ A logged fix list isn't an applied fix list.**
  - **Rule:** settle each confirmed wrong as it is fixed, and check that every id in `confirmed.json` is settled
    before calling a round's fixes done.
  - **Why:** in one improve-and-harden loop, two of a round's logged fixes were never applied, and two were only
    half applied. Later rounds found them again.
  - **Replay:** n/a (process lesson).
  - **Change:** the retro's applied check (`references/learning.md`, "The retro", step 8).
  - **Seen:** 1.
- **✗ A lesson's Change field must not name a change that wasn't made.**
  - **Rule:** name a step, check or bar line as the Change only once its text carries the lesson; until then, say
    that none does.
  - **Why:** in one improve-and-harden loop, a new lesson named the confirm checks as its Change while the checks
    stayed as they were. The next round, five of five cold readers reported the two as a contradiction, though a
    checker had passed the lesson's text. The round after, the checks carried one of the lesson's two tests and
    not the other, and a reader reported that too.
  - **Replay:** n/a (process lesson).
  - **Change:** the lesson format (`references/learning.md`, "Lesson format").
  - **Seen:** 2.
- **✗ A subtraction can drop more than the false claim.**
  - **Rule:** before removing text, list what else it told the reader, and keep what is true and stated nowhere
    else.
  - **Why:** in one improve-and-harden loop, a stale section was removed; it had also been the only text that
    showed one rule at work. The next two test runs stated that rule less each time, and the second left it out. Once another sentence
    was made to carry the rule, the next run stated it again.
  - **Replay:** no history yet.
  - **Change:** none in the steps yet.
  - **Seen:** 1.

## Running agents
- **✗ Launching many agents at once strands them all at one limit.**
  - **Rule:** launch up to the owner's concurrency cap (recommend starting at 2), with the rest queued.
  - **Why:** six readers launched together all stopped part-way, and about 25 helpers drained a limit in
    minutes.
  - **Change:** `queue-and-outages.md`.
  - **Seen:** 2.
- **✗ Estimate long agents by their context re-reads, not per item.**
  - **Why:** readers of about 290 items used 70–115M tokens each, mostly cache reads. A per-item estimate had
    said about 15M for the whole round, and an earlier per-window estimate was a third too high.
  - **Change:** `queue-and-outages.md`, "Cost".
  - **Seen:** 2.
- **✓ Append-only result files make every stop resumable at an exact position.**
  - **Why:** six readers resumed exactly. A blind Workflow resume re-ran finished agents.
  - **Change:** `queue-and-outages.md`.
  - **Seen:** 2.
- **✗ Continue agents stopped by a limit; never kill them.**
  - **Why:** killing queued work lost progress. In one improve-and-harden loop, a cold read stopped by a usage
    limit was continued after the reset and finished its report.
  - **Change:** `queue-and-outages.md`.
  - **Seen:** 2.
- **✗ Give each agent its own scratch folder.**
  - **Why:** shared folders twice led to overwritten helper files.
  - **Change:** `briefs.md`.
  - **Seen:** 2.
- **✗ State environment rules as concrete commands that match what agents must actually do.**
  - **Why:** abstract rules were breached repeatedly, and both of the first agents broke a "no scripts" rule.
  - **Change:** `briefs.md`.
  - **Seen:** several.
- **✗ Keep readers cold with an allow-list.**
  - **Why:** a deny-list left 7 leak paths, including files describing the two-reader design.
  - **Change:** `briefs.md`.
  - **Seen:** 1.
- **✗ Confirm what a stopped run actually did, after it has really stopped.**
  - **Why:** an early "nothing written" check was wrong, and the re-run failed on the leftover file.
  - **Change:** `queue-and-outages.md`.
  - **Seen:** 1.
- **✓ Read a silent agent's record before treating it as stalled.**
  - **Why:** in one improve-and-harden loop, a reader silent for an hour looked stalled; its own record showed
    long turns still in progress, and it finished without being touched.
  - **Replay:** n/a (process lesson).
  - **Change:** none in the steps yet.
  - **Seen:** 1.
- **✓ Label stand-in reviewers and keep a list of owed re-checks.**
  - **Why:** when the usual reviewer was out of credits, labelled stand-ins kept the work going. A list of
    179 owed items made the later re-review exact.
  - **Change:** `modes.md`.
  - **Seen:** 6.
- **✗ Don't change modes mid-round.**
  - **Why:** switching mid-round mixes two kinds of reading in one pass, so the pass can't be measured or
    trusted.
  - **Change:** `references/round.md`, "Between rounds only".
  - **Seen:** 1.

## Working with the owner
- **✗ Never leave out an option because it conflicts with a past ruling.**
  - **Why:** the omitted option was the better one, and leaving it out cost a 16-item rework and a new
    approved-exception entry.
  - **Change:** `owner-asks.md`.
  - **Seen:** 3.
- **✗ Bring the owner the trend, the cost per round and a method change yourself.**
  - **Why:** three of four course changes came from the owner, not from the writer.
  - **Change:** `owner-asks.md`.
  - **Seen:** 3.
- **✓ Stopping questions carry the counts, the cost per pass, the impact and what catches each kind later,
  and always the full-rigour option.**
  - **Why:** the owner chose full rigour all 4 times.
  - **Change:** `owner-asks.md`.
  - **Seen:** 4.
- **✗ Recommend small, serial steps.**
  - **Why:** "all units in one go" was rejected, and "two at a time" was set after a mass limit stop.
  - **Change:** `owner-asks.md`, and `queue-and-outages.md`.
  - **Seen:** 5.
- **✓ Label interpretations and read merged answers back; challenge a risky override once; keep amendments
  narrow.**
  - **Why:** merged and free-text answers read back as one rule were confirmed or corrected at once.
    Unlabelled readings had been mistaken for the owner's words.
  - **Change:** `owner-asks.md`.
  - **Seen:** more than 20.
- **✗ Check premises, and compute every count with a tool.**
  - **Why:** four reported facts or counts were wrong (for example "0 flip-backs" when there were 4).
  - **Change:** `owner-asks.md`.
  - **Seen:** 4.
- **✓ A rejected question becomes a choice rule.**
  - **Why:** one rejection reshaped 213 answers. Conflicts were re-asked, not re-decided.
  - **Change:** `owner-asks.md`.
  - **Seen:** 1.
- **✓ Owner-only questions about a rule's meaning sit on their own list and don't block zero (when the owner agrees).**
  - **Why:** such questions, listed at each pass end, let passes count. They never cover an item the
    evidence plainly refutes under an undisputed rule (`SKILL.md`, Verdicts); `boundary-silent` and `ruled-wording`
    items always block.
  - **Change:** setup question 0.
  - **Seen:** 1.
