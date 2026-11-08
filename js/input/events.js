/** Keyboard and pointer event binding. */

function toggleSideNavByKey(show) {
    const btns = document.querySelectorAll('.neon-yellow-btn');

    // CTRL押下/離脱時の状態管理
    if (show) {
        if (typeof window.initPlaybackState === 'function') {
            window.initPlaybackState();
        }
    } else {
        if (typeof window.clearPlaybackState === 'function') {
            window.clearPlaybackState();
        }
    }

    btns.forEach(btn => {
        btn.style.display = show ? 'flex' : 'none';

        if (show) {
            const title = btn.getAttribute('title') || '';
            const pbState = window._pbState;

            // 状態がまだない場合のフォールバック（通常はinitで生成済み）
            if (!pbState) {
                const logElement = document.getElementById('solve-log');
                const hasLog = logElement && logElement.value.trim().length > 0;

                if (title.indexOf('Next') !== -1) btn.disabled = true;
                if (title.indexOf('Prev') !== -1) btn.disabled = !hasLog;
                return;
            }

            // Nextボタン制御
            if (title.indexOf('Next') !== -1) {
                btn.disabled = (pbState.redoStack.length === 0);
            }

            // Prevボタン制御
            if (title.indexOf('Prev') !== -1) {
                btn.disabled = (pbState.logicalIndex <= 0);
            }
        }
    });
}

function updateKeyIndicator(e, isActive) {
    const indicators = document.querySelectorAll('.key-indicator');
    indicators.forEach(el => {
        const keyText = el.innerText.toUpperCase();
        if ((keyText === 'SHIFT' && e.key === 'Shift') || (keyText === 'CTRL' && e.key === 'Control')) {
            el.classList.toggle('key-active', isActive);
        }
    });
}

function bindInputEvents() {
    window.addEventListener('keydown', (e) => {
        updateKeyIndicator(e, true);
        if (e.key === 'Control') {
            toggleSideNavByKey(true);
        }
    });

    window.addEventListener('keyup', (e) => {
        updateKeyIndicator(e, false);
        if (e.key === 'Control') {
            toggleSideNavByKey(false);
        }
    });

    window.addEventListener('blur', () => {
        document.querySelectorAll('.key-indicator').forEach(el => el.classList.remove('key-active'));
        // フォーカスが外れたら連動表示も解除
        toggleSideNavByKey(false);
    });

    window.onmousemove = (e) => {
        // 1. ボードのスライド操作を復旧
        if (isDragging) {
            handleMove(e.clientX, e.clientY);
        }

        // 2. サーチライトがONなら追従
        if (window.isSearchlightMode) {
            updateSearchlight(e.clientX, e.clientY);
        }
    };

    window.onmouseup = () => {
        if (typeof endDrag === 'function') endDrag();
        if (typeof stopContinuousStep === 'function') stopContinuousStep();
        if (window.isSearchlightMode) {
            document.getElementById('searchlight-overlay')?.classList.remove('searchlight-active');
        }
    };

    window.ontouchmove = (e) => {
        if (!isDragging) return;

        const touches = e.touches;
        const curX = touches[0].clientX;
        const curY = touches[0].clientY;

        if (touches.length >= 2) {
            // --- 2本指以上の時：スポットライト移動のみ ---
            if (e.cancelable) e.preventDefault();

            // パズルのドラッグ計算をスキップし、サーチライト座標のみ更新
            updateSearchlight(curX, curY);
        } else {
            // --- 1本指の時：通常のスライド操作 ＋ スポットライト追従 ---
            if (e.cancelable) e.preventDefault();
            handleMove(curX, curY);
            updateSearchlight(curX, curY);
        }
    };

    window.ontouchend = () => {
        if (typeof endDrag === 'function') endDrag();
        if (typeof stopContinuousStep === 'function') stopContinuousStep();
        if (window.isSearchlightMode) {
            document.getElementById('searchlight-overlay')?.classList.remove('searchlight-active');
        }
    };

    // HTMLの並び順（0番目がBack、2番目がNext）で取得
    const mBtns = document.querySelectorAll('.m-group .m-btn');

    const backBtn = mBtns[0];

    const nextBtn = mBtns[2];

    if (backBtn && nextBtn) {
        const touchOpts = { passive: true };

        // PC用クリック開始
        backBtn.addEventListener('mousedown', () => startContinuousStep('back'));
        nextBtn.addEventListener('mousedown', () => startContinuousStep('next'));

        // スマホ用タッチ開始（ご提示の長押し開始ロジック）
        backBtn.addEventListener('touchstart', () => startContinuousStep('back'), touchOpts);
        nextBtn.addEventListener('touchstart', () => startContinuousStep('next'), touchOpts);

        // 画面のどこで指/マウスを離しても確実に止める
        // window.stopContinuousStep ではなく、定義済みの stopContinuousStep を直接参照
        ['mouseup', 'touchend', 'touchcancel'].forEach(evt => {
            window.addEventListener(evt, stopContinuousStep, touchOpts);
        });
    }
}
