"""Live LLM path (Anthropic API). Two calls per question: blind solver, then triage (+ replies for every report).
Cost-aware: ~2 calls x 39 questions. Needs: pip install anthropic; export ANTHROPIC_API_KEY=...
Without a key, run.py uses the precomputed analyst decisions (see README)."""
import json
import os
import re

from prompts import (REPORT_XML, SOLVER_SYSTEM, TRIAGE_SYSTEM, TRIAGE_USER_TEMPLATE)
from textutil import body, to_text

MODEL = os.environ.get("ACADZA_MODEL", "claude-sonnet-5-5")


def _client():
    import anthropic  # imported lazily so replay mode has zero dependencies
    return anthropic.Anthropic()


def _json(text):
    m = re.search(r"\{.*\}", text, flags=re.S)
    if not m:
        raise ValueError("no JSON in model output")
    return json.loads(m.group(0))


def _call(client, system, user, max_tokens=1500, retries=2):
    last = None
    for _ in range(retries + 1):
        try:
            r = client.messages.create(model=MODEL, max_tokens=max_tokens, temperature=0, system=system,
                                       messages=[{"role": "user", "content": user}])
            return _json("".join(b.text for b in r.content if getattr(b, "type", "") == "text"))
        except Exception as ex:  # malformed JSON / transient API error -> retry, then surface
            last = ex
    raise RuntimeError(f"LLM call failed: {last}")


def solve_blind(client, q):
    """Question text only. No key, no solution, no student comment."""
    b = body(q)
    user = f"Type: {q['questionType']}\nSubject: {q['subject']}\n\nQUESTION:\n{to_text(b['question'])}"
    return _call(client, SOLVER_SYSTEM, user)


def triage(client, q, solver, lint, reports, taxonomy):
    b = body(q)
    qj = {"questionType": q["questionType"], "question_html": b["question"], "answer": b["answer"],
          "solution_html": b.get("solution"), "images": b.get("quesImages"), "errorHistory": q.get("errorHistory")}
    reports_xml = "\n".join(REPORT_XML.format(
        reportId=r["reportId"], source=r["source"], reportedAt=r["reportedAt"],
        comment=(r["comment"] or "").replace("<", "&lt;").replace(">", "&gt;")) for r in reports)
    user = TRIAGE_USER_TEMPLATE.format(
        qid=q["_id"], qtype=q["questionType"], chapter=q["chapter"],
        question_json=json.dumps(qj, ensure_ascii=False), solver_json=json.dumps(solver, ensure_ascii=False),
        lint_json=json.dumps(lint, ensure_ascii=False), taxonomy_json=json.dumps(taxonomy, ensure_ascii=False),
        reports_xml=reports_xml)
    d = _call(client, TRIAGE_SYSTEM, user, max_tokens=2500)
    d["questionId"] = q["_id"]
    d["solver"] = solver
    return d


def run_live(questions, reports_by_q, taxonomy, lint_fn):
    client = _client()
    out = []
    for qid, reps in reports_by_q.items():
        q = next(x for x in questions if x["_id"] == qid)
        solver = solve_blind(client, q)
        out.append(triage(client, q, solver, lint_fn(q), reps, taxonomy))
    return out
