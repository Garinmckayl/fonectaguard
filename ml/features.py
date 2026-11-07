"""Feature builder: one row per (business, special day), using ONLY information available at the snapshot date of the season (no leakage)."""
from __future__ import annotations
import csv, json, math, re
from collections import defaultdict
from datetime import date, datetime, timedelta
from ml.common import *

MAJOR = {"XMAS_EVE", "XMAS_DAY", "BOXING_DAY", "NEW_YEARS_DAY", "NYE", "EPIPHANY", "EASTER_SUNDAY", "GOOD_FRIDAY", "EASTER_MONDAY", "MIDSUMMER_EVE", "MIDSUMMER_DAY", "MAY_DAY", "ASCENSION", "INDEPENDENCE_DAY"}
XMAS_CLUSTER = {"DEC23", "XMAS_EVE", "XMAS_DAY", "BOXING_DAY", "INTERDAY", "NYE", "NEW_YEARS_DAY", "EPIPHANY_EVE", "EPIPHANY"}
CLOSE_WORDS = ("kiinni", "suljettu", "stängt", "stengt", "closed", "ovi oli lukossa", "locked", "låst", "ei auki", "inte öppet", "ikke åpent", "aukioloajat", "öppettider", "åpningstider", "opening hours", "wrong hours", "väärät")
PERM_WORDS = ("lopettanut", "pysyvästi", "stängt för gott", "permanent", "lagt ned", "stengt for godt", "closed down")
SRC = {"OWNER_UI": 1, "CONNECT_SUGGESTION": 2, "FONECTA_SUPPORT": 3, "API_INTEGRATION": 4}

ALLKEYS = ["XMAS_EVE", "XMAS_DAY", "BOXING_DAY", "DEC23", "INTERDAY", "NYE", "NEW_YEARS_DAY", "EPIPHANY_EVE", "EPIPHANY", "INDEPENDENCE_DAY", "FATHERS_DAY", "MOTHERS_DAY", "LUCIA", "BLACK_FRIDAY", "ALL_SAINTS", "MAUNDY_THURSDAY", "GOOD_FRIDAY", "EASTER_SATURDAY", "EASTER_SUNDAY", "EASTER_MONDAY", "MAY_EVE", "MAY_DAY", "ASCENSION", "PENTECOST_EVE", "PENTECOST", "WHIT_MONDAY", "NATIONAL_DAY", "MIDSUMMER_EVE", "MIDSUMMER_DAY", "EVENT", "SCHOOL_BREAK"]

def mins(t): return int(t[:2]) * 60 + int(t[3:])
def span(h: str):
    """(first start, last end) in minutes for an hours string; (None, None) when closed."""
    if not h or h == "closed": return None, None
    parts = [p.split("-") for p in h.split(",")]
    s = mins(parts[0][0]); e = mins(parts[-1][1])
    if e <= s and not (parts[-1][0] == "00:00" and parts[-1][1] == "23:59"): e += 1440
    return s, e

