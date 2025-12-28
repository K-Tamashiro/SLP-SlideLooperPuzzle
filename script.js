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
const LONG_PRESS_MS = 250;

// 統計・タイマー管理用（一本化）
let moveCount = 0;
let startTime = 0;
let timerId = null;
let rotateTimerId = null;

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

/**
 * --- 2. 統計・タイマー・カウンター ---
 */

function toggleTimer(forceState) {
    const display = document.getElementById('timer-display');
    const btn = document.querySelector('button[onclick="toggleTimer()"]');
    
    const shouldStart = (forceState !== undefined) ? forceState : !timerId;

    if (!shouldStart) {
        // 停止処理
        if (timerId) { clearInterval(timerId); timerId = null; }
        if (btn) btn.classList.remove('active-toggle');
        stopRotateIntervalOnly();
        
        // ★ ロック解除（生存ボタン以外を元に戻す）
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

        // ★ インターフェースロック実行
        setInterfaceLock(true);

        // 回転ギミックの連動
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

/**
 * --- 3. 描画・プレビュー・座標 ---
 */

function render() {
    const container = document.getElementById('board'); 
    if (!container) return;
    container.style.gridTemplateColumns = `repeat(${gridNum}, 1fr)`; 
    container.style.gap = `${GAP_FACE}px`; 
    container.innerHTML = '';

    for (let f = 0; f < gridNum * gridNum; f++) {
        const faceEl = document.createElement('div');
        faceEl.className = 'face'; faceEl.id = `face-${f}`;
        faceEl.style.gridTemplateColumns = `repeat(${subSize}, ${cellSizePixel}px)`;
        const fr = Math.floor(f / gridNum) * subSize, fc = (f % gridNum) * subSize;
        for (let r = 0; r < subSize; r++) {
            for (let c = 0; c < subSize; c++) {
                const cell = document.createElement('div');
                const row = fr + r, col = fc + c;
                cell.dataset.row = row; cell.dataset.col = col;
                cell.className = `cell c${board[row][col]}`;
                cell.style.width = cell.style.height = `${cellSizePixel}px`;
                // 修正：フラッシュモード判定を追加
                cell.onmousedown = (e) => {
                    if(typeof isFlashMode !== 'undefined' && isFlashMode) triggerFlash(board[row][col]);
                    handleStart(row, col, f, e.clientX, e.clientY, 'mouse', e);
                };
                cell.ontouchstart = (e) => {
                    if(typeof isFlashMode !== 'undefined' && isFlashMode) triggerFlash(board[row][col]);
                    handleStart(row, col, f, e.touches[0].clientX, e.touches[0].clientY, 'touch', e);
                };
                faceEl.appendChild(cell);
            }
        }
        container.appendChild(faceEl);
    }
}

function renderPreview() {
    const container = document.getElementById('preview');
    if (!container || !targetBoard) return;
    const totalSize = subSize * gridNum;
    
    container.style.display = 'grid';
    // ターゲットビューのサイズ調整（8x8などの多セル対応）
    const pSize = totalSize > 6 ? 8 : 12;
    container.style.gridTemplateColumns = `repeat(${totalSize}, ${pSize}px)`;
    container.style.gap = '1px';
    container.innerHTML = '';

    for (let r = 0; r < totalSize; r++) {
        for (let c = 0; c < totalSize; c++) {
            const cell = document.createElement('div');
            cell.className = `preview-cell c${targetBoard[r][c]}`;
            cell.style.width = cell.style.height = `${pSize}px`;
            container.appendChild(cell);
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


function endDrag() {
	updateFrameHighlight(false); // 枠を消す
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
            checkComplete();
        }
        resetDragState();
    }, 100);
}

/**
<<<<<<< HEAD
 * ログパネルの表示/非表示（コンプリート通知の制御を追加）
=======
 * ログパネルの表示/非表示（MODEL表示の復旧）
>>>>>>> origin/develop
 */
function toggleLogPanel() {
    const overlay = document.getElementById('log-overlay');
    const mediaControls = document.getElementById('media-controls');
<<<<<<< HEAD
    const statusBoard = document.getElementById('status-board');
=======
    
    // ご提示のIDに合わせて取得先を変更
>>>>>>> origin/develop
    const logModeSpan = document.getElementById('mode-text');
    const mainSelect = document.getElementById('mode-select');

    if (!overlay) return;

    const isVisible = overlay.style.display === 'block';
    if (!isVisible) {
<<<<<<< HEAD
        // パネルを開く時：コンプリート通知を隠す
        if (statusBoard) statusBoard.classList.remove('show');
        
        if (logModeSpan && mainSelect) {
            logModeSpan.innerText = mainSelect.options[mainSelect.selectedIndex].text;
=======
        // --- モードテキストの反映 ---
        if (logModeSpan && mainSelect) {
            const selectedText = mainSelect.options[mainSelect.selectedIndex].text;
            logModeSpan.innerText = selectedText;
>>>>>>> origin/develop
        }

        if (typeof refreshHistoryList === 'function') refreshHistoryList();
        overlay.style.display = 'block';

        if (window.isReplayMode && mediaControls) {
            mediaControls.style.visibility = 'hidden';
            mediaControls.style.opacity = '0';
        }
    } else {
        // パネルを閉じる時
        overlay.style.display = 'none';

        if (window.isReplayMode && mediaControls) {
            mediaControls.style.visibility = 'visible';
            mediaControls.style.opacity = '1';
<<<<<<< HEAD
            
            // 解析モード中で、かつ現在地が完了（56/56）なら通知を再表示
            if (window.currentReplayIdx === window.replaySteps.length) {
                if (statusBoard) statusBoard.classList.add('show');
            }
=======
>>>>>>> origin/develop
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

    // --- 1. 盤面データの論理計算のみを先に実行（描画を挟まない） ---
    for (let i = 0; i < count; i++) {
        const isV = Math.random() > 0.5;
        const isRev = Math.random() > 0.5;
        const lineIdx = Math.floor(Math.random() * (subSize * gridNum));
        
        // subSize分（1枠分）の移動を1つの論理ステップとして実行
        for (let j = 0; j < subSize; j++) {
            moveLogic(lineIdx, isV, isRev);
        }
    }

    // --- 2. ターゲット（正解配置）の枠単位置換を計算 ---
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

    // --- 3. 最後に1回だけDOMを更新する ---
    const totalSize = subSize * gridNum;
    targetBoard = Array.from({length: totalSize}, (_, r) => 
        Array.from({length: totalSize}, (_, c) => faces[Math.floor(r / subSize) * gridNum + Math.floor(c / subSize)])
    );

    renderPreview(); 
    render(); 
    checkComplete(); // 最終状態の1回のみ判定
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
        // 1. 通常タイマー停止
        toggleTimer(false);

        // 2. 回転ギミックが動いている場合は停止してスイッチオフ
        if (window.rotateTimerId) {
            // startRotateCountdownを呼び出すことで、内部の停止ロジック（clearInterval, クラス除去）を走らせる
            startRotateCountdown();
        }
		
		saveSystemLog(true); // コンプリートフラグを立てて保存
        
		// 3. コンプリート表示
        document.getElementById('status-board')?.classList.add('show');
        document.getElementById('status-preview')?.classList.add('show');
    } else {
        // 未完成時は表示を消すのみ（ギミックの状態には触れない）
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

function triggerFlash(colorIdx) {
    const colorClass = `c${colorIdx}`;
    document.querySelectorAll('#board .cell').forEach(cell => {
        if (cell.classList.contains(colorClass)) {
            cell.classList.add('flash-active');
            setTimeout(() => cell.classList.remove('flash-active'), 1200);
        }
    });
}

/**
 * startRotateCountdown を「スイッチの切り替え」専用に修正
 */
function startRotateCountdown() {
    const btn = document.querySelector('button[onclick="startRotateCountdown()"]');
    const frame = document.getElementById('rotate-frame');
    if (window.rotateTimerId) {
        clearInterval(window.rotateTimerId); window.rotateTimerId = null;
        if (frame) { frame.classList.remove('fx-active'); frame.style.webkitMaskImage = 'none'; }
        if (btn) btn.classList.remove('active-toggle-red');
        return;
    }
    const totalSize = subSize * gridNum, maxSteps = totalSize * 4 - 4;
    let currentStep = maxSteps;
    if (frame) frame.classList.add('fx-active');
    if (btn) btn.classList.add('active-toggle-red');
    window.rotateTimerId = setInterval(() => {
        currentStep--;
		if (frame) {
		    const progress = (currentStep / maxSteps) * 100;
		    // 枠そのものにマスクをかけて削る
		    frame.style.webkitMaskImage = `conic-gradient(#000 ${progress}%, transparent ${progress}%)`;
		    frame.style.maskImage = `conic-gradient(#000 ${progress}%, transparent ${progress}%)`;
		}
        if (currentStep <= 0) {
            clearInterval(window.rotateTimerId); window.rotateTimerId = null;
            rotateBoard();
            if (frame) { frame.classList.remove('fx-active'); frame.style.webkitMaskImage = 'none'; }
            if (btn) btn.classList.remove('active-toggle-red');
        }
    }, 3000);
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


/**
 * 実際のループ処理を分離
 */
function executeRotateLoop() {
    const frame = document.getElementById('rotate-frame');
    const n = subSize * gridNum;
    const perimeterCells = (n * 4) - 4;
    const duration = perimeterCells * 3000;
    const interval = 50;
    let elapsed = 0;

    if (frame) {
        frame.style.display = 'block';
        void frame.offsetWidth;
        frame.classList.add('fx-active');
    }

    window.rotateTimerId = setInterval(() => {
        // コンプリート画面が出たら停止
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
            rotateBoard();
            elapsed = 0;
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
 * 3. Import: ファイル選択時に実行される
 */
function importCSV(input, type) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const targetId = (type === 'scramble') ? 'scramble-input' : 'solve-log';
        const inputField = document.getElementById(targetId);
        
        if (inputField) {
            // 文字列整形（改行除去）
            inputField.value = e.target.result.trim().replace(/\n|\r/g, "");
            
            if (typeof addLog === 'function') {
                addLog(`Imported ${type} CSV: ${file.name}`);
            }
        }
        // 同じファイルを再度選択可能にするためのリセット
        input.value = '';
    };
    reader.readAsText(file);
}

/**
 * 4. Copy to Scramble: LiveログをInputボックスへコピー
 */
function copySolveToScramble() {
    const solveLog = document.getElementById('solve-log');
    const scrambleInput = document.getElementById('scramble-input');
    if (solveLog && scrambleInput) {
        scrambleInput.value = solveLog.value;
        if (typeof addLog === 'function') addLog("Solve log copied to Scramble Box");
    }
}

/**
 * CSV保存（仕様3, 5）
 */
function saveCSV(type) {
    const scLog = document.getElementById('scramble-input')?.value || "";
    const slLog = document.getElementById('solve-log')?.value || "";
    const modeInfo = getCurrentModeInfo();
    
    const gimmicks = JSON.stringify({
        rotate: !!(document.querySelector('.active-toggle-red')),
        spotlight: !!(window.isSearchlightMode),
        flash: !!(window.isFlashMode)
    });

    const header = "Timestamp,ModeKey,GridSize,SubSize,Scramble,SolveHistory,Gimmicks,Time,Steps,TargetState\n";
    const dataRow = `"${new Date().toLocaleString()}","${modeInfo.key}",${gridNum},${subSize},"${scLog}","${slLog}","${gimmicks.replace(/"/g, '""')}","${document.getElementById('timer-display')?.innerText}","${document.getElementById('counter-display')?.innerText}","${JSON.stringify(targetBoard).replace(/"/g, '""')}"`;

    const blob = new Blob([header + dataRow], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = getExportFileName(type);
    link.click();
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

/**
 * 履歴リストの更新：モードフィルタリングとターゲットプレビュー生成
 */
function refreshHistoryList() {
    const container = document.getElementById('history-list');
    if (!container) return;

    // 1. 全履歴を取得
    const history = JSON.parse(localStorage.getItem('slp_history') || '[]');
    
    // 2. 現在のモード（gridNum, subSize）に完全に一致するものだけを抽出
    const filtered = history.filter(h => 
        Number(h.grid_size) === gridNum && Number(h.sub_size) === subSize
    ).reverse(); // 最新を上に

    if (filtered.length === 0) {
        container.innerHTML = '<div style="color:#666; padding:10px; text-align:center;">No history for this mode.</div>';
        return;
    }

    // 3. 各エントリに対してHTMLを構築
    container.innerHTML = filtered.map((data, index) => {
        const dataStr = JSON.stringify(data).replace(/'/g, "\\'");
        
        // ターゲットプレビュー(アイコン)の生成
        const miniPreviewHtml = createMiniPreview(data.target_state);

        return `
            <div class="history-item" onclick='loadFilteredHistory(${dataStr})' 
                 style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid #333; cursor:pointer;">
                <div class="mini-target-icon" style="flex-shrink:0;">${miniPreviewHtml}</div>
                <div style="flex-grow:1; font-size:12px;">
                    <div style="color:#aaa;">${data.timestamp}</div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#00ffcc; font-weight:bold;">${data.solve_time}</span>
                        <span style="color:#888;">${data.step_count} steps</span>
                        <span style="color:${data.is_complete ? '#2ecc71' : '#e74c3c'};">${data.is_complete ? '● FIN' : '○ MID'}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
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

/**
 * ログからデータを読み込み、盤面とターゲットビューを再現する
 */
function loadFilteredHistory(data) {
    if (!data) return;

    // 1. ターゲット配色の再現（Modelの更新とメイン画面への反映）
    // ログに保存された配色を、現在の正解（TARGET VIEW）としてセット
    targetBoard = JSON.parse(JSON.stringify(data.target_state));
    renderPreview();

    // 2. 棋譜のロード（Scramble BoxとSolve Logへ）
    const scrambleInput = document.getElementById('scramble-input');
    const solveLog = document.getElementById('solve-log');
    if (scrambleInput) scrambleInput.value = data.scramble_log || "";
    if (solveLog) solveLog.value = data.solve_history || "";

    // 3. ログダイアログ内のギミックアイコン（🔄🔦⚡）の点灯状態を同期
    // これにより、そのログがどの制約下で行われたかを明示する
    updateGimmickHistoryIcons(data.gimmicks);
    
    // 不要になったダイアログ内大型プレビューの削除（もし存在すれば）
    const oldPreview = document.getElementById('log-large-preview');
    if (oldPreview) oldPreview.remove();

    if (typeof addLog === 'function') addLog(`Loaded target and logs from ${data.timestamp}`);
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
 * Analyzeモード開始：0/56（崩れた開始状態）からスタートする。
 * 内部で一旦完成状態にしてから、全手順分「巻き戻し」て初期画面を作る。
 */
function startAnalyzeMode() {
    const solveLog = document.getElementById('solve-log').value;
    if (!solveLog) return;

    // 1. 状態の初期化：0手目から開始
    window.replaySteps = solveLog.split(',').filter(s => s.trim() !== "");
    window.currentReplayIdx = window.replaySteps.length; // 一旦最大値へ
    window.isReplayMode = true;

    // 2. 盤面の再現：完成状態から「巻き戻し」てソルブ開始時の盤面を作る
    board = JSON.parse(JSON.stringify(targetBoard));

    // 全手順分を逆実行し、盤面を「0手目（崩れた状態）」へ物理的に戻す
    while (window.currentReplayIdx > 0) {
        window.currentReplayIdx--;
        const move = window.replaySteps[window.currentReplayIdx];
        executeSingleMove(move, true); // 逆実行（巻き戻し）
    }

    // この時点で window.currentReplayIdx は 0 になっている

    // 3. UI表示切り替え
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

/**
 * リプレイ表示の更新：0/56(崩れ) -> 56/56(完成)
 */
function updateReplayDisplay() {
    const idxEl = document.getElementById('replay-index');
    const totalEl = document.getElementById('replay-total');
    const moveEl = document.getElementById('current-move-display');

    if (idxEl) idxEl.innerText = window.currentReplayIdx;
    if (totalEl) totalEl.innerText = window.replaySteps.length;
    
    const isComplete = (window.currentReplayIdx === window.replaySteps.length);
<<<<<<< HEAD
	const isLogVisible = document.getElementById('log-overlay').style.display === 'block';
=======
>>>>>>> origin/develop

    if (moveEl) {
        moveEl.innerText = isComplete ? "COMPLETE" : (window.replaySteps[window.currentReplayIdx] || "END");
    }

    // ボタンの活性制御
    const nextBtn = document.querySelector('button[onclick="replayStepNext()"]');
    const backBtn = document.querySelector('button[onclick="replayStepBack()"]');
    if (nextBtn) nextBtn.disabled = isComplete;
    if (backBtn) backBtn.disabled = (window.currentReplayIdx <= 0);

    // 完成時のみ演出
<<<<<<< HEAD
    if (isComplete && !isLogVisible) {
=======
    if (isComplete) {
>>>>>>> origin/develop
        document.getElementById('status-board')?.classList.add('show');
    } else {
        document.getElementById('status-board')?.classList.remove('show');
    }
}

/**
<<<<<<< HEAD
 * サイドメニューの再生ボタン押下時の挙動
 * 1. メディアコントロール表示中 -> コントロールを消して終了
 * 2. 非表示中 -> ログパネルを表示（ユーザーにログ選択を促す）
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
=======
 * リプレイモード終了 (Exit)
 */
function toggleReplayMode() {
    // 既存のロジックを整理
    window.isReplayMode = false;
    showMediaControls(false);

    if (window.autoPlayTimer) {
        clearInterval(window.autoPlayTimer);
        window.autoPlayTimer = null;
    }
    
    // 盤面をリセット（または現状維持か選択可能ですが、一旦ニュートラルに戻します）
    initBoard();
    if (typeof addLog === 'function') addLog("Exited replay mode.");
>>>>>>> origin/develop
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

