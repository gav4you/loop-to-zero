# Reader and fix-checker briefs

Fill the `{…}` slots:

| Slot | What it holds |
|---|---|
| `{PROJECT}` | The project's name |
| `{UNIT_WORD}` / `{ITEM_WORD}` | The repo's own words for a unit and an item |
| `{S}` | The state folder's absolute path |
| `{SKILL}` | This skill's absolute path |
| `{UNIT}` | The unit id |
| `{R}` | The round number (digits only) |
| `{EVIDENCE}` | What the items are judged against |
| `{PIN}` | Its pin |
| `{ROOTS}` | Each repo or folder, read-only, and how to search it at the pin |
| `{RULES}` | The project's verification rules |
| `{PRECEDENTS}` | `r<R>/precedents.md`, the round's copy of `S/precedents.md` (`references/round.md`, step 1), or "none" |
| `{FROM}` / `{TO}` | The reader's positions in the round's list, counted from 1 (from `chunks.json`) |
| `{SLOT}` | The reader's slot name in `queue.json`: opaque (`queue init --opaque`), never a chunk-and-letter name, which tells a reader another exists |
| `{RENDER_CMD}` | `node {SKILL}/scripts/ltz.mjs render {S} {UNIT} {R}` |
| `{SHOW_CMD}` | `node {SKILL}/scripts/ltz.mjs show {S} {UNIT} {R}` |
| `{SCRATCH}` | The agent's own scratch subfolder, `S/<unit>/r<R>/scratch/<slot>/` (one per agent, never shared) |
| `{ENV}` | The environment rules, as exact commands |
| `{BAR}` | `open` or `frozen` |
| `{BOUNDARY}` | The evidence boundary: which kinds of evidence count (also quoted in `classes.md`) |
| `{WINDOW}` | The configured window size (`config.json`, usually 16) |
| `{PROBES}` | Whether probes may run in a scratch copy (the owner's call at setup) |
| `{SOLO_RULING}` | In solo mode, and for a fix check run in a fresh session or as a self-check, the owner-ruling clause shown in the reader brief (both briefs use it); otherwise left empty |
| `{C}` / `{n}` | The fix commit, and how many changed items this checker's input holds (fix checker) |
| `{K}` | The fix-check iteration (fix checker) |
| `{PART}` | The fix-check part: a split of the fix set into about 70 changed items each, named `p1`, `p2`, ... |

The two readers of a chunk get the same brief apart from their slot. Keep each filled brief, as sent, in
`r<R>/briefs/<slot>.md`: a replacement agent gets that text unchanged (its {FROM} stays the slot's first
position), followed by "continue from position P", where P is the slot's resume position. Never tell a reader that another reader
exists. Launch readers as background agents (the Agent tool), not as Workflow subagents: only Agent-tool
agents can be continued with SendMessage after a limit.

## Reader brief

```text
You are a reader for {PROJECT}'s {UNIT_WORD} {UNIT}, round {R}. Read every {ITEM_WORD} in your range cold,
and judge each one ok or wrong against {EVIDENCE}, pinned at {PIN}. You change nothing except the files
named below. Do not use any skill named loop-to-zero; follow this brief only.

## Paths
{ROOTS: each repo or folder, read-only, and how to search it at the pin, e.g. git grep <pattern> <pin>. Every
line you read to judge goes through {SHOW_CMD}, so it is logged; a search only finds where to look.}

## Environment (concrete commands)
{ENV: state each environment rule as the exact command to use, including the working directory at the start
of every shell command. Write the rules so they match what readers
actually have to do: for example, allow helper scripts in {SCRATCH} rather than forbidding them. A rule left
abstract was broken again and again.}

## Your range
Your range is positions {FROM} to {TO} (counted from 1). Stop after {TO}.
Work window by window ({WINDOW} items each). Render each window with:
  {RENDER_CMD} {SLOT} <from> <count>
It writes the window file (each item in full, every cited line at the pin) and logs what it showed.
Read that file in FULL. For anything more you need, use:
  {SHOW_CMD} {SLOT} <path:lines>
so that every line you read is logged.

## Read first
1. {RULES: the project's verification rules, quoted word for word with their source. Never paraphrase a
   rule in a brief or a hint: a paraphrase becomes a second, hidden rule.}
2. {S}/{UNIT}/r{R}/classes.md: the bar, starting with its "accepted by ruling" section. The bar is {BAR}.
   Report every wrong you find; one that fits no class gets the class "new" (open bar) or "outside-bar"
   (frozen bar).
3. The ruling texts quoted in classes.md (never the decision log itself).
4. {PRECEDENTS: the round's copy of S/precedents.md, worked examples the owner approved, if one exists}

## What you may open (an allow-list: nothing else)
The files in "Read first", your render and show commands and the window files they write, your own result
file, the evidence at the pin, and {SCRATCH}.
Open nothing that is not on this allow-list. That rules out earlier verdicts, reports, lessons, the git
history or diffs of the items, and memory and handoff files.

## How to judge
Try to prove each item wrong. Cover every item; never sample. The evidence that counts is: {BOUNDARY}. Apply the three lenses quoted in classes.md:
claim vs source, whole context, and adversarial input. Check every field the rules define. Read the
universal words that classes.md lists literally. Back every "no X", "only X" or
"every X" with a search at the pin with NO output limit. A search that finds nothing counts only once the same
command, on the same paths, finds something you know is there; name that control in the note.
An item whose wording an "accepted by ruling" entry approves is not wrong for the ruled point;
judge its other claims and citations as usual. If the evidence differs from that wording,
start the note with "ruled: <ruling id>" and name the differing file:line.
An item that states a requirement (`type: requirement`, or "must"/"shall" only when the item has no `type`) that
the evidence does not meet is marked wrong with a note starting "unmet requirement"; the writer records it as a
defect (or, where the item misquotes its own source, fixes it as a wrong). Where classes.md maps a config to the policy an item cites, also read that config; a requirement item that cites only its policy, with no config mapped to that policy, is not judged against a config. A mismatch between
a policy and its config (mapped, or both cited by the item) is marked wrong with a note starting "policy vs
config", which the writer records as a defect (or, for a descriptive item that misstates the config or cites only
the policy for the config's value, fixes as a wrong and logs the defect beside it).
{PROBES: either "You may run probes of the code in a scratch copy under {SCRATCH} (never in the project's or the
evidence's repos)." or
"Do not run the project's code, config loaders or parsers. Throwaway helper scripts in {SCRATCH} (to evaluate an
expression or count matches, say) are allowed."}
{SOLO_RULING: in solo mode, and in a fix check run in a fresh session or as a self-check: "If the owner gives you a ruling while you read, write the owner's words,
verbatim and dated, to {SCRATCH}rulings.md, keep judging under classes.md as it stands, and add the ruling
to the note of each item it touches. If evidence that a ruling's approved wording is false reaches you while you
read (the owner or an outside finding brings it), finish the current window, send the owner one line (the ruling, the item, what
refutes its wording), note it in {SCRATCH}rulings.md, and go back to reading."}

## Write: one result file, as you go
{S}/{UNIT}/r{R}/agent-{SLOT}.jsonl. After each window, APPEND one JSON line per item, in list order:
Before citing a refuter you found by searching, show it with {SHOW_CMD}: a cite you never rendered is refused.
{"unit":"{UNIT}","id":"…","verdict":"ok"|"wrong","class":["<class>", …],"note":"<why; a wrong names the
refuting file:line at the pin (a vague relation: the link line you found, or the cited lines showing none; a cited file missing at the pin: that cite)>","cites":["path:line", …]}
`cites` lists every line your verdict rests on: the item's cites you read, and any line you showed.
List every class that applies, the first as classes.md's "When two classes fit" says.
An item its own text refutes (its figures disagree: parts that don't add up to its total, a share that doesn't
follow from its numbers) is wrong with a note starting "self-contradiction:" that quotes the clashing figures;
it needs no evidence file:line. Check its figures at the evidence too, and name any that differ.
Never rewrite earlier lines. Throwaway helper scripts go only in {SCRATCH}.
No git command that changes anything. No edits to items.
If your context runs low, finish the window, append it, and stop with the next position.
If you are sent "continue from position P", re-read these rules, render from P and append only the positions
your result file lacks. If your result file already holds lines when you start and you are sent no position, P
is the first position it lacks.

## Reply
Your result file's path, the positions covered, the ok and wrong counts, one line per wrong (id, class,
refuting file:line), and the paths of any helper scripts.
```

## Fix-checker brief (after every fix commit, including follow-ups)

Split large fix sets into parts of about 70 changed items, one checker per part, named `p1`, `p2`, ... (the `{PART}`
value; not a round chunk). Name the files by check iteration `{K}` (1 for the fix commit, 2 for its first
follow-up, and so on) and by part. A fix checker is not queued, but it counts toward the concurrency cap, and the
limit rules in `references/queue-and-outages.md` cover it (wait, then continue it). Keep each filled brief, as
sent, in `r<R>/briefs/fixcheck-<K>-<part>.md`. Record each fix checker's transcript path at launch in the round's
`retro.md`, and add `ltz cost <those transcripts>` to the round's `ltz cost --queue` total.

```text
You are the FIX CHECKER for {PROJECT}. Commit {C} just changed items, and {n} of them are in your input. Read those cold and judge each
ok or wrong against {EVIDENCE} at {PIN}. Above all, check that no clause the fix introduced overreaches.
You change nothing except your one result file and your {SCRATCH} folder. Do not use any skill named
loop-to-zero; follow this brief only.

## Paths
{ROOTS}

## Environment (concrete commands)
{ENV}

## Input
{S}/{UNIT}/r{R}/fixcheck-{K}-{PART}-input.jsonl. Each changed item's line holds the item in full plus
`changed`: the field or fields the fix edited (one object or a list), each with its new text and the text it
replaced.
Render with {RENDER_CMD} fixcheck-{K}-{PART} <from> <count> --list <input file> (positions counted from 1),
and use {SHOW_CMD} fixcheck-{K}-{PART} <path:lines> for extra reading, so that every line you read is logged.

## Read first
1. {RULES: quoted word for word with their source}
2. {S}/classes.md (the current bar, not the round's copy, so that rulings made mid-round apply; the bar is
   {BAR}), with the ruling texts it quotes. Never open the decision log.
3. {PRECEDENTS}

## What you may open (an allow-list: nothing else)
The files in "Read first", your input file, your render and show commands and the window files they write,
your own result file, the evidence at the pin, and {SCRATCH}. That rules out earlier verdicts, the reasons for the
fix, lessons, the git history or git diffs of the items, and memory and handoff files.

Apply the three lenses and the universal words, as quoted in classes.md. {PROBES} {SOLO_RULING}
An item whose wording an "accepted by ruling" entry approves is not wrong for the ruled point;
judge its other claims and citations as usual. If the evidence differs from that wording,
start the note with "ruled: <ruling id>" and name the differing file:line.
An item that states a requirement (`type: requirement`, or "must"/"shall" only when the item has no `type`) that
the evidence does not meet is marked wrong with a note starting "unmet requirement"; the writer records it as a
defect (or, where the item misquotes its own source, fixes it as a wrong). Where classes.md maps a config to the policy an item cites, also read that config; a requirement item that cites only its policy, with no config mapped to that policy, is not judged against a config. A mismatch between
a policy and its config (mapped, or both cited by the item) is marked wrong with a note starting "policy vs
config", which the writer records as a defect (or, for a descriptive item that misstates the config or cites only
the policy for the config's value, fixes as a wrong and logs the defect beside it).

Your input file also holds every item the new text names ("see X", "as X states"), marked as a
named item for context, with no `changed` field. Check that each really holds the claim the new text
gives it; if one doesn't, mark the changed item wrong, not the named one, which is judged on its own text. New
cross-references are a common fix error.

For each new clause:
- Does it overreach? Read literally the universal words, and any list the clause closes (by "only", "all", "both" or a count, or by
  giving it as the whole set). Back every bound with
  a search with NO output limit, and name that search in the note. A search that finds nothing counts only once
  the same command, on the same paths, finds something you know is there; name that control too.
- Is it true as stated, at every file:line it names?
- Did the edit break the rest of the item: a lost qualifier, or a mismatch with its other fields?

For each replaced text: was it really wrong at {PIN}? If the old text held, mark the item wrong with a note
starting "old text held" and the file:line that backs it: the fix removed accurate content.

Report every wrong you find; one that fits no class gets the class 'new' (open bar) or 'outside-bar' (frozen
bar).

Write {S}/{UNIT}/r{R}/fixcheck-{K}-{PART}.jsonl, one line per item, in the reader schema, appending each item's
line as you finish it. If your context runs low, stop after an item and reply with the next input position. If
you are sent "continue from position P", carry on from P.
Reply with the path, the counts, and one line per wrong.
```

## Verifying the readers' work (the writer)
1. **Coverage.** `ltz record` runs the file checks below: once the reading is done, run it with `confirmed.json`
   as `{}` (or as drafted so far), and again at step 3. On that first run, expect one PROBLEM for each reader wrong
   not yet in a list; judge coverage from the coverage lines only.
   - Every item appears once in each reader's file (a re-run's file counts for the re-run's range), except in a
     tail the owner dropped. Verdicts come only from the result files; reconcile each final reply with its file
     (`references/queue-and-outages.md`).
   - Every cite a reader lists appears in that reader's render log.
   - Every wrong names a refuting file:line, except one whose note starts "self-contradiction:" (it quotes the
     clashing figures instead), a vague-relation one (it names the link line it found, or the item's own cited
     lines showing none: `references/reading-classes.md`, U13) and one whose cited file is missing at the pin (it
     names that cite). `record` checks only that a wrong's note names at least one line in that reader's render
     log, or a path one of its attempts found missing at the pin (no other failed attempt counts); that the
     refuter it names is among them is yours to check.

   **When a check fails** (one rule; never fill an item by hand):
   - **A range left incomplete** (a limit, or the reader stopped early): continue that reader from its resume
     position. A tail the owner dropped is not continued (`references/round.md`, step 8).
   - **A reader's cites never rendered** (listed in its `cites`, or named as a wrong's refuter in its note, but not in its render log), or a render command that errored:
     re-run the windows holding those items with a fresh reader of the round's kind (`references/queue-and-outages.md`,
     "When a fresh launch is allowed"). A cite whose file `render` found missing at the pin is not this case: it is
     logged as an attempt and may be cited. For one unrendered
     refuter, the range is just that window.
   - **Coverage is computed from the files,** never taken from a reader's word. A sampled pass once left 384
     items uncovered.
   - **A reader that trims its cites to pass the check** (a result line whose note relies on a line its `cites`
     omit, or with no `cites` for an item that has some) has its whole range (its slot's FROM to TO, short of any tail the owner dropped) re-read.
   - **A reader whose ok notes repeat one text, or are blank,** on 5 or more items (`ltz record` warns, refs
     and numbers aside) wrote a default, not a reading: give that reader's whole range (its slot's FROM to TO, short of any tail the owner dropped) a supplementary read, as below.
   - **A reader that admits shortcuts or unchecked areas** ("read only the first lines", "area 2 not
     checked") gets a supplementary read of the ranges it names before acceptance, or of its whole range
     (its slot's FROM to TO, short of any tail the owner dropped) when it names no positions.
   - **After any re-run or supplementary read,** `record` takes the re-run's lines in place of the parent's for
     that range, so run the confirm checks on any wrong the parent marked there that the re-run doesn't mark.
     Record the real ones as `foundBy: "spot-check"`, and note the others in `retro.md` (`references/fixing.md`, "The confirm checks") as that
     reader's false alarms, not in `rejected`: `record` no longer holds them. None is lost.
   - **A stricter standard one reader applies** enters the bar only as `references/learning.md` says (from
     "Changing the bar's wording" to the class found mid-pass). Meanwhile its wrongs go through the confirm
     checks (`references/fixing.md`) like any other.
2. **Confirm every wrong in the union** at the evidence, with the confirm checks in `references/fixing.md`.
   Round step 3 also confirms or judges what else it lists, such as the cite groups `ltz crosscheck` flags, the
   unit's deferred cross-unit lines and its mapped outside findings (`references/round.md`, step 3).
   - A repeat the evidence plainly refutes is `wrong`, with `repeatReason` (`plain-fix-failure` when the refuted
     claim still stands, `new-text`, `earlier-miss`, or `evidence-moved` when only a moved pin refutes it), a `rulingsChecked` list (`references/fixing.md`)
     and a `repeatNote`. Only the Verdicts exceptions go in `pending` (a rule's meaning, a silent boundary, or
     ruled wording; `references/fixing.md`).
   - **Ruled wording.** Every ok (a reader's or a fix checker's) whose note starts "ruled:" and names a differing file:line is checked at the
     evidence. If the evidence refutes the approved wording, record it in `pending` (`ruled-wording`, with the
     question "amend <ruling>?"; a fix checker's ok on another unit's item only gets that question, in
     `S/owner-questions.md`, since `pending` holds this round's items), unless the ruling's entry records that the owner kept it after that question:
     then list it in `confirmed.json`'s `ruledKept` (`{"id", "ruling"}`), unless the id is also in the wrongs,
     `pending`, `defects`, `withdrawn`, `outsideBar` or `restated` (a `rejected` entry for the other reader's wrong is no bar; otherwise leave it out; its warning is expected).
     When the ruling was not kept and another list would hold the id (the wrongs, `restated`, `withdrawn`,
     `outsideBar`, `defects`, or `pending` for another reason), it goes in `pending` as `ruled-wording` all the
     same, its other point in the question and any fix that point needs held (`references/fixing.md`, check 2).
     Once the owner answers, the id goes back to its other list, or to the wrongs if the answer makes the ruled
     point wrong (`references/round.md`, "Blocked only by what a re-read can't clear").
     Readers mark ruled wording ok, so this is how it surfaces. `ltz record` lists them as `ruledOks` and warns about
     any neither pending as `ruled-wording` nor in `ruledKept` under that ruling. If the owner then amends the ruling, the item is a wrong of
     the round in which the amendment lands (`foundBy: "spot-check"`; `references/learning.md`, "Counting"), or a lead if its unit is
     closed (SKILL.md, "Cross-unit effects"). A ruled ok whose approved wording the evidence doesn't refute
     stays ok: its `record` warning stays too, and blocks nothing.
   - `confirmed.json` may be drafted while readers are still reading; run `record` only after the reading is done.
     A wrong confirmed before every reader of its chunk is done stays provisional: re-run the history check
     against the other reader's line when it arrives.
   - List every reader wrong you don't confirm in `rejected`, with its reason and the file:line that answers it
     (`references/fixing.md`, "The confirm checks").
   - Write `confirmed.json` and run `ltz record`: once its checks pass it scores the canaries. Give a reader that
     missed one its supplementary read.
   - Then spot-check 10 ok items per reader by the rule in `references/round.md`, step 3 (5 random, drawn with
     `ltz spotcheck`; 5 weighted), add their finds (`foundBy: "spot-check"`) and run `record` again.
3. **Write `report.json`** (`ltz record`): one check per item, with its verdict, note and `cites_read`.
   - `cites_read` comes only from the render logs, never copied from the item's own cites.
   - Never add an entry to a reader's render log yourself: it would hide an item the reader skipped.
   - Check both ways: every confirmed wrong resolves to items, and every item verdict to a report line.
4. **Measure,** into `measure.json` (`ltz record`). Re-run it after round step 4's sweep has added its finds
   to `confirmed.json`, and after every fix check (round step 5). It records:
   - confirmed wrongs found by every reader of the chunk, by each reader alone, and by none (`foundBy`: your
     own check (`spot-check`), a sweep, an audit, the fix checker in old text, or the extract);
   - false alarms per reader;
   - canary scores per reader (caught and false alarms), kept apart from everything else;
   - the remaining-wrongs estimate per chunk, with its caveat (`references/round.md`);
   - **from `ltz cost` (not `measure.json`):** tokens, with cache reads, other input and output separately;
   - **from the queue (not `measure.json`):** minutes and limit stops;
   - **from the render logs (not `measure.json`):** each reader's depth, as extra lines read per item, in early
     windows against late ones (`scripts/README.md`, "File formats", says which log lines count).
5. **Log near-misses.** Add to `{S}/boundaries.md` each item you confirmed ok only after real doubt, with one
   line on why.

   In one project's first measured round, of 51 confirmed wrongs, both readers found 8, one reader alone
   found 29, and neither found 14 (the writer's sibling sweep did). Readers overlap little, so the union and
   the writer's sweep both matter.
