window.isAnimating = false;
window.initialBoardSnapshot = null;

/**
 * 解析モード：アニメーション付き移動実行
 * 物理的なスライド演出を行い、完了後に論理状態を同期する
 */
async function animateAnalyzeMove(m, isReverseAction) {
    if (window.isAnimating) return; 
    window.isAnimating = true;

    const isRev = getIsRev(m.isV, m.dir, isReverseAction);
    const steps = m.dist; 
    
    const wrapper = document.getElementById('board');
    if (!wrapper) {
        window.isAnimating = false;
        return;
    }
    const wrapRect = wrapper.getBoundingClientRect();
    const indices = m.lineIndices;
    const ghosts = [];
    
    // 1. ゴースト（視覚的身代わり）の生成
    indices.forEach(idx => {
        const strip = document.createElement('div');
        strip.className = 'ghost-strip analyze-ghost';
        
        const cells = [];
        document.querySelectorAll('.cell').forEach(c => {
            const r = parseInt(c.dataset.row), col = parseInt(c.dataset.col);
            if ((m.isV && col === idx) || (!m.isV && r === idx)) {
                cells.push({ el: c, k: (m.isV ? r : col) });
            }
        });
        cells.sort((a, b) => a.k - b.k);

        const firstRect = cells[0].el.getBoundingClientRect();
        const bL = firstRect.left - wrapRect.left;
        const bT = firstRect.top - wrapRect.top;
        
        strip.style.left = bL + 'px';
        strip.style.top = bT + 'px';
        strip.style.gap = `${GAP_FACE}px`;
        strip.style.transition = 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)';

        // ループを表現するために3セット分のクローンを配置
        const createSet = () => {
            const d = document.createElement('div');
            d.style.display = m.isV ? 'grid' : 'flex';
            d.style.gap = `${GAP_CELL}px`;
            if (m.isV) d.style.gridTemplateColumns = '1fr';

            cells.forEach((item, i) => {
                const clone = item.el.cloneNode(true);
                clone.style.opacity = '1';
                const originalCanvas = item.el.querySelector('canvas');
                if (originalCanvas) {
                    clone.querySelectorAll('canvas').forEach(c => c.remove());
                    clone.style.backgroundImage = `url(${originalCanvas.toDataURL()})`;
                    clone.style.backgroundSize = 'cover';
                }
                if (i > 0 && i % subSize === 0) {
                    if (m.isV) clone.style.marginTop = `${GAP_FACE - GAP_CELL}px`;
                    else clone.style.marginLeft = `${GAP_FACE - GAP_CELL}px`;
                }
                d.appendChild(clone);
            });
            return d;
        };

        strip.style.flexDirection = m.isV ? 'column' : 'row';
        for(let k=0; k<3; k++) strip.appendChild(createSet());
        
        const offset = m.isV ? (wrapRect.height + GAP_FACE) : (wrapRect.width + GAP_FACE);
        if (m.isV) strip.style.top = (bT - offset) + 'px';
        else strip.style.left = (bL - offset) + 'px';

        wrapper.appendChild(strip);
        ghosts.push(strip);
        cells.forEach(item => item.el.style.opacity = '0.1');
    });

    // 2. 移動アニメーションの実行
    const faceW = (cellSizePixel * subSize) + (GAP_CELL * (subSize - 1));
    const unit = faceW + GAP_FACE;
    const movePx = steps * unit * (isRev ? -1 : 1);

    ghosts[0].offsetHeight; // 強制リフロー
    ghosts.forEach(g => {
        g.style.transform = m.isV ? `translateY(${movePx}px)` : `translateX(${movePx}px)`;
    });

    // 3. アニメーション完了待機（CSS transition時間に合わせる）
    await new Promise(resolve => setTimeout(resolve, 210));

    // 論理状態の更新とゴーストの削除
    executeGroupedMove(m, isReverseAction, true);
    ghosts.forEach(g => g.remove());
    window.isAnimating = false;
    render();
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
            if (!window.rotateTimerId && typeof executeRotateLoop === 'function') executeRotateLoop(); 
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
    if (display) display.textContent = moveCount.toString().padStart(3, '0');
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
 * 履歴リストの表示更新
 * 空枠への「？」表示、アイコン最大化、ステップ単位「cnt」を適用
 */
