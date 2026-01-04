/**
 * タイマー制御
 */
function toggleTimer(forceState) {
    const display = document.getElementById('timer-display');
    const btn = document.querySelector('button[onclick="toggleTimer()"]');
    const shouldStart = (forceState !== undefined) ? forceState : !timerId;

    if (!isLogEnabled && shouldStart) return;

    if (!shouldStart) {
        if (timerId) { clearInterval(timerId); timerId = null; }
        if (btn) btn.classList.remove('active-toggle');
        stopRotateIntervalOnly();
        setInterfaceLock(false);
    } else {
        if (timerId) return;
        toggleMenu(false);
        startTime = performance.now();
        timerId = setInterval(() => {
            const diff = performance.now() - startTime;
            const m = Math.floor(diff / 60000).toString().padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            const ms = Math.floor(diff % 1000).toString().padStart(3, '0');
            if (display) display.textContent = `${m}:${s}.${ms}`;
        }, 10);
        if (btn) btn.classList.add('active-toggle');
        setInterfaceLock(true);

        const rotateBtn = document.querySelector('button[onclick="startRotateCountdown()"]');
        if (rotateBtn && rotateBtn.classList.contains('active-toggle-red')) {
            if (!window.rotateTimerId) executeRotateLoop(); 
        }
    }
}

/**
 * ログ・履歴管理
 */
function recordMove(lineIdx, dir, steps, mode) {
    if (!timerId) toggleTimer(true);
    skipCompleteOnce = false;
    incrementCounter();
    const isV = (dir === 'U' || dir === 'D');
    let label = isV ? (lineIdx + 1) : String.fromCharCode(65 + lineIdx).toLowerCase();
    const logEntry = `${label}-${dir}${steps}`;
    solveHistory.push(logEntry);
    const logInput = document.getElementById('solve-log');
    if (logInput) logInput.value = solveHistory.join(',');
}

function incrementCounter() {
    moveCount++;
    const display = document.getElementById('counter-display');
    if (display) display.textContent = moveCount.toString().padStart(3, '0');
}

/**
 * 現在のゲーム状態をシステムログとして保存する
 * @param {boolean} isComplete - コンプリートしたかどうかのフラグ
 */
function saveSystemLog(isComplete = false) {
    const scLog = document.getElementById('scramble-input').value;
    const slLog = document.getElementById('solve-log').value;
    const time = document.getElementById('timer-display').innerText;
    const moves = document.getElementById('counter-display').innerText;

    // 現在のギミック状態
    const gimmicks = {
        rotate: !!document.querySelector('button[onclick="startRotateCountdown()"].active-toggle-red'),
        flash: window.isFlashMode,
        searchlight: window.isSearchlightMode
    };

    const logEntry = {
        timestamp: new Date().toLocaleString(),
        grid_size: gridNum,
        sub_size: subSize,
        media_mode: window.mediaManager ? window.mediaManager.mode : 'color', // 追加
        scramble_log: scLog,
        solve_history: slLog,
        solve_time: time,
        step_count: moves,
        gimmicks: gimmicks,
        target_state: targetBoard, // ターゲット配色そのものを保存
        is_complete: isComplete
    };

    // localStorageから取得 (最大400件の全体枠、表示時に各モード100件でフィルタ)
    let history = JSON.parse(localStorage.getItem('slp_history') || '[]');
    
    // 同一セッション（同じタイムスタンプや未完了の更新）の処理は今はシンプルに追加
    history.push(logEntry);

    // 全体で400件を超えないように制御（古いものから削除）
    if (history.length > 400) history.shift();

    localStorage.setItem('slp_history', JSON.stringify(history));

    // リストの表示更新（Behavior）
    if (typeof refreshHistoryList === 'function') refreshHistoryList();

	refreshHistoryList();
}

/**
 * 履歴リストの表示更新（全モード混在・アイコン出し分け版）
 * 1ブロック1メソッド：既存の refreshHistoryList をこの内容で完全に置き換えてください。
 */
