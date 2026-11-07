"""Port of the organizers' rule baseline ('copy last year -> shopping centre -> peers'), used only to validate our scorer against their published numbers."""
from __future__ import annotations
import csv, json, sys
from collections import defaultdict
from datetime import date, datetime
from ml.common import *

PERM_WORDS = ("lopettanut", "pysyvästi", "stängt för gott", "permanent", "lagt ned", "stengt for godt", "closed down")

class Baseline:
    def __init__(self, season):
        self.season, self.snap = season, SNAP[season]
        self.ents = {e["meta"]["id"]: e for e in json.load(open(D("entities.json"), encoding="utf-8"))["response"]["entities"]}
        self.hol = defaultdict(list)
        for r in read_jsonl(D("holiday_hours_history.jsonl")): self.hol[(r["entity_id"], r["date"])].append(r)
        self.reg = defaultdict(list)
        for r in read_jsonl(D("regular_hours_history.jsonl")): self.reg[r["entity_id"]].append(r)
        self.cal = read_csv(D("calendar_special_days.csv"))
        self.bench = {(r["country"], r["city_tier"], r["segment"], r["day_key"]): r for r in read_csv(D("peer_benchmarks.csv"))}
        self.tiers = {r["city"]: r["city_tier"] for r in read_csv(D("cities.csv"))}
        reviews = json.load(open(D("reviews.json"), encoding="utf-8"))["response"]["reviews"]
        sugg = json.load(open(D("publisher_suggestions.json"), encoding="utf-8"))["response"]["suggestions"]
        cutoff = datetime(self.snap.year, self.snap.month, self.snap.day).timestamp() * 1000
        self.closed_signal = set()
        for r in reviews:
            if cutoff - 150 * 86400000 < r["publisherDate"] < cutoff and any(w in r["content"].lower() for w in PERM_WORDS): self.closed_signal.add(r["locationId"])
        for s in sugg:
            if s["fieldName"] == "closed" and s["dateCreated"] < self.snap.isoformat(): self.closed_signal.add(s["locationId"])
        self.dates_by_key = defaultdict(list)
        for r in self.cal: self.dates_by_key[(r["country"], r["day_key"])].append(date.fromisoformat(r["date"]))

    def regular(self, eid, d):
        cands = [r for r in self.reg[eid] if r["effective_from"] == "before-2024" or r["effective_from"] < self.snap.isoformat()]
        best = max(cands, key=lambda r: "0000" if r["effective_from"] == "before-2024" else r["effective_from"])
        return day_str(best["hours"][DAYS[d.weekday()]])

    def entry(self, eid, d, as_of):
        rows = [r for r in self.hol.get((eid, d.isoformat()), []) if r["entered_at"] < as_of.isoformat()]
        if not rows: return None
        h = max(rows, key=lambda r: r["entered_at"])["holidayHours"]
        return "REGULAR" if h.get("isRegularHours") else day_str(h)

    def displayed(self, eid, d):
        e = self.entry(eid, d, self.snap)
        return self.regular(eid, d) if e is None or e == "REGULAR" else e

    def predict(self, eid, d, key):
        ent = self.ents[eid]
        if eid in self.closed_signal and not ent.get("closed"): return "FLAG", ""
        shown = self.displayed(eid, d)
        cand = None
        mall = ent.get("c_shoppingCenterEntityId")
        if mall:
            m = self.entry(mall, d, self.snap)
            if m and m != "REGULAR": cand = m
        if cand is None:
            for p in [x for x in self.dates_by_key[(ent["meta"]["countryCode"], key)] if cycle(x) == cycle(d) - 1]:
                last = self.entry(eid, p, self.snap)
                if last is not None: cand = self.regular(eid, d) if last == "REGULAR" else last
        if cand is None:
            b = self.bench.get((ent["meta"]["countryCode"], self.tiers[ent["address"]["city"]], ent["c_segment"], key))
            if b and b["closed_share_among_entered"] and float(b["closed_share_among_entered"]) >= 0.7 and float(b["share_entered_closed"]) >= 0.15 and shown != "closed": cand = "closed"
        return ("SUGGEST", cand) if cand and cand != shown else ("NO_ACTION", "")

if __name__ == "__main__":
    season = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    bl = Baseline(season)
    tf = E("targets_2026.csv" if season == 2026 else "targets_2025_backtest.csv")
    out = f"challenge_out/baseline_port_{season}.csv"
    n = 0
    with open(tf, encoding="utf-8") as f, open(out, "w", newline="", encoding="utf-8") as g:
        w = csv.writer(g); w.writerow(["entity_id", "date", "action", "hours", "confidence"])
        for r in csv.DictReader(f):
            a, h = bl.predict(r["entity_id"], date.fromisoformat(r["date"]), r["day_key"])
            if a != "NO_ACTION": w.writerow([r["entity_id"], r["date"], a, h, 0.6]); n += 1
    print("wrote", n, "->", out)
