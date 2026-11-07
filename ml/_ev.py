import numpy as np, pandas as pd, lightgbm as lgb, warnings; warnings.filterwarnings("ignore")
from sklearn.model_selection import GroupKFold
from ml.train import *
from ml.evaluate import near
tr=pd.read_pickle("challenge_out/train_rows.pkl"); oof=np.load("challenge_out/oof.npy")
def pts(a,h,r):
    exp,truth,shown=r.exp,r.truth,r.shown
    if a=="NO_ACTION": return 0.0
    if exp=="SUGGEST":
        if h==truth: return 1.0
        if (h=="closed")!=(truth=="closed"): return -1.0
        return 0.6 if near(h,truth) else 0.2
    if exp=="FLAG": return 0.3 if h=="closed" else -1.0
    return -0.1 if h==shown else -1.0 if (h=="closed")!=(shown=="closed") else -0.5
# options per row
tr["p0"],tr["p1"],tr["p2"]=oof[:,0],oof[:,1],oof[:,2]
cand=[candidate(r) for r in tr.itertuples()]
tr["c_h"]=[c[0] for c in cand]; tr["c_src"]=[c[1] or "none" for c in cand]
OPTS={"closed":lambda r:"closed" if not r.shown_closed else None,
      "cand":lambda r:r.c_h if isinstance(r.c_h,str) and r.c_h!=r.shown else None,
      "reg":lambda r:r.oof_hours if isinstance(r.oof_hours,str) and r.oof_hours!=r.shown else None}
H={k:[f(r) for r in tr.itertuples()] for k,f in OPTS.items()}
Y={k:np.array([pts("SUGGEST",h,r) if h else np.nan for h,r in zip(H[k],tr.itertuples())]) for k in OPTS}
X=prep(tr); X["p0"],X["p1"],X["p2"]=tr.p0,tr.p1,tr.p2; X["c_src"]=pd.Categorical(tr.c_src)
X["fl"]=tr.closed_signal.astype(float)
EP=dict(objective="regression",learning_rate=0.03,num_leaves=15,min_data_in_leaf=40,feature_fraction=0.8,bagging_fraction=0.8,bagging_freq=1,lambda_l2=5.0,verbose=-1,seed=3)
pred={k:np.full(len(tr),np.nan) for k in OPTS}
g=tr.entity_id.values
for a,b in GroupKFold(5).split(X,groups=g):
    for k in OPTS:
        m=~np.isnan(Y[k][a]); ia=a[m]
        mdl=lgb.train(EP,lgb.Dataset(X.iloc[ia],Y[k][ia]),300)
        mb=~np.isnan(Y[k][b]); pred[k][b[mb]]=mdl.predict(X.iloc[b[mb]])
np.save("/tmp/ev_pred.npy",np.stack([pred[k] for k in OPTS])); 
import pickle; pickle.dump((H,Y),open("/tmp/ev_hy.pkl","wb"))
def evaluate(season, margin=0.0, flag=True):
    idx=np.where(tr.season.values==season)[0]; tot=0; mx=0; c={}
    for i in idx:
        r=tr.iloc[i]
        mx+= r.exp!="NO_ACTION"
        if flag and r.closed_signal and not r.entity_closed:
            tot+= 1.0 if r.exp=="FLAG" else 0.05 if r.exp=="SUGGEST" else -0.1; c["flag"]=c.get("flag",0)+1; continue
        best,bk=margin,None
        for k in OPTS:
            v=pred[k][i]
            if not np.isnan(v) and v>best: best,bk=v,k
        if bk: tot+=Y[bk][i]; c[bk]=c.get(bk,0)+1
    return 100*tot/mx, c
for s in (2026,2025):
    for mg in (0.0,0.05,0.1,0.15):
        print(s, mg, evaluate(s,mg))
