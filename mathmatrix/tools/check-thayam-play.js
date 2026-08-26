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

  /* --- Review-round coverage: capture flash, mixed tap-to-choose (home +
     on-board), and a genuine dead-turn auto-pass naming the real next side.
     Each scenario is built directly on window.__thayamPieces()/SetPieces --
     the same save/restore seam Task 6 already exposes -- so it doesn't
     depend on real dice luck, and each is one atomic evaluate (setup,
     forced roll, click, and the DOM read all in the same synchronous tick)
     so there's no sleep-timing race with flashCapture's own 500ms cleanup
     or with any other synchronous DOM write. Side C/D are used for the
     capture so side A's own hasCut/pity state stays untouched for the
     scenarios that follow. */

  // 1) A real capture actually renders the X flash on the cell it happened on.
  const captureResult = await ev(`(function(){
    var pcs = window.__thayamPieces();
    var cCell = window.__thayamRealCell(0, 2, 0);
    var targetCell = window.__thayamRealCell(0, 2, 2);
    pcs.forEach(function(p){
      if (p.side === 'C' && p.idx === 0){ p.lap = 'outer'; p.position = 0; p.lastCell = cCell; }
      if (p.side === 'D' && p.idx === 0){ p.lap = 'outer'; p.position = 2; p.lastCell = targetCell; }
    });
    window.__thayamSetPieces(pcs);
    window.__thayamTurnInit('C');
    window.__thayamRenderAll();
    window.__thayamForceNextRoll({ d0: 2, d1: 0 });
    document.querySelector('.rollBtn[data-side="C"]').click();
    var cellEl = document.querySelector('#thayamGrid [data-thayam-cell="' + targetCell + '"]');
    var dCaptured = window.__thayamPieces().find(function(p){ return p.side === 'D' && p.idx === 0; }).lap === 'home';
    return { flashed: !!(cellEl && cellEl.textContent.indexOf('✕') > -1), dCaptured: dCaptured };
  })()`);
  ok('a real capture actually flashes the X on the cell it happened on', captureResult.flashed === true, JSON.stringify(captureResult));
  ok('...and the captured piece really did go home (the logical half, for context)', captureResult.dCaptured === true, JSON.stringify(captureResult));

  // 2) A mixed home + on-board roll: both are genuinely tappable, and only
  //    the genuinely eligible on-board piece is highlighted -- not a same-
  //    side piece that is on the board but can't use this roll.
  const mixedSetup = await ev(`(function(){
    var pcs = window.__thayamPieces();
    pcs.forEach(function(p){
      if (p.side === 'A' && p.idx === 0){ p.lap = 'outer'; p.position = 5; p.lastCell = window.__thayamRealCell(0, 0, 5); }
      if (p.side === 'A' && p.idx === 2){ p.lap = 'outer'; p.position = 15; p.lastCell = window.__thayamRealCell(0, 0, 15); }
    });
    window.__thayamSetPieces(pcs);
    window.__thayamTurnInit('A');
    window.__thayamRenderAll();
    window.__thayamForceNextRoll({ d0: 1, d1: 0 });
    document.querySelector('.rollBtn[data-side="A"]').click();
    var activeOnBoard = Array.from(document.querySelectorAll('#thayamGrid .thPiece.sideA.active')).map(function(el){ return el.dataset.thayamIdx; });
    var homeActive = document.querySelector('#thTallyA .thHome').classList.contains('active');
    return { activeOnBoard: activeOnBoard, homeActive: homeActive };
  })()`);
  ok('only the genuinely eligible on-board piece (idx 0) is highlighted, not idx 2 (stuck at the last box, no cut yet)',
    mixedSetup.activeOnBoard.length === 1 && mixedSetup.activeOnBoard[0] === '0', JSON.stringify(mixedSetup.activeOnBoard));
  ok('the home count is ALSO marked as a live tap target, since entering a fresh piece is one of the real choices',
    mixedSetup.homeActive === true, String(mixedSetup.homeActive));

  const homeTapResult = await ev(`(function(){
    document.querySelector('#thTallyA .thHome').click();
    return { tally: document.getElementById('thTallyA').textContent, onBoard: document.querySelectorAll('#thayamGrid .thPiece.sideA').length };
  })()`);
  ok('tapping the Store panel\'s home count actually enters that piece -- home count drops to zero', /🏠\s*0/.test(homeTapResult.tally), homeTapResult.tally);
  ok('...and a third pink piece now sits on the board for it', homeTapResult.onBoard === 3, String(homeTapResult.onBoard));

  // 3) A genuine dead turn: nothing legal for the roll, and the auto-pass
  //    message names the real next player, not a generic placeholder.
  const deadTurn = await ev(`(function(){
    var pcs = window.__thayamPieces();
    pcs.forEach(function(p){ if (p.side === 'A'){ p.lap = 'home'; p.position = 0; p.lastCell = null; } });
    window.__thayamSetPieces(pcs);
    window.__thayamPityReset('enter', 'A');
    window.__thayamTurnInit('A');
    window.__thayamRenderAll();
    window.__thayamForceNextRoll({ d0: 3, d1: 0 });
    document.querySelector('.rollBtn[data-side="A"]').click();
    return { say: document.getElementById('thaySay').textContent, active: window.__thayamActiveSide() };
  })()`);
  ok('the auto-pass message names the actual next player, not a generic "next player" placeholder',
    deadTurn.say === 'A has no move for 3 — passing to D.', deadTurn.say);
  ok('...and the turn genuinely passed to D (the real next side in the anti-clockwise order)', deadTurn.active === 'D', deadTurn.active);

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
