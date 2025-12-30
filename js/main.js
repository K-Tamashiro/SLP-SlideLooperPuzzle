/**
 * DOMロード時の初期化
 */
window.addEventListener('DOMContentLoaded', () => {
    // 1. タイトルクリックでのメニュー開閉
    const title = document.querySelector('p[onclick]');
    if (title) {
        title.addEventListener('touchstart', () => toggleMenu(), { passive: true });
    }

    // 2. メディア入力(input[type="file"])の接続
    const mediaInput = document.getElementById('media-input');
    if (mediaInput) {
        mediaInput.addEventListener('change', async (e) => {
            if (e.target.files[0] && window.mediaManager) {
                await window.mediaManager.setupMedia(e.target.files[0]);
                // ★連続選択を可能にするためのリセット
                e.target.value = ''; 
            }
        });
    }

    // 3. インポート・リストア用 input の接続
    const importInput = document.getElementById('import-input');
    if (importInput) importInput.addEventListener('change', (e) => importCSV(e));

    const restoreInput = document.getElementById('restore-input');
    if (restoreInput) restoreInput.addEventListener('change', (e) => restoreHistory(e));

    // 4. 盤面の初期構築
    initBoard();
});

/**
 * キーボードショートカットのフィードバック
 */
window.addEventListener('keydown', (e) => updateKeyIndicator(e, true));
window.addEventListener('keyup', (e) => updateKeyIndicator(e, false));
window.addEventListener('blur', () => {
    document.querySelectorAll('.key-indicator').forEach(el => el.classList.remove('key-active'));
});

function updateKeyIndicator(e, isActive) {
    const indicators = document.querySelectorAll('.key-indicator');
    indicators.forEach(el => {
        const keyText = el.innerText.toUpperCase();
        if ((keyText === 'SHIFT' && e.key === 'Shift') || (keyText === 'CTRL' && e.key === 'Control')) {
            el.classList.toggle('key-active', isActive);
        }
    });
}

/**
 * ウィンドウレベルのイベント管理
 */
window.onmousemove = (e) => {
    handleMove(e.clientX, e.clientY);
    updateSearchlight(e.clientX, e.clientY);
};

window.onmouseup = () => {
    endDrag();
    if (window.isSearchlightMode) {
        document.getElementById('searchlight-overlay')?.classList.remove('searchlight-active');
    }
};

/**
 * スマホ用：タッチ移動ハンドラ
 */
window.ontouchmove = (e) => {
    if (!isDragging) return;

    const touches = e.touches;
    const curX = touches[0].clientX;
    const curY = touches[0].clientY;

    if (touches.length >= 2) {
        // --- 2本指以上の時：スポットライト移動のみ ---
        if (e.cancelable) e.preventDefault();
        
        // パズルのドラッグ（スライド）計算をスキップし、サーチライト座標のみ更新
        updateSearchlight(curX, curY);
        
        // ゴーストが表示されている場合は、一旦非表示にするか動きを止めるため
        // currentTranslate を更新せず、見た目の連続性を維持
    } else {
        // --- 1本指の時：通常のスライド操作 ＋ スポットライト追従 ---
        if (e.cancelable) e.preventDefault();
        handleMove(curX, curY);
        updateSearchlight(curX, curY);
    }
};

window.ontouchend = () => {
    endDrag();
    if (window.isSearchlightMode) {
        document.getElementById('searchlight-overlay')?.classList.remove('searchlight-active');
    }
};
window.isFlashMode = false;

/**
 * カラーモードへの完全リセット
 */
window.resetToColorMode = function() {
    if (!window.mediaManager) return;

    // 1. ループとモードを即座に遮断
    window.mediaManager.stopDrawingLoop();
    window.mediaManager.mode = 'color';

    // 2. DOMから古いメディア要素を物理的に全削除
    const board = document.getElementById('board');
    if (board) board.innerHTML = ''; 

    // 3. URL参照を「描画命令の前」に物理的に断つ
    const oldUrl = window.mediaManager.mediaSrc;
    window.mediaManager.mediaSrc = null;
    
    if (window.mediaManager.mediaElement instanceof HTMLVideoElement) {
        window.mediaManager.mediaElement.pause();
        window.mediaManager.mediaElement.src = "";
    }
    window.mediaManager.mediaElement = null;

    // --- カラーモード復帰時に回転ボタンのロックを解除 ---
    const rotateBtn = document.querySelector('button[onclick="startRotateCountdown()"]');
    if (rotateBtn) {
        rotateBtn.disabled = false;
        rotateBtn.style.opacity = '1';
        rotateBtn.style.pointerEvents = 'auto';
    }
    // --------------------------------------------------

    // 4. 更地になった状態で再描画を実行
    renderPreview();
    render();

    // 5. UI更新
    if (document.getElementById('current-v2-mode')) {
        document.getElementById('current-v2-mode').innerText = 'COLOR';
    }

    // 6. 最後に安全にURLを解放
    if (oldUrl) {
        setTimeout(() => {
            try { URL.revokeObjectURL(oldUrl); } catch(e) {}
        }, 500);
    }
};

