/**
 * メイン盤面描画（画像・動画・カラー完全統合版）
 */
function render() {
    const container = document.getElementById('board'); 
    if (!container) return;
    
    // レイアウト設定
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
                const col = fc + c;
                const row = fr + r;
                const piece = board[row][col];
                const value = piece.value;
                
                const cell = document.createElement('div');
                cell.dataset.row = row; 
                cell.dataset.col = col;
                
                // --- 物理リセットと基本スタイル ---
                cell.innerHTML = '';
                cell.className = 'cell';
                cell.style.width = cell.style.height = `${cellSizePixel}px`;
                cell.style.backgroundImage = 'none';

                // --- メディア状態の取得 ---
                const mm = window.mediaManager;
                const hasValidMedia = mm && mm.mediaSrc && mm.mediaSrc !== "";

                if (hasValidMedia) {
                    const originalFace = value;
                    const faceR = Math.floor(originalFace / gridNum);
                    const faceC = originalFace % gridNum;
                    const originalAbsRow = faceR * subSize + r;
                    const originalAbsCol = faceC * subSize + c;

                    if (mm.mode === 'video') {
                        const canvas = document.createElement('canvas');
                        canvas.className = 'video-tile-canvas';
                        canvas.dataset.origR = originalAbsRow;
                        canvas.dataset.origC = originalAbsCol;
                        canvas.width = canvas.height = cellSizePixel;
                        cell.appendChild(canvas);
                        cell.classList.add('video-tile');
                    } 
                    else if (mm.mode === 'image' && window.rotationManager) {
                        const tId = piece.tileId;
                        const canvas = document.createElement('canvas');
                        canvas.width = canvas.height = cellSizePixel;
                        const ctx = canvas.getContext('2d');
                        const totalCells = subSize * gridNum;
                        
                        const origAbsR = Math.floor(tId / totalCells);
                        const origAbsC = tId % totalCells;

                        const img = mm.mediaElement;
                        const minSide = Math.min(img.naturalWidth, img.naturalHeight);
                        const sx0 = (img.naturalWidth - minSide) / 2;
                        const sy0 = (img.naturalHeight - minSide) / 2;
                        const step = minSide / totalCells;

                        window.rotationManager.render(
                            ctx, piece, img, 
                            0, 0, cellSizePixel, cellSizePixel,
                            sx0 + (origAbsC * step), sy0 + (origAbsR * step), step, step
                        );
                        cell.appendChild(canvas);
                    }
                } else {
                    cell.classList.add(`c${value}`);
                }

                // --- イベント制御（フラッシュ & ドラッグ） ---
                const startAction = (clientX, clientY, type, e) => {
                    if (window.isFlashMode === true) {
                        if (typeof triggerFlash === 'function') {
                            triggerFlash(value);
                        }
                    }
                    handleStart(row, col, f, clientX, clientY, type, e);
                };

                cell.onmousedown = (e) => startAction(e.clientX, e.clientY, 'mouse', e);
                const touchHandler = (e) => {
                    const touch = e.touches[0];
                    startAction(touch.clientX, touch.clientY, 'touch', e);
                };

                // passive: true を指定することでブラウザの警告を消し、スクロールを滑らかにします
                cell.addEventListener('touchstart', (e) => {
                    const touch = e.touches[0];
                    startAction(touch.clientX, touch.clientY, 'touch', e);
                }, { passive: true });

                // マウスイベントも同様に
                cell.addEventListener('mousedown', (e) => {
                    startAction(e.clientX, e.clientY, 'mouse', e);
                });
                cell.oncontextmenu = (e) => {
                    e.preventDefault();
                    render();
                };
                faceEl.appendChild(cell);
            }
        }
        container.appendChild(faceEl);
    }
}

/**
 * ターゲットプレビュー描画（アスペクト比・サイズ完全固定版）
 */
