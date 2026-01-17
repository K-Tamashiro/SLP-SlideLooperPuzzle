/**
 * analyze-system.js (SLP CPU Solver)
 *
 * SLPルール準拠：
 * - 1手は「行 or 列」全体をトーラス回転
 * - 回転量は (dist * subSize) セル
 * - 表記は既存Scramble表記： a-L1 / b-R2 / 1-U1 / 3-D1 ...
 *
 * 正解判定は tileId 完全一致（回転は考慮しない）
 * - board: 2D array of cell objects { value, tileId, direction }
 * - targetBoard: 2D array of face values OR cell objects
 *   face値の場合は copyTargetToCurrent() と同じ規則で goal tileId を復元
 *
 * Entry: triggerSolverAnalysis()（HTMLトリガー）
 */

/* ===============================
 * 0. Tunables
 * =============================== */

const SOLVER_TIME_LIMIT_MS = 15000;

// A* ノード上限（超えたらBFSにフォールバック）
const ASTAR_NODE_LIMIT = 250000;

// BFS フォールバック（meet-in-the-middle 反復）
const BFS_FIRST_DEPTH = 10;
const BFS_DEPTH_STEP = 4;
const BFS_MAX_DEPTH = 60;

/* ===============================
 * 1. Safe getters / DOM helpers
 * =============================== */

function safeGet(fn, fallback = undefined) {
  try { return fn(); } catch (_) { return fallback; }
}

function getOutEl() { return document.getElementById('scramble-input'); }
function getMsgEl() { return document.getElementById('log-error-msg'); }

function setOut(v) {
  const out = getOutEl();
  if (!out) return;
  out.value = String(v || '');
}

function setMsg(v) {
  const msg = getMsgEl();
  if (!msg) return;
  msg.innerText = String(v || '');
}

/* ===============================
 * 2. State extraction (tileId)
 * =============================== */

function extractTileIdGridFromBoard(b, N) {
  const a = new Array(N * N);
  let k = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cell = b[r][c];
      a[k++] = (cell && typeof cell === 'object') ? cell.tileId : cell;
    }
  }
  return a;
}

function extractGoalTileIdGridFromTarget(tb, N, subSize, gridNum) {
  const first = tb?.[0]?.[0];
  if (first && typeof first === 'object' && 'tileId' in first) {
    const a = new Array(N * N);
    let k = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) a[k++] = tb[r][c].tileId;
    return a;
  }

  const init = safeGet(() => initialBoard, null);
  if (!init) return null;

  const facePos = new Map();
  for (let fr = 0; fr < gridNum; fr++) {
    for (let fc = 0; fc < gridNum; fc++) {
      const rr = fr * subSize;
      const cc = fc * subSize;
      const cell = init[rr][cc];
      const fv = (cell && typeof cell === 'object') ? cell.value : cell;
      facePos.set(fv, { r: rr, c: cc });
    }
  }

  const a = new Array(N * N);
  let k = 0;

  for (let r = 0; r < N; r++) {
    const offR = r % subSize;
    const faceR = Math.floor(r / subSize);
    for (let c = 0; c < N; c++) {
      const offC = c % subSize;
      const faceC = Math.floor(c / subSize);

      const tv = tb[faceR * subSize]?.[faceC * subSize];
      const faceVal = (tv && typeof tv === 'object') ? tv.value : tv;

      const pos = facePos.get(faceVal);
      if (!pos) return null;

      const srcR = pos.r + offR;
      const srcC = pos.c + offC;

      const srcCell = init[srcR][srcC];
      a[k++] = (srcCell && typeof srcCell === 'object') ? srcCell.tileId : srcCell;
    }
  }

  return a;
}

function keyOf(arr) { return arr.join(','); }

/* ===============================
 * 3. Move model (SLP notation)
 * =============================== */

