(() => {
  if(window.__fxAnalysisLoaded) return;
  window.__fxAnalysisLoaded=true;

  const style=document.createElement('style');
  style.textContent=`
    .fxa-wrap{margin:10px 12px 12px;background:linear-gradient(180deg,#111c37,#0d1730);border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:14px;box-shadow:0 12px 30px rgba(0,0,0,.18)}
    .fxa-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    .fxa-title{font-size:16px;font-weight:900;color:#fff}.fxa-status{font-size:11px;color:#94a3b8}
    .fxa-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.fxa-card{background:#0a1328;border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:11px}
    .fxa-label{font-size:11px;color:#94a3b8}.fxa-value{font-size:23px;font-weight:900;color:#fff;margin-top:3px;letter-spacing:-.3px}.fxa-value.good{color:#34d399}.fxa-value.bad{color:#fb7185}.fxa-value.neutral{color:#fbbf24}
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
      <div class="fxa-main"><div class="fxa-label">現在の判定（30分以内）</div><div class="fxa-signal" id="fxaSignal">分析待ち</div><div class="fxa-reasons" id="fxaReasons"></div>
        <div class="fxa-bars" id="fxaBars"></div>
      </div>
      <div class="fxa-note">推定確率は、直近の1分足データからEMA・RSI・ATR・モメンタム・複数時間足の方向を組み合わせた参考値です。将来の値動きを保証するものではなく、売買注文は行いません。</div>`;
    toolbar.insertAdjacentElement('beforebegin',panel);
    start();
  }

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function ema(vals,n){
    if(!vals.length) return NaN; const k=2/(n+1); let e=vals[0];
    for(let i=1;i<vals.length;i++) e=vals[i]*k+e*(1-k); return e;
  }
  function rsi(vals,n=14){
    if(vals.length<n+1) return 50; let g=0,l=0;
    for(let i=vals.length-n;i<vals.length;i++){const d=vals[i]-vals[i-1]; if(d>0)g+=d; else l-=d;}
    if(l===0) return 100; const rs=(g/n)/(l/n); return 100-(100/(1+rs));
  }
  function atr(bars,n=14){
    if(bars.length<n+1) return 0; let sum=0;
    for(let i=bars.length-n;i<bars.length;i++){const b=bars[i],p=bars[i-1].c;sum+=Math.max(b.h-b.l,Math.abs(b.h-p),Math.abs(b.l-p));}
    return sum/n;
  }
  function aggregate(bars,min){
    const ms=min*60000,m=new Map();
    bars.forEach(b=>{const k=Math.floor(b.t/ms)*ms;let x=m.get(k);if(!x){x={t:k,o:b.o,h:b.h,l:b.l,c:b.c};m.set(k,x);}else{x.h=Math.max(x.h,b.h);x.l=Math.min(x.l,b.l);x.c=b.c;}});
    return [...m.values()].sort((a,b)=>a.t-b.t);
  }
  function targetPips(){
    try{
      const s=state.settings; const rec=state.records[state.records.length-1]; const asset=Number(rec?rec.asset:s.startAsset);
      let units=Math.floor((asset/Number(s.baseAsset)*Number(s.baseUnits))/1000)*1000;
      if(!units) return 0;
      const yenGoal=asset*(Number(s.dailyRate)/100);
      return yenGoal/(units*0.01);
    }catch(e){return 0;}
  }
  function tfScore(bars){
    if(bars.length<25) return 0;
    const closes=bars.map(b=>b.c), e9=ema(closes.slice(-30),9),e21=ema(closes.slice(-40),21), rr=rsi(closes,14);
    const mom=closes.at(-1)-closes[Math.max(0,closes.length-4)];
    let s=0; s+=e9>e21?1:-1; s+=closes.at(-1)>e9?.6:-.6; s+=mom>0?.5:-.5; s+=rr>52?.5:rr<48?-.5:0; if(rr>75)s-=.35;if(rr<25)s+=.35;
    return clamp(s/2.6,-1,1);
  }
  function historicalReach(bars,pips,horizon=30){
    const d=pips*0.01; if(!d||bars.length<80) return {long:.5,short:.5,samples:0};
    let L=0,S=0,N=0;
    const start=Math.max(0,bars.length-360);
    for(let i=start;i<bars.length-horizon;i+=2){
      const base=bars[i].c; let lo=false,sh=false;
      for(let j=i+1;j<=i+horizon;j++){
        if(!lo && bars[j].h>=base+d){lo=true;}
        if(!sh && bars[j].l<=base-d){sh=true;}
        if(lo&&sh) break;
      }
      L+=lo?1:0;S+=sh?1:0;N++;
    }
    return {long:N?L/N:.5,short:N?S/N:.5,samples:N};
  }
  function analyze(bars){
    const pips=Math.max(.1,targetPips());
    const b1=bars,b5=aggregate(bars,5),b15=aggregate(bars,15),b60=aggregate(bars,60);
    const scores=[tfScore(b1),tfScore(b5),tfScore(b15),tfScore(b60)];
    const weights=[.18,.24,.32,.26]; let dir=scores.reduce((a,v,i)=>a+v*weights[i],0);
    const hist=historicalReach(b1,pips,30);
    const a=atr(b1,14)/.01; const reach=clamp(a>0?(a*Math.sqrt(30/14))/pips:1,.55,1.45);
    let long=50 + dir*22 + (hist.long-.5)*22 + (reach-1)*10;
    let short=50 - dir*22 + (hist.short-.5)*22 + (reach-1)*10;
    long=Math.round(clamp(long,15,85)); short=Math.round(clamp(short,15,85));
    const reasons=[];
    if(scores[2]>.25) reasons.push(['15分足 上向き','up']); else if(scores[2]<-.25) reasons.push(['15分足 下向き','down']);
    if(scores[3]>.25) reasons.push(['1時間足 上向き','up']); else if(scores[3]<-.25) reasons.push(['1時間足 下向き','down']);
    const rr=rsi(b1.map(x=>x.c),14); reasons.push([`RSI ${rr.toFixed(0)}`,rr>=50?'up':'down']);
    reasons.push([`1分ATR ${a.toFixed(1)} pips`, '']);
    reasons.push([`過去サンプル ${hist.samples}`, '']);
    let signal='⚪ 様子見';
    if(long>=62 && long-short>=8) signal='🟢 ロング優勢';
    else if(short>=62 && short-long>=8) signal='🔴 ショート優勢';
    else if(long>=56 && long>short) signal='🟢 ロングやや優勢';
    else if(short>=56 && short>long) signal='🔴 ショートやや優勢';
    return {pips,long,short,signal,reasons,scores,price:b1.at(-1).c};
  }

  function render(a,sourceTime){
    const $=id=>document.getElementById(id);
    $('fxaPrice').textContent=a.price.toFixed(3);
    $('fxaTarget').textContent=a.pips.toFixed(1)+' pips';
    $('fxaLong').textContent=a.long+'%'; $('fxaShort').textContent=a.short+'%'; $('fxaSignal').textContent=a.signal;
    $('fxaReasons').innerHTML=a.reasons.map(x=>`<span class="fxa-chip ${x[1]}">${x[0]}</span>`).join('');
    const labels=['1分','5分','15分','1時間'];
    $('fxaBars').innerHTML=a.scores.map((v,i)=>{const pct=Math.round((v+1)*50);return `<div class="fxa-bar-row"><span>${labels[i]}</span><div class="fxa-track"><div class="fxa-fill" style="width:${pct}%"></div></div><span>${v>0?'+':''}${Math.round(v*100)}</span></div>`}).join('');
    $('fxaStatus').textContent='最終分析 '+new Date().toLocaleTimeString('ja-JP')+(sourceTime?' / 足 '+new Date(sourceTime).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'');
  }
  function error(msg){const e=document.getElementById('fxaStatus');if(e)e.textContent=msg;}

  async function fetchBars(){
    const urls=[
      'https://query1.finance.yahoo.com/v8/finance/chart/JPY=X?interval=1m&range=1d&includePrePost=true&events=div%2Csplits',
      'https://query2.finance.yahoo.com/v8/finance/chart/JPY=X?interval=1m&range=1d&includePrePost=true&events=div%2Csplits'
    ];
    let lastErr;
    for(const url of urls){
      try{
        const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error(String(res.status));
        const j=await res.json(),r=j?.chart?.result?.[0],q=r?.indicators?.quote?.[0],ts=r?.timestamp||[];
        if(!r||!q||!ts.length) throw new Error('no data');
        const bars=[];
        for(let i=0;i<ts.length;i++){
          const o=Number(q.open?.[i]),h=Number(q.high?.[i]),l=Number(q.low?.[i]),c=Number(q.close?.[i]);
          if([o,h,l,c].every(Number.isFinite)) bars.push({t:ts[i]*1000,o,h,l,c});
        }
        if(bars.length<30) throw new Error('few bars');
        return bars;
      }catch(e){lastErr=e;}
    }
    throw lastErr||new Error('fetch failed');
  }

  let busy=false;
  async function tick(){
    if(busy) return; busy=true;
    try{const bars=await fetchBars();const a=analyze(bars);render(a,bars.at(-1).t);}catch(e){console.warn('fx analysis',e);error('分析データ取得待ち');}finally{busy=false;}
  }
  function start(){tick();setInterval(tick,5000);}
  waitForPage();
})();