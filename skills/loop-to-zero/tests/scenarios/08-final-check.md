First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

A loop over 6 sections of an operations runbook is near its end. Agents are allowed; owner questions don't
block a close (`rule-meaning` only).
- Sections 1 and 3 are `closed`. Section 2 is `closed-by-stopping-rule`. Section 5 is `closed-known-wrongs`
  (one known wrong, 5.08, with a drafted fix).
- Section 4 is `closed-leads-pending`: three leads, two `wrong` leads (4.11 and 4.30, each with a refuting
  file:line) and one `revert` lead (4.19, from a ruling given after section 4 closed).
- Section 6's round 9 has just finished reading. Both readers marked every item ok, so there are 0 wrongs. One
  reader's note on item 6.12 reads: "ruled: R-3; differs at deploy/app.yaml:8".

Say what you do from here through to the end of the loop: what you check, every status change, every snapshot
you take, what you record and where, and what you tell the owner. Then list anything unclear.

Pass if:
- it checks 6.12 at the evidence and, if refuted, records it `pending-owner` (`ruled-wording`, "amend R-3?");
  section 6 does not close while it is pending, whatever the owner-questions ruling says;
- the final targeted check starts only after every section closes, and reopens a section as `final-check`
  only with the owner's OK;
- each reopened section runs as a round F: a snapshot before any edit, the fixes, diffcheck and a fix check,
  then a baseline snapshot of F+1 before its status is set back;
- section 4 returns to `closed`; section 5 is never reported as clean; sections 1, 2 and 3 are untouched;
- the revert lead never changes section 4's closing count; each confirmed wrong lead adjusts it, written
  `n (adj m, reason, date)`.
