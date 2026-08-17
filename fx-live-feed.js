(() => {
  if (window.__fxLiveFeedInstalled) return;
  window.__fxLiveFeedInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  let cache = null;
  let cacheAt = 0;

  async function loadFeed() {
    const now = Date.now();
    if (cache && now - cacheAt < 30000) return cache;
    const r = await nativeFetch('./fx-live-series.json?v=' + Math.floor(now / 30000), { cache: 'no-store' });
    if (!r.ok) throw new Error('live feed ' + r.status);
    const j = await r.json();
    if (!j?.series) throw new Error('bad live feed');
    cache = j;
    cacheAt = now;
    return j;
  }

  function syntheticYahoo(bars) {
    return {
      chart: {
        result: [{
          timestamp: bars.map(x => Math.floor(x[0] / 1000)),
          indicators: {
            quote: [{
              open: bars.map(x => x[1]),
              high: bars.map(x => x[2]),
              low: bars.map(x => x[3]),
              close: bars.map(x => x[4])
            }]
          }
        }],
        error: null
      }
    };
  }

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.includes('/v8/finance/chart/JPY=X')) {
      return nativeFetch(input, init);
    }

    try {
      const u = new URL(url, location.href);
      const interval = u.searchParams.get('interval');
      const feed = await loadFeed();
      const bars = feed.series?.[interval];
      if (!Array.isArray(bars) || bars.length < 20) throw new Error('missing interval ' + interval);
      return new Response(JSON.stringify(syntheticYahoo(bars)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.warn('FX live feed fallback to direct Yahoo', e);
      return nativeFetch(input, init);
    }
  };
})();
