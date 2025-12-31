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
                // 有効なリソースURLが存在するか厳格にチェック
                const hasValidMedia = mm && mm.mediaSrc && mm.mediaSrc !== "";

                if (hasValidMedia) {
                    // 正解位置（ソース画像上の座標）の計算
                    const originalFace = value;
                    const faceR = Math.floor(originalFace / gridNum);
                    const faceC = originalFace % gridNum;
                    const originalAbsRow = faceR * subSize + r;
                    const originalAbsCol = faceC * subSize + c;
                    const originalAbsValue = originalAbsRow * totalCells + originalAbsCol;

                    // --- モード別描画分岐 ---
                    if (mm.mode === 'video') {
                        // 動画モード：Canvasを生成して描画対象にする
                        const canvas = document.createElement('canvas');
                        
                        canvas.className = 'video-tile-canvas';
                        canvas.dataset.origR = originalAbsRow;
                        canvas.dataset.origC = originalAbsCol;
                        canvas.width = canvas.height = cellSizePixel;
                        cell.appendChild(canvas);
                        cell.classList.add('video-tile');
                    } 
                    else if (mm.mode === 'image' && window.rotationManager) {
                        const piece = board[row][col];
                        const tId = piece.tileId; // パーツ固有の正解位置ID

                        const canvas = document.createElement('canvas');
                        canvas.width = canvas.height = cellSizePixel;
                        const ctx = canvas.getContext('2d');

                        const totalCells = subSize * gridNum;
                        
                        // tileId（初期のr*totalSize+c）からソース画像上の絶対行・列を算出
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
                // カラーモード（リセット時やメディア未選択時）
                    cell.classList.add(`c${value}`);
                }

                // --- イベント制御（フラッシュ & ドラッグ） ---
                const startAction = (clientX, clientY, type, e) => {
                    // 1. フラグが物理的に TRUE の場合のみ実行
                    if (window.isFlashMode === true) {
                        if (typeof triggerFlash === 'function') {
                            triggerFlash(value);
                        }
                    }
                    handleStart(row, col, f, clientX, clientY, type, e);
                };

                cell.onmousedown = (e) => startAction(e.clientX, e.clientY, 'mouse', e);
                cell.ontouchstart = (e) => {
                    const touch = e.touches[0];
                    startAction(touch.clientX, touch.clientY, 'touch', e);
                };
                cell.oncontextmenu = (e) => {
                    e.preventDefault();
                    const p = board[row][col];
                    rotationManager.rotate(p); // 90度回転
                    render(); // 再描画
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
    const fixedSize = 130;
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
 * カラーモード用のグリッド描画（状態反映版）
 */
function drawColorGridToContainer(container, currentBoardData, size) {
    const n = subSize * gridNum;
    const cellSize = size / n;
    
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    container.style.gridTemplateRows = `repeat(${n}, 1fr)`;

    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const piece = currentBoardData[r][c];
            const cell = document.createElement('div');
            cell.style.width = '100%';
            cell.style.height = '100%';
            
            // piece.value (Face番号) に基づいた色を適用
            if (piece) {
                const colors = ['#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3', '#33FFF3'];
                cell.style.backgroundColor = colors[piece.value % colors.length];
            } else {
                cell.style.backgroundColor = '#333';
            }
            container.appendChild(cell);
        }
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
 */
function setInterfaceLock(isLocked) {
    const targetSelectors = [
        'button[onclick="copyCurrentToTarget()"]',
        'button[onclick="startRotateCountdown()"]', // 後で個別制御
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

        // --- メディアモード時の回転ボタン専用ガード ---
        if (selector.includes('startRotateCountdown') && window.mediaManager && window.mediaManager.mode !== 'color') {
            el.disabled = true;
            el.style.opacity = "0.3";
            el.style.pointerEvents = "none";
            return; // このボタンの処理はここで終了（isLockedの影響を受けさせない）
        }

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
    }
    resetColorTargetView();

}
