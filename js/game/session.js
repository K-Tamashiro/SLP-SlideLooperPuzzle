/** game/session.js — responsibility described in docs/architecture.md. */

function addLog(message) {
    console.log(message);
}

function clearSolveLog() {
    solveHistory = [];
    const logInput = document.getElementById('solve-log');
    if (logInput) logInput.value = '';
}

/**
 * セッション強制終了（チート使用時など）
 */
function forceStopSession() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    const timerBtn = document.querySelector('button[onclick="toggleTimer()"]');
    if (timerBtn) timerBtn.classList.remove('active-toggle');
    stopRotateIntervalOnly();
    setInterfaceLock(false);
    saveSystemLog(false);
    if (typeof addLog === 'function') addLog("Cheat move detected. Session terminated.");
}

/**
 * ログ記録スイッチの切り替え（アイコンボタン版）
 */
function toggleLogSwitch() {
    setLogState(!isLogEnabled);
}

/**
 * ログ記録状態を外部から強制指定する
 * @param {boolean} isEnabled - trueでON、falseでOFF
 * 1ブロック1メソッド：これを追加して外部制御に使用してください。
 */
function setLogState(isEnabled) {
    // 現在の状態と同じなら何もしない（無駄な処理を省く）
    if (isLogEnabled === isEnabled) return;

    // 状態を更新
    isLogEnabled = isEnabled;

    const btn = document.getElementById('log-switch-btn');
    const icon = document.getElementById('log-check-icon');

    if (isLogEnabled) {
        // --- 強制ONの処理 ---
        if (btn) btn.classList.add('active-rec');
        if (icon) icon.innerText = "☑";
        if (typeof addLog === 'function') addLog("Recording enabled.");
    } else {
        // --- 強制OFFの処理 ---
        if (timerId && typeof toggleTimer === 'function') {
            toggleTimer(false);
        }
        if (btn) btn.classList.remove('active-rec');
        if (icon) icon.innerText = "☐";
        if (typeof addLog === 'function') addLog("Recording disabled.");
    }
}

/**
 * ログ履歴とUI表示のみを完全にリセットする
 */
function resetLogOnly() {
    // 内部履歴配列をクリア
    solveHistory = [];
    window.boardRotationDegree = 0;
    // UI上のログ入力フィールドをクリア
    const logInput = document.getElementById('solve-log');
    if (logInput) {
        logInput.value = '';
    }
}

/**
 * 全統計のリセット（Resetボタン）
 * サーチライトのオン/オフに関わらず、画面上の全オーバーレイを強制排除する
 */
function resetStats() {
    // 1. タイマーの停止
    if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
    window.elapsedTime = 0;
    stopRotateIntervalOnly();

    // 2. サーチライト状態の強制リセット（ボタン消灯とモードオフ）
    const slBtn = document.querySelector('button[onclick="toggleSearchlight()"]');
    if (slBtn) slBtn.classList.remove('active-toggle');
    window.isSearchlightMode = false;

    // 3. サーチライト要素がDOMに残っていれば、オフ時でも物理的に削除して画面を戻す
    const overlay = document.getElementById('searchlight-overlay');
    if (overlay) {
        overlay.remove();
    }
    resetSearchlight();

    // 4. コンプリート表示（status-board / status-preview）を確実に消去
    hideCompleteOverlays();

    // 5. 統計数値の初期化
    moveCount = 0;
    const timerEl = document.getElementById('timer-display');
    const counterEl = document.getElementById('counter-display');
    if (timerEl) timerEl.textContent = "00:00.000";
    if (counterEl) counterEl.textContent = "0000";

    // 6. タイマーボタンの光を消す
    const timerBtn = document.querySelector('button[onclick="toggleTimer()"]');
    if (timerBtn) timerBtn.classList.remove('active-toggle');
}

/**
 * タイマー制御
 */