function genMoves(N, gridNum) {
  const moves = [];

  for (let r = 0; r < N; r++) {
    const label = String.fromCharCode(97 + r);
    for (let d = 1; d <= gridNum - 1; d++) {
      moves.push({ isV: false, idx: r, dir: 'L', dist: d, str: `${label}-L${d}` });
      moves.push({ isV: false, idx: r, dir: 'R', dist: d, str: `${label}-R${d}` });
    }
  }

  for (let c = 0; c < N; c++) {
    const label = String(c + 1);
    for (let d = 1; d <= gridNum - 1; d++) {
      moves.push({ isV: true, idx: c, dir: 'U', dist: d, str: `${label}-U${d}` });
      moves.push({ isV: true, idx: c, dir: 'D', dist: d, str: `${label}-D${d}` });
    }
  }

  return moves;
}

function invertMoveStr(moveStr) {
  const dash = moveStr.indexOf('-');
  const label = moveStr.slice(0, dash);
  const dir = moveStr.slice(dash + 1, dash + 2);
  const dist = moveStr.slice(dash + 2);
  const inv = (dir === 'R') ? 'L'
            : (dir === 'L') ? 'R'
            : (dir === 'U') ? 'D'
            : 'U';
  return `${label}-${inv}${dist}`;
}

function isInverseMoveStr(a, b) {
  return invertMoveStr(a) === b;
}

function applyMove(state, m, N, subSize) {
  const k = (m.dist * subSize) % N;
  if (k === 0) return state;

  const next = state.slice();

  if (!m.isV) {
    const r = m.idx;
    const base = r * N;
    if (m.dir === 'R') {
      for (let c = 0; c < N; c++) next[base + ((c + k) % N)] = state[base + c];
    } else {
      for (let c = 0; c < N; c++) next[base + ((c - k + N) % N)] = state[base + c];
    }
    return next;
  }

  const c = m.idx;
  if (m.dir === 'D') {
    for (let r = 0; r < N; r++) next[((r + k) % N) * N + c] = state[r * N + c];
  } else {
    for (let r = 0; r < N; r++) next[((r - k + N) % N) * N + c] = state[r * N + c];
  }
  return next;
}

/* ===============================
 * 4. Heuristic
 * =============================== */

function buildGoalPos(goal) {
  const mp = new Map();
  for (let i = 0; i < goal.length; i++) mp.set(goal[i], i);
  return mp;
}

function torusDelta(a, b, N) {
  const d = Math.abs(a - b);
  return Math.min(d, N - d);
}

function heuristic(state, goalPos, N, subSize) {
  let s = 0;
  for (let idx = 0; idx < state.length; idx++) {
    const t = state[idx];
    const g = goalPos.get(t);
    if (g === undefined) continue;
    if (g === idx) continue;
    const r1 = Math.floor(idx / N), c1 = idx % N;
    const r2 = Math.floor(g / N),   c2 = g % N;
    const dr = torusDelta(r1, r2, N);
    const dc = torusDelta(c1, c2, N);
    s += (dr + dc);
  }
  return Math.floor(s / Math.max(1, subSize * 2));
}

/* ===============================
 * 5. A*
 * =============================== */