function refreshHistoryList() {
    const container = document.getElementById('history-list');
    if (!container) return;
    container.innerHTML = ""; 

    const rawHistory = localStorage.getItem('slp_history');
    if (!rawHistory) {
        container.innerHTML = '<div class="history-empty">No Storage Data.</div>';
        return;
    }

    const history = JSON.parse(rawHistory || '[]');
    const filtered = history.filter(h => {
        return Number(h.grid_size) === gridNum && Number(h.sub_size) === subSize;
    }).reverse();

    if (filtered.length === 0) {
        container.innerHTML = '<div class="history-empty">No history for this mode.</div>';
        return;
    }

    // --- サイズ計算 ---
    const totalSize = gridNum * subSize;
    let miniCellSize = 2;
    if (totalSize <= 4) miniCellSize = 5;
    else if (totalSize <= 6) miniCellSize = 3;

    const boxWidth = totalSize * miniCellSize + (totalSize - 1) + 2;

    container.innerHTML = filtered.map((data, index) => {
        const entryId = data.timestamp; 
        const stepValue = data.step_count ? data.step_count.toString().replace(/[^0-9]/g, '') : "0";
        const paddedSteps = stepValue.padStart(4, '0');
        const logMode = data.media_mode || 'color';

        // --- 空枠（プレースホルダー）に「？」を追加 ---
        const emptyBox = `
            <div style="width:${boxWidth}px; height:${boxWidth}px; border:1px dashed #555; 
                 flex-shrink:0; box-sizing:border-box; display:flex; align-items:center; 
                 justify-content:center; color:#555; font-size:${Math.floor(boxWidth * 0.6)}px; 
                 font-weight:bold; font-family:sans-serif;">?</div>`;

        const initialPreview = data.initial_state 
            ? createMiniPreview(data.initial_state, miniCellSize) 
            : emptyBox;

        const arrow = `<span style="color: #ffff00; font-size: 10px; margin: 0 5px; flex-shrink: 0;">▶</span>`;

        // 右側：ターゲット表示
        let targetIcon = "";
        const fontSize = Math.floor(boxWidth * 0.75);

        if (logMode === 'video') {
            targetIcon = `<div class="history-icon-box" title="Video Mode" style="width:${boxWidth}px; height:${boxWidth}px; display:flex; align-items:center; justify-content:center; font-size:${fontSize}px; border:1px solid #444; border-radius:2px; background:#222;">▶️</div>`;
        } else if (logMode === 'image') {
            targetIcon = `<div class="history-icon-box" title="Image Mode" style="width:${boxWidth}px; height:${boxWidth}px; display:flex; align-items:center; justify-content:center; font-size:${fontSize}px; border:1px solid #444; border-radius:2px; background:#222;">🖼️</div>`;
        } else {
            targetIcon = data.target_state ? createMiniPreview(data.target_state, miniCellSize) : emptyBox;
        }

        const iconContent = `
            <div style="display: flex; align-items: center; justify-content: center;">
                <div style="flex-shrink:0; width:${boxWidth}px; display:flex; justify-content:center;">${initialPreview}</div>
                ${arrow}
                <div style="flex-shrink:0; width:${boxWidth}px; display:flex; justify-content:center;">${targetIcon}</div>
            </div>
        `;

        return `
            <div class="history-item" 
                data-index="${index}" 
                role="listitem" 
                tabindex="0" 
                style="display: flex; align-items: center; padding: 4px 6px;">
                <div class="mini-target-icon" onclick="loadHistoryByIndex(${index})" style="width: auto; min-width: ${boxWidth * 2 + 20}px; flex-shrink: 0; display: flex; align-items: center; margin-right: 10px;">
                    ${iconContent}
                </div>
                <div class="history-status" style="flex-shrink: 0; margin-right: 8px;">${data.is_complete ? "✅" : "⚠️"}</div>
                <div class="history-info" onclick="loadHistoryByIndex(${index})" style="flex-grow: 1; min-width: 0;">
                    <div class="history-date" style="font-size: 9px; color: #ccc;">${data.timestamp}</div>
                    <div class="history-stats" style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="history-time" style="font-family: monospace; font-size: 11px;">${data.solve_time}</span>
                        <span class="history-steps" style="font-size: 10px; color: #888; margin-left: 6px;">${paddedSteps} cnt</span>
                    </div>
                </div>
                <button class="history-delete-btn" onclick="deleteHistoryEntry('${entryId}')" style="margin-left: 6px; flex-shrink: 0;">🗑️</button>
            </div>`;
    }).join('');

    window.currentFilteredHistory = filtered;
}

