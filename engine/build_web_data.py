"""Bundle engine output into web/data.js (a plain <script>, so the console also works from file://)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
ld = lambda p: json.load(open(os.path.join(ROOT, p), encoding="utf-8"))
data = {"cases": ld("engine/console_cases.json"), "questions": ld("data/questions.json"),
        "taxonomy": ld("data/taxonomy.json"), "findings": ld("engine/unreported_findings.json")}
with open(os.path.join(ROOT, "web", "data.js"), "w", encoding="utf-8") as f:
    f.write("window.DATA = " + json.dumps(data, ensure_ascii=False) + ";\n")
print("web/data.js written")
