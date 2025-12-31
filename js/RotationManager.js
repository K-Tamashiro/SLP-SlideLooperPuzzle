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
// RotationManager.js
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

// グローバルまたはモジュールとしてエクスポート
window.RotationManager = RotationManager;
