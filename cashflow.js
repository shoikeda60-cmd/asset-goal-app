(() => {
  if (!Array.isArray(state.cashflows)) state.cashflows = [];

  const style=document.createElement('style');
  style.textContent=`
    .hist{align-items:flex-start}
    .hist-main{display:flex;flex-direction:column;gap:4px;flex:1}
    .hist-sub{font-size:12px;color:var(--muted);line-height:1.5}
    .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
    .chip{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid var(--line);background:#f3f4f6;color:#374151}
    .chip.good{background:#ecfdf5;color:#047857;border-color:#a7f3d0}
    .chip.bad{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
    .chip.neutral{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
  `;
  document.head.appendChild(style);

  function totalCashflowUntil(ts=null){
    return (state.cashflows||[]).reduce((sum,c)=>{
      if(ts && new Date(c.ts)>new Date(ts)) return sum;
      return sum + (c.type==='withdrawal' ? -Number(c.amount) : Number(c.amount));
    },0);
  }
  function cashflowBetween(fromTs,toTs){
    return (state.cashflows||[]).reduce((sum,c)=>{
      const t=new Date(c.ts).getTime();
      if(fromTs && t<=new Date(fromTs).getTime()) return sum;
      if(toTs && t>new Date(toTs).getTime()) return sum;
      return sum + (c.type==='withdrawal' ? -Number(c.amount) : Number(c.amount));
    },0);
  }
  function adjustedAsset(asset,ts=null){
    return Number(asset)-totalCashflowUntil(ts);
  }
  function theoreticalDaysAdjusted(asset,ts=null){
    const s=state.settings;
    const adj=Math.max(1,adjustedAsset(asset,ts));
    if(adj<=s.startAsset) return 0;
    return Math.log(adj/s.startAsset)/Math.log(1+s.dailyRate/100);
  }
  function signedYen(v){
    v=Number(v)||0;
    if(v===0) return '±¥0';
    return (v>0?'+':'-')+yen(Math.abs(v)).replace('￥','¥');
  }
  function recordBreakdown(index){
    const rec=state.records[index];
    if(!rec) return null;
    if(index===0){
      const base=Number(state.settings.startAsset)||0;
      const cf=cashflowBetween(null,rec.ts);
      return {delta:Number(rec.asset)-base,cashflow:cf,profit:Number(rec.asset)-base-cf,isFirst:true};
    }
    const prev=state.records[index-1];
    const delta=Number(rec.asset)-Number(prev.asset);
    const cf=cashflowBetween(prev.ts,rec.ts);
    return {delta,cashflow:cf,profit:delta-cf,isFirst:false};
  }

  if(state.cashflows.length===0){
    for(let i=1;i<state.records.length;i++){
      const diff=Number(state.records[i].asset)-Number(state.records[i-1].asset);
      if(Math.abs(diff-100000)<1){
        state.cashflows.push({ts:state.records[i].ts,type:'deposit',amount:100000});
        save();
        break;
      }
    }
  }

  const inputCard=document.getElementById('assetInput')?.closest('.card');
  if(inputCard && !document.getElementById('cashflowInput')){
    const box=document.createElement('div');
    box.style.cssText='margin-top:16px;padding-top:14px;border-top:1px solid var(--line)';
    box.innerHTML=`
      <div class="label">入出金を記録（利益には含めません）</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
        <input id="cashflowInput" type="number" inputmode="numeric" min="1" step="1" placeholder="金額">
        <select id="cashflowType" style="width:100%;padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff;font-size:16px">
          <option value="deposit">入金</option><option value="withdrawal">出金</option>
        </select>
      </div>
      <button class="secondary" id="cashflowBtn" style="width:100%;margin-top:10px">入出金を記録</button>`;
    inputCard.appendChild(box);
    document.getElementById('cashflowBtn').onclick=()=>{
      const amount=Number(document.getElementById('cashflowInput').value);
      const type=document.getElementById('cashflowType').value;
      if(!Number.isFinite(amount)||amount<=0){alert('入出金額を入力してください');return;}
      state.cashflows.push({ts:new Date().toISOString(),type,amount});
      state.cashflows.sort((a,b)=>new Date(a.ts)-new Date(b.ts));
      save(); document.getElementById('cashflowInput').value=''; render(); cloudSync(false);
    };
  }

  const metric=document.querySelector('.metric');
  if(metric && !document.getElementById('netCashflow')){
    const a=document.createElement('div'); a.innerHTML='<span class="label">累計入出金</span><b id="netCashflow">¥0</b>'; metric.appendChild(a);
    const b=document.createElement('div'); b.innerHTML='<span class="label">純利益</span><b id="pureProfit">¥0</b>'; metric.appendChild(b);
  }

  const assetChart=document.getElementById('chart');
  const assetChartCard=assetChart?.closest('.card');
  if(assetChartCard && !document.getElementById('profitChart')){
    const profitCard=document.createElement('div');
    profitCard.className='card';
    profitCard.innerHTML='<div class="row"><b>利益推移</b><span class="label">純利益（入出金を除く）</span></div><canvas id="profitChart" width="700" height="220"></canvas>';
    assetChartCard.insertAdjacentElement('afterend',profitCard);
  }

  function renderProfitChart(){
    const c=document.getElementById('profitChart');
    if(!c) return;
    const ctx=c.getContext('2d');
    const W=c.width,H=c.height; ctx.clearRect(0,0,W,H);
    const pad=34;
    const pts=state.records.slice(-40);
    const s=state.settings;
    if(pts.length===0){
      ctx.fillStyle='#6b7280';ctx.font='14px sans-serif';ctx.fillText('記録するとグラフが表示されます',20,40);return;
    }
    const series=pts.map(r=>({profit:Number(r.asset)-Number(s.startAsset)-totalCashflowUntil(r.ts),label:new Date(r.ts)}));
    const vals=series.map(x=>x.profit);
    let min=Math.min(...vals,0),max=Math.max(...vals,0);
    if(min===max){min-=1000;max+=1000;}
    const X=i=>pad+(W-2*pad)*(series.length===1?0.5:i/(series.length-1));
    const Y=v=>H-pad-(H-2*pad)*(v-min)/(max-min);
    ctx.strokeStyle='#e5e7eb';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,pad);ctx.lineTo(pad,H-pad);ctx.lineTo(W-pad,H-pad);ctx.stroke();
    const zeroY=Y(0);
    ctx.strokeStyle='#d1d5db';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(pad,zeroY);ctx.lineTo(W-pad,zeroY);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle='#2563eb';ctx.lineWidth=3;ctx.beginPath();
    series.forEach((p,i)=>{const x=X(i),y=Y(p.profit);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    ctx.stroke();
    ctx.fillStyle='#2563eb';ctx.font='12px sans-serif';ctx.fillText('純利益',pad,16);
    ctx.fillStyle='#6b7280';ctx.fillText('0円',W-pad-26,Math.max(12,zeroY-6));
  }

  cloudSync = async function(showAlert=false){
    const token=localStorage.getItem(TOKEN_KEY);
    if(!token){ setSyncStatus('トークン未設定'); if(showAlert) alert('まずGitHubトークンを保存してください'); return false; }
    setSyncStatus('同期中…');
    const url=`${GH_API}/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
    const headers={'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'X-GitHub-Api-Version':'2026-03-10'};
    try{
      let remote=null,sha=null;
      const getRes=await fetch(url,{headers});
      if(getRes.ok){ const obj=await getRes.json(); sha=obj.sha||null; try{remote=JSON.parse(b64ToUtf8(obj.content||''));}catch(e){} }
      else if(getRes.status!==404) throw new Error(`読み込みエラー ${getRes.status}`);
      if(remote && Array.isArray(remote.records)){
        state.records=mergeRecords(state.records,remote.records);
        const merged=new Map();
        [...(state.cashflows||[]),...(Array.isArray(remote.cashflows)?remote.cashflows:[])].forEach(c=>{
          if(!c||!c.ts||!c.type||!Number.isFinite(Number(c.amount))) return;
          merged.set(`${c.ts}|${c.type}|${c.amount}`,{ts:c.ts,type:c.type,amount:Number(c.amount)});
        });
        state.cashflows=[...merged.values()].sort((a,b)=>new Date(a.ts)-new Date(b.ts)); save();
      }
      const payload={version:2,updatedAt:new Date().toISOString(),settings:state.settings,records:state.records,cashflows:state.cashflows||[]};
      const body={message:'Sync asset goal data',content:utf8ToB64(JSON.stringify(payload,null,2)),branch:'main'};
      if(sha) body.sha=sha;
      const putRes=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!putRes.ok) throw new Error(`保存エラー ${putRes.status}`);
      setSyncStatus(`同期済み：${new Date().toLocaleString('ja-JP')}`,'good');
      if(showAlert) alert('クラウド同期できました。');
      render(); return true;
    }catch(e){ console.error(e); setSyncStatus('同期失敗：'+e.message,'bad'); if(showAlert) alert('同期できませんでした'); return false; }
  };

  function enhanceHistory(){
    const h=document.getElementById('history');
    if(!h) return;
    h.querySelectorAll('.hist').forEach(row=>{
      const btn=row.querySelector('button[data-i]');
      if(!btn) return;
      const idx=Number(btn.dataset.i);
      const b=recordBreakdown(idx);
      if(!b) return;
      const left=row.firstElementChild;
      if(!left || left.dataset.enhanced==='1') return;
      left.dataset.enhanced='1'; left.classList.add('hist-main');
      const delta=document.createElement('div'); delta.className='hist-sub';
      delta.innerHTML=`前回比 <b class="${b.delta>0?'good':b.delta<0?'bad':''}">${signedYen(b.delta)}</b>`;
      left.appendChild(delta);
      const detail=document.createElement('div'); detail.className='hist-sub';
      const parts=[];
      if(b.cashflow!==0) parts.push(`${b.cashflow>0?'入金':'出金'} ${signedYen(b.cashflow)}`);
      if(b.profit!==0) parts.push(`${b.profit>0?'利益':'損失'} ${signedYen(b.profit)}`);
      if(parts.length===0) parts.push('変化なし ±¥0');
      detail.textContent=parts.join(' ／ '); left.appendChild(detail);
      const chips=document.createElement('div'); chips.className='chips';
      if(b.isFirst) chips.innerHTML+='<span class="chip neutral">初回記録</span>';
      if(b.cashflow>0) chips.innerHTML+='<span class="chip neutral">入金あり</span>';
      if(b.cashflow<0) chips.innerHTML+='<span class="chip bad">出金あり</span>';
      if(b.profit>0) chips.innerHTML+='<span class="chip good">利益</span>';
      if(b.profit<0) chips.innerHTML+='<span class="chip bad">損失</span>';
      left.appendChild(chips);
    });

    if(state.cashflows.length && !h.querySelector('[data-cashflow-section]')){
      const wrap=document.createElement('div'); wrap.dataset.cashflowSection='1';
      wrap.innerHTML='<div class="tiny" style="margin:6px 0">入出金</div>';
      [...state.cashflows].reverse().forEach(c=>{
        const d=new Date(c.ts); const row=document.createElement('div'); row.className='hist'; row.style.marginBottom='8px';
        const signed=c.type==='withdrawal'?-Number(c.amount):Number(c.amount);
        row.innerHTML=`<div class="hist-main"><b>${c.type==='withdrawal'?'出金':'入金'} ${signedYen(signed)}</b><small>${d.toLocaleString('ja-JP')}</small><div class="chips"><span class="chip ${c.type==='withdrawal'?'bad':'neutral'}">${c.type==='withdrawal'?'出金':'入金'}</span></div></div>`;
        wrap.appendChild(row);
      });
      h.prepend(wrap);
    }
  }

  const oldRender=render;
  render=function(){
    oldRender();
    const rec=latest();
    const asset=rec?Number(rec.asset):Number(state.settings.startAsset);
    const net=totalCashflowUntil(rec?rec.ts:null);
    const pure=asset-Number(state.settings.startAsset)-net;
    const n=document.getElementById('netCashflow'); if(n) n.textContent=yen(net);
    const p=document.getElementById('pureProfit'); if(p){p.textContent=(pure>=0?'+':'')+yen(pure);p.className=pure>0?'good':pure<0?'bad':'';}
    const start=parseDate(state.settings.startDate), now=todayDate();
    const elapsed=Math.max(0,tradingDaysBetween(start,now));
    const ahead=theoreticalDaysAdjusted(asset,rec?rec.ts:null)-elapsed;
    const ah=document.getElementById('aheadBehind');
    if(ah){ if(Math.abs(ahead)<0.05){ah.textContent='ほぼ予定通り';ah.className='';} else if(ahead>0){ah.textContent=Math.abs(ahead).toFixed(1)+'日早い';ah.className='good';} else{ah.textContent=Math.abs(ahead).toFixed(1)+'日遅れ';ah.className='bad';} }
    const st=document.getElementById('statusText');
    if(st && asset<state.settings.targetAsset){ if(ahead>0.05) st.textContent='🟢 計画より '+ahead.toFixed(1)+'日先行'; else if(ahead<-0.05) st.textContent='🔴 計画より '+Math.abs(ahead).toFixed(1)+'日遅れ'; else st.textContent='予定どおり進行中'; }
    enhanceHistory();
    renderProfitChart();
  };

  render();
  if(localStorage.getItem(TOKEN_KEY)) cloudSync(false);
})();
