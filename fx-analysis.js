(() => {
  if(window.__fxAnalysisLoaded) return;
  window.__fxAnalysisLoaded=true;

  let browserModel=null,macroContext=null,slowCache=null,slowCacheAt=0,lastDecisionKey='';
  const TARGET_REF=5.1911590909;

  const style=document.createElement('style');
  style.textContent=`
    .fxa-wrap{margin:10px 12px 12px;background:linear-gradient(180deg,#111c37,#0d1730);border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:14px;box-shadow:0 12px 30px rgba(0,0,0,.18)}
    .fxa-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.fxa-title{font-size:16px;font-weight:900;color:#fff}.fxa-status{font-size:11px;color:#94a3b8;text-align:right}
    .fxa-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.fxa-card{background:#0a1328;border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:11px}.fxa-label{font-size:11px;color:#94a3b8}.fxa-value{font-size:22px;font-weight:900;color:#fff;margin-top:3px;letter-spacing:-.3px}.fxa-value.good{color:#34d399}.fxa-value.bad{color:#fb7185}.fxa-value.neutral{color:#fbbf24}
    .fxa-main{margin-top:9px;background:#091225;border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:12px}.fxa-signal{font-size:19px;font-weight:900;color:#fff}.fxa-reasons{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}.fxa-chip{font-size:11px;padding:5px 8px;border-radius:999px;background:#182541;border:1px solid #2b3b5f;color:#cbd5e1}.fxa-chip.up{color:#6ee7b7;border-color:rgba(52,211,153,.35)}.fxa-chip.down{color:#fda4af;border-color:rgba(251,113,133,.35)}.fxa-chip.warn{color:#fde68a;border-color:rgba(251,191,36,.35)}
    .fxa-bars{margin-top:10px;display:grid;gap:7px}.fxa-bar-row{display:grid;grid-template-columns:48px 1fr 42px;gap:8px;align-items:center;font-size:11px;color:#94a3b8}.fxa-track{height:7px;border-radius:999px;background:#1e293b;overflow:hidden}.fxa-fill{height:100%;border-radius:999px;background:#3b82f6}.fxa-note{margin-top:10px;font-size:10px;line-height:1.5;color:#64748b}
    @media(max-width:560px){.fxa-value{font-size:19px}.fxa-grid{gap:7px}.fxa-card{padding:10px}}
  `;
  document.head.appendChild(style);

  function waitForPage(){
    const page=document.getElementById('fxSbiPage');
    if(!page){setTimeout(waitForPage,250);return;}
    const toolbar=page.querySelector('.sbi-toolbar');
    if(!toolbar||document.getElementById('fxAnalysisPanel'))return;
    const panel=document.createElement('div');panel.id='fxAnalysisPanel';panel.className='fxa-wrap';
    panel.innerHTML=`
      <div class="fxa-head"><div class="fxa-title">2段階マクロモデル分析</div><div class="fxa-status" id="fxaStatus">モデル読込中</div></div>
      <div class="fxa-grid">
        <div class="fxa-card"><div class="fxa-label">判定時のUSD/JPY</div><div class="fxa-value" id="fxaPrice">--</div></div>
        <div class="fxa-card"><div class="fxa-label">本日の目標相当</div><div class="fxa-value" id="fxaTarget">-- pips</div></div>
        <div class="fxa-card"><div class="fxa-label">30分以内の到達しやすさ</div><div class="fxa-value neutral" id="fxaReach">--%</div></div>
        <div class="fxa-card"><div class="fxa-label">方向モデルの確信度</div><div class="fxa-value" id="fxaDirConf">--%</div></div>
        <div class="fxa-card"><div class="fxa-label">ロング方向</div><div class="fxa-value good" id="fxaLong">--%</div></div>
        <div class="fxa-card"><div class="fxa-label">ショート方向</div><div class="fxa-value bad" id="fxaShort">--%</div></div>
      </div>
      <div class="fxa-main"><div class="fxa-label">現在の判定（30分以内）</div><div class="fxa-signal" id="fxaSignal">分析待ち</div><div class="fxa-reasons" id="fxaReasons"></div><div class="fxa-bars" id="fxaBars"></div></div>
      <div class="fxa-note">判定はバックテストと合わせて15分ごとの確定ポイントで更新します。第1段階で目標約5.19pipsまで動きやすいか、第2段階でロング/ショート方向を判定。価格の複数時間足・EMA・RSI・ATR・モメンタム・過去到達率・時間帯・日米金利差に加え、米10年債金利とCPI・雇用統計・FOMCの発表時間帯を使用します。2026年7〜8月の未使用検証では、シグナル時に選択方向へ目標が30分以内に到達した割合70.74%。将来の成績を保証するものではありません。</div>`;
    toolbar.insertAdjacentElement('beforebegin',panel);start();
  }

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const sigmoid=x=>1/(1+Math.exp(-clamp(x,-40,40)));
  function ema(v,n){if(!v.length)return NaN;const a=2/(n+1);let e=v[0];for(let i=1;i<v.length;i++)e=v[i]*a+e*(1-a);return e;}
  function rsi(v,n=14){if(v.length<n+1)return 50;let g=0,l=0;for(let i=v.length-n;i<v.length;i++){const d=v[i]-v[i-1];g+=Math.max(d,0);l+=Math.max(-d,0);}return l===0?100:100-100/(1+(g/n)/(l/n));}
  function atr(bs,n=14){if(bs.length<n+1)return 0;let s=0;for(let i=bs.length-n;i<bs.length;i++){const b=bs[i],p=bs[i-1].c;s+=Math.max(b.h-b.l,Math.abs(b.h-p),Math.abs(b.l-p));}return s/n;}
  function aggregate(bs,min){const ms=min*60000,m=new Map();for(const b of bs){const k=Math.floor(b.t/ms)*ms;let x=m.get(k);if(!x){x={t:k,o:b.o,h:b.h,l:b.l,c:b.c};m.set(k,x);}else{x.h=Math.max(x.h,b.h);x.l=Math.min(x.l,b.l);x.c=b.c;}}return [...m.values()].sort((a,b)=>a.t-b.t);}
  function targetPips(){try{const s=state.settings,rec=state.records[state.records.length-1],asset=Number(rec?rec.asset:s.startAsset);const units=Math.floor((asset/Number(s.baseAsset)*Number(s.baseUnits))/1000)*1000;if(!units)return 0;return asset*(Number(s.dailyRate)/100)/(units*.01);}catch(e){return 0;}}
  function tfScore(bs){if(!bs||bs.length<25)return 0;const c=bs.map(x=>x.c),e9=ema(c.slice(-40),9),e21=ema(c.slice(-60),21),rr=rsi(c),mom=c.at(-1)-c.at(-4);let s=(e9>e21?1:-1)+(c.at(-1)>e9?.6:-.6)+(mom>0?.5:-.5)+(rr>52?.5:rr<48?-.5:0);if(rr>75)s-=.35;if(rr<25)s+=.35;return clamp(s/2.6,-1,1);}
  function historicalReach(bs){if(bs.length<80)return{long:.5,short:.5,samples:0};const d=TARGET_REF*.01;let L=0,S=0,N=0;for(let i=Math.max(0,bs.length-360);i<bs.length-30;i+=2){const base=bs[i].c;let u=false,dn=false;for(let j=i+1;j<=i+30;j++){u ||= bs[j].h>=base+d;dn ||= bs[j].l<=base-d;}L+=u?1:0;S+=dn?1:0;N++;}return{long:N?L/N:.5,short:N?S/N:.5,samples:N};}
  function pos(c,n){const z=c.slice(-n),lo=Math.min(...z),hi=Math.max(...z),last=c.at(-1);return hi>lo?(last-lo)/(hi-lo):.5;}
  function utcDate(ms){return new Date(ms).toISOString().slice(0,10);}

  function treasuryFeatures(ctx,t){
    const rows=(ctx?.dgs10||[]).filter(x=>x.date<utcDate(t));
    if(!rows.length)return[0,0,0,0];
    const y=Number(rows.at(-1).value),y1=Number((rows.at(-2)||rows.at(-1)).value),y5=Number((rows.at(-6)||rows[0]).value);
    return[y/5,(y-y1)*10,(y-y5)*2,((y-y1)-(y1-y5)/5)*5];
  }
  function eventFeatures(ctx,t){
    const one=(arr,pre,post)=>{const ev=(arr||[]).map(x=>Date.parse(x)).filter(Number.isFinite);if(!ev.length)return[0,0];const diffs=ev.map(x=>(x-t)/60000);const near=diffs.reduce((a,b)=>Math.abs(a)<Math.abs(b)?a:b);const active=near>=-post&&near<=pre?1:0;return[active,active?clamp(near/Math.max(pre,post),-1,1):0];};
    const c=one(ctx?.events?.cpi,120,120),n=one(ctx?.events?.nfp,120,120),f=one(ctx?.events?.fomc,180,180);const all=[...(ctx?.events?.cpi||[]),...(ctx?.events?.nfp||[]),...(ctx?.events?.fomc||[])].map(Date.parse).filter(Number.isFinite);let near=999999;if(all.length)near=all.map(x=>(x-t)/60000).reduce((a,b)=>Math.abs(a)<Math.abs(b)?a:b);return[...c,...n,...f,Math.abs(near)<=60?1:0,Math.abs(near)<=180?1:0];
  }
  function macroLabel(ctx,t){
    const candidates=[];for(const [k,label] of [['cpi','CPI'],['nfp','雇用統計'],['fomc','FOMC']])for(const x of ctx?.events?.[k]||[]){const d=(Date.parse(x)-t)/60000;if(Math.abs(d)<=180)candidates.push({label,d});}
    if(!candidates.length)return null;const z=candidates.sort((a,b)=>Math.abs(a.d)-Math.abs(b.d))[0];return`${z.label} ${z.d>=0?'まで':'から'}${Math.round(Math.abs(z.d))}分`;
  }

  function features(series,ctx,cutoff){
    const trim=bs=>bs.filter(x=>x.t<=cutoff);
    const s={m1:trim(series.m1),m5:trim(series.m5),m15:trim(series.m15),h1:trim(series.h1),h4:trim(series.h4),d1:trim(series.d1)};
    const scores=[tfScore(s.m1),tfScore(s.m5),tfScore(s.m15),tfScore(s.h1),tfScore(s.h4),tfScore(s.d1)];
    const h=s.m1,c=h.map(x=>x.c),last=c.at(-1),hist=historicalReach(h),ap=atr(h)/.01,rr=rsi(c),scale=TARGET_REF*.01;
    const e9=ema(c.slice(-60),9),e21=ema(c.slice(-80),21),e50=ema(c.slice(-100),50),h20=h.slice(-20),h60=h.slice(-60),rng20=Math.max(...h20.map(x=>x.h))-Math.min(...h20.map(x=>x.l)),rng60=Math.max(...h60.map(x=>x.h))-Math.min(...h60.map(x=>x.l));
    const moms=[1,3,5,10,15,30,60].map(n=>c.length>n?(last-c[c.length-1-n])/scale:0),dt=new Date(cutoff),hour=dt.getUTCHours()+dt.getUTCMinutes()/60,ang=2*Math.PI*hour/24,dow=(dt.getUTCDay()+6)%7,dang=2*Math.PI*dow/5,rateDiff=Number(ctx?.policy?.diff??2.625);
    const base=[...scores,hist.long,hist.short,hist.long-hist.short,ap/TARGET_REF,(rr-50)/25,(last-e9)/scale,(e9-e21)/scale,(e21-e50)/scale,pos(c,20)-.5,pos(c,60)-.5,rng20/scale,rng60/scale,...moms,Math.sin(ang),Math.cos(ang),Math.sin(dang),Math.cos(dang),rateDiff/3];
    return{x:[...base,...treasuryFeatures(ctx,cutoff),...eventFeatures(ctx,cutoff)],scores,hist,ap,rr,price:last,rateDiff};
  }
  function logistic(m,x){let z=m.intercept;for(let i=0;i<x.length;i++)z+=((x[i]-m.mean[i])/(m.scale[i]||1))*m.coef[i];return sigmoid(z);}
  function hgb(m,x){let raw=m.baseline;for(const nodes of m.trees){let i=0;while(!nodes[i].leaf){const n=nodes[i],v=x[n.f];i=!Number.isFinite(v)?(n.ml?n.l:n.r):(v<=n.t?n.l:n.r);}raw+=nodes[i].v;}return sigmoid(raw);}

  async function loadInputs(){
    const [mr,cr]=await Promise.all([fetch('./fx-model.json?v=3',{cache:'no-store'}),fetch('./macro-context.json?v=1',{cache:'no-store'})]);
    if(!mr.ok||!cr.ok)throw new Error('model/context');const m=await mr.json(),c=await cr.json();if(!m?.reach||!m?.direction||m.feature_count!==42)throw new Error('bad model '+m?.feature_count);browserModel=m;macroContext=c;return[m,c];
  }
  function analyze(series,m,ctx,cutoff){
    const f=features(series,ctx,cutoff);if(f.x.length!==m.feature_count)throw new Error('feature mismatch');const reach=logistic(m.reach,f.x),pLong=hgb(m.direction,f.x),dirConf=Math.max(pLong,1-pLong),side=pLong>=.5?'long':'short',passReach=reach>=m.thresholds.reach,passDir=dirConf>=m.thresholds.direction;
    let signal='⚪ 様子見';if(passReach&&passDir)signal=side==='long'?'🟢 ロング優勢':'🔴 ショート優勢';const labels=['1分','5分','15分','1時間','4時間','日足'],reasons=[];
    reasons.push([`到達 ${(reach*100).toFixed(0)}%`,passReach?'up':'warn']);reasons.push([`方向確信 ${(dirConf*100).toFixed(0)}%`,passDir?(side==='long'?'up':'down'):'warn']);if(!passReach)reasons.push(['値幅条件が弱い','warn']);if(passReach&&!passDir)reasons.push(['方向差が弱い','warn']);
    [2,3,4,5].forEach(i=>{if(f.scores[i]>.25)reasons.push([`${labels[i]} 上向き`,'up']);else if(f.scores[i]<-.25)reasons.push([`${labels[i]} 下向き`,'down']);});reasons.push([`RSI ${f.rr.toFixed(0)}`,f.rr>=50?'up':'down']);reasons.push([`米10年 ${Number((ctx.dgs10||[]).at(-1)?.value||0).toFixed(2)}%`,'']);reasons.push([`日米金利差 +${f.rateDiff.toFixed(2)}%`,'up']);const ml=macroLabel(ctx,cutoff);if(ml)reasons.push([ml,'warn']);reasons.push([`検証 ${m.validation.target_hit_30m_pct.toFixed(2)}%`,'']);
    return{pips:Math.max(.1,targetPips()),reach,pLong,pShort:1-pLong,dirConf,signal,reasons,scores:f.scores,labels,price:f.price,cutoff};
  }
  function render(a){const $=id=>document.getElementById(id);$('fxaPrice').textContent=a.price.toFixed(3);$('fxaTarget').textContent=a.pips.toFixed(1)+' pips';$('fxaReach').textContent=Math.round(a.reach*100)+'%';$('fxaDirConf').textContent=Math.round(a.dirConf*100)+'%';$('fxaLong').textContent=Math.round(a.pLong*100)+'%';$('fxaShort').textContent=Math.round(a.pShort*100)+'%';$('fxaSignal').textContent=a.signal;$('fxaReasons').innerHTML=a.reasons.map(x=>`<span class="fxa-chip ${x[1]}">${x[0]}</span>`).join('');$('fxaBars').innerHTML=a.scores.map((v,i)=>`<div class="fxa-bar-row"><span>${a.labels[i]}</span><div class="fxa-track"><div class="fxa-fill" style="width:${Math.round((v+1)*50)}%"></div></div><span>${v>0?'+':''}${Math.round(v*100)}</span></div>`).join('');$('fxaStatus').textContent='判定 '+new Date(a.cutoff).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})+' / 15分更新';}
  function error(msg){const e=document.getElementById('fxaStatus');if(e)e.textContent=msg;}

  async function fetchYahoo(interval,range){
    const hosts=['query1.finance.yahoo.com','query2.finance.yahoo.com'];let last;
    for(const host of hosts){try{const u=`https://${host}/v8/finance/chart/JPY=X?interval=${interval}&range=${range}&includePrePost=true&events=div%2Csplits`,r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(String(r.status));const j=await r.json(),z=j?.chart?.result?.[0],q=z?.indicators?.quote?.[0],ts=z?.timestamp||[],bars=[];for(let i=0;i<ts.length;i++){const o=Number(q.open?.[i]),h=Number(q.high?.[i]),l=Number(q.low?.[i]),c=Number(q.close?.[i]);if([o,h,l,c].every(Number.isFinite))bars.push({t:ts[i]*1000,o,h,l,c});}if(bars.length<25)throw new Error('few bars');return bars;}catch(e){last=e;}}
    throw last||new Error('fetch failed');
  }
  async function fetchSeries(){
    const m1=await fetchYahoo('1m','1d'),now=Date.now();
    if(!slowCache||now-slowCacheAt>300000){const [m5,m15,h1,d1]=await Promise.all([fetchYahoo('5m','5d'),fetchYahoo('15m','1mo'),fetchYahoo('60m','3mo'),fetchYahoo('1d','1y')]);slowCache={m5,m15,h1,d1,h4:aggregate(h1,240)};slowCacheAt=now;}
    return{m1,...slowCache};
  }
  function decisionCutoff(m1){const eligible=m1.filter(b=>Math.floor(b.t/60000)%15===0);return (eligible.at(-1)||m1.at(-1)).t;}

  let busy=false;
  async function tick(){if(busy)return;busy=true;try{if(!browserModel||!macroContext)await loadInputs();const series=await fetchSeries(),cutoff=decisionCutoff(series.m1),key=String(cutoff);if(key!==lastDecisionKey){render(analyze(series,browserModel,macroContext,cutoff));lastDecisionKey=key;}else{const e=document.getElementById('fxaStatus');if(e)e.textContent='判定 '+new Date(cutoff).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})+' / 次回15分更新';}}catch(e){console.warn('fx analysis',e);error('分析データ取得待ち');}finally{busy=false;}}
  function start(){tick();setInterval(tick,15000);}
  waitForPage();
})();
