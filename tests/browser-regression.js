/* Browser integration test. Runs only when explicitly opened and started. */
const output = document.getElementById('result');
const frames = ['baseline', 'current'].map(id => document.getElementById(id));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

function initialize(w, mode) {
    let seed = 12345;
    w.Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    w.playSound = () => {};
    w.mediaManager.mode = 'color';
    w.mediaManager.mediaSrc = null;
    w.viewNumber = false;
    w.isFlashMode = false;
    w.document.getElementById('mode-select').value = mode;
    w.handleModeChange(mode);
    w.toggleMenu(false);
    w.document.getElementById('log-overlay').style.display = 'none';
    w.document.getElementById('media-controls').classList.remove('active');
    w.document.getElementById('v2-media-uploader').style.display = 'none';
    w.document.getElementById('v2-video-uploader').style.display = 'none';
}

function snapshot(w, ghostsOnly = false) {
    w.document.getAnimations().forEach(animation => animation.finish());
    const selector = ghostsOnly ? '.ghost-strip, .ghost-strip *' :
        'body, .main-header, .title-container, .title-text, .header-side-right, #menu-dots, .menu-panel, .menu-panel *, .content-wrapper, .game-area, .board-wrapper, #board, .face, .cell, .cell *, .axis-h, .axis-v, .coord-label, .side-panel, .side-panel *, .hint, .key-indicator, #media-controls, #media-controls *, #log-overlay, .log-panel, .log-panel *, #v2-media-uploader, #v2-media-uploader *, #v2-video-uploader, #v2-video-uploader *';
    return [...w.document.querySelectorAll(selector)].map(el => {
        const rect = el.getBoundingClientRect();
        const style = w.getComputedStyle(el);
        const properties = {};
        for (const property of style) properties[property] = style.getPropertyValue(property);
        return { tag:el.tagName, id:el.id, rect:[rect.x,rect.y,rect.width,rect.height].map(n=>Math.round(n*100)/100), properties };
    });
}

function compare(a, b, label) {
    if (a.length !== b.length) throw Error(`${label}: element count ${a.length} != ${b.length}`);
    for (let i = 0; i < a.length; i++) {
        if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
            const keys = [...new Set([...Object.keys(a[i].properties), ...Object.keys(b[i].properties)])];
            const differences = keys.filter(k => a[i].properties[k] !== b[i].properties[k]).map(k=>`${k}: ${a[i].properties[k]} → ${b[i].properties[k]}`);
            throw Error(`${label}: #${i} ${a[i].tag} ${a[i].id}\nrect: ${a[i].rect} → ${b[i].rect}\n${differences.slice(0,12).join('\n')}`);
        }
    }
}

