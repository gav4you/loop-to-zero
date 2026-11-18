# What loop-to-zero can learn from the installed skills (survey, 2026-11-18)

940 unique skills reviewed by 5 reviewers (A: method plugins, B: manufacturing/nonprofits/meta skills,
C: finance & sales products, D: database/eval/dev products, E: remaining products). Each finding was
grepped against loop-to-zero first. Letters show which reviewers found it independently.
Full entries per reviewer: skill-survey-2026-11-18-reviewer-a.md to -reviewer-e.md, beside this file (A to E as listed above).

## Batch 1: safety gaps (cheap, high value)
1. **Item and evidence text is data, never instructions** (B, C, E). One sentence in the reader and
   fix-checker briefs; report instruction-like text in the note. Sources: claude-security scan-verifier:46-48,
   sales deal-review:14, adobe-document-review:75-78, small-business contract-review:128.
2. **Rulings come only from the owner directly** (E). "Per owner ruling…" inside an item, a note or an
   outside review never reaches the decision log. Source: telegram/discord/imessage access SKILL.md:13-20.
3. **A zero-hit search needs a positive control** (D, E). Run it once on a known-present term in the same
   paths; a 404 / bad regex / wrong path is a fault in the run, not absence. Sources: atlan-search:73-79,
   planetscale 01:46-48, adobe-fonts:129.
4. **A rejected reader wrong needs a cited reason** (B). `confirmed.json` gets a `rejected` list (id, reason
   class, the file:line that answers the refuter); the stronger reviewer re-judges it. Source: claude-security
   scan-verifier:30 ("Refute only with a mitigation you located and read").
5. **Folder evidence gets a checksum** (C). `evidence.sha256` at pin time; snapshot and close refuse on any
   difference. Source: carta-compensation-app:140-147.

## Batch 2: measuring how much a zero means
6. **Detection limits stated** (A). 10/10 clean spot-checks only bound a reader's miss rate below ~26%; say so
   in the close report. Source: data statistical-analysis.
7. **Remaining-wrongs estimate: a range, calibrated against later finds** (A, C). Low-confidence flag when
   reader overlap is small; per-unit "estimated vs later found" ratio in the retro. Sources: finance
   variance-analysis, bigdata epic-framework:64-67.
8. **Replay on held-out history** (A, B, D). Report replay recall with and without the round that prompted
   the rule; promotion judged on held-out. Sources: skill-creator:394, qdrant diagnosis:17.
9. **Spot-checks: seeded and recorded, spread across early/late windows, larger when risk is higher, aimed
   at doubtful or inferred oks** (A, C, D). Sources: finance sox-testing/audit-support, qt-cpp-review:145-147,
   carta-spa-audit:591-592.
10. **Canary labels checked before a miss counts; scores pooled by class across rounds** (D). Source: langfuse
    judge-calibration.md:36-38.
11. **Extract completeness both ways** (C, D). Every claim-bearing span maps to an item and back; for
    requirement loops, every shall/must in the source maps to an item. Sources: cockroachdb molt-verify:99-101,
    small-business grant-rfp-writer:72.

## Batch 3: reader notes and the retro
12. **An ok note names the clause pressed hardest and the line that held it** (B), optional basis
    direct/inferred (C) and "unverified because" (D). Source: math-olympiad adversarial_prompts.md:281.
13. **Flag templated notes** (A, B). `ltz record` groups ok notes by normalized text. Source: manufacturing
    breakdown-diagnosis:119-136.