class World:
    """Everything loaded once; `snapshot(season)` gives the season-specific views."""
    def __init__(self):
        self.ents = {e["meta"]["id"]: e for e in json.load(open(D("entities.json"), encoding="utf-8"))["response"]["entities"]}
        self.hol = defaultdict(list)
        self.hol_by_ent = defaultdict(list)
        for r in read_jsonl(D("holiday_hours_history.jsonl")):
            self.hol[(r["entity_id"], r["date"])].append(r); self.hol_by_ent[r["entity_id"]].append(r)
        for v in self.hol.values(): v.sort(key=lambda r: r["entered_at"])
        self.reg = defaultdict(list)
        for r in read_jsonl(D("regular_hours_history.jsonl")): self.reg[r["entity_id"]].append(r)
        self.cal = read_csv(D("calendar_special_days.csv"))
        self.dates_by_key = defaultdict(list); self.key_of_date = {}
        for r in self.cal:
            d = date.fromisoformat(r["date"]); self.dates_by_key[(r["country"], r["day_key"])].append(d); self.key_of_date[(r["country"], r["date"])] = r["day_key"]
        self.bench = {(r["country"], r["city_tier"], r["segment"], r["day_key"]): r for r in read_csv(D("peer_benchmarks.csv"))}
        self.tiers = {r["city"]: r["city_tier"] for r in read_csv(D("cities.csv"))}
        self.pilot = defaultdict(dict)
        for r in read_csv(D("pilot_decision_log_2025.csv")): self.pilot[r["entity_id"]][r["day_key"]] = r
        self.contacts = {r["entity_id"]: r for r in read_csv(D("customer_contacts.csv"))}
        self.reviews = defaultdict(list)
        for r in json.load(open(D("reviews.json"), encoding="utf-8"))["response"]["reviews"]: self.reviews[r["locationId"]].append(r)
        self.psug = defaultdict(list)
        for s in json.load(open(D("publisher_suggestions.json"), encoding="utf-8"))["response"]["suggestions"]: self.psug[s["locationId"]].append(s)
        self.splits = {r["entity_id"]: r["split"] for r in read_csv(D("splits.csv"))}
        # Google users' date-specific edit suggestions: (entity, date) -> [(created, 'closed' | 'HH:MM-HH:MM')]
        self.gedits = defaultdict(list)
        for eid, items in self.psug.items():
            for sg in items:
                if sg["fieldName"] != "hours": continue
                try: c = json.loads(sg["suggestedContent"])
                except Exception: continue
                for h in c.get("holidayHours", []):
                    self.gedits[(eid, h["date"])].append((sg["dateCreated"], "closed" if h.get("isClosed") else ",".join(f"{i['start']}-{i['end']}" for i in h.get("openIntervals", []))))

    # ---- hours helpers -------------------------------------------------
    def regular(self, eid, d: date, snap: date):
        cands = [r for r in self.reg[eid] if r["effective_from"] == "before-2024" or r["effective_from"] < snap.isoformat()]
        best = max(cands, key=lambda r: "0000" if r["effective_from"] == "before-2024" else r["effective_from"])
        return day_str(best["hours"][DAYS[d.weekday()]])

    def entry(self, eid, d: date, snap: date):
        """Latest entry for that date entered before the snapshot: (kind, hours, entered_at, source) or None. kind: closed/regular/special."""
        rows = [r for r in self.hol.get((eid, d.isoformat()), []) if r["entered_at"] < snap.isoformat()]
        if not rows: return None
        r = rows[-1]; h = r["holidayHours"]
        if h.get("isRegularHours"): return ("regular", None, r["entered_at"], r["source"])
        s = day_str(h)
        return ("closed" if s == "closed" else "special", s, r["entered_at"], r["source"])

    def shown(self, eid, d, snap):
        e = self.entry(eid, d, snap)
        return self.regular(eid, d, snap) if e is None or e[0] == "regular" else e[1]

def lead_days(entered_at: str, d: date) -> float:
    return (d - date.fromisoformat(entered_at[:10])).days

def prev_dates(w: World, country, key, d: date, n: int):
    """Same special day in the previous n seasons."""
    out = []
    for k in range(1, n + 1):
        out.append([x for x in w.dates_by_key[(country, key)] if cycle(x) == cycle(d) - k])
    return out

