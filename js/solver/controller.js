/** solver/controller.js — responsibility described in docs/architecture.md. */

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
 * 7. Entry point
 * =============================== */

/**
 * 解析エントリーポイント：タイマー停止処理とログ保存タイミングの修正、およびフリーズ防止策を適用
 */
async function triggerSolverAnalysis() {
  if (typeof toggleLogPanel === 'function') toggleLogPanel();

  // 解析開始時にプレイタイマーを停止（「Timerが切れてない」問題の修正）
  if (typeof toggleTimer === 'function' && timerId) {
    toggleTimer(false);
  }

  const __t0 = performance.now();
  console.log('[SLP Solver] START');

  setOut('');
  setMsg('Initializing solver...');

  console.group('[SLP Solver]');

  const ss = Number(safeGet(() => subSize));
  const gn = Number(safeGet(() => gridNum));
  const b = safeGet(() => board, null);
  const tb = safeGet(() => targetBoard, null);
  const n = ss * gn;

  const modeKey = `${ss}-${n}`;
  console.log(`[FSB Dispatcher] Mode: ${modeKey}`);

  switch (modeKey) {
    case '2-6':
    case '3-6':
    case '3-9':
    case '2-8':
      // testGreedySolver内でsaveSystemLog_CPUが実行されるため、そのままreturn
      await testGreedySolver();
      return;
    case '2-4':
      console.log(`Using BFS Search for ${modeKey}.`);
      break;
    default:
  }

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

  // 描画更新のための待機
  await new Promise(r => setTimeout(r, 16));

  // ===== Stage 1: A* (fast) =====
  {
    setMsg('Analyzing (Stage 1: A*)...');
    await new Promise(r => setTimeout(r, 10));

    console.log('[A*] start');
    const pathA = solveAStar(start, goal, N, ss, gn, SOLVER_TIME_LIMIT_MS);

    if (Array.isArray(pathA)) {
      if (pathA.length === 0) {
        setOut('');
        setMsg('Solver: already solved');
        console.groupEnd();
        return;
      }
      const s = pathA.join(',');
      setOut(s);
      setMsg(`Solver: OK (${pathA.length} moves) [A*]`);

      // 成功時：return前に確実にログを保存
      saveSystemLog_CPU();

      console.log(`[SLP Solver] END ${Math.floor(performance.now() - __t0)} ms`);
      console.groupEnd();
      return;
    }
  }

  // ===== Stage 2: bidirectional BFS (2-4等で使用) =====
  const t0 = performance.now();
  console.log('[BFS] start');

  for (let depth = BFS_FIRST_DEPTH; depth <= BFS_MAX_DEPTH; depth += BFS_DEPTH_STEP) {
    const remain = SOLVER_TIME_LIMIT_MS - (performance.now() - t0);
    if (remain <= 0) break;

    setMsg(`Analyzing (Stage 2: BFS Depth ${depth})...`);
    // CPU負荷が高いため、ループ毎にUIスレッドを解放してフリーズを防止
    await new Promise(r => setTimeout(r, 30));

    const path = solveBidirectional(start, goal, N, ss, gn, depth, remain);

    if (Array.isArray(path)) {
      const s = path.join(',');
      setOut(s);
      setMsg(`Solver: OK (${path.length} moves) [BFS d<=${depth}]`);

      // 成功時：BFSの結果を確実にログに保存
      saveSystemLog_CPU();

      console.log(`[SLP Solver] END ${Math.floor(performance.now() - __t0)} ms`);
      console.groupEnd();
      return;
    }
  }

  setMsg('Solver: no solution found within limit');
  console.log(`[SLP Solver] END ${Math.floor(performance.now() - __t0)} ms`);
  console.groupEnd();

  // 失敗時でも必要があれば状態を保存（Scramble Boxが空ならsave内で弾かれる）
  saveSystemLog_CPU();
}