/**
 * 補助ユーティリティ
 */
function toggleMenu() {
    document.querySelector('.menu-panel')?.classList.toggle('hidden');
}

function clearSolveLog() {
    solveHistory = [];
    const logInput = document.getElementById('solve-log');
    if (logInput) logInput.value = '';
}

/**
 * セッション強制終了（チート使用時など）
 */
function forceStopSession() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    const timerBtn = document.querySelector('button[onclick="toggleTimer()"]');
    if (timerBtn) timerBtn.classList.remove('active-toggle');
    stopRotateIntervalOnly();
    setInterfaceLock(false);
    saveSystemLog(false);
    if (typeof addLog === 'function') addLog("Cheat move detected. Session terminated.");
}
/**
 * 1. Scramble Import: Process the selected CSV file
 */
function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const scrambleInput = document.getElementById('scramble-input');
        if (scrambleInput) {
            // Remove newlines and extra spaces
            const content = e.target.result.replace(/[^A-Za-z0-9,\-]/g, "");
            scrambleInput.value = content;
            
            if (typeof addLog === 'function') {
                addLog("Scramble pattern imported from file.");
            }
            alert("Import successful: Scramble data loaded.");
        }
    };
    reader.onerror = () => alert("Failed to read the file.");
    reader.readAsText(file);
}
/**
 * 4. Restore History: Trigger file selection
 */
function triggerRestore() {
    const input = document.getElementById('restore-input');
    if (input) {
        input.value = '';
        input.click();
    }
}

/**
 * 4. Restore History: Import and merge/overwrite history data
 */
function restoreHistory(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!Array.isArray(importedData)) throw new Error("Invalid format");

            // 既存の履歴を確認
            const currentHistory = JSON.parse(localStorage.getItem('slp_history') || '[]');
            
            // 統合（重複を避ける場合はタイムスタンプ等で比較が必要ですが、現在は単純追加）
            const newHistory = [...importedData, ...currentHistory];
            
            // 最大400件に制限
            const limitedHistory = newHistory.slice(-400);
            
            localStorage.setItem('slp_history', JSON.stringify(limitedHistory));
            
            refreshHistoryList();
            alert("History restored successfully.");
            
        } catch (err) {
            alert("Error: Invalid backup file format.");
            console.error(err);
        }
    };
    reader.readAsText(file);
}
/**
 * サイドメニューの再生ボタン押下時の挙動
 * 1. メディアコントロール表示中 -> 解析モードを終了してコントロールを消す
 * 2. 非表示中 -> ログパネルを表示してログ選択を促す
 */
function toggleReplayMode() {
    const mediaControls = document.getElementById('media-controls');
    const isMediaVisible = mediaControls && mediaControls.classList.contains('active');

    if (isMediaVisible) {
        // メディアコントロールが表示されていたら消す（解析モード終了）
        window.isReplayMode = false;
        showMediaControls(false);
        
        if (window.autoPlayTimer) {
            clearInterval(window.autoPlayTimer);
            window.autoPlayTimer = null;
        }
        
        // 完了通知が出ていれば消す
        document.getElementById('status-board')?.classList.remove('show');
    } else {
        // 表示されていなければログダイアログを表示
        toggleLogPanel();
    }
}
/**
 * ログ記録スイッチの切り替え（アイコンボタン版）
 */
function toggleLogSwitch() {
    isLogEnabled = !isLogEnabled;
    const btn = document.getElementById('log-switch-btn');
    const icon = document.getElementById('log-check-icon');
    
    if (isLogEnabled) {
        btn.classList.add('active-rec');
        icon.innerText = "☑"; // チェックあり
        if (typeof addLog === 'function') addLog("Recording enabled.");
    } else {
        // 無効時はタイマーを強制停止
        if (timerId) toggleTimer(false);
        btn.classList.remove('active-rec');
        icon.innerText = "☐"; // チェックなし
        if (typeof addLog === 'function') addLog("Recording disabled.");
    }
}
/**
 * 現在の盤面をターゲットにコピーする（判定をスルーする）
 */
function copyCurrentToTarget() {
    targetBoard = JSON.parse(JSON.stringify(board));
    renderPreview();
    
    // 次回の判定時のみ、一致していても表示をスルーする
    skipCompleteOnce = true;
    checkComplete();
}

function handleModeChange(mode) {
    // 現在タイマーが動いている、または1手以上動かしている場合は保存して締める
    if (timerId || moveCount > 0) {
        saveSystemLog(false); // 未完了(isComplete=false)として保存
    }

    switch (mode) {
        case 'easy': changeMode(2, 2); break;
        case 'mid': changeMode(2, 3); break;
        case 'hard': changeMode(3, 3); break;
        case 'advance': changeMode(2, 4); break;
    }
}
function changeMode(sSize, gNum) {
    subSize = sSize; 
    gridNum = gNum;
    initBoard(true);
}