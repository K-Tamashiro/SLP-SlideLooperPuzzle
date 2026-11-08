/** game/board.js — responsibility described in docs/architecture.md. */

/**
 * 現在の盤面をターゲットにコピーする
 */
function copyCurrentToTarget() {
    if (!board) return;

    // 現在の盤面（board）の値をターゲット（targetBoard）に完全に同期
    targetBoard = JSON.parse(JSON.stringify(board));

    // 同期した値をプレビューに即座に反映
    renderPreview();

    // 判定を実行
    skipCompleteOnce = true;
    checkComplete();
}

function copyTargetToCurrent() {
    const totalSize = subSize * gridNum;

    // --- 1. initialBoardの整合性チェックと再生成 ---
    // 存在しない、またはサイズが現在の設定(totalSize)と合っていない場合に作り直す
    if (!window.initialBoard || window.initialBoard.length !== totalSize || (window.initialBoard[0] && window.initialBoard[0].length !== totalSize)) {
        console.log("Re-creating initialBoard for new size/mode...");
        window.initialBoard = Array.from({ length: totalSize }, (_, r) =>
            Array.from({ length: totalSize }, (_, c) => ({
                value: Math.floor(r / subSize) * gridNum + Math.floor(c / subSize),
                tileId: r * totalSize + c,
                direction: 0
            }))
        );
    }

    if (!targetBoard) return;

    // --- 2. 盤面の同期実行 ---
    const newBoard = Array.from({ length: totalSize }, () => new Array(totalSize));

    for (let r = 0; r < totalSize; r++) {
        for (let c = 0; c < totalSize; c++) {
            const faceVal = targetBoard[r][c];

            const r_orig_base = Math.floor(faceVal / gridNum) * subSize;
            const c_orig_base = (faceVal % gridNum) * subSize;

            const final_r = r_orig_base + (r % subSize);
            const final_c = c_orig_base + (c % subSize);

            // ここで undefined チェックを入れることで TypeError を物理的に防ぐ
            const srcRow = window.initialBoard[final_r];
            const src = srcRow ? srcRow[final_c] : null;

            if (src) {
                newBoard[r][c] = {
                    value: src.value,
                    tileId: src.tileId,
                    direction: src.direction || 0
                };
            } else {
                // 万が一参照に失敗した時のフォールバック（真っ黒回避）
                newBoard[r][c] = {
                    value: Math.floor(r / subSize) * gridNum + Math.floor(c / subSize),
                    tileId: r * totalSize + c,
                    direction: 0
                };
            }
        }
    }

    board = newBoard;
    render();
}

function handleModeChange(mode) {
    // 現在タイマーが動いている、または1手以上動かしている場合は保存して締める
    if (timerId || moveCount > 0) {
        saveSystemLog(false); // 未完了(isComplete=false)として保存
    }

    switch (mode) {
        case 'easy': changeMode(2, 2); break;
        case 'mid': changeMode(2, 3); break;
        case 'difficult': changeMode(3, 2); break;
        case 'hard': changeMode(3, 3); break;
        case 'advance': changeMode(2, 4); break;
    }
}

function changeMode(sSize, gNum) {
    hideCompleteDisplay(); // 表示を消す
    subSize = sSize;
    gridNum = gNum;
    initBoard(true);
}

// true=debug false=Release
/**
 * 初期化
 */
function initBoard(resetTarget = false) {
    if (timerId) {
        toggleTimer(false);
    } else {
        setInterfaceLock(false);
    }

    // 盤面の回転状態を 0 度にリセット
    window.boardRotationDegree = 0;
    resetLogOnly();

    calculateLayout();
    const totalSize = subSize * gridNum;
    if (!window.rotationManager && typeof RotationManager === 'function') {
        window.rotationManager = new RotationManager('COLOR');
    }
    // 1. マスターデータ(initialBoard)の生成
    // カラー・画像どちらのモードでも、1つの「枠(Face)」の中は同じ value に統一する
    window.initialBoard = Array.from({ length: totalSize }, (_, r) =>
        Array.from({ length: totalSize }, (_, c) => {
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

    resetStats();
    clearSolveLog();
    if (window.mediaManager.mode === "color") {
        shuffleTargetOnly();
    }
    window.isTargetScrambled = false;

    render();
    renderPreview();
    renderCoordinates();
    window.initialAnalyzeBoard = null;
}

/**
 * 移動ロジック
 */
function moveLogic(idx, isV, isRev) {
    moveLocal(board, idx, isV, isRev);
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
        if (window.mediaManager.mode === "color") {
            // shuffleTargetOnly(); 
            copyTargetToCurrent();
        }

        // B. 盤面をその新しい正解配置に「一度だけ」同期させる
        // これにより、古い問題の崩れを破棄し、新しい正解からスタートできる

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
    // Scramble後を開始状態として保存
    window.initialAnalyzeBoard = JSON.parse(JSON.stringify(board));
    // ゲームセッションを空にする
    window.currentSessionId = null
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
        if (rotateTimerId && typeof startRotateCountdown === 'function') {
            startRotateCountdown();
        }
        if (typeof saveSystemLog === 'function') saveSystemLog(true);

        if (completeTimerId) clearTimeout(completeTimerId);
        completeTimerId = setTimeout(() => {
            hideCompleteDisplay();
            // Complete後はTimerとカウンターをResetする
            window.elapsedTime = 0;
            moveCount = 0;
            window.initialBoardSnapshot = null;
            window.currentSessionId = null;
            window.boardRotationDegree = 0;
            resetLogOnly();
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
 * ターゲットリセット
 * モードに応じて「色のグループ」または「純粋な連番」を生成する
 */
function resetColorTargetView() {
    const totalSize = subSize * gridNum;
    const mm = window.mediaManager;
    const isMediaMode = mm && mm.mode !== 'color';

    targetBoard = Array.from({ length: totalSize }, (_, r) =>
        Array.from({ length: totalSize }, (_, c) => {
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
 * 盤面移動の論理計算（サルベージ用：回転考慮済みの標準座標で実行）
 */
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

