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

function refreshHistoryList() {
    const container = document.getElementById('history-list');
    if (!container) return;
    container.innerHTML = ""; 
    const history = JSON.parse(localStorage.getItem('slp_history') || '[]');
    const filtered = history.filter(h => Number(h.grid_size) === gridNum && Number(h.sub_size) === subSize).reverse();
    if (filtered.length === 0) {
        container.innerHTML = '<div style="color:#666; padding:20px; text-align:center;">No history for this mode.</div>';
        return;
    }
    container.innerHTML = filtered.map((data) => {
        const entryId = data.timestamp; 
        const dataStr = JSON.stringify(data).replace(/'/g, "\\'");
        return `
            <div class="history-item" style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid #333; cursor:pointer;">
                <div class="mini-target-icon" onclick='loadFilteredHistory(${dataStr})' style="flex-shrink:0;">
                    ${createMiniPreview(data.target_state)}
                </div>
                <div style="font-size:14px; flex-shrink:0;">${data.is_complete ? "✅" : "⚠️"}</div>
                <div style="flex-grow:1; font-size:12px;" onclick='loadFilteredHistory(${dataStr})'>
                    <div style="color:#aaa;">${data.timestamp}</div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#00ffcc; font-weight:bold;">${data.solve_time}</span>
                        <span style="color:#888;">${data.step_count} steps</span>
                    </div>
                </div>
                <button onclick="deleteHistoryEntry('${entryId}')" style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size:16px;">🗑️</button>
            </div>`;
    }).join('');
}

/**
 * 再生（解析）モード
 */
function startAnalyzeMode() {
    const solveLog = document.getElementById('solve-log').value;
    if (!solveLog) return;
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay && window.currentLogTime) timerDisplay.textContent = window.currentLogTime;
    window.replaySteps = solveLog.split(',').filter(s => s.trim() !== "");
    window.currentReplayIdx = window.replaySteps.length; 
    window.isReplayMode = true;
    board = JSON.parse(JSON.stringify(targetBoard));
    while (window.currentReplayIdx > 0) {
        window.currentReplayIdx--;
        executeSingleMove(window.replaySteps[window.currentReplayIdx], true); 
    }
    toggleLogPanel();
    showMediaControls(true);
    render();
    updateReplayDisplay();
}

function replayStepNext() {
    if (!window.isReplayMode || window.currentReplayIdx >= window.replaySteps.length) return;
    executeSingleMove(window.replaySteps[window.currentReplayIdx], false);
    window.currentReplayIdx++;
    updateReplayDisplay();
}

