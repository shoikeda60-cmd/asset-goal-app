#!/usr/bin/env python3
import csv,glob,math,os,json
from bisect import bisect_right
from datetime import datetime,timezone,timedelta
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import log_loss

TARGET=5.1911590909
START=datetime(2026,4,1,tzinfo=timezone.utc); TUNE=datetime(2026,6,1,tzinfo=timezone.utc); HOLD=datetime(2026,7,1,tzinfo=timezone.utc)

def pt(v):
 s=str(v).strip().replace('Z','+00:00')
 if s.isdigit():
  x=int(s);return datetime.fromtimestamp(x/1000 if x>10**12 else x,tz=timezone.utc)
 try:d=datetime.fromisoformat(s)
 except:d=datetime.strptime(s,'%Y-%m-%d %H:%M:%S')
 return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)
def load():
 fs=[p for pat in ('**/*usdjpy*.csv','**/*USDJPY*.csv') for p in glob.glob(pat,recursive=True) if os.path.isfile(p)];p=max(fs,key=os.path.getsize);a=[]
 with open(p,encoding='utf-8-sig') as f:
  for r in csv.DictReader(f):
   try:
    v=[float(r[k]) for k in ('open','high','low','close')];v=[x/1000 for x in v] if v[3]>1000 else v
    a.append({'t':pt(r.get('timestamp') or r.get('time') or r.get('date') or r.get('datetime')),'o':v[0],'h':v[1],'l':v[2],'c':v[3]})
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
 c=[x['c'] for x in bs];e9=ema(c[-40:],9);e21=ema(c[-60:],21);rr=rsi(c);mom=c[-1]-c[-4]
 s=(1 if e9>e21 else -1)+(.6 if c[-1]>e9 else -.6)+(.5 if mom>0 else -.5)+(.5 if rr>52 else -.5 if rr<48 else 0)
 if rr>75:s-=.35
 if rr<25:s+=.35
 return max(-1,min(1,s/2.6))
def reach(bs):
 if len(bs)<80:return .5,.5
 d=TARGET*.01;L=S=N=0
 for i in range(max(0,len(bs)-360),len(bs)-30,2):
  base=bs[i]['c'];u=dn=False
  for x in bs[i+1:i+31]:u|=x['h']>=base+d;dn|=x['l']<=base-d
  L+=u;S+=dn;N+=1
 return (L/N if N else .5),(S/N if N else .5)
def label(f,base):
 d=TARGET*.01
 for x in f:
  u=x['h']>=base+d;dn=x['l']<=base-d
  if u and dn:return None
  if u:return 1
  if dn:return 0
 return None
def feat(h,sc,hl,hs,t):
 c=[x['c'] for x in h];last=c[-1];ap=atr(h)/.01;rr=rsi(c)
 moms=[]
 for n in (1,3,5,10,15,30,60):moms.append((last-c[-1-n])/(TARGET*.01) if len(c)>n else 0)
 e9=ema(c[-60:],9);e21=ema(c[-80:],21);e50=ema(c[-100:],50)
 def pos(n):
  z=c[-n:];lo=min(z);hi=max(z);return (last-lo)/(hi-lo) if hi>lo else .5
 h20=h[-20:];rng20=max(x['h'] for x in h20)-min(x['l'] for x in h20)
 hour=t.hour+t.minute/60;ang=2*math.pi*hour/24;dow=t.weekday();dang=2*math.pi*dow/5
 rate=3.625-(1.0 if t>=datetime(2026,6,17,tzinfo=timezone.utc) else .75)
 return sc+[hl,hs,hl-hs,ap/TARGET,(rr-50)/25,(last-e9)/(TARGET*.01),(e9-e21)/(TARGET*.01),(e21-e50)/(TARGET*.01),pos(20)-.5,pos(60)-.5,rng20/(TARGET*.01)]+moms+[math.sin(ang),math.cos(ang),math.sin(dang),math.cos(dang),rate/3]
def build():
 m1=load();tm=[b['t'] for b in m1];ser={1:m1,5:agg(m1,5),15:agg(m1,15),60:agg(m1,60),240:agg(m1,240),1440:agg(m1,1440)};sts={k:[x['t'] for x in v] for k,v in ser.items()};rows=[]
 i=max(bisect_right(tm,START)-1,1500)
 while i<len(m1)-31:
  t=m1[i]['t'];e=bisect_right(tm,t+timedelta(minutes=30));f=m1[i+1:e]
  if len(f)>=20:
   y=label(f,m1[i]['c'])
   if y is not None:
    h=m1[max(0,i-1440):i+1];hl,hs=reach(h);sc=[]
    for k in (1,5,15,60,240,1440):j=bisect_right(sts[k],t);sc.append(score(ser[k][max(0,j-100):j]))
    rows.append((t,feat(h,sc,hl,hs,t),y))
  i+=15
 return m1,rows
def metric(model,rows,thr):
 if not rows:return {'n':0,'win':0,'coverage':0,'long':0,'short':0}
 X=np.array([r[1] for r in rows]);y=np.array([r[2] for r in rows]);p=model.predict_proba(X)[:,1]
 take=(p>=thr)|(p<=1-thr);pred=(p>=.5).astype(int);n=int(take.sum());win=float((pred[take]==y[take]).mean()*100) if n else 0
 return {'n':n,'win':win,'coverage':float(n/len(rows)*100),'long':int(((pred==1)&take).sum()),'short':int(((pred==0)&take).sum()),'avg_conf':float(np.maximum(p[take],1-p[take]).mean()*100) if n else 0}
def main():
 m1,rows=build();tr=[r for r in rows if r[0]<TUNE];tu=[r for r in rows if TUNE<=r[0]<HOLD];ho=[r for r in rows if r[0]>=HOLD]
 X=np.array([r[1] for r in tr]);y=np.array([r[2] for r in tr])
 models={
  'logistic':make_pipeline(StandardScaler(),LogisticRegression(C=.35,max_iter=2000,class_weight='balanced')),
  'histgb':HistGradientBoostingClassifier(max_iter=180,learning_rate=.045,max_depth=3,min_samples_leaf=35,l2_regularization=3,random_state=7),
  'rf':RandomForestClassifier(n_estimators=180,max_depth=6,min_samples_leaf=20,max_features=.65,class_weight='balanced_subsample',random_state=7,n_jobs=-1)
 }
 best=None;detail={}
 for name,m in models.items():
  m.fit(X,y);detail[name]={}
  for th in (.50,.52,.54,.56,.58,.60,.62,.65,.68,.70,.72):
   z=metric(m,tu,th);detail[name][str(th)]=z
   if z['n']<150 or z['coverage']<12 or min(z['long'],z['short'])<30:continue
   obj=z['win']+min(z['coverage'],35)*.025
   if best is None or obj>best[0]:best=(obj,name,m,th,z)
 if best is None:raise RuntimeError('no model')
 _,name,m,th,tz=best;hz=metric(m,ho,th);trz=metric(m,tr,th)
 base_models={}
 for n,mm in models.items():base_models[n]={'tune_050':metric(mm,tu,.50),'holdout_050':metric(mm,ho,.50)}
 out={'data':{'bars':len(m1),'train_decisive':len(tr),'tune_decisive':len(tu),'holdout_decisive':len(ho),'features':len(tr[0][1])},'selected':{'model':name,'threshold':th,'train':trz,'tune':tz,'holdout':hz},'all_models_base':base_models,'tune_grid':detail,'note':'Apr-May training, June threshold/model selection, Jul-Aug untouched holdout. Target is which side reaches 5.191 pips first within 30 minutes; ties/none excluded.'}
 print('ML_RESULT_JSON');print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
