/** ui/board.js — responsibility described in docs/architecture.md. */

/**
 * 補助ユーティリティ
 */
/**
 * メニューパネルの開閉制御
 * @param {boolean|null} forceState - trueなら開く、falseなら閉じる、nullなら反転
 */
function toggleMenu(forceState = null) {
    const panel = document.querySelector('.menu-panel');
    if (!panel) return;

    if (forceState === true) {
        panel.classList.add('open');
    } else if (forceState === false) {
        panel.classList.remove('open');
    } else {
        // 引数がない場合は、これまでの通り反転(toggle)させる
        panel.classList.toggle('open');
    }
}

/**
 * ナンバー表示モードの切り替え
 */
function toggleNumberView() {
    window.viewNumber = !window.viewNumber;

    const btn = document.getElementById('number-trigger');
    if (btn) {
        btn.classList.toggle('active-toggle', window.viewNumber);
    }

    // 状態をログに記録（任意）
    if (typeof addLog === 'function') addLog(`Number View: ${window.viewNumber}`);

    render();
}

/**
 * レイアウト計算（ブロック数に応じた動的スケーリング版）
 */
function calculateLayout() {
    const isMobile = window.innerWidth < 600;
    const totalSize = subSize * gridNum; // 2x2なら4、3x3なら9
    const containerWidth = isMobile
        ? Math.min(window.innerWidth, document.documentElement.clientWidth) - 40 // 余白を少し詰める
        : 500;

    // 1. 隙間（GAP）の動的設定
    GAP_FACE = (gridNum <= 2) ? 8 : 4;
    const totalFaceGaps = (gridNum - 1) * GAP_FACE;
    const totalCellGaps = (totalSize - gridNum) * GAP_CELL;

    // 2. 利用可能な幅から1セルあたりの基本サイズを算出
    cellSizePixel = Math.floor((containerWidth - totalFaceGaps - totalCellGaps) / totalSize);

    // 3. ★重要：ブロック数に応じたサイズ制限の緩和
    let maxCell;
    if (isMobile) {
        switch (totalSize) {
            case 4:  // Easy: 2x2 (sub:2, grid:2)
                maxCell = 85;
                break;
            case 6:  // Mid: 2x3 (sub:2, grid:3)  diff 3x2(2x2)
                maxCell = 55;
                break;
            case 8:  // Advance: 2x4 (sub:2, grid:4)
                maxCell = 40;
                break;
            case 9:  // Hard: 3x3 (sub:3, grid:3)
                maxCell = 35;
                break;
            default: // その他特殊設定時
                maxCell = 40;
        }
        cellSizePixel = Math.max(30, Math.min(maxCell, cellSizePixel));
    } else {
        // デスクトップ版の制限緩和
        switch (totalSize) {
            case 4:
                maxCell = 130;
                break;
            case 6:
                maxCell = 90;
                break;
            case 8:
                maxCell = 90;
                break;
            case 9:
                maxCell = 90;
                break;
            default:
                maxCell = 90;
        }
        cellSizePixel = Math.max(40, Math.min(maxCell, cellSizePixel));
    }
    window.initialBoardSnapshot = null;
    window.currentSessionId = null;
    moveCount = 0;
    window.elapsedTime = 0;
}

/**
 * コンプリート表示を強制的に閉じる
 */
function hideCompleteDisplay() {
    document.getElementById('status-board')?.classList.remove('show');
    document.getElementById('status-preview')?.classList.remove('show');
    if (completeTimerId) {
        clearTimeout(completeTimerId);
        completeTimerId = null;
    }
}

/**
 * メイン盤面描画（画像・動画・カラー完全統合版）
 * ターゲットビューの配置に基づいた、各枠(Face)内での連続性を考慮したナンバリング表示
 */
