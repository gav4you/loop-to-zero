# guard.mjs: a PreToolUse hook for a loop-to-zero state folder

`guard.mjs` reads the hook JSON on stdin (`tool_name`, `tool_input`, `session_id`, `cwd`). It needs Node 18 or
later and no packages.

## When it is active
It is **inert** (exit 0, nothing checked) unless one of these points it at a state folder that holds
`config.json`:
- the environment variable `LTZ_STATE`;
- a file `.ltz-state` in the hook's `cwd`, whose first line is the path. A relative path resolves from that
  `cwd`.

**One thing it does even when inert:** it writes the session hint for `lock ... --session auto` (see
"The session hint" below). That never blocks.

**It watches one state folder.** All its rules (queues, lock, closed units, item files) come from that
one folder. When a loop works in a different state folder, such as a discovery state folder before the
main loop, repoint the guard there by editing `.ltz-state` or `LTZ_STATE`, and point it back afterwards.

## What it blocks
When active, it blocks a tool call with exit 2 and gives the reason on stderr. Claude sees the reason.

| Tool call | Blocked when |
|---|---|
| `git commit` in Bash or PowerShell (also `git -C <dir> commit`, `git -c k=v commit` and `cd <dir> && git commit`) | Any `S/<unit>/r<R>/queue.json` has an **open** job, **and** the commit would include an item file (any unit's `itemFiles`). Readers judge the snapshot, so item edits are committed after the round's reading is done. A commit of only the decision log, `S/` files or other non-item files is allowed. |
| Edit, Write, MultiEdit or NotebookEdit of a file named in a unit's `itemFiles` | Every unit whose `itemFiles` names the file has a `status` starting with `closed` (for example `closed`, `closed-leads-pending`, `closed-owner-questions-open`, `closed-known-wrongs` or `closed-by-stopping-rule`). Log a lead instead. While any unit naming it is open, the edit is allowed (see "The guard works per file" below). Any other status counts as open, including `final-check`: a closed unit reopened with the owner's OK for the final targeted check, then set back to the closed status `loop.md` kept for it ("was <status>"), after a new baseline (`node <skill>/scripts/ltz.mjs snapshot <S> <unit> <F+1>`, where F is the final-check round) so diffcheck does not flag the final-check edits. |
| Edit, Write, MultiEdit or NotebookEdit of a **writer file** (below), or a `git commit` that would include one | `S/writer.lock` is held by a different `session_id`. |
| A search piped into a truncating command in Bash or PowerShell | The search is `grep`, `rg`, `findstr`, `Select-String` or `sls`; the pipe leads anywhere later to `head`, or to `Select-Object`/`select` `-First`. A search backing a bound must be unlimited. |

**The writer lock.** When `S/writer.lock` is held by another session, that session alone may edit or
commit the writer files:
- any unit's item files (`itemFiles`);
- the decision log (`config.decisionLog`, relative to `S/`);
- these top-level state files in `S/`: `config.json`, `loop.md`, `classes.md`, `lessons.md`,
  `judgments.jsonl`, `items.jsonl`, `decisions.md`, `cross-unit-edits.txt`, `closed-unit-leads.txt`
  and `canaries.jsonl`;
- each `historyFolders` folder's `judgments.jsonl` (such as `S/discovery/judgments.jsonl`), which the
  main loop writes when it overturns a discovery verdict. The folder is read as `S/`-relative with any
  trailing `/` dropped, whether or not it exists yet. Nothing else in a history folder is a writer
  file;
- these files in each round folder `S/<unit>/r<R>/`: `confirmed.json`, `fixlog.jsonl`, `queue.json`,
  `report.json`, `measure.json`, `retro.md`, `canary-plan.json`, and the fix-checker inputs
  `fixcheck-*-input.jsonl`.

Every other write stays allowed, so readers and a fix checker in a fresh session can do their work.
This covers their outputs in the round folder (`agent-*`, `render-*`, `w-*`, and the fix-checker
results `fixcheck-<K>-<chunk>.jsonl`) and any scratch folder. A commit by another session is allowed unless it would include a
writer file; when what it includes cannot be determined, it is blocked. An unreadable `writer.lock`
counts as held by another session.

**Open and closed jobs.** A job's state is one of `queued`, `running`, `stopped-limit`,
`stopped-credits`, `stopped-context`, `done`, `replaced` and `dropped-by-owner`. It is closed when its
state is `done`, `replaced` or `dropped-by-owner`. Every other state is open, including `queued`,
`running` and `stopped-*`. So a round whose readers have not all started still blocks item commits, and
an unreadable `queue.json` counts as open. A rerun slot (`queue ... rerun`) is a job like any other.

The guard reads every `S/<unit>/r<R>/queue.json`, old rounds included. A stale open job blocks too,
for example an abandoned round or an r0 measurement read left `queued`. The block message names it as
`<unit>/r<R> <slot> (<state>)`. Close it with one of:
- `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> mark <slot> done` (it has been read);
- `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> mark <slot> replaced` (it was abandoned);
- `node <skill>/scripts/ltz.mjs queue <S> <unit> <R> mark <slot> dropped-by-owner --ruling <id>` (the
  owner dropped its tail; `--ruling` takes its decision id, usually `P-n`).

`node <skill>/scripts/ltz.mjs queue <S> <unit> <R> replace <slot> --agent <newId>` is different: it keeps
the slot open with a new agent.

**What a commit includes.** The hook runs before the command, so it reads the whole command line.
While jobs are open, it works in the commit's folder: from `-C`, or else the `cd` before the commit,
or else the hook's `cwd`. There it collects:
- the staged files (`git diff --cached --name-only`);
- with `-a`/`--all`, the working-tree changes (`git diff --name-only`);
- with pathspec arguments (`git commit -m x docs/`), the working-tree changes under those paths.

Staging done earlier in the same command counts too:
- the paths of a `git add`/`stage`/`rm`/`mv` (a folder counts if it holds an item file);
- for `git add -A`, `-u`, `-p`, `.`, `:/` or a glob, all working-tree changes plus untracked files.

Read-only git commands (status, log, diff, show and similar) before the commit are fine.

**If the staged set cannot be determined, the commit is blocked,** with the reason. This covers:
- no unit listing `itemFiles` in `config.json`;
- a folder that is not a git repo, or a git error;
- `--git-dir`/`--work-tree`, `--pathspec-from-file` or `cd -`;
- a commit the guard cannot parse;
- any other git command before the commit in the same command (stash, reset, restore, checkout,
  apply, merge and so on), since it may change what is staged;
- a non-git command before a commit that relies on the working tree (`-a`, a pathspec, or `git add
  -A`/`.`), since that command may change the working tree first.

Run such a commit as its own command.

**How it matches item files.** A relative `itemFiles` entry is tried against each of these bases, and
it matches if any of them does:
- `config.itemsRoot`, if it is set;
- the evidence repo (git) or root (dir);
- the hook's `cwd`.

Items often live in a different repo from the pinned evidence. Set `itemsRoot` to that repo so the check
does not depend on the session's folder.

An `itemFiles` entry ending in `/` covers its whole folder. On Windows the comparison ignores case and
slash direction.

**The guard works per file.** It cannot tell one unit's items from another's inside a shared file, so
list each file under every unit that has items in it, whatever the units' statuses. The guard blocks edits to the file only while all of those units are closed. While any of them is
open (`final-check` counts as open), the edit is allowed, and the closed units' items in it are
protected by `diffcheck`'s closed-unit check (see `scripts/README.md`). That check compares every
closed unit's items with that unit's latest round snapshot, so run `diffcheck` before every commit.
- **Folder entries.** An open unit's `itemFiles` entry ending in `/` covers every file in that folder,
  so it also unblocks a file in it that a closed unit lists by name. `diffcheck`'s closed-unit check is
  the backstop for those items too.

**The guard fails closed.** When the guard is active and cannot check, it blocks (exit 2) with
`guard error: <message> (state folder <S>); fix or disable the guard`. This happens on:
- a bug in the guard;
- an unreadable `S/config.json`;
- a malformed config value, such as a `historyFolders` that is present but not an array of folder
  paths (a listed folder that does not exist is not an error for the guard);
- hook input that is not JSON.

While the error lasts, every guarded tool call in the session is blocked: Bash, PowerShell, Edit,
Write, MultiEdit and NotebookEdit. That includes the edit that would fix `config.json` and the command
that would remove `.ltz-state`. So the fix is made by hand, outside the session. Either repair the file
the message names, or disable the guard by removing its hook entry, `.ltz-state` or `LTZ_STATE`. An
inert guard (no state folder) never blocks.

**Not covered:**
- writes made through shell commands (`sed -i`, `>`, `Set-Content`);
- the Grep tool's own `head_limit`;
- `grep -m` and `rg --max-count`;
- a commit made by a script the command calls.

Readers and the writer must still follow the briefs.

## The session hint
The writer cannot learn its own session id, but the guard sees it in the hook input (`session_id`).
So when a Bash or PowerShell command runs `ltz lock <S> acquire|release|check` with `--session auto`
(or `--session=auto`, before or after the other arguments), the guard writes `{"session", "at"}` to
`<S>/.session-hint` before the command runs. `lock` then reads the hint, deletes it, and uses that id
(see "The writer's lock" in `scripts/README.md`).
- **It runs whether or not the guard is active.** Setup takes the lock before `config.json` exists, so
  this is the one thing an inert guard does.
- **What counts.** The command must call `ltz` or `ltz.mjs` with `lock` as its command. `<S>` is
  resolved against the hook's `cwd`, or a `cd` earlier in the same command, and must be an existing
  folder. Text that only mentions such a command, such as an `echo`, writes nothing.
- **It never blocks.** If the hint cannot be written, the command still runs, and `lock` fails with
  "no session hint". A hint older than 60 seconds is refused.

## Enabling it for one project
Add a PreToolUse entry to that project's `.claude/settings.json` (or `.claude/settings.local.json`).
Replace `<skill>` with the absolute path of the loop-to-zero skill folder:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell|Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          { "type": "command", "command": "node \"<skill>/scripts/hooks/guard.mjs\"" }
        ]
      }
    ]
  }
}
```

Then point it at the state folder in one of two ways:
- put the state folder's path in a file named `.ltz-state` in the project folder (one line:
  `<state folder>`);
- or set `"env": { "LTZ_STATE": "<state folder>" }` in the same project settings file.

**Never add it to the user-level `~/.claude/settings.json`.** A user-level hook runs in every session. With `LTZ_STATE` set there, every other session would be
affected:
- the lock rule would block their edits of the writer files;
- the commit rule would block their item commits while a round is reading;
- a guard error would block all their writes and commits.

Keep it per project, and remove `.ltz-state` (or the `LTZ_STATE` setting) when the loop ends.

## Testing it by hand
```sh
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"session_id":"s1","cwd":"."}' \
  | LTZ_STATE=<state folder> node <skill>/scripts/hooks/guard.mjs; echo "exit $?"
```

Exit 0 allows the call, and exit 2 blocks it. `node <skill>/scripts/test/run.mjs` covers every rule.
