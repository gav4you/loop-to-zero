# Confirming and fixing a wrong

The confirm checks run in SKILL.md round step 3. The fix steps run in round step 4, in this order:
1. sweep;
2. fix the seed and the hits;
3. fix the dependents;
4. re-read;
5. run the diff check;
6. commit.

Items that are not in git have no commits: copy their source files to a dated backup in `S/` before the round's
first edit (`references/setup.md`, question 9), and treat each saved batch of edits as the commit the steps name.

In a unit's **first** fix round, also re-read the whole unit for every class the round reported, not just the
reported items. You do this yourself, class by class; judge each match at the evidence like a sweep hit. It is
part of the fix, not a counted pass. Whole-unit re-reads have found several times more instances than the readers named.

## The confirm checks (round step 3), in this order
1. **Rulings.** Read the accepted-by-ruling entries in `S/classes.md`. An item a ruling covers is not wrong for
   the ruled point. If the evidence refutes the wording a ruling approved, record `pending-owner`
   (`pendingReason: "ruled-wording"`) with the question "amend <ruling>?", unless the ruling's entry records that the
   owner kept it after that question (then the item is ok; a "ruled:" ok of it goes in `ruledKept`,
   `references/briefs.md`). A dispute over what a rule means, where the item's truth turns on that meaning, is
   `pending-owner` (`rule-meaning`; SKILL.md, Verdicts).
2. **Boundary.** If the boundary doesn't say whether the refuter's kind of evidence counts, record
   `pending-owner` (`boundary-silent`) and ask the owner.
3. **History**, including an earlier reasoned ok. If an earlier verdict gave a reasoned ok on this exact point,
   you, confirming, state in the note why that reasoning fails. One such reason is that the reader and the
   earlier ok read the item in two ways that the evidence judges differently (ambiguous wording, below); where it is
   a rule they read differently, and the item's truth turns on that, it is check 1's dispute (`pending-owner`,
   `rule-meaning`). If you can't, the item is not plainly refuted:
   don't confirm it, so it counts as that reader's false alarm (readers', fix checkers' and the writer's oks all
   count, and so does this round's other reader's reasoned ok). `confirmed.json`'s `withdrawn` list is only for
   wrongs a ruling given mid-round overturns.
4. **The refuter, the item type and the classes** (below). Otherwise, the evidence plainly refutes it: `wrong`.

- **History.** Earlier reasoned oks live in each round's `report.json` notes, readers' `agent-*.jsonl` lines and
  `fixcheck-*.jsonl` lines (r0 excluded; this round's included), and your near-misses in `S/boundaries.md`; earlier wrongs in
  `confirmed.json`. Look up the item's id in
  those, in the unit's earlier `S/<unit>/r*/confirmed.json` files, in `S/judgments.jsonl`,
  and in any discovery state folder (the same files under `S/discovery/`, its `boundaries.md` and `judgments.jsonl`
  included;
  set config `historyFolders` so the repeat check, `flips`, `sweep` and `replay` read its rounds too; run
  `ltz searches` on `S/discovery` itself, since it does not).
  - **A repeat** (any re-confirmation of an id an earlier round of the unit confirmed, for an overlapping class;
    `ltz record` flags it).
    Split it two ways:
    - **The evidence plainly refutes the claim under the current bar.** Your earlier fix failed
      (`plain-fix-failure`, `new-text`), or an earlier pass missed it (`earlier-miss`). It is `wrong`: fix it,
      and log a lesson. In `confirmed.json`, give it a `"repeatReason"` and a non-empty
      `"repeatNote"`:
      - `plain-fix-failure`: the claim an earlier round refuted still stands, perhaps reworded, whatever the
        refuter now is;
      - `new-text`: the earlier fix introduced a different claim, and that claim is wrong;
      - `earlier-miss`: a different claim of the same class, in old text, that earlier passes missed.
    - **A rule's meaning is in dispute, and the item's truth turns on that meaning** (SKILL.md, Verdicts). Record it
      as `pending-owner` (`rule-meaning`) and ask the owner. A
      ruling is probably missing from the bar.

    Every repeat kept `wrong` also needs a `rulingsChecked` list: every bar ruling in the decision log, each with
    why it doesn't cover the item (`ltz record` checks the list against the log). It flags every repeat, so none
    of them slips through unmarked.
  - Items you rewrote only as dependents or cross-unit edits aren't flagged as repeats by the tool. The trigger
    for a wrong found in an item you edited covers them (`references/learning.md`, "Triggers").
- **Rulings again** before editing any sibling the sweep finds.
- **The refuter.** Confirm it at the pin, reading its whole context.
  - If it is a different symbol with the same name, or dead text, the wrong is a false alarm. Dead text can't
    run: it is commented out, placed where it can never execute (after an unconditional return, say), or in a
    file outside the boundary. Code that nothing calls or runs, but inside the boundary, is live evidence.
  - If the verdict is right but the cite is wrong, confirm the wrong and record the correct refuter.
  - List every refuting line in the `confirmed.json` note; the first is the primary. For a refuted universal, find
    the others with an unlimited search ("Searches that back a bound", below) before you fix it, and add them.
    Cite in the item only what its new text states.
- **Classes.** Name every class that applies; an item can carry several. The repeat test matches on any overlap, so
  a class left off can hide a repeat. The first listed is the class whose universal
  the refuter falsifies most directly (on a tie, the one listed first in `S/classes.md`). It governs the wording and the regression pattern.
- **Partly true items** count as one wrong.
- **Ambiguous wording** ("passes a timeout": the option, or its effect?) is a wrong under the bar's
  ambiguity class (if the bar has none: "A class found mid-pass" on an open bar). Rewrite the item to say one
  thing (a requirement item only by an owner ruling: "Requirement items", below). On a frozen bar with no such
  class it is not counted: list it in `outsideBar` for the owner,
  unedited unless the owner says otherwise. It becomes a
  `pending-owner` question only if the ambiguity is in a rule.
- **Requirement items.** If the item states a requirement and the evidence does not meet it, record the
  verdict `defect`, work it and log it in `S/defects.md` (`references/debugging.md`), and leave the item (see
  "Requirement items" below). A
  `defect` is not counted as a wrong.
- **Owner questions.** An item is `pending-owner` only under SKILL.md's Verdicts exceptions (checks 1 and 2
  above). It is never counted wrong and never decided by the loop. Any other item the evidence plainly refutes
  stays `wrong` while questions are open, an override question included.
