# loop-to-zero scripts

This is a tool kit for the loop-to-zero skill. It needs Node 18 or later, uses ESM, and has no packages:
nothing to install. Every command prints a short summary and exits non-zero on any failure, problem,
mismatch or flag, except the report-only commands (`crosscheck`, and `reach`, which exits non-zero only on a
problem): their exit status says nothing about what they list, so judge every cite group or reach group they print.

Loops run from the project folder, so every command is written with the skill's path, here
`<skill>`:
- run a command as `node <skill>/scripts/ltz.mjs <command> ...`;
- for one command's details, add `--help`: `node <skill>/scripts/ltz.mjs <command> --help`.

**Run `node <skill>/scripts/test/run.mjs` after any change.** It builds a throwaway git fixture under
`<skill>/scripts/test/tmp/` and deletes it afterwards. To iterate on a few tests, set `LTZ_TEST_ONLY` to a
regex of test names (`LTZ_TEST_ONLY=record`); then run them all.

**Test 0: run `node <skill>/scripts/skillcheck.mjs` after any doc change** (see "Skillcheck"). It lints
the skill's own markdown against the tool kit and exits non-zero on any finding.

## Skillcheck
`node <skill>/scripts/skillcheck.mjs [--root <skill folder>]` lints these files:
- `SKILL.md` and `lessons.md`;
- `references/*.md` and `tests/README.md`;
- `scripts/README.md` and `scripts/hooks/README.md`.

The names it checks come from the code itself: the command list, unit statuses, queue states,
verdicts, `repeatReason` and `foundBy` values, and the config keys. It reports each finding as
`file:line: [check] message`:

| Check | Reports |
|---|---|
| `a` | `ltz <word>` or `ltz.mjs <word>` where `<word>` is not a command. |
| `b` | A unit status or queue state token in code (`closed-*`, `stopped-*`, `dropped-*`, `final-*`; inline code or code blocks) that the code doesn't define. A `*` family is fine when some defined token has that prefix. |
| `c` | A verdict value (in `"verdict": "<value>"` or "verdict `<value>`") that isn't `ok`, `wrong`, `pending-owner`, `defect`, `unread` or `outside-bar`. Also a misspelling of `pending-owner` (with an underscore or in camelCase), and a `repeatReason` or `foundBy` value the code doesn't accept. |
| `d` | A config key the code doesn't read: `config.<key>`, a camelCase name in backticks right next to "config" (config `<key>`, config key `<key>`, `<key>` in `config.json`), or a camelCase key in a JSON block that follows a `config.json` mention. |
| `e` | A file name in backticks (`.md`, `.json`, `.jsonl`, `.txt`) that is neither listed in `references/state-template.md` nor a real skill file. Placeholders like `<unit>` and `*` match anything, and a name inside a placeholder (`<pattern.json\|classfile>`) is skipped. So are Claude Code's own files: a path starting with `.claude/` or `~/`. |
| `f` | A pointer such as `references/<file>.md` ("Section") or `references/<file>.md`, "Section" whose file is missing, or whose section is not one of its headings or bold run-in labels (the section may wrap onto the next line). |
| `file` | One of the files above is missing. |

Its summary counts what each check examined, so a clean run shows that it checked something.