function refreshHistoryList() {
    const container = document.getElementById('history-list');
    if (!container) return;
    container.innerHTML = ""; 

    const rawHistory = localStorage.getItem('slp_history');
    if (!rawHistory) {
        container.innerHTML = '<div class="history-empty">No Storage Data.</div>';
        return;
    }

    const history = JSON.parse(rawHistory || '[]');
    
    // フィルタリング：盤面サイズの一致のみを確認
    const filtered = history.filter(h => {
        return Number(h.grid_size) === gridNum && Number(h.sub_size) === subSize;
    }).reverse();

    if (filtered.length === 0) {
        container.innerHTML = '<div class="history-empty">No history for this mode.</div>';
        return;
    }

    // 描画ループ
    container.innerHTML = filtered.map((data, index) => {
        const entryId = data.timestamp; 
        
        // アイコン決定
        let iconContent = "";
        const logMode = data.media_mode || 'color';

        if (logMode === 'image') {
            iconContent = `<div class="history-icon-box" title="Image Mode">🖼️</div>`;
        } else if (logMode === 'video') {
            iconContent = `<div class="history-icon-box" title="Video Mode">▶️</div>`;
        } else {
            iconContent = createMiniPreview(data.target_state);
        }

        // HTML生成：JSオブジェクトの直接埋め込みを避け、data属性を使用する
        return `
            <div class="history-item" 
                data-index="${index}" 
                role="listitem" 
                tabindex="0" 
                aria-label="History entry for ${data.timestamp}">
                <div class="mini-target-icon" onclick="loadHistoryByIndex(${index})">
                    ${iconContent}
                </div>
                <div class="history-status">${data.is_complete ? "✅" : "⚠️"}</div>
                <div class="history-info" onclick="loadHistoryByIndex(${index})">
                    <div class="history-date">${data.timestamp}</div>
                    <div class="history-stats">
                        <span class="history-time">${data.solve_time}</span>
                        <span class="history-steps">${data.step_count} steps</span>
                    </div>
                </div>
                <button class="history-delete-btn" onclick="deleteHistoryEntry('${entryId}')">🗑️</button>
            </div>`;
    }).join('');

    // ※JS側でデータを引きやすくするため、filteredを一時的にグローバルへ保持
    window.currentFilteredHistory = filtered;
}

/**
 * 解析モード開始：左(0)=崩れ状態 から 右(Max)=完成状態 へ向かうタイムライン
 */
function startAnalyzeMode() {
    const solveLog = document.getElementById('solve-log').value;
    if (!solveLog) return;
    
    setLogState(false);
 
    // --- 1. 手順の準備 ---
    // window.replaySteps は「完成から崩すためのミラー手順」
    window.replaySteps = getMirrorStepsFromLog(solveLog);
    const totalSteps = window.replaySteps.length;
    window.isReplayMode = true;

    // --- 2. 盤面の初期化（ターゲット/完成状態を起点にする） ---
    const totalSize = subSize * gridNum;
    board = Array.from({ length: totalSize }, (_, r) => 
        Array.from({ length: totalSize }, (_, c) => {
            const absoluteIndex = r * totalSize + c;
            const targetPiece = targetBoard[r][c];
            const targetValue = (typeof targetPiece === 'object') ? targetPiece.value : targetPiece;
            const targetDir = (typeof targetPiece === 'object') ? (targetPiece.direction || 0) : 0;
            return {
                tileId: absoluteIndex,
                value: targetValue,
                direction: targetDir
            };
        })
    );

    // --- 3. 物理的に「崩れきった状態」を 0手目(左端) とする準備 ---
    // 一旦ターゲットから全手順を適用して、盤面を「崩れた状態」へワープさせる
    for (let i = 0; i < totalSteps; i++) {
        executeSingleMove(window.replaySteps[i], false, true);
    }
    // この時点の盤面＝左端(0)。ここから「解く」ことで右(Max)へ向かう
    window.currentReplayIdx = 0; 

    // --- 4. スライダーの挙動定義 ---
    const slider = document.getElementById('analyze-slider');
    if (slider) {
        slider.max = totalSteps;
        slider.value = 0; // 左端スタート
        slider.oninput = function(e) {
            const targetPos = parseInt(e.target.value);

            // 現在地から目標地点(targetPos)まで盤面を動かす
            while (window.currentReplayIdx < targetPos) {
                // 右へ進む ＝ 完成に近づく ＝ ミラー手順を「逆再生(isReverseAction: true)」
                // 適用する手順の添字は (totalSteps - 1 - 現在地)
                const stepIdx = totalSteps - 1 - window.currentReplayIdx;
                executeSingleMove(window.replaySteps[stepIdx], true, true);
                window.currentReplayIdx++;
            }
            while (window.currentReplayIdx > targetPos) {
                // 左へ戻る ＝ 崩れに戻る ＝ ミラー手順を「正再生(isReverseAction: false)」
                window.currentReplayIdx--;
                const stepIdx = totalSteps - 1 - window.currentReplayIdx;
                executeSingleMove(window.replaySteps[stepIdx], false, true);
            }
            render();
            updateReplayDisplay(); 
        };
    }

    toggleLogPanel();
    showMediaControls(true);
    updateReplayDisplay(); 
    render(); 
}

