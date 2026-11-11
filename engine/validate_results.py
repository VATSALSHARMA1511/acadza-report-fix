#!/usr/bin/env python3
"""Checks results.json against the brief: schema, closed taxonomy, scope, edits apply, one row per report."""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from apply import apply_edit, edits_of
R = json.load(open(f"{ROOT}/results.json")); T = json.load(open(f"{ROOT}/data/taxonomy.json"))
reports = json.load(open(f"{ROOT}/data/reports.json")); Q = {q["_id"]: q for q in json.load(open(f"{ROOT}/data/questions.json"))}
errs = []
need = {"reportId", "questionId", "verdict", "repair", "edit", "route", "confidence", "evidence", "student_reply"}
ids = [r["reportId"] for r in R]
if sorted(ids) != sorted(x["reportId"] for x in reports) or len(set(ids)) != len(ids): errs.append("not exactly one row per report")
rep_q = {x["reportId"]: x["questionId"] for x in reports}
for r in R:
    i = r["reportId"]
    if need - set(r): errs.append(f"{i}: missing keys {need - set(r)}")
    if rep_q.get(i) != r["questionId"]: errs.append(f"{i}: wrong questionId")
    if r["verdict"] not in T["verdicts"]: errs.append(f"{i}: bad verdict")
    if r["route"] not in ("auto_apply", "faculty_review", "no_change"): errs.append(f"{i}: bad route")
    if not 0 <= r["confidence"] <= 1: errs.append(f"{i}: confidence range")
    sents = [s for s in re.split(r"(?<=[.!?])\s+", r["student_reply"].strip()) if s.strip()]
    if not 1 <= len(sents) <= 3: errs.append(f"{i}: reply should be 1-3 sentences ({len(sents)}): {r['student_reply'][:60]}")
    if r["verdict"] != "defect":
        if r["repair"] or r["edit"]: errs.append(f"{i}: non-defect has repair/edit")
        if r["route"] != "no_change": errs.append(f"{i}: non-defect must be no_change")
    else:
        if r["repair"] not in T["repairs"]: errs.append(f"{i}: bad repair"); continue
        rp = T["repairs"][r["repair"]]
        if r["route"] == "auto_apply" and not rp["auto"]: errs.append(f"{i}: auto_apply on auto:false repair")
        if not rp["auto"] and r["edit"]: errs.append(f"{i}: edit on auto:false repair")
        for e in edits_of(r):
            if e["field"] not in rp["fields"]: errs.append(f"{i}: edit field {e['field']} outside repair scope")
        if r["route"] == "auto_apply":
            q = Q[r["questionId"]]
            try:
                for e in edits_of(r): q = apply_edit(q, e)
            except ValueError as ex: errs.append(f"{i}: auto edit does not apply: {ex}")
print("\n".join(errs) if errs else f"results.json OK: {len(R)} rows, schema + taxonomy + scope + edit-application verified")
sys.exit(1 if errs else 0)
