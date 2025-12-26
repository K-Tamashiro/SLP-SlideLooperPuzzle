let subSize = 2;    
let gridNum = 3;    
let board = [];
let cellSizePixel = 42; 
let GAP_FACE = 10; 
const GAP_CELL = 2;  

let startX = 0, startY = 0, isDragging = false, moveMode = 'standard'; 
let activeRow = -1, activeCol = -1, dragAxis = null, currentTranslate = 0;
let ghostStrips = [], isShiftPressed = false, isCtrlPressed = false, currentHoverFace = -1;
let longPressTimer = null;
const LONG_PRESS_MS = 500;

window.targetColors = [];

window.addEventListener('DOMContentLoaded', () => {
    initBoard();
});

function changeMode(sSize, gNum) {
    subSize = sSize; gridNum = gNum;
    updateButtons(); initBoard();
}

function updateButtons() {
    const btnEasy = document.getElementById('btn-easy'), btnMid = document.getElementById('btn-mid'), btnHard = document.getElementById('btn-hard');
    if (btnEasy) btnEasy.className = (subSize === 2 && gridNum === 2) ? 'active-mode' : '';
    if (btnMid) btnMid.className = (subSize === 2 && gridNum === 3) ? 'active-mode' : '';
    if (btnHard) btnHard.className = (subSize === 3 && gridNum === 3) ? 'active-mode' : '';
}
function calculateLayout() {
    const isMobile = window.innerWidth < 600;
    const totalSize = subSize * gridNum;
    
    // PC/スマホ共通：利用可能な最大幅を取得
    const usableWidth = isMobile 
        ? Math.min(window.innerWidth, document.documentElement.clientWidth) - 30 
        : 500;

    // --- GAP_FACE（ブロック間の隙間）の決定 ---
    // 2x2（Easy）ならセルの隙間(2px)の2倍の 4px
    // 3x3（Mid/Hard）なら 6px 程度に固定
    GAP_FACE = (gridNum <= 2) ? 4 : 6; 

    const totalFaceGaps = (gridNum - 1) * GAP_FACE;
    const totalCellGaps = (totalSize - gridNum) * GAP_CELL;

    // --- cellSizePixel の計算 ---
    // 利用可能幅から隙間の総計を引き、セル数で割る
    cellSizePixel = Math.floor((usableWidth - totalFaceGaps - totalCellGaps) / totalSize);

    if (isMobile) {
        // スマホ：視認性を考慮した範囲
        cellSizePixel = Math.max(38, Math.min(70, cellSizePixel));
    } else {
        // PC：大きくなりすぎないよう 60px を上限にする
        cellSizePixel = Math.max(40, Math.min(60, cellSizePixel));
        
        // PC版で隙間が広がりすぎるのを防ぐため、計算後に GAP_FACE を再調整
        // セルが大きい時は隙間を 6px に、小さい時は 4px に固定
        GAP_FACE = (cellSizePixel > 50) ? 6 : 4;
    }
}

function initBoard() {
    calculateLayout();
    const totalSize = subSize * gridNum, numFaces = gridNum * gridNum;
    window.targetColors = Array.from({length: numFaces}, (_, i) => i);
    board = Array.from({length: totalSize}, (_, r) => 
        Array.from({length: totalSize}, (_, c) => Math.floor(r / subSize) * gridNum + Math.floor(c / subSize))
    );

    // 先にステータスをリセットして非表示にする
    resetStatus(); 
    
    renderPreview(); 
    render(); 
    renderCoordinates(); 
    resetDragState();
}