- **A reader wrong you don't confirm** (a false alarm: check 3's reasoned ok, a different symbol, dead text)
  goes in `confirmed.json`'s `rejected` list, with the reason and the file:line that answers the refuter, or a
  note starting "history:" that names the earlier reasoned ok. A dismissal needs the same grounding as a
  confirmation: doubt you can't tie to a line you read is not a reason. `ltz record` refuses a reader wrong that
  is in no list, and the stronger reviewer re-judges the rejected list (`references/round.md`, step 5).

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
- **A class that keeps coming back** is drained with narrow falsifiers, not a heavy pre-sweep:
  1. extract every claim clause of that class across all items;
  2. test each clause at the evidence, and keep as the sweep's finds only the claims you can prove false.

  In one project this checked 706 claims for about 2.4M tokens and found 16 new wrongs, while a heavy
  pre-sweep had cost about 7.4M for half its chunks.
- **Never exempt a part that once came back clean.** One part excluded "to avoid regressing a clean batch"
  then held 5 wrongs.

## 2. Fix the seed and the hits
First ask whether exclusivity is the point of the item. Every "only" or "no" asserts sole-ness, so that is not the
test. It is the point when the item exists to state it (without the "only" or "no", it would tell a reader
nothing they need, as in an item about who reads a table).
You decide, and note why in the item's `confirmed.json` note (for an item in another unit, in its
`cross-unit-edits.txt` line). A requirement item never takes this path: it keeps
its claim, or the gap is a `defect` (a copying error from its own source is fixed: "Requirement items", below). For a descriptive item: if it is, keep the claim, state its scope and prove it (3 below). If it isn't, or it's
unclear, subtract (1 below), or keep the claim with a proven scope (3 below).
Every fix follows 2 to 4.
1. **Subtraction** (dropping a false or unproven clause) is never softening, and is always allowed for descriptive items. **If
   softening is also allowed,** you may hedge: open the list with "such as"
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
   - Adding a member to a closed list ("only A and B") is a new universal. It needs the same proof; without
     it, subtract, or open the list if softening is allowed.
4. **One wording per class.** Fix every hit of a class with one wording, reused from an earlier fix of that class
   already found correct (not `S/precedents.md`, which readers read) or the source's own words. Don't write fresh prose for each item.
   - **A wording no fix of the class has used yet is tried on one item first:** fix that item, re-read it and
     fix-check it, and only once the check returns 0 apply the wording to the other hits (a follow-up commit).
