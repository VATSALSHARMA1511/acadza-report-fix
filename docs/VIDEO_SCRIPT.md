# 3-minute screen recording (target 2:50)

**Before you hit record:** open the live URL in a fresh window, DevTools → Application → *Clear site data* so the queue is full and the audit log is empty. Type your name in the top-right box. Zoom browser to ~110%. 1440×900 window.

| Time | Screen | Say (adapt, don't read) |
|---|---|---|
| 0:00 | Console, first case open | "A broken question hurts every student until someone fixes it, and most reports are students being wrong. This sits between the report and the fix. The AI proposes, code guards, faculty decide." |
| 0:20 | Point at the left queue; click *Why this order?* | "Grouped by who has to act. Ordered by harm times reach: a wrong key beats a typo, and each extra reporter adds weight." |
| 0:40 | **Tricky case: "No option is correct as written" (Physics · Waves)** | "This one's my favourite. The student says *the assertion is true*. They're wrong: two equal waves π/2 apart give 2I₀, not I₀. But the *reason* is false too, and no option says 'both false'. The stored solution contradicts itself and still ends at the key, so checking key-against-solution would have blessed a broken question. A blind re-solve that never saw the key caught it, so it's held for faculty with a suggested rewrite." |
| 1:30 | Click the first *Answer key* case (Q31, 3 reports) | "Three students; one just wrote 'wrong ans'. Key said 130 V, an independent solve gives 50 V. Key chips, text diff, rendered before/after, MathML natively. It was auto-applied only because every guard passed. One click keeps or reverts." Press **R** then Undo to show it. |
| 2:00 | Open the *injection attempt* case (Physics · Temperature) | "A report that tells the AI to change the answer. It's treated as data, flagged, nothing changes. And the route is computed by code, so even a fooled model can't self-promote." |
| 2:20 | Click Audit | "Every action: who, when, what, which reports. Exports to JSON or CSV." Then press **Keep all** on auto-applied. |
| 2:35 | Terminal or README: `python3 tests/test_guards.py` → 14 passed | "14 tests try to break the guards: out-of-scope edits, a made-up find string, a student-anchored key flip." |
| 2:45 | Back to console | "Honest note: results are precomputed by Claude with the same rubric, run through the real guards; the live path is built. Thanks!" |