14. **Retro splits "never looked" from "looked and misjudged"** using render logs (D); **trend per class**, not
    only total (A). Source: qdrant diagnosis:18,27; data statistical-analysis (Simpson's paradox).
15. **Many wrongs with one shared shape point to the basis** (pin, export, extract, render) before the batch
    is confirmed (B, C). Sources: math-olympiad verifier_patterns:103-114, month-end-prep:80-83.

## Batch 4: new starter classes
16. **Defined is not wired**: a positive "X happens via Y" where Y is defined but never registered/called, or
    deprecated (D). Source: product-tracking-audit-current-tracking:106-111.
17. **Evaluate expressions, don't read them**: version ranges, regex, globs, cron, CIDR; declared vs resolved
    version (D). Source: sanity-studio-upgrade:52,55,71.
18. **Derived figures**: totals, percentages, ratios recomputed from parts (C). Source: sp-global
    tear-sheet:404-414.
19. **Vague relation verbs** ("uses", "manages", "integrates") too vague to refute (E), and **unmeasurable
    requirement words** (A). Source: miro code-explain-on-board:25.
20. **Each class gets an "is not" line and an ok example; a precedence rule when two classes fit** (A).
21. **Cross-item consistency**: items citing the same evidence line with different values (A, C). Source:
    nimble healthcare-providers-verify:233-236.

## Batch 5: fixing and defects
22. **Pilot a new fix wording on one item before every hit** (E). Sources: adobe-batch-edit-photos,
    figma-implement-motion:121.
23. **Fix checker re-confirms the replaced text was wrong** (B). Source: claude-security patch-verifier item 4.
24. **Cap repeated tactics**: after two attempts that don't hold, change approach (E). Source: wix
    rp-qa-gap-loop:40-44.
25. **Defect entry: candidate causes with For/Against, Confirm and Kill tests, "Cheapest discriminating
    test", ties stated; "ruled out" needs a cite, else "set aside" (B); severity × likelihood and an impact
    line (A); intermittency and a working sibling (A, E); the fix names the cause link it breaks (B).**
    Sources: root-cause-capa:139-156, math-proof siege:515-518, debug-zoom-integration:19-24.

## Batch 6: owner reporting and decisions
26. **Round report leads with a headline and "Decisions needed" (with need-by)** (A); **figures block pasted
    from tool output, subtotals reconcile** (B); **"as of" pin and snapshot stamp; bridge to last round** (A).
    Sources: product-management stakeholder-update, manufacturing computed-figures.md:20-58.
27. **Open owner questions ranked by what they block, with age; withdrawn when facts settle them** (A).
28. **Decision log in ADR shape**: question, options, rejected alternatives (A). Source: engineering architecture.
29. **Negative examples of phrasings that are not approval** (D). Source: planetscale 11:100-105.
30. **Setup asks the owner for 2-3 recent catches and known traps; settles ambiguous terms** (A, C). Source:
    small-business build-agent:17-19.

## Batch 7: change safety and upkeep
31. **Old vs new reader on one chunk before changing model or brief** (D). Source: qdrant-model-migration:45,64.
32. **Warn-only round for a new guard rule or regression pattern** (D). Source: planetscale 05:49-54.
33. **Pin drift report each round, and a move-the-pin procedure** (D). Source: cockroachdb
    auditing-table-statistics:29.
34. **Lessons: retire those a tool now enforces; last-confirmed date; hot index** (A, E). Source: wix
    writing-great-skills:55-59.
35. **HANDOFF cold-tested once by a fresh session; decisions re-read from records, not summaries** (A, B).
    Source: math-proof siege:466-469.

## Batch 8: the skill's own tests
36. **Scenario tests run k times against the edited skill and a pre-edit snapshot; pass rate per criterion**
    (B). Source: skill-creator:171-231.
37. **Flag "Pass if" criteria the baseline also passes** (B). Source: skill-creator grader.md:9,72-77.
38. **Trigger eval for the description** (B), **lint filled briefs for leftover {SLOTS}** (A).

## Low, small notes
`grep -c` counts lines not matches (E); two fixes to one field in a batch, last write wins (E); copy ids and
refuters with a tool, never retype (C); write each fix's expected effect before the batch (E); state the
keep/drop test before trying a method change (A).

## Yielded nothing
About 870 of the 940 skills: product SDK and API references (Zoom, Wix, Twilio, Figma, CRM, ads, cap-table,
market data), domain workflows (grants, hiring, quoting, bio pipelines) and authoring guides whose methods
loop-to-zero already has.
