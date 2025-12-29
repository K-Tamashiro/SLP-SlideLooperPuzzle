// --- グローバル変数 ---
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

let moveCount = 0;
let startTime = 0;
let timerId = null;
let rotateTimerId = null;
let isLogEnabled = true; 
let skipCompleteOnce = false;

/**
 * 初期化
 */
function initBoard(resetTarget = false) {
    if (timerId) {
        toggleTimer(false); 
    } else {
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

/**
 * 移動ロジック
 */
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

/**
 * シャッフル
 */
function shuffle() {
    const count = parseInt(document.getElementById('scramble-count').value) || 15;
    resetStats();

    for (let i = 0; i < count; i++) {
        const isV = Math.random() > 0.5;
        const isRev = Math.random() > 0.5;
        const lineIdx = Math.floor(Math.random() * (subSize * gridNum));
        for (let j = 0; j < subSize; j++) {
            moveLogic(lineIdx, isV, isRev);
        }
    }

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
        const totalSize = subSize * gridNum;
        targetBoard = Array.from({length: totalSize}, (_, r) => 
            Array.from({length: totalSize}, (_, c) => faces[Math.floor(r / subSize) * gridNum + Math.floor(c / subSize)])
        );
    }
    renderPreview(); 
    render(); 
    checkComplete(); 
}

/**
 * 判定
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
        if (window.isReplayMode || !isLogEnabled) return;
        toggleTimer(false);
        if (window.rotateTimerId) startRotateCountdown();
        saveSystemLog(true); 
        document.getElementById('status-board')?.classList.add('show');
        document.getElementById('status-preview')?.classList.add('show');
    } else {
        document.getElementById('status-board')?.classList.remove('show');
        document.getElementById('status-preview')?.classList.remove('show');
    }
}

/**
 * ターゲットリセット
 */
function resetColorTargetView() {
    const totalSize = subSize * gridNum;
    targetBoard = Array.from({length: totalSize}, (_, r) => 
        Array.from({length: totalSize}, (_, c) => 
            Math.floor(r / subSize) * gridNum + Math.floor(c / subSize)
        )
    );
    renderPreview();
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