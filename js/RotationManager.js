/**
 * SLP Rotation Manager
 * ピースの回転状態管理と描画を担当
 */
class RotationManager {
    constructor(mode) {
        this.mode = mode; // COLOR, IMAGE, MOVIE
        this.buffers = new Map(); // IMAGEモード用バッファ
    }

    /**
     * ピースに回転角（0-3）をセット
     */
    initPiece(piece) {
        piece.direction = 0; // 0:0, 1:90, 2:180, 3:270
    }

    /**
     * 時計回りに90度回転
     */
    rotate(piece) {
        piece.direction = (piece.direction + 1) % 4;
    }

    /**
     * 回転を考慮した描画実行
     */
    render(ctx, piece, source, x, y, w, h, sx, sy, sw, sh) {
        const angle = piece.direction * 90; //
        
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((angle * Math.PI) / 180);

        if (sx !== undefined && sy !== undefined) {
            // 部分切り出し描画
            ctx.drawImage(source, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
        } else {
            // 全体描画
            ctx.drawImage(source, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
    }
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
    if(debugmode){
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

/**
 * 表示更新（左:0=崩れ ～ 右:Max=完成）forward版
 */
function updateReplayDisplayForward() {
  const idxEl = document.getElementById('replay-index');
  const totalEl = document.getElementById('replay-total');
  const moveEl = document.getElementById('current-move-display');
  const slider = document.getElementById('analyze-slider');
  const boardCounter = document.getElementById('move-count') || document.getElementById('counter-display');

  const totalSteps = window.moveTable?.length || 0;
  const cur = window.currentReplayIdx || 0;

  if (idxEl) idxEl.innerText = cur;
  if (totalEl) totalEl.innerText = totalSteps;
  if (slider) { slider.max = totalSteps; slider.value = cur; }
  if (boardCounter) boardCounter.innerText = cur.toString().padStart(4, '0');

  if (moveEl) {
    const displayIdx = (cur <= 0) ? 0 : cur - 1;
    const m = (window.originalLogSteps?.[displayIdx]) || "---";
    if (cur >= totalSteps) moveEl.innerText = `COMPLETE[${m}]`;
    else if (cur <= 0) moveEl.innerText = `Start[${m}]`;
    else moveEl.innerText = `[${m}]`;
  }

  const nextBtn = document.querySelector('button[onclick="replayStepNext()"]');
  const backBtn = document.querySelector('button[onclick="replayStepBack()"]');
  if (nextBtn) nextBtn.disabled = (cur >= totalSteps);
  if (backBtn) backBtn.disabled = (cur <= 0);

  if (typeof hideCompleteDisplay === 'function') hideCompleteDisplay();
  document.getElementById('status-board')?.classList.remove('show');
}

// 方向→isRev（executeSingleMove と同じ規約、反転はしない）
function dirToIsRev(isV, dir){
  dir = (dir||"").toUpperCase();
  return isV ? (dir === 'U') : (dir === 'L');
}

// moveTable 1件を「物理移動」として実行（reverseは“戻し距離”として使う）
function execTableMove(m, useReverseDist, silent=true){
  const blocks = useReverseDist ? m.reverse : m.dist;         // ★reverseは距離のみ
  const steps  = blocks * subSize;                            // ★コマ数へ展開
  const isRev  = dirToIsRev(m.isV, m.dir);                    // ★方向は固定
  for(let s=0; s<steps; s++) for(const li of m.lineIndices) moveLogic(li, m.isV, isRev);
  if(!silent) render();
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
// グローバルまたはモジュールとしてエクスポート
window.RotationManager = RotationManager;