## Conventions
- **`<S>`** is the state folder.
- **`<R>`** (the briefs' `{R}`) is the **round number, in digits**, such as `3`. The round folder is
  `S/<unit>/r<R>/`, for example `S/u1/r3/`. The tools also accept `r3`, but write digits.
- **Round 0** (`r0`) is the cost-measurement read; see "Round 0".
- **Positions** in `list.json`, windows, chunks and the queue are 1-based.

## Commands
| Command | What it does |
|---|---|
| `node <skill>/scripts/ltz.mjs snapshot <S> <unit> <R> [--chunk-size N] [--order <file>]` | Copies the unit's items into `r<R>/snapshot.jsonl` and `S/classes.md` into `r<R>/classes.md`, and writes `list.json`, `chunks.json` and `snapshot.sha256`. `--order` takes a file of ids (one per line, or a JSON array) and writes `list.json` in that order, for example a discovery reading order; it must be a permutation of the unit's ids, or it is refused. It also writes `pin.json`: the evidence this round reads (each git source's pin resolved to its commit, or each folder with its sha256). For `r0` the list and chunk hold the first window only. Refuses once reading has started (any result file, render log or window file). With `"requireRulingEntries": true`, also refuses while a ruling id of the decision log is not found in the "accepted by ruling" section (see "Rulings"). |
| `node <skill>/scripts/ltz.mjs render <S> <unit> <R> <slot> <from> <count> [--list f]` | Writes `r<R>/w-<slot>-<from>.txt`: each item in full and every cited line at the pin (see "Cites"). Logs each line to `render-<slot>.jsonl`, masks secret values (see "Masking") and reports how many cited lines it masked. |
| `node <skill>/scripts/ltz.mjs render <S> <unit> <R> <slot> show <cite>...` | The same as `show`. |
| `node <skill>/scripts/ltz.mjs show <S> <unit> <R> <slot> <cite>...` | Prints those lines at the pin, logs them to the same render log, and reports the masked count. |
| `node <skill>/scripts/ltz.mjs record <S> <unit> <R> --chunk-readers c1=c1-a,c1-b ...` | Checks coverage (with any rerun's lines merged in; see "Re-runs and supplementary reads"), pending reasons and repeats, then writes `report.json` and `measure.json`, including `fullDepth`, `countsAsZero` (see "Counting a round as zero") and the fix checker's results (`fixChecker`). It writes nothing if any check fails. Every chunk needs readers, except in a `final-check` unit, where chunks left out (or every chunk, with no `--chunk-readers`) are reported not read (see "Final-check rounds"). |
| `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> init --pairs c1=c1-a,c1-b ...` | Creates `queue.json`. Every chunk must be queued, except for a `final-check` unit, which may queue a subset of chunks or none (see "Final-check rounds"). |
| `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> init --opaque [--per-chunk N] [--chunks c2,...]` | Creates `queue.json` with short random slot names, N per chunk (default 2), and prints the `--chunk-readers` arguments for `record` (see "Opaque slot names"). `--chunks` queues only those chunks, for a `final-check` unit only. |
| `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> next --cap N` | Lists stopped jobs to continue, then slots to launch within the cap: pairs whole, reruns one by one. |
| `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> mark <slot> <state> [--agent id] [--transcript path] [--reset <date-time>] [--ruling id]` | Sets a job's state. `done` is refused unless the result file covers the range. `replaced` closes an abandoned slot. `dropped-by-owner` needs `--ruling` with its decision id (see "Dropped ranges"). `--transcript` stores the agent's transcript path (see "Transcripts and cost"). `--reset <date-time>` records when a limit resets (for `stopped-limit`; `next` waits until then). It takes an ISO 8601 date and time, `YYYY-MM-DDTHH:MM`, with optional `:SS`, fractional seconds, and `Z` or a `+HH:MM`/`-HH:MM` offset, such as `2026-11-10T03:00` (local time, with no `Z` or offset). Anything else is refused: a bare clock time (`03:00`), a date with no time (`2026-11-10`), a date with no year (`Nov 10 03:00`), or an invalid date or time (such as `2026-11-31T03:00`, or `24:00`, which ISO 8601 allows). |
| `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> replace <slot> --agent <newId> [--from P] [--transcript path]` | Puts a fresh agent on the same slot after an account change or in a new session. The slot stays open (see "Replacing an agent"). |
| `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> rerun <slot> --from P --to Q` | Adds a new slot, with an opaque name and its parent recorded, that reads positions P-Q of that slot again. `record` uses its lines there (see "Re-runs and supplementary reads"). |
| `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> status` | Prints each slot's state, result lines, resume position, any dropped range and earlier agents. |
| `node <skill>/scripts/ltz.mjs diffcheck <S> <unit> <R> [--no-verify-searches]` | Checks that the snapshot-to-current change set equals `fixlog.jsonl`, then runs the text, regression and closed-unit checks. It runs every structured search at the pin unless `--no-verify-searches` is given (see "The diff check" and "Searches"). |
| `node <skill>/scripts/ltz.mjs searches <S> [--rounds <unit>,...\|all] [--at-current]` | Re-runs every structured fixlog search of those rounds over `boundaryPaths`, each round at the pin its `pin.json` recorded (with `--at-current`, at the current pin), and reports each scope that was too narrow (see "Searches"). |
| `node <skill>/scripts/ltz.mjs reach <S> --to <rev> [--unit <unit>]` | Before a pin move, lists the files changed between the pin and <rev> inside `boundaryPaths` and, per unit, the items that cite one, the universal items whose last structured search finds different hits at <rev>, and the universal items with no search to re-run (see "Reach"). |
| `node <skill>/scripts/ltz.mjs crosscheck <S> [--unit <unit>]` | Lists every cite two or more items share, and flags the cite groups whose items state different numbers. Reports only: it exits 0 whatever it flags. |
| `node <skill>/scripts/ltz.mjs sweep <S> <pattern.json\|classfile> [--unit U] [--count]` | Prints hits; with `--count`, only hit counts per pattern and unit. Refuses a pattern that misses a known instance (see "Sweeps"). |
| `node <skill>/scripts/ltz.mjs flips <S> <unit>` | Reports an (id, field) whose value returns to one it held earlier, in `S/`'s rounds or a `historyFolders` round. Exits non-zero for an unexplained flip (see "Flips"). |
| `node <skill>/scripts/ltz.mjs rulings <S>` | Lists every ruling id in the decision log that is not found, as whole text, in `S/classes.md`'s "accepted by ruling" section, and exits non-zero if any is missing (see "Rulings"). |
| `node <skill>/scripts/ltz.mjs canary add <S> <unit> <R> --from <file>` | Validates writer-authored canaries and appends them to `S/canaries.jsonl`. |
| `node <skill>/scripts/ltz.mjs canary plan <S> <unit> <R> --per-slot K --seed N` | Places K canaries per queue slot in `canary-plan.json`. |
| `node <skill>/scripts/ltz.mjs canary gitignore <S>` | Prints the `S/.gitignore` lines that keep the canary files and the readers' `scratch/` folders out of git, says which are missing, and exits non-zero if any is (see "Patterns and canaries" under "File formats"). |
| `node <skill>/scripts/ltz.mjs cost <transcript.jsonl>...` | Sums token use from agent transcripts: cache reads, cache writes, other input, output and total. |
| `node <skill>/scripts/ltz.mjs cost --queue <S> <unit> <R>` | Sums every transcript path stored in that round's `queue.json` (see "Transcripts and cost"). |
| `node <skill>/scripts/ltz.mjs cost --timeline <transcript.jsonl>` | Prints each message's tokens with its timestamp, and sums the startup and each render window (see "Transcripts and cost"). |
| `node <skill>/scripts/ltz.mjs replay <S> <pattern.json\|classfile> --rounds <unit>[,..\|all] [--holdout <unit>/r<R>,...]` | Reports a pattern's recall and false hits on past rounds, a `historyFolders` round's included. A wrong later overturned in the `judgments.jsonl` of the state folder holding its round is not counted (see "Replay"). `--holdout` also reports them without the rounds the rule was written from. |
| `node <skill>/scripts/ltz.mjs spotcheck <S> <unit> <R> --seed N [--per-slot K] [--extra <slot>=<K>]` | Draws each reader's random spot-checks from its ok items (K per slot, 5 by default, plus any `--extra`), half early and half late in its range (the odd one early), reproducibly from the seed, and writes `r<R>/spotchecks.json`. |
| `node <skill>/scripts/ltz.mjs lock <S> acquire\|release\|check --session <id>\|auto` | Manages the single-writer lock `S/writer.lock`; `--session auto` takes the id from the guard (see "The writer's lock"). |

The `<skill>/scripts/hooks/guard.mjs` PreToolUse hook is documented in `hooks/README.md`. The guard works
per file: each file is listed under every unit that has items in it, and the guard blocks edits to it
only while all of those units are closed. So while an open unit shares a file with a closed one, the
closed unit's items there rely on diffcheck's closed-unit check (`hooks/README.md`, "The guard works per
file").

## Cites
An item's `cites` (and a reader's) take four forms:

| Form | What is rendered |
|---|---|
| `path:12` | That line. |
| `path:20-25` | That range, clipped at the end of the file. |
| `path:Key` | The best line holding `Key` (a markdown heading first, then a `Key:`/`Key =` line, then any line), plus the 10 lines after it. |
| `path#a.b.c` | A nested key in JSON or YAML, found by indentation (best effort). `a` is the shallowest match in the file, and each later key must be a direct child of the one before it. The line of the last key is shown with its block: its deeper-indented lines, and a closing bracket at its own indent. A key written inline on its parent's line (`"grpc": { "port": 9090 }`) resolves to that line. The block is clipped at 200 lines. |

A cite that cannot be rendered (missing file, a line past the end, a key not found, a path no evidence
source claims) is marked in the window and logged as an attempt, so a reader may cite exactly what was
tried.

## Evidence sources
`config.evidence` is either one source or a list of sources. A single object, as below, is the source
for every path:
```json
"evidence": {"type": "git", "repo": "<path>", "pin": "<tag|commit>"}
```

A list mixes sources, each under a `prefix`:
```json
"evidence": [
  {"type": "git", "repo": "<code repo>", "pin": "<tag>", "prefix": ""},
  {"type": "dir", "root": "<exported settings>", "prefix": "export/"}
]
```

How paths are routed:
- **Which source.** A cite's path goes to the source with the **longest matching prefix**.
- **What it reads.** The prefix is stripped before that source reads the file. For example,
  `export/<file>.json:3` reads line 3 of `<exported settings>/<file>.json`.
- **No match.** A path that no source claims (no `""` prefix and no match) is not rendered (`no-source`).
- **Same everywhere.** `render`, `show`, `diffcheck`'s search verification and `searches` all route the
  same way.
- **Prefix rules.** A prefix is a relative folder; a trailing `/` is added if missing. Two sources may
  not share a prefix.
- **Folders shadowed.** A file a source holds under another source's longer prefix belongs to that
  other source.

## Masking
Rendered evidence lines are masked by default. For each `key: value` or `key=value` (`::` and `==` are
left alone), the key is split into segments at `_`, `-`, `.`, spaces and camelCase boundaries,
lower-cased.
- **A key may be several words**, as in a policy's prose: everything from the first word before the
  `:` or `=` back to the start of the line or the previous value. So in "Password rotation: 90 days"
  the key is "Password rotation", with the segments `password` and `rotation`. In "The admin password
  is: x" the key's segments include `password`, so `x` is masked.

The value is shown as `«masked»` in either of two cases:
- **The segments contain one of these names as whole segments:**
  - password, passwd, secret, token, apikey, api_key, pin;
  - private_key, credential, credentials, access_key, auth_token, client_secret.

  So any segment equal to `token` or `secret` counts.
- **The whole key is one of these plural compounds:** access_tokens, refresh_tokens, secrets,
  passwords, api_keys, client_secrets. These match only as the entire key, so `max_tokens` and
  `my_secrets` are not masked.

| Masked | Not masked |
|---|---|
| `auth_token`, `db_password`, `apiKey`, `X-Auth-Token`, `clientSecret`, `access_key_id`, `access_tokens`, `refreshTokens`, `secrets` | `max_tokens`, `bypass`, `mytoken`, `tokenizer`, `passthrough`, `secretary`, `my_secrets` |

**Plain values of setting keys are not masked.** An unquoted value that is a plain number, boolean or
duration is shown only when the key also has a setting segment. A duration is `30s`, `15m`, `1h30m` or
`250ms`, or a number, a space and a unit word: seconds, minutes, hours, days or weeks, singular or
plural, in any case (`90 days`, `1 week`). The setting segments are:
- min, max, length, len, lifetime, ttl, expiry, expires, age;
- days, hours, minutes, seconds, rotation, count, size, rounds, attempts, interval, timeout.

| Shown | Masked |
|---|---|
| `password_min_length: 12`, `token_ttl: 3600`, `Password rotation: 90 days`, `Token expiry: 2 weeks` | `password: 1234`, `pin: 0000` (a bare secret key with a numeric value), `db_password: hunter2`, `Password: 90 days` (no setting segment), `Password rotation: every 90 days` (not a plain duration) |

`pin` is a built-in secret name. A quoted value is a string and is masked as usual. A key listed in
`maskAllow` is never masked, whatever its value.

How much of a value is masked:
- a quoted value: inside its quotes;
- a `[...]` list or `{...}` inline object: up to its matching bracket;
- any other value: up to `,` `;` `}` `]` `)`, a ` #` comment, or the end of the line. Spaces do not end
  it, so "Password: correct horse battery" is masked whole. A plain value is judged on that whole text,
  trailing spaces aside.

Prose documents (policies, manuals) are best listed in `maskExclude` when they hold no secrets, since a
sentence with a secret word before a colon has its rest masked.

A YAML key whose value is an indented block below it masks nothing on the following lines; use
`maskExclude` or read such files with care.

| Setting in `config.json` | Effect |
|---|---|
| `"maskKeys": ["dsn", ...]` | Adds names, matched by segments like the first list (`dsn` also masks `report_dsn`). |
| `"maskAllow": ["token_lifetime", "password_min_length", ...]` | Names never masked, matched by whole segments the same way (`token_lifetime` also allows `refresh_token_lifetime`). |
| `"maskExclude": ["config/public/**", ...]` | Path globs whose files are never masked. |
| `"maskSecrets": false` | Turns masking off. |

Each masked line is logged with `"masked": true`. `render` and `show` report the number of masked cited
lines. Item text is never masked.

## The diff check
`diffcheck` fails (non-zero) on any mismatch or flag:
- **Change set.** Every changed field (cites included), added item and removed item must be in
  `fixlog.jsonl`, and every fixlog entry must be a real change. The first `old` must equal the snapshot
  value, the last `new` the current value, and a chain of entries must link.
- **Cross-unit edits.** An entry for another unit's item carries `"unit": "<that unit>"`; without it, it
  is a mismatch. For every other open unit named this way:
  - the unit's items are compared with its latest round snapshot;
  - every changed field must be explained by an entry for it: here, in its own latest round's
    `fixlog.jsonl` (fixes it made since that snapshot), or in any other round's fixlog with
    `"unit": "<that unit>"` (cross-unit edits from earlier rounds, while that unit was not
    snapshotted again);
  - for each changed field, some logged `old` must be the snapshot value and some logged `new` the
    current value;
  - every entry here for that unit must be a real change since its snapshot (entries in other rounds
    only explain);
  - a unit with no snapshot is a mismatch (take a baseline first).

  The fields this round edits in that unit get the universal-clause, new-list, shape and regression
  checks below, cleared only by a search on this round's entry for that id and field. The unit's own
  fixes are left to its own diffcheck. A closed unit named this way is flagged by the closed-unit check
  instead.
- **Universal clauses.** Each changed field is split into clauses: at sentence stops, `;`, `:`,
  parentheses, line breaks and spaced dashes, but not at commas. These are flagged:
  - every changed clause (in the new text, not in the old) that holds a universal word, whether the
    word was added or kept. This catches "only A" -> "only A and B".
  - inside such a clause, any list of 2 or more members joined by and/or (a closed list).

  **The clearing rule.** A flagged clause is cleared only in one of two ways:
  - a fixlog `search` with `hits` (a number, 0 allowed) for that **id and field**;
  - the edit removing the universal word from that clause ("only the API imports X" -> "the API
    imports X").

  **A qualifier alone ("probably") does not clear it.** "probably only the API imports X" and "only the
  API imports X, as far as we can tell" are still flagged.
- **Searches.** See "Searches": by default every logged search must be structured, carry
  `blindSpots`, cover the boundary (or carry a `scopeNote`) and match its `hits` at the pin.
- **New lists.** A new series of 3+ items joined by ", and" or ", or" with no "such as", "for
  example", "e.g." or "among others" in its clause. It is cleared like a universal clause: by a fixlog
  `search` with `hits` for that id and field.
- **Shape.** Stacked parentheticals `) (`, a sentence over 60 words, a clause appended with no sentence
  stop, or a field that lost its final stop.
- **Regression patterns.** A changed item still matching a pattern in `S/checks/patterns/*.json`
  with `"regression": true`.
- **Closed units.** A unit is closed when its `status` starts with `closed`:
  - if this unit is closed, every change is flagged;
  - every other closed unit's items are compared with that unit's latest round snapshot, and any change,
    addition or removal is flagged.

  A closed unit with no snapshot gives a warning; `node <skill>/scripts/ltz.mjs snapshot <S> <unit>
  <R>` creates a baseline for it.
- **Canaries.** A canary id found in `S/items.jsonl` is flagged.
- **Requirement items are never narrowed to fit the evidence.** For an item whose `type` is
  `"requirement"` (in the snapshot or now), every fixlog entry for a changed field, the whole item
  (`"*"`) and `type` itself included, needs either `"basis": "copying-error"` with a non-empty
  `"source"` (the `file:line` the item copies), or a `"ruling"` id. Otherwise it is a PROBLEM:
  "a requirement item changed without a copying-error basis or a ruling (a requirement the evidence
  does not meet is a defect, not a fix)". This holds for cross-unit edits too. Items with no `type`,
  or `"description"`, are unaffected.

## Searches
A fixlog entry that backs a bound logs its search. Log one search over the whole boundary (no `paths`,
so `boundaryPaths`, here `src/**` and `docs/**`), and judge every hit, including those the item's
stated scope excludes:
```json
{"id": "A01", "field": "title", "old": "...", "new": "... only the billing module reads RATE, outside tests and fixtures ...",
 "search": {"regex": "\\bRATE\\b", "count": "matches"},
 "hits": 4,
 "judged": [{"at": "src/billing/rate.js:2", "why": "the definition: the billing module"},
            {"at": "src/billing/charge.js:14", "why": "billing module code: inside the claim"},
            {"at": "src/billing/rate.test.js:5", "why": "outside the claim: excluded by the stated scope 'outside tests and fixtures'"},
            {"at": "docs/billing.md:12", "why": "prose that names RATE, not a read"}],
 "blindSpots": "RATE read through a variable; names built at run time",
 "scopeNote": "the claim is deliberately bounded: reads in tests and fixtures are outside it",
 "scopeText": "outside tests and fixtures"}
```
The search covers the boundary, so `hits` is the boundary-wide count that `searches` re-runs. The
`scopeNote` and `scopeText` say why a hit such as the test file's does not refute the claim, and the
item states that bound.

**The structured search.** It has a `regex` (a JS regex) and these optional fields:
- `flags`;
- `paths`: globs; without them, `boundaryPaths` from `config.json`, or every file;
- `count`, which sets what `hits` counts:
  - `"matches"`, the default: every match, so `RATE * RATE` counts 2;
  - `"lines"`: matching lines, the way `rg -c` counts;
  - `"files"`: files with a match.

**`judged`: one entry per hit.** A count alone proves nothing about each hit, so a structured search
lists every hit it judged at the pin: `{"at": "<location>", "why": "<short reason>"}`, with a
non-empty `why` ([] for 0 hits).
- The location is `path:line` for `count` `"matches"` or `"lines"`, and `path` for `"files"`. Paths are
  cite paths, with a source's prefix when there are several sources.
- With `"matches"`, a line holding two matches is judged twice: two entries with the same `at`.
- `hitsJudged` (a bare count, used before) is refused, with a message pointing to `judged`.

**What the tool runs.** It scans the evidence at the pin itself:
- it lists the files with `git ls-tree` and reads them with `git cat-file`, or walks the folder for
  folder evidence;
- it applies the same JS regex line by line, so the count means exactly what the regex means (git
  grep's regex dialect would differ);
- binary files are skipped.

**`diffcheck` (searches verified by default).** Each of these fails the check:

| Case | Result |
|---|---|
| A structured search with no non-empty `blindSpots` (on the entry, or inside `search`): what it cannot see, such as options in variables, multi-line calls or dynamic names | Fails, even with `--no-verify-searches`. |
| A structured search with no `judged` list, an entry without an `at` or a non-empty `why`, or a `hitsJudged` field | Fails, even with `--no-verify-searches`. |
| `judged` has a different number of entries from `hits` | Fails with `--no-verify-searches`; when the search runs, the location check below catches it. |
| `hits` differs from the count at the pin, or the regex does not compile | Fails. |
| The `at` values of `judged` differ from the hit locations at the pin, compared as a multiset (a location with two hits is judged twice), case- and slash-insensitively | Fails, naming each hit left out and each location that is not a hit (a duplicate shows as "(1 hit, judged 2)"). |
| A free-text `search` (it cannot be run at the pin) | Fails. |
| `paths` cover fewer files than `boundaryPaths`, with no non-empty `scopeNote` justifying a deliberately bounded claim | Fails. With a `scopeNote` it is only a warning. |
| A `scopeNote` with no non-empty `scopeText`, or a `scopeText` that does not appear (case- and spacing-insensitive) in the field's current text | Fails, even with `--no-verify-searches`: a bounded search clears a claim only when the item states the bound, after every later edit too. |

`--no-verify-searches` skips running searches and says how many were not run, and that their hits and
`judged` locations were not verified. Free text is accepted only then.

With several evidence sources (see "Evidence sources"), the scan covers every source. Each file is
found under its source's prefix, and a path goes to the source with the longest matching prefix, as
in `render`.

**`node <skill>/scripts/ltz.mjs searches <S> [--rounds <unit>,...|all] [--at-current]`** (default all) checks past
scopes:
- It re-runs every structured search logged in those rounds' `fixlog.jsonl` at the pin. It searches
  over `boundaryPaths` (every file without it), not the logged `paths`.
- It reports each search whose boundary-wide count differs from its logged `hits`: a scope that was too
  narrow.
- Entries with a `scopeNote` are listed apart and do not fail, provided their `scopeText` appears in
  the last `new` logged for that field in the round. Otherwise they count as differing.
- Free-text searches are counted but cannot be re-run.
- Nothing is compared with the current items, so past and closed rounds work.
- Each round runs at the pin its `pin.json` recorded. `--at-current` runs every round at the current pin
  instead, after a pin move: it says how many rounds were snapshotted at another pin, and a difference there
  may be the evidence moving, judged at the new evidence.
- It exits non-zero when any differs, or when there is no structured search to re-run.

### Reach

**`node <skill>/scripts/ltz.mjs reach <S> --to <rev> [--unit <unit>]`** measures a pin move before the
owner decides (`references/round.md`, "Between rounds only"):
- It lists the files changed between the pin and `<rev>` (`git diff --no-renames`, so a renamed file
  counts under both paths), kept to `boundaryPaths`.
- Per unit, it puts the items in three groups: those that cite a changed file; those that hold a
  universal word (config `universalWords`), cite no changed file, and whose last structured fixlog
  search (any round), re-run over `boundaryPaths` (not its logged `paths`, as `searches` does), finds
  different hits at `<rev>` than at the pin; and the universal items with no
  structured search to re-run, each with the words it holds. The writer checks the third group by
  hand or counts it in.
- It needs a single git evidence source, reports only, and exits non-zero only on a problem (a bad
  `<rev>`, or a logged search that cannot run, which is then counted in the third group).

## Sweeps
`node <skill>/scripts/ltz.mjs sweep <S> <pattern.json|classfile> [--unit U] [--count]` runs one pattern,
or each pattern of a class file (a JSON array of patterns, or `{"patterns": [...]}`), over the items.

**Known instances.** Each pattern must hit every id in its `knownInstances`. A fixed item no longer
carries the wrong text, so a known instance counts as hit when the pattern hits any of:
- the item in the **current items**;
- the item in **any round's `snapshot.jsonl`**, in any unit;
- the item's text in **any round's `fixlog.jsonl` `new` values**. This registers a wrong a fix introduced
  and fixed again before the next snapshot.

**History folders.** With `historyFolders` in `config.json`, a round in each folder's
`<folder>/<unit>/r<R>/` counts as well, for its `snapshot.jsonl` and its `fixlog.jsonl` `new` values. So
a known instance that discovery found and fixed is still hit in the main loop. `S/`'s own rounds are
checked first, and a history round is labelled with its folder, such as `discovery/u1/r3 snapshot`. A
listed folder that does not exist, or a `historyFolders` that is not an array, is a PROBLEM, as for
`record` and `flips`, even when every known instance is hit.

This check runs over all items, whatever `--unit` says. A pattern refuses (non-zero) in any of these
cases:
- it misses a known instance;
- it has an empty `knownInstances`, unless `--count` is given;
- it names a field that no item has.

With `--count`, a pattern with no `knownInstances` still runs, to count claim shapes at setup; the
summary says it was counted only.

**Output.**
- Without `--count`, it prints every hit (id, field, matched text).
- With `--count`, it prints only the hit counts per pattern and unit, never the hits themselves.
- `--unit` limits the hits (and counts) to one unit.

## Flips
`node <skill>/scripts/ltz.mjs flips <S> <unit>` reports any (id, field) whose value returns to one it
held earlier, across `S/<unit>/r*/fixlog.jsonl`.
- **History folders.** With `historyFolders` in `config.json`, it reads each folder's
  `<folder>/<unit>/r*/fixlog.jsonl` first, in config order, and then `S/`'s rounds. So a field that
  returns to a value it held during discovery is reported. A history round is labelled with its
  folder, such as `discovery/r3`. A listed folder that does not exist, or a `historyFolders` that is
  not an array, is a PROBLEM.

A flip is explained, listed apart and not a failure, when the fixlog entry that makes the return
carries a `ruling`:
- **a ruling id**, such as `"R-12"`;
- **`"judgment:<round>:<id>"`**, for an overturn that was not a ruling (a spot-check, say). It counts
  only when the `judgments.jsonl` of the state folder holding that entry (`S/`, or the history folder
  for a history round) has an entry for this unit with that round and id, and that entry concerns the
  flipped item: its `id` is the item, or its `backprop` list names it.
- **`"judgment:<folder>/<round>:<id>"`**, when the overturned verdict's round is in another state
  folder from the entry's. The judgments line goes in the `judgments.jsonl` of the state folder that
  holds the verdict's round, so a main-loop entry in `S/<unit>/r<N>/fixlog.jsonl` that reverts a
  discovery edit cites `"judgment:discovery/2:A01"`. It counts by the same rules, in that folder's
  `judgments.jsonl`. `<folder>` must equal a `historyFolders` entry as written (a trailing `/` aside);
  any other folder leaves the flip unexplained, and nothing is looked up elsewhere.

Any other flip fails the command.

## Queue
**Job states:** `queued`, `running`, `stopped-limit`, `stopped-credits`, `stopped-context`, `done`,
`replaced`, `dropped-by-owner`. `done`, `replaced` and `dropped-by-owner` are closed; every other state
is open, `queued` included. The guard blocks item commits while any job in any round is open.

**Replacing an agent.** After an account change, or in a new session, an old agent cannot be continued.
Then, in this order:
1. Run `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> status`. The slot's `resume` value is FROM:
   the first position its result file lacks (the slot's first position when it has no file).
2. Launch a fresh agent on the slot, with the same brief, from FROM. It appends to
   `agent-<slot>.jsonl`.
3. Run `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> replace <slot> --agent <newId> --from FROM
   --transcript <path>` with the id and transcript path the launch gave.
   - `--from` must equal the result file's resume position when `replace` runs, so nothing is judged
     twice or skipped.
   - So run it at once, before the new agent writes its first line. If the agent has already written
     lines from FROM, `replace` refuses (its message says so); check that those lines are the new
     agent's, then run `replace` without `--from`.

What `replace` does:
- the slot stays open (`running`) with the new agent, and the old agent goes into `agentHistory`;
- a `done` or `dropped-by-owner` slot is refused.

Use `mark <slot> replaced` only to close an abandoned slot that nobody will read.

### Dropped ranges
When the owner approves dropping the rest of a reader's range:
- run `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> mark <slot> dropped-by-owner --ruling <id>`.
  `--ruling` takes its decision id in the decision log (usually `P-n`). The tool records the slot's
  uncovered tail (`dropped: {from, to, ruling}`); a slot that already covers its range is refused.
- `record` then does not require those positions. The chunk is reported as `fullDepth: false`, with
  its `droppedRanges`, in `measure.json`, unless reruns read the whole dropped tail; several reruns
  may share it ("Re-runs and supplementary reads").
- An item that no reader of its chunk read is reported `unread`, never `ok`.

### Opaque slot names
`node <skill>/scripts/ltz.mjs queue <S> <unit> <R> init --opaque` names the slots with short random
ids, such as `k7f2`, instead of `<chunk>-a` and `<chunk>-b`. A reader then cannot tell from its own
slot name that another reader shares its range.
- It makes two slots per chunk; `--per-chunk N` makes N.
- `--chunks c2,c3` queues only those chunks. It is accepted only for a `final-check` unit (see
  "Final-check rounds").
- `queue.json` keeps the chunk-to-slots map (`groups`), and `init` prints the matching
  `--chunk-readers` arguments for `record`.
- Every other command takes the opaque names as it takes any slot name.

### Final-check rounds
A unit whose `status` in `config.json` is `final-check` (a closed unit reopened for the final targeted
check) runs round F with readers only for the chunks covering a dropped range from
`S/known-wrongs.txt` (even one another reader read), or holding `evidence-moved` leads after a pin move. The writer chooses those chunks; the tool does not
read that file. Leads are confirmed by the writer, with a `foundBy`.
- **`queue init`** accepts a subset of the chunks (`--pairs` naming only some, or `--opaque --chunks`),
  or none: `init` with neither `--pairs` nor `--opaque` writes an empty queue (`groups` and `slots`
  empty, `finalCheck: true`). Without a `queue.json` at all, `record` works the same.
- **`record`** accepts chunks with no readers in `--chunk-readers`, and no `--chunk-readers` at all.
  - Their items are reported `unread`, with the note `not read (final check)`, unless confirmed,
    pending or a defect.
  - A confirmed id there is counted as found by none, by its `foundBy`, as usual.
  - Each such chunk has `notRead: true` and `fullDepth: false`. `measure.json` lists them in
    `chunksNotRead` and sets `finalCheck: true`. `zeroBlockers` names them, so the round never counts
    as a zero.
  - The read chunks and the fix checker's results (`fixChecker`) are measured as usual.
- **Every other status** keeps the refusals: `queue init` needs every chunk queued, and `record` needs
  `--chunk-readers` naming readers for every chunk.

### Re-runs and supplementary reads
`node <skill>/scripts/ltz.mjs queue <S> <unit> <R> rerun <slot> --from P --to Q` adds a new slot that
reads positions P-Q of `<slot>` again: a re-run of evidence that was trimmed, unrendered or failed,
a supplementary read of a skimming reader's range, or (with the owner's OK) a read of an
owner-dropped tail.
- **The new slot.** It gets an opaque name and records its `parent`, and starts `queued`. The output
  says how to launch it (`FROM = P`). It is an open job like any other, so it blocks item commits
  until it is closed.
- **Refusals.** P-Q must lie inside the parent's range. A rerun of a rerun is refused: rerun the
  parent instead.
- **Launching.** `queue next` launches a queued rerun on its own (it is in no pair), after any
  half-launched pair; it counts against the cap.
- **In `record`.** Name only the parents in `--chunk-readers`; a rerun slot named there is refused.
  `record` builds each parent's lines as a merged view:
  - for P-Q, it takes the rerun's lines in place of the parent's; where reruns overlap, the latest
    wins. A wrong the parent marked there that the rerun doesn't mark leaves the union; `record`
    warns with its id, and the writer confirms or drops it (`references/briefs.md`);
  - each file must cover exactly the positions it supplies, once, so the parent's lines inside a
    rerun's range, and an earlier rerun's lines a later one supersedes, are not needed or used;
  - a line outside a rerun's own P-Q is a PROBLEM;
  - each line is checked against the render log of the slot whose file it came from (a rerun's own
    `render-<slot>.jsonl`), for rendering, cites and the file:line of a `wrong` note, and `cites_read`
    comes from that log too.
- **Rerun states.** A `replaced` rerun is not used. Any other state is used, so a queued rerun with no
  result file yet is a PROBLEM. An owner-dropped tail, the parent's or a rerun's, is excused, and the
  chunk is then not full depth, unless reruns read the whole tail. Each position counts for the latest
  rerun covering it, so several reruns may share the tail, and a rerun's dropped tail needs reruns added
  after it.
- **Where it shows.** `measure.json` lists every rerun used (`reruns`, and per chunk), with its
  parent, range, state and the positions it supplied. In `report.json`, a reader entry taken from a
  rerun carries `"rerun": "<slot>"`. Counts such as `foundBy` stay under the parent's name.

### Transcripts and cost
- **Storing.** `queue ... mark <slot> running --agent <id> --transcript <path>` stores the agent's
  transcript path on the slot (made absolute). `replace ... --transcript <path>` adds the next
  agent's. A slot keeps a list, so earlier agents' transcripts still count.
- **`node <skill>/scripts/ltz.mjs cost --queue <S> <unit> <R>`** sums every stored transcript of that
  round, each counted once. A missing file is a PROBLEM, and the rest are still summed; slots with no
  transcript are named in a warning.
- **`node <skill>/scripts/ltz.mjs cost --timeline <transcript.jsonl>`** prints one line per message:
  its timestamp, the time since the first message, its tokens and the running total. A message seen
  on several lines counts once, at the max of each field, with its earliest time. Each message that
  runs `ltz ... render` starts a window; the `render ... show` form is extra reading, like `show`, and
  starts none. The output then sums the startup (the messages before the
  first render) and each window: messages, tokens and minutes. So the startup cost and the minutes per
  window can be read off.

### The writer's lock
`node <skill>/scripts/ltz.mjs lock <S> acquire|release|check --session <id>` manages `S/writer.lock`.
The writer cannot learn its own session id, so it can pass `--session auto` instead:
- the guard hook (`hooks/README.md`) runs before the command, sees the session id, and writes it to
  `S/.session-hint` with the time;
- `lock` reads the hint, deletes it, and uses that id, which it prints;
- with no hint (no guard), an unreadable one, or one older than 60 seconds, it fails: give the id, or
  enable the guard. A stale hint is deleted too, and a hint is never used twice.

## Round 0
`r0` is the cost-measurement read: one test reader reads one window under the draft bar, and its
verdicts do not count.
- **`snapshot <S> <unit> 0`.** It writes a one-window `list.json` and a single chunk (the first
  `windowSize` items); `snapshot.jsonl` keeps the whole unit.
- **Running it.** `node <skill>/scripts/ltz.mjs queue <S> <unit> 0 init --opaque --per-chunk 1`, `render`, `queue <S> <unit> 0 mark
  <slot> done` and `record` work for r0 as for any round.
- **Closing it.** Close an r0 left open with `mark <slot> done`, or `mark <slot> replaced` if it was
  abandoned. An open r0 job blocks item commits like any other.
- **Repeats.** r0 is never an earlier round for the repeat check.
- **Never a zero.** An r0 `record` reports `countsAsZero: false`, with the blocker "r0 / partial list:
  not a full pass".

## Counting a round as zero
`measure.json` and `report.json` carry `countsAsZero` and `measure.json` lists its `zeroBlockers`. A
round counts as zero only when all of these hold:
- it is a full pass: not r0, and `list.json` lists every item of the unit (`fullPass`);
- it was read at full depth, as far as the tool can see: no chunk in `measure.json` with a non-empty
  `droppedRanges` or with `notRead: true` (see "Dropped ranges" and "Final-check rounds"). A skimmed range, and
  an item edited after the pass read it, are the writer's checks (`references/round.md`, step 8);
- it has no confirmed `wrong` and nothing `unread` (an `outside-bar` item, listed for the owner, does
  not block it);
- it has no `pending-owner` item with `pendingReason` `boundary-silent` or `ruled-wording`, ever. Those
  items concern text the evidence refutes, so no setting lets them through;
- it has no `pending-owner` item with `pendingReason` `rule-meaning`, when `ownerQuestionsBlock` is true
  (the default);
- it has no `defect`, when `defectsBlock` is true (default false).

The two settings in `config.json` record the owner's close decisions (process decisions, `P-n`): whether open questions about a
rule's meaning, or open defects, block a close. `measure.json` echoes them as `closeRules`, counts the
pending items per reason (`total.pendingByReason`), and names the reason in each `zeroBlockers` entry.
`countsAsZero` reads only the round's `confirmed.json` `defects`; with `defectsBlock` set, the writer
also checks `S/defects.md` for open defects for the unit before a close (`references/round.md`,
step 8), because readers mark ok an item that describes a code fault accurately. Each line there names
its unit; a line for a gap no item covers has item ids "none", so no `confirmed.json` `defects` list
can hold it. The close follows
`S/defects.md`: a defect marked closed there by an owner decision no longer blocks, though that pass's
`zeroBlockers` may still count it (`zeroBlockers` counts the ids in `defects`, as "1 defect (defectsBlock)",
without naming them; a code fault logged while fixing a wrong item is never there, since its item is `wrong`).
The fix checker's own results (`fixChecker`) do not enter this: the wrongs it finds in the new text are
fixed before the next round. A wrong it finds in this unit's old text (a named item or an unchanged field), which
the writer copies into `confirmed.json` with `"foundBy": "fixcheck"`, does: it is a confirmed wrong of
the round like any other, so the round does not count as zero.

## Replay
`node <skill>/scripts/ltz.mjs replay <S> <pattern.json|classfile> --rounds <unit>[,...|all]` runs the
pattern(s) over each past round's `snapshot.jsonl` that has a `confirmed.json` (r0 never: its find list is
`{}` by rule), and reports the recall
on that round's confirmed wrongs of the pattern's class, and the false hits.
- **History folders.** With `historyFolders` in `config.json`, each folder's `<folder>/<unit>/r*`
  rounds that have a `confirmed.json` are replayed too, before `S/`'s, in config order, as in `flips`.
  A history round is labelled with its folder, such as `discovery/u1/r3`, and the summary says how many
  rounds came from history folders. A listed folder that does not exist, or a `historyFolders` that is
  not an array, is a PROBLEM; `S/`'s rounds are still replayed.
- **Overturned wrongs.** A confirmed wrong is not counted when its latest line in the `judgments.jsonl`
  of the state folder holding the round (`S/judgments.jsonl` for `S/`'s rounds, the history folder's
  own for a history round, as `flips` resolves `judgment:` references) for that unit and round (file
  order decides "latest") has `now` equal to `ok` or `pending-owner`. So an overturn in one folder
  never reaches a same-numbered round of another. Overturned to `ok`, a hit on it is a false hit;
  overturned to `pending-owner`, it is neither a recalled wrong nor a false hit, like a pending item.
- **Matching a line.** As in `flips`: the line's `unit` is that unit, or the line has no `unit`, and its
  `round` is the round's number (`2` or `"r2"`).

## Rulings
`node <skill>/scripts/ltz.mjs rulings <S>` checks that every ruling id in the decision log appears in
the accepted-by-ruling section. It uses these `config.json` settings:

| Setting | Meaning |
|---|---|
| `decisionLog` | The path of the decision log; a relative path is relative to `S/`. |
| `rulingIdPattern` | A regex for ruling ids, for example `"R-\\d+"`. |
| `requireRulingEntries` | When `true`, `snapshot` also refuses while any ruling id is missing from the section. |

How the check works:
- **The ids.** It collects every match of the pattern in the log that is whole text: no letter or digit
  just before or after it, so `PR-12` and `XR-5` hold no `R-n` id. A pattern with no such match is a
  failure, since nothing would be checked.
- **Where it looks.** In the section of `S/classes.md` under a heading that contains "accepted by
  ruling", up to the next heading of the same or a higher level. A mention elsewhere in `classes.md`
  does not count.
- **Found or MISSING.** An id is found when it appears anywhere in that section as whole text (`R-1`
  is not found inside `R-12`); otherwise it is MISSING.
- The same ids (every whole-text match in the log) are what a repeat's `rulingsChecked` list must name in
  `record` (see `confirmed.json` under "File formats").

## File formats
All `.jsonl` files hold one JSON object per line.

**`S/config.json`:**
```json
{"evidence": {"type": "git", "repo": "<path>", "pin": "<tag|commit>"},
 "windowSize": 16, "itemFields": ["title", "body"],
 "units": {"<unit>": {"status": "<a unit status>", "itemFiles": ["<repo-relative path>"]}},
 "universalWords": ["...optional override..."], "itemsRoot": "<optional base for itemFiles>",
 "maskSecrets": true, "maskKeys": [], "maskAllow": [], "maskExclude": [],
 "boundaryPaths": ["src/**", "docs/**"],
 "ownerQuestionsBlock": true, "defectsBlock": false,
 "decisionLog": "<path>", "rulingIdPattern": "<regex>", "requireRulingEntries": false,
 "historyFolders": ["discovery"]}
```

Notes on these fields:
- **Unit statuses:**
  - `open`;
  - `final-check`: a closed unit reopened, with the owner's OK, for the final targeted check of its
    leads. The check runs as the unit's next round F, snapshotted before any edit; it needs readers only
    for the chunks covering a dropped range from `S/known-wrongs.txt` (even one another reader read)
    or holding `evidence-moved` leads,
    and `queue init` and `record` accept the others left unread (see "Final-check rounds"). When that check is
    done, the unit is set back to the closed status `loop.md` kept for it ("was <status>"). **Before setting it
    back**, take a new baseline with `node <skill>/scripts/ltz.mjs snapshot <S> <unit> <F+1>`. Otherwise
    diffcheck compares the closed unit with its older snapshot and flags every final-check edit.
  - `closed`, `closed-leads-pending`, `closed-owner-questions-open`, `closed-known-wrongs` and
    `closed-by-stopping-rule`.

  Every status that starts with `closed` counts as closed: the guard blocks edits to its item files
  that no open unit also lists (see "The guard works per file" in `hooks/README.md`), and diffcheck
  flags any change to its items. Any other status, `final-check` included, counts as open.
- **Evidence.** `evidence` is one source, or a list of prefixed sources (see "Evidence sources"). For
  folder evidence, use `{"type": "dir", "root": "<path>", "sha256": "<hash>"}`. `snapshot` prints the
  folder's hash while `sha256` is unset (a warning); once it is set, `snapshot`, `render` and `show` refuse
  the folder if any file in it has changed, been added or been removed since. The hash covers every file's
  relative path and content.
- Set `itemsRoot` when the items live in a different repo from the evidence.
- `boundaryPaths` are globs describing the evidence boundary, used by searches.
- `ownerQuestionsBlock` and `defectsBlock` are the owner's close decisions (process decisions; see "Counting a round as
  zero").
- `historyFolders` lists other state folders (relative to `S/`, such as a discovery state folder) whose
  rounds the repeat check, `flips`, `sweep`'s known-instance check and `replay` also read (see each).

**Item files:**
- **`S/items.jsonl`, `r<R>/snapshot.jsonl`:** `{"id", "unit", "type"?, <itemFields>..., "cites": [<cites>]}`.
  - `type` is optional: `"requirement"` (the item states what must hold) or `"description"` (it
    describes the evidence).
  - The tools pass `type` through to the snapshot and the windows. `diffcheck` holds a
    `"requirement"` item's changes to a copying-error basis or a ruling (see "The diff check"); the
    other tools ignore it. `snapshot` warns about any other value.
- **`r<R>/pin.json`:** `{"sources": [{"type", "prefix", "repo", "pin", "commit"} | {"type", "prefix", "root", "sha256"}]}`, written by `snapshot`. `searches` re-runs the round's logged searches at this pin, and `record` warns when the config's pin has moved since. A round with no `pin.json` (snapshotted before it existed) is read at the current pin.
- **`r<R>/snapshot.sha256`:** `<sha256>  snapshot.jsonl`. `render`, `record` and `diffcheck` refuse a snapshot that no longer matches it.
- **`r<R>/list.json`:** `["<id>", ...]`, in list order. Position 1 is the first id.
- **`r<R>/chunks.json`:** `{"c1": {"from": 1, "to": 64}, ...}`. Each position is in exactly one chunk. The default size is about 70 items, cut on window multiples, and a tail shorter than half a chunk joins the chunk before it.
- **`--list` file** (the fix-checker input, `r<R>/fixcheck-<K>-<part>-input.jsonl`, where `<K>` is the fix-check iteration): a JSONL of **full items** in the item format, one per line, with ids unique.
  - **A changed item** carries `"changed"`: one `{"field", "old"?, "new"}`, or an array of them when several fields changed. Each is rendered on its own line (`changed[1]: <field>: <new>  (was: <old>)`). A `changed` that is empty, or lacks `field` or `new`, is refused.
  - **A named item** has no `changed` field. It is an item the new text names, added for context, and its window heading is marked `(named item, for context)`.
  - `render --list` shows each item's text from this file, not from the snapshot.
  - Positions count the file's lines, from 1.
  - Bad JSON, a missing id or a duplicate id is refused.

**Reader files:**
- **`r<R>/agent-<slot>.jsonl`** (reader results): `{"unit", "id", "verdict": "ok|wrong", "class": [...], "note", "cites": [...]}`. A `wrong` note names a `file:line` that the reader rendered, unless it starts "self-contradiction:" and quotes the clashing figures.
- **`r<R>/fixcheck-<K>-<part>.jsonl`** (fix-checker results, iteration `<K>`, in the reader schema): `record` reads them into `measure.json`'s `fixChecker`. A line without an `id`, or with a verdict other than `ok` or `wrong`, is a PROBLEM, and so is a `fixcheck-*.jsonl` file not named this way.
- **`r<R>/render-<slot>.jsonl`** (render log, written only by render and show):
  - `{"t": "item", "id"}`: an item shown in a window;
  - `{"t": "cite", "cite", "path", "status", "id"?, "via"?}`: one cite attempt; `status` is `ok`, `beyond-eof`, `not-found-at-pin`, `key-not-found` or similar;
  - `{"t": "line", "path", "line", "id"?, "key"?, "via"?, "masked"?}`: one line shown. For a `path:Key` or `path#a.b.c` cite, `key` holds that key.
  - An entry made by `show` carries `"via": "show"` and no `id`; one made by a window render carries its item's `id`. A reader's depth is its `show` lines per item, each counted in the window whose items come just before it in the log.

**Writer files:**
- **`r<R>/confirmed.json`:**
  ```json
  {"<id>": {"note": "...", "foundBy": "sweep|spot-check|audit|fixcheck|extract", "class": "U1"|["U1"],
            "repeatReason": "plain-fix-failure|new-text|earlier-miss", "repeatNote": "...",
            "rulingsChecked": [{"ruling": "<ruling id>", "why": "<why it does not cover this item>"}]},
   "pending": [{"id": "<id>", "pendingReason": "rule-meaning|boundary-silent|ruled-wording",
                "question": "..."}],
   "withdrawn": [{"id": "<id>", "ruling": "<ruling id>"}],
   "outsideBar": [{"id": "<id>", "note": "<what the evidence shows, with file:line>"}],
   "ruledKept": [{"id": "<id>", "ruling": "<ruling id>"}],
   "rejected": [{"id": "<id>", "note": "<why; the file:line that answers the refuter, or history: ...>"}],
   "defects": ["<id>", ...]}
  ```
  - `pending`, `withdrawn`, `outsideBar`, `ruledKept`, `rejected` and `defects` are reserved keys.
  - **`rejected`** lists every reader wrong the writer did not confirm (a false alarm), each with a note that
    names a file:line answering the refuter, or starts "history:" and names the earlier reasoned ok. A reader
    wrong (canaries aside) that is not confirmed, pending, a defect, withdrawn, outside the bar or rejected is
    a PROBLEM, and so is a note with neither, or an id also in another list. One no reader marked gives a
    warning. In `measure.json` they stay false alarms; `report.json` shows them `ok`, with the note under
    `rejected`.
  - **`withdrawn`** (optional) lists reader wrongs that a ruling given mid-round overturned. In
    `measure.json` they are not false alarms: they are counted per slot as `withdrawnByRuling.<slot>`,
    and in total as `withdrawn`. They are not confirmed wrongs, so they are out of the confirmed count
    and the remaining-wrongs estimate, and `report.json` shows them `ok` with `withdrawnByRuling`. Each
    `ruling` must be a whole ruling id (config `rulingIdPattern`) that the decision log (config
    `decisionLog`) holds; otherwise, or without those settings, it is a PROBLEM. An id that is also
    confirmed, pending or a defect is a PROBLEM. One that no reader marked wrong gives a warning.
  - **`outsideBar`** (optional) lists reader wrongs that fit no class of a frozen bar. They are listed
    for the owner and not counted:
    - in `measure.json` they are not false alarms: they are counted per slot as `outsideBar.<slot>`, and
      as items in `outsideBarItems`, with their ids in `outsideBarIds` (per chunk and in total);
    - they are not confirmed wrongs, so they are out of the confirmed count and the remaining-wrongs
      estimate, and they never block a zero;
    - `report.json` shows each one `outside-bar` (neither ok nor wrong for the pass's count), with its
      note, when a reader read it; an item no reader read stays `unread`;
    - `record`'s summary names them, so the writer lists them for the owner.

    A missing or blank `note`, an id not in the snapshot, an id listed twice, an entry that is not an
    `{"id", "note"}` object, or an id that is also confirmed, pending, withdrawn or a defect is a
    PROBLEM. One that no reader marked wrong gives a warning.
  - **`ruledKept`** (optional) lists ruled oks (see `ruledOks` under `measure.json`) that the writer
    checked and found covered by a ruling the owner kept after an "amend <ruling>?" question. A ruled ok
    whose id is listed here with the same `ruling` draws no warning; it stays `ok`, and is still listed
    in `ruledOks`. Each of these is a PROBLEM, and `record` writes nothing:
    - not a list, or an entry that is not an `{"id", "ruling"}` object with both non-empty;
    - the same id and `ruling` listed twice;
    - an id that is not a ruled ok of this round (a reader's or a fix checker's);
    - a `ruling` that no ruled ok of that id names (the ruling is compared as written; another
      ruled ok of the same id under a different ruling still warns);
    - an id that is also confirmed, pending, a defect, withdrawn or in `outsideBar`.

    The tool reads neither `S/classes.md` nor the decision log for this: the writer checks the
    ruling's entry.
  - `foundBy`, `class`, `repeatReason`, `repeatNote` and `rulingsChecked` are optional; `class` is used by `replay` and the repeat check.
  - **`pending`** entries each need a `pendingReason`, or `record` refuses (a PROBLEM):
    - `"rule-meaning"`: a rule's meaning is in dispute, and the item's truth turns on that meaning (SKILL.md, Verdicts);
    - `"boundary-silent"`: the boundary is silent on the refuter's kind of evidence;
    - `"ruled-wording"`: a ruling approved the refuted wording (the question is "amend <ruling>?").

    `question` is optional. The reason decides whether the item blocks a zero (see "Counting a round
    as zero"), and `report.json` shows it on the item. A bare id (rounds written before pending
    reasons) is still read by the repeat check and `replay`; only `record` of the round itself refuses
    it.
  - **`foundBy`** says how a wrong that no reader marked was found:
    - `"sweep"`: a class sweep;
    - `"spot-check"`: the writer's own check, such as a spot-check, or a wrong the writer confirmed from
      a source no other value names (such as a stronger reviewer or a solo cold sample read);
    - `"audit"`: a known outside finding, such as an audit or review;
    - `"fixcheck"`: a fix checker found it in old, snapshot text, such as a named item or an unchanged
      field;
    - `"extract"`: the extract flagged the item with no usable cite.

    Each counts as found by none in `measure.json`, and `foundByNoneBy` counts them per value; audit
    finds are also counted as `foundByAudit`. Any other value is a PROBLEM. If a reader did mark an
    item that has a `foundBy`, the reader files decide: it counts as that reader's find, with a
    warning.
  - Write `{}` when nothing was confirmed.
  - **Repeat check.** A confirmed id that an earlier round of the same unit also confirmed (r0 does not
    count, nor an earlier wrong whose latest `judgments.jsonl` line for that round says `now` `ok` or
    `pending-owner`) is a PROBLEM when the classes overlap. The classes come from the entries, or else from the
    readers' class labels, and a class unknown on either side counts as overlapping. How to settle it:
    - **The evidence plainly refutes the item.** It stays `wrong`, with a `repeatReason`, a non-empty
      `repeatNote` saying what happened, and a `rulingsChecked` list (see "`rulingsChecked`" below):
      every bar ruling in the decision log, each with why it does not cover the item. The reason is
      one of:
      - `"plain-fix-failure"`: the earlier fix did not settle it;
      - `"new-text"`: the wrong is in text an earlier fix introduced;
      - `"earlier-miss"`: a different claim of the same class, in old text, that was missed earlier.

      **Tie-break:** if the refuted claim is still standing, it is `"plain-fix-failure"`.
    - **It goes in `pending`, for the owner, only for** a dispute over a rule's meaning
      (`rule-meaning`), a boundary that is silent on the refuter's evidence kind (`boundary-silent`),
      or wording a ruling approved (`ruled-wording`).
    - Any other `repeatReason`, one without a `repeatNote`, or one whose `rulingsChecked` fails the
      checks below, is a PROBLEM.
  - **`rulingsChecked`**, on a repeat kept wrong with a `repeatReason`, is a list:
    `[{"ruling": "<ruling id>", "why": "<why it does not cover this item>"}, ...]`. It names every bar
    ruling in the decision log, superseded and withdrawn ones too (their why can be "superseded by
    R-7"). With config `decisionLog` and `rulingIdPattern` set, the listed rulings must equal the ids
    the log holds, collected as `rulings` does (see "Rulings"). `S/classes.md` is not read. Each of
    these is a PROBLEM:
    - anything but a list, such as the old `true`;
    - a log id left out (one PROBLEM per id, naming it), or a listed id not in the log;
    - a list item that is not a `{"ruling", "why"}` object, or a `ruling` that is not a whole ruling id;
    - a blank or missing `why`, or the same `ruling` listed twice.

    Without `decisionLog` or `rulingIdPattern` there is nothing to check a list against: a non-empty
    list is a PROBLEM, and `[]` is accepted with an `INFO:` line saying it was not checked. Either
    setting present but not a non-empty string, a pattern that does not compile, a log that is missing
    or unreadable, or a log the pattern finds no id in is a PROBLEM, even with `[]`.
  - **History folders.** With `"historyFolders": ["discovery"]` in `config.json` (paths relative to
    `S/`), the repeat check also reads `<folder>/<unit>/r*/confirmed.json` in each, every round but r0,
    such as a discovery state folder's rounds. A listed folder that does not exist is a PROBLEM.
  - **Defects.** Ids in `defects` (the evidence itself is at fault (the code, or a config that differs
    from the policy it implements), or a requirement is unmet; see `S/defects.md`) are reported as
    `defect`. They are not wrongs, not false alarms, and not in the estimate. An id cannot be both a
    confirmed wrong and a defect, or both pending and a defect.
- **`r<R>/report.json`:** `{unit, round, snapshotSha256, generated, fullDepth, countsAsZero, counts, items: [...]}`
  (`generated`: when `record` wrote it, an ISO time). Each item has:
  - `id`, `chunk`, `position`;
  - `verdict`: `ok`, `wrong`, `pending-owner`, `defect`, `unread` or `outside-bar` (an `outsideBar`
    item some reader read; see `confirmed.json`). `counts` has one count per verdict;
  - for a `pending-owner` item, `pendingReason`;
  - for an `ok` item a ruling withdrew, `withdrawnByRuling`: the ruling id (not the per-slot count
    `measure.json` keeps under that name);
  - `note`;
  - `cites_read`: only from the render logs;
  - `cites_read_by`, keyed by slot;
  - `readers`, keyed by slot: `{verdict, class, note}`; a reader whose range was dropped shows
    `{"verdict": null, "dropped": true, "ruling"}`, and an entry taken from a rerun carries
    `"rerun": "<slot>"`;
  - for a wrong item, `foundBy` (the slots that marked it wrong), `foundByWriter` (the confirmed
    entry's own `foundBy`, when it has one) and `class` (the entry's classes, when it has any).
- **`r<R>/measure.json`:**
  - `unit`, `round`, `snapshotSha256`, `caveat` (the estimate caveat, as in each `estimate`);
  - `fullPass`, `fullDepth`, `countsAsZero`, `zeroBlockers`, `closeRules`;
  - `finalCheck` and `chunksNotRead` (both: see "Final-check rounds");
  - `chunks.<c>` holds:
    - `readers` (the chunk's slots in `--chunk-readers`), `items`;
    - `fullDepth` (see "Counting a round as zero"), `notRead` (true for a final-check chunk with no
      readers in `--chunk-readers`; see "Final-check rounds"), `droppedRanges` (a rerun's carries
      `rerunOf`), `reruns`;
    - `union` (every reader wrong), `unionSize`, `confirmed`, `defects`, `foundByAll`;
    - `foundBy.<slot>`, `foundByAlone.<slot>`;
    - `foundByOneReader`, `foundByNone`, `foundByNoneIds`, `foundByNoneBy.<foundBy value>`,
      `foundByAudit`, `foundByAuditIds`;
    - `falseAlarms.<slot>`, `falseAlarmIds.<slot>`, `pendingMarkedWrong.<slot>`,
      `defectMarkedWrong.<slot>`;
    - `withdrawn`, `withdrawnByRuling.<slot>` (reader wrongs a ruling overturned; not false alarms);
    - `outsideBar.<slot>`, `outsideBarItems`, `outsideBarIds` (reader wrongs outside a frozen bar,
      listed for the owner; not false alarms, not confirmed);
    - `estimate`: `{pair, n1, n2, m, N, foundByReaders, remaining, range, lowConfidence, why?, caveat, partial?,
      note?}` (`note` with more than two readers), or `{pair: null, reason, caveat}` with fewer than two.
      `range` is a rough 95% range on `remaining` from Chapman's variance (Seber); `lowConfidence` is true when
      the overlap `m` is under 3, and `why` says why (a pass with no finds gives 0 by construction).
  - `total` holds:
    - the chunks' counts, summed (the `.<slot>` ones stay per slot), except `unionSize`; of the id
      lists, only `outsideBarIds`;
    - `estimate`: `{N, foundByReaders, remaining, range, lowConfidence, lowConfidenceChunks, chunksEstimated,
      chunksNotEstimated, caveat}`, the chunks' estimates and ranges summed;
    - `pending`, `pendingByReason`, `unread`, `fullDepth`, `chunksNotFullDepth`, `countsAsZero`.
  - `reruns`: `[{slot, parent, chunk, from, to, state, positionsTaken}]`, every rerun merged in.
  - `ruledOks`: `[{id, slot, ruling, refs}]`, every `ok` whose note starts `ruled: <ruling id>` (the
    reader and fix-checker briefs' form for wording a ruling approved where the evidence differs). They
    come from the lines the merged view uses, and then from the fix checker's result files
    `fixcheck-<K>-<part>.jsonl`, whose `slot` is the file's name (such as `fixcheck-1-p1`; `<part>` names a part of the fix set). `refs`
    are the note's file:line references. Each one is printed as a warning, not a PROBLEM, unless its id
    is in `pending` with `pendingReason` `ruled-wording`, or listed in `confirmed.json`'s `ruledKept`
    with the same ruling (the owner kept the ruling).
  - `fixChecker`: one entry per fix-check iteration, `[{iteration, itemsChecked, wrongs, wrongIds,
    notJudged, chunks: {<part>: {itemsChecked, wrongs, wrongIds, inputItems?, notJudged?, notRun?}}}]`. These `chunks` are keyed by fix-check part (`p1`, `p2`, ...), not by round chunk.
    `itemsChecked` counts distinct ids. `inputItems` and `notJudged` come from the matching
    `fixcheck-<K>-<part>-input.jsonl`; `notRun` marks an input with no results yet. It is empty until
    a fix checker has run, which is normal at a round's first `record`.
  - `canaries.<slot>`: `{planted, plantedWrong, plantedOk, caught, missed, falseAlarms, okCorrect, notJudged, detail}`.
  - **The estimate** is Chapman: N = ((n1+1)(n2+1)/(m+1)) − 1, and remaining = N − (n1 + n2 − m). It uses the first two readers listed for a chunk. It is a low estimate: readers share a brief, so they are not independent, and `foundByNone` adds to it.
  - **Templated ok notes:** `record` warns when one reader file's ok notes share one text on 5 or more items (file:line refs and numbers ignored, case and spacing folded), naming the ids. A warning only: the writer gives that range a supplementary read.
- **`r<R>/queue.json`:** `{opaque?, groups: [{chunk, slots}], slots: [{slot, chunk, from, to, state, agent, reset, parent?, created?, transcripts?, dropped?, agentHistory?, history}]}`.
  - States are `queued`, `running`, `stopped-limit`, `stopped-credits`, `stopped-context`, `done`, `replaced` and `dropped-by-owner`.
  - `done`, `replaced` and `dropped-by-owner` are closed; every other state is open, `queued` included.
  - `agentHistory` lists the agents a `replace` took over from.
  - A rerun slot has `parent` and `created`, and is in no group.
  - `transcripts` lists the agents' transcript paths, absolute, each once.
- **`r<R>/fixlog.jsonl`:** one line per edit, for every field changed since the round's snapshot. The
  fields:

  | Field | Required | Meaning |
  |---|---|---|
  | `id` | yes | The item's id. |
  | `unit` | for another unit's item | That item's unit: a cross-unit edit, checked against that unit's latest snapshot (see "The diff check"). |
  | `field` | yes | The field edited; `"*"` logs a whole item added or removed. |
  | `old` | yes | The value before the edit. The first entry for a field must equal the snapshot's value, and each later entry's `old` must equal the previous entry's `new`. |
  | `new` | yes | The value after the edit. The last entry for a field must equal the current value. |
  | `search` | when the new text keeps or adds a universal | The backing search: structured (`{"regex", "flags"?, "paths"?, "count"?}`), or free text only with `--no-verify-searches` (see "Searches"). |
  | `hits` | with `search` | Its count, a number (0 allowed), in the search's `count` unit. |
  | `judged` | with a structured `search` | One `{"at", "why"}` per hit the writer judged at the pin: `at` is the hit's `path:line` (`path` for `count` `"files"`), `why` a non-empty reason. At the pin the locations must be exactly the hits (see "Searches"). `hitsJudged` is refused. |
  | `blindSpots` | with a structured `search` | What the search cannot see (it may also sit inside `search`). |
  | `scopeNote` | when `paths` are narrower than `boundaryPaths`, or for any search that backs a scoped claim | Why the claim is deliberately bounded. Whenever it is present, `scopeText` is checked. |
  | `scopeText` | with `scopeNote` | The scope words the item states. They must appear (case- and spacing-insensitive) in the field's current text: in diffcheck the item's current value, in `searches` the last `new` logged for that field in the round. So a later edit that drops the bound is caught. |
  | `ruling` | on an entry that returns a field to an earlier value; or, instead of `basis`, on any change to a requirement item | A ruling id, `judgment:<round>:<id>`, or `judgment:<folder>/<round>:<id>` for a judgments line in a history folder; it marks that flip as explained (see "Flips"). On a requirement item's change it is the ruling that allows it (see "The diff check"). |
  | `basis` | on a change to a requirement item, unless it has a `ruling` | `"copying-error"`: the item miscopied its source, which the edit restores. The only accepted value. |
  | `source` | with `basis` | The `file:line` the item copies, such as a policy line or a config value; non-empty. |
- **`S/judgments.jsonl`:** `{"date", "unit", "round", "id", "was", "now", "by", "reason", "lesson"?, "backprop"?}`, one line per changed verdict per round. A line goes in the `judgments.jsonl` of the state folder that holds the verdict's round: `S/judgments.jsonl` for `S/`'s rounds, a history folder's own (such as `S/discovery/judgments.jsonl`) for its rounds. `replay` reads each folder's file for that folder's rounds, to leave out overturned wrongs. `flips` reads it to check `judgment:` references: `judgment:<round>:<id>` in the folder holding the fixlog entry, and `judgment:<folder>/<round>:<id>` from a fixlog entry in another folder (see "Flips").

**Patterns and canaries:**
- **`S/checks/patterns/*.json`** (also used by `sweep` and `replay`): `{"id", "class", "regex", "flags", "fields": [...], "knownInstances": ["<id>"], "regression": true}`. A class file for `sweep` or `replay` is an array of these, or `{"patterns": [...]}`.
- **`S/canaries.jsonl`:** `{"id", "unit", "kind": "wrong|ok", <the same fields as real items>, "cites"}`. `kind` is never rendered.
- **`r<R>/canary-plan.json`:** `{"<slot>": [{"canaryId", "atPosition"}]}`. A canary is shown just before the real item at `atPosition`, and takes no list position.
- **Never commit `S/canaries.jsonl`, any `canary-plan.json`, or `S/canaries-src/`** (the writer's
  source files for `canary add --from`). A reader that can find them in a repo is no longer blind to
  them.
- **Never commit the readers' scratch folders** `S/<unit>/r<R>/scratch/<slot>/`. Probes run there in
  a copy of the code, with the secrets `render` masks.
- **The `.gitignore` lines.** If `S/` is under git, add these lines to `S/.gitignore`:
  ```
  canaries.jsonl
  **/canary-plan.json
  canaries-src/
  **/scratch/
  ```
  `node <skill>/scripts/ltz.mjs canary gitignore <S>` prints them, says which are missing, and exits
  non-zero if any is:
  - **The canary lines** must be there as written.
  - **The scratch line** may be any line that git treats as ignoring every round folder's `scratch/`
    folder, a discovery folder's included, such as `scratch/` or `**/scratch/` (not `*/r*/scratch/`, which
    misses `discovery/<unit>/r<R>/scratch/`). The tool checks this on real paths: it copies
    `S/.gitignore` into a throwaway repo in the system temp folder (with no global, system or
    excludes-file rules) and runs `git check-ignore`.
  - **The paths it probes.** It probes three files in the scratch folder of rounds `r1`, `r12` and
    every round on disk, for each of these units: a made-up one, every unit in `config.json`, and
    every folder of `S/` (or of a folder in `S/`, such as a discovery state folder) that holds round
    folders. So a line naming one unit, one round or one file type is refused, and so is `**/scratch/`
    negated by a later `!` line.
  - **Without git**, it matches the probe paths against the lines itself, by git's rules: `#`
    comments, `!` negation, a trailing `/` for folders only, a leading or middle `/` that anchors the
    line to `S/`, `*`, `?`, `[...]`, `**` and `\` escapes. A file inside an ignored folder is ignored,
    and the last matching line decides. The summary says which method ran.
- **`S/writer.lock`:** `{"session", "since"}`. See `hooks/README.md` for what the lock protects.
- **`S/.session-hint`:** `{"session", "at"}`, written by the guard just before a `lock ... --session auto`
  command and deleted by `lock` (see "The writer's lock").
