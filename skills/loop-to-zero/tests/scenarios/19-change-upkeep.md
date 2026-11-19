First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are the writer of a loop over a payments docs ledger, unit "ledger", round 7 just reported, agents allowed,
2 readers per chunk, evidence pinned at commit a1b2c3 of the payments repo. Four things come up before round 8:

1. Reader agents cost too much. You want round 8's readers to run on a cheaper model, and to shorten the reader
   brief by dropping two paragraphs you think readers ignore.
2. The owner writes: "the payments repo has moved on 40 commits since the pin; move the pin to main's head before
   round 8."
3. `S/lessons.md` has grown to 60 lessons. Several describe mistakes that `ltz diffcheck` now refuses mechanically
   (for example, an unlogged universal), and some have not come up for many rounds.
4. Your session is near its limit, so you are writing `S/HANDOFF.md` for a new session to take over at round 8.

Say what you do about each, in order, what you record and where, and what you tell the owner. Then list anything
in the skill that was unclear for this case.

Pass if:
- 1: before switching the model or shortening the brief, it runs the old and the new reader setup on the same
  chunk and compares their verdicts and finds (and cost), and switches only if the new one holds up; it does not
  just switch;
- 2: before moving the pin, it reports the drift (what changed between a1b2c3 and the new head in the files the
  items cite) and which items the move would reopen, takes the owner's decision, and after the move re-snapshots
  and re-reads the affected items rather than carrying old verdicts forward;
- 3: lessons that a tool now enforces are marked retired (pointing to the tool) rather than kept as live text, and
  each lesson carries the date or round it was last confirmed, so stale ones show;
- 4: the handoff is tested once by a fresh session that reads only it (a cold resume), and the new session re-reads
  decisions and rulings from the decision log and classes.md, not from the handoff's summary.
