/** replay/moves.js — responsibility described in docs/architecture.md. */

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
 * 通常移動／枠移動を吸収する唯一の実行入口
 */
function executeMove(moveStr, isReverse, isSilent = false) {
    // 枠移動ログ判定（例: A2-R1 / 2-D1 など）
    if (moveStr.includes(':')) {
        // 例: G1:A-R1
        const [group, move] = moveStr.split(':');
        const groupIdx = parseInt(group.substring(1)); // G1 → 1
        const base = groupIdx * subSize;

        const isV = !isNaN(move[0]);

        for (let i = 0; i < subSize; i++) {
            const label = isV
                ? (base + i + 1)
                : String.fromCharCode(97 + base + i);

            const dirCount = move.split('-')[1]; // ★ 正規化
            executeSingleMove(`${label}-${dirCount}`, isReverse, true);
        }


        if (!isSilent) render();
        return;
    }

    // 通常移動
    executeSingleMove(moveStr, isReverse, isSilent);
}

/**
 * moveTable 用 実行エンジン
 */
function executeGroupedMove(move, isReverseAction, isSilent = false) {
    if (move.dist <= 0) return;

    const isRev = getIsRev(move.isV, move.dir, isReverseAction);
    const steps = move.dist * subSize;

    if (move.type === 'SINGLE') {
        for (let i = 0; i < steps; i++) {
            moveLogic(move.lineIndices[0], move.isV, isRev);
        }
    } else { // FRAME
        for (let i = 0; i < steps; i++) {
            for (const lineIdx of move.lineIndices) {
                moveLogic(lineIdx, move.isV, isRev);
            }
        }
    }

    if (!isSilent) render();
}

function getIsRev(isV, dir, isReverseAction) {
    let isRev;
    if (isV) {
        isRev = (dir === 'U');
    } else {
        isRev = (dir === 'L');
    }
    if (isReverseAction) isRev = !isRev;
    return isRev;
}

/**
 * 解析用グルーピング実行メソッド
 * 1. 同一ブロック内の順序（ab/ba）を問わず FRAME として集約
 * 2. dir と dist を完全に独立したカラムとして出力
 * 3. 周期（gridNum）に基づいた復元値を算出
*/
function staticShowGrouping() {
    const rawLog = document.getElementById('solve-log')?.value;
    if (!rawLog) return;
    
    // core.js のグローバル変数から最新の状態を確実に取得
    const sSize = Number(typeof subSize !== 'undefined' ? subSize : 2); 
    const gNum = Number(typeof gridNum !== 'undefined' ? gridNum : 3);  
    
    const steps = rawLog.split(',').map(s => s.trim()).filter(s => s !== "");
    const total = steps.length;
    
    window.moveTable = []; 
    
    let i = 0;
    while (i < total) {
        let matchedMove = null;
        
        // --- パース関数 ---
        const parse = (stepStr) => {
            if (!stepStr) return null;
            const parts = stepStr.split('-');
            if (parts.length < 2) return null;
            const label = parts[0].toLowerCase();
            const actionStr = parts[1].toUpperCase();
            
            const isV = !isNaN(label); // 数値なら垂直(1,2..)、文字なら水平(a,b..)
            const lineIdx = isV ? parseInt(label, 10) - 1 : label.charCodeAt(0) - 97;
            const dir = actionStr.charAt(0);
            const dist = parseInt(actionStr.substring(1), 10) || 0;
            const reverse = (gNum - (dist % gNum)) % gNum;
            
            return { isV, lineIdx, dir, dist, reverse, actionStr };
        };
        
        const current = parse(steps[i]);
        if (!current) { i++; continue; }
        
        // --- 順序不問のブロック（FRAME）判定ロジック ---
        // 1. 現在の lineIdx が属するブロックの境界（開始位置）を特定
        const blockId = Math.floor(current.lineIdx / sSize);
        const blockStart = blockId * sSize;
        const requiredIndices = Array.from({length: sSize}, (_, k) => blockStart + k);
        
        // 2. 現在地から sSize 分のステップを先行取得して検証
        if (i + sSize <= total) {
            const candidates = [];
            for (let k = 0; k < sSize; k++) {
                candidates.push(parse(steps[i + k]));
            }
            
            // 全てが同じ軸(V/H) かつ 同じアクション(例: R1) であるか確認
            const isSameAction = candidates.every(c => 
                c && c.isV === current.isV && c.actionStr === current.actionStr
            );
            
            if (isSameAction) {
                // 含まれる lineIdx の集合が、特定のブロック（0-1, 2-3等）と一致するか確認
                const foundIndices = candidates.map(c => c.lineIdx).sort((a, b) => a - b);
                const isBlockMatch = foundIndices.every((val, idx) => val === requiredIndices[idx]);
                
                if (isBlockMatch) {
                    matchedMove = {
                        type: 'FRAME',
                        size: sSize,
                        lineIndices: requiredIndices, // 常に昇順で保持 (a,b / 1,2)
                        isV: current.isV,
                        dir: current.dir,
                        dist: current.dist,
                        reverse: current.reverse
                    };
                }
            }
        }
        
        // --- SINGLE（単一行列）の登録 ---
        if (!matchedMove) {
            matchedMove = {
                type: 'SINGLE',
                size: 1,
                lineIndices: [current.lineIdx],
                isV: current.isV,
                dir: current.dir,
                dist: current.dist,
                reverse: current.reverse
            };
        }
        
        window.moveTable.push(matchedMove);
        
        i += matchedMove.size;
    }
    if(window.debugmode){
        // --- コンソール出力の整理 ---
        console.log(`[Grouping Analysis] Mode:${gNum}x${gNum} / Block:${sSize}`);
        console.table(window.moveTable.map((m, idx) => ({
            index: idx,
            type: m.type,
            axis: m.isV ? 'V' : 'H',
            lines: m.lineIndices.map(idx => m.isV ? idx + 1 : String.fromCharCode(97 + idx)).join(','),
            dir: m.dir,    // 方向記号 (L, R, U, D)
            dist: m.dist,  // 移動距離 (数値のみ)
            reverse: m.reverse // 復元に必要なステップ数
        })));
    }
}

function playTableMove(m, useReverse, silent=true){
    const blocks = useReverse ? m.reverse : m.dist; // ← tableの値をそのまま使う
    if (blocks <= 0) return;

    const isRev = (m.isV ? (m.dir === 'U') : (m.dir === 'L')); // ← 再計算しない
    const steps = blocks * subSize;

    // FRAME も SINGLE も「単に single の連続」
    for (let s = 0; s < steps; s++) {
        for (const idx of m.lineIndices) {
            moveLogic(idx, m.isV, isRev);
        }
    }
    if (!silent) render();
}

/**
 * ログ文字列パースヘルパー
 */
function parseMoveStep(step) {
  if (!step) return null;
  var match = step.match(/^([a-z0-9]+)-([LRUD])(\d+)$/i);
  if (!match) return null;
  var label = match[1];
  var dir = match[2].toUpperCase();
  var dist = parseInt(match[3], 10);
  var isDigit = /^\d+$/.test(label);
  var isV = isDigit;
  var idx = isV ? (parseInt(label, 10) - 1) : (label.toLowerCase().charCodeAt(0) - 97);
  return { isV: isV, idx: idx, dir: dir, dist: dist, lineIndices: [idx], originalStr: step };
}

