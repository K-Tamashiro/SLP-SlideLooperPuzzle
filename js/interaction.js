/**
 * ドラッグ開始
 */
function handleStart(r, c, f, x, y, type, event) {
    if (isDragging) return;
    isDragging = true; startX = x; startY = y; activeRow = r; activeCol = c;
    
    if (type === 'mouse') {
        moveMode = event.ctrlKey ? 'cheat' : (event.shiftKey ? 'frame' : 'standard');
        if (moveMode === 'frame') updateFrameHighlight(true);
    } else {
        moveMode = 'standard';
        longPressTimer = setTimeout(() => { 
            moveMode = 'frame'; 
            if (navigator.vibrate) navigator.vibrate(50);
            updateFrameHighlight(true); 
        }, LONG_PRESS_MS);
    }
    dragAxis = null; currentTranslate = 0;
}

/**
 * ドラッグ移動
 */
function handleMove(curX, curY) {
    if (!isDragging) return;
    const dx = curX - startX, dy = curY - startY;
    if (!dragAxis) {
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            dragAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
            createGhosts(dragAxis);
            if (moveMode === 'frame') updateFrameHighlight(true);
        } else return;
    }
    currentTranslate = (dragAxis === 'h') ? dx : dy;
    const ts = (dragAxis === 'h') ? `translateX(${currentTranslate}px)` : `translateY(${currentTranslate}px)`;
    ghostStrips.forEach(s => s.style.transform = ts);
}

/**
 * ドラッグ終了
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
                // ここで音を鳴らす
                if (typeof playSound === 'function') playSound('move');
            }

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
 * ゴースト生成
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
    const PADDING = 10;

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

                // --- ★動画スナップショット適用ロジック ---
                const originalCanvas = item.el.querySelector('canvas');
                if (originalCanvas) {
                    // クローン内の空のCanvasを削除
                    clone.querySelectorAll('canvas').forEach(c => c.remove());
                    // 元のCanvasの現在の見た目をデータURLとして抽出
                    const dataUrl = originalCanvas.toDataURL();
                    clone.style.backgroundImage = `url(${dataUrl})`;
                    clone.style.backgroundSize = 'cover';
                }
                // ---------------------------------------

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

function updateFrameHighlight(isActive) {
    document.querySelectorAll('.face').forEach(f => f.classList.remove('active-frame'));
    if (isActive && moveMode === 'frame') {
        const fIdx = Math.floor(activeRow / subSize) * gridNum + Math.floor(activeCol / subSize);
        const target = document.getElementById(`face-${fIdx}`);
        if (target) target.classList.add('active-frame');
    }
}

function resetDragState() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    ghostStrips.forEach(el => el.remove());
    ghostStrips = [];
    render();
    isDragging = false;
}

/**
 * 特殊ギミック：フラッシュ
 */
function toggleFlash() {
    window.isFlashMode = !window.isFlashMode;
    const btn = document.querySelector('button[onclick="toggleFlash()"]');
    if (btn) btn.classList.toggle('active-toggle', window.isFlashMode);
}

function triggerFlash(clickedValue) {
    if (clickedValue === undefined) return;
    document.querySelectorAll('.cell').forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        const piece = board[r][c];
        if (piece && piece.value === clickedValue) {
            cell.classList.add('flash-active');
            const t = cell.getAttribute('data-f-t');
            if (t) clearTimeout(parseInt(t));
            const timer = setTimeout(() => {
                cell.classList.remove('flash-active');
            }, 1500);
            cell.setAttribute('data-f-t', timer);
        }
    });
}

// interaction.js の冒頭に配置
function updateFrameProgress(id, percent) {
    const el = document.getElementById(`${id}-frame`);
    if (!el) return;
    el.style.opacity = percent > 0 ? '1' : '0';
    el.style.background = `conic-gradient(currentColor ${percent}%, transparent ${percent}%)`;
}

