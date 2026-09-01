/* beta-59 smoke: every puzzle still opens clean in portrait, no JS errors,
   after wiring checkPortraitLock() into goScreen()/resize/orientationchange. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9961;
/* MM_TARGET may be a file in mathmatrix/ or a full http(s) URL. It used to be
   joined onto a local path unconditionally, so pointing this at the live site
   built a nonsense path like ".../mathmatrix/https:/kidsmaths.../", loaded
   nothing, and then reported every puzzle as broken -- eleven confident
   failures against a live site that was perfectly fine. A checker that cannot
   reach its target has to say so, not blame the product. */
const MT = process.env.MM_TARGET || 'beta.html';
const FILE = /^https?:/.test(MT) ? MT
  : 'file:///' + path.join(__dirname, '..', MT).replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEVELS = ['3x3', '4x4', '5x5', '6x6', '8x8', '10x10', '3cube', 'grid', 'ramanujan', 'binary', 'binary2'];
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  try { fs.rmSync(path.join(__dirname, '_cpg59c'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpg59c'),
    '--window-size=390,844', '--force-device-scale-factor=2', FILE], { stdio: 'ignore' });
  await require('./quiet-audio').early(PORT);
  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); let errs = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 200)); });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  /* Wait for each thing to arrive rather than sleeping a guessed number of
     milliseconds. Off a local file every wait was over before it started; over
     the network the first puzzle had not finished opening when the old fixed
     1s + 750ms elapsed, so the FIRST one or two levels reported as broken --
     and which ones failed moved between runs, because it was measuring the
     connection, not the app. */
  const waitFor = async (x, ms = 15000) => { const end = Date.now() + ms;
    while (Date.now() < end){ if (await ev(x)) return true; await sleep(200); } return false; };

  await waitFor(`!!document.querySelector('.splashPlay')`);
  await ev(`document.querySelector('.splashPlay').click()`);
  await waitFor(`!!document.querySelector('.toggleBtn[data-size="3x3"]')`);

  for (const lv of LEVELS){
    errs = [];
    await ev(`document.getElementById('tab-scHome').click()`);
    await waitFor(`!!document.querySelector('.toggleBtn[data-size="${lv}"]')`);
    await ev(`document.querySelector('.toggleBtn[data-size="${lv}"]').click()`);
    await waitFor(`!!document.querySelector('[data-screen="scPlay"].on')`);
    await sleep(250);
    const onPlay = await ev(`!!document.querySelector('[data-screen="scPlay"].on')`);
    const lockShown = await ev(`document.getElementById('portraitLock').classList.contains('show')`);
    const boardVisible = await ev(`(function(){
      var scr = document.querySelector('[data-screen="scPlay"].on'); if (!scr) return false;
      var btns = scr.querySelectorAll('button, .cell, input');
      for (var i = 0; i < btns.length; i++){ var r = btns[i].getBoundingClientRect(); if (r.width > 0 && r.height > 0) return true; }
      return false;
    })()`);
    ok(lv + ' opens on Play, not locked, has visible interactive board/keypad', onPlay && !lockShown && boardVisible,
      `onPlay=${onPlay} locked=${lockShown} visible=${boardVisible}`);
    ok(lv + ' no JS errors', errs.length === 0, errs.join(' | '));
  }

  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
