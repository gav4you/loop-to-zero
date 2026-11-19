First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

Two separate situations. Answer each.

A. You are starting setup for a new loop over a 900-item controls register (the owner calls each row a
"control"; the register also uses "control" for the system setting a row describes). The repo has no review
history and no audit reports. Say what you ask the owner during setup research, beyond the usual setup
questions, and what you do with the answers.

B. A running loop, unit "billing", round 6, agents allowed. Three things are planned for the next round:
1. You wrote a project check, `S/checks/cite-lines.mjs`, that fails when a `path:N` cite points at a line that
   doesn't hold the key the item names. You want to add it to the commit gate.
2. The class "every-caller" keeps recurring, so you want to try draining it with narrow falsifiers for one
   round instead of the usual sweep.
3. You have 12 drafted fixes ready to apply as one batch.

Say what you do before and after each, and what you record. Then list anything in the skill that was unclear
for this case.

Pass if:
- A1: it asks the owner for a few recent errors they caught by hand and the traps they know of, and uses them as
  research (past-error source, known instances for patterns), since the repo has no review history;
- A2: it settles the ambiguous term "control" with the owner (which meaning is the item, which the setting) and
  records it in the terms map before research uses it;
- B1: the new check runs warn-only for at least one round, reporting what it would have blocked, before it is
  made blocking;
- B2: before trying the falsifier method, it states the test that will decide whether to keep or drop it (what
  result keeps it), and applies that test after the round;
- B3: before applying the batch, it writes down each fix's expected effect (which items change and how), and
  checks the actual diff against it afterwards.
