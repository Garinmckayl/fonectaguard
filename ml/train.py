"""Train the 'what will the hours really be?' model and measure it with our port of the official scorer."""
from __future__ import annotations
import sys, json, numpy as np, pandas as pd, lightgbm as lgb
from sklearn.model_selection import GroupKFold
from ml.common import *
from ml.evaluate import score as score_fn, near
from ml.features import span
from ml.enc import add_encodings

CATS = ["country", "segment", "tier", "day_key", "day_type"]
NOFEAT = {"ge_prev_hours", "ge_cur_hours", "mall_ly_hours", "truth_closed", "needs_change", "city", "mall", "event_id", "closed_signal", "entity_closed", "off_s_t", "off_e_t", "entity_id", "date", "split", "shown", "label", "truth", "exp", "ly1_hours", "ly2_hours", "mall_hours", "pilot_final", "views"}

def load(season):
    df = pd.read_pickle(f"challenge_out/feat_{season}.pkl")
    lab = pd.read_csv({2026: L("dev_labels_2026.csv"), 2025: L("dev_labels_2025_backtest.csv"), 2024: "challenge_out/labels_2024.csv"}[season])
    lab = lab.rename(columns={"truth_hours": "truth", "expected_action": "exp", "expected_search_views": "views"})
    df = df.merge(lab[["entity_id", "date", "truth", "exp", "views", "mismatch_type"]], on=["entity_id", "date"], how="left")
    df["season"] = season
    return df

def label_of(r):
    if r.exp == "FLAG": return -1
    if r.exp == "NO_ACTION": return 0
    return 1 if r.truth == "closed" else 2

def prep(df):
    X = df[[c for c in df.columns if c not in NOFEAT and c not in ("season", "mismatch_type")]].copy()
    for c in X.columns:
        if c not in CATS: X[c] = pd.to_numeric(X[c], errors="coerce")
    for c in CATS: X[c] = X[c].astype("category")
    return X

RPARAMS = dict(objective="l1", learning_rate=0.05, num_leaves=31, min_data_in_leaf=20, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=2.0, verbose=-1, seed=7)

def hm(m):
    m = int(m) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"

def add_offsets(df):
    """Training targets for the hours regressors: how far the true hours sit from the displayed hours (minutes)."""
    ts_te = [span(t) if isinstance(t, str) else (None, None) for t in df.truth]
    df["off_s_t"] = [(a - r) if a is not None and r == r and r is not None else np.nan for (a, _), r in zip(ts_te, df.shown_start)]
    df["off_e_t"] = [(b - r) if b is not None and r == r and r is not None else np.nan for (_, b), r in zip(ts_te, df.shown_end)]
    return df

def fit_hours(X, df):
    m = (df.label == 2) & df.off_s_t.notna() & df.shown_start.notna()
    return (lgb.train(RPARAMS, lgb.Dataset(X[m.values], df.off_s_t[m]), 250), lgb.train(RPARAMS, lgb.Dataset(X[m.values], df.off_e_t[m]), 250))

def predict_hours(models, X, df):
    ds, de = models[0].predict(X), models[1].predict(X)
    out = []
    for r, a, b in zip(df.itertuples(), ds, de):
        if r.shown_start != r.shown_start or r.shown_start is None:   # displayed as closed: fall back to the peer median
            if r.peer_open == r.peer_open and r.peer_open is not None and r.peer_close == r.peer_close and r.peer_close is not None: s_, e_ = round(r.peer_open / 30) * 30, round(r.peer_close / 30) * 30
            else: out.append(None); continue
        else: s_, e_ = r.shown_start + round(a / 30) * 30, r.shown_end + round(b / 30) * 30
        out.append(f"{hm(s_)}-{hm(e_)}" if e_ - s_ >= 30 and e_ - s_ <= 1440 else None)
    return out

def candidate(r):
    """Best available exact hours for an 'open, but different' day, by source reliability. Returns (hours, source)."""
    ok = lambda h: isinstance(h, str) and h and h != "closed"
    if ok(r.pilot_final): return r.pilot_final, "pilot"
    if ok(r.ge_cur_hours): return r.ge_cur_hours, "gedit"
    for k in ("ly1_hours", "ly2_hours", "ge_prev_hours"):
        if ok(getattr(r, k)): return getattr(r, k), k
    if ok(r.mall_hours): return r.mall_hours, "mall"
    if ok(r.mall_ly_hours): return r.mall_ly_hours, "mall_ly"
    return None, None

