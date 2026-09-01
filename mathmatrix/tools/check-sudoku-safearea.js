/* iPhone check, without an iPhone.

   On a phone with a home indicator the tab bar grows by env(safe-area-inset-
   bottom) — the app already sets viewport-fit=cover and pads the bar for it, so
   the bar gets TALLER and its top edge moves UP. The Sudoku board sizes itself
   from the room above that top edge, so it should yield on its own.

   "Should" is not a check. Grow the bar by a real iPhone's 34px inset and see
   whether the board actually gives way, or whether the footer ends up under the
   bar again — which is the bug beta-159 fixed on short Android screens, and
   would come back on iOS through a different door. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9988;
const FILE = 'file:///' + path.join(__dirname, '..', process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  fs.rmSync(path.join(__dirname, '_cpsa'), { recursive: true, force: true, maxRetries: 3 });
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpsa'),
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  await require('./quiet-audio').early(PORT);
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push('err'); });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Runtime.enable'); await send('Page.enable');
  // iPhone 12/13/14 in CSS pixels, and their 34px home-indicator inset
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await sleep(1800);
  await ev(`document.querySelector('.splashPlay').click()`); await sleep(800);
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
  await ev(`document.querySelector('.toggleBtn[data-sud-level="medium"]').click()`); await sleep(1400);

  const before = JSON.parse(await ev(`(function(){
    var bar = document.querySelector('.tabBar').getBoundingClientRect();
    var cell = document.querySelector('#sudBoard [data-sud]').getBoundingClientRect();
    var time = document.getElementById('sudTime').getBoundingClientRect();
    return JSON.stringify({ barTop: Math.round(bar.top), cell: Math.round(cell.width),
      timeBottom: Math.round(time.bottom) }); })()`));
  ok('with no inset, the clock sits above the tab bar',
    before.timeBottom <= before.barTop + 1,
    'clock ends ' + before.timeBottom + ', bar starts ' + before.barTop + ', square ' + before.cell + 'px');

  /* Grow the bar the way a home indicator does. env() cannot be forced from
     here, so the padding it feeds is applied directly — the board depends on
     the bar's MEASURED top, not on env(), so this exercises the real path.
     Injected as a stylesheet rule with !important: an inline style loses to the
     theme's own !important padding, which is why the first version of this
     check reported the bar never moving and proved nothing. */
  await ev(`(function(){
    var s = document.createElement('style');
    s.textContent = '.tabBar{ padding-bottom: 37px !important; }';
    document.head.appendChild(s);
  })()`);
  await ev(`window.dispatchEvent(new Event('resize'))`);
  await sleep(700);

  const after = JSON.parse(await ev(`(function(){
    var bar = document.querySelector('.tabBar').getBoundingClientRect();
    var cell = document.querySelector('#sudBoard [data-sud]').getBoundingClientRect();
    var time = document.getElementById('sudTime').getBoundingClientRect();
    var filled = document.getElementById('sudFilled').getBoundingClientRect();
    return JSON.stringify({ barTop: Math.round(bar.top), cell: Math.round(cell.width),
      timeBottom: Math.round(time.bottom), filledBottom: Math.round(filled.bottom) }); })()`));

  ok('the taller bar really did take space', after.barTop < before.barTop,
    'bar top moved ' + before.barTop + ' -> ' + after.barTop);
  ok('the board gave way rather than pushing the footer under the bar',
    after.cell <= before.cell, 'square ' + before.cell + 'px -> ' + after.cell + 'px');
  ok('the clock is still above the bar on a home-indicator phone',
    after.timeBottom <= after.barTop + 1,
    'clock ends ' + after.timeBottom + ', bar starts ' + after.barTop);
  ok('so is the counter', after.filledBottom <= after.barTop + 1,
    'counter ends ' + after.filledBottom);
  ok('and the squares stay above the floor the 10×10 already ships at',
    after.cell >= 22, after.cell + 'px');

  ok('no JS errors', errs.length === 0);
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
