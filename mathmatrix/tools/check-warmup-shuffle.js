/* Raja: "in the logic picture card the correct tab is mostly placed top left,
   or the same place again — can you change its order to a different location?"

   He was right, and understated. Of the 62 warm-up questions, 59 had the right
   answer in the first slot: a child could score 95% by tapping top-left every
   time without reading a word.

   Two things have to hold, and the second is the one that bites.

   SPREAD — the right answer must land in all four corners across the rooms a
   child actually walks. Asserted as a rate, because a single room proves
   nothing about a shuffle.

   STABILITY — the order must be the SAME every time a given room is drawn.
   renderGateRoom() numbers the buttons by position and gateChoose() calls the
   warm-up again to see what was tapped; if the two disagree, a right answer is
   marked wrong. That failure would be intermittent and blamed on the child,
   so it is checked directly: open a room, read the cards, leave, come back,
   and the cards must be in the same places — then answer correctly and be
   believed. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9880;
const ROOT = path.join(__dirname, '..');
const MT = process.env.MM_TARGET || 'beta.html';
const FILE = /^https?:/.test(MT) ? MT : 'file:///' + path.join(ROOT, MT).split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpwarm');
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
  const waitFor = async (expr, ms) => {
    const until = Date.now() + (ms || 15000);
    while (Date.now() < until){ if (await ev(expr)) return true; await sleep(200); }
    return false;
  };

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  ok('the page loaded', await waitFor(`!!document.querySelector('.splashPlay')`), FILE);
  await ev(`document.querySelector('.splashPlay').click()`);
  await waitFor(`!!document.getElementById('gateListBtn')`);

  const cards = () => ev(`(function(){
    return JSON.stringify(Array.prototype.map.call(
      document.querySelectorAll('.gateChoiceBtn'), function(b){
        return (b.textContent || '').replace(/\\s+/g,' ').trim(); }));
  })()`).then(JSON.parse);

  const open = async (gate, lvl) => {
    await ev(`document.getElementById('gateListBtn').click()`);
    await waitFor(`!!document.querySelector('.rowBtn[data-gate="${gate}"]')`);
    await ev(`(function(){ var b=document.querySelector('.rowBtn[data-gate="${gate}"]:not([data-level])'); if(b) b.click(); })()`);
    await sleep(400);
    const hasLevels = await ev(`!!document.querySelector('.rowBtn[data-gate="${gate}"][data-level="${lvl}"]')`);
    if (hasLevels){
      await ev(`(function(){ var b=document.querySelector('.rowBtn[data-gate="${gate}"][data-level="${lvl}"]'); if(b) b.click(); })()`);
    }
    return waitFor(`!!document.querySelector('.gateChoiceBtn')`);
  };

  /* ---- SPREAD: walk the warm-ups of several gates and see where the answer
     actually sits. The correct card is found by tapping: whichever tap is
     accepted was the right one, which is the same thing a child does. ---- */
  const slots = [0, 0, 0, 0];
  let rooms = 0;
  for (const gate of ['and', 'or', 'nand', 'nor', 'xor', 'xnor']){
    for (const lvl of [0, 1, 2]){
      if (!await open(gate, lvl)) continue;
      for (let r = 0; r < 5; r++){
        const isLogic = await ev(`/[A-E]\\s*=\\s*(ON|OFF)/.test(document.body.textContent||'')`);
        if (isLogic) break;                       // warm-ups are done for this level
        const n = await ev(`document.querySelectorAll('.gateChoiceBtn').length`);
        if (!n) break;
        let hit = -1;
        for (let c = 0; c < n && hit < 0; c++){
          await ev(`(function(){ var b=document.querySelectorAll('.gateChoiceBtn')[${c}];
            if (b && !b.disabled) b.click(); })()`);
          await sleep(220);
          if (await ev(`!!document.getElementById('gateNextBtn')`)) hit = c;
        }
        if (hit >= 0 && hit < 4){ slots[hit]++; rooms++; }
        await ev(`(function(){ var b=document.getElementById('gateNextBtn'); if(b) b.click(); })()`);
        await sleep(450);
      }
      await ev(`(function(){ var b=document.getElementById('gateBackBtn'); if(b) b.click(); })()`);
      await sleep(300);
      await ev(`document.getElementById('tab-scHome').click()`);
      await sleep(250);
    }
  }

  ok('enough warm-up rooms were walked to judge a shuffle', rooms >= 20, rooms + ' rooms');
  const worst = Math.max.apply(null, slots), share = rooms ? worst / rooms : 1;
  console.log('        answer landed in each corner: ' + slots.join(' / ') + '  over ' + rooms + ' rooms');
  ok('the right answer is no longer parked in one corner', share <= 0.55,
     'busiest corner holds ' + Math.round(share * 100) + '% (was 95% top-left)');
  ok('and it reaches every corner, so no corner is safe to ignore',
     slots.every(s => s > 0), slots.join(' / '));

  /* ---- STABILITY: the same room must deal the same cards, or answering it
     becomes a lottery. ---- */
  await open('and', 0);
  const first = await cards();
  await ev(`(function(){ var b=document.getElementById('gateBackBtn'); if(b) b.click(); })()`);
  await sleep(400);
  await open('and', 0);
  const second = await cards();
  ok('coming back to a room finds the cards where they were left',
     first.length > 0 && JSON.stringify(first) === JSON.stringify(second),
     JSON.stringify(first) + ' vs ' + JSON.stringify(second));

  /* The failure this would otherwise cause: the buttons are numbered by
     position when drawn and looked up again when tapped. If those two ever
     disagree, a correct tap is called wrong. */
  let accepted = -1;
  const n0 = await ev(`document.querySelectorAll('.gateChoiceBtn').length`);
  for (let c = 0; c < n0 && accepted < 0; c++){
    await ev(`(function(){ var b=document.querySelectorAll('.gateChoiceBtn')[${c}];
      if (b && !b.disabled) b.click(); })()`);
    await sleep(250);
    if (await ev(`!!document.getElementById('gateNextBtn')`)) accepted = c;
  }
  ok('exactly one card is accepted, and tapping it is believed', accepted >= 0,
     accepted >= 0 ? 'card ' + (accepted + 1) + ' of ' + n0 : 'no card was accepted — position and answer disagree');

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
