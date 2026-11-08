/** history/ui.js — responsibility described in docs/architecture.md. */

/**
 * 履歴のインデックスからデータをロード（JSONエスケープエラー回避用）
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

    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
        timerDisplay.innerText = data.solve_time || "00:00.000";
    }

    const solveTimeEl = document.getElementById('solve-time');
    if (solveTimeEl) {
        solveTimeEl.innerText = data.solve_time || "00:00.000";
    }
    // ----------------------------------------------------
}

/**
 * 履歴リストの表示更新
 * 空枠への「？」表示、アイコン最大化、ステップ単位「cnt」を適用
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
    const filtered = history.filter(h => {
        return Number(h.grid_size) === gridNum && Number(h.sub_size) === subSize;
    }).reverse();

    if (filtered.length === 0) {
        container.innerHTML = '<div class="history-empty">No history for this mode.</div>';
        return;
    }

    // --- サイズ計算 ---
    const totalSize = gridNum * subSize;
    let miniCellSize = 2;
    if (totalSize <= 4) miniCellSize = 5;
    else if (totalSize <= 6) miniCellSize = 3;

    const boxWidth = totalSize * miniCellSize + (totalSize - 1) + 2;

    container.innerHTML = filtered.map((data, index) => {
        const entryId = data.timestamp; 
        const stepValue = data.step_count ? data.step_count.toString().replace(/[^0-9]/g, '') : "0";
        const paddedSteps = stepValue.padStart(4, '0');
        const logMode = data.media_mode || 'color';

        // --- 空枠（プレースホルダー）に「？」を追加 ---
        const emptyBox = `
            <div style="width:${boxWidth}px; height:${boxWidth}px; border:1px dashed #555; 
                 flex-shrink:0; box-sizing:border-box; display:flex; align-items:center; 
                 justify-content:center; color:#555; font-size:${Math.floor(boxWidth * 0.6)}px; 
                 font-weight:bold; font-family:sans-serif;">?</div>`;

        const initialPreview = data.initial_state 
            ? createMiniPreview(data.initial_state, miniCellSize) 
            : emptyBox;

        const arrow = `<span style="color: #ffff00; font-size: 10px; margin: 0 5px; flex-shrink: 0;">▶</span>`;

        // 右側：ターゲット表示
        let targetIcon = "";
        const fontSize = Math.floor(boxWidth * 0.75);

        if (logMode === 'video') {
            targetIcon = `<div class="history-icon-box" title="Video Mode" style="width:${boxWidth}px; height:${boxWidth}px; display:flex; align-items:center; justify-content:center; font-size:${fontSize}px; border:1px solid #444; border-radius:2px; background:#222;">▶️</div>`;
        } else if (logMode === 'image') {
            targetIcon = `<div class="history-icon-box" title="Image Mode" style="width:${boxWidth}px; height:${boxWidth}px; display:flex; align-items:center; justify-content:center; font-size:${fontSize}px; border:1px solid #444; border-radius:2px; background:#222;">🖼️</div>`;
        } else {
            targetIcon = data.target_state ? createMiniPreview(data.target_state, miniCellSize) : emptyBox;
        }

        const iconContent = `
            <div style="display: flex; align-items: center; justify-content: center;">
                <div style="flex-shrink:0; width:${boxWidth}px; display:flex; justify-content:center;">${initialPreview}</div>
                ${arrow}
                <div style="flex-shrink:0; width:${boxWidth}px; display:flex; justify-content:center;">${targetIcon}</div>
            </div>
        `;

        return `
            <div class="history-item" 
                data-index="${index}" 
                role="listitem" 
                tabindex="0" 
                style="display: flex; align-items: center; padding: 4px 6px;">
                <div class="mini-target-icon" onclick="loadHistoryByIndex(${index})" style="width: auto; min-width: ${boxWidth * 2 + 20}px; flex-shrink: 0; display: flex; align-items: center; margin-right: 10px;">
                    ${iconContent}
                </div>
                <div class="history-status" style="flex-shrink: 0; margin-right: 8px;">${data.is_complete ? "✅" : "⚠️"}</div>
                <div class="history-info" onclick="loadHistoryByIndex(${index})" style="flex-grow: 1; min-width: 0;">
                    <div class="history-date" style="font-size: 9px; color: #ccc;">${data.timestamp}</div>
                    <div class="history-stats" style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="history-time" style="font-family: monospace; font-size: 11px;">${data.solve_time}</span>
                        <span class="history-steps" style="font-size: 10px; color: #888; margin-left: 6px;">${paddedSteps} cnt</span>
                    </div>
                </div>
                <button class="history-delete-btn" onclick="deleteHistoryEntry('${entryId}')" style="margin-left: 6px; flex-shrink: 0;">🗑️</button>
            </div>`;
    }).join('');

    window.currentFilteredHistory = filtered;
}

/**
 * ミニプレビュー生成（セルサイズ指定対応）
 */
function createMiniPreview(state, cellSize = 3) {
    if (!state || !Array.isArray(state)) return '';
    const size = state.length;
    let html = `<div style="display:grid; grid-template-columns:repeat(${size}, ${cellSize}px); gap:1px; background:#333; padding:1px; border-radius:1px; flex-shrink:0; box-sizing:border-box;">`;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const entry = state[r][c];
            const val = (entry !== null && typeof entry === 'object') ? entry.value : entry;
            const colorClass = (val !== undefined && val !== null) ? `c${val}` : '';
            html += `<div class="${colorClass}" style="width:${cellSize}px; height:${cellSize}px;"></div>`;
        }
    }
    html += `</div>`;
    return html;
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
            const isComplete = (window.currentReplayIdx === window.moveTable.length);
            if (isComplete && statusBoard) {
                statusBoard.classList.add('show');
            }
        }
    }
    toggleMenu(false);
}

function loadFilteredHistory(data) {
    if (!data) return;

    // 数値配列をオブジェクト構造へ正規化してから代入 ---
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

