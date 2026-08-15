#!/usr/bin/env python3
import csv,glob,math,os,json
from bisect import bisect_right
from datetime import datetime,timezone,timedelta
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier,RandomForestClassifier
TARGET=5.1911590909
START=datetime(2026,4,1,tzinfo=timezone.utc);TUNE=datetime(2026,6,1,tzinfo=timezone.utc);HOLD=datetime(2026,7,1,tzinfo=timezone.utc)
def pt(v):
 s=str(v).strip().replace('Z','+00:00')
 if s.isdigit():x=int(s);return datetime.fromtimestamp(x/1000 if x>10**12 else x,tz=timezone.utc)
 try:d=datetime.fromisoformat(s)
 except:d=datetime.strptime(s,'%Y-%m-%d %H:%M:%S')
 return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)
def load():
 fs=[p for pat in ('**/*usdjpy*.csv','**/*USDJPY*.csv') for p in glob.glob(pat,recursive=True) if os.path.isfile(p)];p=max(fs,key=os.path.getsize);a=[]
 with open(p,encoding='utf-8-sig') as f:
  for r in csv.DictReader(f):
   try:
    v=[float(r[k]) for k in ('open','high','low','close')];v=[x/1000 for x in v] if v[3]>1000 else v;a.append({'t':pt(r.get('timestamp') or r.get('time') or r.get('date') or r.get('datetime')),'o':v[0],'h':v[1],'l':v[2],'c':v[3]})
   except:pass
 a.sort(key=lambda x:x['t']);return a
def agg(bs,m):
 out=[];key=None
 for b in bs:
  k=int(b['t'].timestamp())//(m*60)
  if k!=key:out.append({'t':datetime.fromtimestamp(k*m*60,tz=timezone.utc),'o':b['o'],'h':b['h'],'l':b['l'],'c':b['c']});key=k
  else:out[-1]['h']=max(out[-1]['h'],b['h']);out[-1]['l']=min(out[-1]['l'],b['l']);out[-1]['c']=b['c']
 return out
def ema(v,n):
 e=v[0];a=2/(n+1)
 for x in v[1:]:e=x*a+e*(1-a)
 return e
def rsi(v,n=14):
 if len(v)<n+1:return 50
 g=l=0
 for i in range(len(v)-n,len(v)):
  d=v[i]-v[i-1];g+=max(d,0);l+=max(-d,0)
 return 100 if l==0 else 100-100/(1+(g/n)/(l/n))
def atr(bs,n=14):
 if len(bs)<n+1:return 0
 return sum(max(bs[i]['h']-bs[i]['l'],abs(bs[i]['h']-bs[i-1]['c']),abs(bs[i]['l']-bs[i-1]['c'])) for i in range(len(bs)-n,len(bs)))/n
def score(bs):
 if len(bs)<25:return 0
 c=[x['c'] for x in bs];e9=ema(c[-40:],9);e21=ema(c[-60:],21);rr=rsi(c);mom=c[-1]-c[-4];s=(1 if e9>e21 else -1)+(.6 if c[-1]>e9 else -.6)+(.5 if mom>0 else -.5)+(.5 if rr>52 else -.5 if rr<48 else 0)
 if rr>75:s-=.35
 if rr<25:s+=.35
 return max(-1,min(1,s/2.6))
def reachhist(bs):
 if len(bs)<80:return .5,.5
 d=TARGET*.01;L=S=N=0
 for i in range(max(0,len(bs)-360),len(bs)-30,2):
  base=bs[i]['c'];u=dn=False
  for x in bs[i+1:i+31]:u|=x['h']>=base+d;dn|=x['l']<=base-d
  L+=u;S+=dn;N+=1
 return (L/N if N else .5),(S/N if N else .5)
def outcome(f,base):
 d=TARGET*.01;lh=any(x['h']>=base+d for x in f);sh=any(x['l']<=base-d for x in f);first='none'
 for x in f:
  u=x['h']>=base+d;dn=x['l']<=base-d
  if u and dn:first='tie';break
  if u:first='long';break
  if dn:first='short';break
 return first,lh,sh
def feat(h,sc,hl,hs,t):
 c=[x['c'] for x in h];last=c[-1];ap=atr(h)/.01;rr=rsi(c);moms=[]
 for n in (1,3,5,10,15,30,60):moms.append((last-c[-1-n])/(TARGET*.01) if len(c)>n else 0)
 e9=ema(c[-60:],9);e21=ema(c[-80:],21);e50=ema(c[-100:],50)
 def pos(n):
  z=c[-n:];lo=min(z);hi=max(z);return (last-lo)/(hi-lo) if hi>lo else .5
 h20=h[-20:];h60=h[-60:];rng20=max(x['h'] for x in h20)-min(x['l'] for x in h20);rng60=max(x['h'] for x in h60)-min(x['l'] for x in h60);hour=t.hour+t.minute/60;ang=2*math.pi*hour/24;dow=t.weekday();dang=2*math.pi*dow/5;rate=3.625-(1.0 if t>=datetime(2026,6,17,tzinfo=timezone.utc) else .75)
 return sc+[hl,hs,hl-hs,ap/TARGET,(rr-50)/25,(last-e9)/(TARGET*.01),(e9-e21)/(TARGET*.01),(e21-e50)/(TARGET*.01),pos(20)-.5,pos(60)-.5,rng20/(TARGET*.01),rng60/(TARGET*.01)]+moms+[math.sin(ang),math.cos(ang),math.sin(dang),math.cos(dang),rate/3]
