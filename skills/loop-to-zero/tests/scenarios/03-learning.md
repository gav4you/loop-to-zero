First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are on round 5 of chapter 2 of a docs-accuracy loop. There are 7 chapters, chapter 1 is closed, and you
will run loops like this in other projects. Three things just happened:
- (a) The owner says an item you marked wrong in rounds 3, 4 and 5 was fine: "that's covered by our decision
  R-12, stop flagging those."
- (b) A fix checker found that your fix replaced "only the API imports X" with "only the API and the worker
  import X", but a migration script imports X too.
- (c) You estimated 20M tokens per round; the round measured 14M.

What do you record, in which exact files and in what form? How does each change your next rounds and future
projects? What do you do about earlier verdicts and about chapter 1? Then list anything unclear.

Pass if:
- R-12's text goes verbatim into the decision log and `classes.md`, with a scope question if the scope is
  unclear;
- `judgments.jsonl` gets one line per changed verdict per round;
- it back-propagates to the edits those false wrongs caused, and logs chapter-1 matches as leads, unedited;
- earlier counts are restated as adjusted;
- the lesson is replayed before promotion, and promoted only without project names;
- SKILL.md is not edited;
- the cost miss is over 25%, so it becomes a lesson and the owner is told.
