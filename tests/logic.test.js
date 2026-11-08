// Run with Node.js: node --test tests/logic.test.js (no npm install).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const html = read('index.html');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);

function runtime(ss=2,gn=3) {
    const elements = new Map(), events = [], storage = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            value:'', innerText:'', style:{},
            classList:{values:new Set(),add(...names){names.forEach(n=>this.values.add(n));},remove(...names){names.forEach(n=>this.values.delete(n));},toggle(n,force){const on=force??!this.values.has(n);on?this.values.add(n):this.values.delete(n);return on;},contains(n){return this.values.has(n);}},
            setAttribute(){}, remove(){}, addEventListener(type,handler){events.push({type,handler});}
        });
        return elements.get(id);
    };
    const context = vm.createContext({
        console:{log(){},warn(){},error(){},group(){},groupEnd(){},table(){}},
        performance, setTimeout, clearTimeout, setInterval, clearInterval,
        navigator:{}, location:{protocol:'file:'},
        document:{getElementById:element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(type,handler){events.push({type,handler});}},
        addEventListener(type,handler){events.push({type,handler});}, alert(){}, confirm:()=>true,
        localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,val)=>storage.set(key,val),removeItem:key=>storage.delete(key)},
        FileReader:class {readAsText(file){this.onload({target:{result:file.content}});}}
    });
    context.window=context;
    const run = code=>vm.runInContext(code,context);
    for (const script of scripts) vm.runInContext(read(script),context,{filename:script});
    run(`subSize=${ss};gridNum=${gn};board=Array.from({length:subSize*gridNum},(_,r)=>Array.from({length:subSize*gridNum},(_,c)=>({tileId:r*subSize*gridNum+c,value:Math.floor(r/subSize)*gridNum+Math.floor(c/subSize),direction:0})));
        initialBoard=JSON.parse(JSON.stringify(board));targetBoard=board.map(r=>r.map(c=>c.value));var original=JSON.stringify(board);`);
    return {context,run,element,events,storage};
}

test('HTML loads all scripts and initializes exactly once without duplicate file-input listeners',()=>{
    const r=runtime();
    assert.equal(r.events.filter(e=>e.type==='DOMContentLoaded').length,1);
    r.run('initBoard=()=>{window.started=true;}');
    r.events.find(e=>e.type==='DOMContentLoaded').handler();
    assert.equal(r.context.started,true);
    assert.equal(r.events.filter(e=>e.type==='change').length,0);
    assert.equal(r.run('typeof GhostLayer.createLines'),'function');
    assert.equal((html.match(/rel="manifest"/g)||[]).length,1);
});

for (const [ss,gn] of [[2,2],[2,3],[3,2],[3,3],[2,4]]) {
    test(`${ss}×${gn}: all legal moves agree with solver and reverse restores every tile`,()=>{
        const r=runtime(ss,gn);
        assert.equal(r.run(`genMoves(subSize*gridNum,gridNum).every(m=>{
            board=JSON.parse(original);const flat=board.flat().map(c=>c.tileId);
            executeSingleMove(m.str,false,true);
            const expected=applyMove(flat,m,subSize*gridNum,subSize);
            if(board.flat().some((c,i)=>c.tileId!==expected[i]))return false;
            executeSingleMove(m.str,true,true);return JSON.stringify(board)===original;
        })`),true);
    });
    test(`${ss}×${gn}: grouped replay, torus reversal and target mapping`,()=>{
        const r=runtime(ss,gn);
        const steps=Array.from({length:ss},(_,i)=>`${String.fromCharCode(97+i)}-R1`).concat('1-D1');
        r.element('solve-log').value=steps.join(',');
        r.run('staticShowGrouping();moveTable.forEach(m=>executeGroupedMove(m,false,true));var grouped=JSON.stringify(board);board=JSON.parse(original);');
        assert.equal(r.context.moveTable[0].type,'FRAME');
        steps.forEach(step=>r.context.executeSingleMove(step,false,true));
        assert.equal(r.run('JSON.stringify(board)===grouped'),true);
        r.element('scramble-input').value=steps.join(',');r.context.reversePattern();
        r.element('scramble-input').value.split(',').forEach(step=>r.context.executeSingleMove(step,false,true));
        assert.equal(r.run('JSON.stringify(board)===original'),true);
        assert.equal(r.run('extractGoalTileIdGridFromTarget(targetBoard,subSize*gridNum,subSize,gridNum).every((id,i)=>id===i)'),true);
    });
}