PARAMS = dict(objective="multiclass", num_class=3, learning_rate=0.05, num_leaves=31, min_data_in_leaf=25, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=2.0, verbose=-1, seed=7)

def fit(X, y, rounds=350): return lgb.train(PARAMS, lgb.Dataset(X, y), num_boost_round=rounds)

def decide(df, P, tc=0.5, to=0.5, tr_=0.6, reg=None, respect_optout=False):
    """Turn class probabilities into SUGGEST / NO_ACTION. Expected-value reasoning from the scoring rules is baked into the thresholds."""
    out = []
    for r, p in zip(df.itertuples(), P):
        act, hrs, why = "NO_ACTION", "", ""
        if respect_optout and r.opted_out: out.append((act, hrs, why, p)); continue
        if r.closed_signal and not r.entity_closed: out.append(("FLAG", "", "closed_for_good_signals", p)); continue
        if not r.shown_closed and p[1] >= tc: act, hrs, why = "SUGGEST", "closed", "model_closed"
        elif p[2] >= to:
            h, src = candidate(r)
            if h and h != r.shown: act, hrs, why = "SUGGEST", h, f"model_open+{src}"
            elif not h and reg is not None and p[2] >= tr_ and isinstance(reg[r.Index], str) and reg[r.Index] != r.shown: act, hrs, why = "SUGGEST", reg[r.Index], "model_open+regressed"
        out.append((act, hrs, why, p))
    return out

def to_preds(df, decisions):
    return {(r.entity_id, r.date): (a, h, None) for r, (a, h, _, _) in zip(df.itertuples(), decisions) if a != "NO_ACTION"}

if __name__ == "__main__":
    d26, d25 = load(2026), load(2025)
    dev26 = d26[d26.split == "dev"].reset_index(drop=True); dev25 = d25.reset_index(drop=True)
    seasons = [dev26, dev25] + ([load(2024)] if "--with2024" in sys.argv else [])
    for d in seasons: d["label"] = [label_of(r) for r in d.itertuples()]
    tr = pd.concat(seasons, ignore_index=True); tr = tr[tr.label >= 0].reset_index(drop=True)
    X, y, g = prep(tr), tr.label.values, tr.entity_id.values
    tr = add_offsets(tr); X = prep(tr)
    tr["truth_closed"] = (tr.truth == "closed").astype(int); tr["needs_change"] = (tr.exp == "SUGGEST").astype(int)
    use_enc = "--enc" in sys.argv
    oof = np.zeros((len(tr), 3)); oof_h = [None] * len(tr)
    for f, (a, b) in enumerate(GroupKFold(5).split(X, y, g)):
        Xa, Xb = X.iloc[a].copy(), X.iloc[b].copy()
        if use_enc:
            ea, eb = add_encodings(tr.iloc[a], tr.iloc[b], True)
            Xa, Xb = pd.concat([Xa, ea], axis=1), pd.concat([Xb, eb], axis=1)
        m = fit(Xa, y[a]); oof[b] = m.predict(Xb)
        hm_ = fit_hours(Xa, tr.iloc[a].reset_index(drop=True)); ph = predict_hours(hm_, Xb, tr.iloc[b].reset_index(drop=True))
        for i, h in zip(b, ph): oof_h[i] = h
        print("fold", f, "done")
    np.save("challenge_out/oof.npy", oof); tr["oof_hours"] = oof_h; tr.to_pickle("challenge_out/train_rows.pkl")
    for season, lab in ((2026, L("dev_labels_2026.csv")), (2025, L("dev_labels_2025_backtest.csv"))):
        idx = np.where(tr.season.values == season)[0]; sub = tr.iloc[idx]
        sub = sub.reset_index(drop=True); reg = list(sub.oof_hours); best = None
        for tc in (0.5, 0.6, 0.7):
            for to in (0.25, 0.4):
                for trg in (0.45, 0.55, 0.65, 0.75, 1.1):
                    res = score_fn(to_preds(sub, decide(sub, oof[idx], tc, to, trg, reg)), lab)
                    if best is None or res["score_0_100"] > best[0]["score_0_100"]: best = (res, tc, to, trg)
        r, tc, to, trg = best
        print(f"\nseason {season}: best score {r['score_0_100']}  (tc={tc}, to={to}, regress>={trg})  precision {r['precision_exact']} recall {r['recall_exact']} harmful {r['harmful_suggestions']}  breakdown {r['breakdown']}")
