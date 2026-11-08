/** game/gimmicks.js — responsibility described in docs/architecture.md. */

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
        if (timerId && !rotateTimerId) executeRotateLoop();
    }
}

function stopRotateIntervalOnly() {
    if (rotateTimerId) {
        clearInterval(rotateTimerId);
        rotateTimerId = null;
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

    rotateTimerId = setInterval(() => {
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

// 半径: 0(OFF), 80(S), 130(M), 180(L)
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

