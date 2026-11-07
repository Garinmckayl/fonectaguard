"""Final fit on all labelled dev data -> predictions_2026.csv (for the scorer) and suggestions_2026.json (for the Connect loop, with reasons)."""
from __future__ import annotations
import json, math, sys, numpy as np, pandas as pd
from datetime import date, datetime, timedelta
from ml.train import *
from ml.features import World, ALLKEYS, CLOSE_WORDS
from ml.common import *

TC, TO, TR = 0.65, 0.25, 0.75
LABEL = {"closed": "closed"}
# How sure the model is decides how the owner is asked (measured out-of-fold on dev, see README):
#   auto     >= 0.95  applied at once for owners with standing permission, then told (94.5% exact)
#   one_tap  >= 0.80  one suggestion, approve / edit / no thanks
#   ask      <  0.80  a choice: the suggestion, one alternative, or "keep what Google shows" (right answer offered ~90%)
#   ask also for days the scorer would leave silent but where a change is likely (p >= ASK_MIN)
TIER_AUTO, TIER_ONE_TAP, ASK_MIN = 0.95, 0.80, 0.60

def tier_of(conf): return "auto" if conf >= TIER_AUTO else "one_tap" if conf >= TIER_ONE_TAP else "ask"

def options_for(r, act, hrs, reg_h, p):
    """Answers to offer when the model is unsure: the suggestion first, then the other likely state. 'Keep what Google shows' is always added by the app."""
    o = [hrs] if act == "SUGGEST" and hrs else []
    alt = []
    if not r.shown_closed: alt.append("closed")
    c, _ = candidate(r)
    if c and c != r.shown: alt.append(c)
    elif isinstance(reg_h, str) and reg_h != r.shown: alt.append(reg_h)
    if not o: alt.sort(key=lambda x: 0 if (x == "closed") == (p[1] >= p[2]) else 1)
    return [x for x in dict.fromkeys(o + alt) if x and x != r.shown][:2]

def last_year_date(w, r):
    d = date.fromisoformat(r.date)
    same = [x for x in w.dates_by_key.get((r.country, r.day_key), []) if cycle(x) == cycle(d) - 1]
    if len(same) == 1: return same[0]
    try: return d.replace(year=d.year - 1)
    except ValueError: return d - timedelta(days=365)

def cost_of(w, r, views_est, AN):
    """What wrong hours cost this business, from its own data: expected lookups this year, and what happened on the same day last year."""
    ly = last_year_date(w, r); lys = ly.isoformat()
    a = AN.get((r.entity_id, lys))
    out = dict(views=int(round(views_est)), ly_date=lys, ly_views=int(a[0]) if a else None, ly_actions=int(a[1]) if a else None, ly_calls=int(a[2]) if a else None, late=None, reviews=None)
    rows = w.hol.get((r.entity_id, lys), [])
    if rows and rows[0]["entered_at"][:10] >= lys:   # hours for that day were only entered on or after the day itself
        out["late"] = dict(entered=rows[0]["entered_at"][:10], shown=w.regular(r.entity_id, ly, ly))
    lo = datetime(ly.year, ly.month, ly.day).timestamp() * 1000
    rv = [x for x in w.reviews.get(r.entity_id, []) if lo <= x["publisherDate"] < lo + 10 * 86400000 and any(k in (x.get("content") or "").lower() for k in CLOSE_WORDS)]
    if rv:
        q = rv[0]["content"].strip()
        out["reviews"] = dict(n=len(rv), quote=q if len(q) <= 120 else q[:117].rsplit(" ", 1)[0] + "…", rating=rv[0]["rating"])
    return out

def fit_final():
    d26, d25 = load(2026), load(2025)
    dev26 = d26[d26.split == "dev"].reset_index(drop=True); dev25 = d25.reset_index(drop=True)
    tr = pd.concat([dev26, dev25], ignore_index=True)
    tr["label"] = [label_of(r) for r in tr.itertuples()]; tr = tr[tr.label >= 0].reset_index(drop=True)
    tr = add_offsets(tr); X = prep(tr); y = tr.label.values
    class_models = []
    for seed in (7, 11, 23):
        PARAMS["seed"] = seed; class_models.append(fit(X, y))
    return class_models, fit_hours(X, tr), X, PeerHours(tr)

def predict_all(class_models, hours_models, X_ref, peer):
    df = pd.read_pickle("challenge_out/feat_2026.pkl")
    if USE_CTX: df = add_context(df)
    X = prep(df)
    for c in CATS: X[c] = pd.Categorical(X[c], categories=X_ref[c].cat.categories)   # same category codes as training
    P = np.mean([m.predict(X) for m in class_models], axis=0)
    reg = [peer.predict(r) or h for r, h in zip(df.itertuples(), predict_hours(hours_models, X, df))]
    return df, P, reg

def pct(x): return f"{round(100 * x)}%"

def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))

