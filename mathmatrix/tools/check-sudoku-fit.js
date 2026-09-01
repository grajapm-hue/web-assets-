/* Sudoku's footer: the counter and the clock are bordered boxes, and the 9x9
   board above them is TALL. Sized by width alone the board pushed both of them
   under the tab bar on a 360x740 phone — the same fault beta-148 fixed on the
   slide board, repeated here because the lesson was not carried to the next
   puzzle. Raja's own phone is 360x800, so it is measured explicitly rather
   than inferred from the sizes either side of it. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9991;
const FILE = 'file:///' + path.join(__dirname, '..', process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  fs.rmSync(path.join(__dirname, '_cpsf'), { recursive: true, force: true, maxRetries: 3 });
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpsf'),
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  await require('./quiet-audio').early(PORT);
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Runtime.enable'); await send('Page.enable');
  for (const S of [{ w: 340, h: 780 }, { w: 360, h: 740 }, { w: 360, h: 800 }, { w: 390, h: 844 }]){
    await send('Emulation.setDeviceMetricsOverride', { width: S.w, height: S.h, deviceScaleFactor: 2, mobile: true });
    await send('Page.reload', { ignoreCache: true }); await sleep(1700);
    await ev(`document.querySelector('.splashPlay').click()`); await sleep(800);
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
    await ev(`document.querySelector('.toggleBtn[data-sud-level="medium"]').click()`); await sleep(1400);
    // let the clock reach two digits, the widest it gets before a minute
    const r = await ev(`(function(){
      var bar = document.querySelector('.tabBar');
      var floor = bar ? bar.getBoundingClientRect().top : window.innerHeight;
      function box(id){ var e=document.getElementById(id); var b=e.getBoundingClientRect();
        return { l:Math.round(b.left), r:Math.round(b.right), t:Math.round(b.top), b:Math.round(b.bottom) }; }
      return JSON.stringify({ page: document.documentElement.clientWidth, floor: Math.round(floor),
        filled: box('sudFilled'), time: box('sudTime') }); })()`);
    const D = JSON.parse(r);
    console.log('\n=== ' + S.w + 'x' + S.h + ' ===');
    ok(S.w + ': both chips fit inside the page',
      D.filled.l >= -1 && D.filled.r <= D.page + 1 && D.time.l >= -1 && D.time.r <= D.page + 1,
      'page ' + D.page + ', filled ' + D.filled.l + '..' + D.filled.r + ', time ' + D.time.l + '..' + D.time.r);
    ok(S.w + ': the chips do not overlap each other',
      D.filled.r <= D.time.l + 1 || D.time.b <= D.filled.t + 1 || D.filled.b <= D.time.t + 1,
      D.filled.r <= D.time.l ? 'side by side' : 'stacked');
    /* What has to be true is REACHABLE, not "above the fold". The board shrinks
       to avoid needing a scroll, but it will not go below 22px a square, and on
       the shortest screens the 9x9 plus its instructions genuinely does not fit
       — so the panel scrolls, exactly as the slide and gate panels already do.
       Clipped with no way to reach it is the bug; needing to scroll is not. */
    const reach = await ev(`(function(){
      var p = document.getElementById('sudokuPanel');
      return JSON.stringify({ canScroll: p.scrollHeight > p.clientHeight + 1,
        scrollHeight: p.scrollHeight, clientHeight: p.clientHeight }); })()`);
    const R = JSON.parse(reach);
    const visible = D.filled.b <= D.floor + 1 && D.time.b <= D.floor + 1;
    ok(S.w + ': the clock and counter are reachable',
      visible || R.canScroll,
      visible ? 'both above the bar without scrolling'
              : (R.canScroll ? 'below the fold, but the panel scrolls to them ('
                   + R.scrollHeight + ' > ' + R.clientHeight + ')'
                 : 'CLIPPED — below the bar and the panel does not scroll'));
  }
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