5. **Write each fix's expected effect before applying a batch:** the ids and fields it changes, and what it
   should leave unchanged. After the commit, compare the diff and `fixlog.jsonl` with it; a change you didn't
   expect (another field, another item, a fix that didn't land) is checked before the fix checker, and is a lesson.
   With two fixes to one field in a batch, the later one wins: merge them into one.

## 3. Dependents
Search for items that cite the changed item or restate its conclusion, in this unit and in others. Fix them
the same way. Those outside the unit follow the cross-unit rules.

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
  "only A" turned into "only A and B" is caught. A changed clause holding a list of 3 or more with no "such as" also
  needs the logged search, even after the universal word is removed (`scripts/README.md`, "New lists"). Clauses you didn't change aren't flagged: the readers judged
  them, and your re-read (section 4) covers how your edit changes what they mean.
- **`judged`.** A search that backs a universal lists every hit you judged at the pin, one entry each:
  `"judged": [{"at": "path:line", "why": "<short reason>"}]`. `ltz diffcheck` re-runs the search and requires the
  `at` values to match the actual hit locations, each with a non-empty `why`: a count alone proves nothing about
  each hit.
- **`blindSpots`.** A structured search also states what it can't see (options in variables, calls split over
  lines, dynamic names). `diffcheck` fails without it.
- **`search` and `hits`.** `search` is a structured search `{"regex", "flags", "paths", "count"}`, which
  `ltz diffcheck` re-runs at the pin by default to check `hits` (how many matches it returned). A free-text
  search fails. `diffcheck` fails paths narrower than `boundaryPaths` unless a `scopeNote` explains the bounded
  claim and a `scopeText` (the scope words) appears in the new text; the search to log is still one over the
  whole boundary (section 2, step 3).
- **Closed units.** No changed item may belong to a closed unit.
- **Patterns.** No changed item may still match a regression pattern. `ltz diffcheck` re-runs them all.
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
  2 on an error, 1 on no match). Name the control in the note.
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
An "old text held" find means the wrong the fix answered was false: confirm it at the pin, then treat it as an
overturned verdict ("Reverting fixes caused by false wrongs", below) and log a lesson. Fix its other real wrongs as a follow-up commit (a find in old text is swept first: steps 1 to 6), then run the fix
checker on that follow-up's items (iteration
K+1). Repeat until a check returns 0; it usually takes one or two.

## Reverting fixes caused by false wrongs
When a verdict is overturned (by the owner, a spot-check or a ruling):
1. Re-read every edit it caused, siblings included.
2. Revert the edits that removed accurate content or now contradict the ruling, after the round's reading: in
   this unit, and in units not yet closed where this unit's false wrongs caused cross-unit edits (log those as
   cross-unit edits). In closed units, log a lead instead. Other units' own verdicts that the same flaw could
   have produced are re-judged at their next round (`references/learning.md`, "Back-propagation").
3. Log each revert in `fixlog.jsonl` with `"ruling": "<ruling id>"`, or `"judgment:<round>:<id>"` for an overturn
   that isn't a ruling (a spot-check, say; `"judgment:discovery/<round>:<id>"` when a main-loop entry cites a
   discovery pass's verdict; within discovery, the plain form). Retire any regression pattern born from the false wrong. `ltz flips` then reports it as a flip
   the ruling explains, not as an unclear definition.
4. Run the fix checker on the reverts.
5. List the harmless hedges in the round's `retro.md`, for the report to the owner, instead of reverting them.

## Requirement items
A value mismatch depends on what the cite is:
- the cite is the requirement's own source (the policy): a copying error, so fix the item;
- the cite is the implementation (the config): a `defect`.

When an item states a requirement (a control or a policy) and the evidence does not meet it:
- the mismatch goes to `S/defects.md` for the owner;
- the item is not softened to match the evidence, unless the owner rules so;
- a copying error (a wrong file, key, value or name) is fixed like any other wrong;
- any other change (an ambiguity rewrite, for example) needs an owner ruling: hold the draft (`drafts/<id>.md`)
  under that question, and log the ruling id in the fixlog's `ruling`. In its accepted-by-ruling entry, what readers
  still judge includes whether the evidence meets the requirement.

`ltz diffcheck` enforces this for items whose `type` is `"requirement"`: every changed field's fixlog entry needs
`"basis": "copying-error"` with `"source"` (the file:line the item copies), or a `"ruling"` id.