function rotateBoard() {
    const wrapper = document.getElementById('board-wrapper');
    wrapper.classList.add('board-rotating');

    setTimeout(() => {
        if (rotateTimerId) { clearInterval(rotateTimerId); rotateTimerId = null; }
        updateFrameProgress('rotate', 0);

        const n = subSize * gridNum;
        let newBoard = Array.from({length: n}, () => new Array(n).fill(null));

        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const piece = board[r][c];
                if (!piece) continue;

                // 1. パーツ自体のミクロ回転（向きの変更）
                if (window.rotationManager) {
                    window.rotationManager.rotate(piece);
                }

                // 2 & 3. 枠内の位置入れ換え ＋ 枠自体の移動
                // 物理インデックスを [r][c] から [c][(n-1)-r] へ転送
                // これにより、図にある「左上(1) -> 右上(2) -> 右下(4) -> 左下(3)」の
                // 枠内スワップが、盤面全体の回転と同期して強制的に実行されます
                let targetRow = c;
                let targetCol = (n - 1) - r;
                
                newBoard[targetRow][targetCol] = piece;
            }
        }
        board = newBoard;

        render(); 
        checkComplete();
        wrapper.classList.remove('board-rotating');
    }, 400);
}

function startRotateCountdown() {
    const btn = document.querySelector('button[onclick="startRotateCountdown()"]');
    if (!btn) return;
    const isReserved = btn.classList.contains('active-toggle-red');
    if (isReserved) {
        btn.classList.remove('active-toggle-red');
        stopRotateIntervalOnly();
    } else {
        btn.classList.add('active-toggle-red');
        if (timerId && !window.rotateTimerId) executeRotateLoop();
    }
}

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
 * 回転ギミックの実行ループ：自動継続対応版
 */
function executeRotateLoop() {
    const frame = document.getElementById('rotate-frame');
    const n = subSize * gridNum;
    const perimeterCells = (n * 4) - 4;
    let duration = 0;
    if (debugmode){
        duration = perimeterCells * 500; // 1セル0.5秒計算 デバッグモード
    } else{
        duration = perimeterCells * 3000; // 1セル3秒計算
    }
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

// グローバル変数として追加
window.searchlightRadius = 0; // 0: OFF, 80: 小, 120: 中, 160: 大

// 半径の定義: 0(OFF), 80(S), 130(M), 180(L)
window.slRadius = window.slRadius || 0; 

/**
 * 独立した描画関数：システムの状態に関わらず、指定座標にマスクを適用する
 */
function applySearchlightMask(x, y) {
    if (!window.slRadius) return;
    const overlay = document.getElementById('searchlight-overlay');
    if (!overlay) return;

    const wrapper = document.getElementById('board-wrapper');
    const rect = wrapper.getBoundingClientRect();
    const relX = x - rect.left;
    const relY = y - rect.top;

    const mask = `radial-gradient(circle ${window.slRadius}px at ${relX}px ${relY}px, transparent 95%, black 100%)`;
    overlay.style.webkitMaskImage = mask;
    overlay.style.maskImage = mask;
    overlay.classList.add('fx-active');
}

/**
 * toggleSearchlight
 */
function toggleSearchlight() {
    const sizes = [0, 80, 130, 180];
    const labels = ["", "S", "M", "L"];
    const currentIndex = sizes.indexOf(window.slRadius || 0);
    const nextIndex = (currentIndex + 1) % sizes.length;
    
    window.slRadius = sizes[nextIndex];
    window.isSearchlightMode = (window.slRadius > 0);

    const btn = document.querySelector('button[onclick="toggleSearchlight()"]');
    if (btn) {
        btn.classList.toggle('active-toggle', window.isSearchlightMode);
        btn.setAttribute('data-label', labels[nextIndex]);
    }

    const wrapper = document.getElementById('board-wrapper');
    let overlay = document.getElementById('searchlight-overlay');

    if (!window.isSearchlightMode) {
        if (overlay) overlay.remove();
        hideCompleteOverlays();
    } else {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'searchlight-overlay';
            overlay.className = 'searchlight-overlay';
            wrapper.appendChild(overlay);
        }
        
        // --- 独立したプレビュー実行 ---
        // マウスが動いていなくても、盤面中央を基準に即座に表示を更新
        const rect = wrapper.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        applySearchlightMask(centerX, centerY);
    }
}

function updateSearchlight(x, y) {
    if (!window.isSearchlightMode || !timerId) return;
    applySearchlightMask(x, y);
}

/**
 * サーチライトのボタンに残った文字列(S/M/L)のみを物理的に消去する
 */
function resetSearchlight() {
    const btn = document.querySelector('button[onclick="toggleSearchlight()"]');
    if (btn) {
        window.slRadius = 0;
        btn.classList.toggle('active-toggle', window.isSearchlightMode);
        btn.setAttribute('data-label', "");
    }
}