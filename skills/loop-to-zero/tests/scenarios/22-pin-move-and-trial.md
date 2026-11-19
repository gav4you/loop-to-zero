First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are the writer of a loop over an SDK docs ledger with two units: "api" (closed at round 5, at pin v4.0) and
"web" (open). Agents are allowed, 2 readers per chunk. The agreed escalation trigger is "more than 3 new wrongs in
items an earlier pass accepted and nobody has changed since". `S/classes.md` lists, in this order: CITE, VALUE,
SENT-VIA, GATED, RELATION.

After web's round 3, the owner moved the pin from v4.0 to v4.3 (decision P-9). The files changed between the two
pins are cited by 31 web items and 22 api items. Round 4 of web has just been read:

1. Round 4 confirmed 6 wrongs, all in items round 3 accepted and nobody has changed since. For 4 of them, the
   cited lines changed between v4.0 and v4.3 and only the v4.3 text refutes them; the other 2 were wrong at v4.0
   too.
2. Item web-40 says "Events are sent via sendBatch() in batches of 500". At v4.3 the batch size is 500, as stated,
   but nothing calls sendBatch(): the queue is flushed by flushQueue(). Readers listed VALUE and SENT-VIA. You must
   pick the first-listed class, which governs the wording and the regression pattern.
3. Rounds 1 to 3 of web logged fixes whose bounds were proved by searches at v4.0 (`ltz searches` passes).
4. You want to try a cheaper reader model, uncounted, on one chunk of round 4's snapshot before round 5.

Say what you do with each, in order: whether the escalation trigger fired and what the 6 wrongs count as; which
class web-40 gets first and why, and how readers learn that rule; what you do about the closed api unit; how you
re-check the earlier fixes' bounds; and where the reader-model trial runs so it cannot disturb the real rounds.
Then list anything in the skill that was unclear for this case.

Pass if:
- 1: the 4 wrongs only the new pin refutes are "evidence moved" and do not count toward the escalation trigger, so
  with 2 left it does not fire; all 6 are still fixed and counted in round 4's count (with the 4 noted);
- 2: web-40 gets SENT-VIA first, because the refuter falsifies the "sent via" claim (the value holds); it does not
  fall back to list order (which would give VALUE) for lack of a universal word; and the rule reaches readers
  through `S/classes.md`, since readers cannot open fixing.md;
- 3: the closed api unit stays closed at the pin it closed at (v4.0), is not silently re-read or silently kept,
  and the owner is told the 22 api items the move reaches and asked whether to reopen it;
- 4: the earlier fixes' searches are also re-run at the new pin (v4.3), not only at the pins their rounds read,
  and a search whose count changed there is judged at the new evidence;
- 5: the trial runs in its own folder outside the real rounds (a separate trial state folder, never a slot in
  web's round 4 or 5), so its results and queue never reach `record` or the commit guard.
