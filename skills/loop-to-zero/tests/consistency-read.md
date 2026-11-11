Read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md,
scripts\README.md, scripts\hooks\README.md and tests\README.md. Touch no other files and run no tools except reading those files.

This is a skill. Do NOT judge its approach or suggest features. A linter (`scripts/skillcheck.mjs`) already
checks the mechanical references: `ltz` command names, file names, status and verdict values, config keys and
pointers. Spend your read on meaning. Report ONLY real defects, each with file:line, the quote, the concrete
wrong action a writer following the text would take (or the two different answers the files give), and a
one-line fix. An item with no such wrong action or conflicting answer is not a defect; leave it out:
1. Contradictions between files or within a file, including rules that conflict with lessons, and two places
   that give different answers to the same situation.
2. Steps whose order conflicts with another file's order, or a step that needs something only a later step
   creates.
3. Terms used without definition (SKILL.md has a Terms table), or one term used in two meanings.
4. A rule a writer could not follow as written: it names no place, no tool or no owner where one is needed.
5. Any project-specific names, ids or paths that leaked in (the skill must be generic).

Skip style nits and anything the linter covers. If a category has nothing, say "none". List every real defect
you find, with no cap, most serious first.
