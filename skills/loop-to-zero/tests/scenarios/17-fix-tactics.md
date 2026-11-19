First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

You are the writer for an API reference ledger, unit "auth", round 6, agents allowed, softening not allowed,
probes allowed. Three things are on your desk after the confirm step:

1. Item auth-7 says "every login request is rate limited". Round 3 confirmed it wrong and your fix narrowed it to
   "every password login request is rate limited"; round 5 confirmed that wrong too and you narrowed it to "every
   password login request from the web client is rate limited". Round 6's readers marked it wrong again:
   src/routes/login.ts:40 skips the limiter when the `X-Internal` header is set.
2. Your sweep for the same class (U2 every-caller, about rate limiting) found 31 more items across three open
   units. You have drafted a new wording for the class that you have not used before.
3. Item auth-19 states a requirement: "sessions expire after 15 minutes idle". Both readers marked it wrong,
   "policy vs config": config/session.yaml:6 sets `idleTimeout: 900`, which matches, but in production sessions
   stay alive for hours. The same config in staging behaves as required. Production loads
   config/session.prod.yaml, which sets `refreshOnActivity: true`; it also runs behind a load balancer whose
   keep-alive pings are in the access log. You have not yet worked out which of these keeps sessions alive.

Say what you do with each, in order: how you fix auth-7, how you roll out the new wording to the 31 hits, what the
fix checker is asked to check, and what goes in the auth-19 `defects.md` entry. Then list anything in the skill
that was unclear for this case.

Pass if:
- 1: for auth-7, after two narrowings that did not hold, it changes approach (subtraction, or a different
  claim the evidence supports) and says it will not narrow a third time;
- 2: the new wording is tried on one item first (fixed, re-read, and fix-checked) before it is applied to all 31
  hits;
- 3: the fix checker is asked to confirm that each replaced text really was wrong at the pin, not only that the
  new text holds;
- 4: the auth-19 entry lists the candidate causes (refreshOnActivity, the load balancer's keep-alive pings), each
  with the evidence for and against and a test that would confirm or kill it, and runs the cheapest test that
  tells them apart first; a cause counts as ruled out only with a cite, otherwise "set aside";
- 5: it uses the working sibling (staging) to tell the causes apart, and the proposed fix names which cause it
  breaks.
