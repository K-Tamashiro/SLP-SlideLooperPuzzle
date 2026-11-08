/** replay/replay.js — responsibility described in docs/architecture.md. */

/**
 * 1. メディアコントロール表示
 */
function toggleReplayMode() {
    const mc = document.getElementById('media-controls');
    if (mc) mc.classList.toggle('active');
}

let autoStepInterval = null;

const LONG_PRESS_DELAY = 300; // 長押しと判定するまでの待ち時間(ms)
const STEP_SPEED = 150; // 連続進行の速さ(ms)

function startContinuousStep(direction) {
    if (autoStepInterval) return;

    // 少し待ってから連続実行を開始（1回クリックとの誤爆防止）
    autoStepInterval = setTimeout(() => {
        autoStepInterval = setInterval(() => {
            if (direction === 'next') {
                if (window.currentReplayIdx >= window.moveTable.length) return stopContinuousStep();
                replayStepNext();
            } else {
                if (window.currentReplayIdx <= 0) return stopContinuousStep();
                replayStepBack();
            }
        }, STEP_SPEED);
    }, LONG_PRESS_DELAY);
}

function stopContinuousStep() {
    if (autoStepInterval) {
        clearTimeout(autoStepInterval);
        clearInterval(autoStepInterval);
        autoStepInterval = null;
    }
}

/**
 * 解析モード：アニメーション付き移動実行
 * 物理的なスライド演出を行い、完了後に論理状態を同期する
 */
async function animateAnalyzeMove(m, isReverseAction) {
    if (window.isAnimating) return;
    window.isAnimating = true;
    let ghosts = [];
    try {
        ghosts = GhostLayer.createLines({
            isVertical: m.isV, indices: m.lineIndices, sourceOpacity: 0.1, animated: true
        });
        if (!ghosts.length) return;
        const isRev = getIsRev(m.isV, m.dir, isReverseAction);
        const movePx = m.dist * GhostLayer.slideUnit() * (isRev ? -1 : 1);
        ghosts[0].offsetHeight; // Commit initial placement before starting the transition.
        ghosts.forEach(g => {
            g.style.transform = m.isV ? `translateY(${movePx}px)` : `translateX(${movePx}px)`;
        });
        await new Promise(resolve => setTimeout(resolve, 210));
        executeGroupedMove(m, isReverseAction, true);
    } finally {
        GhostLayer.remove(ghosts);
        window.isAnimating = false;
        render();
    }
}

/**
 * 1手進める（Nextボタン：アニメーションあり）
 */
async function replayStepNext() {
    if (window.isAnimating) return; // アニメーション中はガード
    const totalSteps = window.moveTable ? window.moveTable.length : 0;
    if (window.currentReplayIdx < totalSteps) {
        const m = window.groupedSteps[window.currentReplayIdx];
        await animateAnalyzeMove(m, false);
        window.currentReplayIdx++;
        updateReplayDisplay();
    }
}

/**
 * 1手戻る（Backボタン：アニメーションあり）
 */
async function replayStepBack() {
    if (window.isAnimating) return; // ガード
    if (window.currentReplayIdx > 0) {
        window.currentReplayIdx--;
        const m = window.groupedSteps[window.currentReplayIdx];
        await animateAnalyzeMove(m, true);
        updateReplayDisplay();
    }
}

/**
 * 解析モード開始：履歴の状態（完了/中断）に応じて、解析(Replay)か再開(Resume)かを振り分ける
 */
