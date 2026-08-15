#!/usr/bin/env python3
import csv, glob, json, math, os
from bisect import bisect_right
from datetime import datetime, timezone, timedelta

TARGET_PIPS=5.1911590909
HORIZON_MIN=30
TEST_STEP=15
TEST_START=datetime(2026,4,1,tzinfo=timezone.utc)

def clamp(v,a,b): return max(a,min(b,v))
def parse_time(v):
    s=str(v).strip()
    if not s: raise ValueError('empty time')
    if s.isdigit():
        x=int(s); x=x/1000 if x>10**12 else x
        return datetime.fromtimestamp(x,tz=timezone.utc)
    s=s.replace('Z','+00:00')
    for f in (None,'%Y-%m-%d %H:%M:%S','%Y-%m-%dT%H:%M:%S','%Y.%m.%d %H:%M:%S'):
        try:
            d=datetime.fromisoformat(s) if f is None else datetime.strptime(s,f)
            return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)
        except Exception: pass
    raise ValueError(s)
def find_csv():
    cand=[]
    for pat in ('**/*usdjpy*.csv','**/*USDJPY*.csv'): cand.extend(glob.glob(pat,recursive=True))
    cand=[p for p in cand if os.path.isfile(p)]
    if not cand: raise RuntimeError('Dukascopy CSV not found')
    return max(cand,key=os.path.getsize)
def load_csv():
    path=find_csv();bars=[]
    with open(path,'r',encoding='utf-8-sig',newline='') as f: rows=list(csv.reader(f))
    header=[x.strip().lower() for x in rows[0]];has_header=any(x in ('timestamp','time','date','datetime','open') for x in header)
    data=rows[1:] if has_header else rows;idx={k:i for i,k in enumerate(header)} if has_header else {}
    def pick(row,names):
        for n in names:
            if n in idx and idx[n]<len(row): return row[idx[n]]
    for row in data:
        try:
            if has_header: tv=pick(row,['timestamp','time','datetime','date']);o=pick(row,['open']);h=pick(row,['high']);l=pick(row,['low']);c=pick(row,['close'])
            else: tv,o,h,l,c=row[:5]
            vals=list(map(float,(o,h,l,c)))
            if vals[3]>1000: vals=[x/1000 for x in vals]
            bars.append({'t':parse_time(tv),'o':vals[0],'h':vals[1],'l':vals[2],'c':vals[3]})
        except Exception: pass
    bars.sort(key=lambda x:x['t']);out=[]
    for b in bars:
        if out and out[-1]['t']==b['t']:out[-1]=b
        else:out.append(b)
    print('DATA_FILE',path,'ROWS',len(out),'FROM',out[0]['t'].isoformat(),'TO',out[-1]['t'].isoformat())
    return out
def aggregate(bars,mins):
    sec=mins*60;out=[];cur=None;key=None
    for b in bars:
        k=int(b['t'].timestamp())//sec*sec
        if k!=key:cur={'t':datetime.fromtimestamp(k,tz=timezone.utc),'o':b['o'],'h':b['h'],'l':b['l'],'c':b['c']};out.append(cur);key=k
        else:cur['h']=max(cur['h'],b['h']);cur['l']=min(cur['l'],b['l']);cur['c']=b['c']
    return out
def ema(vals,n):
    if not vals:return float('nan')
    k=2/(n+1);e=vals[0]
    for x in vals[1:]:e=x*k+e*(1-k)
    return e
def rsi(vals,n=14):
    if len(vals)<n+1:return 50.0
    g=l=0.0
    for i in range(len(vals)-n,len(vals)):
        d=vals[i]-vals[i-1]
        if d>0:g+=d
        else:l-=d
    if l==0:return 100.0
    rs=(g/n)/(l/n);return 100-(100/(1+rs))
def atr(bars,n=14):
    if len(bars)<n+1:return 0.0
    s=0.0
    for i in range(len(bars)-n,len(bars)):
        b=bars[i];p=bars[i-1]['c'];s+=max(b['h']-b['l'],abs(b['h']-p),abs(b['l']-p))
    return s/n
def tf_score(bars,new=False):
    if len(bars)<25:return 0.0
    closes=[b['c'] for b in bars];e9=ema(closes[-40:] if new else closes[-30:],9);e21=ema(closes[-60:] if new else closes[-40:],21);rr=rsi(closes,14);mom=closes[-1]-closes[max(0,len(closes)-4)]
    s=(1 if e9>e21 else -1)+(.6 if closes[-1]>e9 else -.6)+(.5 if mom>0 else -.5)+(.5 if rr>52 else (-.5 if rr<48 else 0))
    if rr>75:s-=.35
    if rr<25:s+=.35
    return clamp(s/2.6,-1,1)
def rate_diff_at(t):
    return 3.625-(1.00 if t>=datetime(2026,6,17,tzinfo=timezone.utc) else .75)
