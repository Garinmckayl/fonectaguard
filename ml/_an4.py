import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from sklearn.model_selection import GroupKFold
from ml.train import *
from ml.peer_hours import PeerHours, _val
tr=pd.read_pickle("challenge_out/train_rows.pkl")
o=tr[(tr.exp=="SUGGEST")&(tr.truth!="closed")&tr.shown_start.notna()].reset_index(drop=True)
nc=np.array([candidate(r)[1] is None for r in o.itertuples()])
for w in (1.0,3.0,10.0):
  v=np.full(len(o),np.nan)
  for a,b in GroupKFold(5).split(o,groups=o.entity_id):
    ph=PeerHours(o.iloc[a],w)
    for i in b:
        h=ph.predict(o.iloc[i]); v[i]=_val(h,o.truth.iloc[i]) if h else np.nan
  print(w, "nocand pts",np.nanmean(v[nc]).round(3),"exact",np.nanmean(v[nc]==1).round(3))
