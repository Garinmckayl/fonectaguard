"""Label-free context: what neighbouring businesses (same city+segment, same mall) signal for the same date,
and what each business signals across all its own target days. Uses only inputs available for every business."""
from __future__ import annotations
import numpy as np, pandas as pd

def _flags(df):
    ok = lambda s: s.apply(lambda h: isinstance(h, str) and h != "")
    f = pd.DataFrame(index=df.index)
    f["x_ge"] = df.ge_cur_hours.apply(lambda h: isinstance(h, str) and h != "").astype(float)
    f["x_ge_closed"] = (df.ge_cur_hours == "closed").astype(float)
    f["x_ly_closed"] = (df.ly1_hours == "closed").astype(float)
    f["x_ly_special"] = (ok(df.ly1_hours) & (df.ly1_hours != "closed")).astype(float)
    f["x_pilot_closed"] = (df.pilot_final == "closed").astype(float)
    f["x_pilot_special"] = (ok(df.pilot_final) & (df.pilot_final != "closed")).astype(float)
    f["x_shown_closed"] = df.shown_closed.astype(float)
    f["x_shown_short"] = (df.shown_len.astype(float) < df.groupby("entity_id").shown_len.transform("median").astype(float)).astype(float)
    return f

def add_context(df: pd.DataFrame) -> pd.DataFrame:
    f = _flags(df); cols = list(f.columns)
    for name, keys in (("cs", ["city", "segment", "date"]), ("sd", ["segment", "country", "date"]), ("ml", ["mall", "date"])):
        k = df[keys[0]].astype(str)
        for c in keys[1:]: k = k + "|" + df[c].astype(str)
        g = f.groupby(k)
        s, n = g[cols].transform("sum"), g[cols[0]].transform("size")
        for c in cols: df[f"{name}_{c}"] = ((s[c] - f[c]) / (n - 1).replace(0, np.nan)).values   # leave-one-out share
        df[f"{name}_n"] = n.values
        if name == "ml": df.loc[df.mall.isna().values, [f"ml_{c}" for c in cols] + ["ml_n"]] = np.nan
    g = f.groupby(df.entity_id)
    for c in ("x_ge", "x_ge_closed", "x_ly_closed", "x_ly_special", "x_pilot_closed", "x_pilot_special"):
        df[f"e_{c}"] = g[c].transform("mean").values
    df["e_n"] = g[cols[0]].transform("size").values
    df["e_shown_var"] = df.groupby("entity_id").shown.transform("nunique").values
    df["e_dk_n"] = df.groupby(["entity_id", "day_key"]).shown.transform("size").values
    return df