function renderCoordinates() {
    const axisTop = document.getElementById('axis-top'), axisLeft = document.getElementById('axis-left');
    if (!axisTop || !axisLeft) return;
    axisTop.style.gridTemplateColumns = `repeat(${gridNum}, 1fr)`; axisLeft.style.gridTemplateRows = `repeat(${gridNum}, 1fr)`;
    axisTop.innerHTML = ''; axisLeft.innerHTML = '';
    let colIndex = 1, rowIndex = 0;
    for(let g=0; g<gridNum; g++) {
        const gh = document.createElement('div'); gh.style.display = 'grid'; gh.style.gridTemplateColumns = `repeat(${subSize}, ${cellSizePixel}px)`;
        for(let s=0; s<subSize; s++) {
            const l = document.createElement('div'); l.className = 'coord-label'; l.innerText = colIndex++; l.style.width = `${cellSizePixel}px`; gh.appendChild(l);
        }
        axisTop.appendChild(gh);
        const gv = document.createElement('div'); gv.style.display = 'grid'; gv.style.gridTemplateRows = `repeat(${subSize}, ${cellSizePixel}px)`;
        for(let s=0; s<subSize; s++) {
            const l = document.createElement('div'); l.className = 'coord-label'; l.innerText = String.fromCharCode(65 + rowIndex++); l.style.height = `${cellSizePixel}px`; gv.appendChild(l);
        }
        axisLeft.appendChild(gv);
    }
}

function renderPreview() {
    const preview = document.getElementById('preview'); if (!preview) return;
    preview.style.display = 'grid'; preview.style.gridTemplateColumns = `repeat(${gridNum}, auto)`; preview.style.gap = '4px'; preview.innerHTML = '';
    const pSize = (gridNum === 3) ? 10 : 15;
    for (let f = 0; f < gridNum * gridNum; f++) {
        const face = document.createElement('div'); face.style.display = 'grid'; face.style.gridTemplateColumns = `repeat(${subSize}, ${pSize}px)`; face.style.gap = '1px';
        const colorClass = `c${window.targetColors[f]}`;
        for (let i = 0; i < subSize * subSize; i++) {
            const d = document.createElement('div'); d.className = `p-cell ${colorClass}`; d.style.width = d.style.height = `${pSize}px`; face.appendChild(d);
        }
        preview.appendChild(face);
    }
}

function render() {
    const container = document.getElementById('board'); 
	if (!container) return;
    container.style.gridTemplateColumns = `repeat(${gridNum}, 1fr)`; 
	container.style.gap = `${GAP_FACE}px`; 
	container.innerHTML = '';
    for (let f = 0; f < gridNum * gridNum; f++) {
        const faceEl = document.createElement('div'); faceEl.className = 'face'; faceEl.id = `face-${f}`; faceEl.style.gridTemplateColumns = `repeat(${subSize}, ${cellSizePixel}px)`;
        const highlight = document.createElement('div'); highlight.className = 'face-highlight'; faceEl.appendChild(highlight);
        const fr = Math.floor(f / gridNum) * subSize, fc = (f % gridNum) * subSize;
        for (let r = 0; r < subSize; r++) {
            for (let c = 0; c < subSize; c++) {
                const cell = document.createElement('div'); const row = fr + r, col = fc + c;
                cell.dataset.row = row; cell.dataset.col = col; cell.className = `cell c${board[row][col]}`; cell.style.width = cell.style.height = `${cellSizePixel}px`;
                cell.onmousedown = (e) => handleStart(row, col, f, e.clientX, e.clientY, 'mouse', e);
                cell.ontouchstart = (e) => handleStart(row, col, f, e.touches[0].clientX, e.touches[0].clientY, 'touch', e);
                cell.onmouseenter = () => { currentHoverFace = f; updateFrameHighlight(f); };
                faceEl.appendChild(cell);
            }
        }
        container.appendChild(faceEl);
    }
}

function handleStart(r, c, f, x, y, type, event) {
    if (isDragging) return; if (type === 'touch' && event.cancelable) event.preventDefault();
    isDragging = true; startX = x; startY = y; activeRow = r; activeCol = c; currentHoverFace = f;
    if (type === 'mouse') {
        moveMode = event.ctrlKey ? 'cheat' : (event.shiftKey ? 'frame' : 'standard'); updateFrameHighlight(f);
    } else {
        moveMode = 'standard'; if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => { moveMode = 'frame'; updateFrameHighlight(f); if (navigator.vibrate) navigator.vibrate(50); }, LONG_PRESS_MS);
    }
    dragAxis = null; currentTranslate = 0; clearGhosts();
}