function startAnalyzeMode() {
    const solveLog = document.getElementById('solve-log').value;
    if (!solveLog) return;
    
    const history = JSON.parse(localStorage.getItem('slp_history') || '[]');
    const record = history.find(h => h.solve_history === solveLog);
    if (!record) return;

    toggleReplayMode();

    // セッションIDと初期盤面の復元
    window.currentSessionId = record.session_id;
    window.initialBoardSnapshot = record.initial_state;

    const isInterrupted = !record.is_complete;
    const boardEl = document.getElementById('board');

    // --- 1. 中断データの再開(Resume)処理 ---
    if (isInterrupted) {
        // 盤面と手順の復元
        board = JSON.parse(JSON.stringify(record.current_state));
        window.moveTable = record.solve_history ? record.solve_history.split(',').map(s => s.trim()).filter(Boolean) : [];
        
        // 累積時間の復元
        if (typeof parseTimeToMs === 'function') {
            window.elapsedTime = parseTimeToMs(record.solve_time);
        }
        
        // UI（タイマー・手数）の同期
        document.getElementById('timer-display').innerText = record.solve_time || "00:00.00";
        document.getElementById('counter-display').innerText = record.step_count || "0";

        // --- ギミック状態の復元 (setInterfaceLockのセレクタに準拠) ---
        if (record.gimmicks) {
            const g = record.gimmicks;
            
            // 同色フラッシュ
            window.isFlashMode = !!g.flash;
            window.isSameColorFlash = !!g.flash;
            const fBtn = document.querySelector('button[onclick="toggleFlash()"]');
            if (fBtn) fBtn.classList.toggle('active-toggle', window.isFlashMode);
            if (boardEl) boardEl.classList.toggle('same-color-flash', window.isSameColorFlash);

            // サーチライト
            window.isSearchlightMode = !!g.searchlight;
            const sBtn = document.querySelector('button[onclick="toggleSearchlight()"]');
            if (sBtn) sBtn.classList.toggle('active-toggle', window.isSearchlightMode);
            if (boardEl) boardEl.classList.toggle('searchlight-mode', window.isSearchlightMode);

            // 回転
            const rBtn = document.querySelector('button[onclick="startRotateCountdown()"]');
            if (rBtn) rBtn.classList.toggle('active-toggle-red', !!g.rotate);
        }

        window.isReplayMode = false;
        // 再開時はまずロックを解除して操作可能にする
        setInterfaceLock(false);
        if (typeof toggleLogPanel === 'function') toggleLogPanel();
        render();
        return; 
    }

    // --- 2. 完了データの解析(Analyze/Replay)モード ---
    // 解析時はギミックを強制解除
    window.isFlashMode = false;
    window.isSameColorFlash = false;
    window.isSearchlightMode = false;
    if (boardEl) {
        boardEl.classList.remove('same-color-flash', 'searchlight-mode');
    }

    // ギミック系ボタンのクラスを一括除去 (タイマーボタン以外)
    const targetButtons = [
        'button[onclick="toggleFlash()"]',
        'button[onclick="toggleSearchlight()"]',
        'button[onclick="startRotateCountdown()"]'
    ];
    targetButtons.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.classList.remove('active-toggle', 'active-toggle-red');
    });

    setLogState(false);
    staticShowGrouping();

    window.groupedSteps = window.moveTable;
    const totalSteps = window.moveTable.length;
    window.isReplayMode = true;

    if (record.initial_state) {
        board = JSON.parse(JSON.stringify(record.initial_state));
    }

    window.initialAnalyzeBoard = JSON.parse(JSON.stringify(board));
    window.currentReplayIdx = 0;

    const slider = document.getElementById('analyze-slider');
    if (slider) {
        slider.max = totalSteps;
        slider.value = 0;
        slider.oninput = function(e) {
            const targetPos = parseInt(e.target.value);
            while (window.currentReplayIdx < targetPos) {
                executeGroupedMove(window.groupedSteps[window.currentReplayIdx], false, true);
                window.currentReplayIdx++;
            }
            while (window.currentReplayIdx > targetPos) {
                window.currentReplayIdx--;
                executeGroupedMove(window.groupedSteps[window.currentReplayIdx], true, true);
            }
            render();
            updateReplayDisplay(); 
        };
    }

    if (typeof toggleLogPanel === 'function') toggleLogPanel();
    showMediaControls(true);
    updateReplayDisplay(); 
    render(); 
}

/**
 * 表示更新（左：0=崩れ ～ 右：Max=完成）
 */
function updateReplayDisplay() {
    const idxEl = document.getElementById('replay-index');
    const totalEl = document.getElementById('replay-total');
    const moveEl = document.getElementById('current-move-display');
    const slider = document.getElementById('analyze-slider');
    const boardCounter = document.getElementById('move-count') || document.getElementById('counter-display');

    if (!window.moveTable) return;
    const totalSteps = window.moveTable.length;
    const cur = window.currentReplayIdx;

    if (idxEl) idxEl.innerText = cur;
    if (totalEl) totalEl.innerText = totalSteps;
    
    if (slider) {
        slider.max = totalSteps;
        slider.value = cur;
    }
    
    if (boardCounter) {
        boardCounter.innerText = cur.toString().padStart(4, '0');
    }

    if (moveEl) {
        // 1. ログを配列としてキャッシュする (window.originalLogSteps を活用)
        // 解析開始時や履歴クリック時にセットされている前提。
        // 万が一空の場合だけ、その場で一度だけ作る。
        if (!window.originalLogSteps || window.originalLogSteps.length === 0) {
            const logVal = document.getElementById('solve-log').value;
            window.originalLogSteps = logVal ? logVal.split(',').map(s => s.trim()) : [];
        }

        // 表示インデックス：常に「現在位置」
        let displayMove = '----';

        if (cur > 0 && cur <= totalSteps) {
            const idx = Math.min(cur - 1, totalSteps - 1);
            const m = window.groupedSteps[idx];
            if (m) displayMove = formatTableMove(m);
        }

        // 表示
        if (cur >= totalSteps) {
            moveEl.innerText = `COMPLETE[${displayMove}]`;
        } else if (cur <= 0) {
            moveEl.innerText = `Start[----]`;
        } else {
            moveEl.innerText = `[${displayMove}]`;
        }

    }
    

    // ボタンの制御
    const nextBtn = document.querySelector('button[onclick="replayStepNext()"]');
    const backBtn = document.querySelector('button[onclick="replayStepBack()"]');
    if (nextBtn) nextBtn.disabled = (cur >= totalSteps);
    if (backBtn) backBtn.disabled = (cur <= 0);

    // 演出リセット
    if (typeof hideCompleteDisplay === 'function') hideCompleteDisplay();
    const statusBoard = document.getElementById('status-board');
    if (statusBoard) statusBoard.classList.remove('show');
}

function formatTableMove(m) {
    const lines = m.lineIndices
        .map(idx => m.isV ? (idx + 1) : String.fromCharCode(97 + idx))
        .join(',');

    return `${lines}-${m.dir}${m.dist}`;
}

/**
 * メディアコントロールの表示制御（Behavior）
 */
function showMediaControls(show) {
    const controls = document.getElementById('media-controls');
    const titleContainer = document.querySelector('.title-container');
}
