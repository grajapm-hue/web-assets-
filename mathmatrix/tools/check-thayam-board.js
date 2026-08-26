/* THE 5x5 THAYAM BOARD RENDERS WITH THE RIGHT MOUNT SQUARES.

   Nine safe squares total: four colours' own gates at the edge-midpoints,
   one more diagonal-inward square each near a different corner, plus the
   centre goal -- the exact pinwheel pattern confirmed against Raja's own
   marked-up photo earlier in the design conversation, not the PDF's
   "4 corners" claim (which the photo contradicted). */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9930;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpthayamboard');
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

  ok('the Thayam panel is showing', await ev(`document.body.classList.contains('thayamMode')`));
  ok('the 5x5 grid rendered 25 cells', (await ev(`document.querySelectorAll('#thayamGrid .thCell').length`)) === 25);

  const safeCount = await ev(`document.querySelectorAll('#thayamGrid .thCell.thSafe').length`);
  ok('8 Mount squares (4 gate cells + 4 inner-ring axis cells)', safeCount === 8, String(safeCount));

  // C1 + I1 together: not just a count -- the EXACT flat cell each Mount sits
  // on, ground-truthed against the approved mockup's own literal SAFE grid
  // (mathmatrix/tools/_mock-thayam-table.html), independently hand-parsed
  // from its 5x5 markup: A(pink)=2,6 D(green)=10,16 C(yellow)=18,22 B(blue)=8,14.
  const mountCells = await ev(`Array.from(document.querySelectorAll('#thayamGrid .thCell.thSafe'))
    .map(function(el){ return { cell: parseInt(el.dataset.thayamCell, 10), side: el.className.match(/entry-(\\w)/)[1] }; })
    .sort(function(a, b){ return a.cell - b.cell; })`);
  const expectedMounts = [
    { cell: 2, side: 'A' }, { cell: 6, side: 'A' },
    { cell: 8, side: 'B' }, { cell: 10, side: 'D' },
    { cell: 14, side: 'B' }, { cell: 16, side: 'D' },
    { cell: 18, side: 'C' }, { cell: 22, side: 'C' },
  ];
  ok('every Mount cell number + owning colour matches the approved mockup exactly',
    JSON.stringify(mountCells) === JSON.stringify(expectedMounts), JSON.stringify(mountCells));

  // The centre is a 9th square nothing can be captured on -- a rules-level
  // count, not a shared CSS class: the approved mockup renders it plain
  // (.thCenter only, no .thSafe crosshatch layered over its turn-indicator).
  const centerCount = await ev(`document.querySelectorAll('#thayamGrid .thCell.thCenter').length`);
  ok('exactly one centre goal cell', centerCount === 1, String(centerCount));

  const st = await ev(`JSON.stringify(window.__thayamState())`).then(JSON.parse);
  ok('board state exposes 25 cells', st.cells.length === 25, String(st.cells.length));

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
