#!/usr/bin/env python3
import csv,json,os
from datetime import datetime,timezone

def load_yields(path='DGS10.csv'):
    rows=[]
    with open(path,encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            ds=r.get('observation_date') or r.get('DATE') or r.get('date')
            v=r.get('DGS10')
            try:
                if ds and v and v!='.': rows.append({'date':ds,'value':float(v)})
            except: pass
    return rows[-20:]

def iso(y,m,d,h,minute=0):
    return datetime(y,m,d,h,minute,tzinfo=timezone.utc).isoformat().replace('+00:00','Z')

def main():
    events={
      'cpi':[
        iso(2026,4,10,12,30),iso(2026,5,12,12,30),iso(2026,6,10,12,30),iso(2026,7,14,12,30),iso(2026,8,12,12,30),
        iso(2026,9,11,12,30),iso(2026,10,14,12,30),iso(2026,11,10,13,30),iso(2026,12,10,13,30)],
      'nfp':[
        iso(2026,4,3,12,30),iso(2026,5,8,12,30),iso(2026,6,5,12,30),iso(2026,7,2,12,30),iso(2026,8,7,12,30),
        iso(2026,9,4,12,30),iso(2026,10,2,12,30),iso(2026,11,6,13,30),iso(2026,12,4,13,30)],
      'fomc':[
        iso(2026,4,29,18),iso(2026,6,17,18),iso(2026,7,29,18),iso(2026,9,16,18),iso(2026,10,28,18),iso(2026,12,9,19)]
    }
    out={
      'version':1,
      'updatedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
      'dgs10':load_yields(),
      'events':events,
      'policy':{'usMid':3.625,'jp':1.0,'diff':2.625,'asOf':'2026-08-16'},
      'notes':'DGS10 from FRED. Event timestamps are scheduled release/statement times in UTC; no outcome values are included.'
    }
    with open('macro-context.json','w',encoding='utf-8') as f:json.dump(out,f,separators=(',',':'))
    print(json.dumps({'latestYield':out['dgs10'][-1] if out['dgs10'] else None,'eventCounts':{k:len(v) for k,v in events.items()}},indent=2))

if __name__=='__main__':main()
