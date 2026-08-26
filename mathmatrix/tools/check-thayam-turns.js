/* TURN ORDER IS ANTI-CLOCKWISE (A -> D -> C -> B), REUSING PALLANGUZHI
   4-PLAYER'S OWN FIXED CONVENTION -- NOT A NEW ONE. AND A DEAD TURN PASSES
   ITSELF, WITH NO SKIP BUTTON INVOLVED. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9933;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpthayamturns');
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

  await ev(`window.__thayamNewGame(['A','B','C','D']); window.__thayamTurnInit('A')`);
  const order = await ev(`(function(){
    var seen = [];
    for (var i = 0; i < 5; i++){
      seen.push(window.__thayamTurnState().active);
      window.__thayamEndTurn();
    }
    return JSON.stringify(seen);
  })()`).then(JSON.parse);
  ok('turn order is A -> D -> C -> B -> A, anti-clockwise', JSON.stringify(order) === JSON.stringify(['A','D','C','B','A']), order.join('>'));

  // No legal move: every piece home, roll is not a Thayam -> dead turn.
  await ev(`window.__thayamNewGame(['A','B']); window.__thayamTurnInit('A')`);
  const dead = await ev(`window.__thayamLegalMoveExists(0, 3)`);
  ok('no piece can use a roll of 3 when everything is still at home', dead === false);
  const live = await ev(`window.__thayamLegalMoveExists(0, 1)`);
  ok('a Thayam (1) IS a legal move when pieces are at home', live === true);

  // Win condition: once every one of a side's pieces is finished, that side wins.
  await ev(`window.__thayamNewGame(['A','B'])`);
  await ev(`(function(){
    var pieces = window.__thayamPieces().filter(function(p){ return p.side === 'A'; });
    pieces.forEach(function(p){ p.lap = 'finished'; });
  })()`);
  const winner = await ev(`window.__thayamGameOver()`);
  ok("side A wins once all 3 of its pieces are finished", winner === 'A', String(winner));

  const noWinnerYet = await ev(`(function(){
    window.__thayamNewGame(['A','B']);
    return window.__thayamGameOver();
  })()`);
  ok('no winner at the start of a fresh game', noWinnerYet === null, String(noWinnerYet));

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
