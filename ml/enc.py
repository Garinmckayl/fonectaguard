"""Neighbour statistics from the labelled (dev) businesses: what similar businesses in the same city / type / shopping centre really did on that day.
Each business is excluded from its own statistics (leave-one-entity-out), so a row never sees its own answer."""
from __future__ import annotations
import numpy as np, pandas as pd

SPECS = [("season", "country", "segment", "day_key"), ("season", "city", "segment", "day_key"), ("season", "city", "day_key"), ("season", "mall", "day_key")]
M = 6.0  # smoothing: how many "virtual" rows of the overall rate each group starts with

def _name(spec): return "enc_" + "_".join(c[:3] for c in spec[1:-1])

def add_encodings(train: pd.DataFrame, apply: pd.DataFrame, loo_for_train: bool = True):
    """Returns (train_enc, apply_enc) DataFrames of new feature columns. `train` needs: entity_id, truth_closed, needs_change and the spec columns."""
    out_t, out_a = {}, {}
    for spec in SPECS:
        cols = list(spec)
        tr = train.dropna(subset=cols[1:-1]) if "mall" in cols else train
        for tgt in ("truth_closed", "needs_change"):
            prior = float(train[tgt].mean())
            g = tr.groupby(cols)[tgt].agg(["sum", "count"]).rename(columns={"sum": "gs", "count": "gn"})
            ge = tr.groupby(cols + ["entity_id"])[tgt].agg(["sum", "count"]).rename(columns={"sum": "es", "count": "en"})
            def enc(df, own: bool):
                m = df[cols].merge(g, left_on=cols, right_index=True, how="left")
                gs, gn = m["gs"].fillna(0).values, m["gn"].fillna(0).values
                if own:
                    me = df[cols + ["entity_id"]].merge(ge, left_on=cols + ["entity_id"], right_index=True, how="left")
                    gs, gn = gs - me["es"].fillna(0).values, gn - me["en"].fillna(0).values
                return (gs + M * prior) / (gn + M), gn
            name = f"{_name(spec)}_{'c' if tgt == 'truth_closed' else 'x'}"
            out_t[name], out_t[name + "_n"] = enc(train, loo_for_train)
            out_a[name], out_a[name + "_n"] = enc(apply, False)
    return pd.DataFrame(out_t, index=train.index), pd.DataFrame(out_a, index=apply.index)
