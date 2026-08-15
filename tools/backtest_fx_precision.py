#!/usr/bin/env python3
import csv, json, math
from bisect import bisect_left
from datetime import datetime, timezone, timedelta, date
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
import backtest_fx_ml as bt

EVENTS=[
 '2026-04-03T12:30:00Z','2026-04-10T12:30:00Z','2026-04-29T18:00:00Z',
 '2026-05-08T12:30:00Z','2026-05-12T12:30:00Z',
 '2026-06-05T12:30:00Z','2026-06-10T12:30:00Z','2026-06-17T18:00:00Z',
 '2026-07-02T12:30:00Z','2026-07-14T12:30:00Z','2026-07-29T18:00:00Z',
 '2026-08-07T12:30:00Z','2026-08-12T12:30:00Z'
]
EVENTS=[datetime.fromisoformat(x.replace('Z','+00:00')) for x in EVENTS]

def load_yield(path):
    out=[]
    with open(path,encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            try:
                ds=r.get('observation_date') or r.get('DATE') or r.get('date')
                val=r.get('DGS2') or r.get('DGS10') or r.get('value')
                if val in ('','.','NA',None): continue
                out.append((date.fromisoformat(ds),float(val)))
            except: pass
    return out

def lag_value(rows,t,days_back=1):
    # Strictly use values dated before the signal date; no same-day future leakage.
    d=t.date()-timedelta(days=days_back)
    vals=[(dd,v) for dd,v in rows if dd<=d]
    return vals[-1][1] if vals else (rows[0][1] if rows else 0.0)

def macro_extra(t,d2,d10):
    y2=lag_value(d2,t,1); y2_2=lag_value(d2,t,2); y2_6=lag_value(d2,t,6)
    y10=lag_value(d10,t,1); y10_2=lag_value(d10,t,2)
    curve=y10-y2
    return [y2/5.0,(y2-y2_2)*10.0,(y2-y2_6)*5.0,curve,(y10-y10_2)*10.0]

def near_event(t,window_min):
    if not window_min:return False
    w=timedelta(minutes=window_min)
    return any(abs(t-e)<=w for e in EVENTS)

def arr(rows,kind):
    if kind=='dir':
        z=[r for r in rows if r['first'] in ('long','short')]
        return np.array([r['xp'] for r in z]),np.array([1 if r['first']=='long' else 0 for r in z])
    return np.array([r['xp'] for r in rows]),np.array([1 if r['reach'] else 0 for r in rows])

def eval_model(rm,dm,rows,rth,dth,event_window,allowed_hours):
    if not rows:return {'signals':0}
    X=np.array([r['xp'] for r in rows]); rp=rm.predict_proba(X)[:,1]; dp=dm.predict_proba(X)[:,1]
    idx=[]
    for i,r in enumerate(rows):
        if rp[i]<rth or max(dp[i],1-dp[i])<dth: continue
        if near_event(r['t'],event_window): continue
        if allowed_hours is not None and r['t'].hour not in allowed_hours: continue
        idx.append(i)
    n=len(idx)
    if not n:return {'signals':0}
    hit=strict=dec=decwin=L=S=0
    for i in idx:
        r=rows[i]; side='long' if dp[i]>=.5 else 'short'; L+=side=='long'; S+=side=='short'
        hit += r['lh'] if side=='long' else r['sh']; strict += r['first']==side
        if r['first'] in ('long','short'): dec+=1; decwin+=r['first']==side
    return {'signals':n,'coverage_all_pct':100*n/len(rows),'target_hit_30m_pct':100*hit/n,
            'strict_first_touch_success_pct':100*strict/n,'decisive_accuracy_pct':100*decwin/dec if dec else 0,
            'long':L,'short':S}

def main():
    _,rows=bt.build(); d2=load_yield('DGS2.csv'); d10=load_yield('DGS10.csv')
    for r in rows:r['xp']=r['x']+macro_extra(r['t'],d2,d10)
    tr=[r for r in rows if r['t']<bt.TUNE]; tu=[r for r in rows if bt.TUNE<=r['t']<bt.HOLD]; ho=[r for r in rows if r['t']>=bt.HOLD]
    Xr,yr=arr(tr,'reach'); Xd,yd=arr(tr,'dir')
    rm=make_pipeline(StandardScaler(),LogisticRegression(C=.35,max_iter=2500,class_weight='balanced')).fit(Xr,yr)
    dm=HistGradientBoostingClassifier(max_iter=220,learning_rate=.04,max_depth=3,min_samples_leaf=35,l2_regularization=4,random_state=17).fit(Xd,yd)
    hour_sets={
      'all':None,
      'liquid':set(range(6,21)),
      'eu_us':set(range(7,20)),
      'us_overlap':set(range(12,20)),
      'asia_eu':set(list(range(0,12))+[12]),
    }
    cand=[]
    for rth in (.50,.55,.60,.65,.70,.75,.80,.85):
      for dth in (.60,.65,.70,.75,.80,.85,.90):
       for ew in (0,15,30,60,90):
        for hn,hs in hour_sets.items():
         z=eval_model(rm,dm,tu,rth,dth,ew,hs)
         if z.get('signals',0)<70 or z.get('coverage_all_pct',0)<3 or min(z.get('long',0),z.get('short',0))<10:continue
         # Precision-first, but still require non-trivial coverage and balanced sides.
         obj=z['target_hit_30m_pct'] + .20*z['strict_first_touch_success_pct'] + .03*min(z['coverage_all_pct'],15)
         cand.append((obj,rth,dth,ew,hn,z))
    cand.sort(reverse=True,key=lambda x:x[0])
    best=cand[0]
    _,rth,dth,ew,hn,tune=best; hs=hour_sets[hn]
    hold=eval_model(rm,dm,ho,rth,dth,ew,hs); train=eval_model(rm,dm,tr,rth,dth,ew,hs)
    out={'features':len(tr[0]['xp']),'selected':{'reach_threshold':rth,'direction_threshold':dth,'event_exclusion_minutes':ew,'hours_utc':hn,'train':train,'tune':tune,'holdout':hold},
         'top_tune':[{'rth':x[1],'dth':x[2],'event_min':x[3],'hours':x[4],'tune':x[5]} for x in cand[:12]],
         'note':'Precision experiment adds lagged DGS2 level/change and 10Y-2Y curve. Selection uses Apr-May train + June tuning only; Jul-Aug holdout is untouched.'}
    print('PRECISION_RESULT_JSON');print(json.dumps(out,indent=2))

if __name__=='__main__':main()
