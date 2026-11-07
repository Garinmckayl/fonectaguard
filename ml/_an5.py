import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from sklearn.model_selection import GroupKFold
from ml.train import *
from ml.peer_hours import PeerHours
tr=pd.read_pickle("challenge_out/train_rows.pkl"); oof=np.load("challenge_out/oof.npy")
peer=[None]*len(tr)
for a,b in GroupKFold(5).split(tr,groups=tr.entity_id):
    ph=PeerHours(tr.iloc[a])
    for i in b: peer[i]=ph.predict(tr.iloc[i])
tr["peer"]=peer
for season,lab in ((2026,L("dev_labels_2026.csv")),(2025,L("dev_labels_2025_backtest.csv"))):
    idx=np.where(tr.season.values==season)[0]; sub=tr.iloc[idx].reset_index(drop=True)
    reg=list(sub.oof_hours); mix=[p if isinstance(p,str) else r for p,r in zip(sub.peer,reg)]
    for name,R in (("reg",reg),("peer",mix)):
        out=[]
        for tc in (0.6,0.65,0.7):
          for trg in (0.35,0.45,0.55,0.65,0.75,1.1):
            s=score_fn(to_preds(sub,decide(sub,oof[idx],tc,0.25,trg,R)),lab)["score_0_100"]; out.append((s,tc,trg))
        fixed=[s for s,tc,t in out if tc==0.65 and t==0.75][0]
        print(season,name,"best",max(out),"at default(0.65,0.75)",fixed)
