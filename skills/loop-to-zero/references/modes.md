# Reader modes

## Agents (recommended when the owner allows them)
- Two independent cold readers per chunk, run from the queue (`references/queue-and-outages.md`), with the
  briefs in `references/briefs.md`.
- Measure "found by only one reader" every round.
- The fix checker is a cold agent, one per part of the fix set (about 70 changed items each; not a round chunk).

## Solo (no subagents)
Never recommend solo as the main reading mode. When one reader both reads and fixes, the count settles at a
false low.
- In one project, five single-reader rounds found 9, 14, 25, 1 and 9.
- A cold test reader on one 16-item window then caught 2 the pass had missed.
- The next round with independent readers confirmed 51.

If the owner chooses solo anyway, say what is given up. Early on, have a cold reader re-read one sample window in a
fresh session the owner opens (setup question 6; if the owner ruled such sessions out, after the owner clears the
conversation instead, as for a solo reading session), from a reader brief filled for it alone: an opaque slot name
of its own, not queued (so its renders stay out of your render log), `{SCRATCH}` for that slot, that window's
positions, and the brief's Write path changed to `{SCRATCH}agent-<slot>.jsonl` (the tools take an `agent-*.jsonl` in the
round folder for a reader's result file: the repeat check and `replay` read its class labels). Confirm each wrong it finds that your pass missed as a wrong of the round
it is found in (`"foundBy": "spot-check"`; re-run `record`; `references/learning.md`, "Counting"), and report the gap.

Your judgments get no independent check, so the mode makes up for it with order and a fresh session:
- **Recording your reading.** Queue one slot per chunk (`ltz queue <S> <unit> <R> init --opaque --per-chunk 1`),
  render and show under that slot, and append your verdicts to its `agent-<slot>.jsonl` as the reader brief
  says. `record` reads it like any reader's file.
- **Read first, consult history after.** Judge each window from what the reader brief's "Read first" names
  (the rules, the round's `classes.md` copy with the ruling texts it quotes, the precedents), the items and
  the evidence. Only when confirming the wrongs (`references/round.md`, step 3) consult the history that
  `references/fixing.md` ("History") lists. Outside findings are used only after your own reading (`references/setup.md`, "Existing outside findings").
- **Spot-checks:** re-read ok items per round in total, not per slot (you are the only reader): at least 5 at random (every pick the draw below gives) and 5 weighted, by the rule in `references/round.md`, step 3. Draw the random ones with `ltz spotcheck ... --per-slot <k>`, choosing the smallest even k (at least 2) that gives at least 5 across the slots, so each slot's picks fall early and late, and quote the bound for that pooled random count. Do this in the writer's
  session after the reading. That session already starts after a context reset (`references/round.md`, step 1),
  so the spot-checks need no session of their own. They come before the fixes.
- **A ruling given in a solo reading or fix-check session** (the owner tells that session): the brief's
  `{SOLO_RULING}` clause has the session write the owner's words to its scratch folder and keep judging
  under the bar it was given. After the hand-back, look for such notes in the round's scratch folders, log
  each ruling in the decision log and `S/classes.md`, and apply it to the round's verdicts as in agent mode
  (`references/round.md`, "Between rounds only"): at confirm for a reading, or when you take the fix
  checker's results.
- **Ruling-level leads:** ask the owner at once; what the lead touches waits for the answer (SKILL.md,
  "Cross-unit effects"). In solo mode, "at once" holds mid-reading too: when one (from a sweep run too early),
  or an outside finding that refutes wording a ruling approved, surfaces during a reading session, finish the current window, then send the owner a one-line
  flag (the ruling, the item, what refutes its wording) and go back to reading. The flag needs nothing read, so
  it doesn't break the cold read. The full costed ask follows after the hand-back, once you have read the
  ruling's entry. Don't hold the lead until the hand-back.
- **No second reader.** "Found by only one reader" and the remaining-wrongs estimate do not apply; say so in the
  report.
- **Re-runs and supplementary reads** (a fresh agent in agent mode) are your own read of that range in its
  `queue rerun` slot, after a context reset started from that slot's filled reader brief (`references/round.md`,
  step 1).
- **Sweeps after reading.** Run sweeps only after your own reading of the round is done, so their hits don't
  colour items you haven't read yet. A count-only `ltz sweep --count` is allowed mid-read.
- **The fix check.** Recommend to the owner that it run in a fresh session that never saw the fix's reasons.
  With the owner's OK:
  - write a paste-ready prompt (the state folder, the fix-checker brief and the round folder) for the owner
    to open in a new session;
  - or start it yourself with a command-line call (for example `claude -p`), only if the owner says that
    is allowed.

  Without either, ask the owner to clear the conversation, do the fix check yourself from the fix-checker brief, and
  report it as a self-check. The writer's steps then resume after another context reset, from `S/HANDOFF.md`.
- **Cross-unit edits you made** always get the fresh-session fix check, or a labelled self-check.

## External reviewer (for example Codex)
- **Same briefs and the same result schema.** Record which reviewer produced each report, in the round's `retro.md`.
- **Cost.** `ltz cost` reads only Claude Code transcripts. Take an external run's tokens and time from the
  reviewer's own usage output, record them in the round's `retro.md`, and store no `--transcript` for its slots
  (`cost --queue` warns about them, and fails when no slot of the round has one: then total the round from
  `retro.md`). At setup, that output for its read of r0's window gives the option's cost (`references/setup.md`,
  step 6).
- **A fix check that neither the reviewer nor an agent runs** (a fresh session or a self-check) follows Solo's
  "The fix check" bullet and "A ruling given in a solo reading or fix-check session", the hand-back included.
- **A stand-in is labelled.** A stand-in's report says it is a stand-in. Every item it judged, and every fix
  made on its finds, goes on `S/owed-rechecks.txt` for the external reviewer. Unless the owner decides otherwise, anything that freezes a
  release, or the items as the reference (setup question 0, `references/setup.md`), tags or publishes waits until every owed item is settled (below).
- **If a checker is refused or errors, stop and tell the owner.** Never fall back silently. A usage limit or a credit outage is not a failure: wait (`references/queue-and-outages.md`).
- **Before treating a close as final (in any mode),** recommend an independent audit by a different model or a different
  lens, in each unit's close report (`references/round.md`, step 8). In one project, a unit closed at zero under claim-vs-citation reading still held 8 wrongs about behaviour
  that such an audit found.
- **Poll a background run until it completes,** and fetch the result before counting it. A run that returns
  early reports a fake clean pass.
- **When the reviewer is unavailable** (out of credits, say), ask the owner at a round boundary. Either wait,
  or have a fresh Claude reader stand in, with the same brief, for the whole next round. If it becomes
  unavailable mid-round, wait. The stand-in's reading is the round's reading, and commits follow it as
  usual. When the external reviewer returns, ask the owner how it re-checks the open owed items (a process
  decision), listing them by unit and saying which units have closed (a find there is a lead, below). A report
  from a re-check outside the rounds is an outside finding (`references/setup.md`, "Existing outside
  findings"): keep it in `S/inputs/`, and map its finds to item ids in `S/inputs/audit-map.json` when it
  arrives. A find in an open unit whose current round is past its verify step (`references/round.md`, step 3) is
  handled as step 5 handles a fix checker's find in that unit (`foundBy: "audit"` where it goes into
  `confirmed.json`). A find in a closed unit is also a lead (SKILL.md, "Cross-unit effects"). Mark an owed item settled
  in `S/owed-rechecks.txt` once the external reviewer has judged it, in such a review or in its normal reading
  or fix check.
