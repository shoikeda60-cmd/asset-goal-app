(() => {
  // 既存記録・設定は assetGoalTrackerV1 をそのまま利用する。
  if (!Array.isArray(state.cashflows)) state.cashflows = [];

  const oldSave = save;
  save = function(){
    oldSave();
  };

  function totalCashflowUntil(ts=null){
    return (state.cashflows||[]).reduce((sum,c)=>{
      if(ts && new Date(c.ts)>new Date(ts)) return sum;
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

  // 過去記録に「ちょうど+10万円」があれば、今回の既知の追加入金として一度だけ移行。
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

  // 入出金UIを追加。
  const inputCard=document.getElementById('assetInput')?.closest('.card');
  if(inputCard && !document.getElementById('cashflowInput')){
    const box=document.createElement('div');
    box.style.cssText='margin-top:16px;padding-top:14px;border-top:1px solid var(--line)';
    box.innerHTML=`
      <div class="label">入出金を記録（利益には含めません）</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
        <input id="cashflowInput" type="number" inputmode="numeric" min="1" step="1" placeholder="金額">
        <select id="cashflowType" style="width:100%;padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff;font-size:16px">
          <option value="deposit">入金</option>
          <option value="withdrawal">出金</option>
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
      save();
      document.getElementById('cashflowInput').value='';
      render();
      cloudSync(false);
    };
  }

  // 純利益などの表示欄を追加。
  const metric=document.querySelector('.metric');
  if(metric && !document.getElementById('netCashflow')){
    const a=document.createElement('div');
    a.innerHTML='<span class="label">累計入出金</span><b id="netCashflow">¥0</b>';
    metric.appendChild(a);
    const b=document.createElement('div');
    b.innerHTML='<span class="label">純利益</span><b id="pureProfit">¥0</b>';
    metric.appendChild(b);
  }

  // クラウド同期を入出金対応版に差し替え。
  cloudSync = async function(showAlert=false){
    const token=localStorage.getItem(TOKEN_KEY);
    if(!token){
      setSyncStatus('トークン未設定');
      if(showAlert) alert('まずGitHubトークンを保存してください');
      return false;
    }
    setSyncStatus('同期中…');
    const url=`${GH_API}/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
    const headers={
      'Accept':'application/vnd.github+json',
      'Authorization':`Bearer ${token}`,
      'X-GitHub-Api-Version':'2026-03-10'
    };
    try{
      let remote=null,sha=null;
      const getRes=await fetch(url,{headers});
      if(getRes.ok){
        const obj=await getRes.json();
        sha=obj.sha||null;
        try{remote=JSON.parse(b64ToUtf8(obj.content||''));}catch(e){}
      }else if(getRes.status!==404){
        throw new Error(`読み込みエラー ${getRes.status}`);
      }

      if(remote && Array.isArray(remote.records)){
        state.records=mergeRecords(state.records,remote.records);
        const merged=new Map();
        [...(state.cashflows||[]),...(Array.isArray(remote.cashflows)?remote.cashflows:[])].forEach(c=>{
          if(!c||!c.ts||!c.type||!Number.isFinite(Number(c.amount))) return;
          merged.set(`${c.ts}|${c.type}|${c.amount}`,{ts:c.ts,type:c.type,amount:Number(c.amount)});
        });
        state.cashflows=[...merged.values()].sort((a,b)=>new Date(a.ts)-new Date(b.ts));
        save();
      }

      const payload={
        version:2,
        updatedAt:new Date().toISOString(),
        settings:state.settings,
        records:state.records,
        cashflows:state.cashflows||[]
      };
      const body={
        message:'Sync asset goal data',
        content:utf8ToB64(JSON.stringify(payload,null,2)),
        branch:'main'
      };
      if(sha) body.sha=sha;
      const putRes=await fetch(url,{
        method:'PUT',
        headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      if(!putRes.ok) throw new Error(`保存エラー ${putRes.status}`);
      setSyncStatus(`同期済み：${new Date().toLocaleString('ja-JP')}`,'good');
      if(showAlert) alert('クラウド同期できました。入出金も分けて保存しています。');
      render();
      return true;
    }catch(e){
      console.error(e);
      setSyncStatus('同期失敗：'+e.message,'bad');
      if(showAlert) alert('同期できませんでした');
      return false;
    }
  };

  // 既存renderに「追加入金を利益扱いしない」表示補正を追加。
  const oldRender=render;
  render=function(){
    oldRender();
    const rec=latest();
    const asset=rec?Number(rec.asset):Number(state.settings.startAsset);
    const net=totalCashflowUntil(rec?rec.ts:null);
    const pure=asset-Number(state.settings.startAsset)-net;

    const n=document.getElementById('netCashflow');
    if(n) n.textContent=yen(net);
    const p=document.getElementById('pureProfit');
    if(p){
      p.textContent=(pure>=0?'+':'')+yen(pure);
      p.className=pure>0?'good':pure<0?'bad':'';
    }

    // 計画との差を、追加入金を除いた運用成果で再計算。
    const start=parseDate(state.settings.startDate);
    const now=todayDate();
    const elapsed=Math.max(0,tradingDaysBetween(start,now));
    const achieved=theoreticalDaysAdjusted(asset,rec?rec.ts:null);
    const ahead=achieved-elapsed;
    const ah=document.getElementById('aheadBehind');
    if(ah){
      if(Math.abs(ahead)<0.05){ah.textContent='ほぼ予定通り';ah.className='';}
      else if(ahead>0){ah.textContent=Math.abs(ahead).toFixed(1)+'日早い';ah.className='good';}
      else{ah.textContent=Math.abs(ahead).toFixed(1)+'日遅れ';ah.className='bad';}
    }
    const st=document.getElementById('statusText');
    if(st && asset<state.settings.targetAsset){
      if(ahead>0.05) st.textContent='🟢 計画より '+ahead.toFixed(1)+'日先行';
      else if(ahead<-0.05) st.textContent='🔴 計画より '+Math.abs(ahead).toFixed(1)+'日遅れ';
      else st.textContent='予定どおり進行中';
    }

    // 履歴の先頭に入出金履歴を表示。
    const h=document.getElementById('history');
    if(h && state.cashflows.length && !h.querySelector('[data-cashflow-section]')){
      const wrap=document.createElement('div');
      wrap.dataset.cashflowSection='1';
      wrap.innerHTML='<div class="tiny" style="margin:6px 0">入出金</div>';
      [...state.cashflows].reverse().forEach(c=>{
        const d=new Date(c.ts);
        const row=document.createElement('div');
        row.className='hist';
        row.style.marginBottom='8px';
        row.innerHTML=`<div><b>${c.type==='withdrawal'?'出金':'入金'} ${c.type==='withdrawal'?'-':'+'}${yen(c.amount)}</b><br><small>${d.toLocaleString('ja-JP')}</small></div>`;
        wrap.appendChild(row);
      });
      h.prepend(wrap);
    }
  };

  render();
  // 移行した10万円入金をクラウドにも反映。
  if(localStorage.getItem(TOKEN_KEY)) cloudSync(false);
})();
