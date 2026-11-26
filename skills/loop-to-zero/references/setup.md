# Setup in detail

Until the owner has answered the setup questions, nothing is edited and no counted reader runs. Only the r0
test reader may run. The steps match SKILL.md's Setup.

## Order
1. **Read the lessons:** this skill's `lessons.md`, and `S/lessons.md` if it exists.
2. **Create the state folder** (`references/state-template.md`), then take the writer's lock (`ltz lock <S> acquire`).
   If the guard hook is already installed in the project's settings, pass `--session auto`. Otherwise pass
   `--session <id>` with an id of your own, such as the date and a letter; `S/writer.lock` keeps it, so a later
   session can release it.
   Create the decision log at `S/decisions.md` provisionally; if question 9 picks the project's own log, move it.
   Also write a provisional `S/loop.md` (with its Next step) and `S/HANDOFF.md`, and update both before r0 and
   before any setup-time context reset or likely cut-off; step 8 completes them.
3. **Explore read-only.**
   - Find the items' format, numbering and citation form: a line, section, file or config key.
   - Find where the evidence lives (files at a commit, or live systems) and the HEAD commit.
   - Count the items per unit with a script, not by eye.
4. **Set up the tools.**
   - Write `S/config.json`: the evidence (git repo and pin, or a folder), the window size, the item fields,
     and each unit's item files (every file that holds its items, shared files included) and status. For live
     or non-text evidence, leave `evidence` unset until step 6's export or conversion.
   - The skill's `scripts/ltz.mjs` provides snapshot, render (with `show`, and `--list <file>` for a fix
     checker's input), show, sweep, record, queue, diffcheck, searches, reach, flips, canary, spotcheck, crosscheck, cost, replay, rulings and lock (`scripts/README.md`).
   - **The one script the project must write is extract:** items into `S/items.jsonl` (id, unit, the item
     fields, and cites in the forms step 8 lists), because every project's item format differs. Put it in `S/checks/`.

   **Test first:** run `node <skill>/scripts/test/run.mjs`, and give the extract script its own negative tests. Then
   **run extract.** Flag items with no cite, or with a cite the script cannot parse.
   - **Reconcile the extract against its source, both ways,** before trusting it: every entry the source numbers
     or lists (a requirement, a table row, an entry in its table of contents) maps to an item, and every item
     maps back to the source. List the orphans on either side and settle each. Matching totals prove nothing: a
     missed requirement and a split item cancel out. Write the flagged ids, and each orphan with how it was
     settled, at the top of `S/research.md` (step 5 continues that file).
   - **Ids stay stable for the whole loop.** A fix that splits an item keeps the old id with a suffix
     (`3.2.1a`), and never renumbers.
   - **Granularity** (is "3.2.1(a)" its own item?) is a question for the owner when it is unclear.
   - **Items that are not text** (a DOCX or PDF manual): the extract script reads the source straight into
     `S/items.jsonl`, which is the text mirror. The writer applies fixes in the source and re-extracts.
   - **Auto-numbered sources** renumber after a split or a deletion. Key ids on a stable anchor (a hidden id or
     a heading slug) and keep the displayed number as a field. `itemFiles` names the source file. Edits made by a script, such as a DOCX writer,
     aren't guarded by the hook; `diffcheck` still flags changes to closed units.
   - **Items flagged at extract** (no cite, or one that can't be parsed) enter the first pass that reads them
     (discovery's first pass, or round 1 if there is no discovery) as candidate wrongs of the project's
     cite-resolution class, which the writer confirms (`foundBy: "extract"`). If the bar has no such class, follow
     "A class found mid-pass" on an open bar (`references/reading-classes.md`), or record them `outsideBar` on a
     frozen one.
   - **Run extract after any granularity answer,** so ids are stable from the start; otherwise re-key once, with
     every id already written (such as `research.md`, the patterns' `knownInstances`, r0, `S/inputs/audit-map.json`
     and an adopted loop's rebuilt rounds).
5. **Research the repo, and predefine the names and the classes** (below). Work at the proposed pin, which
   is HEAD unless the project already pins one. Live or non-text evidence is researched after its export or
   conversion (step 6).
6. **Measure.** One test reader reads the first window of the first unit under the draft bar, in
   `S/<unit>/r0/`. Its verdicts do not count; round 1 reads that window again. Record:
   - startup tokens (reading the brief, rules and classes) separately from tokens per item;
   - minutes per window.

   Run r0 with `ltz snapshot <S> <unit> 0`, using the recommended values for any question not yet answered,
   labelled provisional in the report, except probes (r0 runs read only), hooks (you install none before the
   owner answers), masking (r0 keeps `render`'s default, and question 6 reports what it masked) and the reader
   mode: its reader is an
   agent only if the owner has
   already allowed agents (otherwise ask that first). With agents ruled out, its reader is a fresh session the owner
   opens with the reader brief filled for r0 (if the owner rules that out too, it is read after the owner clears the conversation, as a solo
   reading session is: `references/modes.md`; it needs a session that has not seen the research), and that session's transcript is the one measured. Queue its one reader with `ltz queue <S> <unit> 0 init --opaque
   --per-chunk 1`. r0 writes `confirmed.json` as `{}`, so a `record` run on r0 reports one PROBLEM per reader wrong; run it only
   for the coverage lines, and take r0's cost from `ltz cost`. A real wrong r0 surfaces is noted in r0's `retro.md`,
   confirmed by the writer in the first pass that reads that window (discovery's first pass, or round 1 if there
   is no discovery) if none of that pass's readers finds it (`foundBy: "spot-check"`), and never hinted to its
   readers. Afterwards, mark its job `done` in the queue: an open job in any
   round makes the guard block item commits. If the evidence is live or not text, split the setup sitting in two:
   settle question 5's pin and export scope (and who takes the export and strips its secrets, or the text
   conversion) first. Leave the boundary itself for the rest of the questions (asked after research source 2). Then take the export or make the conversion (into `S/evidence/<date>/`; point config `evidence` at it then, as
   step 8 describes), research its parts, run r0, then ask the rest. r0 carries no canaries.

   **Quoting r0's cost to the owner:**
   - Split startup from per-item tokens with `ltz cost --timeline` on r0's transcript, and read minutes per
     window.
   - **Call the per-item figure a floor** wherever you quote it: long jobs add the agent's re-reads of its own
     context (`references/queue-and-outages.md`, "Cost").
   - r0 measures one reader, so the cost of two readers per chunk is an extrapolation; say so.
7. **Ask the setup questions** (below), with the research and the measured costs. The format is in
   `references/owner-asks.md`.
8. **Finish setup,** once the owner has said when to apply the answers ("Gathering the owner questions").
   - **Pin the evidence as approved:**
     - files: a tag or commit;
     - live systems: one dated, read-only export that every reader reads, with secrets stripped before
       anything is rendered;
     - non-text evidence (PDF, docx): a pinned text conversion with one canonical numbering, which the owner
       approves as the evidence;
     - an export or text conversion goes in `S/evidence/<date>/`, named in config `evidence` (type `dir`) and
       in the readers' paths. Pin it by content: take `ltz snapshot <S> <first unit> <its next round>` now (1 for a fresh loop; that round takes it again) to print the folder's
       hash, and put it in that source's `sha256` before discovery's or round 1's snapshot; every tool then refuses the folder once any file in it changes, is added or is
       removed;
     - secrets: `render` masks secret-looking values by default. Keep files that are mostly secrets out of the
       boundary;
     - cite forms: `path:12`, `path:20-25`, `path:Key` (the key's line and the 10 lines after it; cite a longer section as a line range) or `path#a.b.c`
       (a nested JSON or YAML key, with its block). Page cites need a text conversion with page markers;

     - if the pin differs from the one used for research, re-run the research counts.
   - **Re-run extract** with the approved item-type rule and any granularity answer, before discovery's first
     snapshot (or round 1's, with no discovery), re-keying as in step 4.
   - **Write** `S/loop.md`, `S/HANDOFF.md`, the decision log and the approved `S/classes.md`. Set config `decisionLog` (the log's
     path, relative to `S/`) and `rulingIdPattern` (one that matches only bar rulings, tested on a known id):
     `ltz rulings`, the `withdrawn` check and the `rulingsChecked` check of a repeat read both. Then run
     `ltz rulings <S>`: every ruling in the log needs an accepted-by-ruling entry, and the tool checks that each
     id appears in that section. Set config `requireRulingEntries` so `snapshot` refuses otherwise.
   - **If the owner approved hooks,** enable `scripts/hooks/guard.mjs` in the project's settings, never the
     user-level settings (`scripts/hooks/README.md`). If you took the lock under an id of your own, re-take it
     under your real session id: `ltz lock <S> release --session <your id>`, then `ltz lock <S> acquire
     --session auto`. The guard blocks your own writes while the lock names a different session.
   - **The tools are the loop's riskiest code.** Every check, including any the project adds, needs a
     negative test for each way it could pass while checking nothing:
     - missing input, or a skipped case;
     - a substring match where a whole value is needed;
     - membership checked where equality is needed;
     - a count compared where the content should be;
     - expectations derived from the run under test;
     - trailing data ignored;
     - a catch-all that turns an error into success;
     - `;` or a pipe that hides a failing exit status.

     Aim any independent reviewer at the tools first. Reviews of one project's plan found more than 15 such
     fail-open checks.
9. **Discovery,** if approved, runs in its own state folder `S/discovery/`, with its own copy of `config.json`
   (without `historyFolders`, and with `decisionLog` pointing at `S/`'s log) and the same tools.
   Repoint `.ltz-state` (or `LTZ_STATE`) there and take the lock there while it runs, and point it back to `S/`
   before round 1. The tools read it as the
   state folder, so it also holds copies of `classes.md`, `items.jsonl` and `checks/patterns/` (copy
   `S/items.jsonl` there after each extract). Each pass reads every unit, one
   round per unit there, with readers and canaries as in rounds; then fix by class, with the fix check as in rounds. Set each pass's reading order with
   `ltz snapshot --order <file>`, one file per unit (a permutation of its ids). Discovery verdicts count as earlier passes for the history check, the
   escalation trigger, the known instances sweep patterns test, and the rounds `replay` measures (set
   `historyFolders: ["discovery"]` in the main config only; the discovery folder's own copy
   omits it). `S/`'s `classes.md` and decision log stay the master copies, and lessons, `defects.md`,
   `owner-questions.md` and `cross-unit-edits.txt` (with its "deferred" lines, which round 1 reads there) stay in `S/`: copy `S/classes.md` to `S/discovery/classes.md`, and mirror `S/checks/patterns/` to
   `S/discovery/checks/patterns/` (removing retired patterns), before each discovery snapshot and each `diffcheck`
   there, and again at once whenever they change (a ruling, a new class,
   a fix's new pattern, which is written to `S/checks/patterns/` first); the fix checker reads
   `S/discovery/classes.md` there. Discovery writes its own `S/discovery/judgments.jsonl`, since
   its pass numbers would clash with the units' round numbers. Readers judge every item under the three lenses
   (`references/reading-classes.md`). Cross-unit edits are allowed, because no unit is
   closed yet. A discovery pass never closes a unit, even at zero: units close only through their own rounds.
   Then round 1 of the first unit. Discovery's fixes don't count as a unit's first fix round:
   round 1's fix still re-reads the whole unit.
   - **Change the reading order each pass.** Use orders such as reverse, by area, by cited file, by
     ruling, by fix history, or middle-out, so that families split by one order come together in another.
     Calibrate a new order on the state before the last pass's fixes: last pass's finding families should
     land close together.
   - **Put items an earlier fix changed first** in the pass's `--order` files, then the rest in this pass's order, and weight spot-checks toward them; never tell readers which items were fixed. In one project, about 40% of later finds sat on
     items an earlier fix had changed, against a 7% base rate.
   - **Aim each pass at the class that survived.** You (the writer) build an inventory of every instance of its mechanism at
     the source (all refusal sites, all writers), then judge every item that names one.
   - **When you judge, show yourself each item beside the rulings, entries and siblings that bear on it** (readers get only what their brief allows). When an aid like that is
     added mid-pass, run it back over the items already read.
   - **A discovery pass that never reaches zero** still ends when the owner says. In one project, discovery ran
     15 passes without reaching zero.

## Adopting a loop that already runs
At setup step 4, with the owner's OK (adopting forgoes discovery: setup question 2's note) and at a round boundary:
1. **Map its state into `S/`:** the evidence, pin and boundary into `config.json`; its decisions into the decision
   log, verbatim, with accepted-by-ruling entries in `classes.md` for its bar rulings; its terms into `loop.md`;
   its units' statuses into `config.json` and `loop.md`'s Units line. A unit it closed is `closed` only if its
   closing round meets `references/round.md` step 8's conditions; otherwise ask the owner which closed status it
   takes (`references/round.md`, "Closed statuses"), or whether to reopen it. Later setup steps add to these
   files, never replace them.
2. **Rebuild its past rounds** where the records allow, so replay and the repeat check work: for each round,
   `S/<unit>/r<R>/snapshot.jsonl` (the items as that round read them, from the item files at that round's
   commit) and `confirmed.json` (its find list, mapped to item ids; at step 5, relabel each entry's class with the
   new class names before any replay, and again if question 1 renames a class). Keep its round numbers. List any round that
   can't be rebuilt in `research.md` as history without replay. At the end of setup (after step 8's re-extract),
   take a baseline of every unit at its current items (`ltz snapshot <S> <unit>
   <its next round>`; that round takes it again when it starts): the rebuilt rounds have no fixlogs, so their own
   fixes would show as unexplained changes.
3. **Keep its rulings in force.** Change its practice only at a round boundary, with the owner's OK. The next
   round continues its numbering, and counts as each unit's first fix round (`references/fixing.md`): its fix
   re-reads the whole unit. Wherever setup says "round 1" (extract-flagged items, r0 finds, the re-extract, the
   hash snapshot), read the adopted loop's next round.

## Predefining names and classes from repo research
The names and classes are fixed before the work begins. They are backed by evidence from the repo, not
invented mid-pass. Write the research to `S/research.md`, citing each finding.

**Names (the terms map).**
- Take the unit and item words the project already uses: its docs, folder and file names, the plan, the
  item source's own headings.
- Never use a generic word where the repo has its own.
- Record each mapping with the file:line where the repo uses it, and the item-id scheme with examples.
- A word the repo uses in two senses (one the item, one a setting, say) is asked of the owner before research
  uses it: which sense is which, and the word for the other. Record the answer in the terms map first.

**Classes (the bar).** They come from five sources. Search each with no output limit, and keep the counts.
1. **Claim shapes in the items.** Count them with `ltz sweep --count` over every item, not a sample (counting needs no
   known instances). A class with "none found" gets its regression pattern once its first seed is confirmed. Count:
   - the universal words (`references/reading-classes.md`);
   - closed lists;
   - counts and numbers;
   - defaults;
   - conditional or config-gated effects;
   - sole-location claims;
   - consequence chains;
   - cite forms.

   Each shape with hits becomes a candidate class.
2. **Evidence kinds.** List what the evidence holds: app code, tests, fixtures, scripts, migrations, schema,
   infra, config, docs, and generated or vendored code. Every kind that can refute a universal goes into
   the proposed evidence boundary.
3. **Past errors.** Look in the history of the items and the evidence:
   - fix and revert commits;
   - review comments;
   - issue and audit findings;
   - earlier verification reports;
   - **the owner's own catches:** ask the owner for two or three recent errors they found by hand in the items,
     and the traps they know of. With little or no review history this is the main past-error source. Record
     each in `S/research.md`; it seeds a class, and its items that still hold the wrong text become the class
     pattern's known instances (`ltz sweep` looks for a known instance only in the items and the rounds'
     snapshots and fixlogs: `scripts/README.md`, "Sweeps"). For one already fixed, keep its old text in
     `research.md` and check the pattern against that text by hand.

   Group them by root cause; each recurring cause is a class.
4. **Rules and rulings.** Read the decision records, approved exceptions and verification rules. The governing
   documents are specs, policies, READMEs, plans, decision records, and the issue tracker if there is one. Each
   decision or approved exception they hold that bears on how items are judged goes into the decision log first,
   verbatim with its source, as a bar ruling (`R-n`) for the owner to confirm at question 1, and only then gets
   its accepted-by-ruling entry. They also give any class the rules define. Note which document governs which (the
   hierarchy): it decides whether a mismatch is a copying error or a defect. If the project has no verification rules,
   draft them from the research into `S/rules.md` for the owner to approve at question 1. The approved text is
   what the briefs quote as `{RULES}`.
5. **The global starter set** in `references/reading-classes.md`. Keep a starter class only if sources 1 to
   4 show the project can produce it.

**Canonical numbering.** If two copies of the evidence number their lines differently (a copy with an added
header, say), choose one canonical numbering in the bar up front and check every citation against it.
Tolerating both as "below the bar" later cost about 28 edits.

**Reader guidance is a source of errors.** Guidance or hints carried to readers state what to bound, never
new facts. Re-check every carried line as `references/reading-classes.md` ("Reader guidance") says. When a round's wrongs
trace back to a guidance line, propose the corrected line to the owner (replayed with a pattern that encodes
its point, where one can), for the next round's copy. Hints once caused 9 extra wrongs in one round and 3 in
another.

**Each class records:**
- a name in the project's terms;
- a definition;
- what makes it wrong;
- an "Is not" line (the nearest class it could be confused with) and an "Ok example" line (a made-up claim of its
  shape that holds), on every entry, starter or new, catch-alls and conditional entries included;
- 2 to 3 example item ids from the repo, or "none found";
- sweep patterns, tested so that together they hit every known instance;
- the fix form;
- its source;
- its replay result. If the project has recorded rounds, run `ltz replay` and record which past confirmed
  wrongs the class catches, and its false hits.

**The draft bar.** Each proposed class's name, definition, what makes it wrong, what it is not, its ok example and fix form go into a draft
`S/classes.md` for the r0 test reader (its example ids, pattern, source and replay result stay in `research.md`),
together with quoted copies of the three lenses from `references/reading-classes.md`, the universal words
(config `universalWords` when set, otherwise that file's list, with its "N per …" line either way), its "When two classes fit" and its "Accepted forms". Readers can
not open this skill's files, so `classes.md` has to carry them. Once the owner
approves, amends or adds, it becomes round 1's bar.

**A class found mid-pass** is handled as in `references/reading-classes.md` ("A class found mid-pass") and
`references/round.md` ("Between rounds only"). It also logs a lesson that the research missed a
class, and `S/research.md` gains the source that would have found it (a change to this checklist is proposed to
the skill's maintainer).

## Gathering the owner questions
- **Collect open owner questions from every governing document,** not just from one tool's output or the
  items' own fields: spec open-item tables, decision records, plans, and "owner" or "TBD" markers.
- **Before closing setup, check that each "answer now" question has a decision** (a bar ruling or a process
  decision), and each deferred one has its
  stated default recorded in `S/owner-questions.md`, labelled as the default, not a decision. The default is only what the later ask will recommend, never a verdict: an item whose verdict turns on the question is `pending-owner` only under SKILL.md's Verdicts exceptions (such as `rule-meaning`, when the question is what a rule means). An item the evidence plainly refutes stays `wrong`, and a fix that depends on the answer waits for it (`references/round.md`, "Pending owner, defects, wishes"). A census keyed only on the items missed spec-level owner items twice.
- **Dedupe them.** Identical questions become one ask, naming every item it covers. Check the decision log
  first, and never re-ask a settled question, unless a later owner rule conflicts with it.
- **Order them by when an answer is due and what a late answer costs.** Ask early where a late "no" is
  expensive.
- **Split** "answer now" from "asked later inside a task, with a stated default".
- **Separate** facts to note from questions.
- **Offer "accept all recommendations",** carving out the items that need the owner's own words or facts.
- **Record every answer at once** in the decision log (it may be committed), and make no other changes to
  the project during the sitting. Review all the answers, then ask the owner when to apply them. A sweeping first directive often
  gets refined the same day.

## Setup questions (offer options, recommend one, the owner decides)
0. **What zero is for, and what a zero pass means.** Ask what a clean unit is needed for: a fixed reference
   to build against, or a fully correct document. That decides how far the loop goes.
   - Recommend writing down that a zero pass:
     - records no confirmed wrong (an item outside a frozen bar is listed for the owner, not counted);
     - read every item at full depth. A filtered or tiered pass never counts; a partly skimmed one counts
       only once supplementary reads have re-read every skimmed range.
   - Recommend that owner-only questions about a rule's meaning (`rule-meaning`) are listed at each pass end and
     don't block zero, and that a unit closing on a zero pass with such items open is marked `closed-owner-questions-open`
     (`references/round.md`, "Closed statuses"). The owner may rule that they
     block. `boundary-silent` and `ruled-wording` items always block, because the evidence refutes them. The answer sets config
     `ownerQuestionsBlock`, and the answer on defects (question 3) sets `defectsBlock`. `ltz record` uses both (for
     defects, only the round's `confirmed.json` list; the close also checks `S/defects.md`, where a defect the owner
     closed by decision no longer blocks; `references/round.md` step 8).
   - A loop on a reference that keeps exposing deeper flaws (4, 6, 13, 18 findings, about 3 hours a round)
     may need a freeze instead: it may only need to be frozen as it stands, not perfect. Offer that option: the items
     are kept as the reference and the loop ends by a stopping rule (not a frozen bar, question 7). The stopping
     round's confirmed wrongs are still fixed and fix-checked before the unit closes; any the owner leaves unfixed
     make it `closed-known-wrongs` (`references/round.md`, "Closed statuses").
   - **Agree an escalation trigger up front,** for example "more than about 3 new wrongs in items an earlier
     pass accepted and nobody has changed since, or any repeat on a fixed item" (an "evidence moved" one aside:
     `references/learning.md`, "The retro"). Without discovery or adopted history, it can't fire in
     round 1, because no earlier pass has accepted anything. When it fires, take the owner the trend, the classes and the
     cost per pass. The owner decides whether
     to continue, cap the passes, or change the method; asking doesn't pause the loop
     (`references/owner-asks.md`, "Asking about stopping or changing method").
1. **Names, classes and rules.** The proposed terms map and class set, each with its evidence and counts, and the
   drafted verification rules (`S/rules.md`) if the project had none.
2. **Discovery first, or unit by unit?** (For an adopted loop, tell the owner, as a fact to note, that this skill's
   discovery needs a fresh loop, so an adopted loop continues from its next round (SKILL.md, setup checklist step 9);
   then ask only the unit order and whether the next unit waits for the owner's go.)
   - Recommend discovery when there are hundreds of items or more.
   - Ask the unit order too. Recommend the items' own order, unless one unit's fixes feed the others.
   - Ask whether, after a unit closes, the next unit waits for the owner's go. Recommend that it
     does (a report and ask at each unit boundary: `references/owner-asks.md`).
   - An owner who asked for "unit by unit" still hears the proposal once.
   - Ask for a pass cap, or "it ends when the owner says". Discovery can run many passes without reaching
     zero, and it delays round 1 of every unit.
3. **Item type.** Do the items describe the evidence, or state requirements it must meet?
   - When they disagree, recommend this split:
     - copying errors fix the item;
     - a requirement the evidence does not meet goes to `S/defects.md`, and the item stays.
   - Ask whether an open defect blocks a unit's close. Recommend: it doesn't block, and defects are reported
     every round. For controls and compliance items, state the case for blocking plainly: a closed unit with
     unmet controls may read as attested.
   - If a project tracker is connected, also ask whether defects may be filed as tickets, each with the owner's OK
     or under a standing process decision.
   - The extract script writes `"type": "requirement"|"description"` on every item in `items.jsonl`, one value
     for all when the items don't mix. If they mix, ask for a per-item rule for the script to apply, and show the
     owner the borderline items.
   - Ask the granularity question here, if step 4 left it open (is "3.2.1(a)" its own item?).
4. **Softening.** May fixes hedge ("such as", "for example")? Subtraction and stating a proven scope ("outside
   tests") are not softening, and are allowed for descriptive items either way. A requirement item is never
   narrowed to fit the evidence: keep the claim, or log a defect; narrow it only by an owner ruling (a copying
   error from its own source is fixed: `references/fixing.md`, "Requirement items"). For requirements and controls,
   recommend no softening: keep the claim, or log a defect.
5. **The evidence boundary and pin.** Which evidence kinds count, and which pin. The written boundary is the
   ruling; config `boundaryPaths` implements it, and if they disagree, the config is corrected.
   - **5a: config-to-policy mapping.** Which configs implement which cited policies. Without a
     mapping, a policy-vs-config mismatch is judged only where an item cites both. The approved mapping is a bar ruling: quote its table
     in `classes.md` with the boundary, so readers also open the mapped config of an item that cites only the
     policy. Readers mark a mismatch wrong with a note starting "policy vs config"; you record it as a `defect`,
     except that a descriptive item that gives the policy's value as what the system does is `wrong` and fixed,
     with the defect logged beside it ("Policy and config evidence", below).
6. **Reader mode** (`references/modes.md`): solo, agents or an external reviewer. Also readers per chunk,
   concurrency, and the fix-checker mode. Quote each option's cost as a range of tokens and wall-clock
   time, from the measurement. Also ask whether readers may run probes of the code in a scratch copy:
   recommend allowing them where the research finds claims about run-time behaviour (config loading,
   parsing), and read only otherwise. Probes also let the writer reproduce a `defect`
   (`references/debugging.md`).
   - **Canaries** (planted test items, `references/round.md`). Recommend one or two per reader per round.
     They are not offered in solo mode (the writer is the only reader, and planted them). They measure each reader's catch rate and false alarms, and they never enter the
     items.
   - **Hooks** (`scripts/hooks/README.md`). Recommend enabling the guard in the project's settings. It
     refuses item commits while any reader job is still open, edits to item files whose units are all closed, a second writer,
     and a search piped into `head` or `Select-Object -First` (not `-m` or a tool's own result cap:
     `scripts/hooks/README.md`, "Not covered"). `.ltz-state` goes in the repo's `.gitignore`. The settings change is committed only
     with the owner's OK.
   - **Masking.** Report how many cited lines `render` masked in r0. Recommend stripping secrets at export,
     and use `maskAllow` and `maskExclude` in the config, so that claims about settings stay checkable. Prose
     such as "Password rotation: every 90 days" looks like a key and value to the masker, so put prose documents
     (policies) in `maskExclude` once their secrets are stripped.
   - **Solo and fresh sessions.** If the owner decides against subagents, ask whether a fresh session the owner
     opens counts as one. That decides the fix-checker mode.
7. **The bar.** Open (new classes are always swept) or frozen after a stated round. Recommend open: classes the
   research missed still get found, and each one improves the research.
8. **Cross-unit policy.** Recommend:
   - units not yet closed are edited and logged;
   - closed units get logged leads only, deferred;
   - a ruling-level lead goes to the owner.

   With many units not yet started, also offer this: hits in a unit whose round 1 hasn't started are logged
   for that unit (`cross-unit-edits.txt`, verdict "deferred") instead of edited now. Its own round 1 reads and
   sweeps them, and each round's fix check stays small. It applies only after discovery: discovery's fixes edit
   every unit.
9. **Where things go:**
   - the decision log (recommend `S/decisions.md`, unless the project already has one). Number bar rulings `R-n`
     and process decisions `P-n`. Only bar rulings enter `classes.md`;
   - the branch for fixes;
   - who approves changes;
   - whether `S/` goes under git (private, with the canary files and the readers' `scratch/` folders ignored;
     `ltz canary gitignore` checks it) or gets dated backups;
   - push and publish (never without the owner).

   Items that are not in git: copy their source files to a dated backup in `S/` before each round's fixes are
   applied.

**Policy and config evidence.** When a statement of what a policy says (a requirement item included) differs
from the policy text it cites, that is a copying error: fix the statement. The rest of this paragraph applies
only when the item cites both the policy and the config, or a ruling says the config implements the cited
policy. When the policy differs from the config, that is a `defect` for the owner: a requirement item is left
as it is, and so is a descriptive item that states both values correctly. A descriptive item that gives the
policy's value as what the system does is `wrong` as well (it misstates the config); one that gives the
config's value but cites only the policy is `wrong` under C1 (its cite says something else), and keeps its
value while its cite is corrected. Either way the mismatch is logged as its own defect entry
(`references/round.md`, "Pending owner, defects, wishes").

**Which answers are bar rulings and which are process decisions.**
- **Bar rulings** (numbered like `R-n`) change how items are judged: the evidence boundary, the config-to-policy
  mapping (question 5a), the item type, softening, any scope or definition ruling, and any ruling that changes the behaviour items describe (carried
  into the items: `references/fixing.md`). They are quoted in `classes.md`.
- **Process decisions** (`P-n`) cover how the loop runs: the zero definition, the close rules, readers,
  concurrency, canaries, probes, hooks, masking, granularity, the evidence pin and any move of it (the boundary
  stays a bar ruling), the bar's open or frozen state, the branch and
  approver, overrides and drops, and every other setup answer not listed as a bar ruling (the cross-unit policy,
  the escalation trigger, the unit order, the fix-checker mode, version control and publishing). Readers never see them (the brief states the probe and bar settings as
  instructions).
- **Approving the names, classes and rules** (question 1) is a process decision: its content is `classes.md` and
  `rules.md` themselves, which readers already read, so it needs no accepted-by-ruling entry. So is approving a
  later class, class-wording change or reader-guidance line, and the owner's keep of a class found
  mid-pass (it joins the bar unapproved). An answer that drops one is a bar ruling (`R-n`, with an accepted-by-ruling
  entry): the reader wrongs confirmed under it in the current round go in `withdrawn`; earlier rounds' are
  re-judged by back-propagation (`judgments.jsonl` lines, adjusted counts) and their edits reverted (`references/fixing.md`,
  "Reverting").

`R-n` and `P-n` are examples. Use the project's own id scheme, with a `rulingIdPattern` that matches only bar
rulings (test it on a known id). If its scheme can't tell bar rulings apart, keep `S/decisions.md` for the loop's
rulings.

**Permissions are not answers.** A permission such as "agents are fine" allows a mode; it doesn't choose
readers per chunk or concurrency.

## Existing outside findings (an audit, an earlier review)
- **Keep them** in `S/inputs/`, closed to readers.
- **Use them as research source 3:** generalised, with no item ids in the `classes.md` text readers see.
  Their ids may appear in a pattern's `knownInstances`, which is tool data.
- **They are not verdicts.** They do not count in the history check, and they don't replace discovery unless
  the owner says so.
- **Map them to item ids** at setup, in `S/inputs/audit-map.json`.
- **Measure recall** each round over this unit's outside findings still present in the round's snapshot (not
  fixed in an earlier round): how many the round caught. Diagnose each one no reader caught as `references/learning.md`, "The retro", step 1 says; only one that fits
  no class in the bar points to a missing class (log that lesson). A mapped wrong that no reader finds is confirmed by the writer
  with `foundBy: "audit"`, counted as found by none.
- **A finding that maps to no item** (a missing control, a gap no item covers) is not a wrong. Put it in
  `S/defects.md` if the evidence falls short, under the unit whose items cover its area (ask the owner when no unit
  clearly does: the unit decides which close it can block), or in `S/owner-questions.md` if it asks for a new item. Never add
  items unasked.

## The decision log (the master copy of rulings)
- Put the log where question 9 decided (the recommendation: the project's own log if it has one, otherwise
  `S/decisions.md`).
- Each ruling is recorded verbatim, dated and numbered.
- `S/loop.md` lists the ruling ids with one-line summaries. `S/classes.md` quotes, under accepted by ruling,
  the text readers need. If they disagree, the log wins.
- Commit the log if it is in git.
