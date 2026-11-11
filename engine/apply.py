"""Apply an edit to a question document (pure function; the web console mirrors this logic)."""
import copy
import json
from textutil import body


def apply_edit(q, edit):
    """edit: {field, find, replace}. Returns a NEW question dict. Raises ValueError if it cannot apply cleanly."""
    q = copy.deepcopy(q)
    field, find, rep = edit["field"], edit["find"], edit["replace"]
    if field == "questionType":
        old = q["questionType"]
        if old != find:
            raise ValueError(f"questionType is {old!r}, edit expects {find!r}")
        q[rep] = q.pop(old)
        q["questionType"] = rep
        return q
    b = body(q)
    cur = b.get(field)
    if field == "answer":
        if cur != find:
            raise ValueError(f"answer is {cur!r}, edit expects {find!r}")
        b["answer"] = rep
        return q
    if not isinstance(cur, str):
        raise ValueError(f"field {field} is not a string")
    n = cur.count(find)
    if n != 1:
        raise ValueError(f"'find' occurs {n} times in {field} (must be exactly 1)")
    b[field] = cur.replace(find, rep)
    return q


def apply_edits(q, edits):
    for e in edits:
        q = apply_edit(q, e)
    return q


def edits_of(decision):
    """All edits of a decision, primary first."""
    out = []
    if decision.get("edit"):
        out.append(decision["edit"])
    out.extend(decision.get("extra_edits") or [])
    return out
