import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from collections import Counter
from ml.train import *
tr=pd.read_pickle("challenge_out/train_rows.pkl"); oof=np.load("challenge_out/oof.npy")
idx=np.where(tr.season.values==2026)[0]; sub=tr.iloc[idx].reset_index(drop=True); P=oof[idx]
dec=decide(sub,P,0.65,0.25,0.75,list(sub.oof_hours))
m=[(r.exp=="SUGGEST" and r.truth!="closed" and not r.shown_closed and candidate(r)[0] is None) for r in sub.itertuples()]
m=np.array(m)
print(Counter(w for (a,h,w,p),k in zip(dec,m) if k))
print("mean P on these", P[m].mean(0).round(3), "argmax", Counter(P[m].argmax(1)))
print(Counter(sub.day_key[m]).most_common(12))
print("noneed P mean",P[sub.exp.values!="SUGGEST"].mean(0).round(3))
