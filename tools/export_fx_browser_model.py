#!/usr/bin/env python3
import json
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
import backtest_fx_ml as bt

REACH_THRESHOLD=0.55
DIR_THRESHOLD=0.60

def log_params(pipe):
    sc=pipe.named_steps['standardscaler']; lr=pipe.named_steps['logisticregression']
    return {'mean':[float(x) for x in sc.mean_],'scale':[float(x) for x in sc.scale_],'coef':[float(x) for x in lr.coef_[0]],'intercept':float(lr.intercept_[0])}

def hgb_params(model):
    trees=[]
    for iteration in model._predictors:
        p=iteration[0]; nodes=[]
        for n in p.nodes:
            nodes.append({'v':float(n['value']),'f':int(n['feature_idx']),'t':float(n['num_threshold']),'l':int(n['left']),'r':int(n['right']),'leaf':bool(n['is_leaf']),'ml':bool(n['missing_go_to_left'])})
        trees.append(nodes)
    return {'baseline':float(model._baseline_prediction.ravel()[0]),'trees':trees}

def predict_exported_hgb(params,x):
    raw=params['baseline']
    for nodes in params['trees']:
        idx=0
        while not nodes[idx]['leaf']:
            n=nodes[idx]; val=x[n['f']]
            idx=(n['l'] if n['ml'] else n['r']) if not np.isfinite(val) else (n['l'] if val<=n['t'] else n['r'])
        raw+=nodes[idx]['v']
    return 1/(1+np.exp(-raw))

def metric(reach,direction,rows):
    X=np.array([r['x'] for r in rows]);rp=reach.predict_proba(X)[:,1];dp=direction.predict_proba(X)[:,1]
    take=(rp>=REACH_THRESHOLD)&((dp>=DIR_THRESHOLD)|(dp<=1-DIR_THRESHOLD));pred=np.where(dp>=.5,'long','short');idx=np.where(take)[0]
    strict=hit=dec=decwin=L=S=0
    for i in idx:
        r=rows[i];sd=pred[i];L+=sd=='long';S+=sd=='short';strict+=r['first']==sd;hit+=r['lh'] if sd=='long' else r['sh']
        if r['first'] in ('long','short'):dec+=1;decwin+=r['first']==sd
    n=len(idx)
    return {'signals':n,'coverage_all_pct':100*n/len(rows) if rows else 0,'strict_first_touch_success_pct':100*strict/n if n else 0,'target_hit_30m_pct':100*hit/n if n else 0,'decisive_accuracy_pct':100*decwin/dec if dec else 0,'long':L,'short':S}

def main():
    m1,rows=bt.build()
    # Keep the exact Apr-May training window used by the model that was selected on June.
    # Jul-Aug remains completely untouched holdout.
    train=[r for r in rows if r['t']<bt.TUNE]
    holdout=[r for r in rows if r['t']>=bt.HOLD]
    Xr,yr=bt.arr(train,'reach');Xd,yd=bt.arr(train,'dir')
    reach=make_pipeline(StandardScaler(),LogisticRegression(C=.35,max_iter=2000,class_weight='balanced')).fit(Xr,yr)
    direction=HistGradientBoostingClassifier(max_iter=180,learning_rate=.045,max_depth=3,min_samples_leaf=35,l2_regularization=3,random_state=7).fit(Xd,yd)
    hp=hgb_params(direction)
    sample=Xd[:min(200,len(Xd))];skl=direction.predict_proba(sample)[:,1];exp=np.array([predict_exported_hgb(hp,x) for x in sample]);max_err=float(np.max(np.abs(skl-exp))) if len(sample) else 0
    result={'version':2,'created_for':'asset-goal-app FX analysis','target_pips_reference':bt.TARGET,'feature_count':len(train[0]['x']),'thresholds':{'reach':REACH_THRESHOLD,'direction':DIR_THRESHOLD},'reach':log_params(reach),'direction':hp,'validation':metric(reach,direction,holdout),'validation_period':'2026-07-01 through 2026-08-14 (untouched holdout)','tree_export_max_probability_error':max_err,'training_note':'Exact Apr-May model selected using June; Jul-Aug untouched holdout.'}
    with open('fx-model.json','w',encoding='utf-8') as f:json.dump(result,f,separators=(',',':'))
    print('BROWSER_MODEL_EXPORT_RESULT');print(json.dumps({'validation':result['validation'],'tree_export_max_probability_error':max_err,'model_bytes':__import__('os').path.getsize('fx-model.json')},indent=2))
if __name__=='__main__':main()
