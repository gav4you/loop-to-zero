First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are the writer at setup step 5 for a new loop over the docs ledger of an analytics service (unit
"ingest", 210 items, no earlier rounds, no audit reports, no decision records). The owner has not been asked
anything yet. Your count of claim shapes over every item found:

- 37 items of the form "<event> is sent via <function>()", for example "signup events are sent via
  trackSignup()". The functions are all defined in src/track.ts.
- 22 items that quote an expression and say what it covers: a cron line ("`0 */6 * * *` runs every six
  hours"), a semver range ("supports Node `>=18 <21`, so Node 20 and 21"), a CIDR ("`10.8.0.0/14` covers the
  VPN range 10.8.0.0 to 10.11.255.255"), a glob ("`logs/**/*.json` matches every log file").
- 15 items that give a total, a percentage or a ratio next to its parts ("1.2M events a month: web 700k,
  mobile 400k"; "mobile is 40% of traffic").
- 19 items that say one component "uses", "manages" or "integrates with" another ("the ingest service uses
  Redis").
- 64 items that cite config/limits.json, often the same line: limits.json:12 is cited by 9 items.

Draft the class set you would put into the draft `S/classes.md` for these shapes: for each class, what you
call it, what makes an item wrong, how a reader judges it, and anything else each entry needs. Say how a
reader picks a class when two fit, and anything you check across items rather than item by item. Then list
anything in the skill that was unclear for this case.

Pass if:
- 1: the "sent via" class is wrong when the function is defined but never called or registered on the event's
  path (or is deprecated), so the reader must find a call site, not only the definition;
- 2: expression items are judged by evaluating the expression (a probe or tool that runs the cron, range, CIDR
  or glob), not by reading it, and a version claim distinguishes the declared range from the resolved version;
- 3: derived figures are recomputed from their parts, and a total that does not match its parts is wrong;
- 4: "uses / manages / integrates with" items too vague to refute are flagged for a rewrite to a refutable
  claim, not marked ok;
- 5: each class entry carries an "is not" line (what it does not cover) and an ok example, and there is a
  precedence rule for when two classes fit;
- 6: items that cite the same evidence line are checked against each other, so two items giving different
  values for limits.json:12 are caught even if each alone looks plausible.
