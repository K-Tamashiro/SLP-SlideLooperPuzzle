/** state.js — responsibility described in docs/architecture.md. */

window.isFlashMode = false;

// --- グローバル変数 ---
let subSize = 2;

let gridNum = 3;

let board = [];

let targetBoard = null;

let solveHistory = [];

let cellSizePixel = 42;

let GAP_FACE = 10;

const GAP_CELL = 2;

let startX = 0, startY = 0, isDragging = false, moveMode = 'standard';

let activeRow = -1, activeCol = -1, dragAxis = null, currentTranslate = 0;

let ghostStrips = [];

let longPressTimer = null;

const LONG_PRESS_MS = 250;

let moveCount = 0;

let startTime = 0;

let timerId = null;

let rotateTimerId = null;

let isLogEnabled = true;

let skipCompleteOnce = false;

let completeTimerId = null;

// 解析用の初期状態を保存する変数
window.initialAnalyzeBoard = null;

window.isTargetScrambled = false;

window.elapsedTime = 0;

window.boardRotationDegree = 0;

window.viewNumber = false;

window.debugmode = false;

window.isAnimating = false;

window.initialBoardSnapshot = null;

window.boardWrapper = null;