def historical_reach(bars,pips):
    d=pips*.01
    if len(bars)<80:return .5,.5,0
    L=S=N=0;start=max(0,len(bars)-360)
    for i in range(start,len(bars)-30,2):
        base=bars[i]['c'];lo=sh=False
        for x in bars[i+1:i+31]:
            if x['h']>=base+d:lo=True
            if x['l']<=base-d:sh=True
            if lo and sh:break
        L+=lo;S+=sh;N+=1
    return (L/N if N else .5),(S/N if N else .5),N
def signal_side(lp,sp):
    if lp>=62 and lp-sp>=8:return 'long'
    if sp>=62 and sp-lp>=8:return 'short'
    if lp>=56 and lp>sp:return 'long'
    if sp>=56 and sp>lp:return 'short'
    return None
def first_touch(future,base,d):
    for x in future:
        up=x['h']>=base+d;dn=x['l']<=base-d
        if up and dn:return 'tie'
        if up:return 'long'
        if dn:return 'short'
    return 'none'
def summarize(rows,name):
    sig=[r for r in rows if r['side']];dec=[r for r in sig if r['first'] in ('long','short')]
    def pct(n,d):return round(100*n/d,2) if d else None
    out={'model':name,'test_points':len(rows),'signal_count':len(sig),'coverage_pct':pct(len(sig),len(rows)),'target_hit_pct':pct(sum(r['hit'] for r in sig),len(sig)),'opposite_target_hit_pct':pct(sum(r['opp'] for r in sig),len(sig)),'first_touch_decisive_count':len(dec),'first_touch_win_pct':pct(sum(r['first']==r['side'] for r in dec),len(dec)),'long_signals':sum(r['side']=='long' for r in sig),'short_signals':sum(r['side']=='short' for r in sig),'strength':{}}
    for label,lo,hi in [('56-61',56,62),('62-69',62,70),('70+',70,86)]:
        z=[r for r in sig if lo<=r['p']<hi];dz=[r for r in z if r['first'] in ('long','short')]
        out['strength'][label]={'n':len(z),'first_touch_win_pct':pct(sum(r['first']==r['side'] for r in dz),len(dz)),'target_hit_pct':pct(sum(r['hit'] for r in z),len(z))}
    return out
def main():
    m1=load_csv();times=[b['t'] for b in m1];series={1:m1,5:aggregate(m1,5),15:aggregate(m1,15),60:aggregate(m1,60),240:aggregate(m1,240),1440:aggregate(m1,1440)};stimes={k:[b['t'] for b in v] for k,v in series.items()}
    rows_old=[];rows_new=[];d=TARGET_PIPS*.01;start_i=max(bisect_right(times,TEST_START)-1,400)
    for i in range(start_i,len(m1)-31,TEST_STEP):
        t=m1[i]['t'];end=bisect_right(times,t+timedelta(minutes=HORIZON_MIN));future=m1[i+1:end]
        if len(future)<20:continue
        base=m1[i]['c'];first=first_touch(future,base,d);lhit=any(x['h']>=base+d for x in future);shit=any(x['l']<=base-d for x in future)
        hist1=m1[max(0,i-1439):i+1];hl,hs,_=historical_reach(hist1,TARGET_PIPS);a=atr(hist1,14)/.01;reach=clamp((a*math.sqrt(30/14))/TARGET_PIPS if a>0 else 1,.55,1.45)
        og=[]
        for k in (1,5,15,60):j=bisect_right(stimes[k],t);og.append(series[k][max(0,j-80):j])
        os=[tf_score(x,False) for x in og];od=sum(v*w for v,w in zip(os,[.18,.24,.32,.26]));olp=round(clamp(50+od*22+(hl-.5)*22+(reach-1)*10,15,85));osp=round(clamp(50-od*22+(hs-.5)*22+(reach-1)*10,15,85))
        ng=[]
        for k in (1,5,15,60,240,1440):j=bisect_right(stimes[k],t);ng.append(series[k][max(0,j-80):j])
        ns=[tf_score(x,True) for x in ng];nd=sum(v*w for v,w in zip(ns,[.08,.12,.18,.22,.22,.18]));rb=clamp(rate_diff_at(t)/3,-1,1);nlp=round(clamp(50+nd*22+(hl-.5)*22+(reach-1)*10+rb*4,15,85));nsp=round(clamp(50-nd*22+(hs-.5)*22+(reach-1)*10-rb*4,15,85))
        for rows,lp,sp in ((rows_old,olp,osp),(rows_new,nlp,nsp)):
            side=signal_side(lp,sp);hit=(lhit if side=='long' else shit) if side else False;opp=(shit if side=='long' else lhit) if side else False;rows.append({'side':side,'hit':hit,'opp':opp,'first':first,'p':max(lp,sp)})
    old=summarize(rows_old,'old_4tf');new=summarize(rows_new,'new_6tf_rates');result={'data':{'bars':len(m1),'from':m1[0]['t'].isoformat(),'to':m1[-1]['t'].isoformat(),'test_start':TEST_START.isoformat(),'step_minutes':TEST_STEP,'target_pips':round(TARGET_PIPS,3)},'old':old,'new':new,'improvement_first_touch_pp':round(new['first_touch_win_pct']-old['first_touch_win_pct'],2)}
    print('BACKTEST_COMPARISON_JSON');print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