function toggleTimer(forceState) {
    const display = document.getElementById('timer-display');
    const btn = document.querySelector('button[onclick="toggleTimer()"]');
    const shouldStart = (forceState !== undefined) ? forceState : !timerId;

    // ログ無効時は開始不可
    if (typeof isLogEnabled !== 'undefined' && !isLogEnabled && shouldStart) return;

    if (!shouldStart) {
        // --- 停止（一時停止）処理 ---
        if (timerId) {
            // 現在のセッションでの経過時間を累積変数に加算
            window.elapsedTime = (window.elapsedTime || 0) + (performance.now() - startTime);
            clearInterval(timerId);
            timerId = null;
        }
        if (btn) btn.classList.remove('active-toggle');
        
        // 中断保存（現在の盤面と累積時間を記録）
        saveSystemLog(false);
        
        // ギミックとUIのクリーンアップ
        if (typeof stopRotateIntervalOnly === 'function') stopRotateIntervalOnly();
        setInterfaceLock(false);
    } else {
        // --- 開始（再開）処理 ---
        if (timerId) return;

        // 記録を伴うプレイの開始。履歴解析の判定抑止を持ち越さない。
        window.isReplayMode = false;
        
        if (typeof toggleMenu === 'function') toggleMenu(false);

        setInitialBoardSnapshot();

        // 新たな開始基点を記録
        startTime = performance.now();

        timerId = setInterval(() => {
            // (現在のセッションの経過時間) + (過去に蓄積された経過時間)
            const diff = (performance.now() - startTime) + (window.elapsedTime || 0);
            
            const m = Math.floor(diff / 60000).toString().padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            const ms = Math.floor(diff % 1000).toString().padStart(3, '0');
            if (display) display.textContent = `${m}:${s}.${ms}`;
        }, 10);
        
        if (btn) btn.classList.add('active-toggle');
        setInterfaceLock(true);

        // 回転ギミックの再開
        window.boardRotationDegree = 0;
        const rotateBtn = document.querySelector('button[onclick="startRotateCountdown()"]');
        if (rotateBtn && rotateBtn.classList.contains('active-toggle-red')) {
            if (!rotateTimerId && typeof executeRotateLoop === 'function') executeRotateLoop(); 
        }
    }
}

/**
 * ログ・履歴管理
 */
function recordMove(lineIdx, dir, steps, mode) {
    if (!timerId) toggleTimer(true);
    skipCompleteOnce = false;
    incrementCounter();
    const isV = (dir === 'U' || dir === 'D');
    let label = isV ? (lineIdx + 1) : String.fromCharCode(65 + lineIdx).toLowerCase();
    const logEntry = `${label}-${dir}${steps}`;
    solveHistory.push(RotateChange(logEntry));
    const logInput = document.getElementById('solve-log');
    if (logInput) logInput.value = solveHistory.join(',');
}

/**
 * 回転変換処理：物理操作ログを盤面の回転状態（0, 90, 180, 270度）に合わせて論理記号に変換する
 */
function RotateChange(log) {
    const rot = (window.boardRotationDegree || 0); // 0, 90, 180, 270 (90度刻み)
    if (rot === 0) return log;

    const parts = log.split('-');
    if (parts.length < 2) return log;

    const labelStr = parts[0];
    const action = parts[1]; // 例: "R1", "U2"
    const dir = action[0];
    const steps = action.slice(1);

    const n = subSize * gridNum;
    const isV = !isNaN(labelStr);
    const lineIdx = isV ? (parseInt(labelStr, 10) - 1) : (labelStr.charCodeAt(0) - 97);

    let logIdx = lineIdx;
    let logDir = dir;

    /**
     * 回転座標変換テーブル
     * 物理操作（見た目）を、正解の向き（0度）から見た論理操作に逆変換する
     */
    switch (rot) {
        case 90: // 90° 回転状態
            if (isV) {
                logIdx = (n - 1) - lineIdx; // 列 -> 行 (座標反転)
                logDir = (dir === 'D' ? 'R' : 'L'); 
            } else {
                logIdx = lineIdx; // 行 -> 列
                logDir = (dir === 'R' ? 'D' : 'U');
            }
            break;

        case 180: // 180° 回転状態
            logIdx = (n - 1) - lineIdx; // 座標反転
            if (isV) {
                logDir = (dir === 'D' ? 'U' : 'D');
            } else {
                logDir = (dir === 'R' ? 'L' : 'R');
            }
            break;

        case 270: // 270° 回転状態
            if (isV) {
                logIdx = lineIdx; // 列 -> 行
                logDir = (dir === 'D' ? 'L' : 'R');
            } else {
                logIdx = (n - 1) - lineIdx; // 行 -> 列 (座標反転)
                logDir = (dir === 'R' ? 'U' : 'D');
            }
            break;
    }

    // 変換後の状態に基づいてラベルを再生成
    const isLogV = (logDir === 'U' || logDir === 'D');
    const newLabel = isLogV ? (logIdx + 1) : String.fromCharCode(97 + logIdx);
    
    return `${newLabel}-${logDir}${steps}`;
}

function incrementCounter() {
    moveCount++;
    const display = document.getElementById('counter-display');
    if (display) display.textContent = moveCount.toString().padStart(4, '0');
}

/**
 * ゲーム開始時の盤面スナップショットを保存する
 * ソルブログが空の状態でのみ実行され、一度保存されたら上書きしない
 */
function setInitialBoardSnapshot() {
    // セッション開始時（ログが空）かつ、まだスナップショットがない場合のみ保存
    if (!window.initialBoardSnapshot) {
        window.initialBoardSnapshot = JSON.parse(JSON.stringify(board));
    }
}