function renderPreview() {
    const container = document.getElementById('preview');
    if (!container || !targetBoard) return;
    container.innerHTML = '';

    // --- 1. サイズとアスペクト比の絶対固定 ---
    const fixedSize = 115;
    const style = container.style;
    style.width = style.height = style.minWidth = style.minHeight = style.maxWidth = style.maxHeight = `${fixedSize}px`;
    style.overflow = 'hidden';
    style.position = 'relative';
    style.margin = '0 auto';
    style.border = '2px solid #444';
    style.boxSizing = 'border-box';

    const mm = window.mediaManager;
    const hasMedia = mm && mm.mode !== 'color' && mm.mediaSrc;

    if (hasMedia) {
        // --- 2. メディア表示（画像・動画） ---
        style.display = 'block';
        const mediaEl = (mm.mode === 'video') ? document.createElement('video') : new Image();
        
        const currentSrc = mm.mediaSrc;
        if (currentSrc) {
            mediaEl.src = currentSrc;
            mediaEl.style.width = '100%';
            mediaEl.style.height = '100%';
            mediaEl.style.objectFit = 'cover';
            mediaEl.style.display = 'block';

            if (mm.mode === 'video') {
                mediaEl.muted = true;
                mediaEl.loop = true;
                mediaEl.playsInline = true;
                mediaEl.play().catch(() => {});
            }
            container.appendChild(mediaEl);
        } else {
            drawColorGrid(container);
        }
    } else {
        // --- 3. カラーモード ---
        // ここで targetBoard の現在の並びに基づき描画を行う
        drawColorGrid(container);
    }
}

/**
 * カラーグリッド描画ロジック（既存の構造を維持）
 */
function drawColorGrid(container) {
    container.style.display = 'grid';
    const totalSize = subSize * gridNum;
    container.style.gridTemplateColumns = `repeat(${totalSize}, 1fr)`;
    container.style.gridTemplateRows = `repeat(${totalSize}, 1fr)`;
    container.style.gap = '1px';
    container.style.backgroundColor = '#444';

    for (let r = 0; r < totalSize; r++) {
        for (let c = 0; c < totalSize; c++) {
            const cell = document.createElement('div');
            const piece = targetBoard[r][c];
            
            // オブジェクトから値を抽出し、既存の CSS クラス（c0, c1...）を適用
            const val = (piece && typeof piece === 'object') ? piece.value : piece;
            
            cell.className = `preview-cell c${val}`;
            cell.style.width = '100%';
            cell.style.height = '100%';
            container.appendChild(cell);
        }
    }
}

/**
 * 座標ラベル描画
 */
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
 * インターフェースのロック制御
 * 1ブロック1メソッド：既存の setInterfaceLock を完全に置き換え、元の状態に戻します。
 */
function setInterfaceLock(isLocked) {
    const targetSelectors = [
        'button[onclick="copyCurrentToTarget()"]',
        'button[onclick="startRotateCountdown()"]',
        'button[onclick="toggleFlash()"]',
        'button[onclick="toggleSearchlight()"]',
        'button[onclick="toggleV2Panel()"]',
        'button[onclick="toggleVideoPanel()"]',
        '#shuffle-btn',
        '#mode-select',
        '#scramble-count',
        '#replay-trigger'
    ];
    
    targetSelectors.forEach(selector => {
        const el = document.querySelector(selector);
        if (!el) return;

        el.disabled = isLocked;
        el.style.opacity = isLocked ? "0.3" : "1";
        el.style.cursor = isLocked ? "not-allowed" : "pointer";
        el.style.pointerEvents = isLocked ? "none" : "auto";
    });
}

function toggleFlashMode() {
    window.isFlashMode = !window.isFlashMode;
    const btn = document.getElementById('flash-toggle-btn');
    if (btn) {
        btn.classList.toggle('active', window.isFlashMode);
    }
    // 状態をログに記録（任意）
    if (typeof addLog === 'function') addLog(`Flash Mode: ${window.isFlashMode}`);
}

/**
 * コンプリートオーバーレイ隠蔽
 */
function hideCompleteOverlays() {
    const sb = document.getElementById('status-board');
    const sp = document.getElementById('status-preview');
    if (sb) sb.classList.remove('show');
    if (sp) sp.classList.remove('show');
}

