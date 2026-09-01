/* Raja's real device: opened Sudoku, then Slide, Guess My Number Advance,
   Ramanujan, Gate Logic, Guess My Number Junior, Triangle Magic, 3^3
   Multiply, 3x3 Easy -- and Sudoku's own panel stayed visibly stacked
   underneath every single one of them. Root cause: several tile-open
   handlers hid sibling panels conditionally on currentSize already being
   the exact mode being left, so the first handler that forgot a sibling
   (Slide's own -- it predates Sudoku/Pallanguzhi entirely) permanently
   poisoned currentSize for every handler downstream, even the ones whose
   own hide logic was written correctly.

   This walks a long, real transition chain -- including the EXACT sequence
   from his screenshots -- and after every single switch checks that no
   OTHER special-mode panel is left visible underneath. The grid-puzzle
   family (3x3/4x4/.../ramanujan/triangle/3cube) shares one always-present
   board area rather than its own named panel, so for those the check is
   simply "none of the six special panels are showing". */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9976;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const PANEL_IDS = ['sudokuPanel', 'slidePanel', 'gatePanel', 'binaryPanel', 'palPanel', 'pal4Panel', 'thayamPanel'];

(async () => {
  const tmp = path.join(__dirname, '_diagstackprof');
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp,
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  await require('./quiet-audio').early(PORT);
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
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await sleep(600);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(600);

  const shownPanels = async () => {
    const state = await ev(`JSON.stringify(${JSON.stringify(PANEL_IDS)}.map(function(id){
      var el = document.getElementById(id);
      return { id: id, shown: !!el && getComputedStyle(el).display !== 'none' };
    }))`).then(JSON.parse);
    return state.filter(s => s.shown).map(s => s.id);
  };
  // expectId: a panel id that must be the ONLY one showing, or null meaning
  // "none of the six special panels should be showing" (grid-puzzle family).
  const checkOnly = async (name, expectId) => {
    const shown = await shownPanels();
    const only = expectId ? (shown.length === 1 && shown[0] === expectId) : shown.length === 0;
    ok(name, only, JSON.stringify(shown));
  };

  // The EXACT sequence from Raja's screenshots, plus a few more combinations.
  await ev(`document.querySelector('.toggleBtn[data-sud-level="medium"]').click()`); await sleep(700);
  await checkOnly('Sudoku 9x9 opened fresh -- only sudokuPanel visible', 'sudokuPanel');

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.getElementById('slideTab').click()`); await sleep(700);
  await checkOnly('then Slide 1-15 -- Sudoku not left stacked underneath', 'slidePanel');

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.querySelector('.toggleBtn[data-size="binary2"]').click()`); await sleep(700);
  await checkOnly('then Guess My Number Advance -- nothing stacked underneath', 'binaryPanel');

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.querySelector('.toggleBtn[data-size="ramanujan"]').click()`); await sleep(700);
  await checkOnly('then Ramanujan -- no special panel left showing', null);

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.getElementById('gateListBtn').click()`); await sleep(700);
  await checkOnly('then Gate Logic -- nothing stacked underneath', 'gatePanel');

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.querySelector('.toggleBtn[data-size="binary"]').click()`); await sleep(700);
  await checkOnly('then Guess My Number Junior -- nothing stacked underneath', 'binaryPanel');

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.querySelector('.toggleBtn[data-size="triangle"]').click()`); await sleep(700);
  await checkOnly('then Triangle Magic -- no special panel left showing', null);

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.querySelector('.toggleBtn[data-size="3cube"]').click()`); await sleep(700);
  await checkOnly('then 3-cubed Multiply -- no special panel left showing', null);

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.querySelector('.toggleBtn[data-size="3x3"]').click()`); await sleep(700);
  await checkOnly('then 3x3 Easy -- no special panel left showing (his exact final screenshot)', null);

  // A few extra combinations his sequence didn't hit, to close the audit.
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.getElementById('palTab').click()`); await sleep(700);
  await checkOnly('then Pallanguzhi 2-player -- nothing stacked underneath', 'palPanel');

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(700);
  await checkOnly('then Pallanguzhi 4-player -- nothing stacked underneath', 'pal4Panel');

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.querySelector('.toggleBtn[data-thayam-level="5x5"]').click()`); await sleep(700);
  await checkOnly('then Thayam 5x5 -- nothing stacked underneath', 'thayamPanel');

  /* Both Thayam boards share one panel, so this is not a second panel to check
     for stacking -- it is a check that switching between the two sizes leaves
     the panel in a sane single-panel state, and that the 7x7 tile is wired
     into the same show*Mode discipline as everything else. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.querySelector('.toggleBtn[data-thayam-level="7x7"]').click()`); await sleep(700);
  await checkOnly('then Thayam 7x7 -- nothing stacked underneath', 'thayamPanel');
  const sevenCells = await ev(`document.querySelectorAll('#thayamGrid .thCell').length`);
  ok('...and the 7x7 tile really did build the bigger board', sevenCells === 49, String(sevenCells));

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.querySelector('.toggleBtn[data-thayam-level="5x5"]').click()`); await sleep(700);
  const backTo25 = await ev(`document.querySelectorAll('#thayamGrid .thCell').length`);
  ok('...and going back to 5x5 rebuilds the smaller board, not a 7x7 left behind', backTo25 === 25, String(backTo25));

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.getElementById('slideAzTab').click()`); await sleep(700);
  await checkOnly('back to Slide A-Z from Pallanguzhi 4-player -- nothing stacked underneath', 'slidePanel');

  ok('no JS errors across the whole walk', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