/**
 * 1手進める（右：完成に向かう）
 */
function replayStepNext() {
    const totalSteps = window.replaySteps.length;
    if (window.currentReplayIdx < totalSteps) {
        const stepIdx = totalSteps - 1 - window.currentReplayIdx;
        executeSingleMove(window.replaySteps[stepIdx], true, false);
        window.currentReplayIdx++;
        updateReplayDisplay();
        render();
    }
}

/**
 * 1手戻る（左：崩れに戻る）
 */
function replayStepBack() {
    if (window.currentReplayIdx > 0) {
        window.currentReplayIdx--;
        const totalSteps = window.replaySteps.length;
        const stepIdx = totalSteps - 1 - window.currentReplayIdx;
        executeSingleMove(window.replaySteps[stepIdx], false, false);
        updateReplayDisplay();
        render();
    }
}

/**
 * 表示更新（左：0=崩れ ～ 右：Max=完成）
 */
function updateReplayDisplay() {
    const idxEl = document.getElementById('replay-index');
    const totalEl = document.getElementById('replay-total');
    const moveEl = document.getElementById('current-move-display');
    const slider = document.getElementById('analyze-slider');
    const boardCounter = document.getElementById('move-count') || document.getElementById('counter-display');

    if (!window.replaySteps) return;
    const totalSteps = window.replaySteps.length;
    const cur = window.currentReplayIdx;

    if (idxEl) idxEl.innerText = cur;
    if (totalEl) totalEl.innerText = totalSteps;
    
    if (slider) {
        slider.max = totalSteps;
        slider.value = cur;
    }
    
    if (boardCounter) {
        boardCounter.innerText = cur.toString().padStart(4, '0');
    }

    if (moveEl) {
        // 1. ログを配列としてキャッシュする (window.originalLogSteps を活用)
        // 解析開始時や履歴クリック時にセットされている前提。
        // 万が一空の場合だけ、その場で一度だけ作る。
        if (!window.originalLogSteps || window.originalLogSteps.length === 0) {
            const logVal = document.getElementById('solve-log').value;
            window.originalLogSteps = logVal ? logVal.split(',').map(s => s.trim()) : [];
        }

        // 2. 表示するインデックスの決定 (0手目は1手目を予告、それ以外は現在の手)
        const displayIdx = (cur <= 0) ? 0 : cur - 1;
        const currentLogMove = window.originalLogSteps[displayIdx] || "---";

        // 3. 表示
        if (cur >= totalSteps) {
            moveEl.innerText = `COMPLETE[${currentLogMove}]`;
        } else if (cur <= 0) {
            moveEl.innerText = `Start[${currentLogMove}]`;
        } else {
            moveEl.innerText = `[${currentLogMove}]`;
        }
    }
    

    // ボタンの制御
    const nextBtn = document.querySelector('button[onclick="replayStepNext()"]');
    const backBtn = document.querySelector('button[onclick="replayStepBack()"]');
    if (nextBtn) nextBtn.disabled = (cur >= totalSteps);
    if (backBtn) backBtn.disabled = (cur <= 0);

    // 演出リセット
    if (typeof hideCompleteDisplay === 'function') hideCompleteDisplay();
    const statusBoard = document.getElementById('status-board');
    if (statusBoard) statusBoard.classList.remove('show');
}