def context_reason(r, ent, EV, SB):
    """Event nights and school breaks: cite the actual event / break (structured, localized in the app)."""
    if r.day_key == "EVENT" and isinstance(r.event_id, str) and r.event_id in EV:
        e = EV[r.event_id]; pos = e["location"]["position"]["coordinates"]; g = ent.get("geocodedCoordinate") or {}
        dist = km((g.get("latitude"), g.get("longitude")), (pos[1], pos[0])) if g.get("latitude") else None
        return {"k": "event", "name": e["name"], "venue": e["location"]["name"]["en"], "from": e["start_time"][11:16], "to": e["end_time"][11:16], "att": e["x_expected_attendance"], "km": round(dist, 1) if dist is not None else None}
    if r.day_key == "SCHOOL_BREAK":
        b = next((x for x in SB if x["country"] == r.country and x["start"] <= r.date <= x["end"]), None)
        if b: return {"k": "school_break", "name": b["break"], "start": b["start"], "end": b["end"]}
    return None

def reasons(r, ent, mall_name, p, action, hours, EV=None, SB=()):
    """Evidence for one suggestion, strongest first, as structured facts. Everything cited is a fact from the data; the app writes it in the owner's language."""
    out, basis = [], None
    ok = lambda x: isinstance(x, float) and x == x
    if action == "FLAG": return "closed_for_good", [{"k": "flag_closed_for_good"}]
    cr = context_reason(r, ent, EV or {}, SB)
    if cr: out.append(cr); basis = "event" if r.day_key == "EVENT" else "school_break"
    if r.pilot_decision in (1, 2) and isinstance(r.pilot_final, str): out.append({"k": "pilot", "hours": r.pilot_final}); basis = basis or "pilot"
    if r.ly1_kind == 1 and hours == "closed": out.append({"k": "last_year", "hours": "closed"}); basis = basis or "last_year"
    elif r.ly1_kind == 3 and isinstance(r.ly1_hours, str) and r.ly1_hours == hours: out.append({"k": "last_year", "hours": hours}); basis = basis or "last_year"
    elif r.ly2_kind in (1, 3) and isinstance(r.ly2_hours, str) and r.ly2_hours == hours: out.append({"k": "two_years", "hours": hours}); basis = basis or "last_year"
    if hours and ((r.ge_cur_state in (1, 2) and (hours == "closed") == (r.ge_cur_state == 1)) or (r.ge_prev_state in (1, 2) and (hours == "closed") == (r.ge_prev_state == 1))):
        out.append({"k": "gedit", "hours": hours, "when": "cur" if r.ge_cur_state in (1, 2) else "prev"}); basis = basis or "google_edits"
    if r.mall_kind not in (1, 3) and r.mall_ly_kind in (1, 3) and mall_name and isinstance(r.mall_ly_hours, str) and r.mall_ly_hours == hours: out.append({"k": "mall_ly", "mall": mall_name, "hours": hours}); basis = basis or "shopping_centre"
    if r.mall_kind in (1, 3) and mall_name and isinstance(r.mall_hours, str) and r.mall_hours == hours: out.append({"k": "mall", "mall": mall_name, "hours": hours}); basis = basis or "shopping_centre"
    if hours == "closed" and r.own_major_n >= 2 and ok(r.own_major_closed) and r.own_major_closed >= 0.7:
        out.append({"k": "own_majors", "k_closed": round(r.own_major_closed * r.own_major_n), "n": int(r.own_major_n)}); basis = basis or "own_pattern"
    if r.cur_x_n >= 1 and ok(r.cur_x_closed) and r.cur_x_closed >= 0.7 and hours == "closed": out.append({"k": "cur_xmas_closed"}); basis = basis or "own_pattern"
    if r.peer_n == r.peer_n and r.peer_n is not None and ok(r.peer_closed_among) and hours == "closed" and r.peer_closed_among >= 0.5:
        out.append({"k": "peers_closed", "pct": round(100 * r.peer_closed_among)}); basis = basis or "peers"
    if r.rev_close and r.rev_close > 0: out.append({"k": "reviews_close"})
    if r.ps_hours and r.ps_hours > 0: out.append({"k": "pub_edits"})
    if not out: out.append({"k": "model_pattern"}); basis = "model"
    return basis or "model", out

