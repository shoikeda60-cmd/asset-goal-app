(() => {
  if(!window.AssetGoalTabs || document.getElementById('fxSbiPage')) return;
  const style=document.createElement('style');
  style.textContent=`
    #fxSbiPage{background:#0b1530;color:#e5e7eb;min-height:100vh}
    .sbi-shell{padding:16px 0 0}
    .sbi-top{padding:14px 16px 10px;background:linear-gradient(180deg,#36415c,#25304a);border-bottom:1px solid rgba(255,255,255,.08)}
    .sbi-pair{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .sbi-symbol{font-size:25px;font-weight:900;letter-spacing:.2px}.sbi-time{font-size:13px;color:#d1d5db}
    .sbi-flags{font-size:22px;margin-right:8px}.sbi-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;font-size:13px}
    .sbi-meta span{color:#94a3b8}.sbi-meta b{display:block;color:#fff;font-size:15px;margin-top:2px}
    .sbi-toolbar{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 12px;background:#111b36;border-bottom:1px solid rgba(255,255,255,.08)}
    .sbi-toolbar button{border:0;border-radius:18px;background:#33415f;color:#dbeafe;padding:9px 4px;font-weight:900}.sbi-toolbar button.active{background:#f3f4f6;color:#111827}
    .sbi-chart{height:610px;background:#0b1530;overflow:hidden}
    .sbi-foot{padding:10px 14px 16px;color:#94a3b8;font-size:12px;line-height:1.55;background:#0b1530}
    .sbi-badges{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.sbi-badge{padding:5px 9px;border-radius:999px;background:#172441;border:1px solid #2a3b60;color:#cbd5e1}
    @media(max-width:560px){.sbi-chart{height:560px}.sbi-symbol{font-size:22px}.sbi-meta{font-size:12px}}
  `;
  document.head.appendChild(style);

  const page=document.createElement('section'); page.id='fxSbiPage';
  page.innerHTML=`<div class="sbi-shell">
    <div class="sbi-top">
      <div class="sbi-pair"><div class="sbi-symbol"><span class="sbi-flags">🇺🇸🇯🇵</span>USD/JPY</div><div class="sbi-time" id="sbiClock">--:--:--</div></div>
      <div class="sbi-meta"><div><span>高</span><b>チャート内表示</b></div><div><span>安</span><b>チャート内表示</b></div><div><span>始</span><b>TradingView</b></div><div><span>終</span><b>リアルタイム</b></div></div>
    </div>
    <div class="sbi-toolbar" id="sbiPeriods"><button data-i="1">1分</button><button data-i="5">5分</button><button data-i="15" class="active">15分</button><button data-i="60">1時間</button></div>
    <div class="sbi-chart" id="sbiChart"></div>
    <div class="sbi-foot"><div class="sbi-badges"><span class="sbi-badge">ローソク足</span><span class="sbi-badge">MA</span><span class="sbi-badge">ボリンジャーバンド</span></div>SBI FXトレード風のダークデザインです。価格データ自体はTradingView配信で、SBI FXトレードの提示Bid/Askとは一致しない場合があります。</div>
  </div>`;

  let interval='15',loaded='';
  function clock(){const e=document.getElementById('sbiClock');if(e)e.textContent=new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});} setInterval(clock,1000);clock();
  function load(){
    if(loaded===interval) return; loaded=interval;
    const host=document.getElementById('sbiChart'); if(!host) return; host.innerHTML='';
    const wrap=document.createElement('div');wrap.className='tradingview-widget-container';wrap.style.cssText='height:100%;width:100%';
    const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';widget.style.cssText='height:100%;width:100%';wrap.appendChild(widget);host.appendChild(wrap);
    const s=document.createElement('script');s.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';s.async=true;s.textContent=JSON.stringify({autosize:true,symbol:'FX:USDJPY',interval,timezone:'Asia/Tokyo',theme:'dark',style:'1',locale:'ja',backgroundColor:'#0b1530',gridColor:'rgba(148,163,184,0.18)',hide_top_toolbar:true,hide_side_toolbar:true,hide_legend:false,hide_volume:true,allow_symbol_change:false,save_image:false,withdateranges:false,calendar:false,studies:['STD;Bollinger_Bands','STD;Moving_Average']});wrap.appendChild(s);
  }
  page.querySelectorAll('#sbiPeriods button').forEach(b=>b.onclick=()=>{interval=b.dataset.i;page.querySelectorAll('#sbiPeriods button').forEach(x=>x.classList.toggle('active',x===b));loaded='';load();});
  window.AssetGoalTabs.register({id:'sbi',label:'SBI風',element:page,onShow:load});
})();