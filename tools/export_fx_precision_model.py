#!/usr/bin/env python3
import json, os
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
import backtest_fx_ml as bt
import backtest_fx_precision as px

REACH_THRESHOLD=0.50
DIR_THRESHOLD=0.60


def log_params(pipe):
    sc=pipe.named_steps['standardscaler']; lr=pipe.named_steps['logisticregression']
    return {'mean':[float(x) for x in sc.mean_],'scale':[float(x) for x in sc.scale_],
            'coef':[float(x) for x in lr.coef_[0]],'intercept':float(lr.intercept_[0])}


def hgb_params(model):
    trees=[]
    for iteration in model._predictors:
        p=iteration[0]; nodes=[]
        for n in p.nodes:
            nodes.append({'v':float(n['value']),'f':int(n['feature_idx']),'t':float(n['num_threshold']),
                          'l':int(n['left']),'r':int(n['right']),'leaf':bool(n['is_leaf']),
                          'ml':bool(n['missing_go_to_left'])})
        trees.append(nodes)
    return {'baseline':float(model._baseline_prediction.ravel()[0]),'trees':trees}


def predict_hgb(params,x):
    raw=params['baseline']
    for nodes in params['trees']:
        i=0
        while not nodes[i]['leaf']:
            n=nodes[i]; v=x[n['f']]
            i=(n['l'] if n['ml'] else n['r']) if not np.isfinite(v) else (n['l'] if v<=n['t'] else n['r'])
        raw+=nodes[i]['v']
    return 1/(1+np.exp(-raw))


def rows_for_browser(rows):
    return [{'date':d.isoformat(),'value':float(v)} for d,v in rows]


def main():
    _,rows=bt.build(); d2=px.load_yield('DGS2.csv'); d10=px.load_yield('DGS10.csv')
    for r in rows: r['xp']=r['x']+px.macro_extra(r['t'],d2,d10)
    train=[r for r in rows if r['t']<bt.TUNE]
    hold=[r for r in rows if r['t']>=bt.HOLD]
    Xr,yr=px.arr(train,'reach'); Xd,yd=px.arr(train,'dir')
    reach=make_pipeline(StandardScaler(),LogisticRegression(C=.35,max_iter=2500,class_weight='balanced')).fit(Xr,yr)
    direction=HistGradientBoostingClassifier(max_iter=220,learning_rate=.04,max_depth=3,min_samples_leaf=35,
                                             l2_regularization=4,random_state=17).fit(Xd,yd)
    validation=px.eval_model(reach,direction,hold,REACH_THRESHOLD,DIR_THRESHOLD,0,None)
    hp=hgb_params(direction)
    sample=Xd[:min(250,len(Xd))]
    err=float(np.max(np.abs(direction.predict_proba(sample)[:,1]-np.array([predict_hgb(hp,x) for x in sample])))) if len(sample) else 0
    result={
      'version':3,'created_for':'asset-goal-app FX precision analysis','target_pips_reference':bt.TARGET,
      'feature_count':47,'thresholds':{'reach':REACH_THRESHOLD,'direction':DIR_THRESHOLD},
      'reach':log_params(reach),'direction':hp,'dgs2':rows_for_browser(d2[-40:]),
      'validation':validation,'validation_period':'2026-07-01 through 2026-08-14 retrospective holdout',
      'tree_export_max_probability_error':err,
      'training_note':'47-feature precision model: prior 42 features plus lagged DGS2 level/change and 10Y-2Y curve. Apr-May fit; thresholds fixed at 0.50/0.60.'
    }
    with open('fx-model.json','w',encoding='utf-8') as f: json.dump(result,f,separators=(',',':'))
    print('PRECISION_BROWSER_MODEL_EXPORT')
    print(json.dumps({'validation':validation,'tree_export_max_probability_error':err,'model_bytes':os.path.getsize('fx-model.json')},indent=2))

if __name__=='__main__': main()