function handleMove(curX, curY) {
    if (!isDragging) return; const dx = curX - startX, dy = curY - startY;
    if (!dragAxis) {
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            dragAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'; createGhosts(dragAxis);
        } else return;
    }
    currentTranslate = (dragAxis === 'h') ? dx : dy;
    const ts = (dragAxis === 'h') ? `translateX(${currentTranslate}px)` : `translateY(${currentTranslate}px)`;
    ghostStrips.forEach(s => s.style.transform = ts);
}

function createGhosts(axis) {
    let indices = [];
    if (moveMode === 'frame') {
        const start = (axis === 'h') ? Math.floor(activeRow / subSize) * subSize : Math.floor(activeCol / subSize) * subSize;
        for (let i = 0; i < subSize; i++) indices.push(start + i);
    } else indices.push(axis === 'h' ? activeRow : activeCol);
    const wrapper = document.getElementById('board-wrapper'), wrapRect = wrapper.getBoundingClientRect();
    indices.forEach(idx => {
        const strip = document.createElement('div'); strip.className = 'ghost-strip'; const cells = [];
        document.querySelectorAll('.cell').forEach(c => {
            const r = parseInt(c.dataset.row), col = parseInt(c.dataset.col);
            if ((axis === 'h' && r === idx) || (axis === 'v' && col === idx)) cells.push({ el: c, k: (axis === 'h' ? col : r) });
        });
        cells.sort((a, b) => a.k - b.k); const firstRect = cells[0].el.getBoundingClientRect();
        const loopOffset = (axis === 'h') ? (wrapRect.width - 20 + GAP_FACE) : (wrapRect.height - 20 + GAP_FACE);
        const baseLeft = (firstRect.left - wrapRect.left), baseTop = (firstRect.top - wrapRect.top);
        if (axis === 'h') {
            strip.style.top = baseTop + 'px'; strip.style.left = (baseLeft - loopOffset - currentTranslate) + 'px'; strip.style.display = 'flex'; strip.style.gap = `${GAP_FACE}px`;
        } else {
            strip.style.left = baseLeft + 'px'; strip.style.top = (baseTop - loopOffset - currentTranslate) + 'px'; strip.style.display = 'flex'; strip.style.flexDirection = 'column'; strip.style.gap = `${GAP_FACE}px`;
        }
        const createSet = () => {
            const d = document.createElement('div'); d.style.display = (axis === 'h') ? 'flex' : 'grid'; d.style.gap = '2px'; if (axis === 'v') d.style.gridTemplateColumns = '1fr';
            cells.forEach((item, i) => {
                const clone = item.el.cloneNode(true); clone.style.opacity = '1';
                if (i > 0 && i % subSize === 0) { if (axis === 'h') clone.style.marginLeft = `${GAP_FACE - 2}px`; else clone.style.marginTop = `${GAP_FACE - 2}px`; }
                d.appendChild(clone);
            });
            return d;
        };
        strip.appendChild(createSet()); strip.appendChild(createSet()); strip.appendChild(createSet());
        wrapper.appendChild(strip); ghostStrips.push(strip); cells.forEach(item => item.el.style.opacity = '0');
    });
}

function endDrag() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (!isDragging || !dragAxis) { resetDragState(); return; }
    
    const faceW = (cellSizePixel * subSize) + (GAP_CELL * (subSize - 1));
    const unit = (moveMode === 'cheat') ? (cellSizePixel + GAP_CELL) : (faceW + GAP_FACE);
    const steps = Math.round(currentTranslate / unit);
    
    ghostStrips.forEach(s => { 
        s.style.transition = 'transform 0.2s ease-out'; 
        s.style.transform = (dragAxis === 'h') ? `translateX(${steps * unit}px)` : `translateY(${steps * unit}px)`; 
    });

    setTimeout(() => {
        if (steps !== 0) {
            const loops = Math.abs(steps) * ((moveMode === 'cheat') ? 1 : subSize);
            const lines = (moveMode === 'frame') ? subSize : 1;
            const sr = Math.floor(activeRow / subSize) * subSize;
            const sc = Math.floor(activeCol / subSize) * subSize;

            for(let l = 0; l < lines; l++) {
                let r = (dragAxis === 'h' && moveMode === 'frame') ? sr + l : activeRow;
                let c = (dragAxis === 'v' && moveMode === 'frame') ? sc + l : activeCol;
                for(let i = 0; i < loops; i++) moveLogic(r, c, dragAxis === 'v', steps < 0);
            }
            checkComplete();
        }
        resetDragState();
    }, 210);
}

