#!/usr/bin/env python3
import csv, io, json, math, urllib.request
from datetime import datetime

DATA_URL = 'https://raw.githubusercontent.com/simonnmarket/OMEGA_OS_Kernel/c01a174f47f6eecf946582a161e9150fbaf3e4c7/OHLCV_DATA/USDJPY/USDJPY_M1.csv'
TARGET_PIPS = 5.1911590909
MAX_HISTORY = 1440  # mirror Yahoo 1d-style production window as closely as possible
HORIZON = 30


def clamp(v,a,b): return max(a,min(b,v))

def ema(vals,n):
    if not vals: return float('nan')
    k=2/(n+1); e=vals[0]
    for x in vals[1:]: e=x*k+e*(1-k)
    return e

def rsi(vals,n=14):
    if len(vals)<n+1: return 50.0
    g=l=0.0
    for i in range(len(vals)-n,len(vals)):
        d=vals[i]-vals[i-1]
        if d>0: g+=d
        else: l-=d
    if l==0: return 100.0
    rs=(g/n)/(l/n)
    return 100-(100/(1+rs))

def atr(bars,n=14):
    if len(bars)<n+1: return 0.0
    s=0.0
    for i in range(len(bars)-n,len(bars)):
        b=bars[i]; p=bars[i-1]['c']
        s+=max(b['h']-b['l'],abs(b['h']-p),abs(b['l']-p))
    return s/n

def aggregate(bars,mins):
    out=[]; cur=None; curk=None
    sec=mins*60
    for b in bars:
        k=int(b['t'].timestamp())//sec*sec
        if k!=curk:
            cur={'t':datetime.fromtimestamp(k),'o':b['o'],'h':b['h'],'l':b['l'],'c':b['c']}; out.append(cur); curk=k
        else:
            cur['h']=max(cur['h'],b['h']); cur['l']=min(cur['l'],b['l']); cur['c']=b['c']
    return out

def tf_score(bars):
    if len(bars)<25: return 0.0
    closes=[b['c'] for b in bars]
    e9=ema(closes[-30:],9); e21=ema(closes[-40:],21); rr=rsi(closes,14)
    mom=closes[-1]-closes[max(0,len(closes)-4)]
    s=0.0
    s += 1 if e9>e21 else -1
    s += .6 if closes[-1]>e9 else -.6
    s += .5 if mom>0 else -.5
    s += .5 if rr>52 else (-.5 if rr<48 else 0)
    if rr>75: s-=.35
    if rr<25: s+=.35
    return clamp(s/2.6,-1,1)

def historical_reach(bars,pips,horizon=30):
    d=pips*.01
    if not d or len(bars)<80: return (.5,.5,0)
    L=S=N=0; start=max(0,len(bars)-360)
    for i in range(start,len(bars)-horizon,2):
        base=bars[i]['c']; lo=sh=False
        for j in range(i+1,i+horizon+1):
            if not lo and bars[j]['h']>=base+d: lo=True
            if not sh and bars[j]['l']<=base-d: sh=True
            if lo and sh: break
        L+=int(lo); S+=int(sh); N+=1
    return ((L/N if N else .5),(S/N if N else .5),N)

def analyze(bars,pips):
    b1=bars; b5=aggregate(bars,5); b15=aggregate(bars,15); b60=aggregate(bars,60)
    scores=[tf_score(b1),tf_score(b5),tf_score(b15),tf_score(b60)]
    weights=[.18,.24,.32,.26]
    direction=sum(v*w for v,w in zip(scores,weights))
    hl,hs,_=historical_reach(b1,pips,30)
    a=atr(b1,14)/.01
    reach=clamp((a*math.sqrt(30/14))/pips if a>0 else 1,.55,1.45)
    long=50 + direction*22 + (hl-.5)*22 + (reach-1)*10
    short=50 - direction*22 + (hs-.5)*22 + (reach-1)*10
    return round(clamp(long,15,85)),round(clamp(short,15,85)),scores

def load():
    req=urllib.request.Request(DATA_URL,headers={'User-Agent':'fx-backtest'})
    with urllib.request.urlopen(req,timeout=30) as r: text=r.read().decode('utf-8-sig')
    bars=[]
    for row in csv.DictReader(io.StringIO(text)):
        try:
            bars.append({'t':datetime.strptime(row['time'],'%Y-%m-%d %H:%M:%S'),'o':float(row['open']),'h':float(row['high']),'l':float(row['low']),'c':float(row['close'])})
        except Exception: pass
    return bars

def bucket(p):
    if p<50: return '<50'
    if p<60: return '50-59'
    if p<70: return '60-69'
    if p<80: return '70-79'
    return '80-85'

def main():
    bars=load(); rows=[]
    # Walk-forward only: prediction at i uses data through i, then evaluates unseen future bars.
    for i in range(400,len(bars)-HORIZON):
        hist=bars[max(0,i-MAX_HISTORY+1):i+1]
        lp,sp,scores=analyze(hist,TARGET_PIPS)
        base=bars[i]['c']; d=TARGET_PIPS*.01
        future=bars[i+1:i+HORIZON+1]
        lhit=any(x['h']>=base+d for x in future)
        shit=any(x['l']<=base-d for x in future)
        strict=[x for x in future if (x['t']-bars[i]['t']).total_seconds()<=1800]
        lstrict=any(x['h']>=base+d for x in strict)
        sstrict=any(x['l']<=base-d for x in strict)
        rows.append((lp,sp,lhit,shit,lstrict,sstrict,scores))

    def cal(side):
        out={}
        pi=0 if side=='long' else 1; hi=2 if side=='long' else 3; si=4 if side=='long' else 5
        for name in ['<50','50-59','60-69','70-79','80-85']:
            z=[r for r in rows if bucket(r[pi])==name]
            if z:
                out[name]={'n':len(z),'avg_pred':round(sum(r[pi] for r in z)/len(z),1),'actual_30bars':round(100*sum(r[hi] for r in z)/len(z),1),'actual_strict30m':round(100*sum(r[si] for r in z)/len(z),1)}
        return out

    signals=[]
    for r in rows:
        lp,sp=r[0],r[1]
        side=None
        if lp>=62 and lp-sp>=8: side='long'
        elif sp>=62 and sp-lp>=8: side='short'
        elif lp>=56 and lp>sp: side='long'
        elif sp>=56 and sp>lp: side='short'
        if side:
            hit=r[2] if side=='long' else r[3]; strict=r[4] if side=='long' else r[5]
            signals.append((side,hit,strict,max(lp,sp),lp,sp))

    summary={
      'source':DATA_URL,'bars':len(bars),'from':bars[0]['t'].isoformat(),'to':bars[-1]['t'].isoformat(),
      'target_pips':round(TARGET_PIPS,3),'test_points':len(rows),
      'long_calibration':cal('long'),'short_calibration':cal('short'),
      'signal_count':len(signals),
      'signal_target_hit_30bars_pct':round(100*sum(x[1] for x in signals)/len(signals),1) if signals else None,
      'signal_target_hit_strict30m_pct':round(100*sum(x[2] for x in signals)/len(signals),1) if signals else None,
      'long_signal_count':sum(x[0]=='long' for x in signals),'short_signal_count':sum(x[0]=='short' for x in signals),
      'note':'Hit means target reached in indicated direction; no stop-loss or opposite-side-first rule. Production-like rolling history max 1440 bars.'
    }
    print('BACKTEST_RESULT_JSON')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
