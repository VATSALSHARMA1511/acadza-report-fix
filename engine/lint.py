"""Deterministic checks. Cheap, explainable, and run BEFORE any LLM call.
They (a) give the LLM hard facts to reason from and (b) let code veto the LLM later."""
import re
from textutil import body, parse_options, to_text, norm

INJECTION = re.compile(
    r"ignore (all )?(the )?(previous|prior|above) (instructions|prompt)|you are (now )?(the )?(admin|system|developer)|"
    r"system prompt|mark (this|the) report as|change the answer to|override|jailbreak|act as", re.I)
EXAM_TAG = re.compile(r"\(\s*(JEE|NEET|AIEEE|AIPMT|IIT|CBSE)[^)]*\d{4}[^)]*\)", re.I)
RAW_LATEX = re.compile(r"\\(frac|sqrt|times|alpha|beta|theta|mu|pi|AA|text|left|right|cdot|degree|vec)\b|\$[^$]+\$")
FIGURE_REF = re.compile(r"\b(as shown in (the )?(given )?(figure|diagram)|in the (figure|diagram)|figure (shows|given)|shown (below|above))\b", re.I)


def lint_report_comment(comment):
    c = (comment or "").strip()
    out = {"empty": len(c) == 0, "injection": bool(INJECTION.search(c)), "very_short": 0 < len(c) <= 6}
    letters = re.sub(r"[^a-zA-Z]", "", c)
    low = letters.lower()
    rows = ("qwertyuiop", "asdfghjkl", "zxcvbnm")
    mash = any(low[i:i + 4] in row for row in rows for i in range(max(0, len(low) - 3)))  # keyboard-row run
    out["gibberish"] = len(low) >= 5 and (mash or not re.search(r"[aeiou]", low))
    return out


def lint_question(q):
    b = body(q)
    qt, sol, ans = b.get("question") or "", b.get("solution") or "", b.get("answer")
    qtext = to_text(qt)
    f = []
    opts = parse_options(qt)
    t = q["questionType"]

    if t in ("scq", "mcq"):
        have = sorted(opts)
        missing = [x for x in "ABCD" if x not in opts]
        if missing:
            f.append({"id": "missing_option", "detail": f"option(s) {','.join(missing)} not present in stem", "severity": "high"})
        blanks = [k for k, v in opts.items() if not v.strip()]
        if blanks:
            f.append({"id": "blank_option", "detail": f"option(s) {','.join(blanks)} are blank", "severity": "high"})
        seen = {}
        for k, v in opts.items():
            if v.strip():
                seen.setdefault(norm(v), []).append(k)
        dups = [v for v in seen.values() if len(v) > 1]
        if dups:
            f.append({"id": "identical_options", "detail": "options " + " and ".join("/".join(d) for d in dups) + " have identical text", "severity": "high"})

    if t == "mcq":
        if not isinstance(ans, list) or any((not isinstance(x, str)) or not re.fullmatch(r"[A-D]", x.strip()) for x in ans):
            f.append({"id": "malformed_answer", "detail": f"mcq answer {ans!r} is not a clean list of option letters", "severity": "high"})
        good = [x for x in (ans if isinstance(ans, list) else []) if isinstance(x, str) and re.fullmatch(r"[A-D]", x.strip())]
        if len(good) == 1:
            f.append({"id": "mcq_single_key", "detail": "stored as multiple-correct but exactly one valid letter in key (type mismatch?)", "severity": "medium"})
    if t == "scq" and not (isinstance(ans, str) and re.fullmatch(r"[A-D]", ans.strip())):
        f.append({"id": "malformed_answer", "detail": f"scq answer {ans!r} invalid", "severity": "high"})
    if t == "integerQuestion" and not (isinstance(ans, str) and re.fullmatch(r"-?\d+(\.\d+)?", ans.strip())):
        f.append({"id": "malformed_answer", "detail": f"integer answer {ans!r} invalid", "severity": "high"})

    for name, s in (("question", qt), ("solution", sol)):
        if RAW_LATEX.search(re.sub(r"<[^>]+>", " ", s)) or (name == "solution" and "\\AA" in s):
            f.append({"id": "raw_latex", "detail": f"raw LaTeX visible in {name}", "severity": "medium"})
    m = EXAM_TAG.search(qtext)
    if m:
        f.append({"id": "exam_tag", "detail": f"exam reference tag {m.group(0)!r} inside stem", "severity": "low"})
    if FIGURE_REF.search(qtext) and not b.get("quesImages") and "<img" not in qt:
        f.append({"id": "figure_missing", "detail": "stem refers to a figure but record has no image", "severity": "high"})
    if not sol.strip():
        f.append({"id": "solution_missing", "detail": "no stored solution", "severity": "medium"})
    if q.get("errorHistory"):
        h = q["errorHistory"][-1]
        f.append({"id": "error_history", "detail": f"{h['actor']} already fixed '{h['type']}' on {h['at'][:10]}: {h.get('note','')}", "severity": "info"})
    return f
