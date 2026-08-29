/* beta-59 smoke: every puzzle still opens clean in portrait, no JS errors,
   after wiring checkPortraitLock() into goScreen()/resize/orientationchange. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9961;
const FILE = 'file:///' + path.join(__dirname, '..', process.env.MM_TARGET || 'beta.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEVELS = ['3x3', '4x4', '5x5', '6x6', '8x8', '10x10', '3cube', 'grid', 'ramanujan', 'binary', 'binary2'];
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  try { fs.rmSync(path.join(__dirname, '_cpg59c'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpg59c'),
    '--window-size=390,844', '--force-device-scale-factor=2', FILE], { stdio: 'ignore' });
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
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1800);
  await ev(`document.querySelector('.splashPlay').click()`); await sleep(1000);

  for (const lv of LEVELS){
    errs = [];
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(220);
    await ev(`document.querySelector('.toggleBtn[data-size="${lv}"]').click()`); await sleep(750);
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
