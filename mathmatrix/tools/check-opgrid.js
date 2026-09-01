/* Does the standalone page actually work? Generate, solve it via Reveal,
   confirm all six lines go green, and confirm the teaching walks real steps. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9887;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'opgrid.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n,c,x) => { console.log((c?'  PASS  ':'  FAIL  ')+n+(x!==undefined?'  -> '+x:'')); if(!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpog');
  try { fs.rmSync(tmp, { recursive:true, force:true, maxRetries:5, retryDelay:200 }); } catch(e){}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--disable-gpu','--no-sandbox','--mute-audio',
     '--remote-debugging-port='+PORT,'--user-data-dir='+tmp,'--window-size=390,844',FILE],{stdio:'ignore'});
  await require('./quiet-audio').early(PORT);
  let t=null;
  for (let i=0;i<40&&!t;i++){ await sleep(280);
    try { t=JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`,{encoding:'utf8'})).find(x=>x.type==='page'); } catch(e){} }
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r));
  let id=0; const pend=new Map(); const errs=[];
  ws.addEventListener('message',e=>{ const m=JSON.parse(e.data);
    if (m.method==='Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description||'').slice(0,200));
    if (m.id&&pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); } });
  const send=(mm,p)=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:mm,params:p}));});
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev=async x=>(await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true})).result?.result?.value;

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await sleep(1200);

  ok('a puzzle was generated on load', await ev(`!!P && P.grid.length === 9`));
  ok('nine white squares are drawn', (await ev(`document.querySelectorAll('.cell').length`)) === 9);
  ok('six targets are drawn', (await ev(`document.querySelectorAll('.tgt').length`)) === 6);
  ok('none are green before anything is entered',
     (await ev(`document.querySelectorAll('.tgt.done').length`)) === 0);

  /* The generator's own promise: exactly one arrangement works. Re-check it
     here, in the page, against the puzzle actually on screen. */
  ok('the puzzle on screen has exactly ONE answer',
     (await ev(`countSolutions(P.rOps,P.cOps,P.r,P.c,3)`)) === 1);

  // solve it the way the Reveal button does, and every line must go green
  await ev(`(function(){ for (var i=0;i<9;i++) entry[i]=P.grid[i]; paint(); })()`);
  await sleep(400);
  const green = await ev(`document.querySelectorAll('.tgt.done').length`);
  ok('with the answer in place all six lines go green', green === 6, green + '/6');
  const said = await ev(`document.getElementById('say').textContent`);
  ok('it announces the solve and the corner product', /Solved/.test(said), said.slice(0,80));

  /* The reason this puzzle is worth building: it yields to reasoning. */
  const d = await ev(`(function(){ var r = deduce(P);
    return JSON.stringify({ ok:r.ok, steps:r.log.length,
      pinned:r.log.filter(function(s){return s.solved;}).length }); })()`).then(JSON.parse);
  ok('it can be solved by pure deduction, no guessing', d.ok === true, JSON.stringify(d));
  ok('the reasoning produces steps that pin a square outright', d.pinned >= 5, d.pinned + ' pinning steps');

  // teaching walks one step at a time and highlights the square it settles
  await ev(`document.getElementById('clearBtn').click()`);
  await sleep(200);
  await ev(`document.getElementById('stepBtn').click()`);
  await sleep(500);
  ok('the first taught step is shown', (await ev(`document.querySelectorAll('#stepList li').length`)) === 1);
  ok('and it highlights the square it is about',
     (await ev(`document.querySelectorAll('.cell.hi').length`)) === 1);
  const first = await ev(`document.querySelector('#stepList li').textContent`);
  ok('the step explains WHY, not just what', /only|way/.test(first), first.slice(0,110));

  /* Twenty fresh puzzles, every one unique and reason-solvable. One good
     puzzle proves nothing about a generator. */
  const many = await ev(`(function(){
    var t0 = Date.now(), n = 30, made = 0, uniq = 0, reasoned = 0;
    for (var i=0;i<n;i++){
      var q = generate('hard');
      if (!q) continue;
      made++;
      if (countSolutions(q.rOps,q.cOps,q.r,q.c,2) === 1) uniq++;
      if (deduce(q).ok) reasoned++;
    }
    return JSON.stringify({ n:n, made:made, uniq:uniq, reasoned:reasoned, ms:Date.now()-t0 });
  })()`).then(JSON.parse);
  ok('every requested puzzle was actually produced', many.made === many.n,
     many.made + '/' + many.n + '  in ' + many.ms + 'ms');
  /* 30 is enough to judge QUALITY but far too few to judge RARITY. The
     generator used to come back empty about once in 300 -- and 30 samples had
     only a 9% chance of ever showing it, which is exactly how it survived. An
     empty result is not a missed tap either: newPuzzle() reads P.grid, so it
     threw and left a broken board.

     Emptiness is cheap to test in bulk (about 4ms a puzzle), so test it in
     bulk: 1200 draws see a 1-in-300 fault 98% of the time. */
  const bulk = await ev(`(function(){
    var N=1200, empty=0, over=0, worst=0, t0=Date.now();
    for (var i=0;i<N;i++){
      var t=performance.now(), q=generate('hard'), d=performance.now()-t;
      if (d>worst) worst=d;
      if (!q){ empty++; continue; }
      if (Math.max.apply(null, q.r.concat(q.c)) > 20) over++;
    }
    return JSON.stringify({ n:N, empty:empty, over:over,
      worst:Math.round(worst), ms:Date.now()-t0 });
  })()`).then(JSON.parse);
  ok('the generator NEVER comes back empty', bulk.empty === 0,
     bulk.empty + '/' + bulk.n + ' empty  (' + bulk.ms + 'ms)');
  /* The fix that stops it coming back empty is a cap that keeps widening, and
     an over-eager version of it pushed 38% of boards past 20 -- fixing the
     crash by quietly making the sums harder. Pin the character too. */
  ok('and the numbers stay child-sized -- widening is a last resort',
     bulk.over / bulk.n < 0.05,
     (100*bulk.over/bulk.n).toFixed(1) + '% of targets over 20');
  ok('a new puzzle still arrives instantly', bulk.worst < 250, 'slowest ' + bulk.worst + 'ms');
  ok('each has exactly one answer', many.uniq === many.made, many.uniq + '/' + many.made);
  ok('each yields to reasoning without guessing', many.reasoned === many.made,
     many.reasoned + '/' + many.made);

  /* ---- the three beginner doors Raja asked for, in BOTH languages ----
     "for a beginner apply demo watch, show logic cheat sheet like 5x5, method
     to be explained step by step, in both Tamil and English guidance."

     The trap worth guarding is the one the app already fell into once: Tamil
     that exists in the how-to-play but not in the UI. Here the reasoning is
     GENERATED, so it is not enough for the buttons to switch -- the argument
     itself has to come out in Tamil. */
  const TAMIL = /[஀-௿]/;

  await ev(`document.getElementById('logicBtn').click()`);
  await sleep(400);
  const sheetEn = await ev(`document.getElementById('sheet').textContent`);
  ok('Method sheet opens with a step-by-step method', /Step 1/.test(sheetEn), sheetEn.slice(0,58));
  ok('it spells out left-to-right, the rule that trips people', /left to right/i.test(sheetEn));

  await ev(`document.getElementById('taBtn').click()`);
  await sleep(400);
  const sheetTa = await ev(`document.getElementById('sheet').textContent`);
  ok('the Method sheet is really Tamil, not English inside a Tamil page',
     TAMIL.test(sheetTa) && !/Step 1/.test(sheetTa), sheetTa.slice(0,40));
  const uiTa = await ev(`document.getElementById('sub').textContent + ' | ' + document.getElementById('newBtn').textContent`);
  ok('the board furniture switches too', TAMIL.test(uiTa), uiTa.slice(0,50));

  await ev(`document.getElementById('stepBtn').click()`);
  await sleep(500);
  const stepTa = await ev(`document.querySelector('#stepList li').textContent`);
  ok('the GENERATED reasoning is in Tamil as well', TAMIL.test(stepTa), stepTa.slice(0,56));

  await ev(`document.getElementById('enBtn').click()`);
  await sleep(300);
  await ev(`document.getElementById('stepBtn').click()`);
  await sleep(400);
  const stepEn = await ev(`document.querySelector('#stepList li').textContent`);
  ok('and switches back to English cleanly', !TAMIL.test(stepEn), stepEn.slice(0,56));

  /* WATCH must give the reason BEFORE it fills -- the point is the argument,
     not seeing squares appear. */
  await ev(`document.getElementById('watchBtn').click()`);
  await sleep(600);
  const early = await ev(`(function(){ var n=0; for (var i=0;i<9;i++) if (entry[i]) n++;
    return n + '|' + document.querySelectorAll('#stepList li').length; })()`);
  ok('Watch shows the reason before filling anything', early.split('|')[0] === '0', early);
  await sleep(6500);
  const later = await ev(`(function(){ var n=0; for (var i=0;i<9;i++) if (entry[i]) n++;
    return n + '|' + document.querySelectorAll('#stepList li').length; })()`);
  ok('Watch then fills squares as its reasons land',
     parseInt(later.split('|')[0], 10) >= 1, later);
  await ev(`document.getElementById('clearBtn').click()`);
  await sleep(250);
  ok('touching the board stops the demo', (await ev(`watchIv === null`)) === true);

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  const shot = await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(ROOT,'opgrid-shot.png'), Buffer.from(shot.result.data,'base64'));
  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:200}); } catch(e){}
  console.log(fail ? '\n'+fail+' FAILURES' : '\nALL GREEN');
  process.exit(fail?1:0);
})();
