(() => {
  if (window.__fx3PipExecutionLoaded) return;
  window.__fx3PipExecutionLoaded = true;

  const EXECUTION_TARGET_PIPS = 3.0;
  const HOLDOUT_2026_TARGET_HIT = 88.61;
  const HOLDOUT_2026_FIRST_TOUCH = 66.37;
  let bridgeModel = null;
  let bridgeLoading = false;

  const NOTE_TEXT = `判定は15分ごとの確定ポイントで更新します。シグナル生成には従来の47特徴・2段階モデル（5.19pip基準）をそのまま使用し、実運用の利確目安だけを3.0pipに設定しています。「3pip到達確率（ライブ）」は現在の5.19pip到達モデルと方向確信度を使い、6月で校正した3pip専用モデルでリアルタイム推定します。「3pip到達率（検証）」${HOLDOUT_2026_TARGET_HIT.toFixed(2)}% は2026年7月1日〜8月14日の未使用検証562シグナルで予測方向へ3pip届いた過去実績です。逆方向3pipより先に届いた割合は ${HOLDOUT_2026_FIRST_TOUCH.toFixed(2)}%。将来の成績を保証するものではありません。`;

  const sigmoid = x => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, x))));

  function setTextIfNeeded(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  async function loadBridgeModel() {
    if (bridgeModel || bridgeLoading) return;
    bridgeLoading = true;
    try {
      const r = await fetch('./fx-model-3pip-bridge.json?v=26', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const m = await r.json();
      if (!Array.isArray(m.mean) || !Array.isArray(m.scale) || !Array.isArray(m.coef) || !m.calibration) throw new Error('bad 3pip bridge');
      bridgeModel = m;
    } catch (e) {
      console.warn('3pip bridge model', e);
    } finally {
      bridgeLoading = false;
    }
  }

  function ensureCards(panel) {
    const grid = panel.querySelector('.fxa-grid');
    if (!grid) return;

    let liveCard = document.getElementById('fxa3PipLiveCard');
    if (!liveCard) {
      liveCard = document.createElement('div');
      liveCard.id = 'fxa3PipLiveCard';
      liveCard.className = 'fxa-card';
      liveCard.innerHTML = '<div class="fxa-label">3pip到達確率（ライブ）</div><div class="fxa-value neutral" id="fxa3PipLive">--%</div>';
      const reachCard = document.getElementById('fxaReach')?.closest('.fxa-card');
      if (reachCard) grid.insertBefore(liveCard, reachCard);
      else grid.appendChild(liveCard);
    }

    let validationCard = document.getElementById('fxa3PipValidationCard');
    if (!validationCard) {
      validationCard = document.createElement('div');
      validationCard.id = 'fxa3PipValidationCard';
      validationCard.className = 'fxa-card';
      validationCard.innerHTML = `<div class="fxa-label">3pip到達率（検証）</div><div class="fxa-value good" id="fxa3PipValidation">${HOLDOUT_2026_TARGET_HIT.toFixed(2)}%</div>`;
      if (liveCard.nextSibling) grid.insertBefore(validationCard, liveCard.nextSibling);
      else grid.appendChild(validationCard);
    }
    setTextIfNeeded(document.getElementById('fxa3PipValidation'), `${HOLDOUT_2026_TARGET_HIT.toFixed(2)}%`);
  }

  function readPct(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = parseFloat(String(el.textContent).replace('%', ''));
    return Number.isFinite(v) ? v / 100 : null;
  }

  function calc3PipLive() {
    if (!bridgeModel) return null;
    const reach5 = readPct('fxaReach');
    const dirConf = readPct('fxaDirConf');
    if (reach5 == null || dirConf == null) return null;

    const x = [reach5, dirConf, reach5 * dirConf];
    let z = Number(bridgeModel.intercept || 0);
    for (let i = 0; i < x.length; i++) {
      z += ((x[i] - bridgeModel.mean[i]) / (bridgeModel.scale[i] || 1)) * bridgeModel.coef[i];
    }
    const raw = sigmoid(z);
    const p = Math.min(1 - 1e-6, Math.max(1e-6, raw));
    const logit = Math.log(p / (1 - p));
    return sigmoid(bridgeModel.calibration.coef * logit + bridgeModel.calibration.intercept);
  }

  function render3PipLive() {
    const el = document.getElementById('fxa3PipLive');
    if (!el) return;
    const p = calc3PipLive();
    if (p == null) {
      setTextIfNeeded(el, '--%');
      return;
    }
    setTextIfNeeded(el, `${Math.round(p * 100)}%`);
    el.classList.remove('good', 'neutral', 'bad');
    el.classList.add(p >= 0.7 ? 'good' : p >= 0.5 ? 'neutral' : 'bad');
  }

  function apply3PipMode() {
    const panel = document.getElementById('fxAnalysisPanel');
    if (!panel) return false;

    setTextIfNeeded(document.getElementById('fxaTarget'), `${EXECUTION_TARGET_PIPS.toFixed(1)} pips`);
    ensureCards(panel);

    panel.querySelectorAll('.fxa-label').forEach(label => {
      if (label.textContent.includes('本日の目標相当')) {
        setTextIfNeeded(label, '実運用の利確目安');
      } else if (label.textContent.includes('30分以内の到達しやすさ') || label.textContent.includes('シグナル強度（5.19pip学習基準）')) {
        setTextIfNeeded(label, '約5pip到達確率（5.19pipモデル）');
      }
    });

    render3PipLive();
    setTextIfNeeded(panel.querySelector('.fxa-note'), NOTE_TEXT);

    const reasons = document.getElementById('fxaReasons');
    if (reasons && !reasons.querySelector('[data-fx3pip]')) {
      const chip = document.createElement('span');
      chip.className = 'fxa-chip up';
      chip.dataset.fx3pip = '1';
      chip.textContent = `利確目安 ${EXECUTION_TARGET_PIPS.toFixed(1)}pip`;
      reasons.appendChild(chip);
    }

    return true;
  }

  function start() {
    loadBridgeModel();
    if (!apply3PipMode()) {
      setTimeout(start, 250);
      return;
    }
    setInterval(() => {
      if (!bridgeModel) loadBridgeModel();
      apply3PipMode();
    }, 2000);
  }

  start();
})();