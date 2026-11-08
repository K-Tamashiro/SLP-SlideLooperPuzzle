const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function mediaFixtures(w) {
    const canvas=w.document.createElement('canvas');
    canvas.width=canvas.height=160;
    const ctx=canvas.getContext('2d');
    for(let i=0;i<16;i++) {
        ctx.fillStyle=`hsl(${i*23} 80% 50%)`;ctx.fillRect(i%4*40,Math.floor(i/4)*40,40,40);
        ctx.fillStyle='black';ctx.fillText(String(i),i%4*40+10,Math.floor(i/4)*40+20);
    }
    const png=await new Promise(resolve=>canvas.toBlob(resolve));
    const stream=canvas.captureStream(10), chunks=[];
    const recorder=new w.MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
    const stopped=new Promise(resolve=>recorder.onstop=resolve);
    recorder.ondataavailable=e=>chunks.push(e.data);
    recorder.start();
    for(let i=0;i<8;i++){ctx.fillStyle=i%2?'white':'black';ctx.fillRect(0,0,5,5);await wait(100);}
    recorder.stop();await stopped;
    stream.getTracks().forEach(track=>track.stop());
    return {image:new w.File([png],'fixture.png',{type:'image/png'}),video:new w.File(chunks,'fixture.webm',{type:recorder.mimeType})};
}

async function solveByDrag(w) {
    w.executeSingleMove('a-R1',false,true);w.render();
    const cell=w.document.querySelector('.cell'), rect=cell.getBoundingClientRect();
    const x=rect.x+10,y=rect.y+10,unit=w.eval('GhostLayer.slideUnit()');
    cell.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,clientX:x,clientY:y}));
    w.dispatchEvent(new w.MouseEvent('mousemove',{clientX:x-unit,clientY:y}));
    w.dispatchEvent(new w.MouseEvent('mouseup'));await wait(180);
    if(!w.eval('timerId===null'))throw Error('Timer still running');
    if(w.getComputedStyle(w.document.getElementById('status-board')).display!=='flex')throw Error('COMPLETE invisible');
}
document.getElementById('run').onclick = async () => {
    const w = document.getElementById('game').contentWindow;
    const output = document.getElementById('result');
    const results = [];
    const memory = new Map();
    Object.defineProperty(w, 'localStorage', {configurable:true, value:{
        getItem:k=>memory.get(k)??null, setItem:(k,v)=>memory.set(k,String(v)), removeItem:k=>memory.delete(k)
    }});
    try {
        for (const mode of ['easy','mid','difficult','hard','advance']) for (const replay of [false,true]) {
            w.handleModeChange(mode);
            w.copyTargetToCurrent();
            w.setLogState(true);
            w.isReplayMode = replay;
            // A legal move away from the target, followed by a real mouse drag back.
            w.executeSingleMove('a-R1',false,true);
            w.render();
            const cell = w.document.querySelector('.cell');
            const rect = cell.getBoundingClientRect();
            const x=rect.x+10, y=rect.y+10, unit=w.GhostLayer?.slideUnit?.() || w.eval('GhostLayer.slideUnit()');
            cell.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,clientX:x,clientY:y}));
            w.dispatchEvent(new w.MouseEvent('mousemove',{clientX:x-unit,clientY:y}));
            w.dispatchEvent(new w.MouseEvent('mouseup'));
            await wait(200);
            if (!w.eval('timerId===null')) throw Error('Timer still running');
            for (const id of ['status-board']) {
                const el=w.document.getElementById(id);
                if (!el.classList.contains('show') || w.getComputedStyle(el).display!=='flex') throw Error(`${id} invisible`);
            }
            if (!JSON.parse(memory.get('slp_history')).at(-1).is_complete) throw Error('Completion not saved');
            if (w.document.querySelector('.ghost-strip')) throw Error('Ghost remains');
            results.push(`${mode}, after replay=${replay}: PASS`);
            w.hideCompleteDisplay();
        }
        const files=await mediaFixtures(w);
        for(const media of ['image','video']) {
            await w.mediaManager.setupMedia(files[media]);
            if(w.mediaManager.mode!==media)throw Error(`${media} load failed`);
            for(const mode of ['easy','mid','difficult','hard','advance']) for(let turns=0;turns<4;turns++) {
                output.textContent=`Running ${media} ${mode} ${turns*90} degrees\n${results.join('\n')}`;
                w.handleModeChange(mode);w.setLogState(false);
                for(let i=0;i<turns;i++){w.rotateBoard();await wait(450);}
                w.setLogState(true);
                await solveByDrag(w);
                if(!JSON.parse(memory.get('slp_history')).at(-1).is_complete)throw Error('Media completion not saved');
                results.push(`${media} ${mode} ${turns*90} degrees: PASS`);
                w.hideCompleteDisplay();
            }
        }
        w.mediaManager.stopDrawingLoop();
        output.textContent=`PASS: ${results.length} completion checks\n${results.join('\n')}`;
    } catch (error) {output.textContent=`FAIL\n${results.join('\n')}\n${error.stack}`;}
};
