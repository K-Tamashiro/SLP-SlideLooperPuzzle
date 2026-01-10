// --- グローバル変数 ---
let subSize = 2;    
let gridNum = 3;    
let board = [];
let targetBoard = null;
let solveHistory = [];

let cellSizePixel = 42; 
let GAP_FACE = 10; 
const GAP_CELL = 2;  

let startX = 0, startY = 0, isDragging = false, moveMode = 'standard'; 
let activeRow = -1, activeCol = -1, dragAxis = null, currentTranslate = 0;
let ghostStrips = [];
let longPressTimer = null;
const LONG_PRESS_MS = 200;

let moveCount = 0;
let startTime = 0;
let timerId = null;
let rotateTimerId = null;
let isLogEnabled = true; 
let skipCompleteOnce = false;
let rotationManager = null; // ローテーションマネージャー
let completeTimerId = null;
// 解析用の初期状態を保存する変数
let initialAnalyzeBoard = null;
window.isTargetScrambled = false;
window.elapsedTime = 0;

let debugmode = false;
/**
 * 初期化
 */
function initBoard(resetTarget = false) {
    if (timerId) {
        toggleTimer(false); 
    } else {
        setInterfaceLock(false);
    }

    calculateLayout();
    const totalSize = subSize * gridNum;

    // 1. マスターデータ(initialBoard)の生成
    // カラー・画像どちらのモードでも、1つの「枠(Face)」の中は同じ value に統一する
    window.initialBoard = Array.from({length: totalSize}, (_, r) => 
        Array.from({length: totalSize}, (_, c) => {
            // 常に「どの枠(Face)に属するか」を計算 (0, 1, 2...)
            const faceVal = Math.floor(r / subSize) * gridNum + Math.floor(c / subSize);

            return {
                value: faceVal, // これでカラーモード時、1つの枠内が1色に統一される
                tileId: r * totalSize + c, // 画像モード用の絶対座標ID
                direction: 0
            };
        })
    );

    // 3. 盤面の生成（マスターデータの完全コピーで 0123... にリセット）
    board = JSON.parse(JSON.stringify(window.initialBoard));

    if (!rotationManager) {
        rotationManager = new RotationManager(window.mediaManager ? window.mediaManager.mode : 'color');
    }
    resetStats(); 
    clearSolveLog();
    shuffleTargetOnly();

    window.isTargetScrambled = false;

    render();
    renderPreview(); 
    renderCoordinates();
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
    if (isMobile) {
        switch (totalSize) {
            case 4:  // Easy: 2x2 (sub:2, grid:2)
                maxCell = 85; 
                break;
            case 6:  // Mid: 2x3 (sub:2, grid:3)
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
}

/**
 * 移動ロジック
 */
function moveLogic(idx, isV, isRev) {
    const t = subSize * gridNum;
    if (isV) {
        if (isRev) {
            let temp = board[0][idx]; for (let i = 0; i < t - 1; i++) board[i][idx] = board[i+1][idx]; board[t-1][idx] = temp;
        } else {
            let temp = board[t-1][idx]; for (let i = t-1; i > 0; i--) board[i][idx] = board[i-1][idx]; board[0][idx] = temp;
        }
    } else {
        if (isRev) board[idx].push(board[idx].shift()); else board[idx].unshift(board[idx].pop());
    }
}

/**
 * シャッフル
 */
function shuffle() {
    hideCompleteDisplay();
    const count = parseInt(document.getElementById('scramble-count').value) || 15;
    const totalSize = subSize * gridNum;
    resetStats();

    // --- 1. リセット後の最初の1回目だけに行う「準備」 ---
    if (!window.isTargetScrambled) {
        // A. ターゲットビュー（正解の配置）を新しく決定
        shuffleTargetOnly(); 

        // B. 盤面をその新しい正解配置に「一度だけ」同期させる
        // これにより、古い問題の崩れを破棄し、新しい正解からスタートできる
        copyTargetToCurrent();

        // 準備完了フラグを立てる
        window.isTargetScrambled = true;
    } 

    for (let i = 0; i < count; i++) {
        const isV = Math.random() > 0.5;
        const isRev = Math.random() > 0.5;
        const lineIdx = Math.floor(Math.random() * totalSize);
        for (let j = 0; j < subSize; j++) {
            moveLogic(lineIdx, isV, isRev);
        }
    }

    render(); 
    checkComplete(); 
}

/**
 * ターゲットビュー（targetBoard）を更新し、プレビューを再描画する
 */
function shuffleTargetOnly() {
    const totalSize = subSize * gridNum;
    const totalFaces = gridNum * gridNum;

    // 1. フェース単位のインデックス配列を作成
    let faces = Array.from({ length: totalFaces }, (_, i) => i);

    // 2. フェース配列をシャッフル（整合性を担保）
    const shuffleCount = 20; 
    for (let i = 0; i < shuffleCount; i++) {
        const isVertical = Math.random() > 0.5;
        const isReverse = Math.random() > 0.5;
        const line = Math.floor(Math.random() * gridNum);
        
        let idxs = [];
        if (isVertical) {
            for (let g = 0; g < gridNum; g++) idxs.push(g * gridNum + line);
        } else {
            for (let g = 0; g < gridNum; g++) idxs.push(line * gridNum + g);
        }

        if (isReverse) {
            let temp = faces[idxs[0]];
            for (let j = 0; j < gridNum - 1; j++) faces[idxs[j]] = faces[idxs[j + 1]];
            faces[idxs[gridNum - 1]] = temp;
        } else {
            let temp = faces[idxs[gridNum - 1]];
            for (let j = gridNum - 1; j > 0; j--) faces[idxs[j]] = faces[idxs[j - 1]];
            faces[idxs[0]] = temp;
        }
    }

    // 3. 実際のグローバル変数 targetBoard を更新
    targetBoard = Array.from({ length: totalSize }, (_, r) =>
        Array.from({ length: totalSize }, (_, c) => {
            const faceIndex = Math.floor(r / subSize) * gridNum + Math.floor(c / subSize);
            return faces[faceIndex];
        })
    );

    // 4. ターゲットビューを再描画
    renderPreview();
}

/**
 * 判定（解析モード時はスキップ版）
 * 1ブロック1メソッド：既存の checkComplete をこの内容で完全に置き換えてください。
 */
function checkComplete() {
    // --- 1. 解析モード中、またはログ無効時は一切の判定を行わない（追加） ---
    if (window.isReplayMode || !isLogEnabled) {
        return; 
    }

    if (!board || !targetBoard) return; 
    const mm = window.mediaManager;
    const totalSize = subSize * gridNum;

    const currentIds = [];
    const currentValues = [];
    const firstPiece = board[0][0];
    const baseDir = (firstPiece && typeof firstPiece === 'object') ? (firstPiece.direction % 4) : 0;
    let isDirectionUnified = true;

    // --- 2. 現状の抽出 ---
    for (let r = 0; r < totalSize; r++) {
        for (let c = 0; c < totalSize; c++) {
            const p = board[r][c];
            if (!p) return;
            currentIds.push((typeof p === 'object') ? p.tileId : p);
            currentValues.push((typeof p === 'object') ? p.value : p);
            
            if ((typeof p === 'object') && (p.direction % 4) !== baseDir) {
                isDirectionUnified = false;
            }
        }
    }

    let isComplete = false;

    if (mm && mm.mode === 'color') {
        const currentStr = currentValues.join(',');
        const targetStr = targetBoard.flat().map(t => (typeof t === 'object' ? t.value : t)).join(',');
        isComplete = (currentStr === targetStr);
        
    } else {
        if (isDirectionUnified) {
            const currentIdStr = currentIds.join(',');
            const correctIdStr = getTargetIndices(baseDir);
            if (currentIdStr === correctIdStr) {
                isComplete = true;
            }
        }
    }

    // --- 演出・ガード条件 ---
    if (isComplete && !skipCompleteOnce) {
        // 二重チェック：演出直前でも Replay モードなら抜ける
        if (window.isReplayMode) return;

        if (typeof toggleTimer === 'function') toggleTimer(false);
        if (window.rotateTimerId && typeof startRotateCountdown === 'function') {
            startRotateCountdown();
        }
        if (typeof saveSystemLog === 'function') saveSystemLog(true); 
        
        if (typeof updateHistoryList === 'function') {
            setTimeout(() => {
                updateHistoryList(); 
            }, 100);
        }

        if (completeTimerId) clearTimeout(completeTimerId);
        completeTimerId = setTimeout(() => {
            hideCompleteDisplay();
            // Complete後はTimerとカウンターをResetする
            window.elapsedTime = 0;
            moveCount = 0;
            window.initialBoardSnapshot = null;
        }, 5000);

        document.getElementById('status-board')?.classList.add('show');
        document.getElementById('status-preview')?.classList.add('show');
    } else {
        document.getElementById('status-board')?.classList.remove('show');
        document.getElementById('status-preview')?.classList.remove('show');
        if (!isComplete) skipCompleteOnce = false;
    }
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
 * ターゲットリセット
 * モードに応じて「色のグループ」または「純粋な連番」を生成する
 */
function resetColorTargetView() {
    const totalSize = subSize * gridNum;
    const mm = window.mediaManager;
    const isMediaMode = mm && mm.mode !== 'color';

    targetBoard = Array.from({length: totalSize}, (_, r) => 
        Array.from({length: totalSize}, (_, c) => {
            if (isMediaMode) {
                // 画像・動画モード：0, 1, 2... の連番
                return r * totalSize + c;
            } else {
                // カラーモード：既存の色のグループ化ロジック
                return Math.floor(r / subSize) * gridNum + Math.floor(c / subSize);
            }
        })
    );
    hideCompleteDisplay(); // 表示を消す
    renderPreview();
}

/**
 * 回転状態に応じた正解のtileId配列を生成する
 * @param {number} dir - 0:0°, 1:90°, 2:180°, 3:270°
 */
function getTargetIndices(dir) {
    const totalSize = subSize * gridNum;
    const indices = [];
    for (let r = 0; r < totalSize; r++) {
        for (let c = 0; c < totalSize; c++) {
            let srcR, srcC;
            if (dir === 0) { [srcR, srcC] = [r, c]; }
            else if (dir === 1) { [srcR, srcC] = [totalSize - 1 - c, r]; } // 90°
            else if (dir === 2) { [srcR, srcC] = [totalSize - 1 - r, totalSize - 1 - c]; } // 180°
            else { [srcR, srcC] = [c, totalSize - 1 - r]; } // 270°
            indices.push(srcR * totalSize + srcC);
        }
    }
    return indices.join(',');
}

/**
 * 全統計のリセット（Resetボタン）
 * サーチライトのオン/オフに関わらず、画面上の全オーバーレイを強制排除する
 */
function resetStats() {
    // 1. タイマーの停止
    if (timerId) { 
        clearInterval(timerId); 
        timerId = null; 
    }
    window.elapsedTime = 0;
    stopRotateIntervalOnly();

    // 2. サーチライト状態の強制リセット（ボタン消灯とモードオフ）
    const slBtn = document.querySelector('button[onclick="toggleSearchlight()"]');
    if (slBtn) slBtn.classList.remove('active-toggle');
    window.isSearchlightMode = false;

    // 3. サーチライト要素がDOMに残っていれば、オフ時でも物理的に削除して画面を戻す
    const overlay = document.getElementById('searchlight-overlay');
    if (overlay) {
        overlay.remove();
    }
    resetSearchlight();

    // 4. コンプリート表示（status-board / status-preview）を確実に消去
    hideCompleteOverlays();

    // 5. 統計数値の初期化
    moveCount = 0;
    const timerEl = document.getElementById('timer-display');
    const counterEl = document.getElementById('counter-display');
    if (timerEl) timerEl.textContent = "00:00.000";
    if (counterEl) counterEl.textContent = "0000";
    
    // 6. タイマーボタンの光を消す
    const timerBtn = document.querySelector('button[onclick="toggleTimer()"]');
    if (timerBtn) timerBtn.classList.remove('active-toggle');
}

/**
 * 現在の盤面（DOM）の状態を board 配列に同期する
 * ※判定プロシージャが board[r][c] を参照できるようにするため
 */
function syncBoardFromDOM() {
    const totalSize = subSize * gridNum;
    const cells = document.querySelectorAll('.cell');
    
    cells.forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        
        // cell.piece またはそれに準ずるプロパティからオブジェクトを取得
        // 取得できない場合は、現在の cell の状態からオブジェクトを再構成
        if (cell.piece) {
            board[r][c] = cell.piece;
        }
    });
}

//-----------------------------------------------------------------------------------------
function restorationBord() {
    const KEY = 'slp_history';
    const raw = localStorage.getItem(KEY);
    if (!raw) return;

    const history = JSON.parse(raw);
    let updated = 0;

    history.forEach(item => {
        if (!item.is_complete) return;
        if (item.initial_state && item.initial_state.length) return;
        if (!item.target_state || !item.solve_history) return;

        const gNum  = Number(item.grid_size);
        const sSize = Number(item.sub_size);
        const N = gNum * sSize;

        // 1. target → ローカル board
        let board = item.target_state.map((row, r) =>
            row.map((cell, c) => ({
                value: typeof cell === 'object' ? cell.value : cell,
                tileId: typeof cell === 'object'
                    ? (cell.tileId ?? (r * N + c))
                    : (r * N + c),
                direction: typeof cell === 'object' ? (cell.direction ?? 0) : 0
            }))
        );

        // 2. 生ログを逆順に
        const steps = item.solve_history
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .reverse();

        // 3. 完成 → 崩れ（逆順 × 残距離 × 同方向）
        for (const step of steps) {
            const [label, act] = step.split('-');
            const dir = act[0].toUpperCase();
            const dist = parseInt(act.slice(1), 10);
            if (!dist) continue;

            const isV  = !isNaN(label);
            const line = isV
                ? (parseInt(label, 10) - 1)
                : (label.charCodeAt(0) - 97);

            const rev = (gNum - (dist % gNum)) % gNum;
            if (rev === 0) continue;

            const isRev = isV ? (dir === 'U') : (dir === 'L');
            const loops = rev * sSize;

            for (let i = 0; i < loops; i++) {
                moveLocal(board, line, isV, isRev);
            }
        }

        // 4. snapshot 保存
        item.initial_state = board;
        updated++;
    });

    localStorage.setItem(KEY, JSON.stringify(history));
    if (typeof refreshHistoryList === 'function') refreshHistoryList();
}

function moveLocal(board, line, isV, isRev) {
    const N = board.length;

    if (isV) {
        if (isRev) {
            const t = board[0][line];
            for (let r = 0; r < N - 1; r++) board[r][line] = board[r + 1][line];
            board[N - 1][line] = t;
        } else {
            const t = board[N - 1][line];
            for (let r = N - 1; r > 0; r--) board[r][line] = board[r - 1][line];
            board[0][line] = t;
        }
    } else {
        if (isRev) board[line].push(board[line].shift());
        else board[line].unshift(board[line].pop());
    }
}


//-----------------------------------------------------------------------------------------
