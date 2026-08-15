(() => {
  if(window.__fxAnalysisLoaded) return;
  window.__fxAnalysisLoaded=true;

  const POLICY={usLow:3.50,usHigh:3.75,jp:1.00,asOf:'2026-08-16'};
  const rateDiff=((POLICY.usLow+POLICY.usHigh)/2)-POLICY.jp;
  let browserModel=null;

  const style=document.createElement('style');
  style.textContent=`
    .fxa-wrap{margin:10px 12px 12px;background:linear-gradient(180deg,#111c37,#0d1730);border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:14px;box-shadow:0 12px 30px rgba(0,0,0,.18)}
    .fxa-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.fxa-title{font-size:16px;font-weight:900;color:#fff}.fxa-status{font-size:11px;color:#94a3b8}
    .fxa-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.fxa-card{background:#0a1328;border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:11px}.fxa-label{font-size:11px;color:#94a3b8}.fxa-value{font-size:22px;font-weight:900;color:#fff;margin-top:3px;letter-spacing:-.3px}.fxa-value.good{color:#34d399}.fxa-value.bad{color:#fb7185}.fxa-value.neutral{color:#fbbf24}
    .fxa-main{margin-top:9px;background:#091225;border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:12px}.fxa-signal{font-size:18px;font-weight:900;color:#fff}.fxa-reasons{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}.fxa-chip{font-size:11px;padding:5px 8px;border-radius:999px;background:#182541;border:1px solid #2b3b5f;color:#cbd5e1}.fxa-chip.up{color:#6ee7b7;border-color:rgba(52,211,153,.35)}.fxa-chip.down{color:#fda4af;border-color:rgba(251,113,133,.35)}.fxa-chip.warn{color:#fde68a;border-color:rgba(251,191,36,.35)}
    .fxa-bars{margin-top:10px;display:grid;gap:7px}.fxa-bar-row{display:grid;grid-template-columns:48px 1fr 42px;gap:8px;align-items:center;font-size:11px;color:#94a3b8}.fxa-track{height:7px;border-radius:999px;background:#1e293b;overflow:hidden}.fxa-fill{height:100%;border-radius:999px;background:#3b82f6}.fxa-note{margin-top:10px;font-size:10px;line-height:1.5;color:#64748b}
    @media(max-width:560px){.fxa-value{font-size:19px}.fxa-grid{gap:7px}.fxa-card{padding:10px}}
  `;
  document.head.appendChild(style);

  function waitForPage(){
    const page=document.getElementById('fxSbiPage');
    if(!page){setTimeout(waitForPage,250);return;}
    const toolbar=page.querySelector('.sbi-toolbar');
    if(!toolbar || document.getElementById('fxAnalysisPanel')) return;
    const panel=document.createElement('div');
    panel.id='fxAnalysisPanel';panel.className='fxa-wrap';
    panel.innerHTML=`
      <div class="fxa-head"><div class="fxa-title">2段階モデル分析</div><div class="fxa-status" id="fxaStatus">モデル読込中</div></div>
      <div class="fxa-grid">
        <div class="fxa-card"><div class="fxa-label">現在値（参考）</div><div class="fxa-value" id="fxaPrice">--</div></div>
        <div class="fxa-card"><div class="fxa-label">本日の目標相当</div><div class="fxa-value" id="fxaTarget">-- pips</div></div>
        <div class="fxa-card"><div class="fxa-label">30分以内の到達しやすさ</div><div class="fxa-value neutral" id="fxaReach">--%</div></div>
        <div class="fxa-card"><div class="fxa-label">方向モデルの確信度</div><div class="fxa-value" id="fxaDirConf">--%</div></div>
        <div class="fxa-card"><div class="fxa-label">ロング方向</div><div class="fxa-value good" id="fxaLong">--%</div></div>
        <div class="fxa-card"><div class="fxa-label">ショート方向</div><div class="fxa-value bad" id="fxaShort">--%</div></div>
      </div>
      <div class="fxa-main"><div class="fxa-label">現在の判定（30分以内）</div><div class="fxa-signal" id="fxaSignal">分析待ち</div><div class="fxa-reasons" id="fxaReasons"></div><div class="fxa-bars" id="fxaBars"></div></div>
      <div class="fxa-note">第1段階で「目標pipsまで動きやすいか」、第2段階で「動くならロング/ショートのどちらが優勢か」を判定します。1分・5分・15分・1時間・4時間・日足、EMA、RSI、ATR、モメンタム、過去到達率、時間帯、日米金利差を使用。2026年7〜8月の未使用検証期間では、シグナル時に選択方向へ目標5.19pipsが30分以内に到達した割合は66.6%でした。実際の将来成績を保証するものではありません。</div>`;
    toolbar.insertAdjacentElement('beforebegin',panel);
    start();
  }

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const sigmoid=x=>1/(1+Math.exp(-clamp(x,-40,40)));
  function ema(vals,n){if(!vals.length)return NaN;const k=2/(n+1);let e=vals[0];for(let i=1;i<vals.length;i++)e=vals[i]*k+e*(1-k);return e;}
  function rsi(vals,n=14){if(vals.length<n+1)return 50;let g=0,l=0;for(let i=vals.length-n;i<vals.length;i++){const d=vals[i]-vals[i-1];if(d>0)g+=d;else l-=d;}if(l===0)return 100;const rs=(g/n)/(l/n);return 100-(100/(1+rs));}
  function atr(bars,n=14){if(bars.length<n+1)return 0;let s=0;for(let i=bars.length-n;i<bars.length;i++){const b=bars[i],p=bars[i-1].c;s+=Math.max(b.h-b.l,Math.abs(b.h-p),Math.abs(b.l-p));}return s/n;}
  function aggregate(bars,min){const ms=min*60000,m=new Map();bars.forEach(b=>{const k=Math.floor(b.t/ms)*ms;let x=m.get(k);if(!x){x={t:k,o:b.o,h:b.h,l:b.l,c:b.c};m.set(k,x);}else{x.h=Math.max(x.h,b.h);x.l=Math.min(x.l,b.l);x.c=b.c;}});return [...m.values()].sort((a,b)=>a.t-b.t);}
  function targetPips(){try{const s=state.settings;const rec=state.records[state.records.length-1];const asset=Number(rec?rec.asset:s.startAsset);const units=Math.floor((asset/Number(s.baseAsset)*Number(s.baseUnits))/1000)*1000;if(!units)return 0;return asset*(Number(s.dailyRate)/100)/(units*.01);}catch(e){return 0;}}
  function tfScore(bars){if(!bars||bars.length<25)return 0;const c=bars.map(b=>b.c),e9=ema(c.slice(-40),9),e21=ema(c.slice(-60),21),rr=rsi(c),mom=c.at(-1)-c.at(-4);let s=(e9>e21?1:-1)+(c.at(-1)>e9?.6:-.6)+(mom>0?.5:-.5)+(rr>52?.5:rr<48?-.5:0);if(rr>75)s-=.35;if(rr<25)s+=.35;return clamp(s/2.6,-1,1);}
  function historicalReach(bars,pips){if(bars.length<80)return{long:.5,short:.5,samples:0};const d=pips*.01;let L=0,S=0,N=0;for(let i=Math.max(0,bars.length-360);i<bars.length-30;i+=2){const base=bars[i].c;let u=false,dn=false;for(let j=i+1;j<=i+30;j++){u ||= bars[j].h>=base+d;dn ||= bars[j].l<=base-d;}L+=u?1:0;S+=dn?1:0;N++;}return{long:N?L/N:.5,short:N?S/N:.5,samples:N};}
  function position(closes,n){const z=closes.slice(-n),lo=Math.min(...z),hi=Math.max(...z),last=closes.at(-1);return hi>lo?(last-lo)/(hi-lo):.5;}

  function features(series,refPips){
    const scores=[tfScore(series.m1),tfScore(series.m5),tfScore(series.m15),tfScore(series.h1),tfScore(series.h4),tfScore(series.d1)];
    const h=series.m1,c=h.map(x=>x.c),last=c.at(-1),hist=historicalReach(h,refPips),ap=atr(h)/.01,rr=rsi(c);
    const e9=ema(c.slice(-60),9),e21=ema(c.slice(-80),21),e50=ema(c.slice(-100),50);
    const h20=h.slice(-20),h60=h.slice(-60);const rng20=Math.max(...h20.map(x=>x.h))-Math.min(...h20.map(x=>x.l));const rng60=Math.max(...h60.map(x=>x.h))-Math.min(...h60.map(x=>x.l));
    const scale=refPips*.01,moms=[1,3,5,10,15,30,60].map(n=>c.length>n?(last-c[c.length-1-n])/scale:0);
    const dt=new Date(h.at(-1).t),hour=dt.getUTCHours()+dt.getUTCMinutes()/60,ang=2*Math.PI*hour/24,dow=(dt.getUTCDay()+6)%7,dang=2*Math.PI*dow/5;
    const x=[...scores,hist.long,hist.short,hist.long-hist.short,ap/refPips,(rr-50)/25,(last-e9)/scale,(e9-e21)/scale,(e21-e50)/scale,position(c,20)-.5,position(c,60)-.5,rng20/scale,rng60/scale,...moms,Math.sin(ang),Math.cos(ang),Math.sin(dang),Math.cos(dang),rateDiff/3];
    return{x,scores,hist,ap,rr};
  }
  function logistic(model,x){let z=model.intercept;for(let i=0;i<x.length;i++){const sc=model.scale[i]||1;z+=((x[i]-model.mean[i])/sc)*model.coef[i];}return sigmoid(z);}
  function hgb(model,x){let raw=model.baseline;for(const nodes of model.trees){let i=0;while(!nodes[i].leaf){const n=nodes[i],v=x[n.f];i=!Number.isFinite(v)?(n.ml?n.l:n.r):(v<=n.t?n.l:n.r);}raw+=nodes[i].v;}return sigmoid(raw);}

  async function loadModel(){if(browserModel)return browserModel;const r=await fetch('./fx-model.json?v=2',{cache:'no-store'});if(!r.ok)throw new Error('model '+r.status);const m=await r.json();if(!m?.reach||!m?.direction||m.feature_count!==30)throw new Error('bad model');browserModel=m;return m;}
  function analyze(series,model){
    const pips=Math.max(.1,targetPips()),ref=Number(model.target_pips_reference)||5.191;const f=features(series,ref);const reach=logistic(model.reach,f.x),pLong=hgb(model.direction,f.x),dirConf=Math.max(pLong,1-pLong);const side=pLong>=.5?'long':'short';
    const passReach=reach>=model.thresholds.reach,passDir=dirConf>=model.thresholds.direction;let signal='⚪ 様子見';if(passReach&&passDir)signal=side==='long'?'🟢 ロング優勢':'🔴 ショート優勢';
    const labels=['1分','5分','15分','1時間','4時間','日足'];const reasons=[];
    reasons.push([`到達しやすさ ${(reach*100).toFixed(0)}%`,passReach?'up':'warn']);reasons.push([`方向確信 ${(dirConf*100).toFixed(0)}%`,passDir?(side==='long'?'up':'down'):'warn']);
    if(!passReach)reasons.push(['値幅条件が弱い → 様子見','warn']);if(passReach&&!passDir)reasons.push(['方向差が弱い → 様子見','warn']);
    [2,3,4,5].forEach(i=>{if(f.scores[i]>.25)reasons.push([`${labels[i]} 上向き`,'up']);else if(f.scores[i]<-.25)reasons.push([`${labels[i]} 下向き`,'down']);});
    reasons.push([`RSI ${f.rr.toFixed(0)}`,f.rr>=50?'up':'down']);reasons.push([`日米金利差 +${rateDiff.toFixed(2)}%`,'up']);reasons.push([`ATR ${f.ap.toFixed(1)}pips`,'']);reasons.push([`検証到達率 ${model.validation.target_hit_30m_pct.toFixed(1)}%`,'']);
    return{pips,reach,pLong,pShort:1-pLong,dirConf,signal,reasons,scores:f.scores,labels,price:series.m1.at(-1).c};
  }

  function render(a,sourceTime){const $=id=>document.getElementById(id);$('fxaPrice').textContent=a.price.toFixed(3);$('fxaTarget').textContent=a.pips.toFixed(1)+' pips';$('fxaReach').textContent=Math.round(a.reach*100)+'%';$('fxaDirConf').textContent=Math.round(a.dirConf*100)+'%';$('fxaLong').textContent=Math.round(a.pLong*100)+'%';$('fxaShort').textContent=Math.round(a.pShort*100)+'%';$('fxaSignal').textContent=a.signal;$('fxaReasons').innerHTML=a.reasons.map(x=>`<span class="fxa-chip ${x[1]}">${x[0]}</span>`).join('');$('fxaBars').innerHTML=a.scores.map((v,i)=>`<div class="fxa-bar-row"><span>${a.labels[i]}</span><div class="fxa-track"><div class="fxa-fill" style="width:${Math.round((v+1)*50)}%"></div></div><span>${v>0?'+':''}${Math.round(v*100)}</span></div>`).join('');$('fxaStatus').textContent='最終分析 '+new Date().toLocaleTimeString('ja-JP')+(sourceTime?' / 足 '+new Date(sourceTime).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'');}
  function error(msg){const e=document.getElementById('fxaStatus');if(e)e.textContent=msg;}

  async function fetchYahoo(interval,range){const hosts=['query1.finance.yahoo.com','query2.finance.yahoo.com'];let lastErr;for(const host of hosts){try{const url=`https://${host}/v8/finance/chart/JPY=X?interval=${interval}&range=${range}&includePrePost=true&events=div%2Csplits`;const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw new Error(String(res.status));const j=await res.json(),r=j?.chart?.result?.[0],q=r?.indicators?.quote?.[0],ts=r?.timestamp||[];if(!r||!q||!ts.length)throw new Error('no data');const bars=[];for(let i=0;i<ts.length;i++){const o=Number(q.open?.[i]),h=Number(q.high?.[i]),l=Number(q.low?.[i]),c=Number(q.close?.[i]);if([o,h,l,c].every(Number.isFinite))bars.push({t:ts[i]*1000,o,h,l,c});}if(bars.length<25)throw new Error('few bars');return bars;}catch(e){lastErr=e;}}throw lastErr||new Error('fetch failed');}
  async function fetchSeries(){let m1=await fetchYahoo('1m','1d');if(m1.length<430)m1=await fetchYahoo('1m','5d');const [m5,m15,h1,d1]=await Promise.all([fetchYahoo('5m','5d'),fetchYahoo('15m','1mo'),fetchYahoo('60m','3mo'),fetchYahoo('1d','1y')]);return{m1,m5,m15,h1,h4:aggregate(h1,240),d1};}

  let busy=false;
  async function tick(){if(busy)return;busy=true;try{const [model,series]=await Promise.all([loadModel(),fetchSeries()]);if(series.m1.length<100)throw new Error('insufficient m1');render(analyze(series,model),series.m1.at(-1).t);}catch(e){console.warn('fx analysis',e);error('分析データ取得待ち');}finally{busy=false;}}
  function start(){tick();setInterval(tick,15000);}
  waitForPage();
})();