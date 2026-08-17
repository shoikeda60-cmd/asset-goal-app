(() => {
  if (window.__assetMilestonesLoaded) return;
  window.__assetMilestonesLoaded = true;

  const style = document.createElement('style');
  style.textContent = `
    .mile-card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:16px;margin:12px 0;box-shadow:0 4px 18px rgba(0,0,0,.04)}
    .mile-head{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-bottom:12px}
    .mile-title{font-size:18px;font-weight:800;color:#111827}.mile-sub{font-size:12px;color:#6b7280}
    .mile-list{display:grid;gap:9px}.mile-row{border:1px solid #e5e7eb;border-radius:14px;padding:12px;background:#fff}
    .mile-row.next{border:2px solid #2563eb;background:#f8fbff;box-shadow:0 4px 14px rgba(37,99,235,.08)}
    .mile-row.done{background:#f0fdf4;border-color:#bbf7d0}
    .mile-top{display:flex;justify-content:space-between;align-items:center;gap:12px}.mile-target{font-weight:800;font-size:17px;color:#111827}
    .mile-days{font-weight:900;font-size:20px;color:#2563eb;white-space:nowrap}.mile-row.done .mile-days{color:#047857}
    .mile-meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:5px;font-size:12px;color:#6b7280}.mile-meta b{color:#374151}
    .mile-progress{height:7px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-top:9px}.mile-progress>span{display:block;height:100%;background:#2563eb;border-radius:999px}.mile-row.done .mile-progress>span{background:#10b981}
    @media(max-width:560px){.mile-card{padding:14px}.mile-target{font-size:16px}.mile-days{font-size:18px}}
  `;
  document.head.appendChild(style);

  const fmtYen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Math.round(n));
  const fmtDate = d => d.toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'});

  function getAsset(){
    try {
      const rec = state.records?.at(-1);
      return Number(rec ? rec.asset : state.settings.startAsset) || 0;
    } catch(e) { return 0; }
  }

  function daysFrom(asset,target){
    if(asset >= target) return 0;
    const r = Number(state.settings.dailyRate)/100;
    if(!(r > 0) || !(asset > 0)) return null;
    return Math.ceil(Math.log(target/asset)/Math.log(1+r));
  }

  function ensureCard(){
    if(document.getElementById('milestoneCard')) return document.getElementById('milestoneCard');
    const anchor = document.getElementById('daysLeft')?.closest('.card');
    if(!anchor) return null;
    const card = document.createElement('section');
    card.id = 'milestoneCard';
    card.className = 'mile-card';
    card.innerHTML = `<div class="mile-head"><div><div class="mile-title">10万円ごとの目標</div><div class="mile-sub">30万円から100万円まで</div></div><div class="mile-sub">取引日ベース</div></div><div id="milestoneList" class="mile-list"></div>`;
    anchor.insertAdjacentElement('beforebegin', card);
    return card;
  }

  function renderMilestones(){
    const card = ensureCard();
    if(!card) return;
    const list = document.getElementById('milestoneList');
    if(!list) return;
    const asset = getAsset();
    const targets = [];
    for(let t=300000;t<=1000000;t+=100000) targets.push(t);
    const nextTarget = targets.find(t=>asset<t) || null;
    list.innerHTML = targets.map(target=>{
      const done = asset >= target;
      const days = daysFrom(asset,target);
      const date = days==null ? null : addTradingDays(todayDate(),days);
      const remaining = Math.max(0,target-asset);
      const progress = Math.max(0,Math.min(100,asset/target*100));
      const cls = done ? 'done' : (target===nextTarget ? 'next' : '');
      const dayText = done ? '✅ 達成' : (days==null ? '—' : `あと${days}日`);
      const meta = done
        ? `<span>現在 <b>${fmtYen(asset)}</b></span>`
        : `<span>あと <b>${fmtYen(remaining)}</b></span><span>予想 <b>${date?fmtDate(date):'—'}</b></span>`;
      return `<div class="mile-row ${cls}"><div class="mile-top"><div class="mile-target">${Math.round(target/10000)}万円まで</div><div class="mile-days">${dayText}</div></div><div class="mile-meta">${meta}</div><div class="mile-progress"><span style="width:${progress.toFixed(1)}%"></span></div></div>`;
    }).join('');
  }

  function boot(){
    renderMilestones();
    setInterval(renderMilestones,1500);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
