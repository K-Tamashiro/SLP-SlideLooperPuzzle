/**
 * ドラッグ開始：警告の元となる振動を一旦停止し、確実に動かす
 */
function handleStart(r, c, f, x, y, type, event) {
    if (isDragging) return;
    isDragging = true;
    startX = x;
    startY = y;
    activeRow = r;
    activeCol = c;

    if (type === 'mouse') {
        // 【変更】Ctrlキーによるチート移動（1cell移動）を廃止。ShiftキーのFrame移動のみ維持。
        // Ctrlキーはmain.js側でボタン表示制御に使用するため、ここでは無視（standard扱い）
        moveMode = event.shiftKey ? 'frame' : 'standard';

        if (moveMode === 'frame') updateFrameHighlight(true);
    } else {
        moveMode = 'standard';

        // 警告回避：ブラウザがクリックの瞬間でも拒否するため、一旦コメントアウトします
        // try { if (navigator.vibrate) navigator.vibrate(10); } catch(e) {}

        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            if (isDragging && !dragAxis) {
                moveMode = 'frame';
                updateFrameHighlight(true);
            }
        }, 250);
    }
    dragAxis = null;
    currentTranslate = 0;
}

function updateFrameHighlight(isActive) {
    let frame = document.getElementById('global-active-frame');
    if (!frame) {
        frame = document.createElement('div');
        frame.id = 'global-active-frame';
        document.body.appendChild(frame);
    }

    if (isActive && moveMode === 'frame') {
        const fIdx = Math.floor(activeRow / subSize) * gridNum + Math.floor(activeCol / subSize);
        const targetFace = document.getElementById(`face-${fIdx}`);
        if (targetFace) {
            const rect = targetFace.getBoundingClientRect();

            // 【雅な工夫】ピースより 4px 外側へ広げる
            const offset = 4;

            Object.assign(frame.style, {
                display: 'block',
                position: 'fixed',
                zIndex: '3000',
                pointerEvents: 'none',
                // 座標をマイナスに、サイズをプラスにして「外側」を囲む
                left: (rect.left - offset) + 'px',
                top: (rect.top - offset) + 'px',
                width: (rect.width + (offset * 2)) + 'px',
                height: (rect.height + (offset * 2)) + 'px',
                boxSizing: 'border-box',

                // 【視認性の真理】白を黒でサンドイッチする
                border: '3px solid #ffffffff',      // メインの白枠
                outline: '1px solid #000000',     // 白のさらに外側の黒い縁
                boxShadow: 'inset 0 0 0 1px #000, 0 0 10px rgba(0,0,0,0.5)', // 白の内側にも黒縁、さらに外に影

                borderRadius: '6px'
            });
        }
    } else {
        if (frame) frame.style.display = 'none';
    }
}

/**
 * ドラッグ移動：遊びを設けて長押しをキャンセルさせない
 */
function handleMove(curX, curY) {
    if (!isDragging) return;
    const dx = curX - startX, dy = curY - startY;

    if (!dragAxis) {
        // デッドゾーン設定：10px動くまでは「静止」とみなして長押し判定を継続
        const threshold = 10;
        if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
            // 閾値を超えたら長押しをキャンセル
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            dragAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
            createGhosts(dragAxis);
            if (moveMode === 'frame') updateFrameHighlight(true);
        } else {
            return; // 遊びの範囲内なので何もしない
        }
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

            for (let l = 0; l < lines; l++) {
                let idx = (moveMode === 'frame') ? startIdx + l : (isV ? activeCol : activeRow);
                recordMove(idx, dir, Math.abs(steps), moveMode);
                for (let i = 0; i < loops; i++) moveLogic(idx, isV, steps < 0);
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
 * ゴースト生成：マージンと同期し、はみ出しを0にする修正版
 */
function createGhosts(axis) {
    let indices = [];
    if (moveMode === 'frame') {
        const start = (axis === 'h') ? Math.floor(activeRow / subSize) * subSize : Math.floor(activeCol / subSize) * subSize;
        for (let i = 0; i < subSize; i++) indices.push(start + i);
    } else {
        indices.push(axis === 'h' ? activeRow : activeCol);
    }

    // --- 修正箇所：基準を board-wrapper から board に変更 ---
    const wrapper = document.getElementById('board');
    const wrapRect = wrapper.getBoundingClientRect();
    const PADDING = 0; // マージン制御を直接反映させるため 0 に設定

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
                const originalCanvas = item.el.querySelector('canvas');
                if (originalCanvas) {
                    clone.querySelectorAll('canvas').forEach(c => c.remove());
                    const dataUrl = originalCanvas.toDataURL();
                    clone.style.backgroundImage = `url(${dataUrl})`;
                    clone.style.backgroundSize = 'cover';
                }
                if (i > 0 && i % subSize === 0) {
                    if (axis === 'h') clone.style.marginLeft = `${GAP_FACE - GAP_CELL}px`;
                    else clone.style.marginTop = `${GAP_FACE - GAP_CELL}px`;
                }
                d.appendChild(clone);
            });
            return d;
        };

        // --- 修正箇所：board 本体のサイズを基準にする ---
        const boardW = wrapRect.width;
        const boardH = wrapRect.height;

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

        // 盤面全体の回転角を更新 (時計回りに+90度)
        window.boardRotationDegree = (window.boardRotationDegree + 90) % 360;

        const n = subSize * gridNum;
        let newBoard = Array.from({ length: n }, () => new Array(n).fill(null));

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
    if (window.debugmode) {
        duration = perimeterCells * 500; // 1セル0.5秒計算 デバッグモード
    } else {
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

/**
 * Scramble Box内の記号をトーラス構造に基づいて反転させる
 * 現在の盤面サイズ（gridNum）を動的に参照し、距離 d を補数 (gridNum - d) に変換
 * さらに配列の順序を逆転させて、解法としての整合性を保つ
 */
function reversePattern() {
    const input = document.getElementById('scramble-input');
    if (!input || !input.value) return;

    // 現在のグリッドサイズ（面数）をcore.jsのグローバル変数から直接取得
    // 4x4なら2、6x6なら3、8x8なら4、9x9なら3が入る
    let gNum;
    try {
        gNum = Number(gridNum);
    } catch (e) {
        gNum = 3; // フォールバック
    }

    const steps = input.value.split(',').map(s => s.trim()).filter(s => s !== "");

    const invertedSteps = steps.map(step => {
        const dashIndex = step.lastIndexOf('-');
        if (dashIndex === -1) return step;

        const label = step.substring(0, dashIndex);
        const action = step.substring(dashIndex + 1);

        const dir = action.charAt(0);
        const distStr = action.substring(1);
        const dist = parseInt(distStr, 10);

        if (isNaN(dist)) return step;

        // トーラス反転計算：その盤面の「段数（面数）」に基づいた距離の補数
        // dist % gNum をとることで、過剰な回転数にも対応
        const revDist = (gNum - (dist % gNum)) % gNum;

        return `${label}-${dir}${revDist}`;
    });

    // 操作の実行順序を逆転させる
    invertedSteps.reverse();

    input.value = invertedSteps.join(',');

    console.log(`Torus Inversion Success: GridNum=${gNum}, Steps=${invertedSteps.length}`);
}