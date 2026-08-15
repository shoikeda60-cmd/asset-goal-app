#!/usr/bin/env python3
import csv,glob,json,math,os,itertools
from bisect import bisect_right
from datetime import datetime,timezone,timedelta
TARGET_PIPS=5.1911590909; STEP=15
START=datetime(2026,4,1,tzinfo=timezone.utc); TUNE_START=datetime(2026,6,1,tzinfo=timezone.utc); HOLD_START=datetime(2026,7,1,tzinfo=timezone.utc)
def clamp(v,a,b):return max(a,min(b,v))
def pt(v):
 s=str(v).strip().replace('Z','+00:00')
 if s.isdigit():
  x=int(s);return datetime.fromtimestamp(x/1000 if x>10**12 else x,tz=timezone.utc)
 try:d=datetime.fromisoformat(s)
 except:d=datetime.strptime(s,'%Y-%m-%d %H:%M:%S')
 return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)
def load():
 fs=[p for pat in ('**/*usdjpy*.csv','**/*USDJPY*.csv') for p in glob.glob(pat,recursive=True) if os.path.isfile(p)];p=max(fs,key=os.path.getsize);out=[]
 with open(p,encoding='utf-8-sig') as f:
  for x in csv.DictReader(f):
   try:
    vals=[float(x[k]) for k in ('open','high','low','close')];vals=[z/1000 for z in vals] if vals[3]>1000 else vals
    out.append({'t':pt(x.get('timestamp') or x.get('time') or x.get('date') or x.get('datetime')),'o':vals[0],'h':vals[1],'l':vals[2],'c':vals[3]})
   except:pass
 out.sort(key=lambda x:x['t']);return out
def agg(bs,m):
 q=[];k0=None
 for b in bs:
  k=int(b['t'].timestamp())//(m*60)
  if k!=k0:q.append({'t':datetime.fromtimestamp(k*m*60,tz=timezone.utc),'o':b['o'],'h':b['h'],'l':b['l'],'c':b['c']});k0=k
  else:q[-1]['h']=max(q[-1]['h'],b['h']);q[-1]['l']=min(q[-1]['l'],b['l']);q[-1]['c']=b['c']
 return q
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
def score(bs):
 if len(bs)<25:return 0
 c=[x['c'] for x in bs];e9=ema(c[-40:],9);e21=ema(c[-60:],21);rr=rsi(c);mom=c[-1]-c[-4]
 s=(1 if e9>e21 else -1)+(.6 if c[-1]>e9 else -.6)+(.5 if mom>0 else -.5)+(.5 if rr>52 else -.5 if rr<48 else 0)
 if rr>75:s-=.35
 if rr<25:s+=.35
 return clamp(s/2.6,-1,1)
def atr(bs,n=14):
 if len(bs)<n+1:return 0
 return sum(max(bs[i]['h']-bs[i]['l'],abs(bs[i]['h']-bs[i-1]['c']),abs(bs[i]['l']-bs[i-1]['c'])) for i in range(len(bs)-n,len(bs)))/n
def reach(bs):
 if len(bs)<80:return .5,.5
 d=TARGET_PIPS*.01;L=S=N=0
 for i in range(max(0,len(bs)-360),len(bs)-30,2):
  base=bs[i]['c'];lo=sh=False
  for x in bs[i+1:i+31]:lo|=x['h']>=base+d;sh|=x['l']<=base-d
  L+=lo;S+=sh;N+=1
 return (L/N if N else .5),(S/N if N else .5)
def rate(t):return 3.625-(1.0 if t>=datetime(2026,6,17,tzinfo=timezone.utc) else .75)
def ft(f,base):
 d=TARGET_PIPS*.01
 for x in f:
  u=x['h']>=base+d;dn=x['l']<=base-d
  if u and dn:return 'tie'
  if u:return 'long'
  if dn:return 'short'
 return 'none'
def prep():
 m1=load();tm=[b['t'] for b in m1];ser={1:m1,5:agg(m1,5),15:agg(m1,15),60:agg(m1,60),240:agg(m1,240),1440:agg(m1,1440)};sts={k:[b['t'] for b in v] for k,v in ser.items()};rows=[]
 i=max(bisect_right(tm,START)-1,400)
 while i<len(m1)-31:
  t=m1[i]['t'];e=bisect_right(tm,t+timedelta(minutes=30));f=m1[i+1:e]
  if len(f)>=20:
   h=m1[max(0,i-1439):i+1];hl,hs=reach(h);ap=atr(h)/.01;rv=clamp((ap*math.sqrt(30/14))/TARGET_PIPS if ap else 1,.55,1.45);sc=[]
   for k in (1,5,15,60,240,1440):j=bisect_right(sts[k],t);sc.append(score(ser[k][max(0,j-80):j]))
   rows.append({'t':t,'sc':sc,'hl':hl,'hs':hs,'rv':rv,'rb':clamp(rate(t)/3,-1,1),'first':ft(f,m1[i]['c']),'atr':ap,'rsi':rsi([x['c'] for x in h]),'hour':t.hour})
  i+=STEP
 return m1,rows
