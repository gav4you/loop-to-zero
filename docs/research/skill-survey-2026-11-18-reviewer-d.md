# Survey reviewer D: database, eval and dev-tool products

199 skills in 22 plugins: cockroachdb, qdrant-skills, planetscale, clickhouse, datadog, langfuse,
datarobot-agent-skills, buildkite, fastly-agent-toolkit, product-tracking-skills, vanta-mcp-plugin, atlan,
auth0, sanity-plugin, qt-development-skills, base44, valtown, desktop-commander, zapier, servicenow-sdk,
pdf-viewer and warmup. Skill paths are relative to each skill's folder; LTZ = `skills/loop-to-zero/`.

Counts: 12 findings (3 high, 3 medium-high, 4 medium, 1 low-medium, 1 low). 7 more methods were already
covered.

## 1. Check that a search works before trusting 0 hits (high)
- **Source:** atlan-search `SKILL.md:73-79`: "a wrong value fails silently — an empty result reads as 'nothing
  is tagged that way' ... if none matches, report which values *do* exist rather than answering zero."
  planetscale 01-readonly-inventory `SKILL.md:46-48`: "A 404 from an unverified path is a wrong path, not a
  finding". buildkite-api `SKILL.md:58`: 403/404 are "access or availability boundaries, not evidence".
- **Where in LTZ:** `references/fixing.md`, "Searches that back a bound", and `references/reading-classes.md`,
  "The search rule", cover cut-off output and aliases, not a search that cannot match. `diffcheck` re-runs a
  broken search just as broken.

## 2. Test replayed rules on history they weren't written from (high)
- **Source:** qdrant diagnosis `SKILL.md:17`: "evaluate the final choice on held-out queries. A gain that
  doesn't survive the held-out evaluation isn't reliable evidence". Also relevance-feedback `SKILL.md:50`.
- **Where in LTZ:** `references/learning.md`, "Replay" and "Promotion".

## 3. Extract completeness in both directions (high)
- **Source:** cockroachdb molt-verify `SKILL.md:99-101` (missing / extraneous / mismatch); desktop-commander
  knowledge-base `SKILL.md:173-176`; product-tracking-audit-current-tracking `SKILL.md:176` ("A missed event is
  a wrong census").
- **Where in LTZ:** setup.md step 4 tests the extract for unparseable cites, and `scripts/lib/coverage.mjs`
  checks readers against `list.json`. Nothing checks the source against the items.

## 4. Check canary labels; pool canary scores by class (medium-high)
- **Source:** langfuse `references/judge-calibration.md:36,38` ("acceptable in every category"; "group those
  first as items whose expected labels the user may want to revisit"); `references/create-dataset.md:26`
  ("AI-generated expected outputs cannot be considered ground truth"); sanity
  content-experimentation `references/statistical-foundations.md:112-113`.
- **Where in LTZ:** `references/round.md`, "Canaries"; `scripts/README.md:813` keeps scores per slot per round
  only.

## 5. Render logs tell "never looked" from "looked and misjudged" (medium-high)
- **Source:** qdrant diagnosis `SKILL.md:18,27` (the 2x2 that isolates which stage failed).
- **Where in LTZ:** the retro (`references/learning.md`) assumes misjudging ("Propose a sharper wording"). Render
  logs and `cites_read` exist but aren't used for this.

## 6. Old and new readers on one chunk before changing model or brief (medium-high)
- **Source:** qdrant-model-migration `SKILL.md:45,64`; qdrant-version-upgrade `SKILL.md:49`.
- **Where in LTZ:** lessons "A change to the reader rules can multiply errors" (1 → 43) and "A rising count
  usually means the bar moved" (6 → 13). Bar wording gets `ltz replay`, but brief and model changes get no
  side-by-side test.

## 7. Pin drift report, and a procedure for moving the pin (medium)
- **Source:** cockroachdb auditing-table-statistics `SKILL.md:29,115-117`; planetscale
  13-autonomous-execution-mode `SKILL.md:37`.
- **Where in LTZ:** `references/debugging.md:42-44` and setup.md step 8 have no drift report and no move
  procedure.

## 8. New starter class: defined is not wired (medium)
- **Source:** product-tracking-audit-current-tracking `SKILL.md:106-111`: "Do not assume an event is live just
  because it is defined." sanity-studio-upgrade `SKILL.md:53` (R7).
- **Where in LTZ:** U1, U5 and U7 cover only negatives and flags.

## 9. New starter class: evaluate expressions, don't read them (medium)
- **Source:** sanity-studio-upgrade `SKILL.md:52` (R6): "Evaluate a version range, never read it"; `:55`; `:71`
  ("Caret ranges are not installed versions").
- **Where in LTZ:** C2, C3 and U9 come close; none requires evaluation. Covers semver, regex, globs, cron, CIDR
  and boolean conditions.

## 10. Optional reader doubt note on an ok, used to aim spot-checks (medium)
- **Source:** qt-cpp-review `SKILL.md:145-147,444-447` ("Unverified because ... How to verify"); qt-qml-review
  `SKILL.md:127-129`.
- **Where in LTZ:** round.md step 3 spot-check weighting; a reader's doubt is lost once it marks ok.

## 11. Warn-only mode for new guard rules (low-medium)
- **Source:** planetscale 05-traffic-control-recommendations `SKILL.md:49-54`: "`warn` mode first ... Move to
  `enforce` only with explicit approval".
- **Where in LTZ:** `scripts/hooks/README.md`; regression patterns gate `diffcheck` immediately.

## 12. Phrasings that never count as approval (low)
- **Source:** planetscale 11-change-gates-and-approval-contract `SKILL.md:100-105`: "Invalid approvals: 'Do the
  best practices.' 'Fix everything.' ... 'Go ahead' without named change IDs."
- **Where in LTZ:** SKILL.md "Owner overrides" already separates wishes from rulings; this adds negative
  examples.

## Already covered
Deterministic lint before readers; a retry cap per item; failures clustering on one cause; preflight before
commit; repeated checks of the zero rule; rollback and read-back after a fix; separating verified from inferred.

## Yielded nothing
clickhouse, datadog, datarobot-agent-skills, fastly-agent-toolkit, vanta-mcp-plugin, auth0, base44, valtown,
zapier, servicenow-sdk, pdf-viewer, warmup, and langfuse's migrate-to-langfuse and skill-creator. In the plugins
that yielded, only the skills cited above contributed; buildkite-api and desktop-commander knowledge-base only
backed up entries 1 and 3.
