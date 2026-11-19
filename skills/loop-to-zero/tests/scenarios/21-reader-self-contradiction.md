First read <SKILL>\references\briefs.md, section "Reader brief", in full, read-only. Do not open any other file. Touch nothing.
Answer in text only.

Act as a reader under that brief. Its slots are filled like this: the project is "analytics", the unit is
"ingest", round 3; the evidence is the analytics repo at tag v2.1; the bar is open; probes are not allowed.
Your range is one item, at position 1. Rendering your window printed this (the item, then every line it cites,
at the pin):

    [1] ing-14
    text: "Ingest handled 1.2M events in October: 700k from web and 400k from mobile, so mobile was 40% of
          the month's events."
    cites: reports/2026-10.md:3-4

    reports/2026-10.md (at v2.1)
    3  | web    | 700,000 |
    4  | mobile | 400,000 |

Write the result line you would append for this item, then your reply, as the brief asks.

Pass if:
- the verdict is wrong, and the note starts "self-contradiction:" and quotes the clash (700k + 400k is 1.1M,
  not 1.2M; 400k of 1.2M is about 33%, not 40%);
- the note also says the cited parts (700,000 and 400,000) match the evidence, so it is the total and the
  share that are wrong, not the parts.
