/**
 * メイン盤面描画
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
                const value = board[row][col]; 

                cell.dataset.row = row; 
                cell.dataset.col = col;
                
                // --- 物理リセット ---
                cell.innerHTML = '';
                cell.className = 'cell'; // クラス初期化
                cell.style.backgroundImage = 'none'; // 背景初期化

                // メディアモード判定
                if (window.mediaManager && window.mediaManager.mode !== 'color' && window.mediaManager.mediaSrc) {
                    const originalFace = value;
                    const faceR = Math.floor(originalFace / gridNum);
                    const faceC = originalFace % gridNum;
                    
                    const originalAbsRow = faceR * subSize + r;
                    const originalAbsCol = faceC * subSize + c;
                    const originalAbsValue = originalAbsRow * totalCells + originalAbsCol;

                    if (window.mediaManager.mode === 'video') {
                        const canvas = document.createElement('canvas');
                        canvas.className = 'video-tile-canvas';
                        canvas.dataset.origR = originalAbsRow;
                        canvas.dataset.origC = originalAbsCol;
                        canvas.width = canvas.height = cellSizePixel;
                        cell.appendChild(canvas);
                        cell.classList.add('video-tile');
                    } else if (window.mediaManager.mode === 'image') {
                        // --- 画像モード復帰の核心 ---
                        cell.style.backgroundImage = ''; // 'none'を解除して上書き許可
                        window.mediaManager.applyMediaStyle(cell, originalAbsValue);
                    }
                } else {
                    // カラーモード
                    cell.classList.add(`c${value}`);
                }

                cell.style.width = cell.style.height = `${cellSizePixel}px`;

                // --- 同色フラッシュ機能の再実装 ---
                const startAction = (clientX, clientY, type, e) => {
                    // flash-system.js のトリガーを呼び出し
                    if (typeof isFlashMode !== 'undefined' && isFlashMode && typeof triggerFlash === 'function') {
                        triggerFlash(value);
                    }
                    handleStart(row, col, f, clientX, clientY, type, e);
                };

                cell.onmousedown = (e) => startAction(e.clientX, e.clientY, 'mouse', e);
                cell.ontouchstart = (e) => {
                    const touch = e.touches[0];
                    startAction(touch.clientX, touch.clientY, 'touch', e);
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
    
    // 1. 外枠サイズを 120px の正方形に厳格固定
    const fixedSize = 120; 
    container.style.width = `${fixedSize}px`;
    container.style.height = `${fixedSize}px`;
    container.style.minWidth = `${fixedSize}px`;
    container.style.minHeight = `${fixedSize}px`;
    container.style.maxWidth = `${fixedSize}px`;  // ワイド化を防止
    container.style.maxHeight = `${fixedSize}px`; // ワイド化を防止
    
    container.style.overflow = 'hidden';
    container.style.position = 'relative';
    container.style.margin = '0 auto';
    container.style.border = '2px solid #444'; 
    container.style.boxSizing = 'border-box'; // borderを含めてサイズ固定

    const hasMedia = window.mediaManager && window.mediaManager.mode !== 'color' && window.mediaManager.mediaSrc;

    if (hasMedia) {
        // --- メディアモード：中身を枠に閉じ込める ---
        container.style.display = 'block';

        const mediaEl = (window.mediaManager.mode === 'video') 
            ? document.createElement('video') 
            : new Image();

        if (window.mediaManager.mediaSrc) {
            mediaEl.src = window.mediaManager.mediaSrc;
            
            // スタイル：親の120pxを絶対に超えず、かつ埋め尽くす
            mediaEl.style.width = '100%';
            mediaEl.style.height = '100%';
            mediaEl.style.objectFit = 'cover'; // これでワイド動画も正方形に切り抜かれる
            mediaEl.style.display = 'block';

            if (window.mediaManager.mode === 'video') {
                mediaEl.autoplay = true;
                mediaEl.muted = true;
                mediaEl.loop = true;
                mediaEl.playsInline = true;
                mediaEl.play().catch(() => {});
            }
            container.appendChild(mediaEl);
        }
    } else {
        // --- カラーモード：グリッド表示 ---
        container.style.display = 'grid';
        const totalSize = subSize * gridNum;
        
        container.style.gridTemplateColumns = `repeat(${totalSize}, 1fr)`;
        container.style.gridTemplateRows = `repeat(${totalSize}, 1fr)`;
        container.style.gap = '1px'; 
        container.style.backgroundColor = '#444';

        for (let r = 0; r < totalSize; r++) {
            for (let c = 0; c < totalSize; c++) {
                const cell = document.createElement('div');
                cell.className = `preview-cell c${targetBoard[r][c]}`;
                cell.style.width = '100%';
                cell.style.height = '100%';
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