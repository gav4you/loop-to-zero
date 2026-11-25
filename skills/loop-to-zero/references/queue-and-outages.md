# Running readers: chunking, the queue, limits and account changes

## Sizing
- **Chunks of about 70 items,** cut on window boundaries (a window is about 16 items).
  - That is small enough to finish in one sitting with the rules fresh, and large enough to see patterns
    across neighbouring items.
  - Below about 35 items, each agent's startup reading dominates its cost, and readers lose the links
    between neighbouring items.
- **Two independent readers per chunk,** with the union of their wrongs. Each round, measure the confirmed
  wrongs found by only one reader:
  - several per chunk means one reader misses things, so consider three;
  - near zero means two is enough.
- **Cost.** Measure before scaling, with the r0 test reader (`references/setup.md`). Its per-item figure is a
  floor; long jobs add the context re-reads described below. `ltz cost` reads agent transcripts.
  - **A long-running agent's cost is dominated by re-reading its own context.** Every turn re-reads the
    whole transcript, mostly as cache reads. Tokens grow faster than the item count, so shorter jobs are
    cheaper as well as fresher.
    - In one project, readers of about 290 items each used 70–115M tokens, almost all cache reads, with
      only about 200k of output.
    - A per-item estimate had put the whole round at about 15M.
  - Measure the real per-agent totals from the transcripts. Report cache reads, other input and output
    separately.
  - Re-estimate from the first real round. An estimate off by more than 25% of the measured value is a
    lesson.
- **Readers tire.** Measure, per reader, the extra lines read per item in early windows against late ones.
  In one project, a long reader's depth fell from about 56 to 4.5 after its first windows. A sharp fall
  means the chunks are too long.
