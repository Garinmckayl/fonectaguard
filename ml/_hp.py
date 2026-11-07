import sys, numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
import lightgbm as lgb
from sklearn.model_selection import GroupKFold
import ml.train as T
from ml.train import *
tr=pd.read_pickle("challenge_out/train_rows.pkl"); X=prep(tr.drop(columns=["oof_hours"])); y=tr.label.values
X=X[[c for c in X.columns if c not in ("off_s_t","off_e_t","label")]]
cfgs={"base":(dict(),350),"slow":(dict(learning_rate=0.025),800),"big":(dict(num_leaves=63,min_data_in_leaf=40),350),"small":(dict(num_leaves=15,min_data_in_leaf=50),600),"reg":(dict(lambda_l2=10.0,feature_fraction=0.5),500)}
name=sys.argv[1]; extra,rounds=cfgs[name]
oof=np.zeros((len(tr),3))
for a,b in GroupKFold(5).split(X,y,tr.entity_id):
    for seed in (7,11):
        p=dict(PARAMS,**extra,seed=seed); oof[b]+=lgb.train(p,lgb.Dataset(X.iloc[a],y[a]),rounds).predict(X.iloc[b])/2
out=[]
for season,lab in ((2026,L("dev_labels_2026.csv")),(2025,L("dev_labels_2025_backtest.csv"))):
    idx=np.where(tr.season.values==season)[0]; sub=tr.iloc[idx].reset_index(drop=True)
    best=max(score_fn(to_preds(sub,decide(sub,oof[idx],tc,to,t,list(sub.oof_hours))),lab)["score_0_100"] for tc in (0.55,0.6,0.65) for to in (0.25,0.4) for t in (0.65,0.75))
    out.append(best)
print(name,out,flush=True)