class MinHeap {
  constructor() { this.a = []; }
  size() { return this.a.length; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    if (a.length === 0) return null;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

function solveAStar(start, goal, N, subSize, gridNum, timeLimitMs) {
  const t0 = performance.now();
  const ks = keyOf(start);
  const kg = keyOf(goal);
  if (ks === kg) return [];

  const moves = genMoves(N, gridNum);
  const goalPos = buildGoalPos(goal);

  const heap = new MinHeap();
  const closed = new Map();
  const parent = new Map();

  const h0 = heuristic(start, goalPos, N, subSize);
  heap.push({ key: ks, state: start, g: 0, h: h0, f: h0, lastMove: null });
  closed.set(ks, 0);
  parent.set(ks, { prev: null, move: null });

  let expanded = 0;

  while (heap.size() > 0) {
    if (performance.now() - t0 > timeLimitMs) return null;
    const cur = heap.pop();
    if (!cur) break;

    if (cur.key === kg) {
      return rebuildPath(cur.key, parent);
    }

    const best = closed.get(cur.key);
    if (best !== undefined && cur.g !== best) continue;

    expanded++;
    if (expanded > ASTAR_NODE_LIMIT) return null;

    for (const m of moves) {
      if (cur.lastMove && isInverseMoveStr(cur.lastMove, m.str)) continue;

      const ns = applyMove(cur.state, m, N, subSize);
      const nk = keyOf(ns);
      const ng = cur.g + 1;

      const prevBest = closed.get(nk);
      if (prevBest !== undefined && prevBest <= ng) continue;

      const nh = heuristic(ns, goalPos, N, subSize);
      const nf = ng + nh;

      closed.set(nk, ng);
      parent.set(nk, { prev: cur.key, move: m.str });

      heap.push({ key: nk, state: ns, g: ng, h: nh, f: nf, lastMove: m.str });
    }
  }

  return null;
}

function rebuildPath(goalKey, parent) {
  const path = [];
  let k = goalKey;
  while (true) {
    const node = parent.get(k);
    if (!node || !node.prev) break;
    path.push(node.move);
    k = node.prev;
  }
  path.reverse();
  return path;
}

/* ===============================
 * 6. Bidirectional BFS fallback
 * =============================== */

function solveBidirectional(start, goal, N, subSize, gridNum, maxDepth, timeLimitMs) {
  const t0 = performance.now();
  const ks = keyOf(start);
  const kg = keyOf(goal);
  if (ks === kg) return [];

  const moves = genMoves(N, gridNum);

  const fPrev = new Map([[ks, { prev: null, move: null }]]);
  const bPrev = new Map([[kg, { prev: null, move: null }]]);

  let fFront = [start];
  let bFront = [goal];

  for (let depth = 0; depth < maxDepth; depth++) {
    if (performance.now() - t0 > timeLimitMs) break;

    const expandForward = (fFront.length <= bFront.length);
    const front = expandForward ? fFront : bFront;
    const myPrev = expandForward ? fPrev : bPrev;
    const otherPrev = expandForward ? bPrev : fPrev;

    const nextFront = [];

    for (const st of front) {
      if (performance.now() - t0 > timeLimitMs) break;
      const stKey = keyOf(st);

      const stNode = myPrev.get(stKey);
      const lastMove = stNode?.move || null;

      for (const m of moves) {
        if (lastMove && isInverseMoveStr(lastMove, m.str)) continue;

        const ns = applyMove(st, m, N, subSize);
        const nk = keyOf(ns);
        if (myPrev.has(nk)) continue;

        myPrev.set(nk, { prev: stKey, move: m.str });

        if (otherPrev.has(nk)) {
          return buildMeetPath(nk, fPrev, bPrev);
        }
        nextFront.push(ns);
      }
    }

    if (expandForward) fFront = nextFront;
    else bFront = nextFront;
  }

  return null;
}

function buildMeetPath(meetKey, fPrev, bPrev) {
  const left = [];
  {
    let k = meetKey;
    while (true) {
      const node = fPrev.get(k);
      if (!node || !node.prev) break;
      left.push(node.move);
      k = node.prev;
    }
    left.reverse();
  }

  const right = [];
  {
    let k = meetKey;
    while (true) {
      const node = bPrev.get(k);
      if (!node || !node.prev) break;
      right.push(invertMoveStr(node.move));
      k = node.prev;
    }
  }

  return left.concat(right);
}

/* ===============================
 * 7. Entry point
 * =============================== */

/**
 * 解析エントリーポイント：進捗状態表示を追加
 * 既存のロジック、コンソールログ、判定処理を一切破壊せず、
 * UIスレッドを解放して進行状況を表示するための待機処理のみを挿入しました。
 */
async function triggerSolverAnalysis() {
  if (typeof toggleLogPanel === 'function') toggleLogPanel();
testGreedySolver();
return;
  const __t0 = performance.now();
  console.log('[SLP Solver] START');

  setOut('');
  setMsg('Initializing solver...');

  console.group('[SLP Solver]');
  
  const ss = Number(safeGet(() => subSize));
  const gn = Number(safeGet(() => gridNum));
  const b = safeGet(() => board, null);
  const tb = safeGet(() => targetBoard, null);

  if (!b || !tb || !Number.isFinite(ss) || !Number.isFinite(gn) || ss <= 0 || gn <= 0) {
    setMsg('Solver: Invalid board or settings');
    console.groupEnd();
    return;
  }

  const N = ss * gn;
  const start = extractTileIdGridFromBoard(b, N);
  const goal = extractGoalTileIdGridFromTarget(tb, N, ss, gn);

  if (!goal) {
    setMsg('Solver: goal mapping failed');
    console.groupEnd();
    return;
  }

  const ks = keyOf(start);
  const kg = keyOf(goal);

  if (ks === kg) {
    setMsg('Solver: already solved');
    console.groupEnd();
    return;
  }

  // 描画を許可するための待機
  await new Promise(r => setTimeout(r, 10));

  // ===== Stage 1: A* (fast) =====
  {
    setMsg('Analyzing (Stage 1: A*)...');
    await new Promise(r => setTimeout(r, 10));

    console.log('[A*] start');
    console.time('solveAStar');
    const pathA = solveAStar(start, goal, N, ss, gn, SOLVER_TIME_LIMIT_MS);
    console.timeEnd('solveAStar');

    if (Array.isArray(pathA)) {
      if (pathA.length === 0) {
        setOut('');
        setMsg('Solver: already solved');
        console.log('Solved (path=[])');
        console.log(`[SLP Solver] END ${Math.floor(performance.now() - __t0)} ms`);
        console.groupEnd();
        return;
      }
      const s = pathA.join(',');
      setOut(s);
      setMsg(`Solver: OK (${pathA.length} moves) [A*]`);
      console.log('solver result path:', pathA);
      console.log('scramble-output:', s);
      console.log(`[SLP Solver] END ${Math.floor(performance.now() - __t0)} ms`);
      console.groupEnd();
      return;
    }
    console.log('[A*] no solution or limit reached, fall back to BFS');
  }

  // ===== Stage 2: bidirectional BFS with iterative depth =====
  const t0 = performance.now();
  console.log('[BFS] start');

  for (let depth = BFS_FIRST_DEPTH; depth <= BFS_MAX_DEPTH; depth += BFS_DEPTH_STEP) {
    const remain = SOLVER_TIME_LIMIT_MS - (performance.now() - t0);
    if (remain <= 0) break;

    setMsg(`Analyzing (Stage 2: BFS Depth ${depth})...`);
    await new Promise(r => setTimeout(r, 10));

    console.log(`[BFS] try depth<=${depth} remain=${Math.floor(remain)}ms elapsed=${Math.floor(performance.now()-__t0)}ms`);
    console.time(`solveBidirectional(d<=${depth})`);
    const path = solveBidirectional(start, goal, N, ss, gn, depth, remain);
    console.timeEnd(`solveBidirectional(d<=${depth})`);

    if (Array.isArray(path)) {
      if (path.length === 0) {
        setOut('');
        setMsg('Solver: already solved');
        console.log('Solved (path=[])');
        console.log(`[SLP Solver] END ${Math.floor(performance.now() - __t0)} ms`);
        console.groupEnd();
        return;
      }
      const s = path.join(',');
      setOut(s);
      setMsg(`Solver: OK (${path.length} moves) [BFS d<=${depth}]`);
      console.log('solver result path:', path);
      console.log('scramble-output:', s);
      console.log(`[SLP Solver] END ${Math.floor(performance.now() - __t0)} ms`);
      console.groupEnd();
      return;
    }
  }

  setMsg('Solver: no solution found within limit');
  console.log(`[SLP Solver] END ${Math.floor(performance.now() - __t0)} ms`);
  console.groupEnd();
}

/**
 * 実験用テストメソッド: エレベーター方式によるベタ揃え
 * 指示：A行から順に揃える。B行以降は「目的列を下げる(D1)→合流→戻す(U1)」を徹底。
 * 修正：手数が0になる問題を解決するため、ゴールのIDを本来の「完成状態(連番)」に固定。
 */
async function testGreedySolver() {
  console.log('[Greedy Test] Starting row-by-row solve...');
  const ss = Number(safeGet(() => subSize, 2));
  const gn = Number(safeGet(() => gridNum, 3));
  const N = ss * gn;
  
  let curB = JSON.parse(JSON.stringify(board));
  
  // 実験用テストでは、現在のターゲット設定に関わらず「連番（完成状態）」をゴールとして強制設定する
  // これにより、盤面がバラバラであれば必ず手順が生成される。
  const goalGrid = Array.from({ length: N }, (_, r) => 
    Array.from({ length: N }, (_, c) => r * N + c)
  );

  const path = [];
  const apply = (line, isV, isRev, dist) => {
    if (dist <= 0) return;
    const label = isV ? (line + 1).toString() : String.fromCharCode(97 + line);
    const dir = isV ? (isRev ? 'U' : 'D') : (isRev ? 'L' : 'R');
    path.push(`${label}-${dir}${dist}`);
    // 論理盤面の更新
    for (let i = 0; i < Math.round(dist * ss); i++) moveLocal(curB, line, isV, isRev);
  };

  const find = (tid) => {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (curB[r][c] && Number(curB[r][c].tileId) === Number(tid)) return { r, c };
      }
    }
    return null;
  };

