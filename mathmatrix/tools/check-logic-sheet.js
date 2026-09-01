/* The LOGIC sheet is generated per board from its block/place counts and goal
   text. A-Z's shape and goal both changed in beta-152, so check the sheet says
   ONE space on all three and carries no leftover two-space wording. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9991;
const FILE = 'file:///' + path.join(__dirname, '..', process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  try { fs.rmSync(path.join(__dirname, '_cpo152'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpo152'),
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  await require('./quiet-audio').early(PORT);
  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push('err'); });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1700);
  await ev(`document.querySelector('.splashPlay').click()`); await sleep(800);

  const want = { fifteen: '15 blocks, 16 places', az: '26 blocks, 27 places', azn: '35 blocks, 36 places' };
  for (const lv of ['fifteen', 'az', 'azn']){
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
    await ev(`document.querySelector('.toggleBtn[data-slide-level="${lv}"]').click()`); await sleep(700);
    const txt = await ev(`(document.getElementById('logicBox')||{}).textContent || ''`);
    ok(lv + ': the sheet counts its blocks and places', txt.indexOf(want[lv]) > -1,
      (txt.match(/\d+ blocks, \d+ places/) || ['(not found)'])[0]);
    ok(lv + ': the sheet says exactly ONE place is empty', /exactly one place is empty/.test(txt),
      (txt.match(/so [^.]{0,40}empty/) || ['(not found)'])[0]);
    ok(lv + ': no leftover two-space wording', !/two spaces|Two spaces|park a block/.test(txt),
      (txt.match(/two spaces|park a block/) || ['clean'])[0]);
  }
  ok('no JS errors', errs.length === 0, errs.length + ' errors');
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
