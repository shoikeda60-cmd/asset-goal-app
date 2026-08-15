(() => {
  if(!window.AssetGoalTabs || document.getElementById('fxModernPage')) return;
  const style=document.createElement('style');
  style.textContent=`
    #fxModernPage{background:linear-gradient(180deg,#07111f,#0f172a);min-height:100vh;color:#f8fafc}
    .modern-shell{padding:18px 14px 24px}
    .modern-hero{background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:18px;box-shadow:0 18px 40px rgba(0,0,0,.25)}
    .modern-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.modern-title{font-size:26px;font-weight:900}.modern-sub{font-size:12px;color:#94a3b8;margin-top:4px}
    .modern-live{display:inline-flex;align-items:center;gap:6px;background:rgba(16,185,129,.12);color:#6ee7b7;border:1px solid rgba(16,185,129,.28);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800}.modern-dot{width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 12px #10b981}
    .modern-periods{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.modern-periods button{border:1px solid #334155;background:#111827;color:#94a3b8;border-radius:12px;padding:10px 4px;font-weight:900}.modern-periods button.active{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 8px 20px rgba(37,99,235,.28)}
    .modern-chart-card{background:#0b1220;border:1px solid rgba(148,163,184,.16);border-radius:22px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.22)}
    .modern-chart-head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.12)}.modern-chip{font-size:11px;color:#cbd5e1;background:#172033;border:1px solid #2a3852;border-radius:999px;padding:5px 8px}
    .modern-chart{height:610px}.modern-note{font-size:12px;color:#94a3b8;line-height:1.6;margin:12px 4px 0}
    @media(max-width:560px){.modern-chart{height:560px}.modern-title{font-size:23px}}
  `;
  document.head.appendChild(style);

  const page=document.createElement('section');page.id='fxModernPage';
  page.innerHTML=`<div class="modern-shell">
    <div class="modern-hero"><div class="modern-row"><div><div class="modern-title">USD / JPY</div><div class="modern-sub">ドル円・リアルタイムチャート</div></div><div class="modern-live"><span class="modern-dot"></span>LIVE</div></div>
      <div class="modern-periods" id="modernPeriods"><button data-i="1">1分</button><button data-i="5">5分</button><button data-i="15" class="active">15分</button><button data-i="60">1時間</button></div>
    </div>
    <div class="modern-chart-card"><div class="modern-chart-head"><b id="modernIntervalLabel">15分足</b><span class="modern-chip">FX:USDJPY</span></div><div class="modern-chart" id="modernChart"></div></div>
    <div class="modern-note">見やすさ重視の改良版。ローソク足、移動平均、ボリンジャーバンドを同じ画面で確認できます。配信レートはTradingView由来です。</div>
  </div>`;

  let interval='15',loaded='';
  function load(){
    if(loaded===interval) return; loaded=interval;
    const host=document.getElementById('modernChart');if(!host)return;host.innerHTML='';
    const wrap=document.createElement('div');wrap.className='tradingview-widget-container';wrap.style.cssText='height:100%;width:100%';
    const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';widget.style.cssText='height:100%;width:100%';wrap.appendChild(widget);host.appendChild(wrap);
    const s=document.createElement('script');s.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';s.async=true;s.textContent=JSON.stringify({autosize:true,symbol:'FX:USDJPY',interval,timezone:'Asia/Tokyo',theme:'dark',style:'1',locale:'ja',backgroundColor:'#0b1220',gridColor:'rgba(148,163,184,0.13)',hide_top_toolbar:false,hide_side_toolbar:true,hide_legend:false,hide_volume:true,allow_symbol_change:false,save_image:false,withdateranges:true,calendar:false,studies:['STD;Bollinger_Bands','STD;Moving_Average']});wrap.appendChild(s);
  }
  const labels={'1':'1分足','5':'5分足','15':'15分足','60':'1時間足'};
  page.querySelectorAll('#modernPeriods button').forEach(b=>b.onclick=()=>{interval=b.dataset.i;document.getElementById('modernIntervalLabel').textContent=labels[interval];page.querySelectorAll('#modernPeriods button').forEach(x=>x.classList.toggle('active',x===b));loaded='';load();});
  window.AssetGoalTabs.register({id:'modern',label:'改良版',element:page,onShow:load});
})();