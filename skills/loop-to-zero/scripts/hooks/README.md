# guard.mjs: a PreToolUse hook for a loop-to-zero state folder

`guard.mjs` reads the hook JSON on stdin (`tool_name`, `tool_input`, `session_id`, `agent_id`, `cwd`). It needs Node 18 or
later and no packages.

## When it is active
It is **inert** (exit 0, nothing checked) unless one of these points it at a state folder that holds
`config.json`:
- the environment variable `LTZ_STATE`. A relative path resolves from `CLAUDE_PROJECT_DIR` when that is
  set, else from the hook's `cwd`;
- a file `.ltz-state` whose first line is the path. The guard looks for the file in the hook's `cwd`,
  then in each parent folder up to the root, then in `CLAUDE_PROJECT_DIR`. It uses the first one that
  names a state folder. A relative path in the file resolves from the folder that holds the file.

So a `cd` into a subfolder does not turn the guard off. A session whose `cwd` is outside the project
folder still finds the file through `CLAUDE_PROJECT_DIR`.

**One thing it does even when inert:** it writes the session hint for `lock ... --session auto` (see
"The session hint" below). That never blocks.

**It watches one state folder.** All its rules (queues, lock, closed units, item files) come from that
one folder. When a loop works in a different state folder, such as a discovery state folder before the
main loop, repoint the guard there by editing `.ltz-state` or `LTZ_STATE`, and point it back afterwards.

## What it blocks
When active, it blocks a tool call with exit 2 and gives the reason on stderr. Claude sees the reason.