def main():
    class_models, hours_models, X_ref, peer = fit_final()
    df, P, reg = predict_all(class_models, hours_models, X_ref, peer)
    dec = decide(df, P, TC, TO, TR, reg, respect_optout=False)
    w = World()
    mall_names = {eid: w.ents[e["c_shoppingCenterEntityId"]]["name"] for eid, e in w.ents.items() if e.get("c_shoppingCenterEntityId") in w.ents}
    # expected search views: same day last season if available, else recent daily average
    an = pd.read_parquet(D("analytics_daily.parquet"), columns=["date", "entity_id", "GOOGLE_SEARCH_VIEWS", "GOOGLE_MAP_VIEWS"])
    an["date"] = pd.to_datetime(an.date).dt.strftime("%Y-%m-%d")
    an["v"] = an.GOOGLE_SEARCH_VIEWS.fillna(0) + an.GOOGLE_MAP_VIEWS.fillna(0)
    recent = an[an.date >= "2026-10-01"].groupby("entity_id").v.mean().to_dict()
    ly_views = {(r.entity_id, r.date): r.v for r in an[(an.date >= "2025-11-01") & (an.date <= "2026-01-10")].itertuples()}
    an2 = pd.read_parquet(D("analytics_daily.parquet"), columns=["date", "entity_id", "GOOGLE_CUSTOMER_ACTIONS", "GOOGLE_PHONE_CALLS"])
    an2["date"] = pd.to_datetime(an2.date).dt.strftime("%Y-%m-%d")
    an = an.merge(an2, on=["date", "entity_id"], how="left")
    AN = {(r.entity_id, r.date): (r.v, r.GOOGLE_CUSTOMER_ACTIONS or 0, r.GOOGLE_PHONE_CALLS or 0) for r in an[an.date >= "2025-01-01"].itertuples()}

    EV = {e["@id"]: e for e in json.load(open(D("local_events.json"), encoding="utf-8"))["data"]}
    SB = read_csv(D("school_breaks.csv"))
    rows, out_json = [], []
    for r, (act, hrs, why, p), reg_h in zip(df.itertuples(), dec, reg):
        ask_only = False
        if act == "NO_ACTION":
            # the scorer stays silent here, but a change is likely: the app asks the owner instead of guessing
            if r.closed_signal or p[1] + p[2] < ASK_MIN: continue
            opts = options_for(r, act, hrs, reg_h, p)
            if not opts: continue
            ask_only, hrs = True, opts[0]
        conf = float(p[1] if hrs == "closed" else p[2]) if act == "SUGGEST" else float(p[1] + p[2]) if ask_only else 0.9
        if not ask_only: rows.append((r.entity_id, r.date, act, hrs, round(conf, 3)))
        ent = w.ents[r.entity_id]; ct = w.contacts.get(r.entity_id, {})
        basis, why_list = reasons(r, ent, mall_names.get(r.entity_id), p, "SUGGEST" if ask_only else act, hrs, EV, SB)
        ly_date = str(int(r.date[:4]) - 1) + r.date[4:]
        views = float(ly_views.get((r.entity_id, ly_date), recent.get(r.entity_id, 0)))
        tier = "flag" if act == "FLAG" else "ask" if ask_only else tier_of(conf)
        opts = options_for(r, "SUGGEST", hrs, reg_h, p) if tier == "ask" else []
        out_json.append(dict(entity_id=r.entity_id, name=ent["name"], city=ent["address"]["city"], country=r.country, segment=r.segment, date=r.date, day_key=r.day_key, split=r.split,
                             action="ASK" if ask_only else act, proposed=hrs or None, shown=r.shown, confidence=round(conf, 3), basis=basis, reasons=why_list, source="ask_uncertain" if ask_only else why,
                             tier=tier, options=opts, cost=cost_of(w, r, views, AN) if act != "FLAG" else None, views_est=round(views, 1),
                             channel=ct.get("preferred_channel"), language=ct.get("preferred_language"), window=ct.get("best_contact_window"),
                             standing=int(ct.get("standing_permission_holidays") or 0), opted_out=int(ct.get("opted_out_of_suggestions") == "1"), first_name=ct.get("contact_first_name"), mobile=ct.get("mobile")))
    # Dev rows were part of the final training set, so scoring them from the final model would be in-sample (inflated).
    # For dev rows we therefore write the out-of-fold predictions (each business predicted by models that never saw it), so the dev score matches the honest estimate.
    try:
        tr = pd.read_pickle("challenge_out/train_rows.pkl"); oof = np.load("challenge_out/oof.npy")
        m = np.where(tr.season.values == 2026)[0]; sub = tr.iloc[m].reset_index(drop=True)
        odec = decide(sub, oof[m], TC, TO, TR, list(sub.oof_hours), respect_optout=False)
        keep = {(r.entity_id, r.date) for r in sub.itertuples()}
        rows = [r for r in rows if (r[0], r[1]) not in keep or r[2] == "FLAG"]
        rows += [(r.entity_id, r.date, a, h, round(float(p[1] if h == "closed" else p[2]), 3)) for r, (a, h, _, p) in zip(sub.itertuples(), odec) if a == "SUGGEST"]
    except FileNotFoundError:
        print("no out-of-fold file found: dev rows are in-sample")
    pd.DataFrame(rows, columns=["entity_id", "date", "action", "hours", "confidence"]).to_csv("challenge_out/predictions_2026.csv", index=False)
    json.dump(out_json, open("challenge_out/suggestions_2026.json", "w"), ensure_ascii=False)
    s = pd.DataFrame(rows, columns=["entity_id", "date", "action", "hours", "confidence"])
    print("predictions:", len(s), s.action.value_counts().to_dict(), "| closed:", int((s.hours == "closed").sum()), "| businesses:", s.entity_id.nunique())
    print("app tiers:", pd.Series([x["tier"] for x in out_json]).value_counts().to_dict())

if __name__ == "__main__":
    main()