def build(w: World, season: int, targets_path: str):
    snap = SNAP[season]
    cutoff = datetime(snap.year, snap.month, snap.day).timestamp() * 1000
    # per-entity owner aggregates over the 12 months before the snapshot
    agg = {}
    lo = (snap - timedelta(days=365)).isoformat()
    for eid, rows in w.hol_by_ent.items():
        latest = {}
        for r in rows:
            if r["entered_at"] < snap.isoformat() and lo <= r["date"] < snap.isoformat(): latest[r["date"]] = r
        n = len(latest); c = sp = rg = 0; mc = mn = 0; leads = []; off_s = []; off_e = []; off_e_x = []
        cur_n = cur_c = cur_x_n = cur_x_c = 0
        for dd, r in latest.items():
            h = r["holidayHours"]; closed = bool(h.get("isClosed")); reg = bool(h.get("isRegularHours"))
            c += closed; rg += reg; sp += (not closed and not reg)
            if r["day_key"] in MAJOR: mn += 1; mc += closed
            leads.append(lead_days(r["entered_at"], date.fromisoformat(dd)))
            if not closed and not reg:
                es, ee = span(day_str(h)); rs, re_ = span(w.regular(eid, date.fromisoformat(dd), snap))
                if es is not None and rs is not None:
                    off_s.append(es - rs); off_e.append(ee - re_)
                    if r["day_key"] in XMAS_CLUSTER: off_e_x.append(ee - re_)
        # entries already made for the coming season (date >= snapshot, entered before it)
        for r in rows:
            if r["entered_at"] < snap.isoformat() and r["date"] >= snap.isoformat():
                closed = bool(r["holidayHours"].get("isClosed")); cur_n += 1; cur_c += closed
                if r["day_key"] in XMAS_CLUSTER: cur_x_n += 1; cur_x_c += closed
        kinds = {}
        for dd, r in latest.items():
            h = r["holidayHours"]; kinds[r["day_key"]] = 1 if h.get("isClosed") else 2 if h.get("isRegularHours") else 3
        curk = {}
        for r in rows:
            if r["entered_at"] < snap.isoformat() and r["date"] >= snap.isoformat():
                h = r["holidayHours"]; curk[r["day_key"]] = 1 if h.get("isClosed") else 2 if h.get("isRegularHours") else 3
        med = lambda xs: (sorted(xs)[len(xs) // 2] if xs else None)
        agg[eid] = dict(kinds=kinds, curk=curk, off_s=med(off_s), off_e=med(off_e), off_e_x=med(off_e_x), off_n=len(off_e), n=n, c=c, sp=sp, rg=rg, mn=mn, mc=mc, lead=sum(leads) / len(leads) if leads else None, cur_n=cur_n, cur_c=cur_c, cur_x_n=cur_x_n, cur_x_c=cur_x_c)

    # complaint signals
    sig = {}
    for eid in w.ents:
        rv = [r for r in w.reviews.get(eid, []) if cutoff - 150 * 86400000 < r["publisherDate"] < cutoff]
        txt = " ".join(r.get("content", "").lower() for r in rv)
        ps = [s for s in w.psug.get(eid, []) if s["dateCreated"] < snap.isoformat() and s["dateCreated"] >= (snap - timedelta(days=200)).isoformat()]
        sig[eid] = dict(rev_n=len(rv), rev_low=sum(1 for r in rv if r["rating"] <= 2), rev_close=sum(1 for w_ in CLOSE_WORDS if w_ in txt), rev_perm=int(any(x in txt for x in PERM_WORDS)),
                        ps_hours=sum(1 for s in ps if s["fieldName"] == "hours" and s["status"] in ("WAITING_ON_CUSTOMER", "ACCEPTED")), ps_closed=sum(1 for s in ps if s["fieldName"] == "closed"), closed_signal=int(any(s["fieldName"] == "closed" and s["dateCreated"] < snap.isoformat() for s in w.psug.get(eid, [])) or any(x in txt for x in PERM_WORDS)), entity_closed=int(bool(w.ents[eid].get("closed"))))

    rows_out = []
    for t in csv.DictReader(open(targets_path, encoding="utf-8")):
        eid, d, key = t["entity_id"], date.fromisoformat(t["date"]), t["day_key"]
        ent = w.ents[eid]; country = ent["meta"]["countryCode"]
        shown = w.shown(eid, d, snap); reg_today = w.regular(eid, d, snap)
        s_start, s_end = span(shown)
        r = dict(entity_id=eid, date=t["date"], day_key=key, day_type=t["day_type"], split=t["split"], country=country, segment=ent["c_segment"],
                 tier=w.tiers.get(ent["address"]["city"], "?"), weekday=d.weekday(), shown=shown, shown_closed=int(shown == "closed"), reg_closed=int(reg_today == "closed"),
                 shown_start=s_start, shown_end=s_end, shown_len=(s_end - s_start) if s_start is not None else 0, has_mall=int(bool(ent.get("c_shoppingCenterEntityId"))),
                 event_id=t.get("event_id") or None, city=ent["address"]["city"], mall=ent.get("c_shoppingCenterEntityId"), days_ahead=(d - snap).days, is_event=int(key == "EVENT"), is_school=int(key == "SCHOOL_BREAK"), opted_out=int(w.contacts.get(eid, {}).get("opted_out_of_suggestions") == "1"))
        # same day in previous seasons
        for k, dates in enumerate(prev_dates(w, country, key, d, 2), start=1):
            e = next(filter(None, (w.entry(eid, p, snap) for p in dates)), None)
            pd_ = dates[0] if dates else None
            r[f"ly{k}_kind"] = {"closed": 1, "regular": 2, "special": 3}[e[0]] if e else 0
            ls, le = span(e[1]) if e and e[1] else (None, None)
            r[f"ly{k}_start"], r[f"ly{k}_end"] = ls, le
            r[f"ly{k}_lead"] = lead_days(e[2], pd_) if e and pd_ else None
            r[f"ly{k}_src"] = SRC.get(e[3], 0) if e else 0
            r[f"ly{k}_hours"] = ("closed" if e and e[0] == "closed" else (reg_today if e and e[0] == "regular" else (e[1] if e else None)))
        # Google users' edits for the same day in earlier seasons (accurate but sparse) and for this very date, if filed before the snapshot
        ev = [v for dates in prev_dates(w, country, key, d, 2) for p_ in dates for v in w.gedits.get((eid, p_.isoformat()), []) if v[0] < snap.isoformat()]
        cur = [v for v in w.gedits.get((eid, t["date"]), []) if v[0] < snap.isoformat()]
        r["ge_prev_state"] = (0 if not ev else (1 if ev[-1][1] == "closed" else 2)); r["ge_prev_hours"] = ev[-1][1] if ev and ev[-1][1] != "closed" else None
        r["ge_cur_state"] = (0 if not cur else (1 if cur[-1][1] == "closed" else 2)); r["ge_cur_hours"] = cur[-1][1] if cur and cur[-1][1] != "closed" else None
        # shopping centre
        mall = ent.get("c_shoppingCenterEntityId"); m = w.entry(mall, d, snap) if mall else None
        # ... and what the centre did on the same day in the previous seasons (tenants follow the centre, whose own hours for this year come late)
        ml = next(filter(None, (w.entry(mall, p_, snap) for dates in prev_dates(w, country, key, d, 1) for p_ in dates)), None) if mall else None
        r["mall_ly_kind"] = {"closed": 1, "regular": 2, "special": 3}[ml[0]] if ml else 0
        r["mall_ly_hours"] = ("closed" if ml and ml[0] == "closed" else (ml[1] if ml and ml[0] == "special" else None))
        r["mall_kind"] = {"closed": 1, "regular": 2, "special": 3}[m[0]] if m else 0
        r["mall_hours"] = ("closed" if m and m[0] == "closed" else (m[1] if m and m[0] == "special" else None))
        # peers
        b = w.bench.get((country, r["tier"], ent["c_segment"], key))
        f = lambda x: float(b[x]) if b and b.get(x) not in (None, "") else None
        r.update(peer_n=f("n_entity_days"), peer_noexc=f("share_no_exception_entered"), peer_closed=f("share_entered_closed"), peer_special=f("share_entered_special_hours"),
                 peer_regular=f("share_entered_regular"), peer_closed_among=f("closed_share_among_entered"), peer_open=(mins(b["median_open_special"]) if b and b.get("median_open_special") else None),
                 peer_close=(mins(b["median_close_special"]) if b and b.get("median_close_special") else None))
        r["peer_start_delta"] = (r["peer_open"] - s_start) if r["peer_open"] is not None and s_start is not None else None
        r["peer_end_delta"] = (r["peer_close"] - s_end) if r["peer_close"] is not None and s_end is not None else None
        # owner aggregates + signals
        a = agg.get(eid, {}); n = a.get("n", 0)
        r.update(own_n=n, own_closed_share=(a["c"] / n if n else None), own_special_share=(a["sp"] / n if n else None), own_regular_share=(a["rg"] / n if n else None),
                 own_major_n=a.get("mn", 0), own_major_closed=(a["mc"] / a["mn"] if a.get("mn") else None), own_lead=a.get("lead"), own_off_start=a.get("off_s"), own_off_end=a.get("off_e"), own_off_end_x=a.get("off_e_x"), own_off_n=a.get("off_n", 0),
                 cur_n=a.get("cur_n", 0), cur_closed_share=(a["cur_c"] / a["cur_n"] if a.get("cur_n") else None), cur_x_n=a.get("cur_x_n", 0), cur_x_closed=(a["cur_x_c"] / a["cur_x_n"] if a.get("cur_x_n") else None))
        r.update(sig[eid])
        for k_ in ALLKEYS:
            r[f"k_{k_}"] = a.get("kinds", {}).get(k_, 0)      # what the owner did on that special day in the last 12 months
            r[f"c_{k_}"] = a.get("curk", {}).get(k_, 0)       # what the owner has already entered for that day this season
        # 2025 pilot outcome for the same day (only legitimately known for the 2026 season; sent in Dec 2025)
        pr = w.pilot.get(eid, {}).get(key) if season == 2026 else None
        r["pilot_decision"] = {"ACCEPTED": 1, "EDITED": 2, "REJECTED": 3, "NO_RESPONSE": 4}.get(pr["decision"], 0) if pr else 0
        r["pilot_final"] = (pr["final_hours"] or None) if pr and pr["decision"] in ("ACCEPTED", "EDITED") else None
        if pr and pr["decision"] == "ACCEPTED": r["pilot_final"] = pr["suggested_hours"]
        r["pilot_basis"] = {"LAST_YEAR_EXCEPTION": 1, "SHOPPING_CENTRE_HOURS": 2, "PEER_MAJORITY": 3}.get(pr["basis"], 0) if pr else 0
        rows_out.append(r)
    return rows_out
