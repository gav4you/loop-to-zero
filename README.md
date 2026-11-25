# loop-to-zero

A Claude Code skill for work that has to be verified and fixed in repeated rounds until one full pass finds nothing
wrong: documentation ledgers, spec claims, parity requirements, audit findings, policy statements, test
expectations.

Each round has four parts: a cold read of every item, narrow fixes with a sweep for the same kind of error, a cold
check of the fixes, and a lesson for every correction. A unit of work closes only when one full pass over all of its
items finds zero wrong.

## Install

In a Claude Code session:

```
/plugin marketplace add gav4you/loop-to-zero
/plugin install loop-to-zero@loop-to-zero-marketplace
```

Or from a shell:

```
claude plugin marketplace add gav4you/loop-to-zero
claude plugin install loop-to-zero@loop-to-zero-marketplace
```

The skill is then available as `/loop-to-zero:loop-to-zero`, and Claude loads it on its own when a task fits its
description ("loop to zero", re-verify until clean, close a unit).

To install it as a personal skill instead, copy `skills/loop-to-zero/` into `~/.claude/skills/`.

## What is in it

- `skills/loop-to-zero/SKILL.md`: the terms, the setup checklist and the round checklist.
- `skills/loop-to-zero/references/`: each step in detail (setup, rounds, fixing, briefs for readers and fix
  checkers, the starter classes, reader modes, limits and queues, learning, asking the owner, working a defect,
  the state folder).
- `skills/loop-to-zero/lessons.md`: the lessons the skill starts with, each marked as something that worked or
  something that went wrong.
- `skills/loop-to-zero/scripts/`: the tools (`ltz.mjs`: snapshot, render, record, queue, sweep, diff check, replay
  and more), an optional guard hook, and their tests.
- `skills/loop-to-zero/tests/`: the skill's own tests (a doc linter, the tool tests, 25 scenarios, a trigger test
  and a consistency read).

## Requirements

- Claude Code.
- Node.js 18 or later for the tools. They use no packages.

## Things to know

- The loop keeps its state in a folder outside your repository, so a round can resume in a new session.
- Nothing is edited, and no counted reader runs, until you have answered the setup questions.
- The skill learns: project lessons that hold up are promoted into its `lessons.md`. Installed as a plugin, that file
  lives in the plugin's cached copy and is replaced when the plugin updates. To keep your own promoted lessons,
  install the skill as a personal skill (above), or copy them out before you update.
- Checking the skill itself: `node skills/loop-to-zero/scripts/skillcheck.mjs` (doc lint) and
  `node skills/loop-to-zero/scripts/test/run.mjs` (tool tests). See `skills/loop-to-zero/tests/README.md`.

## Status

Version 0.2.0. The text has been through 23 rounds of its own improve-and-harden loop, and gets one more round a
week. Its own consistency reads still find a few small wording problems each round; none found in the last round was
serious.

## License

MIT. See `LICENSE`.
