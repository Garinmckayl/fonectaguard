"""Hours for 'open, but different' days when the owner has no history: pick the hours that would have scored best across
similar businesses on the same special day (both their absolute hours and their shift from what Google showed)."""
from __future__ import annotations
import numpy as np, pandas as pd
from collections import Counter
from ml.evaluate import near
from ml.features import span

def _hm(m): m = int(m) % 1440; return f"{m // 60:02d}:{m % 60:02d}"
def _mk(s, e): return f"{_hm(s)}-{_hm(e)}" if 30 <= e - s <= 1440 else None
def _val(h, t): return 1.0 if h == t else 0.6 if near(h, t) else 0.2

def _sp(h):
    try: return span(h)
    except Exception: return (None, None)

class PeerHours:
    def __init__(self, rows: pd.DataFrame, w_same_shown=3.0, min_n=3):
        o = rows[(rows.exp == "SUGGEST") & (rows.truth != "closed") & rows.shown_start.notna()].copy()
        o["ts"], o["te"] = zip(*[_sp(t) for t in o.truth])
        o["ds"], o["de"] = o.ts - o.shown_start, o.te - o.shown_end
        self.g = {k: d for k, d in o.groupby(["segment", "day_key"])}
        self.w, self.min_n = w_same_shown, min_n

    def predict(self, r):
        if r.shown_start is None or r.shown_start != r.shown_start: return None
        d = self.g.get((r.segment, r.day_key))
        if d is None or len(d) < self.min_n: return None
        w = np.where(d.shown.values == r.shown, self.w, 1.0)
        rel = [_mk(r.shown_start + x, r.shown_end + y) if x == x and y == y else None for x, y in zip(d.ds, d.de)]
        peers = [(p, wi) for p, wi in zip(d.truth, w)] + [(p, wi) for p, wi in zip(rel, w) if p]
        cands = list(dict.fromkeys([t for t, _ in Counter(d.truth).most_common(25)] + [c for c, _ in Counter([x for x in rel if x]).most_common(25)]))
        cands = [c for c in cands if c and c != r.shown]
        if not cands: return None
        tw = sum(wi for _, wi in peers)
        return max(cands, key=lambda c: sum(_val(c, p) * wi for p, wi in peers) / tw)
