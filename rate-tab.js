(() => {
  if (document.getElementById('fxRatePage')) return;

  const style = document.createElement('style');
  style.textContent = `
    body{padding-bottom:72px}
    #appTabBar{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-top:1px solid #e5e7eb;padding:8px 14px calc(8px + env(safe-area-inset-bottom));display:flex;justify-content:center}
    #appTabBar .tab-inner{width:min(732px,100%);display:grid;grid-template-columns:1fr 1fr;gap:8px}
    #appTabBar button{padding:10px 12px;border-radius:12px;background:#f3f4f6;color:#4b5563;border:0;font-weight:800}
    #appTabBar button.active{background:#2563eb;color:#fff}
    #fxRatePage{max-width:760px;margin:0 auto;padding:18px 14px 90px;color:#111827}
    #fxRatePage[hidden]{display:none!important}
    .fx-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:4px 0 14px}
    .fx-title{font-size:24px;font-weight:800;letter-spacing:-.3px}
    .fx-sub{font-size:12px;color:#6b7280;margin-top:4px}
    .fx-card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:14px;margin:12px 0;box-shadow:0 4px 18px rgba(0,0,0,.04)}
    .fx-periods{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:12px}
    .fx-periods button{padding:9px 4px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;color:#4b5563;font-weight:800}
    .fx-periods button.active{background:#111827;color:#fff;border-color:#111827}
    .fx-chart-wrap{height:480px;min-height:420px;border-radius:14px;overflow:hidden;background:#fff}
    .fx-widget{height:100%;width:100%}
    .fx-note{font-size:12px;line-height:1.55;color:#6b7280;margin:10px 2px 0}
    .fx-source{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:#6b7280;margin-top:8px}
    @media(max-width:560px){
      .fx-chart-wrap{height:440px;min-height:400px}
      .fx-head{align-items:flex-start;flex-direction:column}
    }
  `;
  document.head.appendChild(style);

  const home = document.querySelector('.wrap');
  if (!home) return;

  const ratePage = document.createElement('section');
  ratePage.id = 'fxRatePage';
  ratePage.hidden = true;
  ratePage.innerHTML = `
    <div class="fx-head">
      <div>
        <div class="fx-title">USD/JPY</div>
        <div class="fx-sub">ドル円・ローソク足チャート</div>
      </div>
      <span class="label">TradingView</span>
    </div>

    <div class="fx-card" style="padding:10px 12px">
      <div id="fxTicker"></div>
    </div>

    <div class="fx-card">
      <div class="fx-periods" id="fxPeriods" aria-label="時間足切り替え">
        <button type="button" data-interval="1" class="active">1分</button>
        <button type="button" data-interval="5">5分</button>
        <button type="button" data-interval="15">15分</button>
        <button type="button" data-interval="60">1時間</button>
      </div>
      <div class="fx-chart-wrap"><div id="fxChart" class="fx-widget"></div></div>
      <div class="fx-source"><span id="fxIntervalLabel">1分足</span><span>FX:USDJPY</span></div>
      <div class="fx-note">表示レートはTradingViewの配信データです。SBI FXトレードで実際に提示されるBid / Askや約定価格とは一致しない場合があります。</div>
    </div>
  `;
  home.insertAdjacentElement('afterend', ratePage);

  const tabBar = document.createElement('nav');
  tabBar.id = 'appTabBar';
  tabBar.setAttribute('aria-label', 'アプリタブ');
  tabBar.innerHTML = `<div class="tab-inner"><button type="button" data-tab="home" class="active">ホーム</button><button type="button" data-tab="rate">ドル円</button></div>`;
  document.body.appendChild(tabBar);

  let currentInterval = '1';
  let chartLoadedFor = null;

  function addSingleTicker(){
    const host = document.getElementById('fxTicker');
    if (!host || host.dataset.loaded === '1') return;
    host.dataset.loaded = '1';
    const loaderId = 'tvSingleTickerLoader';
    if (!document.getElementById(loaderId)) {
      const loader = document.createElement('script');
      loader.id = loaderId;
      loader.type = 'module';
      loader.src = 'https://widgets.tradingview-widget.com/w/en/tv-single-ticker.js';
      document.head.appendChild(loader);
    }
    const ticker = document.createElement('tv-single-ticker');
    ticker.setAttribute('symbol', 'FX:USDJPY');
    ticker.setAttribute('locale', 'ja');
    host.appendChild(ticker);
  }

  function loadChart(interval){
    const host = document.getElementById('fxChart');
    if (!host || chartLoadedFor === interval) return;
    chartLoadedFor = interval;
    host.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'tradingview-widget-container';
    container.style.cssText = 'height:100%;width:100%';
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.cssText = 'height:100%;width:100%';
    container.appendChild(widget);
    host.appendChild(container);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: 'FX:USDJPY',
      interval,
      timezone: 'Asia/Tokyo',
      theme: 'light',
      style: '1',
      locale: 'ja',
      backgroundColor: '#ffffff',
      gridColor: 'rgba(46,46,46,0.06)',
      hide_top_toolbar: true,
      hide_side_toolbar: true,
      hide_legend: false,
      hide_volume: true,
      allow_symbol_change: false,
      save_image: false,
      withdateranges: false,
      calendar: false,
      details: false,
      hotlist: false,
      watchlist: [],
      compareSymbols: [],
      studies: []
    });
    container.appendChild(script);
  }

  function setTab(tab){
    const isRate = tab === 'rate';
    home.hidden = isRate;
    ratePage.hidden = !isRate;
    tabBar.querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (isRate) {
      addSingleTicker();
      loadChart(currentInterval);
      window.scrollTo({top:0,behavior:'instant'});
    } else {
      window.scrollTo({top:0,behavior:'instant'});
    }
  }

  tabBar.querySelectorAll('button[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  document.getElementById('fxPeriods').querySelectorAll('button[data-interval]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentInterval = btn.dataset.interval;
      document.querySelectorAll('#fxPeriods button').forEach(b => b.classList.toggle('active', b === btn));
      const labelMap = {'1':'1分足','5':'5分足','15':'15分足','60':'1時間足'};
      document.getElementById('fxIntervalLabel').textContent = labelMap[currentInterval];
      chartLoadedFor = null;
      loadChart(currentInterval);
    });
  });
})();