- **Concurrency.** The owner sets it. Recommend starting low, at 2 (one chunk's pair), with the rest queued.
  - `ltz queue next` launches a chunk's readers together. A chunk with more queued readers than the cap
    can never launch, so it reports that chunk as a PROBLEM.
  - Launching many agents at once strands them all at the same usage limit: six readers launched together
    all stopped part-way, and about 25 helpers drained a limit in minutes.
  - Speed comes from the cap, not from the number of jobs. A lower cap means fewer limit stops and less
    work caught part-done.
  - Propose raising the cap to the owner only after a round runs with no limit stop.

## The queue (on disk: `S/<unit>/r<R>/queue.json`)
- **Job states:** queued, running (with its `agent` id), stopped-limit, stopped-credits, stopped-context (the
  reader stopped early with a next position), done, replaced (an abandoned slot, closed), and dropped-by-owner
  (a range the owner approved dropping, with its decision id, usually `P-n`).
- **Done means covered.** Before marking a job done, check that its result file covers its whole range.
  Otherwise mark it stopped-context and send "continue from position P".
- **Opaque slot names** (`queue init --opaque`) keep a reader from inferring another reader exists. Record each
  agent's transcript path at launch (`mark <slot> running --agent <id> --transcript <path>`), so `ltz cost --queue`
  can total the round. For a session the owner opens, ask the owner for its transcript file.
- **Pairs.** Queue a chunk's readers together, so each chunk's measurement is complete early. `ltz queue`
  manages the file.
- **Launching.** Fill up to the cap. When a job's completion notification arrives:
  1. check its result file;
  2. mark it done;
  3. launch the next job.
- **Lost notifications.** Keep a fallback wakeup of 20 to 30 minutes in case a notification is lost.
- **Resume position.** A job's resume position is read from its result file, which is appended window by
  window, so every continue is exact. After a hard stop mid-window, continue from the first missing position,
  which `ltz queue status` reports. A file that lacks no position but holds a duplicate or stray line has
  no resume position: `status` shows `resume none (not clean: ...)`, and `mark done`, `replace` and
  `dropped-by-owner` refuse it until those lines are removed.

## Limits and credits: wait, never fail
- **In the same session, never kill a stopped agent and never relaunch it.** Mark it stopped-limit (with its
  reset as a date and time; where the limit message gives only an hour, the next time the clock reaches it:
  `--reset 2026-11-10T03:00`) or stopped-credits.
- **Wait in the background:**
  - for a usage limit, until the reset time;
  - for credits, 30 minutes, then wait again.

  Never check credits more often than that; they cool down for hours. For a usage limit, schedule one wake at
  the reset time.
- **During a known limit wait, launch nothing new.** Queued jobs wait for the reset. While a recorded
  reset is still ahead, `ltz queue next` lists nothing to launch.
- **After the wait,** send each stopped agent "continue from position P" with SendMessage. Then resume
  launching queued jobs up to the cap.
- **If a continue fails** on a limit or credits, wait again. The loop never gives up and never drops work. A
  reader whose context is full: "When a fresh launch is allowed" (below). A refusal, or any other error: stop and
  tell the owner (`references/modes.md`).
- **Wakeups.** While agents run, a fallback wakeup every 20 to 30 minutes catches lost notifications. During a
  known reset wait, schedule one wake at the reset time instead. A wakeup is a background shell command that
  sleeps until then (`run_in_background`); its exit notifies you.
- **The writer's own session shares the limits.** If the writer is likely to be cut off, save in this order:
  1. the queue marks;
  2. `loop.md`'s Next step;
  3. `HANDOFF.md`;
  4. a checkpoint of `S/`.

  Then resume from `S/HANDOFF.md`, as below. A solo reading cut off mid-way resumes instead with its slot's
  brief plus "continue from position P", so it stays cold.

## When a fresh launch is allowed
There are five cases:
- **cites trimmed or never rendered, or a render that errored,** in a reader's file (`references/briefs.md`, "When a check
  fails"): that range is re-run with a fresh agent. A range that is only incomplete is continued, not
  re-run;
- **a reader that skims** (it misses a canary, admits shortcuts, or `record` flags its ok notes as templated): a fresh agent gives a
  supplementary read to its whole range or, after admitted shortcuts, to the ranges it names;
- **a rerun of an owner-dropped tail**, with the owner's OK (`references/round.md`, step 8);
- **a reader whose context is full**, so a continue fails: a fresh agent with its brief continues from its resume
  position (`queue replace`, below);
- **an account change or a new session** (below).

A fix checker has no queue slot: in either of the last two cases, relaunch it from the same
`briefs/fixcheck-<K>-<part>.md` plus "continue from position P", where P is the first input position its result
file lacks.

**Recording re-runs and supplementary reads:** `ltz queue <S> <unit> <R> rerun <slot> --from P --to Q` makes a
new slot for the range; `record` uses its lines in place of the parent's. Confirm yourself any wrong the parent
marked there that the re-run doesn't (`references/briefs.md`).

## Account change or a new session
- Agents from an old session cannot take SendMessage. For each unfinished job:
  1. launch a fresh agent with the same brief (`r<R>/briefs/<slot>.md`), FROM = its resume position from
     `ltz queue <S> <unit> <R> status`;
  2. record it at once with `ltz queue <S> <unit> <R> replace <slot> --agent <newId> --from P --transcript
     <path>`. The slot stays open,
     and the old agent id moves to its history. `mark <slot> replaced` is only for closing an abandoned slot.
- All state lives on disk, so `S/HANDOFF.md` only needs to name this skill and its folder, and give four steps
  (solo mode adds its own after them:
  `references/round.md`, step 1, and `references/modes.md`):
  1. read `S/loop.md`;
  2. take over the writer's lock (`ltz lock release` with the old session id, then `acquire`);
  3. run `ltz queue <S> <unit> <R> status` for each open round (while discovery runs, `<S>` for steps 2 and 3
     is `S/discovery`, the folder `.ltz-state` names);
  4. re-read both lessons files and `S/classes.md` (in solo mode, only once the round's reading is done).
- **Test the handoff cold before a new session relies on it.** Before the first resume from it, and again after its
  steps change, have a fresh session (an agent; in solo mode, a session after a context reset, or one the owner opens) given only `S/HANDOFF.md` say what it would do next, without
  acting; fix any gap it hits. A handoff written at setup and never resumed from has not been tested. A resuming session re-reads
  decisions and rulings from the decision log and `S/classes.md`, never from a summary in the handoff, `loop.md`
  or memory: a summary drops the scope and the exceptions.

## Tool gotchas
- **Never SendMessage a running Workflow subagent.** It starts a duplicate that fights the original.
  Coordinate through files, or let the run finish.
- **Resuming a partly failed Workflow can re-run finished agents.** Prefer jobs that are safe to relaunch
  (resumable result files), or a targeted completion run that launches only the missing jobs.
- **External reviewers that run in the background** must be polled until complete, and their result
  fetched, before a "0 findings" counts.
- **Orphaned processes.** On Windows, stopping a background shell task can leave its child processes
  running. List the survivors and kill only your own.
- **Escaping.** Long inline shell commands with quotes break easily. Write scripts and messages to files,
  then run them.
- **One scratch subfolder per agent.** Agents sharing a scratch folder overwrote each other's helper
  scripts.
- **Verdicts come only from result files.** A reader sometimes changes a verdict in its final reply without
  writing it to its file. Compare each reply with its file; if they differ, the file stands (a reader can't
  rewrite a line, and an item appears once). Re-judge the item yourself, and confirm a real wrong found only in
  a reply as `foundBy: "spot-check"`. Never copy a reply-only verdict into a reader's file.
- **Confirm what a stopped or killed run actually did,** after it has really stopped, before re-running it.
  A "nothing written" check made too early was wrong, and the re-run then failed on the leftover file.
- **Dry-run new tooling on a recorded round,** with writes to the repos disabled, before using it live.
  Include a simulated limit stop and resume.
