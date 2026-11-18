# Starter classes, the three lenses and the universal words

This file is the global starter set. It is research source 5 in `references/setup.md`.
- Keep a class only where the repo research shows the project can produce it.
- Rename each kept class into the project's terms.
- The owner approves the set before any counted reading. The project's own set lives in `S/classes.md`; never
  edit this file for one project.

The U classes are for claims about code. The C classes are for claims about config, policy and values.

## The three lenses (every reader applies all three; S/classes.md quotes them)
- **Claim vs source.** The item's claim must hold at the pin, and each citation must point at the right
  line. Read every cited line in full, not only the matched token.
- **Whole context.** Read the enclosing function, section or table as well as the cited line: its other
  branches, its failure paths, and anything that runs earlier and answers part of the case first.
- **Adversarial input.** Ask what input or state breaks the claim: empty, null, huge, inherited or
  prototype keys, unicode, concurrent writes, a partial failure, or a mode or flag switch.
  - Where the evidence is code and the brief allows it, run a probe in a scratch copy instead of only
    reading. Probes that ran the code found the most serious faults in one project's plan reviews.

## The universal words (the master list unless config `universalWords` overrides it; S/classes.md quotes the list in use)
These words make a claim universal:
- only, every, each, all, always;
- never, no, none, nothing, nobody;
- sole, exclusively, any;
- "no caller", "nothing reads", "exists only", "appears only";
- "N per …".

Read them literally. A universal is wrong if anything in the evidence boundary refutes it, unless the item
bounds it.

## Starter classes
| Class | Shape | Wrong when | Fix form |
|---|---|---|---|
| U1 non-use | "nothing reads X", "unused", "no writer", "only A imports X" | Any code in the evidence boundary does it, such as tests, fixtures, scripts, schema, harnesses or operator commands, when the boundary includes them | Bound it ("no application code ...", "outside tests"), backed by an unlimited search |
| U2 every-caller | "every call site awaits", "all callers pass", "no caller passes X", "every request re-reads X", "every value is validated" | One caller in the boundary differs. A claim about requests or calls that names no stage is also wrong when an earlier gate (a rate limiter, body parser or type guard) answers some of them first. A validation claim that names no bound is also wrong when an input that doesn't arrive through the interface skips the check | State the scope ("every call site under src/") and back it with an unlimited search, or subtract ("fetchUser's timeout is 30 s when unset; scripts/x.ts:44 passes <value>"), or hedge if softening is allowed ("call sites such as ... use the default"). If the passed value could be read as its effect (does 0 mean no timeout, or the default?), say what it does, after reading the code (U9 for falsy defaults); if the code that decides it is outside the boundary, name the value only. Bound request claims to the stage ("every request that reaches the handler") |
| U3 existence | "no S3 client exists", "there is no retry", "every table has RLS" | One exists anywhere in the boundary, including what an operator command creates (a DR test, a migration helper) | Bound it to the subject: "the sink has no ..." |
| U4 sole-location | "exists only as README prose", "defined only in X" | Another file carries it, docs included | Bound it to a proven scope ("outside docs/, defined only in X"), backed by an unlimited search; or subtract "only": "X describes it"; or hedge if softening is allowed: "documents such as X describe it" |
| U5 reachability | "never reached", "dead", "cannot happen" | Any path reaches it | Name the path or condition that holds |
| U6 closed list | A list with no "such as" that is closed: by "only", "all", "both" or a count, or framed as the whole set ("its tables are A and B"), including write sets ("writes only X plus its audit row") | Any member is missing, including rows that triggers, cascades or another mode's code path write in the same transaction | Prove the list complete with an unlimited search; or drop what closes it ("only", the count, the whole-set framing) (subtract; a reworded list of 3 or more still needs the logged search: `scripts/README.md`, "New lists"); or add "such as" if softening is allowed |
| U7 conditional effect | "X sends errors to the tracker" | It is gated by config or a flag | State the gate: "when <FLAG> is set" |
| U8 consequence chain | "A, so B, so C" | A later step drops a qualifier an earlier step carries | Carry the qualifier into each later step |
| U9 defaults | "defaults to Y" | It is `X ?? Y`, `X \|\| Y` (falsy values such as 0, "" or false take the default), a truthiness guard, a destructuring or parameter default (only `undefined` takes it), or set elsewhere | "X, or Y when it is unset" (or "when falsy", as the code does) |
| U10 count | "N per request", "three handlers" | The count is off anywhere | Recount with an unlimited search, or drop the number |
| U11 ambiguity | An item that can be read two ways ("passes a timeout": the option, or its effect?) | Two readings, which the evidence would judge differently | Rewrite it to say one thing |
| C1 cite resolves | The named file, section or key | It doesn't exist at the pin, or says something else | Correct the cite |
| C2 value | Numbers, periods, thresholds, units | They differ from the evidence | Correct the value and its unit. For a requirement item, only when the cite is the requirement's own source; a differing implementation is a `defect` |
| C3 effective setting | "X is set to Y" | A default is overridden, inherited or disabled elsewhere | State the effective value and where it is set (for a requirement item, a differing implementation is a `defect`) |
| C4 scope | "MFA is enforced" | The evidence covers only some environments or populations | For a descriptive item, state the scope ("in production"). A requirement item is never narrowed to fit: that is a `defect` |
| C5 names | Roles, owners, systems | A name is renamed or retired | Use the current name |

Where softening is not allowed (setup question 4), the "Fix form" column's hedge forms don't apply.
Subtraction still does, for descriptive items. Prove the scope; a requirement item the evidence fails is a `defect`.

**The search rule.** A search that backs a universal runs with no output limit at any layer: no `head`, no
tool result cap, no truncated shell output. It covers the whole evidence boundary, and it looks for aliases,
re-exports and wrappers (`references/fixing.md`). Truncated output is how a false sole-location or non-use
claim survives. So is a search that cannot hit: zero hits count only after the same search finds something
known to be there.

**Accepted forms.** The source's own vocabulary is accepted. So is a context the item states (for example
"in Postgres"); read the claim in that context.

## Accepted by ruling (in `S/classes.md`)
One entry per bar ruling (`R-n`) in the decision log (`ltz rulings` checks that each id appears in this section). Process decisions (`P-n`) never
appear here. Each entry gives:
- the record's id;
- its verbatim text;
- its scope;
- what readers still judge: the item's other claims and citations;
- any "kept after 'amend?'" note, with the owner's words (`references/owner-asks.md`).

An item that a ruling covers is not wrong for the ruled point. Readers read this section first.

## Reader guidance (in `S/classes.md`)
Notes for readers go only here: what to bound. Never new facts, and never a
paraphrase of a rule. Re-check every line against later rulings before each round, and replay any change
(`references/learning.md`).

## A class found mid-pass (open bar)
The writer:
1. sweeps every item, in every unit, for it as soon as `references/round.md`, step 2, lets sweeps run (a count-only
   `ltz sweep --count` may run now);
2. confirms its hits as any sweep's (`references/round.md`, step 4);
3. replays it (`ltz replay`) if there is history, adds its name, definition, what makes it wrong and fix form to
   `S/classes.md`, and its sweep patterns to `S/checks/patterns/`;
4. logs a lesson in `S/lessons.md` ("the research missed a class").
