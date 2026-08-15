#!/usr/bin/env python3
import csv, io, json, math, urllib.request
from datetime import datetime

DATA_URL = 'https://raw.githubusercontent.com/simonnmarket/OMEGA_OS_Kernel/c01a174f47f6eecf946582a161e9150fbaf3e4c7/OHLCV_DATA/USDJPY/USDJPY_M1.csv'
TARGET_PIPS = 5.1911590909
MAX_HISTORY = 1440
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
    out=[]; cur=None; curk=None; sec=mins*60
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
    s=(1 if e9>e21 else -1)+(.6 if closes[-1]>e9 else -.6)+(.5 if mom>0 else -.5)
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
    groups=[bars,aggregate(bars,5),aggregate(bars,15),aggregate(bars,60)]
    scores=[tf_score(x) for x in groups]
    direction=sum(v*w for v,w in zip(scores,[.18,.24,.32,.26]))
    hl,hs,_=historical_reach(bars,pips,30)
    a=atr(bars,14)/.01
    reach=clamp((a*math.sqrt(30/14))/pips if a>0 else 1,.55,1.45)
    long=50+direction*22+(hl-.5)*22+(reach-1)*10
    short=50-direction*22+(hs-.5)*22+(reach-1)*10
    return round(clamp(long,15,85)),round(clamp(short,15,85)),scores

def load():
    req=urllib.request.Request(DATA_URL,headers={'User-Agent':'fx-backtest'})
    with urllib.request.urlopen(req,timeout=30) as r: text=r.read().decode('utf-8-sig')
    bars=[]
    for row in csv.DictReader(io.StringIO(text)):
        try: bars.append({'t':datetime.strptime(row['time'],'%Y-%m-%d %H:%M:%S'),'o':float(row['open']),'h':float(row['high']),'l':float(row['low']),'c':float(row['close'])})
        except Exception: pass
    return bars

def bucket(p):
    if p<50: return '<50'
    if p<60: return '50-59'
    if p<70: return '60-69'
    if p<80: return '70-79'
    return '80-85'

def first_touch(future,base,d):
    for x in future:
        up=x['h']>=base+d; down=x['l']<=base-d
        if up and down: return 'tie'
        if up: return 'long'
        if down: return 'short'
    return 'none'

def main():
    bars=load(); rows=[]
    for i in range(400,len(bars)-HORIZON):
        hist=bars[max(0,i-MAX_HISTORY+1):i+1]
        lp,sp,scores=analyze(hist,TARGET_PIPS)
        base=bars[i]['c']; d=TARGET_PIPS*.01; future=bars[i+1:i+HORIZON+1]
        lhit=any(x['h']>=base+d for x in future); shit=any(x['l']<=base-d for x in future)
        strict=[x for x in future if (x['t']-bars[i]['t']).total_seconds()<=1800]
        lstrict=any(x['h']>=base+d for x in strict); sstrict=any(x['l']<=base-d for x in strict)
        rows.append({'lp':lp,'sp':sp,'lhit':lhit,'shit':shit,'lstrict':lstrict,'sstrict':sstrict,'first':first_touch(strict,base,d),'scores':scores})

    def cal(side):
        out={}; pk='lp' if side=='long' else 'sp'; hk='lhit' if side=='long' else 'shit'; sk='lstrict' if side=='long' else 'sstrict'
        for name in ['<50','50-59','60-69','70-79','80-85']:
            z=[r for r in rows if bucket(r[pk])==name]
            if z: out[name]={'n':len(z),'avg_pred':round(sum(r[pk] for r in z)/len(z),1),'actual_30bars':round(100*sum(r[hk] for r in z)/len(z),1),'actual_strict30m':round(100*sum(r[sk] for r in z)/len(z),1)}
        return out

    signals=[]
    for r in rows:
        lp,sp=r['lp'],r['sp']; side=None
        if lp>=62 and lp-sp>=8: side='long'
        elif sp>=62 and sp-lp>=8: side='short'
        elif lp>=56 and lp>sp: side='long'
        elif sp>=56 and sp>lp: side='short'
        if side:
            hit=r['lhit'] if side=='long' else r['shit']; opp=r['shit'] if side=='long' else r['lhit']
            firstwin=r['first']==side; firstloss=r['first'] in ('long','short') and r['first']!=side
            signals.append({'side':side,'hit':hit,'opp':opp,'firstwin':firstwin,'firstloss':firstloss,'first':r['first'],'p':max(lp,sp)})

    decisive=[s for s in signals if s['first'] in ('long','short')]
    summary={
      'source':DATA_URL,'bars':len(bars),'from':bars[0]['t'].isoformat(),'to':bars[-1]['t'].isoformat(),'target_pips':round(TARGET_PIPS,3),'test_points':len(rows),
      'baseline_long_hit_pct':round(100*sum(r['lhit'] for r in rows)/len(rows),1),'baseline_short_hit_pct':round(100*sum(r['shit'] for r in rows)/len(rows),1),
      'long_calibration':cal('long'),'short_calibration':cal('short'),'signal_count':len(signals),
      'signal_target_hit_pct':round(100*sum(s['hit'] for s in signals)/len(signals),1) if signals else None,
      'signal_opposite_target_hit_pct':round(100*sum(s['opp'] for s in signals)/len(signals),1) if signals else None,
      'first_touch_decisive_count':len(decisive),'signal_first_touch_win_pct':round(100*sum(s['firstwin'] for s in decisive)/len(decisive),1) if decisive else None,
      'first_touch_tie_count':sum(s['first']=='tie' for s in signals),'first_touch_none_count':sum(s['first']=='none' for s in signals),
      'long_signal_count':sum(s['side']=='long' for s in signals),'short_signal_count':sum(s['side']=='short' for s in signals),
      'signal_strength':{}
    }
    for name,lo,hi in [('56-61',56,62),('62-69',62,70),('70+',70,86)]:
        z=[s for s in signals if lo<=s['p']<hi]; dz=[s for s in z if s['first'] in ('long','short')]
        if z: summary['signal_strength'][name]={'n':len(z),'target_hit_pct':round(100*sum(s['hit'] for s in z)/len(z),1),'first_touch_win_pct':round(100*sum(s['firstwin'] for s in dz)/len(dz),1) if dz else None}
    summary['note']='Preliminary dataset. Hit has no stop-loss. First-touch compares +target vs -target inside strict 30 clock minutes; same-bar double touches are ties.'
    print('BACKTEST_RESULT_JSON'); print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
