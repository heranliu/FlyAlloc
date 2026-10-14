"""Frozen raw OHLCV plus Sina adjustment factors; all files are local."""
import json,numpy as np,pandas as pd
from paths import ROOT,SYMBOLS
from features import prepare,source_frame

def frames():
 fs={}
 for s in SYMBOLS+['sh000300','sh000001']:
  raw=source_frame(s);f=raw.copy()
  if s in SYMBOLS:
   obj=json.loads((ROOT/'data/factors'/f'{s}_sina_factor.json').read_text());events=pd.Series({x['d']:float(x['f']) for x in obj['data']}).sort_index();factor=events.reindex(events.index.union(raw.index)).ffill().reindex(raw.index);assert factor.notna().all();f[['open','close','high','low']]=raw[['open','close','high','low']].mul(factor,axis=0)
  # Arbitrary fixed base leaves all returns invariant; no raw-share or currency execution interpretation.
  f[['open','close','high','low']]*=100/f.close.iloc[0];fs[s]=f
 return fs

def dataset():
 d=prepare(frames_override=frames())
 d['price_basis']='sina';assert np.isfinite(d['x']).all();return d

def split(data,train_end,year):
    dates=data['dates'];endpoints=np.r_[dates[2:],['','']]
    train=(dates>='2020-01-01')&(dates<=train_end)&(endpoints<=train_end)&(endpoints!='')
    values=data['x'][train];valid=data['eligible'][train]
    mean=values[valid].mean(0);scale=np.maximum(values[valid].std(0),1e-6)
    z=np.clip((data['x']-mean)/scale,-6,6)
    # Stock-slot features and present-time quote flags only. Holdings enter through the same graph routing.
    inputs=np.concatenate([z.reshape(len(z),-1),data['eligible'].astype(float)],axis=1)
    first=np.searchsorted(dates,f'{year}-01-01')+5
    last=min(np.searchsorted(dates,f'{year}-12-31' if year<2025 else '2026-09-30',side='right')-3,len(dates)-3)
    return {'train':np.flatnonzero(train),'eval':np.arange(first,last+1),'inputs':inputs,'mean':mean,'scale':scale,
      'metadata':{'train_decision_start':str(dates[train][0]),'train_decision_end':str(dates[train][-1]),'train_valuation_end':str(endpoints[train][-1]),
        'train_sessions':int(train.sum()),'eval_decision_start':str(dates[first]),'eval_decision_end':str(dates[last]),
        'eval_entry_start':str(dates[first+1]),'eval_valuation_end':str(dates[last+2]),'embargo_sessions':5}}