function moveLogic(r, c, isV, isRev) {
    const t = subSize * gridNum;
    if (isV) {
        if (isRev) {
            let temp = board[0][c]; for (let i = 0; i < t - 1; i++) board[i][c] = board[i+1][c]; board[t-1][c] = temp;
        } else {
            let temp = board[t-1][c]; for (let i = t-1; i > 0; i--) board[i][c] = board[i-1][c]; board[0][c] = temp;
        }
    } else {
        if (isRev) board[r].push(board[r].shift()); else board[r].unshift(board[r].pop());
    }
}

function shuffle() {
    const t = subSize * gridNum, count = parseInt(document.getElementById('scramble-count').value) || 20;
    resetStatus();
    for (let i = 0; i < count; i++) {
        const isV = Math.random() > 0.5, isRev = Math.random() > 0.5, lineIdx = Math.floor(Math.random() * t);
        for (let j = 0; j < subSize; j++) moveLogic(isV ? 0 : lineIdx, isV ? lineIdx : 0, isV, isRev);
    }
    randomizeTargetByMoves(20);
    render();
    checkComplete();
}

function randomizeTargetByMoves(steps) {
    const colors = Array.from({length: gridNum * gridNum}, (_, i) => i);
    for (let i = 0; i < steps; i++) {
        const isV = Math.random() > 0.5, isRev = Math.random() > 0.5, line = Math.floor(Math.random() * gridNum);
        let idxs = [];
        if (isV) for (let g = 0; g < gridNum; g++) idxs.push(g * gridNum + line);
        else for (let g = 0; g < gridNum; g++) idxs.push(line * gridNum + g);
        if (isRev) {
            let temp = colors[idxs[0]]; for (let j = 0; j < gridNum - 1; j++) colors[idxs[j]] = colors[idxs[j+1]]; colors[idxs[gridNum - 1]] = temp;
        } else {
            let temp = colors[idxs[gridNum - 1]]; for (let j = gridNum - 1; j > 0; j--) colors[idxs[j]] = colors[idxs[j-1]]; colors[idxs[0]] = temp;
        }
    }
    window.targetColors = colors; renderPreview();
}

function checkComplete() {
    const totalSize = subSize * gridNum;
    for (let f = 0; f < gridNum * gridNum; f++) {
        const fr = Math.floor(f / gridNum) * subSize;
        const fc = (f % gridNum) * subSize;
        const target = window.targetColors[f];
        for (let r = 0; r < subSize; r++) {
            for (let c = 0; c < subSize; c++) {
                if (board[fr + r][fc + c] !== target) return false;
            }
        }
    }

    // 両方のオーバーレイを表示
    document.getElementById('status-board')?.classList.add('show');
    document.getElementById('status-preview')?.classList.add('show');
    return true;
}

function resetStatus() { 
    const sb = document.getElementById('status-board');
    const sp = document.getElementById('status-preview');
    if (sb) sb.classList.remove('show');
    if (sp) sp.classList.remove('show');
}

function resetDragState() { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } clearGhosts(); render(); isDragging = false; }
function clearGhosts() { ghostStrips.forEach(el => el.remove()); ghostStrips = []; }
function updateFrameHighlight(f) { clearFrameHighlights(); if ((isShiftPressed || moveMode === 'frame') && f !== -1) document.getElementById(`face-${f}`)?.classList.add('active-frame'); }
function clearFrameHighlights() { document.querySelectorAll('.face').forEach(el => el.classList.remove('active-frame')); }

window.onmousemove = (e) => handleMove(e.clientX, e.clientY);
window.onmouseup = endDrag;
window.ontouchmove = (e) => { if(isDragging) { if(e.cancelable) e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); } };
window.ontouchend = endDrag;

// 実行タイミングをDOM構築後に固定
window.addEventListener('load', () => {
    changeMode(2, 3);
});