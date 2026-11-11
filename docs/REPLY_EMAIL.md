**To:** subham.iitm.ds@gmail.com
**Subject:** Re: Acadza AI Intern: your build round (due 11 Nov)

Hi Subham,

My submission for the build round:

- **Repo:** [GITHUB LINK]
- **Live console:** [LIVE URL]  (stays up 7+ days; loads precomputed results, details below)
- **3-min video:** [VIDEO LINK]
- In the repo: `results.json` (all 44 reports), `PROMPTS.md`, `PRODUCT.md`

**What it does.** Reports are grouped by question, linted by code, re-solved *blind* by a second LLM call that never sees the key or the student's comment, then triaged. Only code can grant `auto_apply`: every edit must stay inside its repair's fields, apply exactly once, pass per-repair rules, and (for answer keys) match that independent solve. 44 reports became 19 auto-applied, 8 held for faculty, 17 no-change. The console shows what changed and why in plain words, a before/after diff with the math rendered natively, and one-key approve / edit / reject with an audit trail.

**Things I want you to hear from me rather than find:**
1. `results.json` was produced by Claude acting as the analyst in my coding session, using the same rubric as the product prompts, then run through the real guard code. The live API path is implemented and smoke-tested, but I did not run it for the submitted file. Every numeric claim in the evidence is also re-computed in plain Python (`engine/verify_math.py`).
2. Where I think I could be wrong: R040 ("wrong") as `not_actionable` vs `no_error`; R026 (syllabus) as a faculty call at 0.55 confidence; Q36's missing option D, which I held for a human because nothing in the record says what it was.
3. The audit log lives in the browser and exports to JSON/CSV; production would write it to a table.

Bonus: I found 13 defects nobody reported (e.g. Q10's stored solution calls insulin and glucagon "synergistic"). They're in the console under *Sweep* and in `docs/unreported_defects.md`.

**Your four questions**

1. **Is this a remote, Monday-to-Saturday role for people who want to build real product, not tick a college box? Is that you?**
   [CONFIRM IN YOUR OWN WORDS. Example: "Yes. I'm looking for a role I can stay in and own, not a project for credit."]
2. **How many months can you commit?** [YOUR ANSWER]
3. **Earliest start date.** [YOUR ANSWER]
4. **Why this work, why now?** [2-3 LINES IN YOUR OWN WORDS. They asked for your own words, so write this one yourself. Something specific from building this tends to land better than anything general: e.g. what surprised you in the data (a stored solution that confirmed a wrong key; a student who was right and ignored).]

Thanks for the time,
[YOUR NAME]