function replayStepBack() {
    if (!window.isReplayMode || window.currentReplayIdx <= 0) return;
    window.currentReplayIdx--;
    executeSingleMove(window.replaySteps[window.currentReplayIdx], true);
    updateReplayDisplay();
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
        this.stopDrawingLoop();
        
        // 既存ビデオの完全停止
        if (this.mediaElement instanceof HTMLVideoElement) {
            this.mediaElement.pause();
            this.mediaElement.removeAttribute('src'); // src属性自体を消す
            this.mediaElement.load();
        }

        const oldUrl = this.mediaSrc;
        const newUrl = URL.createObjectURL(file);
        this.mediaSrc = newUrl; // ここで新しいURLを即座に保持

        try {
            if (file.type.startsWith('image/')) {
                this.mode = 'image';
                const img = new Image();
                img.src = newUrl;
                await img.decode();
                this.mediaElement = img;
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
                this.startDrawingLoop();
            }

            renderPreview();
            render();

        } catch (e) {
            console.error("Media setup error:", e);
        } finally {
            // 解放を少し遅らせて、DOMの更新（render）が完了するのを待つ
            if (oldUrl && oldUrl !== newUrl) {
                setTimeout(() => URL.revokeObjectURL(oldUrl), 1000);
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
        if (!(v instanceof HTMLVideoElement) || v.readyState < 2) return;
        const canvases = document.querySelectorAll('.video-tile-canvas');
        if (v.readyState < 2) return;
        if (canvases.length === 0 || v.videoWidth === 0) return;
        
        const totalCells = subSize * gridNum;
        const minSide = Math.min(v.videoWidth, v.videoHeight);
        const sx0 = (v.videoWidth - minSide) / 2;
        const sy0 = (v.videoHeight - minSide) / 2;
        const step = minSide / totalCells;


        canvases.forEach(canvas => {
            const ctx = canvas.getContext('2d', { alpha: false });
            const r = parseInt(canvas.dataset.origR);
            const c = parseInt(canvas.dataset.origC);

            ctx.drawImage(
                v,
                sx0 + (c * step), sy0 + (r * step), step, step,
                0, 0, canvas.width, canvas.height
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
    if (e.target.files[0] && window.mediaManager) await window.mediaManager.setupMedia(e.target.files[0]);
    if (typeof toggleV2Panel === 'function') toggleV2Panel();
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
        overlay.style.display = 'none';
        if (window.isReplayMode && mediaControls) {
            mediaControls.style.visibility = 'visible';
            mediaControls.style.opacity = '1';
            const isComplete = (window.currentReplayIdx === window.replaySteps.length);
            if (isComplete && statusBoard) {
                statusBoard.classList.add('show');
            }
        }
    }
}
function loadFilteredHistory(data) {
    if (!data) return;

    targetBoard = JSON.parse(JSON.stringify(data.target_state));
    renderPreview();

    const scrambleInput = document.getElementById('scramble-input');
    const solveLog = document.getElementById('solve-log');
    if (scrambleInput) scrambleInput.value = data.scramble_log || "";
    if (solveLog) solveLog.value = data.solve_history || "";

    // --- 追加：解析モード表示用にタイムスタンプをグローバル保持 ---
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
 * 記号（A-R1等）を解析して1手だけ動かす
 */
function executeSingleMove(moveStr, isReverseAction) {
    const cmd = moveStr.trim().toLowerCase();
    if (!cmd.includes('-')) return;

    const [label, action] = cmd.split('-');
    let lineIdx = isNaN(label) ? label.charCodeAt(0) - 97 : parseInt(label) - 1;
    let isV = !isNaN(label);
    let dir = action[0].toUpperCase();
    let steps = parseInt(action.substring(1)) * subSize;

    // Backボタン時は方向を反転させる
    let finalRev = (dir === 'R' || dir === 'D');
    if (isReverseAction) finalRev = !finalRev;

    for (let i = 0; i < steps; i++) {
        moveLogic(lineIdx, isV, finalRev);
    }
    render();
    checkComplete();
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

function updateReplayDisplay() {
    const idxEl = document.getElementById('replay-index');
    const totalEl = document.getElementById('replay-total');
    const moveEl = document.getElementById('current-move-display');
    
    // 盤面カウンターのDOM要素（ID: move-count または counter-display）
    const boardCounter = document.getElementById('move-count') || document.getElementById('counter-display');

    if (idxEl) idxEl.innerText = window.currentReplayIdx;
    if (totalEl) totalEl.innerText = window.replaySteps.length;
    
    // --- 【修正】再生位置と盤面カウンターを完全同期 ---
    if (boardCounter) {
        // 表示を更新
        boardCounter.innerText = window.currentReplayIdx.toString().padStart(3, '0');
        // 内部変数 moveCount も同期（不整合を防止）
        moveCount = window.currentReplayIdx;
    }
    
    const isComplete = (window.currentReplayIdx === window.replaySteps.length);
    const isLogVisible = document.getElementById('log-overlay').style.display === 'block';

    if (moveEl) {
        moveEl.innerText = isComplete ? "COMPLETE" : (window.replaySteps[window.currentReplayIdx] || "END");
    }

    const nextBtn = document.querySelector('button[onclick="replayStepNext()"]');
    const backBtn = document.querySelector('button[onclick="replayStepBack()"]');
    if (nextBtn) nextBtn.disabled = isComplete;
    if (backBtn) backBtn.disabled = (window.currentReplayIdx <= 0);

    if (isComplete && !isLogVisible) {
        document.getElementById('status-board')?.classList.add('show');
    } else {
        document.getElementById('status-board')?.classList.remove('show');
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
