let subSize = 2;    
let gridNum = 3;    
let board = [];
let targetBoard = null;
let solveHistory = [];

let cellSizePixel = 42; 
let GAP_FACE = 10; 
const GAP_CELL = 2;  

let startX = 0, startY = 0, isDragging = false, moveMode = 'standard'; 
let activeRow = -1, activeCol = -1, dragAxis = null, currentTranslate = 0;
let ghostStrips = [];
let longPressTimer = null;
const LONG_PRESS_MS = 200;

// 統計・タイマー管理用（一本化）
let moveCount = 0;
let startTime = 0;
let timerId = null;
let rotateTimerId = null;
let isLogEnabled = true; // デフォルトは有効



/**
 * --- 1. 初期化・モード管理 ---
 */

window.addEventListener('DOMContentLoaded', () => {
    const title = document.querySelector('p[onclick]');
    if (title) {
        title.addEventListener('touchstart', () => toggleMenu(), { passive: true });
    }
    initBoard();
});

/**
 * Monitor Key States for UI Feedback
 */
window.addEventListener('keydown', (e) => {
    updateKeyIndicator(e, true);
});

window.addEventListener('keyup', (e) => {
    updateKeyIndicator(e, false);
});

/**
 * フォーカスが外れた際にインジケーターを強制リセット（光りっぱなし防止）
 */
window.addEventListener('blur', () => {
    document.querySelectorAll('.key-indicator').forEach(el => {
        el.classList.remove('key-active');
    });
});

/**
 * インジケーターの表示更新
 */
function updateKeyIndicator(e, isActive) {
    const indicators = document.querySelectorAll('.key-indicator');
    indicators.forEach(el => {
        const keyText = el.innerText.toUpperCase();
        
        // e.key の厳密な判定（Shift, Control）
        if ((keyText === 'SHIFT' && e.key === 'Shift') || 
            (keyText === 'CTRL' && e.key === 'Control')) {
            
            if (isActive) {
                el.classList.add('key-active');
            } else {
                el.classList.remove('key-active');
            }
        }
    });
}
window.onmousemove = (e) => handleMove(e.clientX, e.clientY);
window.onmouseup = endDrag;
window.ontouchmove = (e) => { if(isDragging) { if(e.cancelable) e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); } };
window.ontouchend = endDrag;
window.rotateTimerId = window.rotateTimerId || null;
window.isFlashMode = false;
window.isSearchlightMode = false;
// ドラッグ終了（離した時）に暗幕を非表示にする
const originalEndDrag = endDrag;
window.endDrag = function() {
    originalEndDrag();
    if (window.isSearchlightMode) {
        document.getElementById('searchlight-overlay').classList.remove('searchlight-active');
    }
};
/**
 * toggleTimer の修正：スイッチが無効なら起動させない
 */
const originalToggleTimer = toggleTimer;
window.toggleTimer = function(forceState) {
    const shouldStart = (forceState !== undefined) ? forceState : !timerId;
    
    // ログ無効かつ開始しようとしている場合は拒否
    if (!isLogEnabled && shouldStart) {
        if (typeof addLog === 'function') addLog("Recording is disabled.");
        return;
    }
    
    originalToggleTimer(forceState);
};

/**
 * recordMove の修正：スイッチが無効なら記録しない
 */
const originalRecordMove = recordMove;
window.recordMove = function(lineIdx, dir, steps, mode) {
    if (!isLogEnabled) return;
    originalRecordMove(lineIdx, dir, steps, mode);
};

function handleModeChange(mode) {
    // 現在タイマーが動いている、または1手以上動かしている場合は保存して締める
    if (timerId || moveCount > 0) {
        saveSystemLog(false); // 未完了(isComplete=false)として保存
    }

    switch (mode) {
        case 'easy': changeMode(2, 2); break;
        case 'mid': changeMode(2, 3); break;
        case 'hard': changeMode(3, 3); break;
        case 'advance': changeMode(2, 4); break;
    }
}

function changeMode(sSize, gNum) {
    subSize = sSize; 
    gridNum = gNum;
    initBoard(true);
}

function calculateLayout() {
    const isMobile = window.innerWidth < 600;
    const totalSize = subSize * gridNum;
    const usableWidth = isMobile 
        ? Math.min(window.innerWidth, document.documentElement.clientWidth) - 60 
        : 500;

    GAP_FACE = (gridNum <= 2) ? 4 : 6; 
    const totalFaceGaps = (gridNum - 1) * GAP_FACE;
    const totalCellGaps = (totalSize - gridNum) * GAP_CELL;
    cellSizePixel = Math.floor((usableWidth - totalFaceGaps - totalCellGaps) / totalSize);

    if (isMobile) {
        const maxCell = (totalSize > 6) ? 32 : 60;
        cellSizePixel = Math.max(25, Math.min(maxCell, cellSizePixel));
    } else {
        cellSizePixel = Math.max(40, Math.min(55, cellSizePixel));
    }
}

function initBoard(resetTarget = false) {
    // ★ 追加：リセット時は強制的にタイマーを停止し、ロックを解除する
    if (timerId) {
        toggleTimer(false); 
    } else {
        // タイマーが動いていなくても、念のためロックを解除（不整合の防止）
        setInterfaceLock(false);
    }

    calculateLayout();
    const totalSize = subSize * gridNum;

    if (resetTarget || !targetBoard) {
        targetBoard = Array.from({length: totalSize}, (_, r) => 
            Array.from({length: totalSize}, (_, c) => 
                Math.floor(r / subSize) * gridNum + Math.floor(c / subSize)
            )
        );
    }

    board = Array.from({length: totalSize}, (_, r) => 
        Array.from({length: totalSize}, (_, c) => 
            Math.floor(r / subSize) * gridNum + Math.floor(c / subSize)
        )
    );

    resetStats(); 
    clearSolveLog();
    render();
    renderPreview(); 
    renderCoordinates();
}

function toggleTimer(forceState) {
    const display = document.getElementById('timer-display');
    const btn = document.querySelector('button[onclick="toggleTimer()"]');
    
    const shouldStart = (forceState !== undefined) ? forceState : !timerId;

    if (!shouldStart) {
        // 停止処理
        if (timerId) { clearInterval(timerId); timerId = null; }
        if (btn) btn.classList.remove('active-toggle');
        
        // 【重要】タイマー停止と同時にローテートの動作（枠とカウント）を停止
        stopRotateIntervalOnly();
        setInterfaceLock(false);
    } else {
        // 開始処理
        if (timerId) return;
        
        startTime = performance.now();
        timerId = setInterval(() => {
            const diff = performance.now() - startTime;
            const m = Math.floor(diff / 60000).toString().padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            const ms = Math.floor(diff % 1000).toString().padStart(3, '0');
            if (display) display.textContent = `${m}:${s}.${ms}`;
        }, 10);
        if (btn) btn.classList.add('active-toggle');

        setInterfaceLock(true);

        // 【重要】タイマー開始時、ローテートボタンが予約（赤点灯）状態ならカウント開始
        const rotateBtn = document.querySelector('button[onclick="startRotateCountdown()"]');
        if (rotateBtn && rotateBtn.classList.contains('active-toggle-red')) {
            if (!window.rotateTimerId) executeRotateLoop(); 
        }
    }
}

/**
 * ギミック操作ボタンのロック状態を一括制御
 */
function setGimmickButtonsLock(isLocked) {
    const gimmickButtons = [
        'button[onclick="startRotateCountdown()"]',
        'button[onclick="toggleFlash()"]',
        'button[onclick="toggleSearchlight()"]'
    ];
    
    gimmickButtons.forEach(selector => {
        const btn = document.querySelector(selector);
        if (btn) {
            btn.disabled = isLocked;
            btn.style.opacity = isLocked ? "0.5" : "1";
            btn.style.cursor = isLocked ? "not-allowed" : "pointer";
        }
    });
}

