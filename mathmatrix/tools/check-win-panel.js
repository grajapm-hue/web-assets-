/* Raja, after playing every grid puzzle from 3x3 to Sir Ramanujan:
   "the appreciation pop fully hide the results to observe, so remove full
   screen pop instead just pop applause in some seconds and it should
   disappear and win result should stays untill player to decide whether go
   next any."

   Two requirements, and this file holds both to the fire:

   1. THE SOLVED BOARD STAYS VISIBLE. The win panel used to be inset:0 with
      rgba(0,0,0,.9) over it, so the grid the child had just solved was behind
      a 90%-black wash at the exact moment they wanted to check it. The real
      test is not "the panel got shorter" -- it is that a board cell is
      genuinely hit-testable, i.e. elementFromPoint at its centre returns the
      cell and not the overlay. A transparent full-screen sheet would still
      pass a pixel test while swallowing every tap.

   2. NOTHING MOVES ON A TIMER. It used to count down from 4 and rebuild the
      board on its own. This waits well past that and asserts the panel is
      still open and the solution still on screen.

   Plus the trap this nearly fell into: #cheatModal SHARES the .congratsModal
   class and must stay a full-screen dark viewer. Styling the class instead of
   the id silently turned the cheat sheet into a transparent, un-tappable
   strip. That is asserted here so nobody re-learns it. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9959;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpwinpanel');
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch(e){}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp,
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 200));
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(800);

  /* The cheat sheet shares the class. Assert BEFORE anything else that it is
     still the full-screen dark viewer it has to be. */
  const cheat = await ev(`(function(){
    var c = document.getElementById('cheatModal'); if (!c) return '{}';
    var cs = getComputedStyle(c);
    return JSON.stringify({ bg: cs.backgroundColor, top: cs.top, pe: cs.pointerEvents });
  })()`).then(JSON.parse);
  ok('cheat sheet viewer keeps its full-screen dark backdrop',
     /rgba\(0, 0, 0, 0\.9\)/.test(cheat.bg) && cheat.top === '0px', JSON.stringify(cheat));
  ok('cheat sheet viewer still accepts taps (tap-outside closes it)',
     cheat.pe !== 'none', cheat.pe);

  // Solve a real 3x3: read the answer via Peek, let it expire, type it back.
  await ev(`(function(){ var b=document.querySelector('.toggleBtn[data-size="3x3"]'); if(b) b.click(); })()`);
  await sleep(700);
  await ev(`document.getElementById('peekBtn').click()`);
  await sleep(400);
  const sol = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#board .cell')).map(function(i){ return i.value; }))`);
  await sleep(3600);
  await ev(`(function(){
    var sol = ${sol};
    var cs = document.querySelectorAll('#board .cell');
    for (var i = 0; i < cs.length; i++){
      cs[i].focus(); cs[i].value = sol[i];
      cs[i].dispatchEvent(new Event('input', { bubbles:true }));
    }
  })()`);
  let open = false;
  for (let i = 0; i < 12; i++){
    await sleep(700);
    open = await ev(`(function(){ var m=document.getElementById('congratsModal');
      return !!m && getComputedStyle(m).display !== 'none'; })()`);
    if (open) break;
  }
  ok('solving a 3x3 opens the win panel', open === true);

  const geo = await ev(`(function(){
    var m = document.getElementById('congratsModal');
    var cs = getComputedStyle(m), r = m.getBoundingClientRect();
    return JSON.stringify({ bg: cs.backgroundColor, h: Math.round(r.height),
      vh: window.innerHeight, top: Math.round(r.top) });
  })()`).then(JSON.parse);
  ok('the win panel is NOT a full-screen cover', geo.h < geo.vh * 0.62,
     geo.h + 'px of ' + geo.vh + 'px');
  ok('there is no black wash over the board',
     /rgba\(0, 0, 0, 0\)|transparent/.test(geo.bg), geo.bg);
  ok('it sits at the bottom, leaving the board above it', geo.top > geo.vh * 0.38, 'top ' + geo.top);

  /* The real check: the solved numbers must be READABLE AND REACHABLE.
     elementFromPoint catches a transparent overlay that still eats taps. */
  const reach = await ev(`(function(){
    var cs = document.querySelectorAll('#board .cell');
    var seen = 0, hit = 0, vals = [];
    for (var i = 0; i < cs.length; i++){
      var r = cs[i].getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) continue;
      seen++;
      var el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      if (el === cs[i]) { hit++; vals.push(cs[i].value); }
    }
    return JSON.stringify({ seen: seen, hit: hit, vals: vals.join(',') });
  })()`).then(JSON.parse);
  ok('every on-screen board cell is reachable, not covered by the panel',
     reach.seen > 0 && reach.hit === reach.seen, reach.hit + '/' + reach.seen + ' [' + reach.vals + ']');
  ok('the solved numbers are actually on screen to check',
     reach.vals.split(',').filter(Boolean).length >= 6, reach.vals);

  /* Nothing may move on a timer. The old build rebuilt the board after 4s. */
  const before = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#board .cell')).map(function(i){ return i.value; }))`);
  await sleep(9000);
  const after = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#board .cell')).map(function(i){ return i.value; }))`);
  const still = await ev(`(function(){ var m=document.getElementById('congratsModal');
    return getComputedStyle(m).display !== 'none'; })()`);
  ok('after 9s the win panel is STILL open -- nothing auto-advanced', still === true);
  ok('after 9s the solved board is untouched', before === after, after);
  ok('no "Auto-advancing in..." countdown is shown',
     (await ev(`(document.getElementById('congratsCountdown')||{}).textContent||''`)) === '');

  /* The player's own decision still works. */
  await ev(`document.getElementById('nextBtn').click()`);
  await sleep(700);
  const closed = await ev(`(function(){ var m=document.getElementById('congratsModal');
    return getComputedStyle(m).display === 'none'; })()`);
  ok('the player can dismiss it themselves', closed === true);

  ok('no JS errors', errs.length === 0, errs.join(' | '));

  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
