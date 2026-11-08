/** history/store.js — responsibility described in docs/architecture.md. */

//-----------------------------------------------------------------------------------------
/**
 * 旧データのCompleteしたデータの開始盤面を取得するデータサルベージ機能
 */
function restorationBoard() {
    const KEY = 'slp_history';
    const raw = localStorage.getItem(KEY);
    if (!raw) return;

    const history = JSON.parse(raw);
    let updatedCount = 0;

    history.forEach(item => {
        if (!item.is_complete) return;
        if (!item.solve_history) return;

        const gNum = Number(item.grid_size);
        const sSize = Number(item.sub_size);
        const N = gNum * sSize;

        // --- 1. モード判定（画像・動画系か） ---
        const modeStr = (item.media_mode || "").toLowerCase();
        const isMedia = modeStr.includes('image') || modeStr.includes('video') || modeStr.includes('movie');
        // const isMedia = modeStr.includes('color');

        // --- 2. ターゲット盤面の強制上書き（画像・動画モードの場合） ---
        // ストレージ内のターゲットビューが標準配色でない場合、ここで強制的に標準化する
        if (isMedia) {
            const standardTarget = [];
            for (let r = 0; r < N; r++) {
                const rowArr = [];
                for (let c = 0; c < N; c++) {
                    rowArr.push({
                        value: Math.floor(r / sSize) * gNum + Math.floor(c / sSize),
                        tileId: r * N + c,
                        direction: 0
                    });
                }
                standardTarget.push(rowArr);
            }
            // ターゲット盤面を標準配色に差し替え
            item.target_state = standardTarget;
        }

        // 初期盤面が既に存在する場合は、ターゲット盤面の上書きのみ行い、再計算はスキップ
        if (item.initial_state && item.initial_state.length > 0) {
            if (isMedia) updatedCount++; // ターゲット上書き分としてカウント
            return;
        }

        if (!item.target_state) return;

        // --- 3. 算出用の一時盤面（完成状態から開始） ---
        let tempBoard = JSON.parse(JSON.stringify(item.target_state));

        // --- 4. ログを逆順にして巻き戻し（サルベージ実行） ---
        // ※操作ログは既に正規化（0度基準）されている前提
        const steps = item.solve_history
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .reverse();

        for (const step of steps) {
            const dashIdx = step.lastIndexOf('-');
            if (dashIdx === -1) continue;

            const label = step.substring(0, dashIdx);
            const act = step.substring(dashIdx + 1);

            const dir = act[0].toUpperCase();
            const dist = parseInt(act.slice(1), 10);
            if (!dist) continue;

            const isV = !isNaN(label);
            const line = isV ? (parseInt(label, 10) - 1) : (label.charCodeAt(0) - 97);

            // 逆移動量の算出
            const revDist = (gNum - (dist % gNum)) % gNum;
            if (revDist === 0) continue;

            const isRev = isV ? (dir === 'U') : (dir === 'L');
            const totalLoops = revDist * sSize;

            for (let i = 0; i < totalLoops; i++) {
                moveLocal(tempBoard, line, isV, isRev);
            }
        }

        // 算出された盤面を初期状態として保存
        item.initial_state = tempBoard;
        updatedCount++;
    });

    if (updatedCount > 0) {
        localStorage.setItem(KEY, JSON.stringify(history));
        if (typeof refreshHistoryList === 'function') refreshHistoryList();
    }
}

/**
 * 現在のゲーム状態をシステムログとして保存する
 * @param {boolean} isComplete - コンプリートしたかどうかのフラグ
 */