/**
 * ミニプレビュー生成（セルサイズ指定対応）
 */
function createMiniPreview(state, cellSize = 3) {
    if (!state || !Array.isArray(state)) return '';
    const size = state.length;
    let html = `<div style="display:grid; grid-template-columns:repeat(${size}, ${cellSize}px); gap:1px; background:#333; padding:1px; border-radius:1px; flex-shrink:0; box-sizing:border-box;">`;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const entry = state[r][c];
            const val = (entry !== null && typeof entry === 'object') ? entry.value : entry;
            const colorClass = (val !== undefined && val !== null) ? `c${val}` : '';
            html += `<div class="${colorClass}" style="width:${cellSize}px; height:${cellSize}px;"></div>`;
        }
    }
    html += `</div>`;
    return html;
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
 * 記録されたログ文字列からミラー（逆手順）配列を生成する
 */
function getMirrorStepsFromLog(logStr) {
    if (!logStr) return [];

    // 1. 文字列を配列化して順序を反転
    const steps = logStr.split(',').filter(s => s.trim() !== "");
    const reversed = steps.reverse();

    // 2. 移動数値を (gridNum - 移動量) に置き換え
    const mirror = reversed.map(step => {
        const [label, action] = step.split('-');
        const dir = action[0];
        const moveVal = parseInt(action.substring(1));
        
        // 盤面サイズ(gridNum)から現在の移動量を引く
        const mirrorVal = Number(gridNum) - moveVal;
        
        return `${label}-${dir}${mirrorVal}`;
    });

    // すでに配列を返します
    return mirror;
}

/**
 * CSV / Backup
 */
