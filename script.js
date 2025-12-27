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
const LONG_PRESS_MS = 500;

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

function handleModeChange(mode) {
    switch (mode) {
        case 'easy': changeMode(2, 2); break;
        case 'mid': changeMode(2, 3); break;
        case 'hard': changeMode(3, 3); break;
        case 'advance': changeMode(2, 4); break; // 8x8盤面
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

/**
 * タイマーのトグル（手動・自動共通）
 */
function toggleTimer(forceState) {
    const display = document.getElementById('timer-display');
    const btn = document.querySelector('button[onclick="toggleTimer()"]');
    
    // forceStateがあればそれに従い、なければ反転
    const shouldStart = (forceState !== undefined) ? forceState : !timerId;
			// 【追加】ローテートボタンが「オン」の状態ならカウントダウンを開始
            const rotateBtn = document.querySelector('button[onclick="startRotateCountdown()"]');
            if (rotateBtn && rotateBtn.classList.contains('active-toggle-red')) {
                // 既に動いていない場合のみ起動
                if (!window.rotateTimerId) {
                    executeRotateLoop(); 
                }
            }
    if (!shouldStart) {
        // 停止
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
        if (btn) btn.classList.remove('active-toggle');
		stopRotateIntervalOnly();
    } else {
        // 開始（既に動いていれば何もしない）
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
    }
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
function resetStats() {
    // 1. 各種タイマーの物理的停止
    if (timerId) { 
        clearInterval(timerId); 
        timerId = null; 
    }
    
    // 回転動作のみを停止（スイッチ状態 active-toggle-red は維持される）
    stopRotateIntervalOnly();

    // 2. タイマーボタン（時計アイコン）の光を消す
    const timerBtn = document.querySelector('button[onclick="toggleTimer()"]');
    if (timerBtn) timerBtn.classList.remove('active-toggle');

    // 3. 数値の初期化
    moveCount = 0;
    const timerEl = document.getElementById('timer-display');
    const counterEl = document.getElementById('counter-display');
    
    if (timerEl) timerEl.textContent = "00:00.000";
    if (counterEl) counterEl.textContent = "000";
    
    // 4. コンプリート表示の消去
    hideCompleteOverlays();
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
}function render() {
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
    } else {
        moveMode = 'standard';
        longPressTimer = setTimeout(() => { moveMode = 'frame'; if (navigator.vibrate) navigator.vibrate(50); }, LONG_PRESS_MS);
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
        } else return;
    }
    currentTranslate = (dragAxis === 'h') ? dx : dy;
    const ts = (dragAxis === 'h') ? `translateX(${currentTranslate}px)` : `translateY(${currentTranslate}px)`;
    ghostStrips.forEach(s => s.style.transform = ts);
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
 * --- 5. 移動・回転・ログロジック ---
 */
/**
 * ログパネルの表示/非表示：開く際にコンプリート表示を消去
 */
function toggleLogPanel() {
    const overlay = document.getElementById('log-overlay');
    if (!overlay) return;

    const isVisible = overlay.style.display === 'block';
    if (!isVisible) {
        // パネルを開く瞬間にコンプリート表示を消去
        hideCompleteOverlays();
        overlay.style.display = 'block';
    } else {
        overlay.style.display = 'none';
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
    render();
    checkComplete();
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

function shuffle() {
    const totalSize = subSize * gridNum;
    const count = parseInt(document.getElementById('scramble-count').value) || 15;
    for (let i = 0; i < count; i++) {
        const isV = Math.random() > 0.5;
        const lineIdx = Math.floor(Math.random() * totalSize);
        for (let j = 0; j < subSize; j++) moveLogic(lineIdx, isV, Math.random() > 0.5);
    }
    render();
    checkComplete();
}

/**
 * 盤面判定の修正
 */
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

window.onmousemove = (e) => handleMove(e.clientX, e.clientY);
window.onmouseup = endDrag;
window.ontouchmove = (e) => { if(isDragging) { if(e.cancelable) e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); } };
window.ontouchend = endDrag;

window.rotateTimerId = window.rotateTimerId || null;
window.isFlashMode = false;

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
// windowオブジェクトでタイマーを一元管理（二重宣言エラー防止）
window.rotateTimerId = window.rotateTimerId || null;

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
 * startRotateCountdown を「スイッチの切り替え」専用に修正
 */
function startRotateCountdown() {
    const btn = document.querySelector('button[onclick="startRotateCountdown()"]');
    
    if (btn.classList.contains('active-toggle-red')) {
        // スイッチをオフにする
        btn.classList.remove('active-toggle-red');
        stopRotateIntervalOnly();
    } else {
        // スイッチをオンにする
        btn.classList.add('active-toggle-red');
        // すでにゲームが始まっている（タイマーが動いている）なら即座に開始
        if (timerId) {
            executeRotateLoop();
        }
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

/* script.js */
window.isSearchlightMode = false;

function toggleSearchlight() {
    window.isSearchlightMode = !window.isSearchlightMode;
    const btn = document.querySelector('button[onclick="toggleSearchlight()"]');
    if (btn) btn.classList.toggle('active-toggle', window.isSearchlightMode);
    
    // モードオフ時はレイヤーを隠す
    if (!window.isSearchlightMode) {
        document.getElementById('searchlight-overlay').classList.remove('searchlight-active');
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
}function updateSearchlight(x, y) {
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

// ドラッグ終了（離した時）に暗幕を非表示にする
const originalEndDrag = endDrag;
window.endDrag = function() {
    originalEndDrag();
    if (window.isSearchlightMode) {
        document.getElementById('searchlight-overlay').classList.remove('searchlight-active');
    }
};