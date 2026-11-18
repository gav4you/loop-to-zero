# Findings A: methods loop-to-zero could learn (plugins: engineering, data, operations, legal, finance, product-management, productivity, enterprise-search, customer-support, human-resources, design, marketing, brand-voice)

95 skills reviewed: every SKILL.md read in full, plus the references folders (only brand-voice x3 and data/data-context-extractor have them) and that skill's one other file. All were readable.
The detailed entries below come from five batch reviews, kept in batch order. Each entry was grep-checked against loop-to-zero. I verified several quotes against the sources (ticket-triage:122, performance-report:309, audit-support:139) and the claims about loop-to-zero (round.md:50 "5 at random", round.md:227-230 Chapman estimate "runs low").

## Consolidated ranking (deduplicated across batches)
Where batches found the same method independently, the merged item cites every entry.

HIGH
1. State the detection limit of spot-checks, canaries and a zero pass, and give residual-risk numbers at close (data/statistical-analysis; Batch 2).
2. Check how accurate the remaining-wrongs estimate is, and track its bias with a correction factor (finance/variance-analysis, journal-entry-prep; Batch 3). lessons.md already holds the raw data.
3. Spot-check selection: seed it, record it, and spread it across early and late windows (finance/audit-support, sox-testing; Batch 3). round.md:50's "5 at random" is chosen by hand and not recorded.
4. Lead the round report with a headline and a "Decisions needed" block with need-by points (product-management/stakeholder-update, operations/status-report; Batch 5). The asks now sit at item 7 of 8.

MEDIUM
5. Report the remaining-wrongs estimate as a range, flagged low-confidence when the overlap m is small (data/statistical-analysis, marketing/performance-report, product-management/metrics-review; Batches 2, 4, 5: three independent finds).
6. Rank open owner questions by what they block, show their age, and escalate by age, with defects and leads too (brand-voice/guideline-generation, customer-support/customer-escalation, finance/close-management, status-report; Batches 1, 3, 5).
7. Cold-test HANDOFF.md: a fresh session follows it once, against a "you resumed correctly if..." check (customer-support/kb-article, operations/runbook; Batches 1, 5).
8. Show the trend per class, not only the total (data, product-management/metrics-review; Batches 2, 5).
9. Take a bigger spot-check sample when the risk is higher: an overturned ok, or a new reader model or brief (finance/audit-support, sox-testing; Batch 3).
10. Grade wrongs and defects by severity (and likelihood), for the owner's decisions only (finance, legal/legal-risk-assessment, design/accessibility-review; Batches 2, 3, 4).
11. Give each class an "is not" line and an ok example (marketing/brand-review; Batch 4), with a per-class "fix must not become" line (Batch 1, low).
12. Precedence rule (root cause) for a wrong that fits two classes (customer-support/ticket-triage; Batch 1).
13. Withdraw an owner question that new facts settle, and say so (customer-support/customer-escalation; Batch 1).
14. Guard lesson and class replay against in-sample tuning: record the variants tried, and hold rounds back (data/statistical-analysis; Batch 2).
15. Flag templated reader notes (few distinct notes) as a skim signal (data/validate-data, explore-data; Batch 2).
16. Lint filled briefs for unfilled `{SLOTS}` before launch (Batch 2).
17. Settle ambiguous domain terms with the owner at setup, as a glossary (data/data-context-extractor; Batch 2).
18. State the keep/drop criterion and sample size before trying a method change (marketing/performance-report; Batch 4).
19. Store each ruling ADR-style: the question, the options, the alternatives turned down, and a superseded status (product-management/stakeholder-update; Batch 5).

LOW / LOW-MEDIUM
Lessons: a "re-verify when" condition, a last-seen date, retirement, or a hot/cold tier (Batches 1, 4, 5: productivity/memory-management, kb-article). Record how often a reproduction holds for intermittent defects. A minimum spot-check per stratum. A name for each kind of ask (investigate/fix/decide). Ask the owner for known traps as a class source. A defect impact line. Separate observation from judgment in notes. A cross-item consistency check (two names for one concept). An "as of" pin stamp on reports. Bridge each round's count to the last. Measure wrongs found after close. Keep distinct claims separate when merging readers. A requirement class for unmeasurable words.

Counts after merging: 4 high, 15 medium, about 13 low (44 entries before merging: 4 high, 20 medium, 20 low or low-medium).

---

# Batch 1 (brand-voice customer-support )

# Part 1: brand-voice and customer-support skills (8 skills)

Paths: BV = ~/.claude/plugins/synced/<marketplace>/brand-voice/skills, CS = the same root + /customer-support/skills. LTZ = ~\code\loop-to-zero\skills\loop-to-zero.

### Precedence rule for an item that matches more than one class
- source: customer-support/ticket-triage CS/ticket-triage/SKILL.md:121 — "If the customer reports **both** a bug and a feature request, the bug is primary"; also :122 — "root cause drives the category" and :270 — "Categorize by **root cause**, not just the symptom described"
- method: When one finding fits several categories, a fixed precedence rule picks one primary category (the root cause), with an optional secondary, so counts and routing never double-count or split one finding.
- where in loop-to-zero: references/reading-classes.md § Starter classes and references/setup.md § "Each class records"; references/learning.md § The retro (counts by class). Nothing found for: "two classes", "more than one class", "primary class", "several classes", "which class". setup.md:190 groups history "by root cause; each recurring cause is a class", but no rule says which class a wrong is recorded under when it fits two (e.g. a universal word that is also a stale name), which affects per-class counts, the sweep seed, and replay recall.
- value: medium. Per-class counts drive the retro and the spot-check weighting (round.md:50 "toward classes that produced wrongs"), so ambiguous class assignment skews both.

### Rank open owner questions by what they block, with their age
- source: brand-voice/guideline-generation BV/guideline-generation/references/confidence-scoring.md:124 — "**Low confidence + conflict** = High Priority open question"; BV/guideline-generation/SKILL.md:76 — "### High Priority (blocks guideline completion)"; customer-support/customer-escalation CS/customer-escalation/SKILL.md:81 — "**Time in queue:** [How long this has been an issue]"
- method: Open questions are grouped into tiers (blocks completion / improves quality / nice to have), and an escalation says how long the issue has waited. Applied here: in the report, list open owner questions sorted by whether they block a close, how many items wait on each, and the date asked.
- where in loop-to-zero: references/owner-asks.md § "Reporting a round", item 7 lists "every open owner question" as a flat list; owner-asks.md:14 says `S/owner-questions.md` lists each ask "with the unit and item ids that wait on it". SKILL.md says `boundary-silent` and `ruled-wording` always block while `ownerQuestionsBlock` governs `rule-meaning`. Nothing found for: "priority", "date asked", "waiting since", "age", "overdue". The blocking facts are there, but the report doesn't order or age the questions.
- value: medium. When several questions are open, an owner can answer the ones that unblock a close first. This is cheap to add to the report and to owner-questions.md.

### Name the kind of ask: investigate, fix or decide
- source: customer-support/customer-escalation CS/customer-escalation/SKILL.md:244 — "Be clear about what you need — \"investigate\" vs. \"fix\" vs. \"decide\" are different asks"
- method: Each escalation states which of the three asks it is, plus a deadline (:245 "Set and communicate a deadline").
- where in loop-to-zero: references/owner-asks.md § "Asking the owner" (what it affects, recommendation, alternatives, every option, one question per decision) and the wish-vs-ruling distinction; references/debugging.md § Reporting ("Ask there whether to file a..."). Nothing found that labels an owner item as needing a decision vs only being for information (for example, defect reports where the owner fixes the evidence).
- value: low. Most loop-to-zero asks are already decisions. A label helps mainly in the mixed item-7 list (questions vs defects vs outsideBar).

