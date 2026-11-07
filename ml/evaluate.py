"""Our own port of the challenge scoring rules (the organizers' evaluate.py was read, not executed).

Rules (from the brief), per target row; score = 100 * points / rows that need a suggestion or a flag:
  needs a change : exact +1 | same state & both ends within 30 min +0.6 | same state +0.2 | wrong state -1 | FLAG +0.05 | NO_ACTION 0
  already correct: NO_ACTION 0 | FLAG -0.1 | SUGGEST same as shown -0.1 | SUGGEST other -0.5 | SUGGEST wrong state -1
  closed for good: FLAG +1 | SUGGEST 'closed' +0.3 | SUGGEST open -1
"""
from __future__ import annotations
import csv, re, sys
from collections import Counter, defaultdict

HOURS_RE = re.compile(r"^(closed|\d{2}:\d{2}-\d{2}:\d{2}(,\d{2}:\d{2}-\d{2}:\d{2})*)$")

def ivs(s):
    if s == "closed": return []
    out = []
    for iv in s.split(","):
        a, b = iv.split("-")
        sa, sb = int(a[:2]) * 60 + int(a[3:]), int(b[:2]) * 60 + int(b[3:])
        if sb <= sa and not (a == "00:00" and b == "23:59"): sb += 1440
        out.append((sa, sb))
    return out

def norm(s):
    s = (s or "").strip().lower().replace(" ", "")
    return "closed" if s in ("", "closed", "kiinni", "stängt", "stengt") else s

def near(a, b, tol=30):
    ia, ib = ivs(a), ivs(b)
    if not ia or not ib: return not ia and not ib
    return abs(ia[0][0] - ib[0][0]) <= tol and abs(ia[-1][1] - ib[-1][1]) <= tol

def load_predictions(path):
    preds = {}
    with open(path, encoding="utf-8-sig") as f:
        for i, r in enumerate(csv.DictReader(f), start=2):
            a = (r.get("action") or "").strip().upper()
            if a not in ("SUGGEST", "NO_ACTION", "FLAG"): raise ValueError(f"line {i}: bad action")
            h = norm(r.get("hours"))
            if a == "SUGGEST" and not HOURS_RE.match(h): raise ValueError(f"line {i}: invalid hours {r.get('hours')!r}")
            k = (r["entity_id"].strip(), r["date"].strip())
            if k in preds: raise ValueError(f"line {i}: duplicate row for {k}")
            preds[k] = (a, h, r.get("confidence"))
    return preds

def score(preds, labels_path):
    labels = list(csv.DictReader(open(labels_path, encoding="utf-8")))
    pts, mx = 0.0, 0
    c, contacted = Counter(), defaultdict(int)
    views_saved = views_at_risk = vis_saved = vis_at_risk = 0.0
    for r in labels:
        a, h, _ = preds.get((r["entity_id"], r["date"]), ("NO_ACTION", "", None))
        exp, truth, shown = r["expected_action"], r["truth_hours"], r["displayed_hours_at_snapshot"]
        v = float(r.get("expected_search_views") or 0)
        if a == "SUGGEST": contacted[r["entity_id"]] += 1
        if exp == "SUGGEST":
            mx += 1; vis_at_risk += v
            if r["mismatch_type"] == "SHOWN_OPEN_ACTUALLY_CLOSED": views_at_risk += v
            if a == "SUGGEST":
                if h == truth: p = 1.0; c["exact"] += 1
                elif (h == "closed") != (truth == "closed"): p = -1.0; c["harmful_wrong_state"] += 1
                elif near(h, truth): p = 0.6; c["near"] += 1
                else: p = 0.2; c["same_state_off"] += 1
                if p > 0.5:
                    vis_saved += v
                    if r["mismatch_type"] == "SHOWN_OPEN_ACTUALLY_CLOSED": views_saved += v
            elif a == "FLAG": p = 0.05; c["flag_on_change"] += 1
            else: p = 0.0; c["missed"] += 1
        elif exp == "FLAG":
            mx += 1
            if a == "FLAG": p = 1.0; c["flag_correct"] += 1
            elif a == "SUGGEST": p = 0.3 if h == "closed" else -1.0; c["suggest_to_closed_business"] += 1
            else: p = 0.0; c["missed_closed_business"] += 1
        else:
            if a == "SUGGEST":
                if h == shown: p = -0.1; c["redundant_confirm"] += 1
                elif (h == "closed") != (shown == "closed"): p = -1.0; c["harmful_wrong_state"] += 1
                else: p = -0.5; c["spam_wrong_hours"] += 1
            elif a == "FLAG": p = -0.1; c["unneeded_flag"] += 1
            else: p = 0.0; c["correct_silence"] += 1
        pts += p
    keys = {(r["entity_id"], r["date"]) for r in labels}
    n_sug = sum(1 for k, (a, _, _) in preds.items() if a == "SUGGEST" and k in keys)
    need_sug = sum(1 for r in labels if r["expected_action"] == "SUGGEST")
    return {
        "score_0_100": round(max(0.0, 100 * pts / mx), 2) if mx else 0.0, "rows": len(labels), "rows_needing_action": mx, "suggestions_made": n_sug,
        "precision_exact": round(c["exact"] / n_sug, 3) if n_sug else 0.0, "recall_exact": round(c["exact"] / max(1, need_sug), 3),
        "harmful_suggestions": c["harmful_wrong_state"],
        "search_views_protected_pct": round(100 * vis_saved / vis_at_risk, 1) if vis_at_risk else 0.0,
        "closed_door_views_prevented_pct": round(100 * views_saved / views_at_risk, 1) if views_at_risk else 0.0,
        "businesses_contacted": len(contacted), "breakdown": dict(c),
    }

if __name__ == "__main__":
    import json
    p = sys.argv[1]; lab = sys.argv[2] if len(sys.argv) > 2 else "challenge/labels/dev_labels_2026.csv"
    print(json.dumps(score(load_predictions(p), lab), indent=1))
