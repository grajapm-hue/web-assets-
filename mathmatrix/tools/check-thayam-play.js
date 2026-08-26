/* A REAL PLAYTHROUGH, THROUGH THE ACTUAL UI -- ROLL, WATCH A PIECE MOVE,
   CONFIRM THE STORE PANEL'S THREE-WAY TALLY UPDATES, THEN SAVE/RESUME. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9934;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpthayamplay');
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
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

  await sleep(700);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(700);
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
  await ev(`document.querySelector('.toggleBtn[data-thayam-level]').click()`); await sleep(700);

  // Force a Thayam so this test doesn't depend on real dice luck.
  await ev(`window.__thayamForceNextRoll({ d0: 1, d1: 0 })`);
  await ev(`document.querySelector('.rollBtn[data-side="A"]').click()`);
  await sleep(400);

  const tally = await ev(`document.getElementById('thTallyA').textContent`);
  ok("A's tally shows one piece now running, after a Thayam roll", /🏃\s*1/.test(tally), tally);

  const onBoard = await ev(`document.querySelectorAll('#thayamGrid .thPiece.sideA').length`);
  ok("a pink piece is now rendered on the board", onBoard === 1, String(onBoard));

  // Save/resume, same shape as every other puzzle this session.
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
  const savedRaw = await ev(`localStorage.getItem('mm.save.thayam.5x5')`);
  ok('a game in progress is saved', savedRaw !== null);

  await ev(`document.querySelector('.toggleBtn[data-thayam-level]').click()`); await sleep(700);
  const onBoardAfter = await ev(`document.querySelectorAll('#thayamGrid .thPiece.sideA').length`);
  ok('reopening the tile restores the same in-progress game, not a fresh deal', onBoardAfter === 1, String(onBoardAfter));

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
