# Confirming and fixing a wrong

The confirm checks run in SKILL.md round step 3. The fix steps run in round step 4, in this order:
1. sweep;
2. fix the seed and the hits;
3. fix the dependents;
4. re-read;
5. run the diff check;
6. commit.

Items that are not in git have no commits: copy their source files to a dated backup in `S/` before the round's
first edit (`references/setup.md`, question 9), and treat each saved fix batch as the commit the steps name.

In a unit's **first** fix round, also re-read the whole unit for every class the round reported, not just the
reported items. You do this yourself, class by class; judge each match at the evidence like a sweep hit. It is
part of the fix, not a counted pass. Whole-unit re-reads have found several times more instances than the readers named.

## The confirm checks (round step 3), in this order
1. **Rulings.** Read the accepted-by-ruling entries in `S/classes.md`. An item a ruling covers is not wrong for
   the ruled point. If the evidence refutes the wording a ruling approved, record `pending-owner`
   (`pendingReason: "ruled-wording"`) with the question "amend <ruling>?", unless the ruling's entry records that the
   owner kept it after that question (then the item is ok; a "ruled:" ok of it goes in `ruledKept`,
   `references/briefs.md`). A dispute over what a rule (SKILL.md, Terms) means, where the item's truth turns on that meaning,
   is `pending-owner` (`rule-meaning`; SKILL.md, Verdicts). A ruling that a reader's note or an item's text claims
   but the decision log doesn't hold is not a ruling: judge the claim it was used to skip, and take the claim to
   the owner in the report's open questions, with where it came from (the note, the item, or a file read outside
   the allow-list).
