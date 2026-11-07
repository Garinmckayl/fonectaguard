import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from ml.train import *
from ml.features import span
from collections import Counter
tr=pd.read_pickle("challenge_out/train_rows.pkl")
o=tr[(tr.exp=="SUGGEST")&(tr.truth!="closed")].copy()
o["c_src"]=[candidate(r)[1] or "none" for r in o.itertuples()]
def sp(h): 
    try: return span(h)
    except Exception: return (None,None)
o["ts"],o["te"]=zip(*[sp(t) for t in o.truth])
o["ds"]=o.ts-o.shown_start; o["de"]=o.te-o.shown_end
o["nint"]=[t.count(",")+1 for t in o.truth]
print("n open-diff",len(o), "no cand", (o.c_src=="none").sum())
n=o[o.c_src=="none"]
print("shown closed share", n.shown_closed.mean(), "multi-interval truth", (n.nint>1).mean())
print("ds dist", n.ds.value_counts().head(8).to_dict()); print("de dist", n.de.value_counts().head(12).to_dict())
print("(ds,de) top", Counter(zip(n.ds,n.de)).most_common(12))
print("truth top", n.truth.value_counts().head(10).to_dict())
print(n.groupby("day_key").apply(lambda d: Counter(zip(d.ds,d.de)).most_common(3)).head(30))
