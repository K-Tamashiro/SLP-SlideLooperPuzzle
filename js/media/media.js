/** media/media.js — responsibility described in docs/architecture.md. */

/**
 * V2メディアパネルの表示/非表示を切り替え
 */
function toggleV2Panel() {
    const panel = document.getElementById('v2-media-uploader');
    const toggleBtn = document.getElementById('v2-panel-toggle');
    const rotateBtn = document.getElementById('rotate-btn'); 
    
    if (!panel || !toggleBtn) return;

    // 現在のパネルの表示/非表示を判定
    const isHidden = (panel.style.display === 'none' || panel.style.display === '');

    if (isHidden) {
        // 画像パネルを開く
        panel.style.display = 'block';
        toggleBtn.classList.add('active');

    } else {
        // 画像パネルを閉じる
        panel.style.display = 'none';
        toggleBtn.classList.remove('active');
    }
    resetColorTargetView();

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
        // インスタンスがなければ生成
        if (!window.rotationManager) {
            window.rotationManager = new RotationManager(file.type.startsWith('video/') ? 'video' : 'image');
        }
        // 1. 新規ロード前に、現在の描画ループとメモリを完全に「更地」にする
        this.stopDrawingLoop();
        document.querySelectorAll('.ghost-strip').forEach(el => el.remove());
        
        if (this.mediaElement instanceof HTMLVideoElement) {
            this.mediaElement.pause();
            this.mediaElement.src = ""; // 物理的に切断
            this.mediaElement.load();
        }

        const oldUrl = this.mediaSrc;
        const newUrl = URL.createObjectURL(file);
        this.mediaSrc = newUrl;

        try {
            if (file.type.startsWith('image/')) {
                this.mode = 'image';
                const img = new Image();
                img.src = newUrl;
                await img.decode();
                this.mediaElement = img;
                if (typeof updateV2StatusUI === 'function') updateV2StatusUI('image');
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
                if (typeof updateV2StatusUI === 'function') updateV2StatusUI('video');
                this.startDrawingLoop();
            }
            // --- メディア選択時に回転ギミックを強制OFF & ロック ---
            if (rotateTimerId) {
                stopRotateIntervalOnly(); // 実行中のタイマー停止
            }

            // --- メディア選択時にフラッシュを強制ONにする ---
            window.isFlashMode = true;
            const flashBtn = document.querySelector('button[onclick="toggleFlash()"]');
            if (flashBtn) flashBtn.classList.add('active-toggle');
            // --------------------------------------------------

            // 2. 盤面のタイルを物理的に一度リセットしてから再描画
            const board = document.getElementById('board');
            if (board) board.innerHTML = ''; 
            
            setInterfaceLock(!!timerId);

            renderPreview();
            render();

        } catch (e) {
            console.error("Media setup failed:", e);
            window.resetToColorMode();
        } finally {
            // 3. 古いURLの破棄を、DOMが完全に書き換わるまで十分に遅らせる
            if (oldUrl && oldUrl !== newUrl) {
                setTimeout(() => {
                    try { URL.revokeObjectURL(oldUrl); } catch(err) {}
                }, 1000);
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
        if (v.readyState < 2) return;

        const canvases = document.querySelectorAll('.video-tile-canvas');
        const totalCells = subSize * gridNum;
        const minSide = Math.min(v.videoWidth, v.videoHeight);
        
        // sx0, sy0 を定義
        const sx0 = (v.videoWidth - minSide) / 2;
        const sy0 = (v.videoHeight - minSide) / 2;
        const step = minSide / totalCells;

        canvases.forEach(canvas => {
            const ctx = canvas.getContext('2d', { alpha: false });
            const cellEl = canvas.closest('.cell');
            const r = parseInt(cellEl.dataset.row);
            const c = parseInt(cellEl.dataset.col);
            
            const piece = board[r][c];
            const tId = piece.tileId; // 現在この位置にいるパーツの固有ID
            
            const totalCells = subSize * gridNum;
            const origAbsR = Math.floor(tId / totalCells);
            const origAbsC = tId % totalCells;

            const v = this.mediaElement;
            const minSide = Math.min(v.videoWidth, v.videoHeight);
            const sx0 = (v.videoWidth - minSide) / 2;
            const sy0 = (v.videoHeight - minSide) / 2;
            const step = minSide / totalCells;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            window.rotationManager.render(
                ctx, piece, v, 
                0, 0, canvas.width, canvas.height,
                sx0 + (origAbsC * step), sy0 + (origAbsR * step), step, step
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
    const file = e.target.files[0];
    if (!file || !window.mediaManager) return;

    // 1. セットアップを実行
    await window.mediaManager.setupMedia(file);
    
    // 2. ★最重要：inputの値を空にする（これで同じファイルを2回目も選べるようになる）
    e.target.value = '';

    // 3. UIパネルの制御（開いていれば閉じる）
    const vPanel = document.getElementById('v2-video-uploader');
    const iPanel = document.getElementById('v2-media-uploader');
    if (vPanel && vPanel.style.display !== 'none') toggleVideoPanel();
    if (iPanel && iPanel.style.display !== 'none') toggleV2Panel();
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