### Withdraw an owner question when new facts settle it, and say so
- source: customer-support/customer-escalation CS/customer-escalation/SKILL.md:232 — "New information changes the severity assessment"; :235 — "Notify the team you escalated to"
- method: De-escalation is an explicit step. When new information makes an escalation unnecessary, the escalator closes it and tells the receiving party, rather than letting it sit.
- where in loop-to-zero: references/owner-asks.md:14 (owner-questions.md gets "its decision id once it is answered"); round.md:127 handles a lead "that has since become moot" only for leads. Nothing found for withdrawing an owner question before an answer (terms: withdraw, moot, no longer needed, resolved itself). The `withdrawn` hits (fixing.md:33, learning.md:107) are about wrongs withdrawn by ruling, not questions.
- value: medium. A question stays open, and can keep holding a close (`closed-owner-questions-open`) or keep drafts held, after a later round's evidence or a related ruling already settled it. Without a path, the owner may answer a moot question.

### Test the handoff the way a KB article is tested: by someone unfamiliar following it
- source: customer-support/kb-article CS/kb-article/SKILL.md:347 — "Test your articles — follow the steps yourself or have someone unfamiliar with the topic follow them"; also :163 — "## Verify It Worked" (how-to template ends with a success check)
- method: Instructions are validated by having a reader without context follow them, and they end with a way to confirm success.
- where in loop-to-zero: references/state-template.md:55 (HANDOFF.md: "one current paste-ready prompt to resume in a new session..."), references/queue-and-outages.md:106 ("S/HANDOFF.md only needs to name this skill and its folder, and give four steps"). Nothing found for testing the handoff: "dry run" appears only for tooling (queue-and-outages.md:133 "Dry-run new tooling on a recorded round"), and nothing for "test the handoff" or "resume test". The handoff also has no "you have resumed correctly if..." check (for example the expected lock holder, queue status and Next step).
- value: medium. The handoff is the only resume path after a reset or an account change. A stale or ambiguous handoff fails silently at the worst time, and a one-line success check costs nothing.

### Give lessons and precedents a "re-verify when" condition
- source: customer-support/customer-research CS/customer-research/SKILL.md:243 — "### Review Notes" with :244 — "[When to re-verify, what might change this answer]"; also :228 — "**Last Verified:** [date]"
- method: Each captured answer records when it was last verified and what event would invalidate it.
- where in loop-to-zero: references/learning.md § Lesson format (title, Rule, Why, Replay, Change, Seen); lessons.md:7 says to "drop a lesson a later one supersedes". Nothing found for invalidation conditions: "re-verify", "expire", "obsolete", "stale lesson". debugging.md:43 notes which items a pin move "would reopen", but only for defects, not for lessons, precedents.md entries or reader guidance that depend on facts at the old pin.
- value: low-medium. This matters for long loops that re-pin or adopt another loop. Lessons tied to a specific evidence shape can quietly mislead after the evidence changes.

### Retire or rework lessons that never pay off
- source: customer-support/kb-article CS/kb-article/SKILL.md:351 — "Measure impact — articles that don't get traffic or don't reduce tickets need to be improved or retired"
- method: Each piece of captured knowledge is judged by its effect, and dead entries are retired so the base stays small.
- where in loop-to-zero: lessons.md:7-8 ("merge a new lesson into an existing one that says the same thing, and drop a lesson a later one supersedes"); learning.md § Promotion (a lesson that "keeps recurring although SKILL.md already states it" leads to proposing a mechanical check). That covers lessons that fail. Nothing found for lessons that never fire (terms: unused, never fires, hit rate, retire). Seen counts go up but are never used to prune.
- value: low. lessons.md is read every round, so dead weight costs tokens and attention. But a lesson that never fires may simply be working, so pruning needs owner judgment.

### Record how often a reproduction holds (intermittent behaviour)
- source: customer-support/customer-escalation CS/customer-escalation/SKILL.md:205 — "**Capture the frequency**: Always reproducible? Intermittent? Only under certain conditions?"; also :201 — "**Start from a clean state**"
- method: A reproduction states its hit rate and its starting state, so the receiver knows whether one clean run disproves it.
- where in loop-to-zero: references/debugging.md § "The steps, in order", step 1 Reproduce ("record the command and its output verbatim", "Write the reproduction as steps someone else can re-run at the pin"). Nothing found for: intermittent, flaky, nondeterministic, "run again" in the debugging context. fixing.md:199 mentions a flaky gate only for commits.
- value: low-medium. Only applies when probes are allowed and the code path is nondeterministic (timing, ordering, environment). There, one probe run can wrongly confirm or clear a `defect`.

### Minimum coverage per stratum overrides the score threshold
- source: brand-voice/discover-brand BV/discover-brand/references/source-ranking.md:237 — "At least one source per category if available (this overrides the score threshold)"; :238 — "At least one source per platform if available"
- method: A weighted selection is backed by a floor, so every category gets at least one pick even if its score is low.
- where in loop-to-zero: references/round.md:50 — "spot-check 10 ok items per reader: 5 at random, and 5 weighted toward items an earlier fix changed and toward classes that produced wrongs". Nothing found for a floor or stratification ("stratif", "at least one per"). The weighted half chases known wrongs, and the random half may miss item kinds or windows with no history.
- value: low. The random half already gives some coverage. A floor (at least one ok from each window or item type not yet spot-checked this unit) would sharpen it cheaply.

### Pair each class's fix form with the over-correction it must not become
- source: brand-voice/brand-voice-enforcement BV/brand-voice-enforcement/references/voice-constant-tone-flexes.md:13 — "It defines the brand's personality in paired attributes — what the brand IS and the boundary it should never cross."
- method: Each target attribute comes with its failure mode when pushed too far ("Direct" / "not Blunt"), so whoever applies it knows the limit on both sides.
- where in loop-to-zero: references/setup.md § "Each class records" has a "fix form" but no paired "must not become". The over-corrections are global: SKILL.md red flags ("Change 'only A' to 'only A and B'" = a new universal), the hedge and softening rules, and fixing.md:136. Nothing found for a per-class over-correction field.
- value: low. The global rules cover the common over-fixes. A per-class "not this" line would mostly help classes whose typical over-fix is specific to that class (for example a rename that drops the old name readers still search for).

## Reviewed, nothing new
- customer-support/draft-response: customer-message tone, templates and follow-up cadence. Its checks ("Accurate references to previous conversations", no overcommitment) are already covered by loop-to-zero's history check (fixing.md "History") and the lesson on wrong reported facts (lessons.md:392). The rest is domain-only.

(Every other skill in list1 is a source above: brand-voice-enforcement, discover-brand, guideline-generation, customer-escalation, customer-research, kb-article, ticket-triage.)

Also checked and already covered (not recorded as findings): "every open question includes a recommendation" (= owner-asks "Recommend; never default"); "use the most conservative answer when sources contradict" (customer-research:184; = held drafts and always-allowed subtraction); "say what would raise confidence" (confidence-scoring.md:118; = round.md "more readers per chunk would pay"); "absence of results is information / flag low coverage" (search-strategies.md:271; = red flag "sweep came back clean" and tested sweep patterns); "note what you've ruled out" (customer-escalation:207; = debugging.md:34); duplicate detection by symptom, customer and area (ticket-triage:196-199; = sweep by subject, cite and file); "recurring issue that was supposedly fixed" (= `ltz flips`); archive the previous guideline version before overwriting (= snapshots and git); before/after annotated examples (= precedents.md and class example ids).

---

# Batch 2 (data design )

# Part 2: data/* and design/* skills mined for loop-to-zero