function saveSystemLog(isComplete = false) {
    const scLog = document.getElementById('scramble-input').value;
    const slLog = document.getElementById('solve-log').value;
    const time = document.getElementById('timer-display').innerText;
    const moves = document.getElementById('counter-display').innerText;

    const gimmicks = {
        rotate: !!document.querySelector('button[onclick="startRotateCountdown()"].active-toggle-red'),
        flash: window.isFlashMode,
        searchlight: window.isSearchlightMode
    };

    // セッションIDが未定義の場合はここで発行し、グローバルに保持する（重複防止の要）
    if (!window.currentSessionId) {
        window.currentSessionId = new Date().getTime();
    }

    const logEntry = {
        session_id: window.currentSessionId,
        timestamp: new Date().toLocaleString(),
        grid_size: gridNum,
        sub_size: subSize,
        media_mode: window.mediaManager ? window.mediaManager.mode : 'color',
        scramble_log: scLog,
        solve_history: slLog,
        solve_time: time,
        step_count: moves,
        gimmicks: gimmicks,
        initial_state: window.initialBoardSnapshot || null,
        current_state: JSON.parse(JSON.stringify(board)),
        target_state: targetBoard,
        is_complete: isComplete
    };

    let history = JSON.parse(localStorage.getItem('slp_history') || '[]');
    
    // セッションIDで既存ログを検索
    const existingIndex = history.findIndex(h => h.session_id === logEntry.session_id);

    if (existingIndex !== -1) {
        // 同一セッションがあれば、最新の状態で上書き
        history[existingIndex] = logEntry;
    } else {
        // なければ新規追加
        history.push(logEntry);
        if (history.length > 400) history.shift();
    }

    localStorage.setItem('slp_history', JSON.stringify(history));

    if (typeof refreshHistoryList === 'function') {
        refreshHistoryList();
    }
}

/**
 * 5. Delete specific history entry
 * @param {string} timestamp - Unique identifier for the log
 */
function deleteHistoryEntry(timestamp) {
    if (!confirm("Are you sure you want to delete this log?")) return;

    let history = JSON.parse(localStorage.getItem('slp_history') || '[]');
    
    // 指定されたタイムスタンプ以外のものを残す
    const newHistory = history.filter(item => item.timestamp !== timestamp);
    
    localStorage.setItem('slp_history', JSON.stringify(newHistory));
    
    // リストを再描画
    refreshHistoryList();
    
    if (typeof addLog === 'function') addLog("History entry deleted.");
}

/**
 * CPU（Solver）による解析結果をシステムログとして保存する
 * 解析開始時点の盤面（board）とターゲット盤面をスナップショットとして保持する
 */
function saveSystemLog_CPU() {
  const scInput = document.getElementById('scramble-input');
  const solveLogArea = document.getElementById('solve-log');
  if (!scInput || !scInput.value) return;

  const scLog = scInput.value;
  const steps = scLog.split(',').filter(s => s.trim() !== "");
  const moves = steps.length;

  // UI上の「Solveログ」に反映
  if (solveLogArea) {
    solveLogArea.value = scLog;
  }

  const gimmicks = {
    rotate: !!document.querySelector('button[onclick="startRotateCountdown()"].active-toggle-red'),
    flash: window.isFlashMode,
    searchlight: window.isSearchlightMode
  };

  // 【重要】解析が開始された時点の盤面を「初期状態」として記録する
  // CPUの解答手順はこの盤面状態からスタートするため、これがないと再現できない
  const startBoardSnapshot = JSON.parse(JSON.stringify(board));

  // 【重要】ターゲット盤面も保存する（カラーモード等でターゲットが変わるため）
  const targetSnapshot = targetBoard ? JSON.parse(JSON.stringify(targetBoard)) : null;

  const logEntry = {
    session_id: new Date().getTime(),
    timestamp: new Date().toLocaleString() + " (CPU Solve)",
    grid_size: gridNum,
    sub_size: subSize,
    media_mode: window.mediaManager ? window.mediaManager.mode : 'color',
    scramble_log: scLog,       // 手順
    solve_history: scLog,      // 履歴表示用
    solver_output: scLog,
    solve_time: "CPU Search",
    step_count: moves,
    gimmicks: gimmicks,
    initial_state: startBoardSnapshot, // 解析開始時の盤面
    current_state: startBoardSnapshot, // 解析完了直後はまだ動かしていないので同一
    target_state: targetSnapshot,     // 当時のターゲット
    is_complete: true,                 // Solverが解を見つけたため完了扱い
    is_cpu: true                       // CPUフラグ
  };

  let history = JSON.parse(localStorage.getItem('slp_history') || '[]');
  history.push(logEntry);

  // 最大保存件数（400件）
  if (history.length > 400) history.shift();

  localStorage.setItem('slp_history', JSON.stringify(history));

  // 履歴UIを更新
  if (typeof refreshHistoryList === 'function') {
    refreshHistoryList();
  }
}

/**
 * 履歴ログ（slp_history）をすべて削除し、UIを更新する
 * HTML側の赤い削除ボタン（class="delete-btn"）から呼び出される
 */
function deleteLog() {
  localStorage.removeItem('slp_history');
  if (typeof refreshHistoryList === 'function') {
    refreshHistoryList();
  }
}

