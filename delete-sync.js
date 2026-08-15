(() => {
  if (window.__assetGoalDeleteSyncLoaded) return;
  window.__assetGoalDeleteSyncLoaded = true;

  if (!Array.isArray(state.deletedRecords)) state.deletedRecords = [];

  const recordKey = r => `${String(r?.ts||'')}|${Number(r?.asset)}`;
  const tombstoneKey = t => `${String(t?.ts||'')}|${Number(t?.asset)}`;

  function mergeTombstones(a,b){
    const m=new Map();
    [...(a||[]),...(b||[])].forEach(t=>{
      if(!t || !t.ts || !Number.isFinite(Number(t.asset))) return;
      const k=tombstoneKey(t);
      const prev=m.get(k);
      if(!prev || new Date(t.deletedAt||0)>new Date(prev.deletedAt||0)){
        m.set(k,{ts:t.ts,asset:Number(t.asset),deletedAt:t.deletedAt||new Date().toISOString()});
      }
    });
    return [...m.values()];
  }

  function filterDeleted(records,tombs=state.deletedRecords){
    const dead=new Set((tombs||[]).map(tombstoneKey));
    return (records||[]).filter(r=>!dead.has(recordKey(r)));
  }

  function mergeRecordsWithDeletes(a,b,tombs=state.deletedRecords){
    const m=new Map();
    [...(a||[]),...(b||[])].forEach(r=>{
      if(!r || !r.ts || !Number.isFinite(Number(r.asset))) return;
      m.set(recordKey(r),{ts:r.ts,asset:Number(r.asset)});
    });
    return filterDeleted([...m.values()].sort((x,y)=>new Date(x.ts)-new Date(y.ts)),tombs);
  }

  // If an earlier sync in this page load re-added deleted items, remove them again immediately.
  state.records=filterDeleted(state.records);
  save();

  // Capture delete clicks before the original click handler splices the record.
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('button[data-i]');
    if(!btn) return;
    const idx=Number(btn.dataset.i);
    const rec=state.records[idx];
    if(!rec) return;
    state.deletedRecords=mergeTombstones(state.deletedRecords,[{
      ts:rec.ts,
      asset:Number(rec.asset),
      deletedAt:new Date().toISOString()
    }]);
    save();
    // Original handler runs after this and removes the local record.
    setTimeout(()=>cloudSync(false),0);
  },true);

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
        try{remote=JSON.parse(b64ToUtf8(obj.content||''));}catch(e){remote=null;}
      }else if(getRes.status!==404){
        throw new Error(`読み込みエラー ${getRes.status}`);
      }

      state.deletedRecords=mergeTombstones(
        state.deletedRecords,
        remote && Array.isArray(remote.deletedRecords) ? remote.deletedRecords : []
      );

      if(remote && Array.isArray(remote.records)){
        state.records=mergeRecordsWithDeletes(state.records,remote.records,state.deletedRecords);
      }else{
        state.records=filterDeleted(state.records,state.deletedRecords);
      }

      const cf=new Map();
      [...(state.cashflows||[]),...(remote&&Array.isArray(remote.cashflows)?remote.cashflows:[])].forEach(c=>{
        if(!c||!c.ts||!c.type||!Number.isFinite(Number(c.amount))) return;
        cf.set(`${c.ts}|${c.type}|${c.amount}`,{ts:c.ts,type:c.type,amount:Number(c.amount)});
      });
      state.cashflows=[...cf.values()].sort((a,b)=>new Date(a.ts)-new Date(b.ts));
      save();
      render();

      const payload={
        version:3,
        updatedAt:new Date().toISOString(),
        settings:state.settings,
        records:state.records,
        cashflows:state.cashflows||[],
        deletedRecords:state.deletedRecords||[]
      };
      const body={
        message:'Sync asset goal data with deletions',
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
      if(showAlert) alert('クラウド同期できました。');
      return true;
    }catch(e){
      console.error(e);
      setSyncStatus('同期失敗：'+e.message,'bad');
      if(showAlert) alert('同期できませんでした');
      return false;
    }
  };

  // Run once with the deletion-aware sync so cloud data is normalized to schema v3.
  if(localStorage.getItem(TOKEN_KEY)) cloudSync(false);
})();