Base dir for sources: `~/.claude/plugins/synced/<marketplace>/` (abbreviated below as `<B>`).
loop-to-zero paths are relative to `~\code\loop-to-zero\skills\loop-to-zero\`.

### State the detection limit of spot-checks, canaries and a zero pass
- source: data/statistical-analysis `<B>/data/skills/statistical-analysis/SKILL.md:200` — "If your sample is small, say so: \"With only 200 observations per group, we have limited power to detect effects smaller than X%\""; also :197 — "Small samples produce unreliable results, even with significant p-values"
- method: Whenever a small sample is the basis of a reassurance, report the bound it supports, not just the count. For loop-to-zero: 0 of 10 spot-checked oks overturned only bounds that reader's ok-miss rate below about 26% (95%, rule of three: 3/n); 1-2 canaries per reader bound almost nothing; and at a zero pass the Chapman estimate is degenerate (n1=n2=m=0 gives N=(1)(1)/(1)-1=0), so "estimate 0" at close is an artefact, not evidence. The close report should carry the pooled canary catch rate and spot-check result as the residual-risk statement.
- where in loop-to-zero: references/round.md § 3 Verify (line 50, "spot-check 10 ok items per reader: 5 at random, and 5 weighted"), § Canaries (line 221, "keep canaries to one or two per reader"), § The remaining-wrongs estimate (227-231); references/setup.md § Setup questions 0 "What zero is for, and what a zero pass means". Nothing found for: rule of three, upper bound, miss rate, power, what a sample can detect. The estimate's only caveat is that it "runs low" (scripts/lib/estimate.mjs:2).
- value: high — the owner's main question at close is "how sure are we?", and the current numbers (10/10 ok, estimate 0) overstate certainty exactly when it matters.

### Report the remaining-wrongs estimate as a range, not a point
- source: data/statistical-analysis `<B>/data/skills/statistical-analysis/SKILL.md:103` — "**Always communicate uncertainty**. Provide a range, not a point estimate"; :244 — "Prefer ranges: \"We expect churn between 4-6% based on historical patterns\""
- method: Give the Chapman estimate with an interval (Chapman has a standard variance formula; or a simple bootstrap over chunks), and round it. A point like "N=7.3" invites false precision; "about 4-12 still unfound (runs low: readers share a brief)" is honest.
- where in loop-to-zero: references/round.md § The remaining-wrongs estimate (227-232): "Always report it with its caveat" and "never as a date"; owner-asks.md § Reporting a round item 3. Nothing found for: interval, confidence, range of the estimate, point estimate.
- value: medium — cheap to add in `estimate.mjs`, sharpens an existing owner-facing number.

### Guard lesson/class replay against in-sample tuning (multiple comparisons)
- source: data/statistical-analysis `<B>/data/skills/statistical-analysis/SKILL.md:218` — "If you looked at many segments before finding one that's different, note that"; :219 — "report how many tests were run"
- method: A sweep pattern iterated against the recorded rounds until its replay recall looks good is tested on the data it was tuned on. Record how many pattern variants were tried, and where history allows, tune on earlier rounds and replay on later ones (a holdout), reporting the holdout recall in the lesson's Replay field.
- where in loop-to-zero: references/learning.md § Replay (127-134): "recall" and "false hits" on "the recorded rounds", and § Promotion requires "a Replay result that held up". Nothing found for: overfit, holdout, held-out, number of variants tried.
- value: medium — replay is the gate for promotion to global lessons, so an inflated replay propagates across projects.

### Flag templated reader notes as a skim signal
- source: data/validate-data `<B>/data/skills/validate-data/SKILL.md:287` — "Identical values across time periods or segments (suggests the query is ignoring a dimension)"; :286 — "Results that perfectly confirm the hypothesis (reality is usually messier)"; data/explore-data `<B>/data/skills/explore-data/SKILL.md:115` — "Columns that should be high-cardinality but aren't (e.g., a \"user_id\" with only 50 distinct values)"
- method: Measure the distinct-note ratio per reader (distinct normalized notes / items) and flag a reader whose ok notes collapse to a few templates, or who marks 0 wrong on a chunk where its partner found many. Like explore-data's flags, it is a heuristic that earns a look (a spot-check weighted to that reader's range), not a verdict.
- where in loop-to-zero: references/briefs.md § Verifying the readers' work: coverage from files, render-log cites, and (line 233) "each reader's depth, as extra lines read per item, in early windows against late ones"; canaries catch some skimming. Nothing found for: identical/same note, templated, boilerplate, copy-paste notes, zero-wrong reader vs partner.
- value: medium — a reader can render every cite (passing coverage and depth) yet judge nothing; note cardinality is a cheap second signal from data already in the result files.

### Show the trend per class, not only the total (Simpson's paradox)
- source: data/statistical-analysis `<B>/data/skills/statistical-analysis/SKILL.md:224` — "Always check whether the conclusion holds across key segments"; :225 — "Overall conversion goes up, but conversion goes down in every segment -- because the mix shifted"
- method: A falling total of wrongs per round can hide a class whose count is rising (or a unit mix shift across rounds). Add a per-class row to the trend (wrongs per class per round) so a class that is not converging is visible before the escalation trigger fires.
- where in loop-to-zero: references/owner-asks.md § Reporting a round: "1. The trend: wrongs per round" and "2. This round's wrongs, on the two axes" (origin; who found them); learning.md § The retro uses the same two axes. Classes appear in the report only as "a class added mid-pass". Nothing found for: per-class trend, by class per round.
- value: medium — the fix step is per class (sweep, one wording per class), so a non-converging class is the actionable signal, and the total hides it.

### Lint filled briefs for unfilled slots before launch
- source: data/data-context-extractor `<B>/data/skills/data-context-extractor/scripts/package_data_skill.py:37-39` — "# Check for placeholder text that wasn't filled in" / "return False, \"SKILL.md contains unfilled placeholder text\""
- method: Before a reader or fix checker is launched, mechanically check the filled brief: no `{SLOT}`-style placeholder remains, and the two readers' briefs of a chunk are identical apart from slot and positions. Refuse the launch on failure.
- where in loop-to-zero: references/briefs.md (lines 3-34): "Fill the `{…}` slots" (a 25-row slot table) and "The two readers of a chunk get the same brief apart from their slot. Keep each filled brief, as sent, in `r<R>/briefs/<slot>.md`". No script checks it: grep of scripts/ltz.mjs and scripts/lib/*.mjs for brief/unfilled/placeholder found only the estimate caveat and a queue message. learning.md § Promotion already prefers "a mechanical check (a tool, a gate or a hook), not more words".
- value: medium — a leftover `{BOUNDARY}` or `{RULES}` silently changes what a cold reader judges against, and a brief difference between the pair breaks the overlap estimate's premise.

### Settle ambiguous domain terms with the owner at setup (entity disambiguation)
- source: data/data-context-extractor `<B>/data/skills/data-context-extractor/SKILL.md:63-64` — "**Entity Disambiguation (Critical)**" / "\"When people here say 'user' or 'customer', what exactly do they mean? Are there different types?\""; `references/domain-template.md:22-26` — "**\"[AMBIGUOUS_TERM]\" can mean:**" ... "Always clarify which one before querying."
- method: During setup research, list the domain terms the items use with more than one possible referent (for example "user" vs "account", "request" vs "call"), and ask the owner for each one's meaning up front; the answers go into `classes.md` as accepted-by-ruling definitions, so readers judge with them from round 1.
- where in loop-to-zero: references/setup.md § Predefining names (163-166) maps only the unit and item words; reading-classes.md U11 ambiguity class fixes ambiguous items after the fact; owner-asks.md:117 "When a definition keeps flipping, take it to the owner" is reactive. Nothing found for: glossary, disambiguation, term meanings at setup.
- value: medium — `rule-meaning` pending items and flipping definitions each cost rounds; a proactive glossary prevents some of them before round 1.

### Ask the owner for known traps as a class source
- source: data/data-context-extractor `<B>/data/skills/data-context-extractor/SKILL.md:95-96` — "**Common Gotchas**" / "\"What mistakes do new analysts typically make with this data?\""
- method: Add a question to the setup research: "What do newcomers usually get wrong about this evidence or these documents?" Each answer is a candidate class (or reader guidance about what to bound), tested and replayed like the others.
- where in loop-to-zero: references/setup.md § Classes (the bar) line 168, "They come from five sources": claim shapes, evidence kinds, past errors (commits, reviews, audits, reports), rules and rulings, the starter set. All five are artifacts; none asks the owner. Nothing found for: interview, known gotcha, newcomer, ask the owner what goes wrong.
- value: low — useful where the history is thin (a new project), but the "past errors" source already covers most of it where history exists.

### Give each defect an impact line (who it affects, what it blocks)
- source: design/accessibility-review `<B>/design/skills/accessibility-review/SKILL.md:109` — "1. **[Critical fix]** — Affects [who] and blocks [what]"; severity column at :74
- method: Add an `Impact:` (and an optional severity) line to each `S/defects.md` entry, so the owner can rank which defects to fix, close by decision or ticket first. It does not touch the zero rule, which treats every wrong alike.
- where in loop-to-zero: references/debugging.md § The entry (65-80): fields Expected, Actual, Reproduction, Isolation, Root cause, Proposed fix (with side effects), Prevention, Outside reports, Ticket, Closed. No impact or severity field. owner-asks.md item 1 ("What it affects, in plain words") covers asks, not defect entries. Nothing found for: severity, critical, priority.
- value: low — helps owner triage when several defects are open; otherwise covered in spirit by the ask format.

### Ask readers to separate the observation from the judgment in notes
- source: design/research-synthesis `<B>/design/skills/research-synthesis/SKILL.md:91` — "**Separate observations from interpretations** — \"5 of 8 users clicked the wrong button\" is an observation. \"The button placement is confusing\" is an interpretation."
- method: Have the note state what the cited line says (the observation) apart from why that makes the item ok or wrong (the judgment). The writer's confirm checks and spot-checks can then test the observation mechanically against the render log before weighing the judgment, and identical-note detection (above) gets more signal.
- where in loop-to-zero: references/briefs.md:100 note format: `"note":"<why; a wrong names the refuting file:line at the pin>"`. A wrong must name a refuter; an ok's note has no required content. Nothing found for: observation vs judgment, quote of the cited line in the note.
- value: low — modest gain in verifiability; slightly longer notes cost reader tokens.

### Cross-check repeated values across items
- source: data/validate-data `<B>/data/skills/validate-data/SKILL.md:275` — "**Calculate the same metric two different ways** and verify they match"; :155 — "**Cross-reference**: Key numbers match other known sources"
- method: Where several items state the same value (a timeout, a count, a limit), extract them by subject and flag disagreement between items as a candidate wrong, independent of any reader.
- where in loop-to-zero: sibling sweeps by "subject, cited range or named file" (SKILL.md:67) find related items after a confirmed wrong; lessons.md:296 records readers reporting two items as a contradiction. No proactive cross-item value check before reading. Partly covered.
- value: low — sibling sweeps catch most of this after the first seed; a pre-read check mainly adds a "found by none" source.

### Stamp each owner report with its "as of" pin and snapshot
- source: data/build-dashboard `<B>/data/skills/build-dashboard/SKILL.md:168` — "<span>Data as of: <span id=\"data-date\"></span></span>"; data/data-visualization `<B>/data/skills/data-visualization/SKILL.md:255` — "**Subtitle adds context**: Date range, filters applied, data source"; data/validate-data `<B>/data/skills/validate-data/SKILL.md:136` — "Noted the \"as of\" date."
- method: Open each round report with the pin, the snapshot hash and the bar state (open, or frozen at round R) it was measured against, so a report read later or forwarded can't be mistaken for one at another pin.
- where in loop-to-zero: references/state-template.md loop.md skeleton carries "Evidence: ... pinned at <tag/commit/dated export>" and "Bar: <open | frozen ...>"; owner-asks.md § Reporting a round (items 1-8) doesn't list the pin or snapshot. Mostly covered via loop.md.
- value: low — matters only when the pin moves or reports are passed on.

## Reviewed, nothing new
- data/analyze — its validation checks (row-count sanity, subtotals sum, nulls) are already covered by `record`'s coverage checks ("Check both ways", briefs.md § Verifying); the rest is a SQL workflow.
- data/create-viz — chart workflow; "title states the insight" is generic reporting advice, and owner-asks.md already fixes the report order.
- data/sql-queries — dialect reference and SQL patterns only; domain-specific, no transferable method.
- data/write-query — SQL authoring workflow; "idempotent (safe to re-run)" is already the norm for `ltz` steps (queue on disk, resumable).
- design/design-critique — severity and "acknowledge what works" are covered by or folded into the defect-impact finding; "match the stage" has no loop analogue.
- design/design-handoff — "Don't assume ... Specify everything" and "Describe the why" are already covered by the paste-ready `S/HANDOFF.md` (state-template.md:55) and the lessons' Why field.
- design/design-system — component audit/document/extend templates; its "Score: X/100" completeness is a domain scoring with no fit to a zero rule.
- design/user-research — research-method table and interview structure; affinity mapping is already done by the retro's grouping by origin and class.
- design/ux-copy — "Make the action clear" / "Describe consequences" for confirmations are already covered by owner-asks.md items 1-4 (plain-words effect, recommendation, costed options).
- (data/build-dashboard, data/data-visualization, data/explore-data, data/validate-data, data/statistical-analysis, data/data-context-extractor, design/accessibility-review, design/research-synthesis each appear as sources above. data-context-extractor's references/*.md and scripts/package_data_skill.py were read in full; the other skills have no files besides SKILL.md.)

---

# Batch 3 (engineering enterprise-search finance human-resources )

# Part 3: methods from engineering, enterprise-search, finance and human-resources skills

Base dir for sources: `~/.claude/plugins/synced/<marketplace>/`.
Every skill in list3 is a single SKILL.md (no references/ folders and no other files; checked with `find <plugin>/skills -type f`).
Paths below are relative to that base. loop-to-zero paths are relative to `~\code\loop-to-zero\skills\loop-to-zero\`.

### Check how accurate the remaining-wrongs estimate is, and track its bias
- source: finance/variance-analysis skills/variance-analysis/SKILL.md:243 — "Track how accurate forecasts are over time to improve planning:"; :246 — "Forecast Accuracy = 1 - |Actual - Forecast| / |Actual|"; :260 — "Track how variances evolve over the year to identify systematic bias:"; :262 — "**Consistently favorable:** Budget may be too conservative (sandbagging)". Also finance/journal-entry-prep skills/journal-entry-prep/SKILL.md:33 — "Track actual vs accrual to refine future estimates".
- method: Record each round's remaining-wrongs estimate per unit. Compare it later with what was actually found (next round's confirmed wrongs plus wrongs found by none plus later adjustments to that pass's count), keep an accuracy/MAPE row in loop.md's trend, and once the bias has a consistent direction, report a correction factor alongside the raw estimate.
- where in loop-to-zero: references/round.md § The remaining-wrongs estimate (226-233) says "The readers share a brief, so they are not independent, and the estimate runs low", but the size of "low" is never measured. references/learning.md § The retro step 3 (110) only reports the estimate. The 25% trigger (learning.md:22, "An estimate is off by more than 25% of the measured value") is about cost and is checked in retro step 5, "the estimate against the actual (`ltz cost`)". Nothing found for: calibrat|accuracy|predicted|estimate.*actual applied to wrongs.
- value: high. The estimate is the skill's answer to "when will it end?". Measuring how far it runs low turns a qualitative caveat into a number the owner can use. lessons.md:105-110 already holds the raw data (two reads predicted about 7, later reads added 21).

### Spot-check selection: seed it, record it, and spread it across the range
- source: finance/audit-support skills/audit-support/SKILL.md:107 — "2. Ensure selections are spread across the full population period"; :108 — "3. Avoid unconscious bias (don't always pick items at the top, round numbers, etc.)"; :96 — "3. Document rationale for each targeted selection". finance/sox-testing skills/sox-testing/SKILL.md:84 — "- Ensure coverage across the full period"; :100-102 — "Population: [Count] items, $[Total value]" / "Sample size: [N] items" / "Selection method: [Random/Systematic/Targeted]".
- method: Choose the 5 random spot-checks from a seeded RNG (or systematic selection with a random start), stratified across the reader's early, middle and late windows. Write a per-round record (`r<R>/spotcheck.json`: population, seed, method, each item with its basis "random" or "weighted: fixed in rN / class Cx", result). Give the random picks a separate miss rate so the late-window result directly tests whether a reader got tired on its oks.
- where in loop-to-zero: references/round.md § 3 Verify (50): "spot-check 10 ok items per reader: 5 at random, and 5 weighted toward items an earlier fix changed and toward classes that produced wrongs". There is no selector tool: grep of scripts/ltz.mjs for spot|random|seed finds only `canary plan ... --seed N` (183-187). The r<R>/ file list in state-template.md (70-79) has no spot-check record. The fatigue checks (early-versus-late depth from render logs, canary misses in late windows: round.md § Canaries) don't cover oks.
- value: high. "At random" chosen by hand is haphazard selection, with exactly the bias the source warns about. An unrecorded sample also can't be re-checked by a later session or an auditor.

### Take a bigger spot-check sample when the risk is higher
- source: finance/audit-support skills/audit-support/SKILL.md:139 — "**Factors increasing sample size:**"; :141 — "- Control is the sole control addressing a significant risk (no redundancy)"; :142 — "- Prior period control deficiency identified"; :143 — "- New control (not tested in prior periods)". finance/sox-testing skills/sox-testing/SKILL.md:75 — "- **Prior year results:** Controls with prior deficiencies need larger samples".
- method: Keep 10 per reader as the floor, and raise it under stated conditions:
  - a spot-check overturns one of a reader's oks, so that reader's sample is extended before its pass is accepted;
  - a new reader model, or a changed brief or bar this round;
  - solo mode, where there is no second reader;
  - a chunk whose reader missed a canary.
- where in loop-to-zero: round.md:50 and briefs.md:218 fix the size at 10 per reader. A spot-check that overturns an ok only triggers a lesson (learning.md:12, "the brief or the classes are unclear"); it does not extend the sample or force a supplementary read. A canary miss does force a supplementary read (round.md § Canaries). Nothing found for: more spot|extra spot|spot-checks grow|larger sample.
- value: medium. It ties the effort to the evidence that a reader's oks can't be trusted, which is the main way a false zero gets through.

### Track how long open owner questions, defects and leads have been open, and escalate by age
- source: finance/reconciliation skills/reconciliation/SKILL.md:128-133 — "| 0-30 days | Current | Monitor ..." through "| 90+ days | Stale | Escalate to management ..."; :172 — "5. **Follow-through:** Track open items to resolution — do not just carry items forward indefinitely"; :137 aging report columns "Date Originated | Age (Days) | Category | Status | Owner".
- method: Give each line in owner-questions.md, defects.md and closed-unit-leads.txt an "opened (round, date)" field. List them in the round report oldest first, showing their age in rounds and the number of items blocked. Re-raise any that pass an agreed age (for example 2 rounds, or blocking a close) at the top of the report instead of in step 7's list.
- where in loop-to-zero: references/owner-asks.md § intro (14-16) lists each ask "with the unit and item ids that wait on it, and add its decision id once it is answered". Reporting step 7 (155) lists "every open owner question" with no age or order. round.md § 8 ("Blocked only by what a re-read can't clear") waits on the owner, but nothing counts how long. Nothing found for: (open|asked) since|how long|oldest|reminder|chase.
- value: medium. A loop that is only blocked by owner questions shows the same list every round, and an aged, ordered list makes the blocker visible.

### Grade confirmed wrongs and defects by severity, for the owner's decisions only
- source: finance/audit-support skills/audit-support/SKILL.md:229-232 — "**Evaluation factors:**" / "What is the likelihood..." / "What is the magnitude of the potential misstatement?" / "Is there a compensating control that mitigates the deficiency?"; :253 — "- Deficiency in a pervasive control (entity-level, IT general control) affecting multiple processes"; :257 — "Individual deficiencies that are not significant individually may be significant in combination:". engineering/incident-response skills/incident-response/SKILL.md:60-65 (SEV1-SEV4 table, "| SEV1 | Service down, all users affected | Immediate, all-hands |").
- method: Keep the zero rule, where every wrong counts. Add an optional impact grade to each confirmed wrong and defect: likelihood that a reader of the doc acts on it, magnitude, and whether the wrong is pervasive (in a ruling or rule many items inherit) or isolated. Lead the report's wrongs and defects with the high grades. Show the grade in every override, stopping-rule and known-wrongs question, so the owner sees what closing over them risks.
- where in loop-to-zero: nothing found for severity|sev[0-9]|priorit|high-impact|materia anywhere. owner-asks.md § intro step 1 asks "What it affects, in plain words" for each ask. The defects.md entry form (debugging.md § The entry) has no impact field. SKILL.md "Owner overrides" lists the known wrongs by item only.
- value: medium. Owner overrides and stopping rules are exactly where the owner weighs risk, and right now every wrong looks equal.

### Bridge each round's count to the previous one
- source: finance/variance-analysis skills/variance-analysis/SKILL.md:174 — "Verification:    Starting value + Sum of all drivers = Ending value"; :159 — "- Focusing only on the largest driver and ignoring offsetting items".
- method: In the retro, show the change from round R-1's count to round R's as a bridge whose parts must add up:
  - minus the wrongs fixed and not re-found;
  - plus the wrongs in your own edits;
  - plus the new class or bar movement;
  - plus old text newly seen (earlier-miss);
  - plus the missing rulings.

  Report the offsetting parts even when the net change looks good, for example "7 → 4: −6 fixed, +2 own edits, +1 earlier-miss".
- where in loop-to-zero: references/learning.md § The retro step 1 sorts this round's wrongs by origin, and step 2 (109) says "If the count rose, say whether the bar moved (old text, newly seen) or your edits regressed". owner-asks.md:162 says the same. SKILL.md red flag 229: "Check the origins first; usually the bar moved". Only a rise is explained, and nothing reconciles the two counts.
- value: low. The origin axis already does most of this. A bridge adds the check that the parts add up, and catches a fall that hides own-edit regressions.

### Measure wrongs found after a unit closes, to show how reliable a zero is
- source: finance/close-management skills/close-management/SKILL.md:169 — "| # of restatements / corrections | Errors found after close | Zero |"; :165 — "| Close duration | Business days from period end to hard close | Reduce over time |".
- method: Keep a per-loop metric: closed units later found to hold a wrong (leads confirmed at the final targeted check, or a later outside audit), as a rate per unit closed and per item. Report it with each close, so the owner learns how often a zero has been a false zero. The rate is also data for the estimate-calibration finding above.
- where in loop-to-zero: closed-leads-pending, adjusted closing counts (`0 (adj n, ...)`, round.md § 8), and owner-asks.md:152, "leads in closed units", record each case, but nothing sums them into a rate. Nothing found for: escape|false zero|leads per.
- value: low. The data already exists, so this only adds a summary line, but it is the most direct evidence of whether the close rule works.

### Keep different claims on the same item separate when merging readers' wrongs
- source: enterprise-search/knowledge-synthesis skills/knowledge-synthesis/SKILL.md:63-66 — "### What NOT to Deduplicate" / "Keep as separate items when:" / "- The same topic is discussed but with different conclusions"; :163 — "Always surface conflicts rather than silently picking one version."
- method: When two readers (or a reader and the fix checker) mark the same id wrong for different claims or refuters, confirm each claim on its own. Confirming one must not close the other unexamined. List each claim's refuter and class in the note.
- where in loop-to-zero: references/fixing.md says "List every refuting line in the `confirmed.json` note" (71), "Name every class that applies; an item can carry several" (74), and "Partly true items count as one wrong" (77). Nothing explicitly makes the writer judge a second reader's different claim on an id it has already confirmed. Nothing found for: both readers mark|each reader's reason|different refuter.
- value: low. It is mostly implied by "every refuting line", and the rule would make it explicit at the union step.

## Reviewed, nothing new
- engineering/architecture: ADR options with pros and cons, and Superseded status. Already covered by owner-asks.md (every real option with its honest case, "amend <ruling>") and by supersession in owner-asks.md:66 and lessons.md:8.
- engineering/code-review: review-dimension checklist and verdict format. A domain checklist with no method the loop lacks (its classes and lenses are richer).
- engineering/debug: reproduce/isolate/diagnose/fix. Already adopted as references/debugging.md, which cites the engineering plugin's connector categories.
- engineering/deploy-checklist: "Decide when to roll back before you deploy" (line 78). Already covered by the escalation trigger agreed up front (setup.md:265) and owner-approved stopping rules.
- engineering/documentation: generic doc-type outlines. No transferable method.
- engineering/incident-response: postmortem (5 whys, went well/poorly, action items) is covered by the retro, the lesson format (Why: root cause, ✓/✗) and debugging.md's root-cause step. "Start writing immediately" is covered by "at least n (reading incomplete)". "When the next update is" conflicts with the rule against date estimates (owner-asks.md). Its severity table is used in the severity finding above.
- engineering/standup: yesterday/today/blockers format. Already covered by the round report order and HANDOFF.md.
- engineering/system-design: generic design framework. No transferable method.
- engineering/tech-debt: (Impact+Risk)x(6-Effort) prioritization. The loop fixes every wrong, so ordering fixes isn't needed. Ordering the owner's questions is folded into the aging finding.
- engineering/testing-strategy: test pyramid. No transferable method (the loop's own tests are already required after edits).
- enterprise-search/digest: grouping by topic, action items first, and noting failed or rate-limited sources and the covered range. Already covered by the report order and queue-and-outages.md (resume positions, limits).
- enterprise-search/search: parallel sub-queries and partial-results notes. Already covered by the queue and by blindSpots/scopeNote on searches.
- enterprise-search/search-strategy: query variants ("k8s", "cluster") and ambiguity handling. Already covered by fixing.md:97 (phrasing variants), lessons.md:206 and owner-asks.md's one narrowing question. Its broadening order doesn't apply to bounded sweeps.
- enterprise-search/source-management: rate-limit handling and "include which sources were searched". Already covered by queue-and-outages.md ("wait, never fail") and the blindSpots/scopeNote requirement.
- finance/financial-statements: materiality thresholds and variance decomposition. Its decomposition overlaps variance-analysis, which is cited above. Fixed materiality thresholds conflict with the zero rule, apart from the severity finding.
- finance/journal-entry: JE review checklist. Domain-only. The "consistent with prior period" check is already the history check (fixing.md check 3).
- finance/close-management: also the source of the escape-metric finding. Its dependency levels, critical path and retro questions are already covered by the fixed round order and the retro.
- finance/journal-entry-prep: also cited in the estimate finding. Its common-errors list (wrong sign, round numbers, stale accruals) is domain-specific. The loop's starter classes (C2 value, etc.) already cover the general kinds.
- finance/reconciliation: also the source of the aging finding. "Segregation" (171) is already covered (lessons.md:98, "One reader who also fixes settles at a false low"). "Unreconciled difference: Cannot close" is the zero rule. "Growing trend 3+ consecutive periods" is the escalation trigger.
- finance/sox-testing: also cited in the two spot-check findings. IPE-style checks of the data a reviewer relies on are already covered ("grep | head" red flag, coverage computed from files, `ltz searches` re-runs, extract tests).
- finance/audit-support: also the source of the sampling and severity findings. Its evidence standards (no "per discussion" without documents) are already covered by "Every wrong names a refuting file:line". Remediation validation (re-test) is the fix checker.
- finance/variance-analysis: also the source of the estimate and bridge findings.
- human-resources/comp-analysis: domain-only (comp benchmarks). "Note data freshness" is already covered by the pin.
- human-resources/draft-offer: domain-only template. No transferable method.
- human-resources/interview-prep: structured same-questions-for-all plus a scored rubric. Already covered by one shared brief, classes with definitions, and canary scoring.
- human-resources/onboarding: checklist template. Already covered by HANDOFF.md and the setup checklist.
- human-resources/org-planning: headcount benchmarks. No transferable method.
- human-resources/people-report: report with a methodology/caveats section. Already covered (the estimate is always reported "with its caveat"; the report order).
- human-resources/performance-review: calibration against a rating distribution, plus discussion points for borderline cases. Already covered by per-reader canary and false-alarm scores and by boundaries.md near-misses.
- human-resources/policy-lookup: "Quote the specific policy language" / "If no policy is found, say so". Already covered (rules quoted word for word in briefs.md:65-66, boundary-silent → owner).
- human-resources/recruiting-pipeline: stage conversion metrics. Already covered by measure.json (found by both/one/none, false alarms) and the queue states.

---

# Batch 4 (legal marketing )

# Part 4: legal + marketing skills (17 skills)

All 17 dirs contain only SKILL.md (no references/ or other files). Paths below are relative to
`~/.claude/plugins/synced/<marketplace>/`.

### Report the remaining-wrongs estimate as a range, flagged low-confidence when the overlap is small
- source: marketing/performance-report skills/performance-report/SKILL.md:307 — "Forecasts based on fewer than 12 data points should be flagged as low confidence"; :309 — "Always present forecasts as ranges, not exact numbers"; :303 — "Scenario modeling: create best case, expected case, and worst case projections"
- method: Never give a forecast as a single number. Give a range (best, expected, worst), and mark it low confidence when it rests on too little data.
- where in loop-to-zero: references/round.md § "The remaining-wrongs estimate" (:226-233). It gives the Chapman point estimate N = (n1+1)(n2+1)/(m+1) − 1 and one caveat: readers share a brief, so the estimate runs low. owner-asks.md § "Reporting a round" item 3 says "the remaining-wrongs estimate, with its caveat". Searched for: range|interval|confidence|small overlap|m <. None found. Nothing asks for an interval or a small-m flag, although Chapman is unstable when m (the overlap) is small (m = 0 or 1 is common in late rounds).
- value: medium. It is the owner's main "how much is left" number. A bare point estimate from m = 0–2 overstates precision, while a range from Chapman's variance formula, or a "low confidence: m < k" tag, is cheap to add in `ltz record`.

### State the keep/drop criterion and sample size before trying a method change
- source: marketing/performance-report skills/performance-report/SKILL.md:365 — "Define the success metric before launching the test"; :366 — "Calculate required sample size before starting (do not end tests early)"; :368 — "Document all tests and results, regardless of outcome"
- method: Before a trial starts, write down the metric that decides it and how much data it needs. Don't stop early or judge afterwards, and record the result whichever way it comes out.
- where in loop-to-zero: references/owner-asks.md § "Asking about stopping or changing method" (:97-121) says to bring "a concrete change of method" with the counts and cost per pass. learning.md § "Replay" pre-tests rules on history. Searched for: trial|experiment|pilot|a/b|success metric|decided in advance. None found. Nothing makes a live method change (3 readers per chunk, shorter chunks, a new brief wording, a stronger reviewer) carry a stated success measure, such as "canary catch rate ≥ X" or "found-by-one count falls", or the number of chunks or rounds before it is judged. So a change can be kept or dropped on one noisy round.
- value: medium. Method changes are owner decisions made on small samples (one round, a few chunks). Stating the criterion in advance guards against post-hoc rationalising and fits the P-n decision record.

### Give each class an "is not" line and an ok example, not only wrong examples
- source: marketing/brand-review skills/brand-review/SKILL.md:97 — "each defined with what it means in practice, what it does NOT mean (to prevent misinterpretation), and an example"; :122 — "**We are not**: [common misinterpretation to avoid]"; :124 — "**This does NOT sound like**: [example sentence violating the attribute]"
- method: Define each category by what it means, its most common misreading, and paired positive and negative examples, so reviewers don't over-apply it.
- where in loop-to-zero: references/setup.md § "Each class records" (:210-219) lists the name, definition, what makes it wrong, "2 to 3 example item ids", patterns, fix form, source and replay (with its false hits). Accepted forms (reading-classes.md:58-60) cover source vocabulary only. Near-misses go to `boundaries.md`, which readers never see. Searched for: counter-example|ok example|not wrong when|looks like ... but. None found. The class record has no "not this class" line, such as "a bounded universal ('outside tests, only X') is not U4", for readers to calibrate against.
- value: medium. Reader false alarms are a tracked cost (the retro counts them, and confirm check 3 withdraws them). One "is not" line per class, taken from replay false hits or boundaries.md, is the cheapest fix the "brief or classes are unclear" trigger could make. It must stay a bound, not a new fact, to respect the "Reader guidance" rule.

### Rate open defects and known wrongs by severity × likelihood, with re-assessment triggers
- source: legal/legal-risk-assessment skills/legal-risk-assessment/SKILL.md:40 — "**Risk Score = Severity x Likelihood**"; :96 — "**Escalate if conditions change**: Define trigger events that would elevate the risk level"; :199 — "### 8. Residual Risk"; :203 — "trigger events for re-assessment"
- method: Score each open risk on two 1-5 scales and give it a colour band. Record the risk left after mitigation, and name the events that would trigger a re-assessment.
- where in loop-to-zero: references/debugging.md § "The entry" (:65-80) gives a defect Expected/Actual/Reproduction/Isolation/Root cause/Proposed fix/Prevention, but no severity or priority. owner-asks.md:107 asks stopping questions to carry "how much each kind matters" and "what later safeguard would catch each kind". Searched for: severity|likelihood|residual|priority|blast|harm. The only hit is lessons.md:376 ("the impact"). There is no scale, no ordering of defects or known wrongs for the owner, and no "re-raise if X" trigger on an accepted `closed-known-wrongs` item or open defect.
- value: low. The zero rule rightly treats all wrongs alike, but the owner's queue of defects, `outsideBar` items and known wrongs is unordered. A two-axis tag would order report item 7 and make "how much each kind matters" concrete.

### Give lessons a last-confirmed date and a retirement path
- source: legal/legal-response skills/legal-response/SKILL.md:342 — "**Last reviewed date**: When the template was last verified for accuracy"; :350 — "**Feedback**: Track when templates are modified during use to identify improvement opportunities"; :352 — "**Retirement**: Archive templates that are no longer applicable"
- method: Reusable guidance carries a last-verified date. Edits made during use feed improvements, and entries that no longer apply are archived rather than kept forever.
- where in loop-to-zero: references/learning.md § "Lesson format" (:39-46) has title/Rule/Why/Replay/Change/Seen. § "Promotion" (:136-150) only adds or merges. Searched for: retire|prune|obsolete|stale|demot|last reviewed|last seen. Retirement exists only for regression patterns (fixing.md:246) and discovery patterns (setup.md:121). There is no date on a lesson, no "superseded by a mechanical check" state, and no demotion of a global lesson whose Change made it moot. Writer edits to a reader brief between rounds are also not logged as signals that briefs.md should change.
- value: low. The global lessons.md (~380 lines, read at setup and every round) only grows. A "Last seen: date" field and a "retired: now enforced by <tool>" state would keep the every-round read short.

### Check items against each other, not only against the evidence
- source: legal/review-contract skills/review-contract/SKILL.md:67 — "**Read the entire contract** before flagging issues. Clauses interact with each other (e.g., an uncapped indemnity may be partially mitigated by a broad limitation of liability)."
- method: Read the whole document before judging any part, because one clause can qualify or contradict another.
- where in loop-to-zero: references/reading-classes.md § "The three lenses" (:11-19). "Whole context" means the evidence's enclosing function or section, not the other items. lessons.md:206 ("sweep by subject, cited range, phrasing variants and named file") catches siblings only after a fix. Searched for: interact|contradict|other items|cross-item|consisten|terminolog|synonym. No starter class or lens covers two items in one unit that state incompatible things, or that use different names for one thing, when they sit in different 16-item windows.
- value: low. If two items contradict, at least one is usually refuted by the evidence anyway, so full-depth reading should catch it. The gain is mainly earlier detection, plus the "same concept, two names" case (brand-review :70, "no switching between synonyms for the same concept"), which evidence-checking alone won't flag.

## Reviewed, nothing new
- legal/brief: listing sources checked and not available, plus gaps, is already covered by loop-to-zero's coverage-from-files and re-run rules (briefs.md:176-189). The rest is a domain workflow.
- legal/compliance-check: Met / Not Met / Unknown status and the escalation criteria are covered by `pending-owner` reasons and the escalation trigger. An unrendered evidence range is re-run rather than given an "unknown" verdict. The rest is regulatory reference.
- legal/meeting-briefing: one owner per action item, deadlines and preparation gaps. The writer is the sole actor, and owner questions are tracked in owner-questions.md. No transferable method.
- legal/signature-request: the pre-signature checklist is a gate, which loop-to-zero already has (diffcheck, gates and hooks).
- legal/triage-nda: classifying a document that is "not actually an NDA" maps to item type, which is already per-item (setup.md:290-292). Reporting "defaults applied" is covered by "Recommend; never default". GREEN-needs-all is domain-specific.
- legal/vendor-check: name variants are covered by C5 names and the alias/re-export search rule (fixing.md:208). Listing sources checked or unavailable is covered by coverage.
- marketing/campaign-plan: the contingency and 20% open-slot reserve add little, because loop-to-zero refuses total-time estimates and reports cost per round. The rest is domain planning.
- marketing/competitive-brief: dating the research for freshness is covered by the pin. Battlecard maintenance is domain-specific.
- marketing/content-creation: domain-only copywriting templates, with no transferable method.
- marketing/draft-content: domain-only drafting workflow. Disclosing that brand voice was applied is covered by owner-approved bar disclosure.
- marketing/email-sequence: exit, re-entry and suppression rules for flows are already covered by unit close states, the final targeted check and cross-unit edit logging.
- marketing/seo-audit: the Critical/High/Medium/Low severity and quick-win vs strategic split are already captured by the severity finding above (legal-risk-assessment). Content freshness is covered by the pin.

---

# Batch 5 (operations product-management productivity )

# Part 5 findings (operations, product-management, productivity: 21 skills)

All skill dirs in list5 contain only SKILL.md (no references/ or other files). `productivity/skills/dashboard.html` sits beside the skill dirs, not inside one, so it was not reviewed.

### Lead the round report with a headline and the asks, not the trend
- source: product-management/stakeholder-update SKILL.md:351 — "If there is bad news, lead with it. Do not hide it after good news."; also :117 — "Asks must be specific: \"Decision on X by Friday\" not \"support needed.\""; operations/status-report SKILL.md:75 — "**Lead with the headline** — Busy leaders read the first 3 lines. Make them count."
- method: Open each owner report with a one- or two-line headline (state of the unit, plus any bad news) and a "Decisions needed from you" block. Give each decision its options, the recommendation and a need-by point (for example "before round R+1 snapshot"). Put the detail sections after that.
- where in loop-to-zero: references/owner-asks.md § "Reporting a round". The order puts "1. **The trend**" first and open owner questions at item "7. **Open questions and defects**". A grep for headline|tl;dr|lead with|bad news|first line found no rule for a headline or for putting asks first, and no need-by point on asks (the § "Asking the owner" ask format has no deadline field).
- value: high. The owner's open decisions are what block closes ("Blocked only by what a re-read can't clear"), and right now they sit at item 7 of 8.

### Decision log entries record the question, the options and the rejected alternatives (ADR shape)
- source: product-management/stakeholder-update SKILL.md:261-263 — "## Alternatives Considered" / "What other options were evaluated?" / "For each: what was it, why was it rejected?"; :247 — "[Proposed / Accepted / Deprecated / Superseded by ADR-XXX]"; :276 — "Document the context generously — future readers will not have today's context"
- method: Each R-n/P-n entry keeps the question as it was asked, the options offered (with the recommendation), the owner's verbatim answer, the context that prompted it, and a status line (active / amended on date / superseded by R-m). With these, a later "amend <ruling>?" ask can quote the original reason and the alternatives that were turned down.
- where in loop-to-zero: references/setup.md § "The decision log" says only "Each ruling is recorded verbatim, dated and numbered". owner-asks.md § "Asking the owner" requires "amend <ruling>" options to carry "the ruling's original reason", but nothing says where that reason is stored. owner-asks.md § "Recording answers well" covers labelled interpretations. Amendments are "a dated amendment on that id". A grep for superseded|alternatives considered|rationale found supersession only for lessons (lessons.md:8) and handoffs.
- value: medium. It makes the "amend <ruling>" option (with the original reason) answerable from the log, not from memory.

### Cold-test the handoff: an unfamiliar session follows it once
- source: operations/runbook SKILL.md:87 — "**Test the runbook** — Have someone unfamiliar with the process follow it. Fix where they get stuck."; :40-41 — "**Expected result:** [What should happen]" / "**If it fails:** [What to do]"
- method: At setup (and after any change to HANDOFF.md's structure), have a fresh session follow S/HANDOFF.md only up to its first state-changing step and report where it got stuck or guessed, then fix the handoff. Also give each command in the handoff's resume steps an expected result and an if-it-fails line.
- where in loop-to-zero: references/state-template.md:55-56 defines HANDOFF.md as a "paste-ready prompt" that is updated after every round. round.md step 7 updates it. A grep for unfamiliar|dry run|test the handoff|handoff.*(test|cold|fresh) found nothing: the handoff is never checked by a session that lacks the writer's context.
- value: medium. Context resets are routine (solo mode, limits, account changes), and a handoff that can't be followed silently loses state.

### Report the remaining-wrongs estimate as a range, not a point
- source: product-management/synthesize-research SKILL.md:297 — "Use ranges rather than false precision: \"This affects 1,500-2,500 users monthly\" not \"This affects 2,137 users monthly\""; :294 — "Be transparent about assumptions and confidence levels"
- method: Report the Chapman estimate with an interval: its standard variance formula, or a low/high bracket. Then "when will it end" answers show the uncertainty, which is largest when the overlap m is small, as a number and not only as prose.
- where in loop-to-zero: references/round.md § "The remaining-wrongs estimate" gives the point formula "N = (n1+1)(n2+1)/(m+1) − 1" and a caveat that it "runs low". A grep for range|false precision|confidence|interval|upper bound found no interval.
- value: medium. A small m makes the point estimate unstable, and owners read a single number as precise.

### Break the trend down by class, not just by origin and finder
- source: product-management/metrics-review SKILL.md:385 — "Segment analysis often reveals that an aggregate metric masks important differences. A flat overall number might hide one segment growing and another shrinking."
- method: Add a per-class row to the round trend (wrongs per class per round). A class that stays flat or grows while the total falls is the one that needs a sharper wording, a reader-guidance note or a method change, before the escalation trigger fires on the total.
- where in loop-to-zero: owner-asks.md § "Reporting a round" splits wrongs "by origin" and "by who found them". learning.md § "Triggers" gives the escalation answer as "Take the owner the trend, the classes and the cost per pass", but the trend is not split by class. A grep for by class|per class|class.*trend found only the fix rule "One wording per class".
- value: medium. The total can fall while one class fails to converge, and that class is where the next method change belongs.

### Date the open owner questions and show how long each has waited
- source: productivity/task-management SKILL.md:80 — "Include \"since [date]\" for waiting items"; :73 — "Note how long each item has been waiting"; productivity/update SKILL.md:52 — "Tasks in Active for 30+ days"
- method: Each entry in S/owner-questions.md (and each held draft or pending-owner item) carries an asked-on date. The report's open-questions list shows its age in days or rounds and flags any that have waited past N rounds.
- where in loop-to-zero: state-template.md:42-44 describes owner-questions.md as holding "each ask made since (with the unit and item ids that wait on it), each with its decision id". There is no asked-on date and no age. A grep for asked on|date asked|open since|waiting since found nothing.
- value: low-medium. It is cheap, and it makes stalled closes visible. It pairs with the headline/asks-first finding above.

### Tier the global lessons: hot index plus full entries on demand, and demote stale ones
- source: productivity/memory-management SKILL.md:71 — "This tiered approach keeps CLAUDE.md lean (~100 lines) while supporting unlimited scale in memory/."; :298 — "When something goes stale, demote it to memory/ only"; :319-321 — "Project completed" / "Person no longer frequent contact" / "Term rarely used"
- method: Keep a short hot list of lesson titles and rules that are read every round. Keep full entries (Why, Seen, Replay) in a cold section that is read when a title matches the work at hand. Demote lessons that no retro has applied or broken in N rounds.
- where in loop-to-zero: lessons.md:1-8 says it is read "at setup, and at the start of every round", and its "Keeping it short" rule covers only merge and supersede. lessons.md is 24 KB. A grep for retire|demot|prune|obsolete|never fired found only regression-pattern retirement (fixing.md:246).
- value: low. It saves tokens per round. The risk is that a demoted lesson goes unread when it is needed, so it would need replay evidence first.

### Requirement items with unmeasurable words are their own wrong
- source: product-management/write-spec SKILL.md:220 — "Avoid ambiguous words: \"fast\", \"user-friendly\", \"intuitive\" — define what these mean concretely"; :219 — "Each criterion should be independently testable"
- method: For requirement-type items, a starter class (or reader-guidance note) for a requirement whose key term has no threshold or observable test ("fast", "secure", "robust", "promptly"). The evidence can't settle it either way, so it should go to the owner as a definition question, not get an ok/wrong guess.
- where in loop-to-zero: reading-classes.md "U11 ambiguity" covers an item "that can be read two ways ... which the evidence would judge differently". The C2 value class covers stated numbers. Nothing covers an untestable qualitative term. A grep for vague|ambiguous|testable|measurable found only U11.
- value: low. It is narrow, and only applies to loops with requirement items. U11 or `pending-owner` (rule-meaning) can already absorb most cases.

## Reviewed, nothing new
- operations/capacity-plan: the buffer below 100% and the scenario table ("Do nothing / Hire / Deprioritize") are already covered by "Start at 2, with the rest queued" (SKILL.md red flags) and owner-asks "Every real option" / "Always include the full-rigour option".
- operations/change-request: the rollback trigger, steps and verification are covered by fixing.md § "Reverting fixes caused by false wrongs" (step 4 runs the fix checker on reverts). "'Everyone' is not an impact assessment" is covered by owner-asks item 1 ("what users, the product, cost or time would notice").
- operations/compliance-tracking: the control and evidence inventory with "when evidence was last collected" is covered by the pin and the evidence boundary. The rest is a domain-only list of frameworks.
- operations/process-doc: an SOP/RACI template. The writer/reader/owner roles are already fixed in the Terms table. "Include the exceptions" is covered by fixing.md:215 (patching one exception per round).
- operations/process-optimization: the waste categories (waiting, rework, handoffs) are generic. Cost and waiting are covered by queue-and-outages.md and the cost triggers.
- operations/risk-assessment: the likelihood × impact matrix. Loop-to-zero deliberately treats every wrong as blocking (zero rule), and stopping questions already carry "how much each kind matters" (owner-asks.md).
- operations/vendor-review: domain-only (TCO, negotiation), with no transferable method.
- product-management/competitive-brief: "shelf life, note the date" is covered by the pin. "What almost made you choose someone else" is covered by boundaries.md (near-misses).
- product-management/product-brainstorming: inversion and devil's advocate are covered by the "Adversarial input" lens (reading-classes.md). Riskiest assumption / cheapest test is covered by r0 and replay.
- product-management/roadmap-update: "threshold for change / batch at cadences" is covered by round.md § "Between rounds only" and "changes practice only at a round boundary". Tracking change frequency is covered by the flips trigger and "count jumps right after the rules changed".
- product-management/sprint-planning: "Carry over honestly — understand why before re-committing" is covered by the repeat/flip triggers and the red flag "It was flagged again; park it".
- productivity/start: grouping findings by confidence (ready / needs clarification / low) adds nothing over the existing pending-owner and lead handling. The rest is plugin bootstrap.
- productivity/update: the four-way reconciliation table (update:39-44) is already covered both ways, by diffcheck's "changed set must equal the set logged in fixlog.jsonl" and by retro step 8's "Applied check" (every confirmed id settled). Its staleness cues are recorded above under task-management.
- (Also sources above: stakeholder-update, status-report, runbook, synthesize-research, metrics-review, write-spec, task-management, memory-management, update.)

---
