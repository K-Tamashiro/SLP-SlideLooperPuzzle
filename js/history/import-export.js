/** history/import-export.js — responsibility described in docs/architecture.md. */

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
            if (!Array.isArray(importedData)) return;

            const currentHistory = JSON.parse(localStorage.getItem('slp_history') || '[]');

            // --- 重複排除：timestamp文字列をそのままキーにする ---
            const historyMap = new Map();
            // 1. 既存データをいれる
            currentHistory.forEach(item => { if (item.timestamp) historyMap.set(item.timestamp, item); });
            // 2. インポートデータを上書き（または追加）
            importedData.forEach(item => { if (item.timestamp) historyMap.set(item.timestamp, item); });

            // 3. 配列に戻す（日付ソートせず、一旦そのまま保存）
            const combinedHistory = Array.from(historyMap.values());

            // 文字列比較で降順（新しい順）に並べ替え（"2024/..." なら文字列比較でいける）
            combinedHistory.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

            const limitedHistory = combinedHistory.slice(0, 400);

            localStorage.setItem('slp_history', JSON.stringify(limitedHistory));

            // リスト更新を強制実行
            refreshHistoryList();

        } catch (err) {
            console.error("Restore failed:", err);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

/**
 * Scramble Box内の記号をトーラス構造に基づいて反転させる
 * 現在の盤面サイズ（gridNum）を動的に参照し、距離 d を補数 (gridNum - d) に変換
 * さらに配列の順序を逆転させて、解法としての整合性を保つ
 */
function reversePattern() {
    const input = document.getElementById('scramble-input');
    if (!input || !input.value) return;

    // 現在のグリッドサイズ（面数）をcore.jsのグローバル変数から直接取得
    // 4x4なら2、6x6なら3、8x8なら4、9x9なら3が入る
    let gNum;
    try {
        gNum = Number(gridNum);
    } catch (e) {
        gNum = 3; // フォールバック
    }

    const steps = input.value.split(',').map(s => s.trim()).filter(s => s !== "");

    const invertedSteps = steps.map(step => {
        const dashIndex = step.lastIndexOf('-');
        if (dashIndex === -1) return step;

        const label = step.substring(0, dashIndex);
        const action = step.substring(dashIndex + 1);

        const dir = action.charAt(0);
        const distStr = action.substring(1);
        const dist = parseInt(distStr, 10);

        if (isNaN(dist)) return step;

        // トーラス反転計算：その盤面の「段数（面数）」に基づいた距離の補数
        // dist % gNum をとることで、過剰な回転数にも対応
        const revDist = (gNum - (dist % gNum)) % gNum;

        return `${label}-${dir}${revDist}`;
    });

    // 操作の実行順序を逆転させる
    invertedSteps.reverse();

    input.value = invertedSteps.join(',');

    console.log(`Torus Inversion Success: GridNum=${gNum}, Steps=${invertedSteps.length}`);
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
 * 盤面状態を維持したまま手順のみを適用する
 */
function reproduceScramble() {
    const input = document.getElementById('scramble-input').value;
    if (!input) return;

    // 1. 判定を一時的にスキップ（処理中のノイズ防止）
    skipCompleteOnce = true;

    // ※重要：盤面のリセット(initBoard)やターゲットの強制同期(copyTargetToCurrent)は行わない。
    // これにより、解析モードで特定の時点まで戻した状態や、
    // 任意の盤面状態に対して、追加で手順を適用することが可能になる。

    const steps = input.split(',').filter(s => s.trim() !== "");
    
    try {
        // 2. 現在の盤面に対して指定の手順を適用
        steps.forEach(move => {
            executeMove(move, false, true); 
        });

        render();
        
        // 3. 通常通りパネルを閉じる
        toggleLogPanel();
        
        if (typeof addLog === 'function') {
            addLog("Scramble applied to current board state.");
        }
        
    } catch (err) {
        console.error("Scramble reproduce failed:", err);
        alert("Invalid scramble format.");
    } finally {
        // 4. 完了後に判定を解放
        setTimeout(() => {
            skipCompleteOnce = false;
            // 念のためこの時点で判定を一回走らせる
            checkComplete();
        }, 100);
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

