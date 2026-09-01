/* Raja: "implement app memory to continue the game from where we left over,
   go back or app closed by slide up the app or phone is off -- except
   manually closed the game by clear or new game."

   The real trigger (backgrounding/closing) can't be produced from inside the
   same page, so this drives the actual observable contract instead: play a
   move, reload the page (a fresh page load is what "app was closed and
   reopened" looks like from here -- localStorage is the only thing that
   survives it), reopen the tile, and check the SAME game is sitting there --
   not a fresh 35/35 board. Then confirm New Game is still the one thing that
   throws it away, on both boards, plus a corrupted-save fallback. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9997;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpresume');
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
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || ''));
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  /* A real reload -- not a JS reset -- is the only faithful stand-in for
     "the app was actually closed and reopened": it wipes every JS variable
     and leaves only localStorage standing, exactly like a real app kill. */
  const reload = async () => {
    await send('Page.navigate', { url: FILE });
    for (let i = 0; i < 40; i++){ await sleep(200);
      if (await ev(`!!document.getElementById('palTab')`)) return; }
  };

  const state2 = () => ev(`window.__palState ? JSON.stringify(window.__palState()) : "null"`).then(JSON.parse);
  const state4 = () => ev(`window.__pal4State ? JSON.stringify(window.__pal4State()) : "null"`).then(JSON.parse);

  const waitIdle2 = async () => { for (let i = 0; i < 100; i++){ const s = await state2(); if (!s.busy) return s; await sleep(80); } return state2(); };
  const waitIdle4 = async () => { for (let i = 0; i < 100; i++){ const s = await state4(); if (!s.busy) return s; await sleep(80); } return state4(); };

  // ---- 2-PLAYER BOARD ----
  await ev(`document.getElementById('palTab').click()`);
  await sleep(300);
  await ev(`document.querySelector('#palSide1 .palStore').click()`);
  await waitIdle2();
  await ev(`document.querySelector('#palSide2 .palStore').click()`);
  for (let i = 0; i < 100; i++){ const s = await state2(); if (s.playing && !s.busy) break; await sleep(80); }
  const before2 = await state2();
  ok('2-player: a fresh deal is actually playing before we test anything', before2.playing && !before2.busy, JSON.stringify(before2));
  const freshCups2 = before2.cups.slice();
  /* From a completely full board, cup 0's move relay-chains a long way (every
     cup it lands in is already occupied, so it keeps going) -- long enough
     that waiting for it to settle on its own is slow and flaky to time out
     correctly. Reloading WHILE it's still mid-air is the more interesting
     case anyway: it is exactly what a real backgrounded app looks like, and
     it is pagehide (fired by the navigate itself) -- not a wait loop -- that
     has to catch it, via __palStop(), same as it would on a real phone. */
  await ev(`document.querySelector('#palBoard [data-pal="0"]').click()`);
  await sleep(150);   // long enough to be genuinely mid-air, not for it to finish

  await reload();
  await ev(`document.getElementById('palTab').click()`);
  await sleep(400);
  const resumed2 = await state2();
  const seeds2 = resumed2.store[0] + resumed2.store[1] + resumed2.cups.reduce((a, b) => a + b, 0);
  ok('2-player: reopening after a reload resumes a settled game, not a fresh one, seeds intact',
    !resumed2.busy && resumed2.everDealt === true && seeds2 === 70 &&
    JSON.stringify(resumed2.cups) !== JSON.stringify(freshCups2),
    JSON.stringify(resumed2));

  await ev(`document.getElementById('palNew').click()`);
  await sleep(200);
  const savedAfterNew2 = await ev(`localStorage.getItem('mmPalSave')`);
  ok('2-player: New Game clears the save', savedAfterNew2 === null, savedAfterNew2);
  await reload();
  await ev(`document.getElementById('palTab').click()`);
  await sleep(400);
  const fresh2 = await state2();
  ok('2-player: reopening after New Game + reload starts genuinely fresh',
    fresh2.round === 1 && fresh2.store[0] === 35 && fresh2.store[1] === 35 && !fresh2.everDealt,
    JSON.stringify(fresh2));

  // ---- 4-PLAYER BOARD ----
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
  await ev(`document.getElementById('pal4Tab').click()`);
  await sleep(300);
  for (const s of ['A', 'B', 'C', 'D']){
    await ev(`document.querySelector('#pal4Card${s} .pal4CardStore').click()`);
    await waitIdle4();
  }
  for (let i = 0; i < 100; i++){ const s = await state4(); if (s.playing && !s.busy) break; await sleep(80); }
  const before4 = await state4();
  ok('4-player: a fresh deal is actually playing before we test anything', before4.playing && !before4.busy, JSON.stringify(before4));
  const freshCups4 = before4.cups.slice();
  // same reasoning as the 2-player board: reload it mid-air on purpose,
  // relying on pagehide + __pal4Stop() to settle it, not a wait loop
  await ev(`document.querySelector('#pal4Frame .pal4Cup.sideA').click()`);
  await sleep(150);

  await reload();
  await ev(`document.getElementById('pal4Tab').click()`);
  await sleep(400);
  const resumed4 = await state4();
  const seeds4 = resumed4.store.reduce((a, b) => a + b, 0) + resumed4.cups.reduce((a, b) => a + b, 0);
  ok('4-player: reopening after a reload resumes a settled game, not a fresh one, seeds intact',
    !resumed4.busy && resumed4.everDealt === true && seeds4 === 140 &&
    JSON.stringify(resumed4.cups) !== JSON.stringify(freshCups4),
    JSON.stringify(resumed4));

  await ev(`document.getElementById('pal4New').click()`);
  await sleep(200);
  const savedAfterNew4 = await ev(`localStorage.getItem('mmPal4Save')`);
  ok('4-player: New Game clears the save', savedAfterNew4 === null, savedAfterNew4);
  await reload();
  await ev(`document.getElementById('pal4Tab').click()`);
  await sleep(400);
  const fresh4 = await state4();
  ok('4-player: reopening after New Game + reload starts genuinely fresh',
    fresh4.round === 1 && fresh4.store.every(n => n === 35) && !fresh4.everDealt,
    JSON.stringify(fresh4));

  // ---- CORRUPTED SAVE FALLS BACK CLEANLY, DOESN'T CRASH ----
  await ev(`localStorage.setItem('mmPalSave', 'not json at all')`);
  await ev(`localStorage.setItem('mmPal4Save', '{"v":1,"cups":[1,2]}')`);   // right shape key, wrong length
  await reload();
  await ev(`document.getElementById('palTab').click()`); await sleep(300);
  const junkFallback2 = await state2();
  ok('2-player: a corrupted save falls back to a fresh game instead of crashing',
    junkFallback2.round === 1 && !junkFallback2.everDealt, JSON.stringify(junkFallback2));
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(300);
  const junkFallback4 = await state4();
  ok('4-player: a malformed save falls back to a fresh game instead of crashing',
    junkFallback4.round === 1 && !junkFallback4.everDealt, JSON.stringify(junkFallback4));

  ok('no JS errors', errs.length === 0, errs.join(' | '));

  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');
  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
