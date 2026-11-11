"""Small helpers: HTML/MathML -> plain text, option parsing, doc access."""
import html
import re


def to_text(s):
    """Flatten production HTML + inline MathML into readable plain text (lossy; for checks only)."""
    if s is None:
        return ""
    s = re.sub(r"<msqrt>\s*(.*?)\s*</msqrt>", r"sqrt(\1)", s, flags=re.S)
    s = re.sub(r"<msup>\s*(.*?)\s*</msup>", r"\1^", s, flags=re.S)
    s = re.sub(r"<msub>\s*(.*?)\s*</msub>", r"\1_", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</(h\d|p|div)>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t ​]+", " ", s)
    return re.sub(r"\n\s*\n+", "\n", s).strip()


def body(q):
    """The per-type sub-document, e.g. q['scq']."""
    return q[q["questionType"]]


def get_field(q, field):
    if field == "questionType":
        return q["questionType"]
    return body(q).get(field)


def _label_positions(t):
    ms = [(m.group(1), m.start(), m.end()) for m in re.finditer(r"\(([A-D])\)", t)]
    # use the LAST (A) so "Assertion (A)" in a stem is not mistaken for option A
    last_a = max((i for i, m in enumerate(ms) if m[0] == "A"), default=None)
    if last_a is None:
        return []
    seq, want = [], "A"
    for m in ms[last_a:]:
        if m[0] == want:
            seq.append(m)
            want = chr(ord(want) + 1)
    return seq


def parse_options(question_html):
    """Return {'A': 'text', ...} parsed from the plain text of the stem. Empty text = blank option."""
    t = to_text(question_html)
    pos = _label_positions(t)
    opts = {}
    for i, (lab, s0, e0) in enumerate(pos):
        end = pos[i + 1][1] if i + 1 < len(pos) else len(t)
        opts[lab] = t[e0:end].strip()
    return opts


def stem_text(question_html):
    t = to_text(question_html)
    pos = _label_positions(t)
    return t[: pos[0][1]].strip() if pos else t


def norm(s):
    return re.sub(r"\s+", "", s or "").lower()
