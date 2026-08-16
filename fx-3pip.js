(() => {
  if (window.__fx3PipExecutionLoaded) return;
  window.__fx3PipExecutionLoaded = true;

  const EXECUTION_TARGET_PIPS = 3.0;
  const HOLDOUT_2026_TARGET_HIT = 88.61;
  const HOLDOUT_2026_FIRST_TOUCH = 66.37;
  const NOTE_TEXT = `判定は15分ごとの確定ポイントで更新します。シグナル生成には従来の47特徴・2段階モデル（5.19pip基準）をそのまま使用し、実運用の利確目安だけを3.0pipに設定しています。3pip欄は2026年7月1日〜8月14日の未使用検証562シグナルでの到達率 ${HOLDOUT_2026_TARGET_HIT.toFixed(2)}% を表示し、約5pip欄は現在の5.19pip学習モデルが出すライブ確率を表示します。逆方向3pipより先に到達した割合は ${HOLDOUT_2026_FIRST_TOUCH.toFixed(2)}%。将来の成績を保証するものではありません。`;

  function setTextIfNeeded(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function ensure3PipCard(panel) {
    const grid = panel.querySelector('.fxa-grid');
    if (!grid) return;
    let card = document.getElementById('fxa3PipValidationCard');
    if (!card) {
      card = document.createElement('div');
      card.id = 'fxa3PipValidationCard';
      card.className = 'fxa-card';
      card.innerHTML = `<div class="fxa-label">3pip到達率（検証）</div><div class="fxa-value good" id="fxa3PipValidation">${HOLDOUT_2026_TARGET_HIT.toFixed(2)}%</div>`;
      const reachCard = document.getElementById('fxaReach')?.closest('.fxa-card');
      if (reachCard) grid.insertBefore(card, reachCard);
      else grid.appendChild(card);
    }
    setTextIfNeeded(document.getElementById('fxa3PipValidation'), `${HOLDOUT_2026_TARGET_HIT.toFixed(2)}%`);
  }

  function apply3PipMode() {
    const panel = document.getElementById('fxAnalysisPanel');
    if (!panel) return false;

    setTextIfNeeded(document.getElementById('fxaTarget'), `${EXECUTION_TARGET_PIPS.toFixed(1)} pips`);
    ensure3PipCard(panel);

    panel.querySelectorAll('.fxa-label').forEach(label => {
      if (label.textContent.includes('本日の目標相当')) {
        setTextIfNeeded(label, '実運用の利確目安');
      } else if (label.textContent.includes('30分以内の到達しやすさ') || label.textContent.includes('シグナル強度（5.19pip学習基準）')) {
        setTextIfNeeded(label, '約5pip到達確率（5.19pipモデル）');
      }
    });

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
    if (!apply3PipMode()) {
      setTimeout(start, 250);
      return;
    }

    // Avoid MutationObserver here: changing panel text from inside the observer
    // can trigger itself repeatedly and freeze the FX chart tab.
    setInterval(apply3PipMode, 2000);
  }

  start();
})();