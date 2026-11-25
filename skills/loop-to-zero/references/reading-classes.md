# Starter classes, the three lenses and the universal words

This file is the global starter set. It is research source 5 in `references/setup.md`.
- Keep a class only where the repo research shows the project can produce it.
- Rename each kept class into the project's terms.
- The owner approves the set before any counted reading. The project's own set lives in `S/classes.md`; never
  edit this file for one project.

U1 to U5, U7 to U9 and U12 are mainly for claims about code; U6, U10, U11 and U13 apply to any item. The C classes
are for claims about config, policy and values.

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
- "N per …" (readers read it literally; the tools' universal check matches whole words, so `diffcheck` and
  `reach` do not flag it, and config `universalWords` cannot add it).

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
| U6 closed list | A list with no hedge word ("such as", "for example", "e.g.", "among others") that is closed: by "only", "all", "both" or a count, or framed as the whole set ("its tables are A and B"), including write sets ("writes only X plus its audit row") | Any member is missing, including rows that triggers, cascades or another mode's code path write in the same transaction | Prove the list complete with an unlimited search; or drop what closes it ("only", the count, the whole-set framing) (subtract; a reworded list of 3 or more still needs the logged search: `scripts/README.md`, "New lists"); or add "such as" if softening is allowed |
| U7 conditional effect | "X sends errors to the tracker" | It is gated by config or a flag | State the gate: "when <FLAG> is set" |
| U8 consequence chain | "A, so B, so C" | A later step drops a qualifier an earlier step carries | Carry the qualifier into each later step |
| U9 defaults | "defaults to Y" | It is `X ?? Y`, `X \|\| Y` (falsy values such as 0, "" or false take the default), a truthiness guard, a destructuring or parameter default (only `undefined` takes it), or set elsewhere | "X, or Y when it is unset" (or "when falsy", as the code does) |
| U10 count | "N per request", "three handlers" | The count is off anywhere | Recount with an unlimited search, or drop the number |
| U11 ambiguity | An item that can be read two ways ("passes a timeout": the option, or its effect?) | Two readings, which the evidence would judge differently | Rewrite it to say one thing. A requirement item's rewrite needs an owner ruling (hold the draft) |
| U12 defined, not wired | "X happens via Y", "Y handles X", "X is sent by Y()" | Y is defined but nothing on X's path calls or registers it, or it is deprecated or disabled. A definition alone never backs the claim: the reader finds the call or registration site on X's path | Name the path that does it, or subtract the claim |
| U13 vague relation | "A uses B", "A manages B", "A integrates with B", with no action named | The verb names no action the evidence could show false: any import, config line or call would "back" it, so no reader can refute it. It is wrong for a rewrite, never ok because some link was found. The wrong cites the link the reader found (the import, call or config line the rewrite will state). With no link at all, it is wrong as a false relation: the note names the item's own cited lines (rendered) that show no link. (Two definite readings that the evidence judges differently are U11) | Rewrite it to the relation the evidence shows: the action, the direction and where ("ingest writes session keys to Redis via src/cache.ts"). A requirement item's rewrite needs an owner ruling |
| C1 cite resolves | The named file, section or key | It doesn't exist at the pin, or says something else | Correct the cite |
| C2 value | Numbers, periods, thresholds, units | They differ from the evidence | Correct the value and its unit. For a requirement item, only when the cite is the requirement's own source; a differing implementation is a `defect` |
| C3 effective setting | "X is set to Y" | A default is overridden, inherited or disabled elsewhere | State the effective value and where it is set (for a requirement item, a differing implementation is a `defect`) |
| C4 scope | "MFA is enforced" | The evidence covers only some environments or populations | For a descriptive item, state the scope ("in production"). A requirement item is never narrowed to fit: that is a `defect` |
| C5 names | Roles, owners, systems | A name is renamed or retired | Use the current name |
| C6 evaluated expression | A quoted cron line, version range, regex, glob or CIDR, and what it covers ("so Node 20 and 21") | Evaluating the expression in its consumer's dialect gives a different set. A version claim also separates the declared range (a manifest such as package.json) from the resolved version (the lockfile or the runtime) | Evaluate it with a tool or a scratch helper, never by eye, and state what it covers in its own terms; or subtract the coverage clause |

**Every class entry in `S/classes.md`, starter or new, has an "Is not" line and an "Ok example" line,** each written
out: the nearest class it could be confused with, and one made-up claim of its shape that holds. That includes the
catch-alls (ambiguity, closed list, names) and any class kept only on a condition. An entry missing either is not
ready for the owner. The pair is what stops two readers filing one wrong under different classes. Two classes that both fit an item follow the tie-break in
`references/fixing.md` ("Classes"), so order `S/classes.md` with the narrower, more mechanical classes first.

Where softening is not allowed (setup question 4), the "Fix form" column's hedge forms don't apply.
Subtraction still does, for descriptive items. Prove the scope; a requirement item the evidence fails is a `defect`.

**The search rule.** A search that backs a universal runs with no output limit at any layer: no `head`, no
tool result cap, no truncated shell output. It covers the whole evidence boundary, and it looks for aliases,
re-exports and wrappers (`references/fixing.md`). Truncated output is how a false sole-location or non-use
claim survives. So is a search that cannot hit: zero hits count only after the same search finds something
known to be there.

**Accepted forms** (S/classes.md quotes this). The source's own vocabulary is accepted. So is a context the item states (for example
"in Postgres"); read the claim in that context.

## When two classes fit (S/classes.md quotes this)
Readers list every class that applies. The first listed is the class whose claim the refuter falsifies: for a
universal, the class whose universal it falsifies most directly; for a claim with no universal word (a value, a
call, a relation), the class whose definition describes the part the refuter shows false. A part that holds names
no class: "sent via f() in batches of 500", with 500 right and f() never called, lists the call's class and
not the value's. The order classes are listed in `S/classes.md` decides only a real tie. The writer settles the
class at confirm.

## Accepted by ruling (in `S/classes.md`)
One entry per bar ruling (`R-n`) in the decision log (`ltz rulings` checks that each id appears in this section). Process decisions (`P-n`) never
appear here. Each entry gives:
- the record's id;
- its verbatim text;
- its scope;
- what readers still judge: the item's other claims and citations;
- any "kept after 'amend?'" note, with the owner's words (`references/owner-asks.md`).

A superseded or withdrawn ruling keeps its id here with the line "superseded by <id>, <date>: approves nothing"
(or "withdrawn, <date>: approves nothing"), and no verbatim approval text.

An item that a ruling covers is not wrong for the ruled point. Readers read this section first.

## Reader guidance (in `S/classes.md`)
Notes for readers go only here: what to bound. Never new facts, and never a
paraphrase of a rule. Re-check every line against later rulings before each round. Propose any change to the owner with its replay
(`references/learning.md`, "Changing the bar's wording"); once approved, it enters the next round's copy on the same timing.

## A class found mid-pass (open bar)
The writer:
1. writes its sweep patterns to `S/checks/patterns/` first, before the sweep and before any fix, then sweeps every
   item, in every unit, for it as soon as `references/round.md`, step 2, lets sweeps run (a count-only
   `ltz sweep --count` may run now);
2. confirms its hits as any sweep's (`references/round.md`, step 4);
3. replays it (`ltz replay`) if there is history, and adds its name, definition, what makes it wrong, fix form, "Is not"
   line and "Ok example" line to `S/classes.md` once the current round's last fix check is done (like a wording
   change: `references/learning.md`). Only that entry waits: the patterns are already stored;
4. logs a lesson in `S/lessons.md` ("the research missed a class").
