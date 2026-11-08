/** solver/greedy.js — responsibility described in docs/architecture.md. */

/**
 * 実験用テストメソッド: エレベーター方式によるベタ揃え
 * 注文通り、ターゲット配色の解析ロジックを本メソッド内に完全に内包（1つのメソッドで完結）。
 * 「今のターゲットで左上(a1)に指定されている色」を起点とした正解 TileID を動的に特定し、1段残しまでを遂行します。
 */
async function testGreedySolver() {
  console.log('[Greedy Test] Starting row-by-row solve (Integrated Target Logic)...');
  const ss = Number(safeGet(() => subSize, 2));
  const gn = Number(safeGet(() => gridNum, 3));
  const N = ss * gn;

  if (!board || board.length !== N) {
    console.error("[Greedy Test] Board not initialized correctly.");
    return;
  }

  let curB = JSON.parse(JSON.stringify(board));

  // --- 1. ターゲット配色に基づいたゴール ID マップ（goalGrid）を生成 ---
  // ここで「a1」の正解を探している：r=0, c=0 のループ時に targetBoard[0][0] を参照する
  const goalGrid = Array.from({ length: N }, () => new Array(N));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      let fVal;
      // ターゲット盤面（見た目の正解）から、この座標 (r, c) に来るべき Face Index を特定
      if (targetBoard) {
        // targetBoard が全セル(N*N)か Face単位(gn*gn)かによって参照先を切り分け
        const cell = (targetBoard.length === N)
          ? targetBoard[r][c]
          : targetBoard[Math.floor(r / ss)][Math.floor(c / ss)];

        // ターゲット上の色（Face Index）を取得
        fVal = (cell && typeof cell === 'object') ? Number(cell.value) : Number(cell ?? (Math.floor(r / ss) * gn + Math.floor(c / ss)));
      } else {
        // ターゲット不在時は標準 Identity
        fVal = Math.floor(r / ss) * gn + Math.floor(c / ss);
      }

      // その色が標準完成図（Identity）で本来占めていた座標の基点を算出
      const orig_r_tl = Math.floor(fVal / gn) * ss;
      const orig_c_tl = (fVal % gn) * ss;

      // 今のターゲット配色設定において、座標 (r, c) に居るべき本来の Tile ID
      // 例：ターゲット左上(a1)が赤(Face 5)なら、r=0,c=0のとき TileID 16(17番) がゴールとなる
      goalGrid[r][c] = (orig_r_tl + (r % ss)) * N + (orig_c_tl + (c % ss));
    }
  }

  const path = [];
  const apply = (line, isV, isRev, dist) => {
    if (dist <= 0) {
      return;
    }
    const label = isV ? (line + 1).toString() : String.fromCharCode(97 + line);
    const dir = isV ? (isRev ? 'U' : 'D') : (isRev ? 'L' : 'R');
    path.push(`${label}-${dir}${dist}`);

    // 論理盤面の同期
    for (let i = 0; i < Math.round(dist * ss); i++) {
      moveLocal(curB, line, isV, isRev);
    }
  };

  const find = (tid) => {
    const targetTid = Number(tid);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (curB[r] && curB[r][c] && Number(curB[r][c].tileId) === targetTid) {
          return { r, c };
        }
      }
    }
    return null;
  };

  const stopR = N - ss;
  console.log(`[Greedy Test] Target Sync: a1 (0,0) correct TileID is ${goalGrid[0][0]}`);

  for (let r = 0; r < stopR; r++) {
    if (typeof setMsg === 'function') {
      setMsg(`Greedy: Row ${r + 1}/${stopR}...`);
    }
    await new Promise(res => setTimeout(res, 5));

    for (let c = 0; c < N; c++) {
      const tid = goalGrid[r][c];
      let p = find(tid);

      if (!p) {
        continue;
      }
      if (p.r === r && p.c === c) {
        continue;
      }

      // 作業行 (wr): 現在行のFace単位で1ユニット下の開始行
      const wr = (r + ss) % N;

      // 1. パーツを行 r から逃がす
      if (p.r === r) {
        apply(p.c, true, false, 1);
        apply(wr, false, false, 1);
        apply(p.c, true, true, 1);
        p = find(tid);
      }

      // 2. パーツを作業行 wr まで運ぶ
      if (p && p.r !== wr) {
        const vDist = (wr - p.r + N) % N;
        const vUnits = Math.round(vDist / ss);
        if (vUnits > 0) {
          apply(p.c, true, false, vUnits);
          apply(wr, false, false, 1);
          apply(p.c, true, true, vUnits);
          p = find(tid);
        }
      }

      if (!p) {
        continue;
      }

      // 3. エレベーター：目的列 c を作業行まで迎えにいく
      while (p && p.c === c) {
        apply(wr, false, false, 1);
        p = find(tid);
      }

      const elevatorDist = Math.max(1, Math.round(((wr - r + N) % N) / ss));
      apply(c, true, false, elevatorDist);

      // 4. 合流
      p = find(tid);
      if (p) {
        const hDist = (c - p.c + N) % N;
        const hUnits = Math.round(hDist / ss);
        if (hUnits > 0) {
          apply(wr, false, false, hUnits);
        }
      }

      // 5. 帰還
      apply(c, true, true, elevatorDist);
    }
  }
  // --- 4. 仕上げ: 右下 ss x ss ブロックの同期 ---
  // ここまでで下段の各行に必要なパーツは揃っているため、行ごとの LR シフトで完成します。
  console.log('[Greedy Test] Final horizontal alignment...');
  for (let r = stopR; r < N; r++) {
    const tid = goalGrid[r][N - 1]; // 右端を基準に位置合わせ
    let p = find(tid);
    if (p && p.r === r && p.c !== N - 1) {
      const hDist = (N - 1 - p.c + N) % N;
      const hUnits = Math.round(hDist / ss);
      if (hUnits > 0) apply(r, false, false, hUnits);
    }
  }
  const modeKey = `${ss}-${N}`;
  switch (modeKey) {
    case '2-4':
      break;
    case '2-6':
      // --- 3. 2x2枠 6x6盤面 (2-6) 限定の 3点交換仕上げロジック ---
      console.log('[Greedy Test] Starting Macro 2-6 Logic (Post-Greedy)...');

      // 【重要】Face 9 (Row 4-5, Col 4-5) の左上 (4,4) と左下 (5,4) に来るべきタイルを追跡
      const tidC3 = goalGrid[4][4]; // Face 9 Top-Left
      const tidD3 = goalGrid[5][4]; // Face 9 Bottom-Left

      // セットアップ移動を行う前に、対象ピースの現在位置を確定
      const initC3 = find(tidC3);
      const initD3 = find(tidD3);

      // Face 9 の左列が正解位置にない場合のみマクロを実行
      const needC3 = initC3 && (initC3.r !== 4 || initC3.c !== 4);
      const needD3 = initD3 && (initD3.r !== 5 || initD3.c !== 4);

      if (needC3 || needD3) {
        console.log(`[Macro 2-6] F9-LU at (${initC3?.r},${initC3?.c}), F9-LD at (${initD3?.r},${initD3?.c})`);

        // A. セットアップ (56-U1, CD-L1)
        // これにより Face 9 が物理座標 (2,2) と (3,2) に移動する
        apply(4, true, true, 1); apply(5, true, true, 1); // 5-U1, 6-U1
        apply(2, false, true, 1); apply(3, false, true, 1); // c-L1, d-L1

        // B. C3 (Row 2, Col 2) の解決
        // initC3 がバッファ領域 E1(4,0) または E3(4,2) にある場合に対応
        if (needC3 && initC3) {
          if (initC3.r === 4 && initC3.c === 0) { // E1
            apply(2, true, false, 1); apply(4, false, false, 1); apply(2, true, true, 1); apply(4, false, true, 1);
          } else if (initC3.r === 4 && initC3.c === 2) { // E3
            apply(4, false, false, 1); apply(2, true, false, 1); apply(4, false, true, 1); apply(2, true, true, 1);
          }
        }

        // C. D3 (Row 3, Col 2) の解決
        // initD3 がバッファ領域 F1(5,0) または F3(5,2) にある場合に対応
        if (needD3 && initD3) {
          if (initD3.r === 5 && initD3.c === 0) { // F1
            apply(2, true, false, 1); apply(5, false, false, 1); apply(2, true, true, 1); apply(5, false, true, 1);
          } else if (initD3.r === 5 && initD3.c === 2) { // F3
            apply(5, false, false, 1); apply(2, true, false, 1); apply(5, false, true, 1); apply(2, true, true, 1);
          }
        }

        // D. セットアップ解除 (CD-R1, 56-D1)
        apply(2, false, false, 1); apply(3, false, false, 1); // c-R1, d-R1
        apply(4, true, false, 1); apply(5, true, false, 1); // 5-D1, 6-D1
      }
      break;
    case '3-9':
      console.log('[Greedy Test] Executing Macro 3-9 (Order Fixed: Inspection FIRST)');

      const points = [
        { r: 6, c: 6, lbl: '7G', vCol: 3 },
        { r: 7, c: 6, lbl: '7H', vCol: 3 },
        { r: 8, c: 6, lbl: '7I', vCol: 3 },
        { r: 6, c: 7, lbl: '8G', vCol: 4 },
        { r: 7, c: 7, lbl: '8H', vCol: 4 },
        { r: 8, c: 7, lbl: '8I', vCol: 4 }
      ];

      // --- 1. 判定フェーズ (セットアップ前に全箇所を確定させる) ---
      const taskQueue = [];
      points.forEach(p => {
        const currentTileId = curB[p.r][p.c].tileId;
        const targetTileId = goalGrid[p.r][p.c];

        if (currentTileId === targetTileId) {
          console.log(`${p.lbl}＝OK`);
        } else {
          let sourceFace = 'Unknown';
          // 承認済み判定ロジック：goalGridを逆引き
          for (let gr = 0; gr < 9; gr++) {
            for (let gc = 0; gc < 9; gc++) {
              if (goalGrid[gr][gc] === currentTileId) {
                // 承認済み反転判定：0-2ならFace8、3-5ならFace7
                if (gc >= 0 && gc <= 2) sourceFace = 'Face8';
                else if (gc >= 3 && gc <= 5) sourceFace = 'Face7';
                break;
              }
            }
            if (sourceFace !== 'Unknown') break;
          }
          console.log(`${p.lbl}＝${sourceFace}`);
          if (sourceFace !== 'Unknown') {
            taskQueue.push({ r: p.r, lbl: p.lbl, type: sourceFace, vCol: p.vCol });
          }
        }
      });

      // --- 2. 実行フェーズ (判定が終わってから動かす) ---
      if (taskQueue.length > 0) {
        // [A] セットアップ (789-U1, DEF-L1)
        [6, 7, 8].forEach(c => apply(c, true, true, 1));
        [3, 4, 5].forEach(r => apply(r, false, true, 1));

        // [B] マクロ実行
        taskQueue.forEach(t => {
          if (t.type === 'Face7') {
            // Face 7由来: DU-RL
            apply(t.vCol, true, false, 1); // 4-D1
            apply(t.r, false, false, 1);   // Row-R1
            apply(t.vCol, true, true, 1);  // 4-U1
            apply(t.r, false, true, 1);    // Row-L1
          } else if (t.type === 'Face8') {
            // Face 8由来: RL-DU
            apply(t.r, false, false, 1);   // Row-R1
            apply(t.vCol, true, false, 1); // 5-D1
            apply(t.r, false, true, 1);    // Row-L1
            apply(t.vCol, true, true, 1);  // 5-U1
          }
        });

        // [C] セットアップ戻し (DEF-R1, 789-D1)
        [3, 4, 5].forEach(r => apply(r, false, false, 1));
        [6, 7, 8].forEach(c => apply(c, true, false, 1));
      }

      break;
    case '2-8':

      break;
    default:
  }

  // console.log('[Greedy Test] Result Sequence:', path.join(','));

  setOut(path.join(','));

  // Greedy解析結果をログ保存
  saveSystemLog_CPU();
  setMsg(path.length > 0 ? `Greedy: OK (${path.length} moves)` : "Greedy: No moves needed.");
}