document.getElementById('run').onclick = async () => {
    const button = document.getElementById('run');
    button.disabled = true;
    const results = [];
    const windows = frames.map(frame => frame.contentWindow);
    try {
        for (const w of windows) {
            // Separate memory-only history storage for each test frame.
            const memory = new Map();
            Object.defineProperty(w, 'localStorage', { configurable:true, value:{
                getItem:key=>memory.get(key) ?? null, setItem:(key,value)=>memory.set(key,String(value)), removeItem:key=>memory.delete(key)
            } });
        }
        for (const width of [1200, 390]) {
            frames.forEach(frame => { frame.style.width = `${width}px`; });
            await nextFrame(); await nextFrame();
            for (const mode of ['easy','mid','difficult','hard','advance']) {
                windows.forEach(w => initialize(w, mode));
                const label = `${width}px / ${mode}`;
                const check = (state, ghostsOnly = false) => {
                    compare(snapshot(windows[0],ghostsOnly),snapshot(windows[1],ghostsOnly),`${label} / ${state}`);
                    results.push(`${label} / ${state}: PASS`);
                    output.textContent = results.join('\n');
                };
                check('initial');
                windows.forEach(w => w.toggleMenu(true)); check('menu');
                windows.forEach(w => w.toggleMenu(false));
                windows.forEach(w => w.toggleLogPanel()); check('history');
                windows.forEach(w => w.toggleLogPanel());
                windows.forEach(w => { w.document.getElementById('v2-media-uploader').style.display='block'; }); check('image panel');
                windows.forEach(w => { w.document.getElementById('v2-media-uploader').style.display='none'; w.document.getElementById('v2-video-uploader').style.display='block'; }); check('video panel');
                windows.forEach(w => { w.document.getElementById('v2-video-uploader').style.display='none'; w.toggleNumberView(); }); check('number labels');

                for (const frameMove of [false,true]) for (const vertical of [false,true]) {
                    for (const w of windows) {
                        const cell = w.document.querySelector('#board > .face > .cell');
                        const r = cell.getBoundingClientRect();
                        cell.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,clientX:r.x+5,clientY:r.y+5,shiftKey:frameMove}));
                        w.dispatchEvent(new w.MouseEvent('mousemove',{clientX:r.x+5+(vertical?0:35),clientY:r.y+5+(vertical?35:0)}));
                    }
                    check(`drag ${frameMove?'frame':'single'} ${vertical?'vertical':'horizontal'}`,true);
                    for (const w of windows) {
                        w.resetDragState(); w.updateFrameHighlight(false);
                        if (w.document.querySelector('.ghost-strip')) throw Error('Ghost not removed');
                    }
                }
                for (const vertical of [false,true]) {
                    const animations = windows.map(w=>w.animateAnalyzeMove({type:'FRAME',lineIndices:Array.from({length:w.eval('subSize')},(_,i)=>i),isV:vertical,dir:vertical?'D':'R',dist:1},false));
                    check(`replay ${vertical?'vertical':'horizontal'}`,true);
                    await Promise.all(animations);
                    check(`replay cleanup ${vertical?'vertical':'horizontal'}`);
                    for (const w of windows) if (w.isAnimating || w.document.querySelector('.ghost-strip')) throw Error('Replay cleanup failed');
                    if (windows[0].eval('JSON.stringify(board)') !== windows[1].eval('JSON.stringify(board)')) throw Error('Replay board differs');
                }
                // Canvas-backed tile snapshots: both image and video use this ghost path.
                windows.forEach(w => {
                    w.document.querySelectorAll('#board > .face > .cell').forEach(cell => {
                        const canvas=w.document.createElement('canvas'); canvas.width=canvas.height=8;
                        const ctx=canvas.getContext('2d'); ctx.fillStyle='#f00'; ctx.fillRect(0,0,4,8); ctx.fillStyle='#00f'; ctx.fillRect(4,0,4,8);
                        cell.appendChild(canvas);
                    });
                    w.handleStart(0,0,0,0,0,'mouse',{shiftKey:true}); w.handleMove(35,0);
                });
                check('canvas ghosts',true);
                windows.forEach(w=>{w.resetDragState();w.updateFrameHighlight(false);});
            }
        }
        // Touch long-press and committed movement, after the visual scenarios.
        for (const frameMove of [false,true]) for (const vertical of [false,true]) {
            windows.forEach(w=>initialize(w,'mid'));
            windows.forEach(w=>w.handleStart(0,0,0,0,0,'touch',{}));
            if (frameMove) await delay(270);
            windows.forEach(w=>w.handleMove(vertical?0:120,vertical?120:0));
            compare(snapshot(windows[0],true),snapshot(windows[1],true),'touch ghosts');
            windows.forEach(w=>w.endDrag());
            await delay(150);
            windows.forEach(w=>w.toggleTimer(false));
            if (windows[0].eval('JSON.stringify(board)') !== windows[1].eval('JSON.stringify(board)')) throw Error('Touch move result differs');
            for (const w of windows) if (w.document.querySelector('.ghost-strip')) throw Error('Touch ghost remained');
            results.push(`touch ${frameMove?'frame':'single'} ${vertical?'vertical':'horizontal'}: PASS`);
        }
        // An execution error must not strand replay ghosts or leave input locked.
        const current=windows[1], execute=current.executeGroupedMove;
        current.executeGroupedMove=()=>{throw Error('expected test error');};
        let rejected=false;
        try { await current.animateAnalyzeMove({type:'SINGLE',lineIndices:[0],isV:false,dir:'R',dist:1},false); }
        catch(error) { rejected=error.message==='expected test error'; }
        finally { current.executeGroupedMove=execute; }
        if (!rejected || current.isAnimating || current.document.querySelector('.ghost-strip')) throw Error('Error cleanup failed');
        results.push('replay error cleanup: PASS');
        output.textContent = `PASS: ${results.length} checks (150 computed-style/rectangle comparisons + touch/error checks)\n`+results.join('\n');
    } catch (error) {
        output.textContent = `FAIL after ${results.length} comparisons\n${error.stack}\n`+results.join('\n');
    } finally { button.disabled=false; }
};
