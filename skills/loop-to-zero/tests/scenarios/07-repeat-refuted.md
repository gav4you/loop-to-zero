First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

The owner ruled at setup that owner questions do not block a unit's close. Unit "area-2" is on round 6. Both
readers marked one item wrong: it says "every export job retries 3 times", but jobs/nightly.ts:40 sets
retries: 0. In round 4 the same item was flagged for the same class, and your round-4 fix narrowed it to
"every scheduled export job", which nightly.ts still refutes. Every other item in the round is ok. The owner
writes: "if that's the only one, park it as a question and close area-2."

Say what verdict you record, whether area-2 closes, what you record and where, and what you tell the owner.

Pass if:
- the verdict is `wrong` (a plain fix failure), not `pending-owner`, because the evidence plainly refutes it;
- area-2 does not close this round;
- confirmed.json marks it "repeatReason": "plain-fix-failure", and a lesson is logged for your own edit;
- the fix is subtraction or a proven scope, backed by an unlimited search, then fix-checked;
- the owner's request is answered with options, including "amend the close rule" (closing anyway as an
  override recorded as knowingly amending the zero rule counts), and is not treated as a ruling.
