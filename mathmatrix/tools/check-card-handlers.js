/* Gate Logic's card is wired by id at load and its markup MOVED in beta-151.
   Moving a node should not matter, but "should not" is not a check — open it. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9989;
const FILE = 'file:///' + path.join(__dirname, '..', process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  try { fs.rmSync(path.join(__dirname, '_cpg151'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpg151'),
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 140)); });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1700);
  await ev(`document.querySelector('.splashPlay').click()`); await sleep(800);
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(400);

  // every card that moved, plus its neighbours, must still open its puzzle
  const checks = [
    { id: 'gateListBtn', panel: 'gatePanel', label: 'Gate Logic' },
    { id: 'mult3Tab',    panel: null,        label: 'Multiply Magic' }
  ];
  for (const c of checks){
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
    await ev(`(function(){var b=document.getElementById('${c.id}'); if(b) b.click();})()`); await sleep(900);
    const state = await ev(`(function(){
      // goScreen() toggles a class on [data-screen], it does not set display
      var scr = document.querySelector('[data-screen="scPlay"]');
      var onPlay = scr && scr.classList.contains('on');
      var title = (document.getElementById('appBarTitle')||{}).textContent || '';
      var p = ${c.panel ? `document.getElementById('${c.panel}')` : 'null'};
      var pOpen = p ? (getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0) : null;
      return JSON.stringify({ onPlay: !!onPlay, title: title.trim().slice(0,32), pOpen: pOpen }); })()`);
    const S = JSON.parse(state);
    ok(c.label + ' still opens its puzzle from the list',
      S.onPlay && (c.panel ? S.pOpen : true),
      'play screen ' + S.onPlay + (c.panel ? ', panel ' + S.pOpen : '') + ', bar "' + S.title + '"');
  }
  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
