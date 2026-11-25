First read <SKILL>\references\setup.md in full, read-only. Do not open any other file. Touch nothing.
Answer in text only.

You are setting up a new loop over a 60-page security policy manual (a DOCX), and you are in setup step 4. The
state folder and `config.json` exist, the tool tests pass, and your extract script has its own negative tests.
You have just run it. It printed: "412 items written to S/items.jsonl; 9 items have no cite".

List, in order, everything you do from this point until you start step 5, and say what each thing is for.

Pass if:
- 1: before going on, it reconciles the extract against the manual both ways (every numbered requirement or
  listed entry in the manual maps to an item, and every item maps back to the manual), listing the orphans on
  either side; comparing totals alone does not pass;
- 2: the 9 items with no cite are flagged to enter the first pass as candidate wrongs (confirmed by the writer
  there), not dropped and not fixed now.