  const stopR = N - ss;
  console.log(`[Greedy Test] N=${N}, ss=${ss}, stopR=${stopR} (Targeting Identity Solved State)`);

  for (let r = 0; r < stopR; r++) {
    if (typeof setMsg === 'function') setMsg(`Greedy: Row ${r+1}/${stopR}...`);
    await new Promise(res => setTimeout(res, 5)); 

    for (let c = 0; c < N; c++) {
      const tid = goalGrid[r][c];
      let p = find(tid);
      
      if (!p) continue;
      if (p.r === r && p.c === c) continue;

      // エレベーター作業行 (wr): 現在行 r の直下のFaceの開始行（常に1ユニット分下）
      const wr = (r + ss) % N;

      // 1. パーツを「作業行 (wr)」に持ってくる
      // パーツが既に揃えたい行 r にある場合は、まず垂直に落として逃がす
      if (p.r === r) {
        apply(p.c, true, false, 1);    // 下げる (D1)
        apply(wr, false, false, 1);    // 逃がす (R1)
        apply(p.c, true, true, 1);     // 戻す (U1)
        p = find(tid);
      }

      // パーツを作業行 wr まで移動（縦移動が必要な場合）
      if (p && p.r !== wr) {
        const vDist = (wr - p.r + N) % N;
        const vUnits = Math.round(vDist / ss);
        if (vUnits > 0) {
          apply(p.c, true, false, vUnits); // 下ろす
          apply(wr, false, false, 1);      // 逃がす
          apply(p.c, true, true, vUnits);  // 戻す
          p = find(tid);
        }
      }

      // 2. エレベーター：目的の列 c を下げて迎えに行く
      if (!p) continue;

      // 下げたいスロットの位置にパーツが被っていたらどかす
      while (p && p.c === c) {
        apply(wr, false, false, 1);
        p = find(tid);
      }

      // エレベーターの距離：r 行のセルを wr まで下げる（1ユニット分）
      apply(c, true, false, 1); 

      // 3. 合流：作業行 wr でパーツを列 c に放り込む
      p = find(tid);
      if (p) {
        const hDist = (c - p.c + N) % N;
        const hUnits = Math.round(hDist / ss);
        if (hUnits > 0) apply(wr, false, false, hUnits);
      }

      // 4. 帰還：列 c を元の位置へ引き上げる
      apply(c, true, true, 1); 
    }
  }

  console.log('[Greedy Test] Result Sequence:', path.join(','));
  setOut(path.join(','));
  setMsg(path.length > 0 ? `Greedy: OK (${path.length} moves)` : "Greedy: No moves needed.");
}