function incrementCounter() {
    moveCount++;
    const display = document.getElementById('counter-display');
    if (display) {
        display.textContent = moveCount.toString().padStart(3, '0');
    }
}

/**
 * 全統計のリセット（Resetボタンから呼び出し）
 */
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

    // 4. コンプリート表示（status-board / status-preview）を確実に消去
    hideCompleteOverlays();

    // 5. 統計数値の初期化
    moveCount = 0;
    const timerEl = document.getElementById('timer-display');
    const counterEl = document.getElementById('counter-display');
    if (timerEl) timerEl.textContent = "00:00.000";
    if (counterEl) counterEl.textContent = "000";
    
    // 6. タイマーボタンの光を消す
    const timerBtn = document.querySelector('button[onclick="toggleTimer()"]');
    if (timerBtn) timerBtn.classList.remove('active-toggle');
}

function render() {
    const container = document.getElementById('board'); 
    if (!container) return;
    container.style.gridTemplateColumns = `repeat(${gridNum}, 1fr)`; 
    container.style.gap = `${GAP_FACE}px`; 
    container.innerHTML = '';

    const totalCells = subSize * gridNum;

    for (let f = 0; f < gridNum * gridNum; f++) {
        const faceEl = document.createElement('div');
        faceEl.className = 'face'; 
        faceEl.id = `face-${f}`;
        faceEl.style.gridTemplateColumns = `repeat(${subSize}, ${cellSizePixel}px)`;
        
        const fr = Math.floor(f / gridNum) * subSize;
        const fc = (f % gridNum) * subSize;

        for (let r = 0; r < subSize; r++) {
            for (let c = 0; c < subSize; c++) {
                const cell = document.createElement('div');
                const col = fc + c;
                const row = fr + r;
                
                cell.dataset.row = row; 
                cell.dataset.col = col;
                const value = board[row][col]; // 現在この位置にあるタイルの値

                if (window.mediaManager && window.mediaManager.mode !== 'color' && window.mediaManager.mediaSrc) {
                    // ★重要：タイル移動に対応するため「そのタイル本来の絶対座標」を計算
                    // targetBoard[row][col] は初期状態の 0,0,1,1... を保持しているため、
                    // それを利用して「どのFaceの、どの位置(r,c)のタイルか」を特定し、絶対通し番号に変換
                    const originalFace = value;
                    const faceR = Math.floor(originalFace / gridNum);
                    const faceC = originalFace % gridNum;
                    
                    // 初期配置におけるこのタイルの絶対座標を復元
                    const originalAbsRow = faceR * subSize + r;
                    const originalAbsCol = faceC * subSize + c;
                    const originalAbsValue = originalAbsRow * totalCells + originalAbsCol;

                    window.mediaManager.applyMediaStyle(cell, originalAbsValue);
                    cell.className = 'cell';
                    // cell.innerText = value;
                } else {
                    cell.className = `cell c${value}`;
                    // cell.innerText = value;
                }
                cell.innerText = "";

                cell.style.width = cell.style.height = `${cellSizePixel}px`;

                // render() 内のイベント付与部分
                cell.onmousedown = (e) => {
                    if(typeof isFlashMode !== 'undefined' && isFlashMode) triggerFlash(value);
                    handleStart(row, col, f, e.clientX, e.clientY, 'mouse', e);
                };
                cell.ontouchstart = (e) => {
                    if(typeof isFlashMode !== 'undefined' && isFlashMode) triggerFlash(value);
                    handleStart(row, col, f, e.touches[0].clientX, e.touches[0].clientY, 'touch', e);
                };
                faceEl.appendChild(cell);
            }
        }
        container.appendChild(faceEl);
    }
}

/**
 * ターゲットプレビューの描画（メディアモード対応）
 * 正方形トリミング（objectFit: cover）を適用
 */
