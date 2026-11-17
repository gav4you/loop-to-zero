# Testing this skill

Run these after any edit to SKILL.md, `references/` or `scripts/`; run test 0 (skillcheck) after any edit to `lessons.md` too. Promoting a lesson into `lessons.md` is tested by its replay
(`references/learning.md`), not by these scenarios. The skill's writing rules are the same as
for code: no change without a failing test first. Run them again after the change.

## 0. Doc lint (mechanical)
`node <skill>/scripts/skillcheck.mjs`. It lints SKILL.md, lessons.md, references/*.md, tests/README.md,
scripts/README.md and scripts/hooks/README.md against the tool kit, and must report 0 findings. Run it after any
doc edit.

## 1. Tool tests (mechanical)
`node <skill>/scripts/test/run.mjs`. Every test must pass.

## 2. Scenario tests (behaviour)
Each file in `scenarios/` is a prompt for a fresh, cold agent.
1. Fill `<SKILL>` (written in capitals in the scenario files, so it stands out) with the skill folder's absolute path.
2. Remove the "Pass if" list from the prompt you send, so the agent can't read the criteria. Launch one agent
   per scenario (text only, no file changes), at most 2 at a time.
3. Compare each answer with the scenario's "Pass if" list. Read every answer in full; never score by keyword
   alone.

A scenario that fails means the skill's wording isn't binding. The skill's maintainer fixes the wording, not the
scenario, and re-runs it, and adds a new scenario whenever a real loop exposes a failure the current ones would
not catch; a loop's writer proposes these (`references/learning.md`, "Promotion").

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

## 3. Consistency read (structure)
Give `consistency-read.md` to one cold agent. The maintainer fixes every real defect it reports, then re-runs it
until it reports none.
