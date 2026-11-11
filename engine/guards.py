"""Hard guards. The LLM proposes; these functions can only REMOVE autonomy (route -> faculty_review),
never add it. Every failure is recorded so faculty can see why something was held back."""
import difflib
import re
from apply import apply_edit, edits_of
from textutil import body, get_field, parse_options, stem_text, to_text

EXAM_TAG = re.compile(r"\(\s*(JEE|NEET|AIEEE|AIPMT|IIT|CBSE)[^)]*\d{4}[^)]*\)\s*", re.I)
AUTO_CONFIDENCE = 0.85


def _subseq(a, b):
    it = iter(b)
    return all(ch in it for ch in a)


def _digits(s):
    return sorted(re.findall(r"\d+(?:\.\d+)?", s))


def _tags(s):
    return sorted(re.findall(r"</?[a-zA-Z0-9]+", s))


def check_scope(decision, taxonomy):
    fails = []
    rep = decision.get("repair")
    if decision["verdict"] not in taxonomy["verdicts"]:
        fails.append(f"verdict {decision['verdict']!r} not in taxonomy")
    if rep is not None and rep not in taxonomy["repairs"]:
        fails.append(f"repair {rep!r} not in taxonomy")
    if decision["verdict"] != "defect" and (rep or decision.get("edit")):
        fails.append("non-defect verdict must not carry a repair/edit")
    if rep in taxonomy["repairs"]:
        allowed = taxonomy["repairs"][rep]["fields"]
        for e in edits_of(decision):
            if e["field"] not in allowed:
                fails.append(f"edit touches '{e['field']}' but repair '{rep}' may only touch {allowed}")
        if not taxonomy["repairs"][rep]["auto"] and decision.get("edit"):
            fails.append(f"repair '{rep}' is auto:false, a human must author the change (edit must be null, use suggestion)")
    return fails


def check_edit_semantics(q, decision):
    """Does the edit apply cleanly, and does it do ONLY what its repair type allows?"""
    fails = []
    rep = decision.get("repair")
    cur = q
    for e in edits_of(decision):
        try:
            new = apply_edit(cur, e)
        except ValueError as ex:
            fails.append(f"edit does not apply: {ex}")
            continue
        field, f, r = e["field"], e["find"], e["replace"]
        if field not in ("answer", "questionType") and isinstance(f, str):
            if rep == "spelling":
                if _digits(f) != _digits(r):
                    fails.append("spelling edit changed a number")
                if _tags(f) != _tags(r):
                    fails.append("spelling edit changed markup/symbols")
                if difflib.SequenceMatcher(None, f, r).ratio() < 0.75:
                    fails.append("spelling edit is not small (similarity < 0.75)")
            elif rep == "exam_reference":
                if not EXAM_TAG.fullmatch(f) or r.strip():
                    fails.append("exam_reference may only delete an exam tag")
            elif rep == "noise":
                if r.strip() or len(f) > 80:
                    fails.append("noise may only delete a short stray string")
            elif rep == "markup_leak":
                if "\\" in r:
                    fails.append("markup_leak replacement still contains a backslash")
            elif rep in ("answer_form", "stem_data"):
                if not _subseq(f, r):
                    fails.append(f"{rep} must be additive (find must survive inside replace)")
                if rep == "stem_data":
                    added = set(re.findall(r"\d+(?:\.\d+)?", r)) - set(re.findall(r"\d+(?:\.\d+)?", f))
                    sol = to_text(body(q).get("solution"))
                    for a in added:
                        if a not in sol:
                            fails.append(f"stem_data introduces value {a} that the stored solution never states")
            elif rep == "option_repair":
                if stem_text(body(q)["question"]) != stem_text(body(new)["question"]):
                    fails.append("option_repair changed the stem text")
            elif rep in ("solution_fix", "solution_missing"):
                key = _key_text(new)
                if key and key not in to_text(body(new)["solution"]):
                    fails.append(f"new solution does not end at the keyed answer ({key})")
        cur = new
    if rep == "answer_key":
        a = [e for e in edits_of(decision) if e["field"] == "answer"]
        if not a:
            fails.append("answer_key repair without an answer edit")
    return fails


def _key_text(q):
    """Text of the keyed answer: option text for scq, number for integer."""
    b = body(q)
    if q["questionType"] == "integerQuestion":
        return str(b.get("answer", "")).strip()
    if q["questionType"] == "scq" and isinstance(b.get("answer"), str):
        t = parse_options(b["question"]).get(b["answer"].strip(), "")
        m = re.search(r"\d+(?:\.\d+)?", t)
        return m.group(0) if m else ""
    return ""


def check_answer_key(q, decision, solver):
    """Highest-stakes repair: only with an independent, agreeing solve and a non-contradicting solution."""
    fails = []
    a = [e for e in edits_of(decision) if e["field"] == "answer"]
    if not a:
        return fails
    new_ans = a[0]["replace"]
    if not solver or not solver.get("answerable", True):
        return ["no usable independent solve"]
    got = solver.get("answer")
    norm_new = ",".join(new_ans) if isinstance(new_ans, list) else str(new_ans)
    norm_got = ",".join(got) if isinstance(got, list) else str(got)
    if norm_new.replace(" ", "") != norm_got.replace(" ", ""):
        fails.append(f"independent solve says {got!r}, edit says {new_ans!r}")
    if not solver.get("methods_agree", False) or solver.get("confidence", 0) < 0.9:
        fails.append("independent solve is not confident / its two methods disagree")
    return fails


def decide_route(q, decision, taxonomy, solver):
    """Returns (route, reasons). Autonomy is earned, never assumed."""
    reasons = []
    v, rep = decision["verdict"], decision.get("repair")
    if v != "defect":
        return "no_change", reasons
    if rep is None:
        return "faculty_review", ["defect without a repair type"]
    reasons += check_scope(decision, taxonomy)
    if not taxonomy["repairs"].get(rep, {"auto": False})["auto"]:
        reasons.append(f"repair '{rep}' requires a human by policy")
    if decision.get("flags", {}).get("abuse"):
        reasons.append("report contains an injection/abuse attempt")
    if decision["confidence"] < AUTO_CONFIDENCE:
        reasons.append(f"confidence {decision['confidence']:.2f} < {AUTO_CONFIDENCE}")
    if rep in ("option_repair", "stem_data", "solution_missing", "notation") and not decision.get("derivable", False):
        reasons.append("new content is not derivable from the record without doubt")
    if not decision.get("edit"):
        reasons.append("no concrete edit to apply")
    else:
        reasons += check_edit_semantics(q, decision)
    if rep == "answer_key":
        reasons += check_answer_key(q, decision, solver)
    return ("faculty_review" if reasons else "auto_apply"), reasons
