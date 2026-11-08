/** replay/playback.js — responsibility described in docs/architecture.md. */

/**
 * プレイバック状態の初期化（CTRL押下時）
 */
window.initPlaybackState = function () {
  if (window._pbState) return;

  var logArea = document.getElementById('solve-log');
  var currentLogVal = logArea ? logArea.value.trim() : '';
  var steps = currentLogVal ? currentLogVal.split(',').map(s => s.trim()).filter(s => s !== "") : [];

  // 現在のカウントを取得（復元用）
  let currentCount = 0;
  if (typeof moveCount !== 'undefined') {
    currentCount = moveCount;
  } else {
    const countEl = document.getElementById('counter-display');
    if (countEl) currentCount = parseInt(countEl.innerText, 10) || 0;
  }

  window._pbState = {
    logicalIndex: steps.length, // 現在の論理的な手順位置（末尾）
    redoStack: [],              // Next用のスタック
    startLog: currentLogVal,    // 復元用：開始時のログ
    startMoveCount: currentCount, // 復元用：開始時のカウント
    executedHistory: []         // 復元用：実行した操作履歴
  };

  updatePlaybackButtons();
};

/**
 * プレイバック状態の破棄（CTRL離脱時）
 * 実行した操作を逆算して元に戻す（無かったことにする）
 */
window.clearPlaybackState = function () {
  if (!window._pbState) return;
  const state = window._pbState;

  // 1. 盤面の復元（実行履歴を逆順に「逆手」で適用）
  if (state.executedHistory.length > 0 && typeof board !== 'undefined') {
    const sSize = (typeof subSize !== 'undefined') ? subSize : 2;

    for (let i = state.executedHistory.length - 1; i >= 0; i--) {
      const stepStr = state.executedHistory[i];
      const invStr = invertMoveStr(stepStr); // 逆手
      const m = parseMoveStep(invStr);

      if (m) {
        // アニメーションなしで即時反映
        const totalDist = m.dist * sSize;
        const isRev = (m.isV) ? (m.dir === 'U') : (m.dir === 'L');
        for (let k = 0; k < totalDist; k++) {
          if (typeof moveLocal === 'function') {
            moveLocal(board, m.idx, m.isV, isRev);
          }
        }
      }
    }
    if (typeof render === 'function') render();
  }

  // 2. ログの復元
  var logArea = document.getElementById('solve-log');
  var scrambleInput = document.getElementById('scramble-input');
  if (logArea) logArea.value = state.startLog;
  if (scrambleInput) scrambleInput.value = state.startLog;

  // 3. カウントの復元
  if (typeof moveCount !== 'undefined') {
    moveCount = state.startMoveCount;
    const countEl = document.getElementById('counter-display');
    if (countEl) countEl.innerText = moveCount;
  }

  window._pbState = null;
};

/**
 * ボタン状態の更新
 */
function updatePlaybackButtons() {
  const btnPrev = document.querySelector('button[title*="Prev Step"]');
  const btnNext = document.querySelector('button[title*="Next Step"]');
  const pbState = window._pbState;

  if (!pbState) return;

  if (btnPrev) {
    // ログが空でなければ戻れる
    btnPrev.disabled = (pbState.logicalIndex <= 0);
  }
  if (btnNext) {
    // スタックがあれば進める
    btnNext.disabled = (pbState.redoStack.length === 0);
  }
}

/**
 * サイドパネル用プレイバック機能
 */
async function AnalyzePlayBack(direction) {
  if (window.isAnimating) return;

  // 状態がない場合は初期化（念のため）
  if (!window._pbState) {
    window.initPlaybackState();
  }
  const state = window._pbState;

  var logArea = document.getElementById('solve-log');
  var scrambleInput = document.getElementById('scramble-input');
  var currentLogVal = logArea ? logArea.value.trim() : '';
  var steps = currentLogVal ? currentLogVal.split(',').map(s => s.trim()).filter(s => s !== "") : [];

  var nextMoveStr = null;

  if (direction === 'Back') {
    // Back: 現在位置の1つ手前の手順の「逆」を実行して追記
    if (state.logicalIndex > 0) {
      const stepIndex = state.logicalIndex - 1;
      // インデックス境界チェック（ログ同期ズレ防止）
      if (stepIndex >= 0 && stepIndex < steps.length) {
        const targetStep = steps[stepIndex];
        if (targetStep) {
          const invStep = invertMoveStr(targetStep); // 逆手
          if (invStep) {
            nextMoveStr = invStep;
            state.redoStack.push(targetStep);
            state.logicalIndex--;
          }
        }
      }
    }
  } else if (direction === 'Next') {
    // Next: スタックから取り出して追記
    if (state.redoStack.length > 0) {
      const redoStep = state.redoStack.pop();
      if (redoStep) {
        nextMoveStr = redoStep;
        state.logicalIndex++;
      }
    }
  }

  if (nextMoveStr) {
    // 1. ログ追記
    steps.push(nextMoveStr);
    const newLog = steps.join(',');
    if (logArea) logArea.value = newLog;
    if (scrambleInput) scrambleInput.value = newLog;

    // 2. カウントアップ（UIと変数の両方を更新）
    if (typeof moveCount !== 'undefined') {
      moveCount++;
      const countEl = document.getElementById('counter-display');
      if (countEl) countEl.innerText = moveCount;
    }

    // 3. 復元用に履歴保存
    state.executedHistory.push(nextMoveStr);

    // 4. アニメーション実行
    const moveData = parseMoveStep(nextMoveStr);
    if (moveData && typeof animateAnalyzeMove === 'function') {
      await animateAnalyzeMove(moveData, false);
    }

    // 操作後のボタン状態更新
    updatePlaybackButtons();
  }
}

