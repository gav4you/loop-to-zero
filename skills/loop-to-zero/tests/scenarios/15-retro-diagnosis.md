First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are the writer of a loop over a config docs ledger, unit "infra", round 4, 2 readers per chunk. Three
things happened:

1. The round's readers marked 14 items wrong, all in chunk c2, all citing config/app.json and each saying the
   rendered value differs from the item's. config/app.json was reformatted (keys re-sorted) in the commit just
   before the pin, and the items cite it by line number.
2. In chunk c1, reader x7 marked infra-12 wrong (it misstates a timeout; the refuter is src/http.ts:88) and
   reader q2 marked it ok. You confirm infra-12 is wrong. q2's render log for that window shows it rendered
   infra-12's own cites but never showed src/http.ts:88; x7's log shows it did.
3. Confirmed wrongs per round so far: r1 18, r2 11, r3 9, r4 (still being confirmed). The rounds'
   `confirmed.json` files carry each wrong's class.

Say what you do about each, before and during the retro, and what goes in the retro and the report. Then list
anything in the skill that was unclear for this case.

Pass if:
- 1: before confirming the 14 as a batch, it checks the shared basis at the pin (the file as the pin holds it,
  and the cite form against the reformat), and names the one cause behind them;
- 2: it uses q2's render log to say q2 never looked at the refuter, so the remedy is depth or reading guidance
  for q2's kind of miss, not a sharper class wording;
- 3: the retro and report break the trend down by class from the rounds' `confirmed.json` files, not only the
  total, so a class that is not falling shows.