test('A* and bidirectional BFS return a usable solution for a two-move scramble',()=>{
    const r=runtime(2,2);
    r.run("var goal=board.flat().map(c=>c.tileId);executeSingleMove('a-R1',false,true);executeSingleMove('1-D1',false,true);var start=board.flat().map(c=>c.tileId);");
    for (const expression of ['solveAStar(start,goal,4,2,2,2000)','solveBidirectional(start,goal,4,2,2,6,2000)']) {
        r.context.solution=r.run(expression);assert.ok(Array.isArray(r.context.solution));
        assert.equal(r.run(`{const moves=genMoves(4,2);let state=start;for(const step of solution)state=applyMove(state,moves.find(m=>m.str===step),4,2);keyOf(state)===keyOf(goal);}`),true);
    }
});

for (const replay of [false,true]) test(`manual solve completes and stops timer (after replay: ${replay})`,()=>{
    const r=runtime(2,2);
    try {
        r.context.isReplayMode=replay;
        r.run("executeSingleMove('a-R1',false,true);recordMove(0,'L',1,'standard');executeSingleMove('a-L1',false,true);checkComplete();");
        assert.equal(r.run('timerId===null'),true);
        assert.equal(r.element('status-board').classList.contains('show'),true);
        assert.equal(r.element('status-preview').classList.contains('show'),true);
        assert.equal(JSON.parse(r.storage.get('slp_history'))[0].is_complete,true);
    } finally {r.run('clearInterval(timerId);clearTimeout(completeTimerId);');}
});

for (const [ss,gn] of [[2,2],[2,3],[3,2],[3,3],[2,4]]) for (const mode of ['image','video']) {
    for (let turns=0;turns<4;turns++) test(`${ss}×${gn} ${mode}: tile indices and directions at ${turns*90} degrees`,()=>{
        const r=runtime(ss,gn);
        try {
            r.context.mediaManager.mode=mode;
            for(let i=0;i<turns;i++) r.run(`board=board[0].map((_,c)=>board.map(row=>row[c]).reverse());board.flat().forEach(p=>p.direction=(p.direction+1)%4);`);
            r.run("recordMove(0,'L',1,'standard');checkComplete();");
            assert.equal(r.element('status-board').classList.contains('show'),true);
            assert.equal(r.run('timerId===null'),true);
            r.run('hideCompleteDisplay();[board[0][0],board[0][1]]=[board[0][1],board[0][0]];checkComplete();');
            assert.equal(r.element('status-board').classList.contains('show'),false,'same color but wrong tile IDs must not complete');
            r.run('[board[0][0],board[0][1]]=[board[0][1],board[0][0]];board[0][0].direction=(board[0][0].direction+1)%4;checkComplete();');
            assert.equal(r.element('status-board').classList.contains('show'),false,'wrong piece direction must not complete');
        } finally {r.run('clearInterval(timerId);clearTimeout(completeTimerId);');}
    });
}

test('replay with recording disabled still suppresses completion and timer',()=>{
    const r=runtime(2,2);
    r.run('window.isReplayMode=true;setLogState(false);toggleTimer(true);checkComplete();');
    assert.equal(r.context.isReplayMode,true);
    assert.equal(r.run('timerId===null'),true);
    assert.equal(r.element('status-board').classList.contains('show'),false);
    assert.equal(r.storage.has('slp_history'),false);
});

test('CSV import and timestamp-based history restore preserve stored data',()=>{
    const r=runtime();
    r.context.importCSV({target:{files:[{content:'a-R1,\n1-D1\r\n'}]}});
    assert.equal(r.element('scramble-input').value,'a-R1,1-D1');
    r.storage.set('slp_history',JSON.stringify([{timestamp:'2026/01/01',step_count:1}]));
    r.run('refreshHistoryList=()=>{}');
    r.context.restoreHistory({target:{value:'x',files:[{content:JSON.stringify([{timestamp:'2026/01/02',step_count:3}])}]}});
    assert.deepEqual(JSON.parse(r.storage.get('slp_history')).map(h=>h.step_count),[3,1]);
});

test('PWA precache includes every HTML asset and preserves unrelated application caches',async()=>{
    const handlers={},deleted=[];let assets,pending;
    const context=vm.createContext({self:{addEventListener:(event,handler)=>{handlers[event]=handler;},skipWaiting(){}},caches:{
        open:async()=>({addAll:async list=>{assets=[...list];}}),
        keys:async()=>['slp-cache-v2.1.0','slp-cache-v2.3.1','slp-cache-v2.3.2','another-app'],
        delete:async key=>{deleted.push(key);}
    }});
    vm.runInContext(read('sw.js'),context);
    handlers.install({waitUntil:promise=>{pending=promise;}});await pending;
    const expected=[...scripts,...[...html.matchAll(/<link [^>]*href="([^"]+)"/g)].map(m=>m[1])];
    for(const file of expected)assert.ok(assets.includes('./'+file.replace(/^\.\//,'')),file);
    for(const file of assets)assert.ok(fs.existsSync(path.join(root,file)),file);
    handlers.activate({waitUntil:promise=>{pending=promise;}});await pending;
    assert.deepEqual(deleted,['slp-cache-v2.1.0','slp-cache-v2.3.1']);
});