function render() {
    const container = document.getElementById('board'); 
    if (!container) return;
    
    // レイアウト設定
    container.style.gridTemplateColumns = `repeat(${gridNum}, 1fr)`; 
    container.style.gap = `${GAP_FACE}px`; 
    container.innerHTML = '';

    const totalCells = subSize * gridNum;

    // --- ターゲットビューにおける各フェースの表示位置を計算（カラーモード用） ---
    const mm = window.mediaManager;
    const isColorMode = !mm || mm.mode === 'color';
    const faceToTargetPos = new Map();

    if (isColorMode && targetBoard) {
        for (let fr = 0; fr < gridNum; fr++) {
            for (let fc = 0; fc < gridNum; fc++) {
                // 各フェース（ブロック）の左上セルの値をフェースIDとして取得
                const val = targetBoard[fr * subSize][fc * subSize];
                const fVal = (val && typeof val === 'object') ? val.value : val;
                // フェースIDに対して、ターゲットビュー上での「どのフェース位置（行列）」にあるかを保持
                faceToTargetPos.set(fVal, { tr: fr * subSize, tc: fc * subSize });
            }
        }
    }

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
                cell.style.position = 'relative'; 
                cell.style.zIndex = '1';
                cell.style.overflow = 'hidden';
                
                cell.style.display = 'flex';
                cell.style.alignItems = 'center';
                cell.style.justifyContent = 'center';

                // --- 1. 背景（メディアまたはカラー）の描画 ---
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

                // --- 2. ナンバーラベルの追加（ターゲットビュー準拠の絶対ナンバリング） ---
                if (window.viewNumber) {
                    const numSpan = document.createElement('span');
                    
                    let displayNum = "";
                    if (piece.tileId !== undefined) {
                        if (isColorMode && targetBoard) {
                            // カラーモード：ターゲットビューの物理位置を基点とした絶対計算
                            const pos = faceToTargetPos.get(piece.value);
                            if (pos) {
                                // ピースの元々の面内相対座標を取得
                                const relR = Math.floor(piece.tileId / totalCells) % subSize;
                                const relC = (piece.tileId % totalCells) % subSize;

                                // ターゲットビュー（完成図）におけるこのピースの絶対座標
                                const targetAbsR = pos.tr + relR;
                                const targetAbsC = pos.tc + relC;

                                // 盤面全体での行列インデックスから通し番号を算出 (1〜N^2)
                                // これにより、どのようなターゲット配置でも完成時に1, 2, 3...と並ぶ
                                displayNum = (targetAbsR * totalCells) + targetAbsC + 1;
                            } else {
                                displayNum = piece.tileId + 1;
                            }
                        } else {
                            // イメージ・動画モードは本来の正解位置を表示
                            displayNum = piece.tileId + 1;
                        }
                    }

                    numSpan.innerText = displayNum;
                    numSpan.style.position = 'absolute';
                    numSpan.style.zIndex = '10';
                    numSpan.style.color = '#fff';
                    numSpan.style.fontWeight = 'bold';
                    numSpan.style.textShadow = '1px 1px 2px #000, -1px -1px 2px #000';
                    numSpan.style.pointerEvents = 'none';
                    numSpan.style.fontSize = `${cellSizePixel * 0.4}px`;
                    numSpan.style.lineHeight = '1';
                    numSpan.style.whiteSpace = 'nowrap';
                    
                    const angle = (piece.direction || 0) * 90;
                    numSpan.style.transform = `rotate(${angle}deg)`;
                    
                    cell.appendChild(numSpan);
                }

                // --- 3. イベント制御 ---
                const startAction = (clientX, clientY, type, e) => {
                    if (window.isFlashMode === true && typeof triggerFlash === 'function') {
                        triggerFlash(value);
                    }
                    handleStart(row, col, f, clientX, clientY, type, e);
                };

                cell.onmousedown = (e) => startAction(e.clientX, e.clientY, 'mouse', e);
                cell.addEventListener('touchstart', (e) => {
                    const touch = e.touches[0];
                    startAction(touch.clientX, touch.clientY, 'touch', e);
                }, { passive: true });
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
        '#scramble-count'
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

/**
 * コンプリートオーバーレイ隠蔽
 */
function hideCompleteOverlays() {
    const sb = document.getElementById('status-board');
    const sp = document.getElementById('status-preview');
    if (sb) sb.classList.remove('show');
    if (sp) sp.classList.remove('show');
}