/**
 * 記録されたログ文字列からミラー（逆手順）配列を生成する
 */
function getMirrorStepsFromLog(logStr) {
    if (!logStr) return [];

    // 1. 文字列を配列化して順序を反転
    const steps = logStr.split(',').filter(s => s.trim() !== "");
    const reversed = steps.reverse();

    // 2. 移動数値を (gridNum - 移動量) に置き換え
    const mirror = reversed.map(step => {
        const [label, action] = step.split('-');
        const dir = action[0];
        const moveVal = parseInt(action.substring(1));
        
        // 盤面サイズ(gridNum)から現在の移動量を引く
        const mirrorVal = Number(gridNum) - moveVal;
        
        return `${label}-${dir}${mirrorVal}`;
    });

    // すでに配列を返します
    return mirror;
}

/**
 * CSV / Backup
 */
function saveCSV(type) {
    const inputId = (type === 'scramble') ? 'scramble-input' : 'solve-log';
    const inputElement = document.getElementById(inputId);
    if (!inputElement || !inputElement.value.trim()) return;
    const blob = new Blob([inputElement.value.trim()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_pattern_${new Date().getTime()}.csv`;
    a.click();
}

function saveBackupCSV() {
    const historyData = localStorage.getItem('slp_history');
    if (!historyData || historyData === '[]') return;
    const blob = new Blob([historyData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slp_history_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
}

/**
 * MediaManager クラス
 */
class MediaManager {
    constructor() {
        this.mode = 'color';
        this.mediaElement = null;
        this.mediaSrc = null;
        this.animationId = null;
    }

    /**
     * 画像・動画の統合セットアップ
     */
    async setupMedia(file) {
        // インスタンスがなければ生成
        if (!window.rotationManager) {
            window.rotationManager = new RotationManager(file.type.startsWith('video/') ? 'video' : 'image');
        }
        // 1. 新規ロード前に、現在の描画ループとメモリを完全に「更地」にする
        this.stopDrawingLoop();
        document.querySelectorAll('.ghost-strip').forEach(el => el.remove());
        
        if (this.mediaElement instanceof HTMLVideoElement) {
            this.mediaElement.pause();
            this.mediaElement.src = ""; // 物理的に切断
            this.mediaElement.load();
        }

        const oldUrl = this.mediaSrc;
        const newUrl = URL.createObjectURL(file);
        this.mediaSrc = newUrl;

        try {
            if (file.type.startsWith('image/')) {
                this.mode = 'image';
                const img = new Image();
                img.src = newUrl;
                await img.decode();
                this.mediaElement = img;
                if (typeof updateV2StatusUI === 'function') updateV2StatusUI('image');
            } 
            else if (file.type.startsWith('video/')) {
                this.mode = 'video';
                const v = document.createElement('video');
                v.src = newUrl;
                v.muted = true;
                v.loop = true;
                v.playsInline = true;
                this.mediaElement = v;

                await new Promise((resolve, reject) => {
                    v.onloadedmetadata = () => v.play().then(resolve).catch(reject);
                    v.onerror = reject;
                });
                if (typeof updateV2StatusUI === 'function') updateV2StatusUI('video');
                this.startDrawingLoop();
            }
            // --- メディア選択時に回転ギミックを強制OFF & ロック ---
            if (window.rotateTimerId) {
                stopRotateIntervalOnly(); // 実行中のタイマー停止
            }

            // --- メディア選択時にフラッシュを強制ONにする ---
            window.isFlashMode = true;
            const flashBtn = document.querySelector('button[onclick="toggleFlash()"]');
            if (flashBtn) flashBtn.classList.add('active-toggle');
            // --------------------------------------------------

            // 2. 盤面のタイルを物理的に一度リセットしてから再描画
            const board = document.getElementById('board');
            if (board) board.innerHTML = ''; 
            
            setInterfaceLock(!!timerId);

            renderPreview();
            render();

        } catch (e) {
            console.error("Media setup failed:", e);
            window.resetToColorMode();
        } finally {
            // 3. 古いURLの破棄を、DOMが完全に書き換わるまで十分に遅らせる
            if (oldUrl && oldUrl !== newUrl) {
                setTimeout(() => {
                    try { URL.revokeObjectURL(oldUrl); } catch(err) {}
                }, 1000);
            }
        }
    }

    /**
     * 動画描画ループ
     */
    startDrawingLoop() {
        this.stopDrawingLoop();
        const tick = () => {
            if (this.mode === 'video') {
                this.syncVideoToCanvases();
                this.animationId = requestAnimationFrame(tick);
            }
        };
        this.animationId = requestAnimationFrame(tick);
    }

    stopDrawingLoop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * 動画フレームの各Canvasへの転写
     */
    syncVideoToCanvases() {
        if (this.mode !== 'video' || !this.mediaElement) return;
        const v = this.mediaElement;
        if (v.readyState < 2) return;

        const canvases = document.querySelectorAll('.video-tile-canvas');
        const totalCells = subSize * gridNum;
        const minSide = Math.min(v.videoWidth, v.videoHeight);
        
        // sx0, sy0 を定義
        const sx0 = (v.videoWidth - minSide) / 2;
        const sy0 = (v.videoHeight - minSide) / 2;
        const step = minSide / totalCells;

        canvases.forEach(canvas => {
            const ctx = canvas.getContext('2d', { alpha: false });
            const cellEl = canvas.closest('.cell');
            const r = parseInt(cellEl.dataset.row);
            const c = parseInt(cellEl.dataset.col);
            
            const piece = board[r][c];
            const tId = piece.tileId; // 現在この位置にいるパーツの固有ID
            
            const totalCells = subSize * gridNum;
            const origAbsR = Math.floor(tId / totalCells);
            const origAbsC = tId % totalCells;

            const v = this.mediaElement;
            const minSide = Math.min(v.videoWidth, v.videoHeight);
            const sx0 = (v.videoWidth - minSide) / 2;
            const sy0 = (v.videoHeight - minSide) / 2;
            const step = minSide / totalCells;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            window.rotationManager.render(
                ctx, piece, v, 
                0, 0, canvas.width, canvas.height,
                sx0 + (origAbsC * step), sy0 + (origAbsR * step), step, step
            );
        });
    }

    // MediaManager クラス内に実装
    setPlaybackRate(rate) {
        if (this.mediaElement instanceof HTMLVideoElement) {
            this.mediaElement.playbackRate = parseFloat(rate);
        }
    }

    /**
     * 画像モード用CSS適用
     */
    applyMediaStyle(cell, value) {
            if (this.mode !== 'image' || !this.mediaElement || value === undefined) return;
            
            const totalCells = subSize * gridNum;
            const correctR = Math.floor(value / totalCells);
            const correctC = value % totalCells;
            
            const w = this.mediaElement.naturalWidth;
            const h = this.mediaElement.naturalHeight;
            if (!w || !h) return;

            const totalBoardPx = cellSizePixel * totalCells;
            const mediaAspect = w / h;
            let drawW, drawH;

            if (mediaAspect > 1) {
                drawH = totalBoardPx; drawW = totalBoardPx * mediaAspect;
            } else {
                drawW = totalBoardPx; drawH = totalBoardPx / mediaAspect;
            }

            const offX = (drawW - totalBoardPx) / 2;
            const offY = (drawH - totalBoardPx) / 2;
            const posX = -(correctC * cellSizePixel + offX);
            const posY = -(correctR * cellSizePixel + offY);

            // インラインスタイルで強制適用
            cell.style.setProperty('background-image', `url(${this.mediaSrc})`, 'important');
            cell.style.setProperty('background-size', `${drawW}px ${drawH}px`, 'important');
            cell.style.setProperty('background-position', `${posX}px ${posY}px`, 'important');
            cell.style.setProperty('background-repeat', 'no-repeat', 'important');
        }
        /**
         * 音量の変更 (0.0 ～ 1.0)
         */
        setVolume(value) {
            if (this.mediaElement instanceof HTMLVideoElement) {
                this.mediaElement.volume = parseFloat(value);
                // 音量が0より大きければミュートを解除、0ならミュートにする
                this.mediaElement.muted = (this.mediaElement.volume === 0);
            }
        }
    }

// グローバル公開
window.handleMediaUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !window.mediaManager) return;

    // 1. セットアップを実行
    await window.mediaManager.setupMedia(file);
    
    // 2. ★最重要：inputの値を空にする（これで同じファイルを2回目も選べるようになる）
    e.target.value = '';

    // 3. UIパネルの制御（開いていれば閉じる）
    const vPanel = document.getElementById('v2-video-uploader');
    const iPanel = document.getElementById('v2-media-uploader');
    if (vPanel && vPanel.style.display !== 'none') toggleVideoPanel();
    if (iPanel && iPanel.style.display !== 'none') toggleV2Panel();
};

window.handleVideoUpload = async (e) => {
    if (e.target.files[0] && window.mediaManager) await window.mediaManager.setupMedia(e.target.files[0]);
    if (typeof toggleVideoPanel === 'function') toggleVideoPanel();
};

/**
 * 動画ファイル選択時のハンドラ
 * HTMLのonchangeから呼び出せるようにwindowに紐付ける
 */
window.handleVideoUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // パネルを閉じる（ui-render.jsにある関数）
    if (typeof toggleVideoPanel === 'function') {
        toggleVideoPanel();
    }

    if (window.mediaManager) {
        await window.mediaManager.setupMedia(file);
    }
};

/**
 * handleMediaUpload 内の表示更新
 */
function updateV2StatusUI(mode) {
    const modeSpan = document.getElementById('current-v2-mode');
    if (modeSpan) {
        modeSpan.innerText = mode.toUpperCase();
        modeSpan.style.color = (mode === 'color') ? '#888' : '#00ffcc';
    }
}
/**
 * メディア（画像/動画）がロードされた際のコールバック
 */
function onMediaLoaded(src) {
    // 1. メディアマネージャーにソースをセット
    if (window.mediaManager) {
        window.mediaManager.mediaSrc = src;
    }

    // 2. ターゲットビューと正解判定データをリセット
    // 第1引数を true にすることで targetBoard を現在の構成で再生成する
    initBoard(true);

    // 3. プレビューを再描画
    renderPreview();
    
    // 4. (任意) 進行中の統計やログもクリア
    clearSolveLog();
    resetStats();
    resetColorTargetView();
}

function resetToColorMode() {
    window.mediaManager.mode = 'color';
    if (window.mediaManager.mediaSrc) {
        URL.revokeObjectURL(window.mediaManager.mediaSrc);
        window.mediaManager.mediaSrc = null;
    }
    
    // 全タイルのインラインスタイルを「属性ごと」削除して初期状態に戻す
    document.querySelectorAll('.cell').forEach(cell => {
        cell.removeAttribute('style'); 
        // 必要な基本サイズだけ再セット（renderが上書きするが念のため）
        cell.style.width = cell.style.height = `${cellSizePixel}px`;
    });

    const modeSpan = document.getElementById('current-v2-mode');
    if (modeSpan) {
        modeSpan.innerText = 'COLOR';
        modeSpan.style.color = '#888';
    }
    // 画像が選択・ロードされたらパネルを閉じる
    if (document.getElementById('v2-media-uploader').style.display !== 'none') {
        toggleV2Panel();
    }
    renderPreview();
    render();
}

function toggleLogPanel() {
    const overlay = document.getElementById('log-overlay');
    const mediaControls = document.getElementById('media-controls');
    const statusBoard = document.getElementById('status-board');
    const logModeSpan = document.getElementById('mode-text');
    const mainSelect = document.getElementById('mode-select');

    if (!overlay) return;

    const isVisible = overlay.style.display === 'block';
    if (!isVisible) {
        // --- パネルを開く時の処理 ---
        if (statusBoard) statusBoard.classList.remove('show');
        if (logModeSpan && mainSelect) {
            const selectedText = mainSelect.options[mainSelect.selectedIndex].text;
            logModeSpan.innerText = selectedText;
        }
        if (typeof refreshHistoryList === 'function') refreshHistoryList();
        overlay.style.display = 'block';
        if (window.isReplayMode && mediaControls) {
            mediaControls.style.visibility = 'hidden';
            mediaControls.style.opacity = '0';
        }
    } else {
        // --- パネルを閉じる時の処理 ---
        overlay.style.display = 'none';

        // 解析中（ReplayMode）でない場合は、表示されていた履歴の時間を消す
        if (!window.isReplayMode) {
            const timerDisplay = document.getElementById('timer-display');
            if (timerDisplay) timerDisplay.innerText = "00:00.000";
        }

        if (window.isReplayMode && mediaControls) {
            mediaControls.style.visibility = 'visible';
            mediaControls.style.opacity = '1';
            const isComplete = (window.currentReplayIdx === window.replaySteps.length);
            if (isComplete && statusBoard) {
                statusBoard.classList.add('show');
            }
        }
    }
    toggleMenu(false);
}

function loadFilteredHistory(data) {
    if (!data) return;

    // --- デグレ防止：数値配列をオブジェクト構造へ正規化してから代入 ---
    const rawTarget = JSON.parse(JSON.stringify(data.target_state));
    targetBoard = rawTarget.map(row => 
        row.map(cell => {
            // すでにオブジェクトならそのまま
            if (typeof cell === 'object' && cell !== null) return cell;
            // 数値なら現在の仕様に合わせたオブジェクトを生成
            return { tileId: cell, value: cell, direction: 0 };
        })
    );

    renderPreview();

    const scrambleInput = document.getElementById('scramble-input');
    const solveLog = document.getElementById('solve-log');
    if (scrambleInput) scrambleInput.value = data.scramble_log || "";
    if (solveLog) solveLog.value = data.solve_history || "";

    window.currentLogTime = data.solve_time;

    updateGimmickHistoryIcons(data.gimmicks);
    
    const oldPreview = document.getElementById('log-large-preview');
    if (oldPreview) oldPreview.remove();

}

/**
 * ログに記録されたギミック状態をアイコンの不透明度で表現
 */
function updateGimmickHistoryIcons(gimmicks) {
    if (!gimmicks) return;
    const gRotate = document.getElementById('g-rotate');
    const gSpotlight = document.getElementById('g-spotlight');
    const gFlash = document.getElementById('g-flash');

    if (gRotate) gRotate.style.opacity = gimmicks.rotate ? "1" : "0.2";
    if (gSpotlight) gSpotlight.style.opacity = gimmicks.searchlight ? "1" : "0.2";
    if (gFlash) gFlash.style.opacity = gimmicks.flash ? "1" : "0.2";
}

/**
 * media-system.js
 * ブロック単位の移動（* subSize）を維持
 */
function executeSingleMove(moveStr, isReverseAction, isSilent = false) {
    const cmd = moveStr.trim().toLowerCase();
    if (!cmd.includes('-')) return;

    const [label, action] = cmd.split('-');
    // ラベルが数字なら縦列（1,2,3...）、アルファベットなら横行（a,b,c...）
    let lineIdx = isNaN(label) ? label.charCodeAt(0) - 97 : parseInt(label) - 1;
    let isV = !isNaN(label);
    let dir = action[0].toUpperCase();

    // ブロック単位の移動距離
    let steps = parseInt(action.substring(1)) * subSize;

    // --- 方向判定の修正 ---
    let isRev;
    if (isV) {
        // 縦移動：D(Down)は正方向(false)、U(Up)は逆方向(true)
        isRev = (dir === 'U'); 
    } else {
        // 横移動：R(Right)は正方向(false)、L(Left)は逆方向(true)
        isRev = (dir === 'L');
    }

    // ログ戻し（undo）などの場合は、判定した方向をさらに反転させる
    if (isReverseAction) {
        isRev = !isRev;
    }

    // 物理移動の実行
    for (let i = 0; i < steps; i++) {
        moveLogic(lineIdx, isV, isRev);
    }

    if (!isSilent) {
        render();
    }
}

/**
 * メディアコントロールの表示制御（Behavior）
 */
function showMediaControls(show) {
    const controls = document.getElementById('media-controls');
    const replayBtn = document.getElementById('replay-trigger');
    const titleContainer = document.querySelector('.title-container');

    if (show) {
        controls.style.display = 'flex';
        controls.classList.add('active');
        if (replayBtn) replayBtn.classList.add('active-toggle');
        if (titleContainer) titleContainer.style.opacity = "0.1"; // タイトルを薄くして視認性確保
    } else {
        controls.style.display = 'none';
        controls.classList.remove('active');
        if (replayBtn) replayBtn.classList.remove('active-toggle');
        if (titleContainer) titleContainer.style.opacity = "1";
    }
}

/**
 * 4. Copy to Scramble: LiveログをInputボックスへコピー
 */
function copySolveToScramble() {
    const solveLog = document.getElementById('solve-log');
    const scrambleInput = document.getElementById('scramble-input');
    if (solveLog && scrambleInput) {
        scrambleInput.value = solveLog.value.replace(/[^A-Za-z0-9,\-]/g, "");
        if (typeof addLog === 'function') addLog("Solve log copied to Scramble Box");
    }
}
/**
 * 3. Reproduce Scramble (Updated)
 */
function reproduceScramble() {
    const input = document.getElementById('scramble-input').value;
    if (!input) return;

    // 1. 判定を一時的にスキップするフラグを立てる
    skipCompleteOnce = true;

    // 2. 盤面初期化
    initBoard();

    const steps = input.split(',').filter(s => s.trim() !== "");
    
    try {
        steps.forEach(move => {
            executeSingleMove(move, false);
        });

        render();
        
        // 3. 正常終了時はダイアログを閉じ、メッセージは出さない
        toggleLogPanel();
        
        if (typeof addLog === 'function') {
            addLog("Scramble pattern applied.");
        }
        
    } catch (err) {
        // エラー時のみ通知
        alert("Error: Invalid scramble code format.");
        console.error(err);
    } finally {
        // フラグを元に戻す
        skipCompleteOnce = false;
    }
}

/**
 * 1. Scramble Import: Trigger file selection
 */
function triggerImport() {
    const input = document.getElementById('import-input');
    if (input) {
        input.value = ''; // Reset to allow re-selection of the same file
        input.click();
    }
}

/**
 * 5. Delete specific history entry
 * @param {string} timestamp - Unique identifier for the log
 */
function deleteHistoryEntry(timestamp) {
    if (!confirm("Are you sure you want to delete this log?")) return;

    let history = JSON.parse(localStorage.getItem('slp_history') || '[]');
    
    // 指定されたタイムスタンプ以外のものを残す
    const newHistory = history.filter(item => item.timestamp !== timestamp);
    
    localStorage.setItem('slp_history', JSON.stringify(newHistory));
    
    // リストを再描画
    refreshHistoryList();
    
    if (typeof addLog === 'function') addLog("History entry deleted.");
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

/**
 * 動画モード用パネルの開閉
 */
function toggleVideoPanel() {
    const vPanel = document.getElementById('v2-video-uploader');
    const iPanel = document.getElementById('v2-media-uploader'); // 画像パネル
    const vBtn = document.getElementById('v2-video-toggle');

    if (!vPanel) return;

    // 画像パネルが開いていれば閉じる
    if (iPanel && iPanel.style.display !== 'none') {
        toggleV2Panel(); 
    }

    const isHidden = (vPanel.style.display === 'none' || vPanel.style.display === '');

    if (isHidden) {
        vPanel.style.display = 'block';
        vBtn.classList.add('active');
    } else {
        vPanel.style.display = 'none';
        vBtn.classList.remove('active');
    }
}

window.mediaManager = new MediaManager();
