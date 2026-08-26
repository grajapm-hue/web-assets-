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
      if (p.side === 'C' && p.idx === 0){ p.lap = 0; p.position = 0; p.lastCell = cCell; }
      if (p.side === 'D' && p.idx === 0){ p.lap = 0; p.position = 2; p.lastCell = targetCell; }
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
  /* This case needs a piece that is ON the board but genuinely CANNOT use the
     roll, and the boundary-stuck piece is the clearest one to build. That only
     exists while the cut-mandate is in force -- on the shipped 5x5 setting a
     piece at the boundary simply turns inward, so it would be a legitimate
     candidate and the highlight would rightly include it. Switch the rule on
     for this scenario, and back off straight after. */
  const mixedSetup = await ev(`(function(){
    window.__thayamSetCutMandate(true);
    var pcs = window.__thayamPieces();
    pcs.forEach(function(p){
      if (p.side === 'A' && p.idx === 0){ p.lap = 0; p.position = 5; p.lastCell = window.__thayamRealCell(0, 0, 5); }
      if (p.side === 'A' && p.idx === 2){ p.lap = 0; p.position = 15; p.lastCell = window.__thayamRealCell(0, 0, 15); }
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
  await ev(`window.__thayamSetCutMandate(false)`);   // back to the shipped 5x5 setting

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

  /* --- Final-review-round coverage: C2 (2-player game never routes a turn
     to an unselected side) and I2 (hasCut survives a REAL page reload, not
     just an in-session panel close/reopen). Both go through the real UI --
     real checkboxes, the real Choose Player button, and (for I2) an actual
     CDP Page.reload, not a simulated state reset. */

  // 4) C2: untick C and D via the real checkboxes, start a real 2-player
  //    game via the real Choose Player button, and confirm several forced
  //    dead-turn rolls (no legal move -> auto-pass) only ever cycle A/B.
  await ev(`document.querySelector('#thayamSelect input[data-side="C"]').click()`);
  await ev(`document.querySelector('#thayamSelect input[data-side="D"]').click()`);
  await ev(`document.getElementById('thayamChoose').click()`);
  /* New game, deliberately, and this is load-bearing: Choose player used to
     deal a fresh board, and this block was written when it did. Since it was
     changed to only CYCLE the starter, the board still carried the three A
     pieces the previous scenario put out -- so the "dead turn" rolls below
     were quietly moving real pieces, and if they happened to reach the centre
     the game ended, blocking every later roll and leaving the save behind.
     That is what made this file fail roughly one run in three. Dealing here
     restores the premise the block actually depends on: an empty board, where
     a 3 truly is unusable. */
  await ev(`document.getElementById('thayamNew').click()`);
  await sleep(300);

  const seenSides = [];
  for (let i = 0; i < 6; i++){
    const activeBefore = await ev(`window.__thayamActiveSide()`);
    seenSides.push(activeBefore);
    // Reset THIS side's 'enter' pity right before rolling -- pityCounters are
    // a known, separately-deferred minor that NewGame never resets, so a
    // counter left near its threshold by an earlier scenario in this same
    // file could otherwise force a stray Thayam here and grant a bonus roll,
    // which would keep the turn on one side and make this loop non-deterministic.
    // Resetting keeps this block a clean, guaranteed dead-turn auto-pass.
    await ev(`window.__thayamPityReset('enter', '${activeBefore}')`);
    await ev(`window.__thayamForceNextRoll({ d0: 3, d1: 0 })`);   // total 3 -- with the board freshly dealt above, no home piece can use it and nothing is out to move, so every roll is a genuine dead-turn auto-pass
    await ev(`document.querySelector('.rollBtn[data-side="${activeBefore}"]').click()`);
    await sleep(150);
  }
  ok('a real 2-player game (C and D unticked via the real checkboxes) never lands on an unselected side',
    seenSides.every(s => s === 'A' || s === 'B'), seenSides.join(','));
  ok('...and both enabled sides actually got a turn (not stuck repeating just one)',
    seenSides.includes('A') && seenSides.includes('B'), seenSides.join(','));

  // 5) I2: get A into a real hasCut:true state, let a genuine roll (through
  //    the real Roll button) save it, then reload the page for real -- not
  //    an in-session __thayamRenderAll() re-entry, an actual CDP Page.reload
  //    -- and confirm hasCut survived where a fresh __thayamNewGame would
  //    otherwise reset it to false.
  /* Deal first, so this scenario owns its starting state instead of inheriting
     whatever the four above left behind. Without it the board could already be
     one move from a win, and a win clears the save and blocks further rolls --
     so the assertion below would read a save that was never written and fail
     roughly one run in five, for reasons that have nothing to do with hasCut.
     A test that depends on its predecessors is a test that reports noise. */
  await ev(`document.getElementById('thayamNew').click()`);
  await sleep(250);

  const hasCutSetup = await ev(`(function(){
    var pcs = window.__thayamPieces();
    pcs.forEach(function(p){ if (p.side === 'A' && p.idx === 0){ p.lap = 0; p.position = 3; p.lastCell = window.__thayamRealCell(0, 0, 3); } });
    window.__thayamSetPieces(pcs);
    window.__thayamForceCut('A');
    window.__thayamTurnInit('A');
    window.__thayamRenderAll();
    return window.__thayamHasCut('A');
  })()`);
  ok('A is set up with hasCut:true before the reload', hasCutSetup === true, String(hasCutSetup));

  await ev(`window.__thayamForceNextRoll({ d0: 2, d1: 0 })`);
  await ev(`document.querySelector('.rollBtn[data-side="A"]').click()`);   // a real move, through the real UI, so it goes through the app's own save path
  await sleep(300);

  /* If this ever regresses, the tell is #thaySay reading "Tap the piece you
     want to move" instead of "A rolled 2 — moved": that means the forced roll
     was rewritten into a Thayam, which makes the home pieces eligible too, so
     the board waits for a tap and never saves. */
  const moveSay = await ev(`(document.getElementById('thaySay')||{}).textContent`);
  ok('the forced roll committed a move rather than opening a tap-to-choose prompt',
    /rolled 2/.test(moveSay || ''), moveSay);

  const savedHasCut = await ev(`JSON.parse(localStorage.getItem('mm.save.thayam.5x5') || '{}').hasCut`);
  ok('the save payload itself carries hasCut:true for A before any reload', !!savedHasCut && savedHasCut.A === true, JSON.stringify(savedHasCut));

  await send('Page.enable', {});
  await send('Page.reload', { ignoreCache: false });
  await sleep(1200);

  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(700);
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
  await ev(`document.querySelector('.toggleBtn[data-thayam-level]').click()`); await sleep(700);

  const hasCutAfterReload = await ev(`window.__thayamHasCut('A')`);
  ok("A's hasCut survives a REAL page reload (not just an in-session panel re-entry)", hasCutAfterReload === true, String(hasCutAfterReload));

  /* A GAME SAVED BY THE PREVIOUS BUILD MUST STILL OPEN.
     `lap` used to be the strings 'outer'/'inner'; it is a ring index now. That
     change reached players who may have had a game in progress, so restore
     migrates the old shape instead of discarding it. Written as a real
     old-format save straight into localStorage -- the only way to prove this
     is to feed it exactly what the previous build wrote. */
  const migrated = await ev(`(function(){
    localStorage.setItem('mm.save.thayam.5x5', JSON.stringify({
      v: 1,   // __mmSave stamps this; a save without it is rejected outright, so the old build's saves carry it
      pieces: [
        { side:'A', idx:0, lap:'outer',    position:4, lastCell: window.__thayamRealCell(0,0,4) },
        { side:'A', idx:1, lap:'inner',    position:2, lastCell: window.__thayamRealCell(1,0,2) },
        { side:'A', idx:2, lap:'home',     position:0, lastCell: null },
        { side:'B', idx:0, lap:'finished', position:0, lastCell: null },
        { side:'B', idx:1, lap:'home',     position:0, lastCell: null },
        { side:'B', idx:2, lap:'home',     position:0, lastCell: null }
      ],
      activeSide: 'A',
      enabled: { A:true, B:true, C:false, D:false },
      hasCut: { A:true, B:false, C:false, D:false }
    }));
    var restored = window.__thayamRestore();
    var pcs = window.__thayamPieces();
    return JSON.stringify({
      restored: restored,
      laps: pcs.map(function(p){ return p.side + p.idx + '=' + p.lap; }).join(' '),
      hasCutA: window.__thayamHasCut('A'),
      active: window.__thayamActiveSide()
    });
  })()`).then(JSON.parse);
  ok('a game saved by the PREVIOUS build still loads', migrated.restored === true, JSON.stringify(migrated));
  ok("...with the old 'outer'/'inner' names translated to ring numbers",
    /A0=0/.test(migrated.laps) && /A1=1/.test(migrated.laps), migrated.laps);
  ok("...and 'home' / 'finished' left alone, since they are states and not rings",
    /A2=home/.test(migrated.laps) && /B0=finished/.test(migrated.laps), migrated.laps);
  ok('...and the rest of the saved game survives intact',
    migrated.hasCutA === true && migrated.active === 'A', JSON.stringify(migrated));

  /* RAJA'S REPORT: "after some sequence player B dice not rotating."
     The dice were working. The board was waiting for a tap-to-choose, the
     Roll button was silently doing nothing, and a bonus roll then left the
     "tap a piece" instruction on screen -- so a tap that HAD worked still
     looked ignored. Three ways for a player to conclude the dice are broken,
     none of them involving the dice. Built on a side seat (B) because that is
     where he hit it and where the home chip is smallest. */
  const stuck = await ev(`(function(){
    window.__thayamConfigure({ n: 7, pieces: 5, cutMandate: true });
    window.__thayamNewGame(['A','B','C','D']);
    window.__thayamSetEnabled({ A:true, B:true, C:true, D:true });
    var pcs = window.__thayamPieces();
    pcs.forEach(function(p){
      if (p.side === 'B' && p.idx === 0){ p.lap = 0; p.position = 4; p.lastCell = window.__thayamRealCell(0, window.__thayamSideIndex('B'), 4, 7); }
    });
    window.__thayamSetPieces(pcs);
    window.__thayamTurnInit('B');
    window.__thayamRenderAll();
    var out = {};
    window.__thayamForceNextRoll({ d0: 1, d1: 0 });          // a Thayam: entering AND moving are both legal
    document.querySelector('.rollBtn[data-side="B"]').click();
    out.waiting = document.getElementById('thaySay').textContent;
    out.pieceHighlighted = !!document.querySelector('#thayamGrid .thPiece.sideB.active');
    out.homeChipHighlighted = !!document.querySelector('.thHome[data-thayam-home-side="B"].active');
    document.querySelector('.rollBtn[data-side="B"]').click();   // press Roll into the wait
    out.rollWhilePending = document.getElementById('thaySay').textContent;
    var outCount = function(){ return window.__thayamPieces().filter(function(p){ return p.side === 'B' && typeof p.lap === 'number'; }).length; };
    var before = outCount();
    document.querySelector('.thHome[data-thayam-home-side="B"]').click();
    out.tapEntered = outCount() === before + 1;
    out.afterTap = document.getElementById('thaySay').textContent;
    out.stillBsTurn = window.__thayamActiveSide() === 'B';
    window.__thayamConfigure({ n: 5, pieces: 3, cutMandate: false });
    return JSON.stringify(out);
  })()`).then(JSON.parse);

  ok('a mixed home+board Thayam asks which piece, and marks BOTH choices',
    /Tap the piece/.test(stuck.waiting) && stuck.pieceHighlighted && stuck.homeChipHighlighted, JSON.stringify(stuck));
  ok('pressing Roll while it waits SAYS why, instead of silently doing nothing',
    /Tap one of the glowing pieces first/.test(stuck.rollWhilePending), stuck.rollWhilePending);
  ok('tapping the home chip on a SIDE seat really enters that piece', stuck.tapEntered === true);
  ok('a bonus roll reports itself rather than leaving the tap instruction up',
    /Bonus roll/.test(stuck.afterTap) && !/Tap the piece/.test(stuck.afterTap), stuck.afterTap);
  ok('...and the turn stays with the player who earned the bonus', stuck.stillBsTurn === true);

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
