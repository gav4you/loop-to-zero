First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are the writer of a loop over an SDK reference ledger with two open units: "api" (300 items) and "howto"
(260 items), at pin v3.1 (a commit). Agents are allowed, 2 readers per chunk. Evidence is one git repo. The last
decisions are R-3 and P-5. Fixes so far logged structured searches in `fixlog.jsonl` for many items.

1. The owner writes: "v3.2 is tagged. Should we judge against it? Tell me what it costs." Between v3.1 and v3.2,
   6 files inside `boundaryPaths` changed, among them src/loader.ts, which now reads `~/.sdkrc`. 22 items cite
   those 6 files. Item api-140 says "no module reads `~/.sdkrc`" and cites src/config.ts only (unchanged); its
   round 2 fix logged a structured search for `sdkrc`. Item howto-31 says "every example runs without network
   access" and cites examples/README.md only (unchanged); it has no logged search. You have run nothing yet.
2. While the owner has not answered, api's round 5 finishes with zero confirmed wrongs and meets the close
   condition.
3. The owner then answers: "Move to v3.2. Reopen api for it."

Say what you do, in order: how you measure the move and what you send the owner (which numbers, and which items
you count), whether api closes in step 2 and at which pin, and what its close report says; then, after the
answer, which api items are read for the move and how they are chosen. Then list anything in the skill that was
unclear for this case.

Pass if:
- 1: the measure goes beyond the 22 items that cite changed files: it re-runs the logged searches of universal
  items at v3.2 (`ltz reach`, or the same by hand) and counts api-140 as reached (its `sdkrc` search finds a new
  hit in src/loader.ts), and it checks universal items with no search, such as howto-31, against the changed
  files by hand or counts them in; the owner gets the reach in those groups, not just "22 items";
- 2: api closes in step 2 at v3.1, without waiting for the answer; its close report names the pin v3.1 and the
  open pin-move ask; it is not closed "at v3.2";
- 3: after the answer, the api items read for the move are the reached ones, including api-140 (logged as
  evidence-moved leads with the search whose hits changed, or the changed file, and the decision id P-6),
  through the final targeted check (round F, only the chunks holding them, at v3.2), not a full re-read.
