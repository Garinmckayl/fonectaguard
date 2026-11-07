"""Builds an extra TRAINING season (Christmas 2024) from the dev businesses' true-hours history, using only what was known on 6 Nov 2024."""
import csv, pandas as pd
from ml.common import *
from ml.features import World, build

tt = pd.read_csv(L("dev_truth_history.csv"))
win = tt[(tt.date >= "2024-11-07") & (tt.date <= "2025-01-06")].copy()
ents = {}
w = World()
cal = {(r["country"], r["date"]): r for r in w.cal}
rows = []
for r in win.itertuples():
    c = w.ents[r.entity_id]["meta"]["countryCode"]; cr = cal.get((c, r.date))
    rows.append(dict(entity_id=r.entity_id, date=r.date, day_key=r.day_key, day_type=(cr["day_type"] if cr else "OTHER"), event_id=(r.event_id if isinstance(r.event_id, str) else ""), country=c, split="dev"))
tp = "challenge_out/targets_2024.csv"
pd.DataFrame(rows).to_csv(tp, index=False)
feat = pd.DataFrame(build(w, 2024, tp))
# labels: what the listing showed at the snapshot vs the truth
lab = win.rename(columns={"truth_hours": "truth_hours"})[["entity_id", "date", "truth_hours"]].merge(feat[["entity_id", "date", "shown"]], on=["entity_id", "date"])
lab["displayed_hours_at_snapshot"] = lab.shown
lab["expected_action"] = ["SUGGEST" if a != b else "NO_ACTION" for a, b in zip(lab.truth_hours, lab.shown)]
lab["expected_search_views"] = 1.0
lab["mismatch_type"] = ""
lab[["entity_id", "date", "truth_hours", "displayed_hours_at_snapshot", "expected_action", "expected_search_views", "mismatch_type"]].to_csv("challenge_out/labels_2024.csv", index=False)
feat.to_pickle("challenge_out/feat_2024.pkl")
print("2024 season rows:", len(feat), "| need change:", (lab.expected_action == "SUGGEST").mean().round(3), "| closed share of changes:", (lab[lab.expected_action == "SUGGEST"].truth_hours == "closed").mean().round(3))
