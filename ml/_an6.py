import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from ml.train import *
from ml.evaluate import near
tr=pd.read_pickle("challenge_out/train_rows.pkl"); oof=np.load("challenge_out/oof.npy")
for season in (2026,2025):
    idx=np.where(tr.season.values==season)[0]; sub=tr.iloc[idx].reset_index(drop=True); P=oof[idx]
    dec=decide(sub,P,0.65,0.25,0.75,list(sub.oof_hours))
    from collections import defaultdict
    agg=defaultdict(lambda:[0,0.0,0.0])
    for r,(a,h,w,p) in zip(sub.itertuples(),dec):
        if r.exp=="SUGGEST":
            best=1.0; cls="closed" if r.truth=="closed" else "open"
            if a=="NO_ACTION": got=0
            elif h==r.truth: got=1
            elif h!="closed" and r.truth!="closed" and near(h,r.truth): got=.6
            elif (h=="closed")==(r.truth=="closed"): got=.2
            else: got=-1
            hasc=candidate(r)[0] is not None
            k=f"need_{cls}_{'cand' if hasc else 'nocand'}_{'shownclosed' if r.shown_closed else 'shownopen'}"
        else:
            best=0; got=0 if a=="NO_ACTION" else (-1 if h=="closed" or (r.shown_closed) else -0.5); k="noneed"
        agg[k][0]+=1; agg[k][1]+=best-got; agg[k][2]+=got
    tot=sum(v[1] for v in agg.values())
    print(season, {k:(v[0],round(v[1]),round(v[2])) for k,v in sorted(agg.items(),key=lambda x:-x[1][1])}, "lost",round(tot))