function saveCSV(type) {
    const inputId = (type === 'scramble') ? 'scramble-input' : 'solve-log';
    const inputElement = document.getElementById(inputId);
    if (!inputElement || !inputElement.value.trim()) return;
    const blob = new Blob([inputElement.value.trim()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_pattern_${new Date().getTime()}.csv`;
    a.click();
}

function saveBackupCSV() {
    const historyData = localStorage.getItem('slp_history');
    if (!historyData || historyData === '[]') return;
    const blob = new Blob([historyData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slp_history_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
}

/**
 * MediaManager クラス
 */
class MediaManager {
    constructor() {
        this.mode = 'color';
        this.mediaElement = null;
        this.mediaSrc = null;
        this.animationId = null;
    }

    /**
     * 画像・動画の統合セットアップ
     */
    async setupMedia(file) {
        // インスタンスがなければ生成
        if (!window.rotationManager) {
            window.rotationManager = new RotationManager(file.type.startsWith('video/') ? 'video' : 'image');
        }
        // 1. 新規ロード前に、現在の描画ループとメモリを完全に「更地」にする
        this.stopDrawingLoop();
        document.querySelectorAll('.ghost-strip').forEach(el => el.remove());
        
        if (this.mediaElement instanceof HTMLVideoElement) {
            this.mediaElement.pause();
            this.mediaElement.src = ""; // 物理的に切断
            this.mediaElement.load();
        }

        const oldUrl = this.mediaSrc;
        const newUrl = URL.createObjectURL(file);
        this.mediaSrc = newUrl;

        try {
            if (file.type.startsWith('image/')) {
                this.mode = 'image';
                const img = new Image();
                img.src = newUrl;
                await img.decode();
                this.mediaElement = img;
                if (typeof updateV2StatusUI === 'function') updateV2StatusUI('image');
            } 
            else if (file.type.startsWith('video/')) {
                this.mode = 'video';
                const v = document.createElement('video');
                v.src = newUrl;
                v.muted = true;
                v.loop = true;
                v.playsInline = true;
                this.mediaElement = v;

                await new Promise((resolve, reject) => {
                    v.onloadedmetadata = () => v.play().then(resolve).catch(reject);
                    v.onerror = reject;
                });
                if (typeof updateV2StatusUI === 'function') updateV2StatusUI('video');
                this.startDrawingLoop();
            }
            // --- メディア選択時に回転ギミックを強制OFF & ロック ---
            if (window.rotateTimerId) {
                stopRotateIntervalOnly(); // 実行中のタイマー停止
            }

            // --- メディア選択時にフラッシュを強制ONにする ---
            window.isFlashMode = true;
            const flashBtn = document.querySelector('button[onclick="toggleFlash()"]');
            if (flashBtn) flashBtn.classList.add('active-toggle');
            // --------------------------------------------------

            // 2. 盤面のタイルを物理的に一度リセットしてから再描画
            const board = document.getElementById('board');
            if (board) board.innerHTML = ''; 
            
            setInterfaceLock(!!timerId);

            renderPreview();
            render();

        } catch (e) {
            console.error("Media setup failed:", e);
            window.resetToColorMode();
        } finally {
            // 3. 古いURLの破棄を、DOMが完全に書き換わるまで十分に遅らせる
            if (oldUrl && oldUrl !== newUrl) {
                setTimeout(() => {
                    try { URL.revokeObjectURL(oldUrl); } catch(err) {}
                }, 1000);
            }
        }
    }

    /**
     * 動画描画ループ
     */
    startDrawingLoop() {
        this.stopDrawingLoop();
        const tick = () => {
            if (this.mode === 'video') {
                this.syncVideoToCanvases();
                this.animationId = requestAnimationFrame(tick);
            }
        };
        this.animationId = requestAnimationFrame(tick);
    }

    stopDrawingLoop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * 動画フレームの各Canvasへの転写
     */
    syncVideoToCanvases() {
        if (this.mode !== 'video' || !this.mediaElement) return;
        const v = this.mediaElement;
        if (v.readyState < 2) return;

        const canvases = document.querySelectorAll('.video-tile-canvas');
        const totalCells = subSize * gridNum;
        const minSide = Math.min(v.videoWidth, v.videoHeight);
        
        // sx0, sy0 を定義
        const sx0 = (v.videoWidth - minSide) / 2;
        const sy0 = (v.videoHeight - minSide) / 2;
        const step = minSide / totalCells;

        canvases.forEach(canvas => {
            const ctx = canvas.getContext('2d', { alpha: false });
            const cellEl = canvas.closest('.cell');
            const r = parseInt(cellEl.dataset.row);
            const c = parseInt(cellEl.dataset.col);
            
            const piece = board[r][c];
            const tId = piece.tileId; // 現在この位置にいるパーツの固有ID
            
            const totalCells = subSize * gridNum;
            const origAbsR = Math.floor(tId / totalCells);
            const origAbsC = tId % totalCells;

            const v = this.mediaElement;
            const minSide = Math.min(v.videoWidth, v.videoHeight);
            const sx0 = (v.videoWidth - minSide) / 2;
            const sy0 = (v.videoHeight - minSide) / 2;
            const step = minSide / totalCells;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            window.rotationManager.render(
                ctx, piece, v, 
                0, 0, canvas.width, canvas.height,
                sx0 + (origAbsC * step), sy0 + (origAbsR * step), step, step
            );
        });
    }

    // MediaManager クラス内に実装
    setPlaybackRate(rate) {
        if (this.mediaElement instanceof HTMLVideoElement) {
            this.mediaElement.playbackRate = parseFloat(rate);
        }
    }

    /**
     * 画像モード用CSS適用
     */
    applyMediaStyle(cell, value) {
            if (this.mode !== 'image' || !this.mediaElement || value === undefined) return;
            
            const totalCells = subSize * gridNum;
            const correctR = Math.floor(value / totalCells);
            const correctC = value % totalCells;
            
            const w = this.mediaElement.naturalWidth;
            const h = this.mediaElement.naturalHeight;
            if (!w || !h) return;

            const totalBoardPx = cellSizePixel * totalCells;
            const mediaAspect = w / h;
            let drawW, drawH;

            if (mediaAspect > 1) {
                drawH = totalBoardPx; drawW = totalBoardPx * mediaAspect;
            } else {
                drawW = totalBoardPx; drawH = totalBoardPx / mediaAspect;
            }

            const offX = (drawW - totalBoardPx) / 2;
            const offY = (drawH - totalBoardPx) / 2;
            const posX = -(correctC * cellSizePixel + offX);
            const posY = -(correctR * cellSizePixel + offY);

            // インラインスタイルで強制適用
            cell.style.setProperty('background-image', `url(${this.mediaSrc})`, 'important');
            cell.style.setProperty('background-size', `${drawW}px ${drawH}px`, 'important');
            cell.style.setProperty('background-position', `${posX}px ${posY}px`, 'important');
            cell.style.setProperty('background-repeat', 'no-repeat', 'important');
        }
        /**
         * 音量の変更 (0.0 ～ 1.0)
         */
        setVolume(value) {
            if (this.mediaElement instanceof HTMLVideoElement) {
                this.mediaElement.volume = parseFloat(value);
                // 音量が0より大きければミュートを解除、0ならミュートにする
                this.mediaElement.muted = (this.mediaElement.volume === 0);
            }
        }
    }

// グローバル公開
window.handleMediaUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !window.mediaManager) return;

    // 1. セットアップを実行
    await window.mediaManager.setupMedia(file);
    
    // 2. ★最重要：inputの値を空にする（これで同じファイルを2回目も選べるようになる）
    e.target.value = '';

    // 3. UIパネルの制御（開いていれば閉じる）
    const vPanel = document.getElementById('v2-video-uploader');
    const iPanel = document.getElementById('v2-media-uploader');
    if (vPanel && vPanel.style.display !== 'none') toggleVideoPanel();
    if (iPanel && iPanel.style.display !== 'none') toggleV2Panel();
};

window.handleVideoUpload = async (e) => {
    if (e.target.files[0] && window.mediaManager) await window.mediaManager.setupMedia(e.target.files[0]);
    if (typeof toggleVideoPanel === 'function') toggleVideoPanel();
};

/**
 * 動画ファイル選択時のハンドラ
 * HTMLのonchangeから呼び出せるようにwindowに紐付ける
 */
window.handleVideoUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // パネルを閉じる（ui-render.jsにある関数）
    if (typeof toggleVideoPanel === 'function') {
        toggleVideoPanel();
    }

    if (window.mediaManager) {
        await window.mediaManager.setupMedia(file);
    }
};

/**
 * handleMediaUpload 内の表示更新
 */
function updateV2StatusUI(mode) {
    const modeSpan = document.getElementById('current-v2-mode');
    if (modeSpan) {
        modeSpan.innerText = mode.toUpperCase();
        modeSpan.style.color = (mode === 'color') ? '#888' : '#00ffcc';
    }
}
/**
 * メディア（画像/動画）がロードされた際のコールバック
 */
function onMediaLoaded(src) {
    // 1. メディアマネージャーにソースをセット
    if (window.mediaManager) {
        window.mediaManager.mediaSrc = src;
    }

    // 2. ターゲットビューと正解判定データをリセット
    // 第1引数を true にすることで targetBoard を現在の構成で再生成する
    initBoard(true);

    // 3. プレビューを再描画
    renderPreview();
    
    // 4. (任意) 進行中の統計やログもクリア
    clearSolveLog();
    resetStats();
    resetColorTargetView();
}

function resetToColorMode() {
    window.mediaManager.mode = 'color';
    if (window.mediaManager.mediaSrc) {
        URL.revokeObjectURL(window.mediaManager.mediaSrc);
        window.mediaManager.mediaSrc = null;
    }
    
    // 全タイルのインラインスタイルを「属性ごと」削除して初期状態に戻す
    document.querySelectorAll('.cell').forEach(cell => {
        cell.removeAttribute('style'); 
        // 必要な基本サイズだけ再セット（renderが上書きするが念のため）
        cell.style.width = cell.style.height = `${cellSizePixel}px`;
    });

    const modeSpan = document.getElementById('current-v2-mode');
    if (modeSpan) {
        modeSpan.innerText = 'COLOR';
        modeSpan.style.color = '#888';
    }
    // 画像が選択・ロードされたらパネルを閉じる
    if (document.getElementById('v2-media-uploader').style.display !== 'none') {
        toggleV2Panel();
    }
    renderPreview();
    render();
}

function toggleLogPanel() {
    const overlay = document.getElementById('log-overlay');
    const mediaControls = document.getElementById('media-controls');
    const statusBoard = document.getElementById('status-board');
    const logModeSpan = document.getElementById('mode-text');
    const mainSelect = document.getElementById('mode-select');

    if (!overlay) return;

    const isVisible = overlay.style.display === 'block';
    if (!isVisible) {
        // --- パネルを開く時の処理 ---
        if (statusBoard) statusBoard.classList.remove('show');
        if (logModeSpan && mainSelect) {
            const selectedText = mainSelect.options[mainSelect.selectedIndex].text;
            logModeSpan.innerText = selectedText;
        }
        if (typeof refreshHistoryList === 'function') refreshHistoryList();
        overlay.style.display = 'block';
        if (window.isReplayMode && mediaControls) {
            mediaControls.style.visibility = 'hidden';
            mediaControls.style.opacity = '0';
        }
    } else {
        // --- パネルを閉じる時の処理 ---
        overlay.style.display = 'none';

        // 解析中（ReplayMode）でない場合は、表示されていた履歴の時間を消す
        if (!window.isReplayMode) {
            const timerDisplay = document.getElementById('timer-display');
            if (timerDisplay) timerDisplay.innerText = "00:00.000";
        }

        if (window.isReplayMode && mediaControls) {
            mediaControls.style.visibility = 'visible';
            mediaControls.style.opacity = '1';
            const isComplete = (window.currentReplayIdx === window.moveTable.length);
            if (isComplete && statusBoard) {
                statusBoard.classList.add('show');
            }
        }
    }
    toggleMenu(false);
}

function loadFilteredHistory(data) {
    if (!data) return;

    // 数値配列をオブジェクト構造へ正規化してから代入 ---
    const rawTarget = JSON.parse(JSON.stringify(data.target_state));
    targetBoard = rawTarget.map(row => 
        row.map(cell => {
            // すでにオブジェクトならそのまま
            if (typeof cell === 'object' && cell !== null) return cell;
            // 数値なら現在の仕様に合わせたオブジェクトを生成
            return { tileId: cell, value: cell, direction: 0 };
        })
    );

    renderPreview();

    const scrambleInput = document.getElementById('scramble-input');
    const solveLog = document.getElementById('solve-log');
    if (scrambleInput) scrambleInput.value = data.scramble_log || "";
    if (solveLog) solveLog.value = data.solve_history || "";

    window.currentLogTime = data.solve_time;

    updateGimmickHistoryIcons(data.gimmicks);
    
    const oldPreview = document.getElementById('log-large-preview');
    if (oldPreview) oldPreview.remove();

}

/**
 * ログに記録されたギミック状態をアイコンの不透明度で表現
 */
function updateGimmickHistoryIcons(gimmicks) {
    if (!gimmicks) return;
    const gRotate = document.getElementById('g-rotate');
    const gSpotlight = document.getElementById('g-spotlight');
    const gFlash = document.getElementById('g-flash');

    if (gRotate) gRotate.style.opacity = gimmicks.rotate ? "1" : "0.2";
    if (gSpotlight) gSpotlight.style.opacity = gimmicks.searchlight ? "1" : "0.2";
    if (gFlash) gFlash.style.opacity = gimmicks.flash ? "1" : "0.2";
}

/**
 * media-system.js
 * ブロック単位の移動（* subSize）を維持
 */
function executeSingleMove(moveStr, isReverseAction, isSilent = false) {
    const cmd = moveStr.trim().toLowerCase();
    if (!cmd.includes('-')) return;

    const [label, action] = cmd.split('-');
    // ラベルが数字なら縦列（1,2,3...）、アルファベットなら横行（a,b,c...）
    let lineIdx = isNaN(label) ? label.charCodeAt(0) - 97 : parseInt(label) - 1;
    let isV = !isNaN(label);
    let dir = action[0].toUpperCase();

    // ブロック単位の移動距離
    let steps = parseInt(action.substring(1)) * subSize;

    // --- 方向判定の修正 ---
    let isRev;
    if (isV) {
        // 縦移動：D(Down)は正方向(false)、U(Up)は逆方向(true)
        isRev = (dir === 'U'); 
    } else {
        // 横移動：R(Right)は正方向(false)、L(Left)は逆方向(true)
        isRev = (dir === 'L');
    }

    // ログ戻し（undo）などの場合は、判定した方向をさらに反転させる
    if (isReverseAction) {
        isRev = !isRev;
    }

    // 物理移動の実行
    for (let i = 0; i < steps; i++) {
        moveLogic(lineIdx, isV, isRev);
    }

    if (!isSilent) {
        render();
    }
}

/**
 * 通常移動／枠移動を吸収する唯一の実行入口
 */
function executeMove(moveStr, isReverse, isSilent = false) {
    // 枠移動ログ判定（例: A2-R1 / 2-D1 など）
    if (moveStr.includes(':')) {
        // 例: G1:A-R1
        const [group, move] = moveStr.split(':');
        const groupIdx = parseInt(group.substring(1)); // G1 → 1
        const base = groupIdx * subSize;

        const isV = !isNaN(move[0]);

        for (let i = 0; i < subSize; i++) {
            const label = isV
                ? (base + i + 1)
                : String.fromCharCode(97 + base + i);

            const dirCount = move.split('-')[1]; // ★ 正規化
            executeSingleMove(`${label}-${dirCount}`, isReverse, true);
        }


        if (!isSilent) render();
        return;
    }

    // 通常移動
    executeSingleMove(moveStr, isReverse, isSilent);
}

/**
 * moveTable 用 実行エンジン
 */
function executeGroupedMove(move, isReverseAction, isSilent = false) {
    if (move.dist <= 0) return;

    const isRev = getIsRev(move.isV, move.dir, isReverseAction);
    const steps = move.dist * subSize;

    if (move.type === 'SINGLE') {
        for (let i = 0; i < steps; i++) {
            moveLogic(move.lineIndices[0], move.isV, isRev);
        }
    } else { // FRAME
        for (let i = 0; i < steps; i++) {
            for (const lineIdx of move.lineIndices) {
                moveLogic(lineIdx, move.isV, isRev);
            }
        }
    }

    if (!isSilent) render();
}

function getIsRev(isV, dir, isReverseAction) {
    let isRev;
    if (isV) {
        isRev = (dir === 'U');
    } else {
        isRev = (dir === 'L');
    }
    if (isReverseAction) isRev = !isRev;
    return isRev;
}


/**
 * メディアコントロールの表示制御（Behavior）
 */
function showMediaControls(show) {
    const controls = document.getElementById('media-controls');
    const titleContainer = document.querySelector('.title-container');
}

/**
 * 4. Copy to Scramble: LiveログをInputボックスへコピー
 */
function copySolveToScramble() {
    const solveLog = document.getElementById('solve-log');
    const scrambleInput = document.getElementById('scramble-input');
    if (solveLog && scrambleInput) {
        scrambleInput.value = solveLog.value.replace(/[^A-Za-z0-9,\-]/g, "");
        if (typeof addLog === 'function') addLog("Solve log copied to Scramble Box");
    }
}

/**
 * 3. Reproduce Scramble (Updated)
 * 盤面状態を維持したまま手順のみを適用する
 */
function reproduceScramble() {
    const input = document.getElementById('scramble-input').value;
    if (!input) return;

    // 1. 判定を一時的にスキップ（処理中のノイズ防止）
    skipCompleteOnce = true;

    // ※重要：盤面のリセット(initBoard)やターゲットの強制同期(copyTargetToCurrent)は行わない。
    // これにより、解析モードで特定の時点まで戻した状態や、
    // 任意の盤面状態に対して、追加で手順を適用することが可能になる。

    const steps = input.split(',').filter(s => s.trim() !== "");
    
    try {
        // 2. 現在の盤面に対して指定の手順を適用
        steps.forEach(move => {
            executeMove(move, false, true); 
        });

        render();
        
        // 3. 通常通りパネルを閉じる
        toggleLogPanel();
        
        if (typeof addLog === 'function') {
            addLog("Scramble applied to current board state.");
        }
        
    } catch (err) {
        console.error("Scramble reproduce failed:", err);
        alert("Invalid scramble format.");
    } finally {
        // 4. 完了後に判定を解放
        setTimeout(() => {
            skipCompleteOnce = false;
            // 念のためこの時点で判定を一回走らせる
            checkComplete();
        }, 100);
    }
}

/**
 * 1. Scramble Import: Trigger file selection
 */
function triggerImport() {
    const input = document.getElementById('import-input');
    if (input) {
        input.value = ''; // Reset to allow re-selection of the same file
        input.click();
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
 * 効果音の再生（Web Audio API版：外部ファイル不要）
 */
function playSound(type) {
    // ブラウザの AudioContext を取得
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'move') {
        // パズルの移動音：短く高い「カチッ」という音
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'flash') {
        // フラッシュ音：少し長く、低音から高音へ抜ける音
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    }
}

/**
 * 動画モード用パネルの開閉
 */
function toggleVideoPanel() {
    const vPanel = document.getElementById('v2-video-uploader');
    const iPanel = document.getElementById('v2-media-uploader'); // 画像パネル
    const vBtn = document.getElementById('v2-video-toggle');

    if (!vPanel) return;

    // 画像パネルが開いていれば閉じる
    if (iPanel && iPanel.style.display !== 'none') {
        toggleV2Panel(); 
    }

    const isHidden = (vPanel.style.display === 'none' || vPanel.style.display === '');

    if (isHidden) {
        vPanel.style.display = 'block';
        vBtn.classList.add('active');
    } else {
        vPanel.style.display = 'none';
        vBtn.classList.remove('active');
    }
}

window.mediaManager = new MediaManager();
