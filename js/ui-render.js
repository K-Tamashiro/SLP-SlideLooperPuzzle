/**
 * 盤面描画
 */
function render() {
    const container = document.getElementById('board'); 
    if (!container) return;
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
                const cell = document.createElement('div');
                const col = fc + c;
                const row = fr + r;
                
                cell.dataset.row = row; 
                cell.dataset.col = col;
                const value = board[row][col]; 

                if (window.mediaManager && window.mediaManager.mode !== 'color' && window.mediaManager.mediaSrc) {
                    const originalFace = value;
                    const faceR = Math.floor(originalFace / gridNum);
                    const faceC = originalFace % gridNum;
                    
                    const originalAbsRow = faceR * subSize + r;
                    const originalAbsCol = faceC * subSize + c;
                    const originalAbsValue = originalAbsRow * totalCells + originalAbsCol;

                    window.mediaManager.applyMediaStyle(cell, originalAbsValue);
                    cell.className = 'cell';
                } else {
                    cell.className = `cell c${value}`;
                }
                cell.innerText = "";
                cell.style.width = cell.style.height = `${cellSizePixel}px`;

                cell.onmousedown = (e) => {
                    if(typeof isFlashMode !== 'undefined' && isFlashMode) triggerFlash(value);
                    handleStart(row, col, f, e.clientX, e.clientY, 'mouse', e);
                };
                cell.ontouchstart = (e) => {
                    if(typeof isFlashMode !== 'undefined' && isFlashMode) triggerFlash(value);
                    handleStart(row, col, f, e.touches[0].clientX, e.touches[0].clientY, 'touch', e);
                };
                faceEl.appendChild(cell);
            }
        }
        container.appendChild(faceEl);
    }
}

/**
 * ターゲットプレビュー描画
 */
function renderPreview() {
    const container = document.getElementById('preview');
    if (!container || !targetBoard) return;

    container.innerHTML = '';
    
    const totalSize = subSize * gridNum;
    const pSize = totalSize > 6 ? 8 : 12;
    const gap = 1;
    const gridPx = (pSize * totalSize) + (gap * (totalSize - 1));

    container.style.width = `${gridPx}px`;
    container.style.height = `${gridPx}px`;

    if (window.mediaManager && window.mediaManager.mode !== 'color' && window.mediaManager.mediaSrc) {
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.overflow = 'hidden';
        
        const el = window.mediaManager.mode === 'image' ? new Image() : document.createElement('video');
        el.src = window.mediaManager.mediaSrc;
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.objectFit = 'cover';

        if (window.mediaManager.mode === 'video') {
            el.autoplay = true; el.muted = true; el.loop = true; el.playsInline = true;
        }
        container.appendChild(el);
    } else {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${totalSize}, ${pSize}px)`;
        container.style.gap = `${gap}px`;

        for (let r = 0; r < totalSize; r++) {
            for (let c = 0; c < totalSize; c++) {
                const cell = document.createElement('div');
                cell.className = `preview-cell c${targetBoard[r][c]}`;
                cell.style.width = `${pSize}px`;
                cell.style.height = `${pSize}px`;
                cell.innerText = ""; 
                container.appendChild(cell);
            }
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
        'button[onclick="startRotateCountdown()"]',
        'button[onclick="toggleFlash()"]',
        'button[onclick="toggleSearchlight()"]',
        'button[onclick="toggleV2Panel()"]', // 画像モードパネル
        'button[onclick="toggleVideoPanel()"]', // 動画モードパネル
        '#shuffle-btn',
        '#mode-select',
        '#scramble-count',
        '#replay-trigger'
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

    const logBtn = document.querySelector('.log-btn');
    if (logBtn) {
        logBtn.disabled = isLocked;
        logBtn.style.opacity = isLocked ? "0.3" : "1";
        logBtn.style.pointerEvents = isLocked ? "none" : "auto";
    }
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

        // 回転ギミックの強制解除
        isRotateMode = false; // フラグを強制OFF
        if (rotateBtn) {
            rotateBtn.disabled = true; // ボタンを物理ロック
            rotateBtn.classList.remove('active'); // 発光解除
            rotateBtn.style.opacity = '0.3'; // 非活性を視覚化
            rotateBtn.style.pointerEvents = 'none'; // クリックを完全遮断
        }
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
        // ★ 追加：パネルを閉じた際にフラッシュモードを強制的にONにする
        if (typeof isFlashMode !== 'undefined') {
            isFlashMode = true;
            // フラッシュボタンの見た目も更新（IDが 'flash-btn' の場合）
            const flashBtn = document.querySelector('button[onclick="toggleFlash()"]');
            if (flashBtn) flashBtn.classList.add('active');
        }
    }
    resetColorTargetView();
}