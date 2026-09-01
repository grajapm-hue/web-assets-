/* Raja: "keep auto next in when success, else pop red wrong try again — it
   will help move next step fast while correct selection in puzzle."

   A gate is up to 37 rooms, so a tap on every correct answer is a lot of
   tapping for something the child already knows they got right.

   This guards the part that is easy to get wrong. Auto-advance was REMOVED
   from these rooms once before, because a timed appreciation kept being
   missed — so the new behaviour must keep the pill AND the Next button and
   merely stop requiring the tap. And a timer that moves the screen on is a
   race by nature: it must never fire after the child has already moved, or
   they lose a room they never saw.

   So: correct advances on its own; wrong never does and stays retryable;
   tapping Next moves exactly ONE room, not two. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9879;
const ROOT = path.join(__dirname, '..');
const MT = process.env.MM_TARGET || 'beta.html';
const FILE = /^https?:/.test(MT) ? MT : 'file:///' + path.join(ROOT, MT).split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpauto');
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp,
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  await require('./quiet-audio').early(PORT);
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(300);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch(e){} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 160));
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  /* Wait for each step to actually happen instead of sleeping a guessed
     amount. Against the local file every fixed sleep was generous; against the
     live URL the very first one was not, the splash had not rendered yet, and
     every assertion after it failed for a reason that had nothing to do with
     the product. */
  const waitFor = async (expr, ms) => {
    const until = Date.now() + (ms || 15000);
    while (Date.now() < until){
      if (await ev(expr)) return true;
      await sleep(200);
    }
    return false;
  };

  ok('the page loaded', await waitFor(`!!document.querySelector('.splashPlay')`), FILE);
  await ev(`document.querySelector('.splashPlay').click()`);
  ok('the puzzle list opened', await waitFor(`!!document.getElementById('gateListBtn')`));
  await ev(`document.getElementById('gateListBtn').click()`);
  ok('the gate list opened', await waitFor(`!!document.querySelector('.rowBtn[data-gate="xnor"]')`));
  await ev(`(function(){ var b=document.querySelector('.rowBtn[data-gate="xnor"]:not([data-level])'); if(b) b.click(); })()`);
  ok('XNOR offers its levels', await waitFor(`!!document.querySelector('.rowBtn[data-gate="xnor"][data-level="0"]')`));
  await ev(`(function(){ var b=document.querySelector('.rowBtn[data-gate="xnor"][data-level="0"]'); if(b) b.click(); })()`);
  ok('a room opened', await waitFor(`!!document.querySelector('.gateChoiceBtn')`));

  const room = () => ev(`(function(){
    var p = document.querySelector('.gateProgress');
    var m = p && (p.textContent||'').match(/ROOM\\s+(\\d+)/i);
    return m ? +m[1] : -1;
  })()`);
  const state = () => ev(`(function(){
    var fb = document.getElementById('gateFeedback');
    var cs = document.querySelectorAll('.gateChoiceBtn');
    return JSON.stringify({
      cls: fb ? fb.className : '',
      bg: fb ? getComputedStyle(fb).backgroundColor : '',
      text: fb ? (fb.textContent||'').replace(/\\s+/g,' ').trim().slice(0,70) : '',
      hasNext: !!document.getElementById('gateNextBtn'),
      liveChoices: Array.prototype.filter.call(cs, function(b){ return !b.disabled; }).length
    });
  })()`).then(JSON.parse);

  /* Walk the warm-ups by trying each choice until one is accepted, so we land
     in a real logic room where the answer can be computed rather than guessed. */
  for (let guard = 0; guard < 12; guard++){
    const isLogic = await ev(`/[A-E]\\s*=\\s*(ON|OFF)/.test(document.body.textContent||'')`);
    if (isLogic) break;
    const n = await ev(`document.querySelectorAll('.gateChoiceBtn:not([disabled])').length`);
    for (let c = 0; c < n; c++){
      await ev(`(function(){ var b=document.querySelectorAll('.gateChoiceBtn:not([disabled])')[${c}]; if(b) b.click(); })()`);
      await sleep(300);
      if (await ev(`!!document.getElementById('gateNextBtn')`)) break;
    }
    await sleep(2400);   // let the new auto-next carry us into the following room
  }
  const inLogic = await ev(`/[A-E]\\s*=\\s*(ON|OFF)/.test(document.body.textContent||'')`);
  ok('reached a real logic room', inLogic === true);

  /* Compute the answer here rather than reading it off the app. */
  const inputs = await ev(`(function(){
    var m = (document.body.textContent||'').match(/[A-E]\\s*=\\s*(ON|OFF)/g) || [];
    return JSON.stringify(m.map(function(s){ return /ON/.test(s) ? 1 : 0; }));
  })()`).then(JSON.parse);
  const wantOn = inputs.filter(v => v === 1).length % 2 === 0;    // XNOR
  ok('the room states its inputs', inputs.length >= 2, inputs.join(',') + ' -> XNOR ' + (wantOn ? 'ON' : 'OFF'));

  /* ---- WRONG: red, stays put, still retryable ---- */
  const before = await room();
  await ev(`(function(){ var b=document.querySelector('.gateChoiceBtn[data-val="${wantOn ? 0 : 1}"]'); if(b) b.click(); })()`);
  await sleep(600);
  const bad = await state();
  ok('a wrong answer is shown in red, as a filled pill not just tinted text',
     /gateFeedback-bad/.test(bad.cls) && /253, 231, 231/.test(bad.bg), bad.cls + ' ' + bad.bg);
  ok('and it says to try again', /try again/i.test(bad.text), bad.text);
  ok('a wrong answer offers no Next', bad.hasNext === false);
  ok('the choices stay live so the child can have another go', bad.liveChoices >= 2, bad.liveChoices + ' still tappable');
  await sleep(2600);
  ok('and a wrong answer NEVER moves the child on by itself',
     (await room()) === before, 'room ' + before + ' -> ' + (await room()));

  /* ---- RIGHT: the appreciation still shows, then it moves on by itself ---- */
  await ev(`(function(){ var b=document.querySelector('.gateChoiceBtn[data-val="${wantOn ? 1 : 0}"]'); if(b) b.click(); })()`);
  await sleep(350);
  const good = await state();
  ok('a right answer still shows the appreciation pill', /gateFeedback-ok/.test(good.cls), good.text);
  ok('and still offers Next, so nothing was taken away', good.hasNext === true);
  const atAnswer = await room();
  await sleep(2200);
  const after = await room();
  ok('then it moves to the next room on its own, with no tap',
     after === atAnswer + 1 || after === -1, 'room ' + atAnswer + ' -> ' + after);

  /* ---- tapping Next must move exactly ONE room, not two ---- */
  if (after === atAnswer + 1){
    const ins2 = await ev(`(function(){
      var m = (document.body.textContent||'').match(/[A-E]\\s*=\\s*(ON|OFF)/g) || [];
      return JSON.stringify(m.map(function(s){ return /ON/.test(s) ? 1 : 0; }));
    })()`).then(JSON.parse);
    if (ins2.length >= 2){
      const on2 = ins2.filter(v => v === 1).length % 2 === 0;
      const r0 = await room();
      await ev(`(function(){ var b=document.querySelector('.gateChoiceBtn[data-val="${on2 ? 1 : 0}"]'); if(b) b.click(); })()`);
      await sleep(250);
      await ev(`(function(){ var b=document.getElementById('gateNextBtn'); if(b) b.click(); })()`);
      await sleep(2600);   // long enough that a stale timer would also have fired
      const r1 = await room();
      ok('tapping Next moves exactly one room — the timer does not fire on top of it',
         r1 === r0 + 1 || r1 === -1, 'room ' + r0 + ' -> ' + r1);
    }
  }

  /* ---- leaving the room must disarm the timer ---- */
  await ev(`(function(){ var b=document.querySelector('.gateChoiceBtn:not([disabled])'); if(b) b.click(); })()`);
  await sleep(200);
  await ev(`(function(){ var b=document.getElementById('gateBackBtn'); if(b) b.click(); })()`);
  await sleep(2600);
  const leftAlone = await ev(`(function(){
    var p = document.querySelector('.gateProgress');
    return !p || p.offsetParent === null;
  })()`);
  ok('walking out mid-answer does not get dragged back in by a stale timer',
     leftAlone === true);

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
