(() => {
  if (window.__fx3PipExecutionLoaded) return;
  window.__fx3PipExecutionLoaded = true;

  const EXECUTION_TARGET_PIPS = 3.0;
  const HOLDOUT_2026_TARGET_HIT = 88.61;
  const HOLDOUT_2026_FIRST_TOUCH = 66.37;

  function apply3PipMode() {
    const panel = document.getElementById('fxAnalysisPanel');
    if (!panel) return false;

    const target = document.getElementById('fxaTarget');
    if (target) target.textContent = `${EXECUTION_TARGET_PIPS.toFixed(1)} pips`;

    const labels = panel.querySelectorAll('.fxa-label');
    labels.forEach(label => {
      if (label.textContent.includes('本日の目標相当')) {
        label.textContent = '実運用の利確目安';
      }
      if (label.textContent.includes('30分以内の到達しやすさ')) {
        label.textContent = 'シグナル強度（5.19pip学習基準）';
      }
    });

    const note = panel.querySelector('.fxa-note');
    if (note) {
      note.textContent = `判定は15分ごとの確定ポイントで更新します。シグナル生成には従来の47特徴・2段階モデル（5.19pip基準）をそのまま使用し、実運用の利確目安だけを3.0pipに設定しています。2026年7月1日〜8月14日の未使用検証562シグナルでは、予測方向へ3pipが30分以内に到達した割合 ${HOLDOUT_2026_TARGET_HIT.toFixed(2)}%、逆方向3pipより先に到達した割合 ${HOLDOUT_2026_FIRST_TOUCH.toFixed(2)}%。将来の成績を保証するものではありません。`;
    }

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

    const panel = document.getElementById('fxAnalysisPanel');
    const observer = new MutationObserver(() => apply3PipMode());
    observer.observe(panel, { childList: true, subtree: true, characterData: true });

    setInterval(apply3PipMode, 2000);
  }

  start();
})();