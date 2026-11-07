import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from sklearn.model_selection import GroupKFold
from ml.train import *
from ml.evaluate import near
from ml.features import span
from collections import Counter, defaultdict
tr=pd.read_pickle("challenge_out/train_rows.pkl")
o=tr[(tr.exp=="SUGGEST")&(tr.truth!="closed")&tr.shown_start.notna()].reset_index(drop=True)
o["c_src"]=[candidate(r)[1] or "none" for r in o.itertuples()]
def sp(h):
    try: return span(h)
    except Exception: return (None,None)
o["ts"],o["te"]=zip(*[sp(t) for t in o.truth]); o["ds"]=o.ts-o.shown_start; o["de"]=o.te-o.shown_end
def val(h,t): return 1.0 if h==t else 0.6 if near(h,t) else 0.2
def mk(s,e): return f"{hm(s)}-{hm(e)}" if e-s>=30 else None
res=defaultdict(list)
for a,b in GroupKFold(5).split(o,groups=o.entity_id):
    A=o.iloc[a]; B=o.iloc[b]
    for keys in (("segment","day_key"),("day_key",)):
        grp={k:d for k,d in A.groupby(list(keys))}
        for r in B.itertuples():
            k=tuple(getattr(r,x) for x in keys); k=k if len(k)>1 else k[0]
            d=grp.get(k)
            if d is None or len(d)<3: res[("abs",keys)].append(np.nan); res[("rel",keys)].append(np.nan); res[("mix",keys)].append(np.nan); continue
            # candidate set: peer absolute truths + peer deltas applied to this row's shown
            absc=[t for t,_ in Counter(d.truth).most_common(25)]
            relc=[mk(r.shown_start+x,r.shown_end+y) for (x,y),_ in Counter(zip(d.ds,d.de)).most_common(25) if x==x and y==y]
            relc=[c for c in relc if c]
            peers_abs=list(d.truth); peers_rel=[mk(r.shown_start+x,r.shown_end+y) for x,y in zip(d.ds,d.de) if x==x and y==y]
            def best(cands,peers):
                peers=[p for p in peers if p]
                return max(cands,key=lambda c: np.mean([val(c,p) for p in peers])) if cands else None
            ba=best(absc,peers_abs); br=best(relc,peers_rel)
            # mixed: score each candidate against both views with equal weight
            allc=list(dict.fromkeys(absc+relc)); pm=peers_abs+[p for p in peers_rel if p]
            bm=best(allc,pm)
            res[("abs",keys)].append(val(ba,r.truth)); res[("rel",keys)].append(val(br,r.truth) if br else np.nan); res[("mix",keys)].append(val(bm,r.truth))
    res["reg"].extend([val(h,t) if isinstance(h,str) else np.nan for h,t in zip(B.oof_hours,B.truth)])
    res["src"].extend(list(B.c_src))
src=np.array(res.pop("src"))
for k,v in res.items():
    v=np.array(v,dtype=float); m=src=="none"
    print(k, "nocand mean pts", np.nanmean(v[m]).round(3), "exact", np.nanmean(v[m]==1).round(3), "cover", np.mean(~np.isnan(v[m])).round(2), "| all", np.nanmean(v).round(3))
