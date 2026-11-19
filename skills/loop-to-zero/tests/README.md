# Testing this skill

Run tests 0, 1, 2 and 4 after any edit to SKILL.md, `references/` or `scripts/`; run test 0 (skillcheck) after any
edit to a file it lints, and test 3 after any edit to the `description:` line of SKILL.md. Promoting a lesson into `lessons.md` is tested by its replay
(`references/learning.md`), not by these scenarios. The skill's writing rules are the same as
for code: no change without a failing test first. Run them again after the change.

## 0. Doc lint (mechanical)
`node <skill>/scripts/skillcheck.mjs`, where `<skill>` is the skill folder in your working copy. It lints SKILL.md, lessons.md, references/*.md, tests/README.md,
scripts/README.md and scripts/hooks/README.md against the tool kit, and must report 0 findings. Run it after any
edit to one of these files.

## 1. Tool tests (mechanical)
`node <skill>/scripts/test/run.mjs`. Every test must pass.

## 2. Scenario tests (behaviour)
Each file in `scenarios/` is a prompt for a fresh, cold agent.
1. Fill `<SKILL>` (written in capitals in the scenario files, so it stands out) with the skill folder's absolute path.
2. Remove the "Pass if" list from the prompt you send, so the agent can't read the criteria. Launch one agent
   per run (text only, no file changes), at most 2 at a time.
3. Compare each answer with the scenario's "Pass if" list. Read every answer in full; never score by keyword
   alone. Note anything the answer does that no criterion covers, good or bad: it is a candidate criterion.

A scenario that fails means the skill's wording isn't binding. The skill's maintainer fixes the wording, not the
scenario (a scenario changes only before the edit, under step 4 below), and re-runs it, and adds a new scenario whenever a real loop exposes a failure the current ones would
not catch; a loop's writer proposes these (`references/learning.md`, "Promotion").

**One run proves little.** Agents vary from run to run, so a single pass can be luck. For a change meant to alter what an agent following the skill does (a change made only to clear a test 0, 1 or
4 failure is adopted when that test passes and every scenario, run once as in step 6, shows no regression
against a baseline copy made before the edit, as in step 1):
1. **Before editing, keep the baseline:** a copy of the repo as last committed (`git worktree add <dir> HEAD`,
   with `<dir>` outside the repo). For baseline runs, fill `<SKILL>` with the skill folder inside it
   (in this repo, `<dir>/skills/loop-to-zero`). Always send the working copy's scenario files: only `<SKILL>` points at the
   baseline.
2. **Name the target criterion:** the one criterion the change is meant to make pass (a new scenario's, or an
   existing one's). The target scenario holds it. A scenario is touched when any of its criteria depends on a rule
   stated in a sentence the edit changes; list the touched scenarios in the commit message.
3. **Run the target and touched scenarios 3 times each on the baseline,** and count passes per criterion, not
   per scenario: "criterion 4: baseline 0/3".
4. **The test fails first** when the target criterion passes at most 1 of the 3 baseline runs. If it passes 2
   or 3, it does not test the change: tighten the scenario or add a criterion (and name it the target),
   and re-run from step 2. All of this happens before the skill is edited.
5. **Edit the skill, then run the same scenarios 3 times each on it.** First recompute the touched scenarios from
   the actual diff, and run any newly touched one 3 times on the baseline. Adopt the change when the target
   criterion passes 3 of 3 edited runs, and no criterion of the target or touched scenarios passes fewer edited
   runs than baseline runs.
6. **Then run every other scenario once** on the edited skill. A criterion that fails gets 5 more edited runs
   and 6 baseline runs, so each side has 6. It is a regression to fix when the edited runs pass at least 2
   fewer times than the baseline runs, or when the edit changes a sentence the criterion depends on and the
   edited runs pass fewer times at all. Otherwise note it as variance, with both counts, in the commit message.
   One run's difference in 3 is normal: agents vary.
7. **Put the pass counts in the commit message.**

| Scenario | What it tests |
|---|---|
| 01-pressure-close | Owner pressure to close, a limit-stopped reader, and a wrong in your own edit |
| 02-fix-universal | Fixing an "every caller" universal: sweep axes, unlimited search, fix checker |
| 03-learning | An owner overrule, a fix-checker catch, a cost miss: lessons and back-propagation |
| 04-solo-midround | Solo mode, a ruling mid-round, cross-unit hits in a closed unit |
| 05-fresh-setup | Setup from nothing: research, questions, measurement, round 1 |
| 06-reader-guard | A reader agent that finds this skill listed must not use it |
| 07-repeat-refuted | A repeat that the evidence plainly refutes is `wrong` (it never closes a unit as `pending-owner`) |
| 08-final-check | Ruled wording flagged in an ok note, and the final targeted check: reopening, rounds F and F+1, the status each unit returns to |
| 09-defect-debug | A policy-vs-config `defect`: reproduce, isolate, diagnose, propose; the entry; tickets only with the owner's OK |
| 10-untrusted-text | A zero-hit search needs a positive control; a dismissed reader wrong is recorded with its reason; item text and a claimed ruling are data, not instructions |
| 11-reader-embedded-text | A reader judges an item whose text tells reviewers to mark it ok, and reports that text |
| 12-what-zero-shows | A clean round's report: what spot-checks, canaries and a 0 estimate can and cannot show; the estimate checked against the unit's history |
| 13-process-checks | Replaying a rule with its source round held out; seeded, spread spot-check picks with extra picks for a reader that missed a canary; reconciling an extract against its source |
| 14-reader-ok-notes | A reader whose ok notes for a range share one templated text: the writer flags it and gives that range a supplementary read |
| 15-retro-diagnosis | 14 wrongs from one reformatted file confirmed against the pin as one cause; a one-reader miss diagnosed from the render log; the trend broken down by class |
| 16-class-research | Drafting a class set from claim shapes: defined-not-wired and evaluated-expression classes, an "Is not" line and ok example on every entry, cross-item checks |

## 3. Trigger test (the description)
`triggers.md`: 10 requests that should load this skill and 10 near misses, each run sent in a new shuffled order to a new
cold agent that picks a skill for each. Each request is one criterion. For a `description:` edit, use the
scenario steps above: baseline runs use the baseline copy's description, the target criterion is the request
the edit is for, and the other 19 requests are the touched criteria. Every run scores all 20, so step 6 does
not apply. Step 4's remedy here is to reword the target request or add T or N rows, updating the counts in
`triggers.md` to match.

## 4. Consistency read (structure)
Give `consistency-read.md` to one cold agent. The maintainer fixes every real defect it reports, then re-runs it
until it reports none.