function renderPreview() {
    const container = document.getElementById('preview');
    if (!container || !targetBoard) return;

    container.innerHTML = '';
    
    const totalSize = subSize * gridNum;
    const pSize = totalSize > 6 ? 8 : 12;
    const gap = 1;
    const gridPx = (pSize * totalSize) + (gap * (totalSize - 1));

    // 親コンテナのサイズを正方形に固定
    container.style.width = `${gridPx}px`;
    container.style.height = `${gridPx}px`;

    if (window.mediaManager && window.mediaManager.mode !== 'color' && window.mediaManager.mediaSrc) {
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.overflow = 'hidden';
        
        const el = window.mediaManager.mode === 'image' ? new Image() : document.createElement('video');
        el.src = window.mediaManager.mediaSrc;
        
        // 修正ポイント：100%の枠内でアスペクト比を維持しつつ中央を切り抜く
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.objectFit = 'cover'; // contain から cover に変更

        if (window.mediaManager.mode === 'video') {
            el.autoplay = true; el.muted = true; el.loop = true; el.playsInline = true;
        }
        container.appendChild(el);
    } else {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${totalSize}, ${pSize}px)`;
        container.style.gap = `${gap}px`;

        for (let r = 0; r < totalSize; r++) {
            for (let c = 0; c < totalSize; c++) {
                const cell = document.createElement('div');
                cell.className = `preview-cell c${targetBoard[r][c]}`;
                cell.style.width = `${pSize}px`;
                cell.style.height = `${pSize}px`;
                cell.innerText = ""; 
                container.appendChild(cell);
            }
        }
    }
}

function renderCoordinates() {
    const axisTop = document.getElementById('axis-top'), axisLeft = document.getElementById('axis-left');
    if (!axisTop || !axisLeft) return;
    axisTop.style.gridTemplateColumns = `repeat(${gridNum}, 1fr)`; 
    axisLeft.style.gridTemplateRows = `repeat(${gridNum}, 1fr)`;
    axisTop.innerHTML = ''; axisLeft.innerHTML = '';
    let colIdx = 1, rowIdx = 0;
    for(let g=0; g<gridNum; g++) {
        const gh = document.createElement('div'); gh.style.display = 'grid'; gh.style.gridTemplateColumns = `repeat(${subSize}, ${cellSizePixel}px)`;
        for(let s=0; s<subSize; s++) {
            const l = document.createElement('div'); l.className = 'coord-label'; l.innerText = colIdx++; gh.appendChild(l);
        }
        axisTop.appendChild(gh);
        const gv = document.createElement('div'); gv.style.display = 'grid'; gv.style.gridTemplateRows = `repeat(${subSize}, ${cellSizePixel}px)`;
        for(let s=0; s<subSize; s++) {
            const l = document.createElement('div'); l.className = 'coord-label'; l.innerText = String.fromCharCode(65 + rowIdx++); gv.appendChild(l);
        }
        axisLeft.appendChild(gv);
    }
}

/**
 * --- 4. ドラッグ操作・ゴースト描画 ---
 */

function handleStart(r, c, f, x, y, type, event) {
    if (isDragging) return;
    isDragging = true; startX = x; startY = y; activeRow = r; activeCol = c;
    
    if (type === 'mouse') {
        moveMode = event.ctrlKey ? 'cheat' : (event.shiftKey ? 'frame' : 'standard');
        if (moveMode === 'frame') updateFrameHighlight(true);
    } else {
        moveMode = 'standard';
        // 250msで発動。指を動かす前に「枠モード」への切り替えを完了させる
        longPressTimer = setTimeout(() => { 
            moveMode = 'frame'; 
            if (navigator.vibrate) navigator.vibrate(50);
            updateFrameHighlight(true); 
        }, LONG_PRESS_MS);
    }
    dragAxis = null; currentTranslate = 0;
}

function handleMove(curX, curY) {
    if (!isDragging) return;
    const dx = curX - startX, dy = curY - startY;
    if (!dragAxis) {
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            dragAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
            createGhosts(dragAxis);
            // ドラッグ開始確定時、枠モードなら再度強調
            if (moveMode === 'frame') updateFrameHighlight(true);
        } else return;
    }
    currentTranslate = (dragAxis === 'h') ? dx : dy;
    const ts = (dragAxis === 'h') ? `translateX(${currentTranslate}px)` : `translateY(${currentTranslate}px)`;
    ghostStrips.forEach(s => s.style.transform = ts);
}

function updateFrameHighlight(isActive) {
    document.querySelectorAll('.face').forEach(f => f.classList.remove('active-frame'));
    if (isActive && moveMode === 'frame') {
        const fIdx = Math.floor(activeRow / subSize) * gridNum + Math.floor(activeCol / subSize);
        const target = document.getElementById(`face-${fIdx}`);
        if (target) target.classList.add('active-frame');
    }
}

/**
 * ゴースト生成：セット間の隙間（GAP_FACE）を完全に再現
 */
function createGhosts(axis) {
    let indices = [];
    if (moveMode === 'frame') {
        const start = (axis === 'h') ? Math.floor(activeRow / subSize) * subSize : Math.floor(activeCol / subSize) * subSize;
        for (let i = 0; i < subSize; i++) indices.push(start + i);
    } else {
        indices.push(axis === 'h' ? activeRow : activeCol);
    }

    const wrapper = document.getElementById('board-wrapper');
    const wrapRect = wrapper.getBoundingClientRect();
    const PADDING = 10; // CSSの padding: 10px !important と同期

    indices.forEach(idx => {
        const strip = document.createElement('div');
        strip.className = 'ghost-strip';
        const cells = [];
        
        document.querySelectorAll('.cell').forEach(c => {
            const r = parseInt(c.dataset.row), col = parseInt(c.dataset.col);
            if ((axis === 'h' && r === idx) || (axis === 'v' && col === idx)) {
                cells.push({ el: c, k: (axis === 'h' ? col : r) });
            }
        });
        cells.sort((a, b) => a.k - b.k);

        const firstRect = cells[0].el.getBoundingClientRect();
        
        // wrapperの左上を(0,0)とした相対座標を計算
        const bL = firstRect.left - wrapRect.left;
        const bT = firstRect.top - wrapRect.top;
        
        strip.style.left = bL + 'px';
        strip.style.top = bT + 'px';
        strip.style.gap = `${GAP_FACE}px`; 

        const createSet = () => {
            const d = document.createElement('div');
            d.style.display = (axis === 'h') ? 'flex' : 'grid';
            d.style.gap = `${GAP_CELL}px`;
            if (axis === 'v') d.style.gridTemplateColumns = '1fr';

            cells.forEach((item, i) => {
                const clone = item.el.cloneNode(true);
                clone.style.opacity = '1';
                if (i > 0 && i % subSize === 0) {
                    if (axis === 'h') clone.style.marginLeft = `${GAP_FACE - GAP_CELL}px`;
                    else clone.style.marginTop = `${GAP_FACE - GAP_CELL}px`;
                }
                d.appendChild(clone);
            });
            return d;
        };

        const boardW = wrapRect.width - (PADDING * 2);
        const boardH = wrapRect.height - (PADDING * 2);

        if (axis === 'v') {
            strip.style.flexDirection = 'column';
            strip.style.top = (bT - boardH - GAP_FACE) + 'px'; 
            strip.appendChild(createSet()); strip.appendChild(createSet()); strip.appendChild(createSet());
        } else {
            strip.style.flexDirection = 'row';
            strip.style.left = (bL - boardW - GAP_FACE) + 'px';
            strip.appendChild(createSet()); strip.appendChild(createSet()); strip.appendChild(createSet());
        }

        wrapper.appendChild(strip);
        ghostStrips.push(strip);
        cells.forEach(item => item.el.style.opacity = '0.2');
    });
}

/**
 * endDrag: 既存の関数をこの内容で上書きしてください
 */
function endDrag() {
    updateFrameHighlight(false);
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (!isDragging || !dragAxis) { resetDragState(); return; }
    
    const faceW = (cellSizePixel * subSize) + (GAP_CELL * (subSize - 1));
    const unit = (moveMode === 'cheat') ? (cellSizePixel + GAP_CELL) : (faceW + GAP_FACE);
    const steps = Math.round(currentTranslate / unit);

    setTimeout(() => {
        if (steps !== 0) {
            const isV = (dragAxis === 'v');
            const dir = isV ? (steps < 0 ? "U" : "D") : (steps < 0 ? "L" : "R");
            const loops = Math.abs(steps) * ((moveMode === 'cheat') ? 1 : subSize);
            const lines = (moveMode === 'frame') ? subSize : 1;
            const startIdx = (dragAxis === 'h') ? Math.floor(activeRow / subSize) * subSize : Math.floor(activeCol / subSize) * subSize;

            for(let l = 0; l < lines; l++) {
                let idx = (moveMode === 'frame') ? startIdx + l : (isV ? activeCol : activeRow);
                recordMove(idx, dir, Math.abs(steps), moveMode);
                for(let i = 0; i < loops; i++) moveLogic(idx, isV, steps < 0);
            }

            // ★ チートモード(Ctrl)使用時はセッションを強制終了
            if (moveMode === 'cheat') {
                forceStopSession();
            } else {
                checkComplete();
            }
        }
        resetDragState();
    }, 100);
}

/**
 * forceStopSession: セッションの強制終了ロジック
 */
function forceStopSession() {
    // 1. タイマー停止
    if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
    
    // 2. UI状態のリセット
    const timerBtn = document.querySelector('button[onclick="toggleTimer()"]');
    if (timerBtn) timerBtn.classList.remove('active-toggle');
    
    stopRotateIntervalOnly();
    setInterfaceLock(false);
    
    // 3. ログの整合性保持のため、未完了状態で一度保存
    saveSystemLog(false);
    
    if (typeof addLog === 'function') {
        addLog("Cheat move detected. Session terminated.");
    }
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
        overlay.style.display = 'none';
        if (window.isReplayMode && mediaControls) {
            mediaControls.style.visibility = 'visible';
            mediaControls.style.opacity = '1';
            const isComplete = (window.currentReplayIdx === window.replaySteps.length);
            if (isComplete && statusBoard) {
                statusBoard.classList.add('show');
            }
        }
    }
}

/**
 * 盤面とターゲット上のコンプリート表示を一括で隠す共通関数
 */
function hideCompleteOverlays() {
    const sb = document.getElementById('status-board');
    const sp = document.getElementById('status-preview');
    if (sb) sb.classList.remove('show');
    if (sp) sp.classList.remove('show');
}

function moveLogic(idx, isV, isRev) {
    const t = subSize * gridNum;
    if (isV) {
        if (isRev) {
            let temp = board[0][idx]; for (let i = 0; i < t - 1; i++) board[i][idx] = board[i+1][idx]; board[t-1][idx] = temp;
        } else {
            let temp = board[t-1][idx]; for (let i = t-1; i > 0; i--) board[i][idx] = board[i-1][idx]; board[0][idx] = temp;
        }
    } else {
        if (isRev) board[idx].push(board[idx].shift()); else board[idx].unshift(board[idx].pop());
    }
}

function rotateBoard() {
    const wrapper = document.getElementById('board-wrapper');
    
    // 1. 物理的な回転演出を開始
    wrapper.classList.add('board-rotating');

    // 2. アニメーション（0.4s）が終わるタイミングでデータの中身を書き換える
    setTimeout(() => {
        // --- 内部ロジック実行 ---
        if (rotateTimerId) { clearInterval(rotateTimerId); rotateTimerId = null; }
        updateFrameProgress('rotate', 0);

        const totalSize = subSize * gridNum;
        let newBoard = Array.from({length: totalSize}, () => []);
        for (let r = 0; r < totalSize; r++) {
            for (let c = 0; c < totalSize; c++) {
                newBoard[c][totalSize - 1 - r] = board[r][c];
            }
        }
        board = newBoard;

        // 3. 描画更新
        render();
        checkComplete();

        // 4. 回転クラスを削除（位置を0度に戻すが、中身が既に回っているので見た目は維持される）
        wrapper.classList.remove('board-rotating');
        
    }, 400); // CSSの 0.4s と同期
}
function recordMove(lineIdx, dir, steps, mode) {
	// 最初の操作でタイマーが止まっていたら動かす
    if (!timerId) toggleTimer(true);

	// 操作が開始されたので、判定スルーを解除
    skipCompleteOnce = false;// 操作が開始されたので、判定スルーを解除

    incrementCounter();
    const isV = (dir === 'U' || dir === 'D');
    let label = isV ? (lineIdx + 1) : String.fromCharCode(65 + lineIdx).toLowerCase();
    const logEntry = `${label}-${dir}${steps}`;
    solveHistory.push(logEntry);
    const logInput = document.getElementById('solve-log');
    if (logInput) logInput.value = solveHistory.join(',');
}

/**
 * --- 6. ユーティリティ・演出 ---
 */
/**
 * 4. 判定・統計
 */
function shuffle() {
    const count = parseInt(document.getElementById('scramble-count').value) || 15;
    resetStats();

    // --- 1. 盤面データの論理計算のみを先に実行 ---
    for (let i = 0; i < count; i++) {
        const isV = Math.random() > 0.5;
        const isRev = Math.random() > 0.5;
        const lineIdx = Math.floor(Math.random() * (subSize * gridNum));
        
        for (let j = 0; j < subSize; j++) {
            moveLogic(lineIdx, isV, isRev);
        }
    }

    // --- 2. ターゲット（正解配置）の枠単位置換を計算 ---
    // ★修正：画像モード以外（カラーモード）の時のみ実行する
    if (!window.mediaManager || window.mediaManager.mode === 'color') {
        const totalFaces = gridNum * gridNum;
        let faces = Array.from({length: totalFaces}, (_, i) => i);
        for (let i = 0; i < 20; i++) {
            const isV = Math.random() > 0.5;
            const isRev = Math.random() > 0.5;
            const line = Math.floor(Math.random() * gridNum);
            let idxs = [];
            if (isV) for (let g = 0; g < gridNum; g++) idxs.push(g * gridNum + line);
            else for (let g = 0; g < gridNum; g++) idxs.push(line * gridNum + g);

            if (isRev) {
                let temp = faces[idxs[0]];
                for (let j = 0; j < gridNum - 1; j++) faces[idxs[j]] = faces[idxs[j+1]];
                faces[idxs[gridNum-1]] = temp;
            } else {
                let temp = faces[idxs[gridNum-1]];
                for (let j = gridNum - 1; j > 0; j--) faces[idxs[j]] = faces[idxs[j-1]];
                faces[idxs[0]] = temp;
            }
        }

        // ターゲットボードの更新（カラーモード用）
        const totalSize = subSize * gridNum;
        targetBoard = Array.from({length: totalSize}, (_, r) => 
            Array.from({length: totalSize}, (_, c) => faces[Math.floor(r / subSize) * gridNum + Math.floor(c / subSize)])
        );
    } else {
        // ★画像モードの場合：targetBoard は初期状態（完成図）のまま一切変更しない
        // initBoard で生成された絶対座標の並びを維持する
    }

    // --- 3. 最後に1回だけDOMを更新する ---
    renderPreview(); 
    render(); 
    checkComplete(); 
}

/**
 * 盤面判定の修正
 */
function checkComplete() {
    if (!targetBoard) return;
    const totalSize = subSize * gridNum;
    let isComplete = true;

    for (let r = 0; r < totalSize; r++) {
        for (let c = 0; c < totalSize; c++) {
            if (board[r][c] !== targetBoard[r][c]) { isComplete = false; break; }
        }
        if (!isComplete) break;
    }

    if (isComplete && !skipCompleteOnce) {
        // 【論理修正】解析モード中、またはRECオフ時は保存処理・終了演出を一切行わず終了
        if (window.isReplayMode || !isLogEnabled) {
            return;
        }

        // 1. 通常タイマー停止
        toggleTimer(false);

        // 2. 回転ギミックが動いている場合は停止してスイッチオフ
        if (window.rotateTimerId) {
            startRotateCountdown();
        }
        
        // 履歴保存
        saveSystemLog(true); 
        
        // 3. コンプリート表示（オーバーレイ表示）
        document.getElementById('status-board')?.classList.add('show');
        document.getElementById('status-preview')?.classList.add('show');

    } else {
        // 未完成時、または skipCompleteOnce が有効な時は表示を消す
        document.getElementById('status-board')?.classList.remove('show');
        document.getElementById('status-preview')?.classList.remove('show');
    }
}

function updateFrameProgress(id, percent) {
    const el = document.getElementById(`${id}-frame`);
    if (!el) return;
    el.style.opacity = percent > 0 ? '1' : '0';
    el.style.background = `conic-gradient(currentColor ${percent}%, transparent ${percent}%)`;
}

function resetDragState() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    ghostStrips.forEach(el => el.remove());
    ghostStrips = [];
    render();
    isDragging = false;
}

function clearSolveLog() {
    solveHistory = [];
    const logInput = document.getElementById('solve-log');
    if (logInput) logInput.value = '';
}

function toggleMenu() {
    document.querySelector('.menu-panel')?.classList.toggle('hidden');
}

let skipCompleteOnce = false;

/**
 * 現在の盤面をターゲットにコピーする（判定をスルーする）
 */
function copyCurrentToTarget() {
    targetBoard = JSON.parse(JSON.stringify(board));
    renderPreview();
    
    // 次回の判定時のみ、一致していても表示をスルーする
    skipCompleteOnce = true;
    checkComplete();
}

function toggleFlash() {
    window.isFlashMode = !window.isFlashMode;
    const btn = document.querySelector('button[onclick="toggleFlash()"]');
    if (btn) btn.classList.toggle('active-toggle', window.isFlashMode);
}

function triggerFlash(clickedValue) {
    if (clickedValue === undefined) return;

    // 盤面上の全セルを走査
    document.querySelectorAll('.cell').forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        
        // 現在の盤面座標(r, c)にあるタイルの値を取得
        const currentValue = board[r][c];

        // クリックされた値と現在のマスの値が一致すればフラッシュ
        // カラーモードなら Face番号(0,0,1,1...)、画像モードなら絶対ID(0,1,2,3...)で判定
        if (currentValue === clickedValue) {
            cell.classList.add('flash-active');
            
            // 既存タイマーをクリア
            const t = cell.getAttribute('data-f-t');
            if (t) clearTimeout(parseInt(t));

            const timer = setTimeout(() => {
                cell.classList.remove('flash-active');
            }, 300);
            cell.setAttribute('data-f-t', timer);
        }
    });
}

/**
 * startRotateCountdown
 * ボタンの点灯状態（予約）のみを切り替える
 */
function startRotateCountdown() {
    const btn = document.querySelector('button[onclick="startRotateCountdown()"]');
    if (!btn) return;

    const isReserved = btn.classList.contains('active-toggle-red');

    if (isReserved) {
        // 予約解除
        btn.classList.remove('active-toggle-red');
        stopRotateIntervalOnly();
    } else {
        // 予約点灯
        btn.classList.add('active-toggle-red');
        
        // タイマーが既に動いている場合のみ、即座にカウントダウン（枠表示）を開始
        if (timerId && !window.rotateTimerId) {
            executeRotateLoop();
        }
    }
}

/**
 * 回転カウントダウン（ループ対応・コンプリート連動版）
 */
// script.js の startRotateCountdown 関数を以下に差し替え
/**
 * ローテート動作のみを物理的に停止する（設定は維持）
 */
function stopRotateIntervalOnly() {
    if (window.rotateTimerId) {
        clearInterval(window.rotateTimerId);
        window.rotateTimerId = null;
    }
    const frame = document.getElementById('rotate-frame');
    if (frame) {
        frame.classList.remove('fx-active');
        frame.style.display = 'none';
    }
}

function executeRotateLoop() {
    const frame = document.getElementById('rotate-frame');
    const n = subSize * gridNum;
    const perimeterCells = (n * 4) - 4;
    const duration = perimeterCells * 3000; // 1セル3秒計算
    const interval = 50; // 描画更新間隔
    let elapsed = 0;

    if (frame) {
        frame.style.display = 'block';
        frame.classList.add('fx-active');
    }

    window.rotateTimerId = setInterval(() => {
        // コンプリートや停止時は即座に抜ける
        if (document.getElementById('status-board')?.classList.contains('show')) {
            stopRotateIntervalOnly();
            return;
        }

        elapsed += interval;
        const progress = 100 - (elapsed / duration * 100);

        if (frame) {
            const mask = `conic-gradient(black ${progress}%, transparent ${progress}%)`;
            frame.style.webkitMaskImage = mask;
            frame.style.maskImage = mask;
        }

        if (elapsed >= duration) {
            rotateBoard(); // 内部で一旦停止し、描画を更新
            elapsed = 0;   // ループ
        }
    }, interval);
}

/**
 * サーチライトモードの切り替え
 * オフにした際、同時にコンプリート表示（オーバーレイ）も物理的に消去する
 */
function toggleSearchlight() {
    window.isSearchlightMode = !window.isSearchlightMode;
    const btn = document.querySelector('button[onclick="toggleSearchlight()"]');
    const overlay = document.getElementById('searchlight-overlay');
    
    if (btn) btn.classList.toggle('active-toggle', window.isSearchlightMode);
    
    if (!window.isSearchlightMode) {
        // 1. サーチライト要素を物理削除してキャッシュをリセット
        if (overlay) {
            overlay.remove();
        }
        
        // 2. 指示通り、ここにコンプリート表示を消す処理を統合
        hideCompleteOverlays();
        
    } else {
        // オンにする際の生成処理
        if (!overlay) {
            const newOverlay = document.createElement('div');
            newOverlay.id = 'searchlight-overlay';
            newOverlay.className = 'searchlight-overlay';
            document.getElementById('board-wrapper').appendChild(newOverlay);
        }
    }
}

/**
 * サーチライト座標更新
 */
function updateSearchlight(x, y) {
    if (!window.isSearchlightMode) return;
    const overlay = document.getElementById('searchlight-overlay');
    if (!overlay) return;

    // タイマー停止中はオープン
    if (!timerId) {
        overlay.classList.remove('fx-active');
        return;
    }

    const wrapper = document.getElementById('board-wrapper');
    const rect = wrapper.getBoundingClientRect();
    const relX = x - rect.left;
    const relY = y - rect.top;

    overlay.classList.add('fx-active'); // 表示
    
    const mask = `radial-gradient(circle 80px at ${relX}px ${relY}px, transparent 95%, black 100%)`;
    overlay.style.webkitMaskImage = mask;
    overlay.style.maskImage = mask;
}

// 既存のイベントハンドラにフックを追加
const originalHandleStart = handleStart;
handleStart = function(r, c, f, x, y, type, event) {
    originalHandleStart(r, c, f, x, y, type, event);
    updateSearchlight(x, y);
};

const originalHandleMove = handleMove;
handleMove = function(curX, curY) {
    originalHandleMove(curX, curY);
    updateSearchlight(curX, curY);
};


/**
 * Scramble Box内のコードを解析し、ターゲット盤面に反映（1ベースのラベルに対応）
 */
function applyScrambleLog() {
    const input = document.getElementById('scramble-input').value;
    if (!input) return;

    const totalSize = subSize * gridNum;

    // 1. ターゲットを完成状態で初期化
    targetBoard = Array.from({ length: totalSize }, (_, r) =>
        Array.from({ length: totalSize }, (_, c) => {
            const rowGroup = Math.floor(r / subSize);
            const colGroup = Math.floor(c / subSize);
            return rowGroup * gridNum + colGroup;
        })
    );

    const moves = input.split(',');
    moves.forEach(move => {
        const cmd = move.trim().toLowerCase();
        if (!cmd.includes('-')) return;

        const [label, action] = cmd.split('-'); 
        
        // 2. ラベルの解析（1ベースを0ベースに変換）
        let lineIdx;
        let isVertical = false;

        if (!isNaN(label)) {
            // 数値の場合：列(Column)移動。1から始まるため -1 する
            lineIdx = parseInt(label) - 1; 
            isVertical = true;
        } else {
            // アルファベットの場合：行(Row)移動。a=0, b=1...
            lineIdx = label.charCodeAt(0) - 97;
            isVertical = false;
        }

        const dir = action[0].toUpperCase(); // U, D, R, L
        const blockStep = parseInt(action.substring(1)); // ブロック単位の移動距離

        // 範囲外チェック（0 ～ totalSize-1 の間であること）
        if (lineIdx < 0 || lineIdx >= totalSize || isNaN(blockStep)) return;

        const isReverse = (dir === 'R' || dir === 'D');

        // 3. セル抽出
        let cells = [];
        if (isVertical) {
            for (let r = 0; r < totalSize; r++) cells.push(targetBoard[r][lineIdx]);
        } else {
            for (let c = 0; c < totalSize; c++) cells.push(targetBoard[lineIdx][c]);
        }

        // 4. 移動距離（ブロックサイズ分）のスライド
        const totalStep = blockStep * subSize; 
        for (let s = 0; s < totalStep; s++) {
            if (isReverse) cells.unshift(cells.pop());
            else cells.push(cells.shift());
        }

        // 5. 書き戻し
        if (isVertical) {
            for (let r = 0; r < totalSize; r++) targetBoard[r][lineIdx] = cells[r];
        } else {
            for (let c = 0; c < totalSize; c++) targetBoard[lineIdx][c] = cells[c];
        }
    });

    renderPreview();
    localStorage.setItem('slp_target', JSON.stringify(targetBoard));
}

/**
 * 汎用ログ出力関数（未定義エラー防止）
 */
function addLog(msg) {
    console.log("LOG:", msg);
    // 既存のログリスト(log-list)があればそこにも出力
    const logList = document.getElementById('log-list');
    if (logList) {
        const li = document.createElement('li');
        li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logList.insertBefore(li, logList.firstChild);
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
 * 1. Scramble Import: Process the selected CSV file
 */
function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const scrambleInput = document.getElementById('scramble-input');
        if (scrambleInput) {
            // Remove newlines and extra spaces
            const content = e.target.result.replace(/[^A-Za-z0-9,\-]/g, "");
            scrambleInput.value = content;
            
            if (typeof addLog === 'function') {
                addLog("Scramble pattern imported from file.");
            }
            alert("Import successful: Scramble data loaded.");
        }
    };
    reader.onerror = () => alert("Failed to read the file.");
    reader.readAsText(file);
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
 * 2. Save CSV: Scramble or Solve pattern
 * @param {string} type - 'scramble' or 'solve'
 */
function saveCSV(type) {
    const inputId = (type === 'scramble') ? 'scramble-input' : 'solve-log';
    const inputElement = document.getElementById(inputId);
    
    if (!inputElement || !inputElement.value.trim()) {
        alert(`No ${type} data available to save.`);
        return;
    }

    const data = inputElement.value.trim();
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // タイムスタンプを付与したファイル名
    const timestamp = new Date().getTime();
    a.href = url;
    a.download = `${type}_pattern_${timestamp}.csv`;
    
    document.body.appendChild(a);
    a.click();
    
    // 後処理
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);

    if (typeof addLog === 'function') {
        addLog(`${type.charAt(0).toUpperCase() + type.slice(1)} data saved to CSV.`);
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

    // 現在のギミック状態
    const gimmicks = {
        rotate: !!document.querySelector('button[onclick="startRotateCountdown()"].active-toggle-red'),
        flash: window.isFlashMode,
        searchlight: window.isSearchlightMode
    };

    const logEntry = {
        timestamp: new Date().toLocaleString(),
        grid_size: gridNum,
        sub_size: subSize,
        scramble_log: scLog,
        solve_history: slLog,
        solve_time: time,
        step_count: moves,
        gimmicks: gimmicks,
        target_state: targetBoard, // ターゲット配色そのものを保存
        is_complete: isComplete
    };

    // localStorageから取得 (最大400件の全体枠、表示時に各モード100件でフィルタ)
    let history = JSON.parse(localStorage.getItem('slp_history') || '[]');
    
    // 同一セッション（同じタイムスタンプや未完了の更新）の処理は今はシンプルに追加
    history.push(logEntry);

    // 全体で400件を超えないように制御（古いものから削除）
    if (history.length > 400) history.shift();

    localStorage.setItem('slp_history', JSON.stringify(history));

    // リストの表示更新（Behavior）
    if (typeof refreshHistoryList === 'function') refreshHistoryList();

	refreshHistoryList();
}

function refreshHistoryList() {
    const container = document.getElementById('history-list');
    if (!container) return;

    container.innerHTML = ""; 

    const history = JSON.parse(localStorage.getItem('slp_history') || '[]');
    
    const filtered = history.filter(h => 
        Number(h.grid_size) === gridNum && Number(h.sub_size) === subSize
    ).reverse();

    if (filtered.length === 0) {
        container.innerHTML = '<div style="color:#666; padding:20px; text-align:center;">No history for this mode.</div>';
        return;
    }

    container.innerHTML = filtered.map((data) => {
        const entryId = data.timestamp; 
        const dataStr = JSON.stringify(data).replace(/'/g, "\\'");

        // ステータスアイコンの判定
        const statusIcon = data.is_complete ? "✅" : "⚠️";
        const statusTitle = data.is_complete ? "Completed" : "Reset/Incomplete";

        return `
            <div class="history-item" style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid #333; cursor:pointer;">
                <div class="mini-target-icon" onclick='loadFilteredHistory(${dataStr})' style="flex-shrink:0;">
                    ${createMiniPreview(data.target_state)}
                </div>
                
                <div style="font-size:14px; flex-shrink:0;" title="${statusTitle}">
                    ${statusIcon}
                </div>

                <div style="flex-grow:1; font-size:12px;" onclick='loadFilteredHistory(${dataStr})'>
                    <div style="color:#aaa;">${data.timestamp}</div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#00ffcc; font-weight:bold;">${data.solve_time}</span>
                        <span style="color:#888;">${data.step_count} steps</span>
                    </div>
                </div>

                <button onclick="deleteHistoryEntry('${entryId}')" 
                        style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size:16px; padding:5px; flex-shrink:0;" 
                        title="Delete this log">🗑️</button>
            </div>
        `;
    }).join('');
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
 * ターゲット配色データから極小のHTMLプレビューアイコンを生成
 */
function createMiniPreview(state) {
    if (!state) return '';
    const size = state.length;
    const cellSize = 3; // アイコン内の1セルのpxサイズ
    
    let html = `<div style="display:grid; grid-template-columns:repeat(${size}, ${cellSize}px); gap:1px; background:#444; padding:1px; border-radius:1px;">`;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            // style.cssのc0, c1...クラスを流用
            html += `<div class="c${state[r][c]}" style="width:${cellSize}px; height:${cellSize}px;"></div>`;
        }
    }
    html += `</div>`;
    return html;
}

/**
 * ソルブ中のインターフェースロック制御
 * 生存させるもの：タイマー、リセット、3点メニュー(header内)
 */
function setInterfaceLock(isLocked) {
    const targetSelectors = [
        'button[onclick="copyCurrentToTarget()"]', // コピーボタン
        'button[onclick="startRotateCountdown()"]', // 回転
        'button[onclick="toggleFlash()"]',          // フラッシュ
        'button[onclick="toggleSearchlight()"]',    // サーチライト
        '#shuffle-btn',                             // Scrambleボタン
        '#mode-select',                             // モード選択
        '#scramble-count',                          // 回数入力
        '#replay-trigger'                           // 再生（リプレイ）ボタン ★追加
    ];
    
    targetSelectors.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
            el.disabled = isLocked;
            el.style.opacity = isLocked ? "0.3" : "1";
            el.style.cursor = isLocked ? "not-allowed" : "pointer";
            el.style.pointerEvents = isLocked ? "none" : "auto";
        }
    });

    // ログボタン(LOG)もソルブ中はロック
    const logBtn = document.querySelector('.log-btn');
    if (logBtn) {
        logBtn.disabled = isLocked;
        logBtn.style.opacity = isLocked ? "0.3" : "1";
        logBtn.style.pointerEvents = isLocked ? "none" : "auto";
    }
}

function loadFilteredHistory(data) {
    if (!data) return;

    targetBoard = JSON.parse(JSON.stringify(data.target_state));
    renderPreview();

    const scrambleInput = document.getElementById('scramble-input');
    const solveLog = document.getElementById('solve-log');
    if (scrambleInput) scrambleInput.value = data.scramble_log || "";
    if (solveLog) solveLog.value = data.solve_history || "";

    // --- 追加：解析モード表示用にタイムスタンプをグローバル保持 ---
    window.currentLogTime = data.solve_time;

    updateGimmickHistoryIcons(data.gimmicks);
    
    const oldPreview = document.getElementById('log-large-preview');
    if (oldPreview) oldPreview.remove();
}

/**
 * ダイアログ内：ターゲット配色の大型プレビュー表示
 */
function displayLargeTargetPreview(state) {
    const iconArea = document.getElementById('history-gimmick-display');
    if (!iconArea) return;

    // 既存のプレビューがあれば削除して重複を防ぐ
    const oldPreview = document.getElementById('log-large-preview');
    if (oldPreview) oldPreview.remove();

    const size = state.length;
    // モードに合わせてセルサイズを調整（2x2なら大きく、4x4なら小さく）
    const cellSize = size > 6 ? 10 : 16; 
    
    const previewWrapper = document.createElement('div');
    previewWrapper.id = 'log-large-preview';
    previewWrapper.style.cssText = `
        display: grid; 
        grid-template-columns: repeat(${size}, ${cellSize}px); 
        gap: 2px; 
        background: #000; 
        padding: 5px; 
        border: 2px solid #0f0; /* 目標物として強調 */
        border-radius: 4px;
        box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
    `;

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const cell = document.createElement('div');
            cell.className = `c${state[r][c]}`;
            cell.style.width = cell.style.height = `${cellSize}px`;
            previewWrapper.appendChild(cell);
        }
    }

    // ギミックアイコンの左側（先頭）に挿入
    iconArea.insertBefore(previewWrapper, iconArea.firstChild);
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
 * 解析用初期盤面構築
 */
function initBoardForAnalyze() {
    // 盤面をターゲット（正解状態）に同期
    board = JSON.parse(JSON.stringify(targetBoard));
    
    // Scrambleを実行して「解く前の状態」にする
    // ここで reproduceScramble() を呼び出し、boardを崩す
    reproduceScramble(); 
}

/**
 * 3. Reproduce Scramble (Updated)
 */
function reproduceScramble() {
    const input = document.getElementById('scramble-input').value;
    if (!input) return;

    // 1. 判定を一時的にスキップするフラグを立てる
    skipCompleteOnce = true;

    // 2. 盤面初期化
    initBoard();

    const steps = input.split(',').filter(s => s.trim() !== "");
    
    try {
        steps.forEach(move => {
            executeSingleMove(move, false);
        });

        render();
        
        // 3. 正常終了時はダイアログを閉じ、メッセージは出さない
        toggleLogPanel();
        
        if (typeof addLog === 'function') {
            addLog("Scramble pattern applied.");
        }
        
    } catch (err) {
        // エラー時のみ通知
        alert("Error: Invalid scramble code format.");
        console.error(err);
    } finally {
        // フラグを元に戻す
        skipCompleteOnce = false;
    }
}

/**
 * 記号（A-R1等）を解析して1手だけ動かす
 */
function executeSingleMove(moveStr, isReverseAction) {
    const cmd = moveStr.trim().toLowerCase();
    if (!cmd.includes('-')) return;

    const [label, action] = cmd.split('-');
    let lineIdx = isNaN(label) ? label.charCodeAt(0) - 97 : parseInt(label) - 1;
    let isV = !isNaN(label);
    let dir = action[0].toUpperCase();
    let steps = parseInt(action.substring(1)) * subSize;

    // Backボタン時は方向を反転させる
    let finalRev = (dir === 'R' || dir === 'D');
    if (isReverseAction) finalRev = !finalRev;

    for (let i = 0; i < steps; i++) {
        moveLogic(lineIdx, isV, finalRev);
    }
    render();
    checkComplete();
}

/**
 * startAnalyzeMode: タイマー表示をログの記録時刻に固定
 */
function startAnalyzeMode() {
    const solveLog = document.getElementById('solve-log').value;
    if (!solveLog) return;

    // --- 追加：選択されたログのタイムをタイマー表示に反映 ---
    const timerDisplay = document.getElementById('timer-display');
    // loadFilteredHistory等で保持した直近の記録データがある場合、そのタイムをセット
    if (timerDisplay && window.currentLogTime) {
        timerDisplay.textContent = window.currentLogTime;
    }

    window.replaySteps = solveLog.split(',').filter(s => s.trim() !== "");
    window.currentReplayIdx = window.replaySteps.length; 
    window.isReplayMode = true;

    board = JSON.parse(JSON.stringify(targetBoard));

    while (window.currentReplayIdx > 0) {
        window.currentReplayIdx--;
        const move = window.replaySteps[window.currentReplayIdx];
        executeSingleMove(move, true); 
    }

    toggleLogPanel();
    showMediaControls(true);
    render();
    updateReplayDisplay();
}

/**
 * Nextボタン（右）：手順を1手進め、盤面を「完成方向」に近づける（正方向実行）
 */
function replayStepNext() {
    if (!window.isReplayMode || window.currentReplayIdx >= window.replaySteps.length) return;

    const move = window.replaySteps[window.currentReplayIdx];
    executeSingleMove(move, false); // 正方向（解決）
    window.currentReplayIdx++;
    updateReplayDisplay();
}

/**
 * Backボタン（左）：手順を1手戻し、盤面を「過去（崩れた方向）」に戻す（逆方向実行）
 */
function replayStepBack() {
    if (!window.isReplayMode || window.currentReplayIdx <= 0) return;

    window.currentReplayIdx--;
    const move = window.replaySteps[window.currentReplayIdx];
    executeSingleMove(move, true); // 逆方向（巻き戻し）
    updateReplayDisplay();
}

function updateReplayDisplay() {
    const idxEl = document.getElementById('replay-index');
    const totalEl = document.getElementById('replay-total');
    const moveEl = document.getElementById('current-move-display');
    
    // 盤面カウンターのDOM要素（ID: move-count または counter-display）
    const boardCounter = document.getElementById('move-count') || document.getElementById('counter-display');

    if (idxEl) idxEl.innerText = window.currentReplayIdx;
    if (totalEl) totalEl.innerText = window.replaySteps.length;
    
    // --- 【修正】再生位置と盤面カウンターを完全同期 ---
    if (boardCounter) {
        // 表示を更新
        boardCounter.innerText = window.currentReplayIdx.toString().padStart(3, '0');
        // 内部変数 moveCount も同期（不整合を防止）
        moveCount = window.currentReplayIdx;
    }
    
    const isComplete = (window.currentReplayIdx === window.replaySteps.length);
    const isLogVisible = document.getElementById('log-overlay').style.display === 'block';

    if (moveEl) {
        moveEl.innerText = isComplete ? "COMPLETE" : (window.replaySteps[window.currentReplayIdx] || "END");
    }

    const nextBtn = document.querySelector('button[onclick="replayStepNext()"]');
    const backBtn = document.querySelector('button[onclick="replayStepBack()"]');
    if (nextBtn) nextBtn.disabled = isComplete;
    if (backBtn) backBtn.disabled = (window.currentReplayIdx <= 0);

    if (isComplete && !isLogVisible) {
        document.getElementById('status-board')?.classList.add('show');
    } else {
        document.getElementById('status-board')?.classList.remove('show');
    }
}

/**
 * サイドメニューの再生ボタン押下時の挙動
 * 1. メディアコントロール表示中 -> 解析モードを終了してコントロールを消す
 * 2. 非表示中 -> ログパネルを表示してログ選択を促す
 */
function toggleReplayMode() {
    const mediaControls = document.getElementById('media-controls');
    const isMediaVisible = mediaControls && mediaControls.classList.contains('active');

    if (isMediaVisible) {
        // メディアコントロールが表示されていたら消す（解析モード終了）
        window.isReplayMode = false;
        showMediaControls(false);
        
        if (window.autoPlayTimer) {
            clearInterval(window.autoPlayTimer);
            window.autoPlayTimer = null;
        }
        
        // 完了通知が出ていれば消す
        document.getElementById('status-board')?.classList.remove('show');
    } else {
        // 表示されていなければログダイアログを表示
        toggleLogPanel();
    }
}

/**
 * メディアコントロールの表示制御（Behavior）
 */
function showMediaControls(show) {
    const controls = document.getElementById('media-controls');
    const replayBtn = document.getElementById('replay-trigger');
    const titleContainer = document.querySelector('.title-container');

    if (show) {
        controls.style.display = 'flex';
        controls.classList.add('active');
        if (replayBtn) replayBtn.classList.add('active-toggle');
        if (titleContainer) titleContainer.style.opacity = "0.1"; // タイトルを薄くして視認性確保
    } else {
        controls.style.display = 'none';
        controls.classList.remove('active');
        if (replayBtn) replayBtn.classList.remove('active-toggle');
        if (titleContainer) titleContainer.style.opacity = "1";
    }
}

/**
 * 履歴をJSONファイルとして保存（Save）
 */
function exportHistory() {
    const historyData = localStorage.getItem('puzzleHistory');
    if (!historyData || historyData === '[]') {
        alert("保存する履歴がありません。");
        return;
    }

    const blob = new Blob([historyData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `puzzle_history_${timestamp}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
}

