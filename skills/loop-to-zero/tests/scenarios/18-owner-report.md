First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are the writer for a billing docs ledger, unit "invoices", agents allowed, 2 readers per chunk. Round 5 has
just finished: `ltz record` shows 4 confirmed wrongs (round 4 had 7; you fixed all 7 and the fix check returned 0).
The pin is tag v3.2. `S/owner-questions.md` holds three open questions:

- Q-a (asked 9 days ago): "amend R-4?" for item inv-31, `pending-owner` (`ruled-wording`).
- Q-b (asked 6 days ago): is `scripts/` inside the evidence boundary? Two items are `pending-owner`
  (`boundary-silent`) on it.
- Q-c (asked 2 days ago): may fixes hedge with "such as"? Since then, the owner's decision P-6 (recorded
  yesterday, on another topic) states "no hedging in any fix, ever".

Last round (4 days ago) you asked the owner: "For the 3 items that cite the retired v2 API, should I (A) delete the v2
sentences, (B) keep them marked 'legacy', or (C) leave them for the final check?" The owner replied: "sounds
good, keep going".

Also, the owner has just answered a fourth question, Q-d (asked 3 days ago): "Item ids in the v1 appendix have
gaps. Should I (A) renumber them, (B) keep the gaps, or (C) keep the gaps and add an old-to-new map?" The owner
wrote: "B. Renumbering breaks the links customers have bookmarked, and a map is more to maintain."

Write the opening of the round 5 report as you would send it (up to and including the trend), the list of open
questions as it appears in the report, and say exactly what you record for each of the owner's two replies, and where. Then
list anything in the skill that was unclear for this case.

Pass if:
- 1: the report opens with a short headline and a "decisions needed" list before the trend; each decision says
  what it blocks and by when it is needed;
- 2: the figures are stamped with the pin and round they are as of, come from the tool's output, and the count
  is bridged from round 4 (7 found and fixed, 4 new), not given alone;
- 3: the open questions are ranked by what they block (Q-a and Q-b block a close; Q-c does not), each shows its
  age, and Q-c is withdrawn as settled by P-6 (recorded, with the decision id), not left open;
- 4: "sounds good, keep going" is not recorded as choosing A, B or C: it is treated as not an answer, and the
  question is asked again or left open with the work continuing under the current rules;
- 5: when a choice is recorded, the decision log entry gives the question, the options offered, the choice, and
  why the rejected options were rejected.
