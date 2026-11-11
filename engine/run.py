#!/usr/bin/env python3
"""Report -> Fix engine.

  python engine/run.py            # replay: precomputed analyst decisions -> guards -> results.json (no API key needed)
  python engine/run.py --live     # live: blind solver + triage prompts via Anthropic API -> guards -> results.json

Pipeline:  group reports by question -> lint (code) -> blind solve (LLM) -> triage (LLM) -> GUARDS (code) -> route.
The LLM can propose anything; only guards.decide_route can grant `auto_apply`."""
import argparse
import collections
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from apply import apply_edit, edits_of  # noqa: E402
from guards import decide_route  # noqa: E402
from lint import lint_question, lint_report_comment  # noqa: E402
from textutil import body  # noqa: E402


def load(name):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="call the LLM instead of replaying analyst decisions")
    ap.add_argument("--out", default=os.path.join(ROOT, "results.json"))
    args = ap.parse_args()

    Q, R, T = load("questions.json"), load("reports.json"), load("taxonomy.json")
    qmap = {q["_id"]: q for q in Q}
    by_q = collections.OrderedDict()
    for r in R:
        by_q.setdefault(r["questionId"], []).append(r)

    if args.live:
        from llm import run_live
        decisions = run_live(Q, by_q, T, lint_question)
    else:
        with open(os.path.join(HERE, "analyst_decisions.json"), encoding="utf-8") as f:
            decisions = json.load(f)
    dmap = {d["questionId"]: d for d in decisions}

    results, console = [], []
    for qid, reps in by_q.items():
        q, d = qmap[qid], dmap[qid]
        lint = lint_question(q)
        comment_flags = {r["reportId"]: lint_report_comment(r["comment"]) for r in reps}
        if any(c["injection"] for c in comment_flags.values()):
            d.setdefault("flags", {})["abuse"] = True
        route, held = decide_route(q, d, T, d.get("solver"))
        for r in reps:
            rid = r["reportId"]
            results.append({
                "reportId": rid, "questionId": qid, "verdict": d["verdict"], "repair": d.get("repair"),
                "edit": d.get("edit") if d["verdict"] == "defect" else None,
                **({"extra_edits": d["extra_edits"]} if d.get("extra_edits") else {}),
                "route": route, "confidence": round(d["confidence"], 2), "evidence": d["evidence"],
                "student_reply": d["replies"][rid]})
        console.append({**d, "route": route, "held_back_because": held, "lint": lint,
                        "reports": [{**r, "flags": comment_flags[r["reportId"]]} for r in reps]})

    results.sort(key=lambda x: x["reportId"])
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    with open(os.path.join(HERE, "console_cases.json"), "w", encoding="utf-8") as f:
        json.dump(console, f, indent=1, ensure_ascii=False)
    c = collections.Counter(r["route"] for r in results)
    v = collections.Counter(r["verdict"] for r in results)
    print(f"{len(results)} reports -> {dict(c)}")
    print("verdicts:", dict(v))
    import build_web_data  # noqa: F401  (writes web/data.js)


if __name__ == "__main__":
    main()
