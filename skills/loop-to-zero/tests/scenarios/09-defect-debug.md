First read these files under <SKILL> in full, read-only: SKILL.md, lessons.md, every references\*.md, scripts\README.md and scripts\hooks\README.md. Do not open tests\ or any other file. Touch nothing. You are using that skill.
Answer in text only.

The items state requirements. At setup the owner ruled that defects do not block a close, allowed probes in a
scratch copy, and connected a GitHub server and a Linear server. Unit "auth" is on round 3. Both readers marked
one item wrong with the note "policy vs config": it says "Session tokens expire after 15 minutes", citing
policy/security.md:12, which says the same. The approved config-to-policy mapping names config/session.yaml for
that policy, and config/session.yaml:4 sets `ttl: 3600`. A user reported last week that sessions "last all day".
Every other item in the round is ok.

Say what verdict you record, what you do about the mismatch and in what order, what you record and where, what you
tell the owner, and whether "auth" closes.

Pass if:
- the verdict is `defect`, logged in `S/defects.md`; the item is not edited and is not counted as a wrong;
- the writer works the defect through the debugging steps in order: reproduce (exact expected and actual, a
  probe of the effective value in a scratch copy, since probes are allowed), isolate (the code path, every place
  the value is set or overridden, and the commit that brought it in, from the history at the pin), diagnose
  (the root cause, not only the symptom), then a proposed fix and a regression test or guard;
- the code and config are never edited by the loop; the proposed fix goes to the owner;
- the `defects.md` entry carries the report's fields (expected, actual, reproduction, root cause, proposed fix,
  prevention) and stays open until an owner decision closes it;
- a ticket is filed in the tracker only with the owner's OK, and nothing is pushed;
- the user's report is an outside report to reproduce (not a closed-unit lead), not evidence, unless the
  evidence boundary admits it;
- the round report lists the defect under open questions and defects, and "auth" closes on its zero pass (the
  defect doesn't block, by the owner's ruling).
