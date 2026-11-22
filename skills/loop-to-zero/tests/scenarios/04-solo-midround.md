First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

A Python-to-Rust port keeps a parity table of 1,200 items in 9 modules. The owner's standing rule is no
subagents, so you work alone. Module 4 (140 items) is on round 3, and modules 1 and 2 are closed. The cross-unit
policy (ruled at setup) lets a round edit items in open modules. You have read
90 items and found 2 wrong when:
- the owner says: "items about retry counts are fine as long as they match config/defaults.toml, don't flag
  those";
- your sweep for one wrong ("every handler logs the error", but a test handler doesn't) hits 3 items in module
  6 (open) and 2 in module 1 (closed). One of the module-1 hits has wording that ruling R-7 approved;
- you realise you marked an item ok in round 2 that has the same flaw.

Say exactly what you do, in order, through to round 4, including what you tell the owner. Then list anything
unclear.

Pass if:
- the ruling is recorded verbatim and applies to round 3's verdicts at once, but reaches the bar copy only
  from round 4;
- no item edits are committed before the reading ends;
- module 6 is edited and logged, and module 1 gets leads only;
- the R-7 lead goes to the owner at once (in solo mode, during the reading session, not after the hand-back), and any open-unit item whose wording R-7 approved and the evidence refutes is `pending-owner` (`ruled-wording`);
- the round-2 miss gets a judgments line and a widened, tested sweep pattern;
- it says what solo mode gives up;
- the fix check runs in a fresh session, or as a reported self-check with the owner's OK.
