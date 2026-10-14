"""The original causal market features used by the fixed checkpoints."""
import json,pathlib
import numpy as np,pandas as pd
from paths import ROOT,SYMBOLS

def source_frame(symbol):
    records=[]
    for year in range(2019,2027):
        obj=json.loads((ROOT/f'data/raw/{symbol}_{year}_raw.json').read_text())
        d=obj.get('data',{}).get(symbol,{})
        rows=d.get('day',[])
        end=f'{year}-12-31' if year<2026 else '2026-09-30'
        records.extend([r[:6] for r in rows if f'{year}-01-01'<=r[0]<=end])
    f=pd.DataFrame(records,columns=['date','open','close','high','low','volume']).set_index('date').astype(float)
    assert f.index.is_unique and f.index.is_monotonic_increasing
    assert np.isfinite(f.to_numpy()).all() and (f[['open','close','high','low']]>0).all().all()
    return f

def rank(x):
    a=np.asarray(x);return pd.DataFrame(a).rank(axis=1,pct=True).to_numpy()-.5

def prepare(frames_override):
    frames=frames_override
    dates=frames['sh000300'].index
    tables={k:pd.DataFrame({s:frames[s][k] for s in SYMBOLS},index=dates) for k in ['open','close','high','low','volume']}
    actual=tables['open'].notna()&tables['close'].notna()&(tables['volume']>0)
    # Forward marking only. Missing prices remain explicitly non-tradable; no backward fill.
    c=tables['close'].ffill();op=tables['open'].where(actual,c.shift(1));v=tables['volume'].fillna(0)
    for s in SYMBOLS:
        if op[s].isna().any():op[s]=op[s].fillna(1.) # placeholders before listing, never eligible/tradable
    ret=c.pct_change(fill_method=None);vol20=ret.rolling(20).std();vol60=ret.rolling(60).std()
    r={h:c.pct_change(h,fill_method=None) for h in [1,5,20,60,120]}
    features={}
    for h in r:features[f'return{h}_vol_scaled']=r[h]/(vol20*np.sqrt(h)).clip(lower=.001)
    for h in [20,60,120]:
        features[f'relative_return{h}']=r[h].sub(r[h].mean(axis=1),axis=0)/(vol20*np.sqrt(h)).clip(lower=.001)
        features[f'cross_section_rank{h}']=pd.DataFrame(rank(r[h]),index=dates,columns=SYMBOLS)
    features['short_reversal_rank']=-pd.DataFrame(rank(r[5]),index=dates,columns=SYMBOLS)
    features['low_vol_rank']=-pd.DataFrame(rank(vol20),index=dates,columns=SYMBOLS)
    features['vol20']=vol20;features['vol60']=vol60;features['vol_ratio']=vol20/vol60.clip(lower=.001)
    features['downside_vol20']=ret.clip(upper=0).pow(2).rolling(20).mean().pow(.5)
    features['skew20']=ret.rolling(20).skew()
    for h in [20,60,120]:features[f'ma{h}_distance']=(c/c.rolling(h).mean()-1)/(vol20*np.sqrt(h)).clip(lower=.001)
    features['drawdown120']=c/c.rolling(120).max()-1
    features['range_position60']=(c-c.rolling(60).min())/(c.rolling(60).max()-c.rolling(60).min()).clip(lower=.001)
    features['rsi14']=ret.clip(lower=0).rolling(14).mean()/(ret.abs().rolling(14).mean().clip(lower=1e-6))
    features['log_volume_ratio20']=np.log((v+1)/(v.rolling(20).mean()+1))
    features['log_volume_ratio60']=np.log((v+1)/(v.rolling(60).mean()+1))
    features['volume_5_to20']=v.rolling(5).mean()/(v.rolling(20).mean()+1)-1
    features['intraday']=(c/tables['open']-1)/vol20.clip(lower=.001)
    features['overnight']=(tables['open']/c.shift(1)-1)/vol20.clip(lower=.001)
    features['high_low']=(tables['high']/tables['low']-1)/vol20.clip(lower=.001)
    features['observed_fraction20']=actual.rolling(20).mean()
    index_features={}
    for index in ['sh000300','sh000001']:
        f=frames[index].reindex(dates).ffill();ic=f.close;ir=ic.pct_change(fill_method=None);iv=ir.rolling(20).std()
        for h in [5,20,60,120]:index_features[index+f'_return{h}']=ic.pct_change(h,fill_method=None)/(iv*np.sqrt(h)).clip(lower=.001)
        index_features[index+'_vol20']=iv
        index_features[index+'_trend120']=ic/ic.rolling(120).mean()-1
    for name,series in index_features.items():features[name]=pd.DataFrame(np.repeat(series.to_numpy()[:,None],len(SYMBOLS),axis=1),index=dates,columns=SYMBOLS)
    x=np.stack([f.to_numpy() for f in features.values()],axis=2)
    finite=np.isfinite(x).all(axis=2);eligible=finite&actual.to_numpy()&(actual.rolling(20).mean().to_numpy()>=.9)
    x=np.nan_to_num(x,nan=0,posinf=0,neginf=0)
    return {'dates':dates.to_numpy(),'symbols':SYMBOLS,'x':x,'features':list(features),'eligible':eligible,
       'actual':actual.to_numpy(),'open':op.to_numpy(),'close':c.ffill().fillna(1.).to_numpy(),'vol20':vol20.fillna(.02).clip(lower=.005).to_numpy()}
