First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

A reader marked this item wrong:
"No caller passes a timeout to fetchUser; every call site uses the default 30 s."
The refuter is scripts/backfill.ts:44, which calls fetchUser(id, { timeout: 0 }).

Write the corrected item, and every step from now until the next round starts. Then list anything in the skill
that was unclear for this case.

Pass if:
- the history, ruling and refuter checks come first;
- the item text is not a new closed list;
- the search for callers has no output limit at any layer (no `head`, no tool result cap) and covers aliases and wrappers;
- the sweep is by subject, cite and file, and the pattern is tested on known instances;
- it opens every item the new text names, and every field of the changed item;
- it runs the diff check;
- it commits with explicit paths;
- the fix checker runs, with follow-ups checked until a check returns 0.
