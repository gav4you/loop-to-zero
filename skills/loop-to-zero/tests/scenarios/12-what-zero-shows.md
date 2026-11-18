First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are the writer for a docs ledger, unit "billing" (140 items, 2 chunks, 2 readers per chunk), round 7.
Canaries and spot-checks are approved. Billing's rounds 1 to 6 are recorded in the state folder as usual
(each round's `measure.json`, `confirmed.json` and `report.json`, and `S/judgments.jsonl`). Round 7's reading is
done, and it looks like a zero pass:
- `ltz record` reports full depth and 0 reader wrongs, and its estimate of wrongs still unfound is 0 in both
  chunks.
- You spot-checked 10 ok items per reader (5 at random, 5 weighted), and all 40 hold.
- Each reader had 2 canaries, and every reader caught both of theirs.

Write the "how much is likely still unfound" part of the round 7 report to the owner. Then list anything in the
skill that was unclear for this case.

Pass if:
- it says what the clean results can and cannot show: clean spot-checks bound a reader's miss rate only
  loosely and well above zero (only the random picks count: about 45% on one reader's 5, about 14% on 20
  pooled), 2 caught canaries per reader show little, and a pass with no finds gives an estimate of 0 by
  construction, so the estimate is no evidence here;
- it checks the estimate against billing's own history before relying on it: it compares earlier rounds'
  estimates with the wrongs later rounds found in text those rounds had read, using the earlier rounds' files,
  and reports how far the estimate ran low (or says it will compute that ratio from those files).
