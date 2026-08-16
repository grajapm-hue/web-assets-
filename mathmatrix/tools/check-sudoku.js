/* Sudoku: the rules it claims, and the one property that matters.

   A puzzle with two answers is a broken puzzle — a child fills it in correctly
   and the app tells them they are wrong. So the board that actually reaches the
   screen is solved here, independently, and the answers are COUNTED. Anything
   less is trusting the generator to be right about itself. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9999;
const FILE = 'file:///' + path.join(__dirname, '..', 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const LEVELS = {
  mini:   { n: 3, bh: 0, bw: 0, diag: false, cards: 'Easy' },
  medium: { n: 9, bh: 3, bw: 3, diag: true,  cards: 'Medium' },
  hard:   { n: 9, bh: 3, bw: 3, diag: true,  cards: 'Hard' },
  master: { n: 9, bh: 3, bw: 3, diag: true,  cards: 'Master' }
};

// an independent solver — deliberately NOT the app's, so a bug in the app's
// rules cannot hide behind the same bug in the checker
function okAt(g, r, c, v, L){
  const n = L.n;
  for (let i = 0; i < n; i++){
    if (i !== c && g[r * n + i] === v) return false;
    if (i !== r && g[i * n + c] === v) return false;
  }
  if (L.bh){
    const br = Math.floor(r / L.bh) * L.bh, bc = Math.floor(c / L.bw) * L.bw;
    for (let a = 0; a < L.bh; a++) for (let b = 0; b < L.bw; b++){
      const k = (br + a) * n + bc + b;
      if (k !== r * n + c && g[k] === v) return false;
    }
  }
  if (L.diag){
    if (r === c) for (let i = 0; i < n; i++) if (i !== r && g[i * n + i] === v) return false;
    if (r + c === n - 1) for (let i = 0; i < n; i++) if (i !== r && g[i * n + (n - 1 - i)] === v) return false;
  }
  return true;
}
function countAnswers(grid, L, cap){
  const n = L.n, g = grid.slice(); let found = 0;
  (function go(){
    if (found >= cap) return;
    let idx = -1;
    for (let i = 0; i < n * n; i++) if (!g[i]){ idx = i; break; }
    if (idx < 0){ found++; return; }
    const r = Math.floor(idx / n), c = idx % n;
    for (let v = 1; v <= n; v++) if (okAt(g, r, c, v, L)){
      g[idx] = v; go(); g[idx] = 0; if (found >= cap) return;
    }
  })();
  return found;
}

(async () => {
  try { fs.rmSync(path.join(__dirname, '_cpsud'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpsud'),
    '--window-size=390,844', FILE], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 170)); });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'shots', n), Buffer.from(r.result.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1800);
  await ev(`document.querySelector('.splashPlay').click()`); await sleep(900);

  const cards = await ev(`Array.from(document.querySelectorAll('.toggleBtn[data-sud-level]')).map(function(b){
    return b.dataset.sudLevel + '|' + b.querySelector('.lvDiff').textContent; })`);
  ok('four sudoku levels, easy to master', cards.length === 4, cards.join('  //  '));
  ok('Sudoku is no longer listed as coming soon',
    !(await ev(`document.body.textContent.indexOf('Sudoku') > -1 && /Sudoku[^]{0,40}Coming soon/.test(document.body.textContent)`)));

  for (const key of Object.keys(LEVELS)){
    const L = LEVELS[key];
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
    await ev(`document.querySelector('.toggleBtn[data-sud-level="${key}"]').click()`); await sleep(1400);

    const state = await ev(`(function(){
      var cells = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
      return JSON.stringify({
        count: cells.length,
        given: cells.map(function(c){ return c.classList.contains('given') ? 1 : 0; }),
        vals:  cells.map(function(c){ return c.textContent.trim() ? parseInt(c.textContent, 10) : 0; }),
        diag:  cells.map(function(c){ return c.classList.contains('diag') ? 1 : 0; }),
        pad:   document.querySelectorAll('#sudPad [data-sudkey]').length
      }); })()`);
    const S = JSON.parse(state);

    ok(key + ': board is ' + L.n + '×' + L.n, S.count === L.n * L.n, S.count + ' cells');
    ok(key + ': number pad offers 1-' + L.n + ' and an eraser', S.pad === L.n + 1, S.pad + ' keys');

    const diagCount = S.diag.reduce((a, b) => a + b, 0);
    ok(key + (L.diag ? ': both diagonals are marked' : ': no diagonals marked, as chosen'),
      L.diag ? diagCount === 2 * L.n - 1 : diagCount === 0, diagCount + ' shaded cells');

    const givenCount = S.given.reduce((a, b) => a + b, 0);
    ok(key + ': every given matches a number on the board',
      S.given.every((g, i) => !g || S.vals[i] > 0), givenCount + ' given');

    /* THE claim: solve the board that reached the screen and count the answers. */
    const answers = countAnswers(S.vals, L, 2);
    ok(key + ': the puzzle on screen has exactly ONE answer', answers === 1,
      answers === 0 ? 'NO answer — unsolvable' : answers === 1 ? givenCount + ' given, one answer' : 'TWO OR MORE answers');

    // fewer clues as the levels go up is the whole difficulty model
    LEVELS[key].measuredGiven = givenCount;
    if (key === 'mini') await shot('sudoku-mini.png');
    if (key === 'medium') await shot('sudoku-medium.png');
  }

  ok('difficulty really is fewer numbers given',
    LEVELS.medium.measuredGiven > LEVELS.hard.measuredGiven &&
    LEVELS.hard.measuredGiven > LEVELS.master.measuredGiven,
    'medium ' + LEVELS.medium.measuredGiven + ' > hard ' + LEVELS.hard.measuredGiven +
    ' > master ' + LEVELS.master.measuredGiven);

  /* Playing: a right number stays black, a wrong one turns red, and neither
     ever ends the game — Raja's rule, since the motivation is not to test. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
  await ev(`document.querySelector('.toggleBtn[data-sud-level="mini"]').click()`); await sleep(900);
  const play = await ev(`(function(){
    var cells = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
    var blank = cells.findIndex(function(c){ return !c.classList.contains('given'); });
    if (blank < 0) return JSON.stringify({ error: 'no blank cell' });
    cells[blank].click();
    var picked = document.querySelectorAll('#sudBoard .pick').length;
    var peers  = document.querySelectorAll('#sudBoard .peer').length;
    // find a digit that is definitely WRONG here: one already in this row
    var n = 3, r = Math.floor(blank / n);
    var inRow = [];
    for (var i = 0; i < n; i++){ var t = cells[r * n + i].textContent.trim(); if (t) inRow.push(t); }
    if (!inRow.length) return JSON.stringify({ error: 'row was empty' });
    var badKey = document.querySelector('#sudPad [data-sudkey="' + inRow[0] + '"]');
    badKey.click();
    var after = document.querySelectorAll('#sudBoard [data-sud]')[blank];
    return JSON.stringify({ picked: picked, peers: peers,
      showsBad: after.classList.contains('bad'), value: after.textContent.trim() });
  })()`);
  const P = JSON.parse(play);
  ok('tapping a square selects it and shades what it can see',
    P.picked === 1 && P.peers > 0, P.error ? 'test could not run: ' + P.error : 'picked ' + P.picked + ', shaded ' + P.peers);
  ok('a number that breaks a rule turns red', P.showsBad === true,
    P.error ? 'test could not run: ' + P.error : 'value "' + P.value + '", red: ' + P.showsBad);
  /* Scan what a PLAYER reads, not document.body.textContent — the stylesheet
     lives inside the body, so its comments are in that string and the word
     "mistake" in a CSS comment failed this check while the screen was correct. */
  const visible = await ev(`(function(){
    var c = document.body.cloneNode(true);
    c.querySelectorAll('script,style').forEach(function(e){ e.remove(); });
    return c.textContent; })()`);
  ok('nothing was lost for it — no mistake counter, no game over',
    !/mistake|lost this game|game over/i.test(visible || ''),
    (visible || '').match(/mistake|lost this game|game over/i) || 'clean');

  /* Raja: "instantly temporary grey shade ... to know the number are already
     placed and should avoid to enter." The count is worked out here from the
     rules, independently, so the app agreeing with itself proves nothing. The
     FIRST version shaded only empty peers and hid the cells holding numbers —
     exactly the ones worth seeing — so givens must be shaded too. */
  for (const key of ['mini', 'medium']){
    const L = LEVELS[key], n = L.n;
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
    await ev(`document.querySelector('.toggleBtn[data-sud-level="${key}"]').click()`); await sleep(1300);
    const probe = await ev(`(function(){
      var cells = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
      cells[0].click();
      var after = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
      return JSON.stringify({
        shaded: after.filter(function(c){ return c.classList.contains('peer'); }).length,
        shadedGivens: after.filter(function(c){ return c.classList.contains('peer') && c.classList.contains('given'); }).length,
        pickShaded: after[0].classList.contains('peer')
      }); })()`);
    const P2 = JSON.parse(probe);
    // cell 0 sees: its row, its column, its box, and (on 9x9) the main diagonal
    const seen = new Set();
    for (let i = 0; i < n; i++){ seen.add(0 * n + i); seen.add(i * n + 0); }
    if (L.bh) for (let a = 0; a < L.bh; a++) for (let b = 0; b < L.bw; b++) seen.add(a * n + b);
    if (L.diag) for (let i = 0; i < n; i++) seen.add(i * n + i);   // cell 0 is on the main diagonal
    seen.delete(0);
    ok(key + ': picking a square shades every square it can see', P2.shaded === seen.size,
      P2.shaded + ' shaded, ' + seen.size + ' expected');
    ok(key + ': the shading includes squares that already hold a number',
      P2.shadedGivens > 0, P2.shadedGivens + ' given squares shaded');
    ok(key + ': the picked square itself is not shaded', P2.pickShaded === false);
    if (key === 'medium') await shot('sudoku-shading.png');
  }

  /* The timer: Raja asked for it "to know one how long take spend time to play,
     not for competitive". So it must actually advance, and it must STOP when
     the puzzle is done — a clock still running afterwards makes the number mean
     nothing. Solved here by writing the stored answer straight in. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
  await ev(`document.querySelector('.toggleBtn[data-sud-level="mini"]').click()`); await sleep(900);
  const t1 = await ev(`document.getElementById('sudTime').textContent`);
  await sleep(2600);
  const t2 = await ev(`document.getElementById('sudTime').textContent`);
  ok('the timer counts the time spent playing', t1 !== t2, t1 + ' -> ' + t2);

  /* The answer is worked out HERE rather than read out of the app — production
     code should not grow a hook that exists only so a test can cheat. */
  const board = await ev(`Array.from(document.querySelectorAll('#sudBoard [data-sud]')).map(function(c){
    return c.textContent.trim() ? parseInt(c.textContent, 10) : 0; })`);
  const answer = (function solveIt(grid, L){
    const n = L.n, g = grid.slice();
    (function go(){
      let idx = -1;
      for (let i = 0; i < n * n; i++) if (!g[i]){ idx = i; break; }
      if (idx < 0) return true;
      const r = Math.floor(idx / n), c = idx % n;
      for (let v = 1; v <= n; v++) if (okAt(g, r, c, v, L)){
        g[idx] = v; if (go()) return true; g[idx] = 0;
      }
      return false;
    })();
    return g;
  })(board, LEVELS.mini);
  const solved = await ev(`(function(){
    var answer = ${JSON.stringify(answer)};
    var cells = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
    for (var i = 0; i < cells.length; i++){
      if (cells[i].classList.contains('given')) continue;
      document.querySelectorAll('#sudBoard [data-sud]')[i].click();
      var k = document.querySelector('#sudPad [data-sudkey="' + answer[i] + '"]');
      if (k) k.click();
    }
    return document.getElementById('sudHead').textContent;
  })()`);
  ok('solving stops the clock and reports the time spent',
    /Solved/.test(solved || '') && /took you/.test(solved || ''), (solved || '').slice(0, 90));
  const tSolved = await ev(`document.getElementById('sudTime').textContent`);
  await sleep(2400);
  const tLater = await ev(`document.getElementById('sudTime').textContent`);
  ok('and the clock does not keep running after the win', tSolved === tLater, tSolved + ' -> ' + tLater);

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