def build():
 m1=load();tm=[b['t'] for b in m1];ser={1:m1,5:agg(m1,5),15:agg(m1,15),60:agg(m1,60),240:agg(m1,240),1440:agg(m1,1440)};sts={k:[x['t'] for x in v] for k,v in ser.items()};rows=[];i=max(bisect_right(tm,START)-1,1500)
 while i<len(m1)-31:
  t=m1[i]['t'];e=bisect_right(tm,t+timedelta(minutes=30));f=m1[i+1:e]
  if len(f)>=20:
   h=m1[max(0,i-1440):i+1];hl,hs=reachhist(h);sc=[]
   for k in (1,5,15,60,240,1440):j=bisect_right(sts[k],t);sc.append(score(ser[k][max(0,j-100):j]))
   first,lh,sh=outcome(f,m1[i]['c']);rows.append({'t':t,'x':feat(h,sc,hl,hs,t),'first':first,'lh':lh,'sh':sh,'reach':lh or sh})
  i+=15
 return m1,rows
def arr(rows,kind):
 if kind=='dir':z=[r for r in rows if r['first'] in ('long','short')];return np.array([r['x'] for r in z]),np.array([1 if r['first']=='long' else 0 for r in z])
 return np.array([r['x'] for r in rows]),np.array([1 if r['reach'] else 0 for r in rows])
def metric(rm,dm,rows,rth,dth):
 X=np.array([r['x'] for r in rows]);rp=rm.predict_proba(X)[:,1];dp=dm.predict_proba(X)[:,1];take=(rp>=rth)&((dp>=dth)|(dp<=1-dth));pred=np.where(dp>=.5,'long','short');idx=np.where(take)[0];n=len(idx)
 if not n:return {'signals':0}
 strict=hit=decwin=dec=L=S=0
 for i in idx:
  r=rows[i];sd=pred[i];L+=sd=='long';S+=sd=='short';strict+=r['first']==sd;hit+=r['lh'] if sd=='long' else r['sh'];dec+=r['first'] in ('long','short');decwin+=r['first']==sd if r['first'] in ('long','short') else 0
 return {'signals':n,'coverage_all_pct':100*n/len(rows),'strict_first_touch_success_pct':100*strict/n,'target_hit_30m_pct':100*hit/n,'decisive_accuracy_pct':100*decwin/dec if dec else 0,'decisive_selected':dec,'long':L,'short':S,'avg_reach_prob_pct':100*float(rp[idx].mean()),'avg_dir_conf_pct':100*float(np.maximum(dp[idx],1-dp[idx]).mean())}
def main():
 m1,rows=build();tr=[r for r in rows if r['t']<TUNE];tu=[r for r in rows if TUNE<=r['t']<HOLD];ho=[r for r in rows if r['t']>=HOLD];Xr,yr=arr(tr,'reach');Xd,yd=arr(tr,'dir')
 reachmods={'reach_hgb':HistGradientBoostingClassifier(max_iter=180,learning_rate=.045,max_depth=3,min_samples_leaf=35,l2_regularization=3,random_state=11),'reach_rf':RandomForestClassifier(n_estimators=180,max_depth=6,min_samples_leaf=20,max_features=.65,class_weight='balanced_subsample',random_state=11,n_jobs=-1),'reach_log':make_pipeline(StandardScaler(),LogisticRegression(C=.35,max_iter=2000,class_weight='balanced'))}
 dirmods={'dir_hgb':HistGradientBoostingClassifier(max_iter=180,learning_rate=.045,max_depth=3,min_samples_leaf=35,l2_regularization=3,random_state=7),'dir_rf':RandomForestClassifier(n_estimators=180,max_depth=6,min_samples_leaf=20,max_features=.65,class_weight='balanced_subsample',random_state=7,n_jobs=-1)}
 for m in reachmods.values():m.fit(Xr,yr)
 for m in dirmods.values():m.fit(Xd,yd)
 best=None;grid=[]
 for rn,rm in reachmods.items():
  for dn,dm in dirmods.items():
   for rth in (.45,.50,.55,.60,.65,.70,.75,.80):
    for dth in (.55,.60,.65,.70,.75,.80):
     z=metric(rm,dm,tu,rth,dth)
     if z.get('signals',0)<180 or z.get('coverage_all_pct',0)<8 or min(z.get('long',0),z.get('short',0))<25:continue
     obj=z['target_hit_30m_pct']*.55+z['strict_first_touch_success_pct']*.40+min(z['coverage_all_pct'],25)*.05
     grid.append((obj,rn,dn,rth,dth,z))
     if best is None or obj>best[0]:best=(obj,rn,dn,rth,dth,z)
 if best is None:raise RuntimeError('no model')
 _,rn,dn,rth,dth,tz=best;rm=reachmods[rn];dm=dirmods[dn];hz=metric(rm,dm,ho,rth,dth);trz=metric(rm,dm,tr,rth,dth)
 grid.sort(reverse=True,key=lambda x:x[0]);top=[{'reach_model':x[1],'dir_model':x[2],'reach_threshold':x[3],'dir_threshold':x[4],'tune':x[5]} for x in grid[:10]]
 out={'data':{'bars':len(m1),'train_all':len(tr),'tune_all':len(tu),'holdout_all':len(ho),'features':len(tr[0]['x'])},'selected':{'reach_model':rn,'dir_model':dn,'reach_threshold':rth,'dir_threshold':dth,'train':trz,'tune':tz,'holdout':hz},'top_tune_candidates':top,'note':'Two-stage model: probability any target is reachable, then conditional direction. Apr-May train, June select thresholds/models, Jul-Aug untouched holdout.'}
 print('TWO_STAGE_RESULT_JSON');print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
