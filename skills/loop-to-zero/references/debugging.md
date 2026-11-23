# Working a defect

A `defect` is a fault in the evidence, or a requirement the evidence doesn't meet, not a fault in the items. The
loop never fixes it. Instead it hands the owner a diagnosis they can act on: what is wrong, how to see it, where
it comes from, and what would fix it. The steps are the usual debugging steps (reproduce,
isolate, diagnose, fix), with the fix step changed to "propose": the evidence is not the loop's to edit.

## When
- **Every new `defect` verdict,** after its confirm checks (`references/fixing.md`) and before the round report.
  A fault in the evidence noticed while fixing a wrong item (`references/round.md`, "Pending owner, defects,
  wishes") gets the same steps.
- **It is read-only work.** In agent mode it may run while readers are still reading, like the other read-only
  work in `references/round.md` ("2. Read"). In solo mode it runs after the hand-back, never in a reading session.
- **Never edit the evidence or the pin, and never change a defect's item to match the evidence.** A wrong item
  the fault was found with is still fixed as a wrong (round step 4). Probes run only in a scratch copy, and only if the owner
  allowed probes at setup.
- **It never holds up the round.** A step that can't finish is recorded as "not reached", with the reason.

## The steps, in order
1. **Reproduce.**
   - **Expected:** what the item or its policy requires, quoted, with its cite.
   - **Actual:** what the evidence does, quoted, with its file:line at the pin. Quote values exactly; never
     paraphrase them.
   - **Show the effective value.** With probes, run the code path, config loader or parser in a scratch copy, and
     record the command and its output verbatim. Without probes, trace it by reading, and label the result "by
     reading".
   - **Write the reproduction** as steps someone else can re-run at the pin.
2. **Isolate.**
   - **Every place the value is set,** defaulted, overridden, inherited or gated by a flag (what the starter
     classes C3 effective setting and U7 conditional effect check, `references/reading-classes.md`). Search without limits:
     never truncate a search with `head` or `Select-Object -First`.
   - **When it came in:** the history of the cited lines up to the pin (`git log -L` or `git blame`): the commit
     that brought the value in, and its date. A recent change is the first suspect, not proof.
3. **Diagnose.**
   - **List the candidate causes.** For each: the evidence for and against it (file:line at the pin), a test that
     would confirm it, and a test that would kill it. Every candidate gets all four, a combination ("A and B
     together") included, written out, never as a placeholder; where none is known yet, write "none found" and
     what you searched.
   - **Run the cheapest test that tells the leading candidates apart first,** before any other test, and record it
     as the entry's "First test" line: the test, why it is the cheapest that separates them, and its result. A
     working sibling (another environment, version, config or code path where the requirement holds) is usually
     that test: diff it against the failing one, and the causes that the two share are out. Listing tests is not
     running one: the entry names the one that ran first.
   - **"Ruled out" needs a cite or a test's output.** A candidate dropped without one is "set aside", and stays
     in the entry.
   - **The root cause is the first place the behaviour departs from the requirement,** not the line where the
     symptom shows. When two causes act together, name both.
   - **A cause outside the evidence boundary** (a deploy setting, a vendor default) is recorded as "cause outside
     the boundary: <where>", and the diagnosis stops there. It is a question for the owner, not a finding.
4. **Propose, don't apply.**
   - **Proposed fix:** the smallest change to the evidence that meets the requirement, with its side effects. Name
     the cause it breaks, so the owner can see why it works. While the root cause is not reached, propose one fix
     per leading candidate, each naming the cause it breaks.
   - **Items it would change:** sweep for items citing the same lines, or the same subject, and name them in the
     entry. Every read stays at the pin, so the owner's fix to the evidence changes no verdict by itself. These
     items matter only if the owner later moves the pin (a new answer to setup question 5), and the list shows the
     owner what that would reopen.
   - **Prevention:** a regression test or guard that would have caught the fault.

## Outside reports
A user report, ticket, incident note or log is an outside report: something to reproduce, not a `lead` in this
skill's sense (it never goes in `closed-unit-leads.txt`). It is never evidence unless the evidence boundary
admits that kind of evidence. A defect stands on the pinned evidence alone. Quote the report in the entry's
"Outside reports" field, with its source and date.

## Connected tools
Tools are named by category: `~~<category>` (`~~source control`, `~~monitoring`, `~~project tracker`) means any
connected tool or server of that kind. Without one, use the local repo and say so.

| Category | Use | Limit |
|---|---|---|
| `~~source control` | History and blame for step 2, and the pull requests that touched the cited lines | Read only |
| `~~monitoring` | Logs, error rates and metrics that show the run-time behaviour | Evidence only if the boundary admits run-time evidence; otherwise outside reports |
| `~~project tracker` | Known issues about the same fault; a ticket for the defect | Filing a ticket needs the owner's OK, for each defect or as a standing process decision (`P-n`) |

Nothing is pushed, posted or filed without the owner.

## The entry
Each defect is one entry in `S/defects.md`:

```
<unit> | items <ids, or "none"> | open
Expected:      <quote> (<cite>)
Actual:        <quote> (<file:line at the pin>)
Reproduction:  <probe command and output, or "by reading: ...">
Isolation:     <each place it is set or overridden>; came in with <commit> (<date>)
Candidates:    <cause>: for <cite>; against <cite>; confirm test <...>; kill test <...>; result <...>  (one line each)
First test:    <the cheapest test that tells the leading candidates apart>; cheapest because <...>; result <output or cite>
Root cause:    <...>  (ruled out: <cause, cite or test output>; set aside: <cause, why>)
Proposed fix:  <...>; breaks: <the cause> (one per leading candidate until the root cause is known); side effects: <...>; items it would change: <ids>
Prevention:    <test or guard>
Outside reports: <each, with source and date, or "none">
Ticket:        <link, or "not filed">
Closed:        <decision id, once the owner closes it>
```

A defect closes only by an owner decision (`references/round.md`, "Pending owner, defects, wishes").

## Reporting
List each new defect in the round report under open questions and defects (`references/owner-asks.md`,
"Reporting a round"): one line each for the root cause and the proposed fix. Ask there whether to file a
ticket, if a tracker is connected and no standing decision covers it.
