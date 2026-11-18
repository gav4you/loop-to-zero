# Trigger test: does the description pick this skill, and only this skill?

Send a new cold agent the prompt below for each of 3 runs, with `<DESCRIPTION>` replaced by the `description:` line of the SKILL.md
under test (for a baseline run, the baseline copy's), and the 20 requests in a fresh random order each run. Do
not send the "Expected" column.

Each request is scored on its own. A T request passes a run when it is answered loop-to-zero; an N request
passes when it is answered anything else. The N rows' expected answers are shown for reference only: this test
does not judge the other skills' descriptions. With no edit under test, the description passes when every request passes all 3 runs. For a `description:`
edit, follow `README.md`, section 3, instead.

## Prompt

> You are choosing which skill, if any, a coding assistant should load for each user request. The available
> skills are:
>
> - **loop-to-zero**: <DESCRIPTION>
> - **debug**: Structured debugging session — reproduce, isolate, diagnose, and fix. Trigger with an error
>   message or stack trace, "this works in staging but not prod", "something broke after the deploy", or when
>   behavior diverges from expected and the cause isn't obvious.
> - **code-review**: Review code changes for security, performance, and correctness. Trigger with a PR URL or
>   diff, "review this before I merge", "is this code safe?", or when checking a change for N+1 queries,
>   injection risks, missing edge cases, or error handling gaps.
> - **loop**: Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo). Omit the interval to
>   let the model self-pace. Use when the user wants to set up a recurring task, poll for status, or run
>   something repeatedly on an interval. Do not use for one-off tasks.
>
> For each request, answer with its number and exactly one of: loop-to-zero, debug, code-review, loop, none.
> One line per request, no explanations.
>
> <the 20 requests, numbered 1-20 in this run's order>

## Requests

| # | Request | Expected (N rows: likely answer) |
|---|---|---|
| T1 | Our API docs ledger has 300 rows. Verify each against the code and keep fixing until a full pass finds nothing wrong. | loop-to-zero |
| T2 | Findings keep coming back every round on the migration spec. Help me get wave 3 to zero. | loop-to-zero |
| T3 | Re-verify the policy statements in our security handbook against the config until clean. | loop-to-zero |
| T4 | Close slice 4 of the parity requirements; the last round found 2 wrongs. | loop-to-zero |
| T5 | Loop to zero on the audit findings in docs/audit.md. | loop-to-zero |
| T6 | Every review of our design doc's chapters turns up new errors. Set up something systematic that runs rounds until it's clean. | loop-to-zero |
| T7 | We have 120 test expectations written in a spec. Check them all against the implementation, fix the spec, and repeat until there are no errors. | loop-to-zero |
| T8 | Resume the verification loop for phase 2 from the handoff. | loop-to-zero |
| T9 | The readers found 5 wrong claims in module B this round. Fix them and run the next round. | loop-to-zero |
| T10 | Audit every claim in our README against the source, fix them, and keep re-auditing until a pass is clean. | loop-to-zero |
| N1 | Run npm test every 10 minutes until it passes. | loop |
| N2 | Keep polling the CI run until it finishes and tell me the result. | loop |
| N3 | Review this PR before I merge it. | code-review |
| N4 | The login test fails with "TypeError: cannot read properties of undefined". Fix it. | debug |
| N5 | Proofread this blog post once for typos. | none |
| N6 | Summarize the claims in this whitepaper. | none |
| N7 | Write a spec for the new billing module. | none |
| N8 | Is this one sentence in the README accurate: "the cache defaults to 60s"? | none |
| N9 | Retry the flaky upload until it succeeds. | none |
| N10 | Make a plan to get our open bug count to zero this sprint. | none |

Why the N rows are near misses: N1, N2 and N9 repeat something but verify no items. N8 is one claim checked
once, with no rounds. N5 and N3 are one-pass reviews. N10 is about bugs, not claims checked against evidence.