def predictions(rows,w,rc):
 out=[]
 for r in rows:
  d=sum(a*b for a,b in zip(r['sc'],w));lp=round(clamp(50+d*22+(r['hl']-.5)*22+(r['rv']-1)*10+r['rb']*rc,15,85));sp=round(clamp(50-d*22+(r['hs']-.5)*22+(r['rv']-1)*10-r['rb']*rc,15,85))
  out.append((r,lp,sp))
 return out
def filt_side(r,lp,sp,cfg):
 mx=max(lp,sp);gap=abs(lp-sp)
 if mx<cfg['minp'] or gap<cfg['gap'] or r['atr']<cfg['minatr']:return None
 sd='long' if lp>sp else 'short'
 signs=sum(1 if x>cfg['scmin'] else -1 if x<-cfg['scmin'] else 0 for x in r['sc'])
 agree=sum(1 for x in r['sc'] if (x>cfg['scmin'] if sd=='long' else x<-cfg['scmin']))
 if agree<cfg['agree']:return None
 if cfg['rsi_guard']:
  if sd=='long' and r['rsi']>72:return None
  if sd=='short' and r['rsi']<28:return None
 if cfg['session']=='active' and not (6<=r['hour']<21):return None
 return sd
def metrics(pred,cfg):
 sig=dec=win=L=S=0
 for r,lp,sp in pred:
  sd=filt_side(r,lp,sp,cfg)
  if not sd:continue
  sig+=1;L+=sd=='long';S+=sd=='short'
  if r['first'] in ('long','short'):dec+=1;win+=r['first']==sd
 return {'signals':sig,'decisive':dec,'win':100*win/dec if dec else 0,'coverage':100*sig/len(pred) if pred else 0,'long':L,'short':S}
def old_metrics(rows):
 w=(.18,.24,.32,.26,0,0);p=predictions(rows,w,0);cfg={'minp':56,'gap':0,'agree':0,'minatr':0,'scmin':0,'rsi_guard':False,'session':'all'};return metrics(p,cfg)
def main():
 m1,rows=prep();tr=[r for r in rows if r['t']<TUNE_START];tu=[r for r in rows if TUNE_START<=r['t']<HOLD_START];ho=[r for r in rows if r['t']>=HOLD_START]
 old={'train':old_metrics(tr),'tune':old_metrics(tu),'holdout':old_metrics(ho)}
 # Weight search on train only.
 wc=[]
 for a,b,c,d,e,f in itertools.product((.05,.10,.15),(.08,.12,.16),(.18,.24,.30,.36),(.18,.24,.30),(.03,.06,.09),(.02,.05,.08)):
  s=a+b+c+d+e+f;w=tuple(x/s for x in (a,b,c,d,e,f))
  for rc in (0,.5,1,1.5):
   p=predictions(tr,w,rc);z=metrics(p,{'minp':56,'gap':0,'agree':0,'minatr':0,'scmin':0,'rsi_guard':False,'session':'all'})
   if z['coverage']>=25 and min(z['long'],z['short'])>=100:wc.append((z['win'],w,rc))
 wc.sort(reverse=True,key=lambda x:x[0]);wc=wc[:30]
 # Filter/threshold tuning on June only. Require useful coverage and sample size.
 configs=[]
 for minp,gap,agree,minatr,scmin,rg,sess in itertools.product((56,58,60,62,64,66),(0,4,8,12,16),(2,3,4,5),(0,1.5,2.5,3.5),(0,.15,.25),(False,True),('all','active')):
  configs.append({'minp':minp,'gap':gap,'agree':agree,'minatr':minatr,'scmin':scmin,'rsi_guard':rg,'session':sess})
 best=None
 for _,w,rc in wc:
  ptune=predictions(tu,w,rc)
  for cfg in configs:
   z=metrics(ptune,cfg)
   if z['coverage']<10 or z['decisive']<120 or min(z['long'],z['short'])<20:continue
   # favor accuracy but mildly penalize vanishing coverage
   obj=z['win'] + min(z['coverage'],30)*.03
   if best is None or obj>best[0]:best=(obj,w,rc,cfg,z)
 if not best:raise RuntimeError('no candidate')
 _,w,rc,cfg,tz=best;hz=metrics(predictions(ho,w,rc),cfg);trz=metrics(predictions(tr,w,rc),cfg)
 out={'data':{'bars':len(m1),'train_points':len(tr),'tune_points':len(tu),'holdout_points':len(ho),'target_pips':round(TARGET_PIPS,3)},'old':old,'best':{'weights':dict(zip(['m1','m5','m15','h1','h4','d1'],[round(x,4) for x in w])),'rate_coeff':rc,'filter':cfg,'train':trz,'tune':tz,'holdout':hz},'holdout_improvement_pp':round(hz['win']-old['holdout']['win'],2),'note':'Weights chosen on Apr-May, filters tuned on June, final Jul-Aug holdout untouched until final evaluation. Accuracy optimization requires >=10% tune coverage and >=120 decisive tune cases.'}
 print('TUNING_RESULT_JSON');print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
