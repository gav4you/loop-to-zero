First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are the writer of a loop over a product docs ledger with two units: "cli" (420 items, `closed` at round 4, at
pin v2.0) and "guide" (380 items, open, round 3 just finished with 9 wrongs, all fixed). Agents are allowed, 2
readers per chunk, chunks of about 70 items. The bar is frozen at round 2 (the owner's decision). The decision log
is `S/decisions.md`; the last entries are R-4 and P-7.

1. The owner writes: "v2.2 is out. Judge everything against v2.2 from now on." You measured the move: the files
   changed between v2.0 and v2.2 inside `boundaryPaths` are cited by 40 guide items and 18 cli items (all 18 in cli
   chunks 3 and 5). You sent the owner that reach with the options. Before they answer, round 4 of guide is due.
2. Later the owner answers: "Move now. And yes, reopen cli for the move."

Say what you do, in order: how you number and record the owner's pin decision (and where it is written, or
not), and whether the frozen bar is affected; whether round 4 of guide starts before the owner answers, at
which pin, and what you tell the owner; then, after the answer, exactly how cli is reopened for the move: its
status, the files you write, which round, which items are read and by whom, at which pin, and the status it
ends with. Then list anything in the skill that was unclear for this case.

Pass if:
- 1: the pin decision is a process decision (`P-8`), not a bar ruling: it is not quoted in `S/classes.md` (readers
  never see it; the pin is recorded in `config.json`, `loop.md`'s Evidence line and each round's `pin.json`), and
  the frozen bar is not unfrozen or otherwise touched by it;
- 2: round 4 of guide starts without waiting for the answer, at the current pin (v2.0); the open ask is in
  `S/owner-questions.md` and tells the owner the cost of waiting (the 40 guide items read now at v2.0 would be read
  again after the move); the round waits only if the owner says so;
- 3: cli is reopened through the existing final targeted check, not a new process or a full re-read: the 18 items
  are logged in `closed-unit-leads.txt` as evidence-moved leads (with the decision id), cli becomes
  `closed-leads-pending` ("was closed") and then `final-check`; round F (5) queues readers only for chunks 3 and 5
  (`--chunks`), read at the new pin (v2.2); the leads are marked settled and cli returns to `closed`, and a wrong
  round F confirms is reported as evidence moved, not as an adjustment of cli's v2.0 closing count.
