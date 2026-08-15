#!/usr/bin/env python3
import csv,glob,json,math,os,itertools
from bisect import bisect_right
from datetime import datetime,timezone,timedelta
TARGET_PIPS=5.1911590909; STEP=15
TRAIN_START=datetime(2026,4,1,tzinfo=timezone.utc); VAL_START=datetime(2026,7,1,tzinfo=timezone.utc)
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
  r=csv.DictReader(f)
  for x in r:
   try:
    vals=[float(x[k]) for k in ('open','high','low','close')]; vals=[z/1000 for z in vals] if vals[3]>1000 else vals
    t=pt(x.get('timestamp') or x.get('time') or x.get('date') or x.get('datetime'));out.append({'t':t,'o':vals[0],'h':vals[1],'l':vals[2],'c':vals[3]})
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
 c=[x['c'] for x in bs];e9=ema(c[-40:],9);e21=ema(c[-60:],21);rr=rsi(c);mom=c[-1]-c[-4];s=(1 if e9>e21 else -1)+(.6 if c[-1]>e9 else -.6)+(.5 if mom>0 else -.5)+(.5 if rr>52 else -.5 if rr<48 else 0)
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
def side(lp,sp):
 if lp>=62 and lp-sp>=8:return 'long'
 if sp>=62 and sp-lp>=8:return 'short'
 if lp>=56 and lp>sp:return 'long'
 if sp>=56 and sp>lp:return 'short'
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
 i=max(bisect_right(tm,TRAIN_START)-1,400)
 while i<len(m1)-31:
  t=m1[i]['t'];e=bisect_right(tm,t+timedelta(minutes=30));f=m1[i+1:e]
  if len(f)>=20:
   h=m1[max(0,i-1439):i+1];hl,hs=reach(h);ap=atr(h)/.01;rv=clamp((ap*math.sqrt(30/14))/TARGET_PIPS if ap else 1,.55,1.45);sc=[]
   for k in (1,5,15,60,240,1440):j=bisect_right(sts[k],t);sc.append(score(ser[k][max(0,j-80):j]))
   rows.append({'t':t,'sc':sc,'hl':hl,'hs':hs,'rv':rv,'rb':clamp(rate(t)/3,-1,1),'first':ft(f,m1[i]['c'])})
  i+=STEP
 return m1,rows
def evalm(rows,w,rc):
 sig=dec=win=L=S=0
 for r in rows:
  d=sum(a*b for a,b in zip(r['sc'],w));lp=round(clamp(50+d*22+(r['hl']-.5)*22+(r['rv']-1)*10+r['rb']*rc,15,85));sp=round(clamp(50-d*22+(r['hs']-.5)*22+(r['rv']-1)*10-r['rb']*rc,15,85));sd=side(lp,sp)
  if not sd:continue
  sig+=1;L+=sd=='long';S+=sd=='short'
  if r['first'] in ('long','short'):dec+=1;win+=r['first']==sd
 return {'signals':sig,'decisive':dec,'win':100*win/dec if dec else 0,'coverage':100*sig/len(rows) if rows else 0,'long':L,'short':S}
def main():
 m1,rows=prep();tr=[r for r in rows if r['t']<VAL_START];va=[r for r in rows if r['t']>=VAL_START]
 old=(.18,.24,.32,.26,0,0); base_tr=evalm(tr,old,0);base_va=evalm(va,old,0)
 cand=[]
 # keep all six TFs; search sensible normalized families + small rate coefficients
 for a,b,c,d,e,f in itertools.product((.05,.10,.15),(.08,.12,.16),(.12,.18,.24),(.16,.22,.28),(.04,.08,.12),(.02,.05,.08)):
  s=a+b+c+d+e+f;w=tuple(x/s for x in (a,b,c,d,e,f))
  for rc in (0,.5,1,1.5,2):
   z=evalm(tr,w,rc)
   if z['coverage']>=25 and min(z['long'],z['short'])>=max(50,.08*z['signals']):cand.append((z['win'],z['coverage'],w,rc,z))
 cand.sort(reverse=True,key=lambda x:(x[0],x[1])); top=cand[:40]
 # choose by validation, not training
 checked=[]
 for _,_,w,rc,tz in top:
  vz=evalm(va,w,rc);checked.append((vz['win'],vz['coverage'],w,rc,tz,vz))
 checked.sort(reverse=True,key=lambda x:(x[0],x[1]));best=checked[0];_,_,w,rc,tz,vz=best
 out={'data':{'bars':len(m1),'train_points':len(tr),'validation_points':len(va),'target_pips':round(TARGET_PIPS,3)},'old':{'train':base_tr,'validation':base_va},'best':{'weights':dict(zip(['m1','m5','m15','h1','h4','d1'],[round(x,4) for x in w])),'rate_coeff':rc,'train':tz,'validation':vz},'validation_improvement_pp':round(vz['win']-base_va['win'],2),'note':'Weights selected from top training candidates using July-August holdout validation. All six timeframes retained; rate coefficient may shrink to zero if it does not help.'}
 print('TUNING_RESULT_JSON');print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