2. **Boundary.** If the boundary doesn't say whether the refuter's kind of evidence counts, record
   `pending-owner` (`boundary-silent`) and ask the owner.

   An item parked by check 1's ruled wording or by check 2 stays `pending-owner` even if another of its claims is
   plainly refuted: that claim's fix is drafted in `drafts/<id>.md` and held (where the item is parked after that fix was committed, such as by a fix checker's line, the fix stays); once the owner answers, the item is a
   wrong of that pass (a known wrong's or `restated` id excepted: `references/round.md`, "Known wrongs") and the
   draft is applied (`references/round.md`, "Blocked only by what a re-read can't clear").
3. **History**, including an earlier reasoned ok. If an earlier verdict gave a reasoned ok on this exact point,
   you, confirming, state in the note why that reasoning fails. One such reason is that the reader and the
   earlier ok read the item in two ways that the evidence judges differently (ambiguous wording, below); where it is
   a rule they read differently, and the item's truth turns on that, it is check 1's dispute (`pending-owner`,
   `rule-meaning`). Test both afresh (is it a dispute over a rule's meaning, and does the item read two ways?)
   before you let the earlier ok stand, and give each result in the note, a `rejected` note included ("history:
   <the ok>; rule-meaning: no, <why>; ambiguity: no, <why>"). If you can't show the reasoning fails, the item is not plainly refuted:
   don't confirm it, so it counts as that reader's false alarm (readers', fix checkers' and the writer's oks all
   count, and so does this round's other reader's reasoned ok). `confirmed.json`'s `withdrawn` list is only for
   wrongs a ruling given mid-round overturns (including a new ruling or a dated amendment that answers the
   round's own `pending` items while it waits); after a keep, the reader wrong goes in `rejected`
   (`references/round.md`, step 8).
4. **The refuter, the item type and the classes** (below). Otherwise, the evidence plainly refutes it: `wrong`.

- **History.** Earlier reasoned oks live in each round's `report.json` notes, readers' `agent-*.jsonl` lines and
  `fixcheck-*.jsonl` lines (r0 excluded; this round's included), and your near-misses in `S/boundaries.md` and dismissals in each round's `retro.md`; earlier wrongs in
  `confirmed.json`. Look up the item's id in
  those, in the unit's earlier `S/<unit>/r*/confirmed.json` files, in `S/judgments.jsonl`,
  and in any discovery state folder (the same files under `S/discovery/`, its `boundaries.md` and `judgments.jsonl`
  included;
  set config `historyFolders` so the repeat check, `flips`, `sweep` and `replay` read its rounds too; run
  `ltz searches` on `S/discovery` itself, since it does not).
  - **A repeat** (any re-confirmation of an id an earlier round of the unit confirmed, for an overlapping class, unless
    `judgments.jsonl` later overturned that earlier wrong;
    `ltz record` flags it).
    Split it two ways:
    - **The evidence plainly refutes the claim under the current bar.** Your earlier fix failed
      (`plain-fix-failure`, `new-text`), or an earlier pass missed it (`earlier-miss`), or, after a pin move,
      only the new evidence refutes it (`evidence-moved`). It is `wrong`: fix it, and log a lesson (not for
      `evidence-moved`). In `confirmed.json`, give it a `"repeatReason"` and a non-empty
      `"repeatNote"`:
      - `plain-fix-failure`: the claim an earlier round refuted still stands, perhaps reworded, whatever the
        refuter now is;
      - `new-text`: the earlier fix introduced a different claim, and that claim is wrong;
      - `earlier-miss`: a different claim of the same class, in old text, that earlier passes missed;
      - `evidence-moved`: only the new evidence refutes it, after a pin move (origin "evidence moved":
        `references/learning.md`, "The retro"); the `repeatNote` names the pin move's decision id. It is no fix
        failure and no miss: it logs no lesson and does not count toward the escalation trigger.

      Where several fit, `plain-fix-failure` wins while the refuted claim still stands, and then
      `evidence-moved` when only the new evidence refutes it.
    - **A rule's meaning is in dispute, and the item's truth turns on that meaning** (SKILL.md, Terms and Verdicts). Record it
      as `pending-owner` (`rule-meaning`) and ask the owner. A
      ruling is probably missing from the bar.

    Every repeat kept `wrong` also needs a `rulingsChecked` list: every bar ruling in the decision log, each with
    why it doesn't cover the item (`ltz record` checks the list against the log). It flags every repeat, so none
    of them slips through unmarked.
  - Items you rewrote only as dependents or cross-unit edits aren't flagged as repeats by the tool. The trigger
    for a wrong found in an item you edited covers them (`references/learning.md`, "Triggers").
- **Rulings again** before editing any sibling the sweep finds.
- **The refuter.** Confirm it at the pin, reading its whole context. A "self-contradiction:" wrong has no refuter
  line: confirm that the quoted figures are the item's own and really clash, then check its parts at the evidence.
  - If it is a different symbol with the same name, or dead text, the wrong is a false alarm. Dead text can't
    run: it is commented out, placed where it can never execute (after an unconditional return, say), or in a
    file outside the boundary. Code that nothing calls or runs, but inside the boundary, is live evidence.
  - If the verdict is right but the cite is wrong, confirm the wrong and record the correct refuter.
  - List every refuting line in the `confirmed.json` note; the first is the primary. For a refuted universal, find
    the others with an unlimited search ("Searches that back a bound", below) before you fix it, and add them.
    Cite in the item only what its new text states.
- **Classes.** Name every class that applies; an item can carry several. The repeat test matches on any overlap, so
  a class left off can hide a repeat. The first listed is the class whose claim the refuter
  falsifies: for a universal, the class whose universal it falsifies most directly; for a claim with no universal
  word (a value, a call, a relation), the class whose definition describes the part the refuter shows false. List
  order in `S/classes.md` decides only a real tie (`references/reading-classes.md`, "When two classes fit", which
  `S/classes.md` quotes for readers). It governs the wording and the regression pattern.
- **Partly true items** count as one wrong.
- **A vague relation** ("A uses B", under the bar's vague-relation class, U13 in the starter set) is `wrong`
  without a refuting line: confirm that the verb names no action the evidence could show false, and record the
  cited link as the line the rewrite will state.
- **Ambiguous wording** ("passes a timeout": the option, or its effect?) is a wrong under the bar's
  ambiguity class (if the bar has none: "A class found mid-pass" on an open bar). Rewrite the item to say one
  thing (a requirement item only by an owner ruling: "Requirement items", below). On a frozen bar with no such
  class it is not counted: list it in `outsideBar` for the owner,
  unedited unless the owner says otherwise (in text a fix wrote after this round's snapshot, a fix
  checker's find, fix it in the follow-up instead: `references/learning.md`, "Counting"). It becomes a
  `pending-owner` question only if the ambiguity is in a rule.
- **Requirement items.** If the item states a requirement and the evidence does not meet it, record the
  verdict `defect`, work it and log it in `S/defects.md` (`references/debugging.md`), and leave the item (see
  "Requirement items" below). A
  `defect` is not counted as a wrong.
- **Owner questions.** An item is `pending-owner` only under SKILL.md's Verdicts exceptions (checks 1 and 2
  above). It is never counted wrong and never decided by the loop. Any other item the evidence plainly refutes
  stays `wrong` while questions are open, an override question included.
- **A reader wrong you don't confirm** (a false alarm: check 3's reasoned ok, a different symbol, dead text)
  goes in `confirmed.json`'s `rejected` list, with the reason and the file:line that answers the refuter (for an item a ruling covers, the ruling id and its
  accepted-by-ruling entry as `S/classes.md:<line>`), or a note starting "history:" that names the earlier
  reasoned ok, or, for a "self-contradiction:" wrong, a note that quotes the item's figures and shows they agree,
  citing the item's own file:line. A dismissal needs the same grounding as a
  confirmation: doubt you can't tie to a line you read is not a reason. `ltz record` refuses a reader wrong that
  is in no list, and the stronger reviewer re-judges the rejected list (`references/round.md`, step 5). The
  exceptions are a counted round's reader wrongs in no line `record` uses (r0's never count), such as a parent's or an earlier rerun's in lines a later
  re-run supersedes (`references/briefs.md`, "Verifying the readers' work"), a `replaced` rerun's, a removed
  duplicate or stray line's, a reply-only one (`references/queue-and-outages.md`), and the solo cold sample's
  (`references/modes.md`). Each goes in `retro.md` with its reason and the file:line that answers it, and counts with that reader's false alarms in the report
  (`references/owner-asks.md`, "Reporting a round", item 2). An id takes one list: where readers' wrongs on it need
  different ones, it takes the first of the wrongs, `pending`, `defects`, `withdrawn`, `outsideBar`, `restated` and
  `rejected` (an item check 1's ruled wording or check 2 parks goes in `pending` all the same), and each other reader
  wrong on it that would go in `rejected` is noted in `retro.md` the same way, except that where the id is in the
  wrongs it is not added to that reader's false alarms (`record` already counts the reader as finding the id); one
  that would go in `outsideBar` is still listed for the owner in the report.

## 1. Sweep
- **Write the class's sweep patterns first,** at least as wide as the seed. Sweep along every axis, not just
  the wording:
  - **subject:** the behaviour or set the claim is about;
  - **cited range:** every item citing the same source lines (a pattern with `"fields": ["cites"]`);
  - **phrasing variants:** the same claim in other words;
  - **named file:** every item naming the same file or test.

  A sweep that matches only the fixed wording proves the fix did not regress. It does not show the class
  has no other members.
- **Test the patterns.** Together they must hit every known instance of the class: the seed, earlier confirmed
  wrongs of that class, and any item later found to have been missed. List each instance in the `knownInstances`
  of a pattern that hits it: `ltz sweep` refuses a pattern with none and checks each pattern only against its own
  list, so checking that the set covers every instance is yours. A set that misses one is too narrow, so widen it
  and log a lesson.
- **Run them over every item, in every unit,** and judge each hit at the evidence. Hits outside the unit follow
  SKILL.md's cross-unit rules.
- **Keep it.** The wrong-wording form of the pattern (the false phrase itself) joins `S/checks/patterns/` as
  a permanent regression pattern, marked `"regression": true`. Write it to match the unbounded phrase only,
  so a properly bounded rewrite isn't flagged, whether its scope comes after the claim (a negative lookahead)
  or before it ("Outside scripts/, no caller ...": anchor the pattern to the clause start).
  Known instances are tested against the snapshots where they occurred. Every regression pattern is re-run after each
  later fix batch. The other axes (subject, cited range, named file) are only for finding hits, because a
  fixed item still cites the same lines.
- **A class that keeps coming back** is drained with narrow falsifiers, not a heavy pre-sweep (their first use in a
  project is trialled under `references/learning.md`, "Trying a new check or a new method"; if they fail that
  test, ask the owner which drain to use):
  1. extract every claim clause of that class across all items;
  2. test each clause at the evidence, and keep as the sweep's finds only the claims you can prove false.

  In one project this checked 706 claims for about 2.4M tokens and found 16 new wrongs, while a heavy
  pre-sweep had cost about 7.4M for half its chunks.
- **Never exempt from a sweep a range of items (or a unit) that once came back clean.** One range excluded "to
  avoid regressing a clean range" then held 5 wrongs.

## 2. Fix the seed and the hits
First ask whether exclusivity is the point of the item. Every "only" or "no" asserts sole-ness, so that is not the
test. It is the point when the item exists to state it (without the "only" or "no", it would tell a reader
nothing they need, as in an item about who reads a table).
You decide, and note why in the item's `confirmed.json` note (for an item in another unit, in its
`cross-unit-edits.txt` line; for any other fix with no `confirmed.json` entry, such as a dependent logged in `fixlog.jsonl`
only, a known wrong applied in round F or a follow-up of a find in text a fix wrote, in the round's `retro.md` under
its fix batch's expected effect, step 5). A requirement item never takes this path: it keeps
its claim, or the gap is a `defect` (a copying error from its own source is fixed: "Requirement items", below). For a descriptive item: if it is, keep the claim, state its scope and prove it (3 below). If it isn't, or it's
unclear, subtract (1 below), or keep the claim with a proven scope (3 below).
Every fix follows sub-steps 2 to 4 below (new facts read at the pin, proven bounds, one wording per class).
1. **Subtraction** (dropping a false or unproven clause) is never softening. **If
   softening is allowed,** you may hedge: open the list with "such as"
   or "for example". **If it is not allowed,** subtract, or keep the claim and state its proven scope (for a
   descriptive item). A requirement item is never narrowed to fit the evidence: a requirement the evidence does not meet
   is a `defect`, not a fix (see "Requirement items").
2. **State a new fact only if you have read it at the pin,** and cite it.
   - Before writing, list each new fact in the added text with its source line.
3. **A bound stays only if it is proven.** Scope it, back it with an unlimited search, and name that search
   in `fixlog.jsonl`. Example: "outside tests and scripts, only the billing service reads RATE".
   - **Which search to log:** one over the whole boundary. Judge every hit, including those the scope excludes,
     and add a `scopeNote` and `scopeText` (the scope words), so `ltz diffcheck` keeps the bound in the text
     after later edits.
   - Adding a member to a closed list ("only A and B") is a new universal. It needs the same proof.
4. **One wording per class.** Fix every hit of a class with one wording, reused from an earlier fix of that class
   already found correct (not `S/precedents.md`, which readers read) or the source's own words. Don't write fresh prose for each item.
   - **A wording no fix of the class has used yet is tried on one item first:** take that item through steps 3
     to 6 (dependents, re-read, diff check, commit) and the fix check of that commit (iteration K); once that check returns 0 for the
     item, apply the wording to the other hits in the next follow-up commit (iteration K+1).
5. **Write each fix's expected effect before applying a fix batch,** in the round's `retro.md` under that fix batch: the
   ids and fields it changes, and what it should leave unchanged. After the commit, compare the diff and `fixlog.jsonl` with it; a change you didn't
   expect (another field, another item, a fix that didn't land) is checked before the fix checker, and is a lesson.
   With two fixes to one field in a fix batch, the later one wins: merge them into one edit of the field. If each adds a
   bound, log that edit as chained entries, each with its own search (section 5).

## 3. Dependents
Search for items that cite the changed item or restate its conclusion, in this unit and in others. Fix them
the same way. Those outside the unit follow the cross-unit rules (one made stale only by the fix's new text is
logged there with verdict "ok", as no find, or, in a closed unit, as a `stale` lead: `references/state-template.md`). A dependent in this unit that the evidence
refutes at the snapshot is a wrong of the round: confirm it (the confirm checks) and add it to `confirmed.json`
with `foundBy: "sweep"` before its fix. One made stale only by the fix's new text is logged in `fixlog.jsonl` only.

## 4. Re-read
Re-read the whole of every changed item:
- **every field.** A fix to one field leaves the same claim stale in the others, often paraphrased so that a
  word match misses it. Carry the change across by hand.
- **its cites,** and any "so …" step that rested on the old wording;
- **any list your new wording might now close;**
- **every item the new text names** ("see X", "as X states"). Open each one and check that it really
  holds the claim. Reading the diff alone missed wrong cross-references.

## 5. The diff check (mechanical: `ltz diffcheck`)
First re-run the project's extract script, so that `S/items.jsonl` holds the edited items.
- **Every changed field goes in `fixlog.jsonl`,** cites included.
- **Universals.** Any changed clause that holds a universal word (`references/reading-classes.md`), whether
  added or kept, is cleared only by `search` and `hits` in `fixlog.jsonl` for that id and field, or by an edit
  that removes the universal word. A qualifier alone ("probably", "usually") does not clear it. A universal word
  used in another sense ("disables the timeout" rather than "no timeout") is cleared by rewording. The same applies to any list in such a clause:
  "only A" turned into "only A and B" is caught. A changed clause holding a list of 3 or more with no hedge word ("such as", "for example", "e.g.", "among
  others") also needs the logged search, even after the universal word is removed (`scripts/README.md`, "New lists"). The
  tool flags only a series written with a comma before its "and" or "or" ("A, B, and C"); a list written without
  it ("A, B and C") needs the same search, and catching it is yours, as it is for an "N per …" clause, which the
  tools' universal check doesn't flag by default (`references/reading-classes.md`, "The universal words"). One
  logged search clears every flagged clause and list in its field, so a second bound in the same field needs its
  own search: log the edit as two chained entries for that field (the first one's `new` holds only the first
  bound), each with its search. Clauses you didn't change aren't flagged: the readers judged
  them, and your re-read (section 4) covers how your edit changes what they mean.
- **`judged`.** A search that backs a universal lists every hit you judged at the pin, one entry each:
  `"judged": [{"at": "path:line", "why": "<short reason>"}]`. `ltz diffcheck` re-runs the search and requires the
  `at` values to match the actual hit locations, each with a non-empty `why`: a count alone proves nothing about
  each hit.
- **`blindSpots`.** A structured search also states what it can't see (options in variables, calls split over
  lines, dynamic names). `diffcheck` fails without it.
- **`search` and `hits`.** `search` is a structured search `{"regex", "flags", "paths", "count"}`, which
  `ltz diffcheck` re-runs at the pin by default to check `hits` (its count, in the search's `count` unit: matches, lines or files). A free-text
  search fails. `diffcheck` fails paths narrower than `boundaryPaths` unless a `scopeNote` explains the bounded
  claim and a `scopeText` (the scope words) appears in the new text; the search to log is still one over the
  whole boundary (section 2, step 3).
- **Closed units.** No changed item may belong to a closed unit.
- **Patterns.** No changed item may still match a regression pattern. `ltz diffcheck` re-runs them all. A match only
  in wording you may not change (wording a ruling approved, or a requirement's claim): hold that item's fix as a
  draft and ask the owner "retire regression pattern <id>, or amend <ruling>?" ("retire it, or rule on the item's
  wording?" for a requirement). On a retire, set its `"regression"` to false and apply the draft.
- **Shape.** Check the whole changed field, not a window around the edit: run-on sentences from appended
  clauses, stacked parentheticals, a clause appended with no sentence stop.
- **Change set.** Diff every field of every item against the round's snapshot. The changed set must equal
  the set logged in `fixlog.jsonl`. If an external reviewer is in use, a categorical value change (a field with a fixed
  set of values, such as a status) also goes on `S/owed-rechecks.txt`.

A lesson that keeps recurring needs a check that runs, not more words.

## 6. Commit
- Stage explicit paths, on the branch the owner approved, with the approver's OK where setup question 9 named one.
- **Gate scripts must pass the exit status through pipes.** Before trusting a green gate, show that it fails
  on a known-bad input.
- **A gate that fails for a reason outside the items** (a flaky network check, a stray file) is re-run when
  transient. A real one is fixed as its own change.

## Searches that back a bound
These rules hold for every such search: a reader's, the fix checker's, and yours in a spot-check, a confirm check
or a fix.
- **Show that the search can hit.** Zero hits back a bound only after the same command, on the same paths,
  finds something known to be there (the item's own cited name, or a line you have read). A wrong path, a bad
  escape, a skipped file type or an encoding mismatch also prints nothing. Check the exit status too (`rg` exits
  2 on an error, 1 on no match). Name the control in the note (for a fix's search, where "2. Fix the seed and the
  hits" has you note why: the item's `confirmed.json` note, its `cross-unit-edits.txt` line, or `retro.md`).
- **No output limit at any layer:** no `| head`, the search tool's own result cap off, and shell output not
  truncated. To keep each output small, split the boundary into path sets that together cover it; `-l` or `-c` shows
  where the hits are, and each hit is then read.
- **Search the whole evidence boundary** the owner approved.
- **Look past the literal name:**
  - aliases and re-exports;
  - wrappers that pass the value through;
  - string-built names;
  - config keys.

  State in the note what the search cannot see.
- **When an item states a rule and its exceptions,** read the whole implementation once and list every
  case. Patching one exception per round kept the same item wrong for three rounds.
- **After two fixes of the same universal have failed** (the id is confirmed wrong a third time, and each earlier
  fix narrowed the claim), don't narrow it a third time, and say so in the `repeatNote`. Adding an exception
  ("every X except Y") or another qualifier is a narrowing too, proven or not. Subtract the universal, or
  replace it with a claim with no universal that the cited lines show (what the code does there, not what it
  does everywhere). This wins over section 2's "keep the claim, state its scope" even where exclusivity is the
  item's point: after two failed scopes the exclusivity is not established, so subtract it and say in the report
  that the item lost that point.

## Carrying a ruling into the items
When the owner rules, or a ruling is amended, and it changes behaviour, search every item for the old
behaviour it changes:
- by the ruling's terms;
- by its notes and linked entries;
- by the source ranges it cites.

Update every field that carries the behaviour, not just the headline. A ruling left only in headlines
gives the work nothing to build. Rulings not carried to every affected item were the largest single class of wrongs
in a long discovery phase.

## Bulk writes are not checked writes
Anything written in bulk (fields filled in bulk, applied owner answers, mass relabels) gets the same content check as
a fix, through the fix checker. "Write-checked" is not "judged".

## After the fix checker
An "old text held" find on an edit that answered no wrong (a revert, a stale dependent, a ruling carried
into the items, an applied owner answer) overturns nothing: note it in `retro.md` with the edit's basis, and judge
only the new text. On a fix, it means the wrong the fix answered was false: confirm it at the pin, then treat it as an
overturned verdict ("Reverting fixes caused by false wrongs", below) and log a lesson. Fix its other real wrongs as a follow-up commit (a find in old text is swept first: steps 1 to 6), then run the fix
checker on that follow-up's items (iteration
K+1). Repeat until a check returns 0; it usually takes one or two. A fix checker's wrong you don't confirm goes in
the round's `retro.md` under its iteration, with its reason and the file:line that answers it, or, where the
confirm checks park it, the question it waits on; a check whose only wrongs are so noted, or placed where no follow-up fixes them (such as an `outsideBar` entry, a
lead or a "deferred" line), counts as returning 0 (`record` still counts them, so report it as "returned 0 after
n noted", naming `retro.md`).

## Reverting fixes caused by false wrongs
When a verdict is overturned (by the owner, your own re-check (recorded as `spot-check`), a fix checker's "old text held" or a ruling):
0. If the wrong is in the current round's `confirmed.json`, take it out of the wrongs. A wrong no reader marked
   (one with a `foundBy`) is removed, whatever overturned it, with its `judgments.jsonl` line as the record. For a
   reader-marked wrong: one a ruling given this round (a new one, or an amendment) overturns goes in `withdrawn`, and so does an owner's overturn that rests on a rule, scope or definition (it is recorded
   as a bar ruling; a bare "it's fine" on a plainly refuted item is a wish: `references/owner-asks.md`); an overturn
   under a ruling already in the bar goes in `rejected` with its `S/classes.md:<line>`;
   any other that a reader marked (your re-check's, an "old text held") goes in `rejected`, with the file:line that backs the old text.
   Re-run `record`.
1. Re-read every edit it caused, siblings included.
2. Revert the edits that removed accurate content or now contradict the ruling, after the round's reading: in
   this unit, and in units not yet closed (a unit in `final-check` counts as closed here: SKILL.md, "Cross-unit effects") where this unit's false wrongs caused cross-unit edits (log those as
   cross-unit edits). In closed units, log a lead instead. Other units' own verdicts that the same flaw could
   have produced are re-judged at their next round (`references/learning.md`, "Back-propagation").
3. Log each revert of an earlier round's edit in `fixlog.jsonl` with `"ruling": "<ruling id>"`, or
   `"judgment:<round>:<id>"` for an overturn that isn't a ruling (a spot-check, say; `"judgment:discovery/<round>:<id>"` when a main-loop entry cites a
   discovery pass's verdict; within discovery, the plain form). `ltz flips` then reports the revert as a flip the
   ruling explains, not as an unclear definition, when that judgments line concerns the reverted item
   (`scripts/README.md`, "Flips"). A revert that returns a field to this round's snapshot value
   instead drops that field's entries from this round's `fixlog.jsonl` (`ltz diffcheck` refuses an entry for a
   field that did not change), and is recorded with its reference in `retro.md`. Retire any regression pattern born
   from the false wrong: set its `"regression"` to false (the file stays, for its known instances).
4. Re-run extract, run `ltz diffcheck` and commit (sections 5 and 6), then run the fix checker on the reverts.
5. List the harmless hedges in the round's `retro.md`, for the report to the owner, instead of reverting them.

## Requirement items
A value mismatch depends on what the cite is:
- the cite is the requirement's own source (the policy): a copying error, so fix the item;
- the cite is the implementation (the config): a `defect`.

When an item states a requirement (a control or a policy) and the evidence does not meet it (the exception for configs: `references/setup.md`, "Policy and config evidence"):
- the mismatch goes to `S/defects.md` for the owner;
- the item is not softened to match the evidence, unless the owner rules so;
- a copying error (a wrong file, key, value or name) is fixed like any other wrong;
- any other change (an ambiguity rewrite, for example) needs an owner ruling: hold the draft (`drafts/<id>.md`)
  under that question, and log the ruling id in the fixlog's `ruling`. In its accepted-by-ruling entry, what readers
  still judge includes whether the evidence meets the requirement.

`ltz diffcheck` enforces this for items whose `type` is `"requirement"`: every changed field's fixlog entry needs
`"basis": "copying-error"` with `"source"` (the file:line the item copies), or a `"ruling"` id. It accepts any
non-empty `ruling`, so checking what it names is yours: a bar ruling, or a revert's `judgment:` reference; a pin
move's `P-n` only beside `"basis": "copying-error"`.