/**
 * JSONファイルから履歴を読み込み（Import）
 */
function importHistory() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (!Array.isArray(importedData)) throw new Error("Invalid format");

                // 既存の履歴と統合（重複排除はせず追加）
                const currentHistory = JSON.parse(localStorage.getItem('puzzleHistory') || '[]');
                const newHistory = [...importedData, ...currentHistory];
                
                // 最新100件などに制限する場合はここで調整
                localStorage.setItem('puzzleHistory', JSON.stringify(newHistory));
                
                // リストを更新
                if (typeof refreshHistoryList === 'function') refreshHistoryList();
                alert("履歴をインポートしました。");
            } catch (err) {
                alert("ファイルの形式が正しくありません。");
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

/**
 * 4. Backup History: Export all history data as a JSON file
 */
function saveBackupCSV() {
    const historyData = localStorage.getItem('slp_history');
    if (!historyData || historyData === '[]') {
        alert("No history data to backup.");
        return;
    }

    const blob = new Blob([historyData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    const timestamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `slp_history_backup_${timestamp}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    if (typeof addLog === 'function') addLog("History backup exported.");
}

/**
 * 4. Restore History: Trigger file selection
 */
function triggerRestore() {
    const input = document.getElementById('restore-input');
    if (input) {
        input.value = '';
        input.click();
    }
}

/**
 * 4. Restore History: Import and merge/overwrite history data
 */
function restoreHistory(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!Array.isArray(importedData)) throw new Error("Invalid format");

            // 既存の履歴を確認
            const currentHistory = JSON.parse(localStorage.getItem('slp_history') || '[]');
            
            // 統合（重複を避ける場合はタイムスタンプ等で比較が必要ですが、現在は単純追加）
            const newHistory = [...importedData, ...currentHistory];
            
            // 最大400件に制限
            const limitedHistory = newHistory.slice(-400);
            
            localStorage.setItem('slp_history', JSON.stringify(limitedHistory));
            
            refreshHistoryList();
            alert("History restored successfully.");
            
        } catch (err) {
            alert("Error: Invalid backup file format.");
            console.error(err);
        }
    };
    reader.readAsText(file);
}

/**
 * ログ記録スイッチの切り替え（アイコンボタン版）
 */
function toggleLogSwitch() {
    isLogEnabled = !isLogEnabled;
    const btn = document.getElementById('log-switch-btn');
    const icon = document.getElementById('log-check-icon');
    
    if (isLogEnabled) {
        btn.classList.add('active-rec');
        icon.innerText = "☑"; // チェックあり
        if (typeof addLog === 'function') addLog("Recording enabled.");
    } else {
        // 無効時はタイマーを強制停止
        if (timerId) toggleTimer(false);
        btn.classList.remove('active-rec');
        icon.innerText = "☐"; // チェックなし
        if (typeof addLog === 'function') addLog("Recording disabled.");
    }
}

/**
 * MediaManager: アスペクト比を計算し、タイルへの投影を最適化する
 */
class MediaManager {
    constructor() {
        this.mode = 'color';
        this.mediaElement = null;
        this.mediaSrc = null;
        this.baseScale = 1; // 拡大率
        this.offsetX = 0;   // 中心合わせ用X
        this.offsetY = 0;   // 中心合わせ用Y
    }

    async setupMedia(file) {
        const url = URL.createObjectURL(file);
        this.mediaSrc = url;

        if (file.type.startsWith('image/')) {
            this.mode = 'image';
            this.mediaElement = new Image();
            this.mediaElement.src = url;
            await this.mediaElement.decode();
            this.calculateContainOffset(this.mediaElement.width, this.mediaElement.height);
        } else if (file.type.startsWith('video/')) {
            this.mode = 'video';
            this.mediaElement = document.createElement('video');
            this.mediaElement.src = url;
            this.mediaElement.muted = true;
            this.mediaElement.loop = true;
            this.mediaElement.playsInline = true;
            this.mediaElement.onloadedmetadata = () => {
                this.calculateContainOffset(this.mediaElement.videoWidth, this.mediaElement.videoHeight);
                render(); 
            };
            await this.mediaElement.load();
        }
        updateV2StatusUI(this.mode);
        renderPreview();
        render();
    }

    /**
     * メディアが盤面(正方形)に対してどう収まるか計算する
     */
    calculateContainOffset(w, h) {
        // 短い方の辺を基準に100%に合わせる（Center Crop）
        const minSide = Math.min(w, h);
        this.baseScale = 1 / (minSide / Math.max(w, h)); // 比率
        
        // 中心座標のズレを計算 (0〜100%の範囲でオフセット)
        if (w > h) {
            this.offsetX = ((w - h) / 2 / w) * 100;
            this.offsetY = 0;
        } else {
            this.offsetX = 0;
            this.offsetY = ((h - w) / 2 / h) * 100;
        }
    }

// 引数を value から row, col に変更
applyMediaStyle(cell, value) {
    if (!this.mediaElement || !this.mediaSrc || value === undefined) return;

    const totalCells = subSize * gridNum; 
    const correctR = Math.floor(value / totalCells);
    const correctC = value % totalCells;

    const w = this.mediaElement.naturalWidth || this.mediaElement.videoWidth || 100;
    const h = this.mediaElement.naturalHeight || this.mediaElement.videoHeight || 100;
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

    cell.style.setProperty('background-image', `url(${this.mediaSrc})`, 'important');
    cell.style.setProperty('background-size', `${drawW}px ${drawH}px`, 'important');
    cell.style.setProperty('background-position', `${posX}px ${posY}px`, 'important');
    cell.style.setProperty('background-repeat', 'no-repeat', 'important');
    resetColorTargetView();

}
}
// グローバルインスタンスの生成
window.mediaManager = new MediaManager();

/**
 * updateVideoTiles: 盤面上の全動画タイルをソース動画と同期
 */
function updateVideoTiles() {
    if (window.mediaManager.mode !== 'video' || !window.mediaManager.mediaElement) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const video = window.mediaManager.mediaElement;
    
    const draw = () => {
        if (window.mediaManager.mode !== 'video') return;
        
        // 全ての video-tile クラスを持つセルに現在のフレームを投影
        const tiles = document.querySelectorAll('.video-tile');
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5); // 低負荷用の圧縮

        // ※パフォーマンス向上のため、CSS変数を利用した一括制御を推奨
        document.documentElement.style.setProperty('--current-video-frame', `url(${dataUrl})`);
        
        requestAnimationFrame(draw);
    };
    
    // ※実際の実装では、Background-imageに直接Videoを流し込む手法が
    // モダンブラウザでは効率的なため、CSS-Paint-APIまたはCanvas転写を検討
}

/**
 * handleMediaUpload の末尾に追加
 */
async function handleMediaUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (window.mediaManager.mediaSrc) {
        URL.revokeObjectURL(window.mediaManager.mediaSrc);
    }

    await window.mediaManager.setupMedia(file);
    
    // UI更新と盤面の再描画を強制
    document.getElementById('current-v2-mode').innerText = window.mediaManager.mode.toUpperCase();
    // 画像が選択・ロードされたらパネルを閉じる
    if (document.getElementById('v2-media-uploader').style.display !== 'none') {
        toggleV2Panel();
    }
    
    renderPreview();
    render(); // 既存のrender()が呼ばれ、その中でapplyMediaStyleが走る
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

/**
 * V2メディアパネルの表示/非表示を切り替え、画像モード時は回転ギミックをロックする
 */
function toggleV2Panel() {
    const panel = document.getElementById('v2-media-uploader');
    const toggleBtn = document.getElementById('v2-panel-toggle');
    const rotateBtn = document.getElementById('rotate-btn'); 
    
    if (!panel || !toggleBtn) return;

    // 現在のパネルの表示/非表示を判定
    const isHidden = (panel.style.display === 'none' || panel.style.display === '');

    if (isHidden) {
        // 画像パネルを開く
        panel.style.display = 'block';
        toggleBtn.classList.add('active');

        // 回転ギミックの強制解除
        isRotateMode = false; // フラグを強制OFF
        if (rotateBtn) {
            rotateBtn.disabled = true; // ボタンを物理ロック
            rotateBtn.classList.remove('active'); // 発光解除
            rotateBtn.style.opacity = '0.3'; // 非活性を視覚化
            rotateBtn.style.pointerEvents = 'none'; // クリックを完全遮断
        }
    } else {
        // 画像パネルを閉じる
        panel.style.display = 'none';
        toggleBtn.classList.remove('active');

        // 回転ボタンのロック解除
        if (rotateBtn) {
            rotateBtn.disabled = false;
            rotateBtn.style.opacity = '1';
            rotateBtn.style.pointerEvents = 'auto';
        }
        // ★ 追加：パネルを閉じた際にフラッシュモードを強制的にONにする
        if (typeof isFlashMode !== 'undefined') {
            isFlashMode = true;
            // フラッシュボタンの見た目も更新（IDが 'flash-btn' の場合）
            const flashBtn = document.querySelector('button[onclick="toggleFlash()"]');
            if (flashBtn) flashBtn.classList.add('active');
        }
    }
    resetColorTargetView();
}

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
/**
 * カラーモードのターゲットビュー（正解図）のみを初期状態にリセットする
 */
function resetColorTargetView() {
    const totalSize = subSize * gridNum;
    // 1. targetBoard を初期の整列状態 (0,0,1,1...) で再定義
    targetBoard = Array.from({length: totalSize}, (_, r) => 
        Array.from({length: totalSize}, (_, c) => 
            Math.floor(r / subSize) * gridNum + Math.floor(c / subSize)
        )
    );

    // 2. プレビュー描画のみを更新
    // これにより画像モードなら一枚絵、カラーモードなら整列したグリッドが表示される
    renderPreview();
}