(() => {
  if (window.__fxLiveFeedInstalled) return;
  window.__fxLiveFeedInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  let cache = null;
  let cacheAt = 0;

  window.__fxFeedState = { source: 'none', lastTs: 0, stale: false };

  const maxAgeMs = interval => ({
    '1m': 3 * 60 * 1000,
    '5m': 15 * 60 * 1000,
    '15m': 45 * 60 * 1000,
    '60m': 3 * 60 * 60 * 1000,
    '1d': 48 * 60 * 60 * 1000
  }[interval] || 15 * 60 * 1000);

  function latestYahooTimestamp(j) {
    const ts = j?.chart?.result?.[0]?.timestamp || [];
    return ts.length ? Number(ts[ts.length - 1]) * 1000 : 0;
  }

  async function validateYahooResponse(response, interval, source) {
    if (!response.ok) throw new Error(source + ' HTTP ' + response.status);
    const copy = response.clone();
    const j = await copy.json();
    const lastTs = latestYahooTimestamp(j);
    if (!lastTs) throw new Error(source + ' missing timestamp');
    const age = Date.now() - lastTs;
    if (age > maxAgeMs(interval)) {
      window.__fxFeedState = { source, lastTs, stale: true };
      throw new Error(source + ' stale ' + Math.round(age / 60000) + 'm');
    }
    window.__fxFeedState = { source, lastTs, stale: false };
    return response;
  }

  async function loadFeed() {
    const now = Date.now();
    if (cache && now - cacheAt < 15000) return cache;
    const r = await nativeFetch('./fx-live-series.json?v=' + now, { cache: 'no-store' });
    if (!r.ok) throw new Error('backup feed ' + r.status);
    const j = await r.json();
    if (!j?.series) throw new Error('bad backup feed');
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

    const u = new URL(url, location.href);
    const interval = u.searchParams.get('interval') || '1m';

    // Direct source first, but HTTP 200 alone is not enough: reject delayed quotes.
    try {
      const direct = await nativeFetch(input, { ...(init || {}), cache: 'no-store' });
      return await validateYahooResponse(direct, interval, 'direct');
    } catch (directError) {
      console.warn('Direct FX data unavailable or stale; checking backup', directError);
    }

    // Backup source is accepted only when it is fresh enough too.
    const feed = await loadFeed();
    const bars = feed.series?.[interval];
    if (!Array.isArray(bars) || bars.length < 20) throw new Error('missing backup interval ' + interval);
    const lastTs = Number(bars[bars.length - 1]?.[0] || 0);
    const age = Date.now() - lastTs;
    if (!lastTs || age > maxAgeMs(interval)) {
      window.__fxFeedState = { source: 'backup', lastTs, stale: true };
      throw new Error('backup FX data stale ' + Math.round(age / 60000) + 'm');
    }

    window.__fxFeedState = { source: 'backup', lastTs, stale: false };
    return new Response(JSON.stringify(syntheticYahoo(bars)), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-FX-Source': 'backup' }
    });
  };
})();