/**
 * ターゲット配色データから極小のHTMLプレビューアイコンを生成
 * 数値配列とオブジェクト配列の両方に対応し、色の配置を正確に再現する
 */
function createMiniPreview(state) {
    if (!state || !Array.isArray(state)) return '';
    
    const size = state.length;
    const cellSize = 3; // アイコン内の1セルのpxサイズ
    
    // グリッドレイアウトでターゲットの配色を再現
    let html = `<div style="display:grid; grid-template-columns:repeat(${size}, ${cellSize}px); gap:1px; background:#444; padding:1px; border-radius:1px;">`;
    
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const entry = state[r][c];
            let val;

            // データの型を厳密に評価
            if (entry !== null && typeof entry === 'object') {
                // オブジェクト形式 {value: n, ...} の場合
                val = entry.value;
            } else {
                // 数値単体の場合
                val = entry;
            }

            // 抽出した数値に基づき、既存のCSSクラス(c0, c1...)を適用
            // 数値が未定義の場合は透明または背景色
            const colorClass = (val !== undefined && val !== null) ? `c${val}` : '';
            html += `<div class="${colorClass}" style="width:${cellSize}px; height:${cellSize}px;"></div>`;
        }
    }
    html += `</div>`;
    return html;
}

/**
 * 渡されたコンテナに、指定された状態(state)を描画する
 * 既存の drawColorGrid のロジックをそのまま流用
 */
function drawStateToContainer(container, state) {
    if (!container || !state) return;
    container.innerHTML = '';
    
    const size = gridNum; 
    // アイコンなので小さく。30pxの枠なら 30/gridNum
    const cellSize = Math.floor(30 / size); 

    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
    container.style.gap = '0';

    // stateを1次元にしてループ
    const flat = Array.isArray(state[0]) ? state.flat() : state;

    flat.forEach(colorIdx => {
        const cell = document.createElement('div');
        cell.className = `c${colorIdx}`;
        cell.style.width = `${cellSize}px`;
        cell.style.height = `${cellSize}px`;
        container.appendChild(cell);
    });
}

/**
 * V2メディアパネルの表示/非表示を切り替え
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

    } else {
        // 画像パネルを閉じる
        panel.style.display = 'none';
        toggleBtn.classList.remove('active');
    }
    resetColorTargetView();

}
let autoStepInterval = null;
const LONG_PRESS_DELAY = 300; // 長押しと判定するまでの待ち時間(ms)
const STEP_SPEED = 150;       // 連続進行の速さ(ms)

function startContinuousStep(direction) {
    if (autoStepInterval) return;

    // 少し待ってから連続実行を開始（1回クリックとの誤爆防止）
    autoStepInterval = setTimeout(() => {
        autoStepInterval = setInterval(() => {
            if (direction === 'next') {
                if (window.currentReplayIdx >= window.replaySteps.length) return stopContinuousStep();
                replayStepNext();
            } else {
                if (window.currentReplayIdx <= 0) return stopContinuousStep();
                replayStepBack();
            }
        }, STEP_SPEED);
    }, LONG_PRESS_DELAY);
}

function stopContinuousStep() {
    if (autoStepInterval) {
        clearTimeout(autoStepInterval);
        clearInterval(autoStepInterval);
        autoStepInterval = null;
    }
}

/**
 * 履歴のインデックスからデータをロード（JSONエスケープエラー回避用）
 * 1ブロック1メソッド：新規追加してください。
 */
function loadHistoryByIndex(index) {
    if (!window.currentFilteredHistory || !window.currentFilteredHistory[index]) {
        console.error("History data not found for index:", index);
        return;
    }
    
    const data = window.currentFilteredHistory[index];
    
    // 既存の履歴ロード関数（loadFilteredHistory）を呼び出す
    if (typeof loadFilteredHistory === 'function') {
        loadFilteredHistory(data);
    } else {
        console.warn("loadFilteredHistory is not defined.");
    }
}