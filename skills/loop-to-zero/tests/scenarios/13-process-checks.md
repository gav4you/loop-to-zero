First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are the writer of a running loop over an API docs ledger (unit "api", rounds 1 to 5 recorded, 2 readers
per chunk). Answer three separate questions, each with the steps and commands you would use and what you
record.

1. Round 5 confirmed api-31 wrong: "The rate limit is defined only in config/limits.ts" (class U4,
   sole-location; it is also set in deploy/env.yaml). From that wrong you wrote a pattern,
   `S/checks/patterns/u4-defined-only.json`, and a sharper U4 wording for the bar. How do you test them
   before adopting either?
2. Round 6 has just finished reading, and you are at the spot-checks. Reader c1-b missed a canary that was
   planted in its last window. How do you choose each reader's spot-checks, and what do you record about the
   choice?
3. A different, brand-new loop: the extract script for a 60-page security policy manual has just produced 412
   items, and the manual's table of contents numbers about 400 requirements. What do you check before you
   trust the extract?

Then list anything in the skill that was unclear for these cases.

Pass if:
- 1: the replay is also run with round 5 (the round the pattern and wording came from) held out, and the
  decision rests on the recall over the other rounds, not on recalling api-31 itself;
- 2: the random picks are drawn reproducibly (a recorded seed or a tool) and spread over early and late
  windows, the picks and seed are recorded in the round folder, and c1-b gets more picks because of its late
  canary miss;
- 3: the source is reconciled against the items both ways (every requirement in the manual maps to an item,
  every item maps back to the manual, orphans on either side listed), not only the totals compared.