| Tool call | Blocked when |
|---|---|
| `git commit` in Bash or PowerShell (also `git -C <dir> commit`, `git -c k=v commit` and `cd <dir> && git commit`; see "What counts as a commit" below) | Any `S/<unit>/r<R>/queue.json` has an **open** job, **and** the commit would include an item file (any unit's `itemFiles`). Readers judge the snapshot, so item edits are committed after the round's reading is done. A commit of only the decision log, `S/` files or other non-item files is allowed. |
| Edit, Write, MultiEdit or NotebookEdit of a file named in a unit's `itemFiles` | Every unit whose `itemFiles` names the file has a `status` starting with `closed` (for example `closed`, `closed-leads-pending`, `closed-owner-questions-open`, `closed-known-wrongs` or `closed-by-stopping-rule`). Log a lead instead. While any unit naming it is open, the edit is allowed (see "The guard works per file" below). Any other status counts as open, including `final-check`: a closed unit reopened with the owner's OK for the final targeted check, then set back to the closed status `loop.md` kept for it ("was <status>", with the exceptions in `references/round.md`, step 8), after a new baseline (`node <skill>/scripts/ltz.mjs snapshot <S> <unit> <F+1>`, where F is the final-check round) so diffcheck does not flag the final-check edits. |
| Edit, Write, MultiEdit or NotebookEdit of a **writer file** (below), or a `git commit` that would include one | `S/writer.lock` is held by a different `session_id`, or the call comes from an agent that is not the holder (see "The writer lock"). |
| A search piped into a truncating command in Bash or PowerShell | The search is `grep`, `egrep`, `fgrep`, `rg`, `findstr`, `Select-String` or `sls`; a later stage of the same pipeline is `head`, or `Select-Object`/`select` with `-First`. A search backing a bound must be unlimited. See "What counts as a search piped into a truncating command" below. |

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

**Who the holder is.** Claude Code runs an agent under the `session_id` of the conversation that launched
it, and gives its tool calls an `agent_id` of their own. So a call that carries an `agent_id` the lock
does not record is not the holder: a reader or fix checker the writer launched may not edit or commit
the writer files, though it shares the writer's session id. When the writer itself runs as an agent,
`lock ... acquire --session auto` records its agent id in `writer.lock` (`{"session", "agent", "since"}`),
and then only that agent is the holder: not the main conversation, and not another agent.

Every other write stays allowed, so readers and a fix checker in a fresh session can do their work.
This covers their outputs in the round folder (`agent-*`, `render-*`, `w-*`, and the fix-checker
results `fixcheck-<K>-<part>.jsonl`) and any scratch folder. A commit by another session is allowed unless it would include a
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

**What counts as a commit.** The command text is searched for `git`, its global options and the word
`commit`. These spellings count too:
- a quoted git, or one with a path: `"C:/Program Files/Git/cmd/git.exe" commit`, `/usr/bin/git commit`,
  and in PowerShell `& "C:\Program Files\Git\cmd\git.exe" commit`;
- a global option whose value is a separate word: `--git-dir <x>`, `--work-tree <x>`, `--namespace <x>`
  and `--exec-path <x>`;
- a command continued over a line end, with a backslash in Bash or a backtick in PowerShell.

`git commit-tree` and `git commit-graph` are other commands. The guard does not check them.

**What a commit includes.** The hook runs before the command, so it reads the whole command line.
While jobs are open, it works in the commit's folder: from `-C`, or else the `cd` before the commit,
or else the hook's `cwd`. On Windows a Git Bash path there (`/c/Users/x`) is read as the drive path
(`C:/Users/x`). In that folder it collects:
- the staged files (`git diff --cached --name-only --no-renames`, so a renamed file counts under its
  old name and its new name);
- with `-a`/`--all`, the working-tree changes (`git diff --name-only --no-renames`);
- with pathspec arguments (`git commit -m x docs/`), the working-tree changes under those paths. With a
  glob, or a pathspec that starts with `:` (`:/docs`, `:(top)docs`), every working-tree change counts.

Staging done earlier in the same command counts too:
- the paths of a `git add`/`stage`/`rm`/`mv`. A folder counts if it holds an item file, and its
  working-tree changes and untracked files are listed as well;
- for `git add -A`, `-u`, `-p`, `.`, `:/` or a glob, all working-tree changes plus the untracked files
  of the whole repo.

Read-only git commands (status, log, diff, show and similar) before the commit are fine.

**If the staged set cannot be determined, the commit is blocked,** with the reason. This covers:
- no unit listing `itemFiles` in `config.json`;
- a folder that is not a git repo, or a git error;
- `--git-dir` or `--work-tree` in either form (`--git-dir=<x>`, `--git-dir <x>`), `--pathspec-from-file`
  or `cd -`;
- a commit the guard cannot parse. A command with the words `git commit` only inside a quoted argument
  or a `#` comment is one: `sh -c "git commit -m x"` is a real commit, so `grep -rn "git commit" docs`
  is blocked too while a reader job is open (or another session holds the lock);
- any other git command before the commit in the same command (stash, reset, restore, checkout,
  apply, merge and so on), since it may change what is staged;
- a non-git command before a commit that relies on the working tree (`-a`, a pathspec, `git add
  -A`/`.`, or `git add <folder>`), since that command may change the working tree first. A command whose
  name only starts with `git` (`gitleaks`, `git-cz`, `gitfix.sh`) is a non-git command. So is one that
  names git only in a `#` comment.

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

**Paths are compared as real paths.** This holds for item files, writer files, the state folder and the
files a commit includes. A file reached through a junction or a symlink, or by a Windows short name
(`DOCUME~1`), is the same file as by its own path. A path that does not exist yet takes the real path
of its nearest existing parent folder.

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

**What counts as a search piped into a truncating command.** The guard reads each command of the
command line on its own. Commands are separated by `;`, `&&`, `||`, `&` and line ends. Quoted text is
ignored. Inside one command it looks at the command word of each pipeline stage (stages are separated
by `|` or `|&`):
- **The search.** The command word is one of the search tools. It may have a path (`/usr/bin/grep`).
  It may follow `VAR=value` words, `command`, `sudo`, `env`, `time`, `nohup`, `nice`, `exec`, a shell
  keyword (`do`, `then`, `else`, `elif`, `if`, `while`, `until`, `!`), or PowerShell's `%`, `foreach`,
  `ForEach-Object` or `$x =`. `git grep` counts, and so does a search tool run by `xargs`. A command
  inside `$( )`, backticks, parentheses or braces is read like any other.
- **The truncating command.** A later stage of the same pipeline has the command word `head` (a path
  and the same leading words are allowed), or `Select-Object`/`select` with `-First` (a module-qualified
  name such as `Microsoft.PowerShell.Utility\Select-Object` too).

So `grep -c x f; ls | head` is allowed: the search and the `head` are in different commands. A search
word inside a file name or an argument (`ls scripts/grep | head`, `npm run grep | head`) is not a
search.

**Not covered:**
- writes made through shell commands (`sed -i`, `>`, `Set-Content`);
- the Grep tool's own `head_limit`;
- `grep -m` and `rg --max-count`;
- `head` reached another way: `xargs head`, `busybox head`, a quoted `"head"` or `\head`;
- a group or subshell piped into `head` when the search is not its last command
  (`(grep x f; echo done) | head`);
- a search and its `head` inside a quoted command handed to another shell (`sh -c "grep x f | head"`,
  `powershell -Command "..."`), since quoted text is ignored;
- a commit made by a script the command calls;
- a commit through a git alias (`git ci`), through a variable that holds `git` (`$g commit`), or with
  a quoted subcommand (`git "commit"`);
- `git rm` or `git mv` of a folder: only the folder's working-tree changes and untracked files are
  listed, not its unchanged tracked files (an item file in it still counts);
- on Windows, a Git Bash path that is not under a drive letter (`/tmp/...`): the guard cannot map it to
  a Windows path. Give the state folder as a Windows path (`C:/...`) in `lock <S>`, `cd` and `git -C`;
- a file named in a way the real path does not resolve: a hard link, a UNC path to a local drive
  (`\\localhost\C$\...`), a name with a trailing dot or space, or a Git Bash path (`/c/...`) as the
  path of an Edit or Write.

Readers and the writer must still follow the briefs.

## The session hint
The writer cannot learn its own session id, but the guard sees it in the hook input (`session_id`).
So when a Bash or PowerShell command runs `ltz lock <S> acquire|release|check` with `--session auto`
(or `--session=auto`, before or after the other arguments), the guard writes `{"session", "at"}` to
`<S>/.session-hint` before the command runs (with `"agent"`, the caller's `agent_id`, when an agent runs the
command). `lock` then reads the hint, deletes it, and uses that id
(see "The writer's lock" in `scripts/README.md`).
- **It runs whether or not the guard is active.** Setup takes the lock before `config.json` exists, so
  this is the one thing an inert guard does.
- **What counts.** The command must call `ltz` or `ltz.mjs` with `lock` as its command. The `ltz` or
  `ltz.mjs` word must be the command's own first word, or follow `node` or `node.exe` (PowerShell's `&`
  may come first, and each may be a quoted path). `<S>` is resolved against the hook's `cwd`, or a `cd`
  earlier in the same command, and must be an existing folder. On Windows a Git Bash path (`/c/Users/x`)
  is read as the drive path (`C:/Users/x`). Text that only mentions such a command writes nothing: an
  `echo`, the arguments of another command, or a `#` comment.
- **It never blocks.** If the hint cannot be written, the command still runs, and `lock` fails with
  "no session hint". A hint older than 60 seconds is refused.

## Enabling it for one project
Add a PreToolUse entry to that project's `.claude/settings.json` (or `.claude/settings.local.json`).
Replace `<skill>` with the absolute path of the loop-to-zero skill folder (a junction or a symlink to
it works too):

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
  `<state folder>`; see "When it is active" for where the guard looks for the file);
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
