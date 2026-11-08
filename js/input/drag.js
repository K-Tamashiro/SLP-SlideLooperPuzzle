/** input/drag.js — responsibility described in docs/architecture.md. */

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
        }, LONG_PRESS_MS);
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

    const unit = (moveMode === 'cheat') ? (cellSizePixel + GAP_CELL) : GhostLayer.slideUnit();
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
    const isVertical = axis === 'v';
    const activeIndex = isVertical ? activeCol : activeRow;
    const start = Math.floor(activeIndex / subSize) * subSize;
    const indices = moveMode === 'frame'
        ? Array.from({ length: subSize }, (_, i) => start + i)
        : [activeIndex];
    ghostStrips.push(...GhostLayer.createLines({ isVertical, indices, sourceOpacity: 0.2 }));
}

function resetDragState() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    GhostLayer.remove(ghostStrips);
    ghostStrips = [];
    render();
    isDragging = false;
}

