import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from ml.train import *
from ml.evaluate import near
tr=pd.read_pickle("challenge_out/train_rows.pkl"); oof=np.load("challenge_out/oof.npy")
def pts(a,h,r):
    exp,truth,shown=r.exp,r.truth,r.shown
    if exp=="SUGGEST":
        if a=="SUGGEST":
            if h==truth: return 1.0
            if (h=="closed")!=(truth=="closed"): return -1.0
            return 0.6 if near(h,truth) else 0.2
        return 0.05 if a=="FLAG" else 0.0
    if exp=="FLAG": return 1.0 if a=="FLAG" else (0.3 if h=="closed" else -1.0) if a=="SUGGEST" else 0.0
    if a=="SUGGEST": return -0.1 if h==shown else -1.0 if (h=="closed")!=(shown=="closed") else -0.5
    return -0.1 if a=="FLAG" else 0.0
idx=np.where(tr.season.values==2026)[0]; sub=tr.iloc[idx].reset_index(drop=True); P=oof[idx]
dec=decide(sub,P,0.65,0.25,0.75,list(sub.oof_hours))
sub["act"]=[d[0] for d in dec]; sub["hrs"]=[d[1] for d in dec]; sub["why"]=[d[2].split("+")[-1] if d[2] else "" for d in dec]
sub["pts"]=[pts(a,h,r) for a,h,r in zip(sub.act,sub.hrs,sub.itertuples())]
mx=(sub.exp!="NO_ACTION").sum(); print("score",100*sub.pts.sum()/mx, "mx",mx)
sub["cand"]=[candidate(r)[1] or "none" for r in sub.itertuples()]
sub["hist"]=sub.ly1_hours.notna()|sub.ly2_hours.notna()
sub["tclass"]=np.where(sub.exp=="NO_ACTION","noact",np.where(sub.exp=="FLAG","flag",np.where(sub.truth=="closed","closed","open")))
print(sub.groupby(["act","why"]).pts.agg(["count","sum","mean"]).round(2))
print("\nmissed by true class & cand source:"); m=sub[(sub.exp=="SUGGEST")&(sub.act=="NO_ACTION")]
print(m.groupby(["tclass","cand"]).size())
print("\nOpen-diff rows: is candidate exact/near?")
o=sub[(sub.tclass=="open")]
o["c_ex"]=[candidate(r)[0]==r.truth for r in o.itertuples()]; o["c_nr"]=[ (candidate(r)[0] is not None and candidate(r)[0]!="closed" and near(candidate(r)[0],r.truth)) for r in o.itertuples()]
o["r_ex"]=[h==t for h,t in zip(o.oof_hours,o.truth)]; o["r_nr"]=[isinstance(h,str) and near(h,t) for h,t in zip(o.oof_hours,o.truth)]
print(o.groupby("cand")[["c_ex","c_nr","r_ex","r_nr"]].mean().round(2), o.cand.value_counts().to_dict())
sub.to_pickle("/tmp/sub26.pkl")
