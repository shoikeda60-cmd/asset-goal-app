(() => {
  if(window.__fxAnalysisLoaded) return;
  window.__fxAnalysisLoaded=true;

  const POLICY={usLow:3.50,usHigh:3.75,jp:1.00,asOf:'2026-08-16'};
  const rateDiff=((POLICY.usLow+POLICY.usHigh)/2)-POLICY.jp;

  const style=document.createElement('style');
  style.textContent=`
    .fxa-wrap{margin:10px 12px 12px;background:linear-gradient(180deg,#111c37,#0d1730);border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:14px;box-shadow:0 12px 30px rgba(0,0,0,.18)}
    .fxa-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.fxa-title{font-size:16px;font-weight:900;color:#fff}.fxa-status{font-size:11px;color:#94a3b8}
    .fxa-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.fxa-card{background:#0a1328;border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:11px}.fxa-label{font-size:11px;color:#94a3b8}.fxa-value{font-size:23px;font-weight:900;color:#fff;margin-top:3px;letter-spacing:-.3px}.fxa-value.good{color:#34d399}.fxa-value.bad{color:#fb7185}.fxa-value.neutral{color:#fbbf24}
    .fxa-main{margin-top:9px;background:#091225;border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:12px}.fxa-signal{font-size:18px;font-weight:900;color:#fff}.fxa-reasons{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}.fxa-chip{font-size:11px;padding:5px 8px;border-radius:999px;background:#182541;border:1px solid #2b3b5f;color:#cbd5e1}.fxa-chip.up{color:#6ee7b7;border-color:rgba(52,211,153,.35)}.fxa-chip.down{color:#fda4af;border-color:rgba(251,113,133,.35)}
    .fxa-bars{margin-top:10px;display:grid;gap:7px}.fxa-bar-row{display:grid;grid-template-columns:48px 1fr 42px;gap:8px;align-items:center;font-size:11px;color:#94a3b8}.fxa-track{height:7px;border-radius:999px;background:#1e293b;overflow:hidden}.fxa-fill{height:100%;border-radius:999px;background:#3b82f6}.fxa-note{margin-top:10px;font-size:10px;line-height:1.5;color:#64748b}
    @media(max-width:560px){.fxa-value{font-size:20px}.fxa-grid{gap:7px}.fxa-card{padding:10px}}
  `;
  document.head.appendChild(style);

  function waitForPage(){
    const page=document.getElementById('fxSbiPage');
    if(!page){setTimeout(waitForPage,250);return;}
    const toolbar=page.querySelector('.sbi-toolbar');
    if(!toolbar || document.getElementById('fxAnalysisPanel')) return;
    const panel=document.createElement('div');
    panel.id='fxAnalysisPanel'; panel.className='fxa-wrap';
    panel.innerHTML=`
      <div class="fxa-head"><div class="fxa-title">AI風アルゴリズム分析</div><div class="fxa-status" id="fxaStatus">データ取得待ち</div></div>
      <div class="fxa-grid">
        <div class="fxa-card"><div class="fxa-label">現在値（参考）</div><div class="fxa-value" id="fxaPrice">--</div></div>
        <div class="fxa-card"><div class="fxa-label">本日の目標相当</div><div class="fxa-value" id="fxaTarget">-- pips</div></div>
        <div class="fxa-card"><div class="fxa-label">ロング到達確率</div><div class="fxa-value good" id="fxaLong">--%</div></div>
        <div class="fxa-card"><div class="fxa-label">ショート到達確率</div><div class="fxa-value bad" id="fxaShort">--%</div></div>
      </div>
      <div class="fxa-main"><div class="fxa-label">現在の判定（30分以内）</div><div class="fxa-signal" id="fxaSignal">分析待ち</div><div class="fxa-reasons" id="fxaReasons"></div><div class="fxa-bars" id="fxaBars"></div></div>
      <div class="fxa-note">1分・5分・15分・1時間・4時間・日足を同時評価し、EMA・RSI・ATR・モメンタム・過去到達率に加えて日米政策金利差も補助材料として使用します。金利差は長期バイアスであり、短期チャートより弱く効かせています。将来の値動きを保証するものではなく、売買注文は行いません。</div>`;
    toolbar.insertAdjacentElement('beforebegin',panel);
    start();
  }

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function ema(vals,n){if(!vals.length)return NaN;const k=2/(n+1);let e=vals[0];for(let i=1;i<vals.length;i++)e=vals[i]*k+e*(1-k);return e;}
  function rsi(vals,n=14){if(vals.length<n+1)return 50;let g=0,l=0;for(let i=vals.length-n;i<vals.length;i++){const d=vals[i]-vals[i-1];if(d>0)g+=d;else l-=d;}if(l===0)return 100;const rs=(g/n)/(l/n);return 100-(100/(1+rs));}
  function atr(bars,n=14){if(bars.length<n+1)return 0;let sum=0;for(let i=bars.length-n;i<bars.length;i++){const b=bars[i],p=bars[i-1].c;sum+=Math.max(b.h-b.l,Math.abs(b.h-p),Math.abs(b.l-p));}return sum/n;}
  function aggregate(bars,min){const ms=min*60000,m=new Map();bars.forEach(b=>{const k=Math.floor(b.t/ms)*ms;let x=m.get(k);if(!x){x={t:k,o:b.o,h:b.h,l:b.l,c:b.c};m.set(k,x);}else{x.h=Math.max(x.h,b.h);x.l=Math.min(x.l,b.l);x.c=b.c;}});return [...m.values()].sort((a,b)=>a.t-b.t);}
  function targetPips(){try{const s=state.settings;const rec=state.records[state.records.length-1];const asset=Number(rec?rec.asset:s.startAsset);let units=Math.floor((asset/Number(s.baseAsset)*Number(s.baseUnits))/1000)*1000;if(!units)return 0;const yenGoal=asset*(Number(s.dailyRate)/100);return yenGoal/(units*0.01);}catch(e){return 0;}}
  function tfScore(bars){if(!bars||bars.length<25)return 0;const closes=bars.map(b=>b.c),e9=ema(closes.slice(-40),9),e21=ema(closes.slice(-60),21),rr=rsi(closes,14);const mom=closes.at(-1)-closes[Math.max(0,closes.length-4)];let s=0;s+=e9>e21?1:-1;s+=closes.at(-1)>e9?.6:-.6;s+=mom>0?.5:-.5;s+=rr>52?.5:rr<48?-.5:0;if(rr>75)s-=.35;if(rr<25)s+=.35;return clamp(s/2.6,-1,1);}
  function historicalReach(bars,pips,horizon=30){const d=pips*.01;if(!d||bars.length<80)return{long:.5,short:.5,samples:0};let L=0,S=0,N=0;const start=Math.max(0,bars.length-360);for(let i=start;i<bars.length-horizon;i+=2){const base=bars[i].c;let lo=false,sh=false;for(let j=i+1;j<=i+horizon;j++){if(!lo&&bars[j].h>=base+d)lo=true;if(!sh&&bars[j].l<=base-d)sh=true;if(lo&&sh)break;}L+=lo?1:0;S+=sh?1:0;N++;}return{long:N?L/N:.5,short:N?S/N:.5,samples:N};}

  function analyze(series){
    const pips=Math.max(.1,targetPips());
    const scores=[tfScore(series.m1),tfScore(series.m5),tfScore(series.m15),tfScore(series.h1),tfScore(series.h4),tfScore(series.d1)];
    const weights=[.08,.12,.18,.22,.22,.18];
    let dir=scores.reduce((a,v,i)=>a+v*weights[i],0);
    const rateBias=clamp(rateDiff/3,-1,1);
    const hist=historicalReach(series.m1,pips,30);
    const a=atr(series.m1,14)/.01;
    const reach=clamp(a>0?(a*Math.sqrt(30/14))/pips:1,.55,1.45);
    let long=50+dir*22+(hist.long-.5)*22+(reach-1)*10+rateBias*4;
    let short=50-dir*22+(hist.short-.5)*22+(reach-1)*10-rateBias*4;
    long=Math.round(clamp(long,15,85));short=Math.round(clamp(short,15,85));
    const reasons=[];
    const labels=['1分','5分','15分','1時間','4時間','日足'];
    [2,3,4,5].forEach(i=>{if(scores[i]>.25)reasons.push([`${labels[i]} 上向き`,'up']);else if(scores[i]<-.25)reasons.push([`${labels[i]} 下向き`,'down']);});
    const rr=rsi(series.m1.map(x=>x.c),14);reasons.push([`RSI ${rr.toFixed(0)}`,rr>=50?'up':'down']);
    reasons.push([`日米金利差 +${rateDiff.toFixed(2)}%`,'up']);
    reasons.push([`1分ATR ${a.toFixed(1)} pips`,'']);reasons.push([`過去サンプル ${hist.samples}`,'']);
    let signal='⚪ 様子見';
    if(long>=62&&long-short>=8)signal='🟢 ロング優勢';else if(short>=62&&short-long>=8)signal='🔴 ショート優勢';else if(long>=56&&long>short)signal='🟢 ロングやや優勢';else if(short>=56&&short>long)signal='🔴 ショートやや優勢';
    return{pips,long,short,signal,reasons,scores,labels,price:series.m1.at(-1).c};
  }

  function render(a,sourceTime){const $=id=>document.getElementById(id);$('fxaPrice').textContent=a.price.toFixed(3);$('fxaTarget').textContent=a.pips.toFixed(1)+' pips';$('fxaLong').textContent=a.long+'%';$('fxaShort').textContent=a.short+'%';$('fxaSignal').textContent=a.signal;$('fxaReasons').innerHTML=a.reasons.map(x=>`<span class="fxa-chip ${x[1]}">${x[0]}</span>`).join('');$('fxaBars').innerHTML=a.scores.map((v,i)=>{const pct=Math.round((v+1)*50);return `<div class="fxa-bar-row"><span>${a.labels[i]}</span><div class="fxa-track"><div class="fxa-fill" style="width:${pct}%"></div></div><span>${v>0?'+':''}${Math.round(v*100)}</span></div>`}).join('');$('fxaStatus').textContent='最終分析 '+new Date().toLocaleTimeString('ja-JP')+(sourceTime?' / 足 '+new Date(sourceTime).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'');}
  function error(msg){const e=document.getElementById('fxaStatus');if(e)e.textContent=msg;}

  async function fetchYahoo(interval,range){
    const hosts=['query1.finance.yahoo.com','query2.finance.yahoo.com'];let lastErr;
    for(const host of hosts){try{const url=`https://${host}/v8/finance/chart/JPY=X?interval=${interval}&range=${range}&includePrePost=true&events=div%2Csplits`;const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw new Error(String(res.status));const j=await res.json(),r=j?.chart?.result?.[0],q=r?.indicators?.quote?.[0],ts=r?.timestamp||[];if(!r||!q||!ts.length)throw new Error('no data');const bars=[];for(let i=0;i<ts.length;i++){const o=Number(q.open?.[i]),h=Number(q.high?.[i]),l=Number(q.low?.[i]),c=Number(q.close?.[i]);if([o,h,l,c].every(Number.isFinite))bars.push({t:ts[i]*1000,o,h,l,c});}if(bars.length<25)throw new Error('few bars');return bars;}catch(e){lastErr=e;}}
    throw lastErr||new Error('fetch failed');
  }
  async function fetchSeries(){
    const [m1,m5,m15,h1,d1]=await Promise.all([
      fetchYahoo('1m','1d'),fetchYahoo('5m','5d'),fetchYahoo('15m','1mo'),fetchYahoo('60m','3mo'),fetchYahoo('1d','1y')
    ]);
    return{m1,m5,m15,h1,h4:aggregate(h1,240),d1};
  }

  let busy=false;
  async function tick(){if(busy)return;busy=true;try{const series=await fetchSeries();const a=analyze(series);render(a,series.m1.at(-1).t);}catch(e){console.warn('fx analysis',e);error('分析データ取得待ち');}finally{busy=false;}}
  function start(){tick();setInterval(tick,15000);}
  waitForPage();
})();