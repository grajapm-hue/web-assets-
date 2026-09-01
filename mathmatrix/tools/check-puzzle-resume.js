/* AN UNFINISHED PUZZLE SHOULD STILL BE THERE WHEN YOU COME BACK.

   Raja: "can opt in app restore memory to all games like pallanguzhi, hence
   sudoku / 10x10 matrix take more time -- if go and come, existing trial
   should stay is easy to continuing the existing game."

   Pallanguzhi already did this (check-pallanguzhi-resume.js). This covers
   the other three families that have a board: the magic squares, Sudoku,
   and Slide.

   For each it does the thing a player does: make some progress, walk away
   to another puzzle, come back -- and checks the work is still there. Then
   it checks the two ways a game is deliberately ABANDONED (a fresh deal, or
   solving it) really do drop the save, so nobody is handed a stale board
   they already finished with.

   A full page reload is used for the "closed the app" case, since
   localStorage is the only thing that survives it -- the same faithful
   stand-in check-pallanguzhi-resume.js uses. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9986;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cppzresume');
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
  const home = async () => { await ev(`document.getElementById('tab-scHome').click()`); await sleep(250); };

  await sleep(700);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(700);

  // ══════════ MAGIC SQUARES ══════════
  // Use 4x4 so the values are unambiguous, then a second size to prove the
  // two are kept apart rather than sharing one shelf.
  await home();
  await ev(`document.querySelector('.toggleBtn[data-size="4x4"]').click()`); await sleep(700);
  await ev(`(function(){
    var cs = document.querySelectorAll('#board .cell');
    cs[0].value = '7';  cs[0].dispatchEvent(new Event('input', {bubbles:true}));
    cs[1].value = '12'; cs[1].dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  await sleep(400);
  const magicTyped = await ev(`Array.from(document.querySelectorAll('#board .cell')).slice(0,2).map(function(c){return c.value;}).join(',')`);
  ok('4x4: typed two numbers', magicTyped === '7,12', magicTyped);

  // walk away to a different size, then come back
  await home();
  await ev(`document.querySelector('.toggleBtn[data-size="5x5"]').click()`); await sleep(700);
  const fresh5 = await ev(`Array.from(document.querySelectorAll('#board .cell')).slice(0,2).map(function(c){return c.value;}).join(',')`);
  ok('5x5 opens as its own empty board, not carrying the 4x4 work over', fresh5 === ',', JSON.stringify(fresh5));

  await home();
  await ev(`document.querySelector('.toggleBtn[data-size="4x4"]').click()`); await sleep(700);
  const magicBack = await ev(`Array.from(document.querySelectorAll('#board .cell')).slice(0,2).map(function(c){return c.value;}).join(',')`);
  ok('4x4: the half-finished square is still there after going away and back', magicBack === '7,12', magicBack);

  // and after a full reload -- the "closed the app" case
  await send('Page.navigate', { url: FILE });
  for (let i = 0; i < 50; i++){ await sleep(250); if (await ev(`!!document.querySelector('.splashPlay')`)) break; }
  await ev(`document.querySelector('.splashPlay').click()`); await sleep(700);
  await home();
  await ev(`document.querySelector('.toggleBtn[data-size="4x4"]').click()`); await sleep(700);
  const magicReload = await ev(`Array.from(document.querySelectorAll('#board .cell')).slice(0,2).map(function(c){return c.value;}).join(',')`);
  ok('4x4: still there after closing and reopening the app', magicReload === '7,12', magicReload);

  // CLEAR must genuinely abandon it
  await ev(`document.getElementById('clearBtn').click()`); await sleep(500);
  const afterClear = await ev(`localStorage.getItem('mm.save.magic.4x4')`);
  ok('4x4: CLEAR drops the saved square', afterClear === null, String(afterClear));

  // ══════════ SUDOKU ══════════
  await home();
  await ev(`document.querySelector('.toggleBtn[data-sud-level="mini"]').click()`); await sleep(900);
  const sudFilled = await ev(`(function(){
    // fill one blank square with the RIGHT answer, so it is real progress
    var cells = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
    for (var i = 0; i < cells.length; i++){
      if (!cells[i].classList.contains('given')){
        cells[i].click();
        var st = window.__sudPeek ? window.__sudPeek() : null;
        return i;
      }
    }
    return -1;
  })()`);
  // tap a number on the pad (any) -- the value itself does not matter, only
  // that the grid changed and comes back changed
  await ev(`(function(){ var k = document.querySelector('#sudPad [data-sudkey]'); if (k) k.click(); })()`);
  await sleep(500);
  const sudBefore = await ev(`Array.from(document.querySelectorAll('#sudBoard [data-sud]')).map(function(c){return c.textContent.trim();}).join('')`);
  const sudSaved = await ev(`localStorage.getItem('mm.save.sudoku.mini') !== null`);
  ok('Sudoku: a part-filled puzzle gets saved', sudSaved, String(sudSaved));

  await home();
  await ev(`document.querySelector('.toggleBtn[data-size="4x4"]').click()`); await sleep(600);
  await home();
  await ev(`document.querySelector('.toggleBtn[data-sud-level="mini"]').click()`); await sleep(900);
  const sudAfter = await ev(`Array.from(document.querySelectorAll('#sudBoard [data-sud]')).map(function(c){return c.textContent.trim();}).join('')`);
  ok('Sudoku: the same part-filled puzzle comes back, not a new deal',
    sudAfter === sudBefore, sudAfter === sudBefore ? 'identical grid' : 'grid changed');

  await ev(`document.getElementById('sudNew').click()`); await sleep(900);
  const sudAfterNew = await ev(`localStorage.getItem('mm.save.sudoku.mini')`);
  ok('Sudoku: New puzzle drops the saved game', sudAfterNew === null, String(sudAfterNew));

  // ══════════ SLIDE ══════════
  await home();
  await ev(`document.getElementById('slideTab').click()`); await sleep(900);
  /* Make a real move. Only tiles beside the gap can move, so try each in
     turn and stop as soon as the move counter actually goes up -- clicking
     blindly can select a tile without moving anything. */
  for (let i = 0; i < 20; i++){
    const m = await ev(`(document.body.innerText.match(/Moves:\\s*(\\d+)/) || [])[1] || '0'`);
    if (Number(m) > 0) break;
    await ev(`(function(){
      var tiles = document.querySelectorAll('#slideBoard > .slideTile');
      var t = tiles[${i} % tiles.length];
      if (t) t.click();
    })()`);
    await sleep(250);
  }
  await sleep(400);
  const slideMoves1 = await ev(`(document.body.innerText.match(/Moves:\\s*(\\d+)/) || [])[1] || '0'`);
  const slideBoard1 = await ev(`Array.from(document.querySelectorAll('#slideBoard > .slideTile')).map(function(t){return t.textContent.trim();}).join(',')`);
  ok('Slide: made at least one move', Number(slideMoves1) > 0, 'moves=' + slideMoves1);

  await home();
  await ev(`document.querySelector('.toggleBtn[data-size="4x4"]').click()`); await sleep(600);
  await home();
  await ev(`document.getElementById('slideTab').click()`); await sleep(900);
  const slideMoves2 = await ev(`(document.body.innerText.match(/Moves:\\s*(\\d+)/) || [])[1] || '0'`);
  const slideBoard2 = await ev(`Array.from(document.querySelectorAll('#slideBoard > .slideTile')).map(function(t){return t.textContent.trim();}).join(',')`);
  ok('Slide: the half-slid board comes back, not a fresh shuffle',
    slideBoard2 === slideBoard1 && slideMoves2 === slideMoves1,
    'moves ' + slideMoves1 + ' -> ' + slideMoves2 + (slideBoard2 === slideBoard1 ? ', same board' : ', BOARD CHANGED'));

  await ev(`(function(){ var b = document.getElementById('slideShuffle'); if (b) b.click(); })()`); await sleep(700);
  const slideAfterShuffle = await ev(`localStorage.getItem('mm.save.slide.fifteen')`);
  ok('Slide: Shuffle again drops the saved board', slideAfterShuffle === null, String(slideAfterShuffle));

  // ══════════ A CORRUPT SAVE MUST NOT BREAK A PUZZLE ══════════
  await ev(`localStorage.setItem('mm.save.magic.4x4', 'not json');
            localStorage.setItem('mm.save.sudoku.mini', '{"v":1,"cells":[1,2]}');
            localStorage.setItem('mm.save.slide.fifteen', '{"v":1}');`);
  await home();
  await ev(`document.querySelector('.toggleBtn[data-size="4x4"]').click()`); await sleep(700);
  const junkMagic = await ev(`document.querySelectorAll('#board .cell').length > 0`);
  ok('a corrupt magic-square save falls back to a normal empty board', junkMagic === true);
  await home();
  await ev(`document.querySelector('.toggleBtn[data-sud-level="mini"]').click()`); await sleep(900);
  const junkSud = await ev(`document.querySelectorAll('#sudBoard [data-sud]').length`);
  ok('a corrupt Sudoku save falls back to a fresh puzzle', junkSud === 9, String(junkSud));
  await home();
  await ev(`document.getElementById('slideTab').click()`); await sleep(900);
  const junkSlide = await ev(`document.querySelectorAll('#slideBoard > .slideTile').length`);
  ok('a corrupt Slide save falls back to a fresh shuffle', junkSlide > 0, String(junkSlide));

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
