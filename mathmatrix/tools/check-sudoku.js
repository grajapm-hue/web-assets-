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
    /* Pick a blank cell that HAS a number to collide with. The first version
       took the first blank and looked only along its row — on a 3x3 with four
       givens that row is sometimes empty, so the check quietly could not run
       and reported a failure that said nothing about the app. Search rows AND
       columns, and take the first blank that has something to clash with. */
    var n = 3, blank = -1, clashDigit = 0;
    for (var b = 0; b < cells.length && blank < 0; b++){
      if (cells[b].classList.contains('given')) continue;
      var r0 = Math.floor(b / n), c0 = b % n;
      for (var k = 0; k < n; k++){
        var inRow = cells[r0 * n + k].textContent.trim();
        var inCol = cells[k * n + c0].textContent.trim();
        if (inRow && r0 * n + k !== b){ blank = b; clashDigit = parseInt(inRow, 10); break; }
        if (inCol && k * n + c0 !== b){ blank = b; clashDigit = parseInt(inCol, 10); break; }
      }
    }
    if (blank < 0) return JSON.stringify({ error: 'no blank cell had anything to clash with' });
    cells[blank].click();
    var picked = document.querySelectorAll('#sudBoard .pick').length;
    var peers  = document.querySelectorAll('#sudBoard .peer').length;
    var badKey = document.querySelector('#sudPad [data-sudkey="' + clashDigit + '"]');
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

  /* Raja: "ensure it wrong Number enter cell should flash red alert."
     Red on its own was already there and was STATIC. What has to be true now is
     that entering a colliding number ANIMATES, and that the squares already
     holding that number animate with it, so the alert says WHERE the clash is. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
  await ev(`document.querySelector('.toggleBtn[data-sud-level="medium"]').click()`); await sleep(1400);
  const flash = await ev(`(function(){
    var cells = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
    // find a blank cell whose row already holds a number, and enter that number
    var n = 9, target = -1, digit = 0;
    for (var i = 0; i < cells.length && target < 0; i++){
      if (cells[i].classList.contains('given')) continue;
      var r = Math.floor(i / n);
      for (var c = 0; c < n; c++){
        var t = cells[r * n + c].textContent.trim();
        if (t && r * n + c !== i){ target = i; digit = parseInt(t, 10); break; }
      }
    }
    if (target < 0) return JSON.stringify({ error: 'no suitable cell' });
    document.querySelectorAll('#sudBoard [data-sud]')[target].click();
    document.querySelector('#sudPad [data-sudkey="' + digit + '"]').click();
    var after = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
    var cell = after[target];
    var anim = getComputedStyle(cell).animationName;
    return JSON.stringify({
      digit: digit,
      flashing: cell.classList.contains('flash'),
      animation: anim,
      red: cell.classList.contains('bad'),
      clashing: after.filter(function(c){ return c.classList.contains('clash'); }).length
    }); })()`);
  const F = JSON.parse(flash);
  ok('a colliding number flashes, not just turns red',
    F.flashing === true && F.animation === 'sudFlash',
    F.error || 'entered ' + F.digit + ', animation "' + F.animation + '"');
  ok('the squares already holding that number flash too, showing where the clash is',
    F.clashing > 0, F.error || F.clashing + ' squares marked');
  ok('and it stays red after the flash, as a record', F.red === true, F.error || 'red: ' + F.red);
  /* The animation peaks between 20% and 60% of its 780ms, so a screenshot taken
     the instant the number is entered catches it between pulses and looks like
     nothing happened. Wait for the peak before capturing, or the picture is
     evidence of the wrong thing. */
  await sleep(260);
  await shot('sudoku-flash.png');

  // the flash must not stick: a re-render for any other reason should not replay it
  await sleep(1100);
  const settled = await ev(`JSON.stringify({
    flash: document.querySelectorAll('#sudBoard .flash').length,
    clash: document.querySelectorAll('#sudBoard .clash').length,
    red:   document.querySelectorAll('#sudBoard .bad').length })`);
  const S2 = JSON.parse(settled);
  ok('the alert clears itself but the red stays',
    S2.flash === 0 && S2.clash === 0 && S2.red > 0,
    'flash ' + S2.flash + ', clash ' + S2.clash + ', still red ' + S2.red);

  /* Finish a FULL 9x9 with diagonals. The win had only ever been exercised on
     the 3x3, and a fault in it would cost a player twenty minutes of real work
     before showing itself — the most expensive place in this puzzle to be
     wrong. Filling all 36 blanks also drives every digit to nine copies, which
     is the only way the "spent" ticks are all reached. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
  await ev(`document.querySelector('.toggleBtn[data-sud-level="medium"]').click()`); await sleep(1500);
  const big = await ev(`Array.from(document.querySelectorAll('#sudBoard [data-sud]')).map(function(c){
    return c.textContent.trim() ? parseInt(c.textContent, 10) : 0; })`);
  const bigAnswer = (function solveIt(grid, L){
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
  })(big, LEVELS.medium);
  ok('the 9×9 on screen is solvable at all', bigAnswer.every(v => v > 0));
  const bigWin = await ev(`(function(){
    var answer = ${JSON.stringify(bigAnswer)};
    var cells = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
    for (var i = 0; i < cells.length; i++){
      if (cells[i].classList.contains('given')) continue;
      document.querySelectorAll('#sudBoard [data-sud]')[i].click();
      var k = document.querySelector('#sudPad [data-sudkey="' + answer[i] + '"]');
      if (k) k.click();
    }
    var board = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
    return JSON.stringify({
      head: document.getElementById('sudHead').textContent,
      red: board.filter(function(c){ return c.classList.contains('bad'); }).length,
      blank: board.filter(function(c){ return !c.textContent.trim(); }).length,
      ticks: Array.from(document.querySelectorAll('#sudPad [data-sudkey]'))
               .filter(function(b){ return b.textContent.trim() === '✓'; }).length,
      counter: document.getElementById('sudFilled').textContent
    }); })()`);
  const B = JSON.parse(bigWin);
  ok('finishing a 9×9 announces the win', /Solved/.test(B.head), B.head.slice(0, 78));
  ok('the win names box and diagonal, which the 3×3 cannot',
    /box/.test(B.head) && /diagonal/.test(B.head), B.head.slice(0, 78));
  ok('the win reports the time spent', /took you/.test(B.head));
  ok('a finished 9×9 has no blanks and nothing red',
    B.blank === 0 && B.red === 0, B.blank + ' blank, ' + B.red + ' red');
  ok('every digit shows its tick once all nine are placed', B.ticks === 9, B.ticks + ' ticks');
  ok('the counter reads all 36 filled', /36 of 36/.test(B.counter), B.counter);
  await shot('sudoku-win-9x9.png');

  /* Raja: "if any sub box 3x3 we'll finished, turn all number in 9 cells to
     green to build eye show confidence." Complete one box deliberately — the
     answer is worked out here, not read from the app — and check all nine go
     green, that the rest of the board does NOT, and that breaking it takes the
     green away again. A reward that never leaves would stop meaning anything. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
  await ev(`document.querySelector('.toggleBtn[data-sud-level="medium"]').click()`); await sleep(1500);
  const boardB = await ev(`Array.from(document.querySelectorAll('#sudBoard [data-sud]')).map(function(c){
    return c.textContent.trim() ? parseInt(c.textContent, 10) : 0; })`);
  const ansB = (function solveIt(grid, L){
    const n = L.n, g = grid.slice();
    (function go(){
      let idx = -1;
      for (let i = 0; i < n * n; i++) if (!g[i]){ idx = i; break; }
      if (idx < 0) return true;
      const r = Math.floor(idx / n), c = idx % n;
      for (let v = 1; v <= n; v++) if (okAt(g, r, c, v, L)){ g[idx] = v; if (go()) return true; g[idx] = 0; }
      return false;
    })();
    return g;
  })(boardB, LEVELS.medium);
  // fill only the top-left box
  const boxIdx = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) boxIdx.push(r * 9 + c);
  const boxRes = await ev(`(function(){
    var answer = ${JSON.stringify(ansB)}, box = ${JSON.stringify(boxIdx)};
    for (var b = 0; b < box.length; b++){
      var i = box[b];
      var cells = document.querySelectorAll('#sudBoard [data-sud]');
      if (cells[i].classList.contains('given')) continue;
      cells[i].click();
      var k = document.querySelector('#sudPad [data-sudkey="' + answer[i] + '"]');
      if (k) k.click();
    }
    var after = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
    var greenInBox = box.filter(function(i){ return after[i].classList.contains('done'); }).length;
    var greenOutside = after.filter(function(c, i){
      return box.indexOf(i) < 0 && c.classList.contains('done'); }).length;
    return JSON.stringify({ greenInBox: greenInBox, greenOutside: greenOutside }); })()`);
  const BX = JSON.parse(boxRes);
  ok('finishing a 3×3 box turns all nine of its numbers green',
    BX.greenInBox === 9, BX.greenInBox + ' of 9 green');
  ok('and only that box — the unfinished ones stay as they were',
    BX.greenOutside === 0, BX.greenOutside + ' green squares outside it');
  await shot('sudoku-box-done.png');

  // breaking it must take the green back
  const broke = await ev(`(function(){
    var box = ${JSON.stringify(boxIdx)};
    var cells = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
    var mine = box.filter(function(i){ return !cells[i].classList.contains('given'); });
    if (!mine.length) return JSON.stringify({ error: 'the box was entirely given' });
    document.querySelectorAll('#sudBoard [data-sud]')[mine[0]].click();
    document.querySelector('#sudPad [data-sudkey="0"]').click();
    var after = Array.from(document.querySelectorAll('#sudBoard [data-sud]'));
    return JSON.stringify({ stillGreen: box.filter(function(i){
      return after[i].classList.contains('done'); }).length }); })()`);
  const BR = JSON.parse(broke);
  ok('erasing one number takes the green back off the whole box',
    BR.error ? false : BR.stillGreen === 0,
    BR.error || BR.stillGreen + ' still green');

  /* THE CASE THAT CONFUSED RAJA TWICE, now the defining one.
     sudoku.com marks a number red when it differs from the stored answer, even
     when nothing on the board clashes with it — his 3 was legal by every rule
     and still went red. He asked for the same behaviour, because his group
     plays on that site. So find a number that breaks NO rule here and is still
     not the answer, and check it goes red anyway. Without this the old
     rule-only behaviour would pass every other check silently. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
  await ev(`document.querySelector('.toggleBtn[data-sud-level="medium"]').click()`); await sleep(1500);
  const boardC = await ev(`Array.from(document.querySelectorAll('#sudBoard [data-sud]')).map(function(c){
    return c.textContent.trim() ? parseInt(c.textContent, 10) : 0; })`);
  const ansC = (function solveIt(grid, L){
    const n = L.n, g = grid.slice();
    (function go(){
      let idx = -1;
      for (let i = 0; i < n * n; i++) if (!g[i]){ idx = i; break; }
      if (idx < 0) return true;
      const r = Math.floor(idx / n), c = idx % n;
      for (let v = 1; v <= n; v++) if (okAt(g, r, c, v, L)){ g[idx] = v; if (go()) return true; g[idx] = 0; }
      return false;
    })();
    return g;
  })(boardC, LEVELS.medium);
  // a blank square with 2+ legal candidates: one is the answer, another is not
  let sneaky = -1, sneakyVal = 0;
  for (let i = 0; i < 81 && sneaky < 0; i++){
    if (boardC[i]) continue;
    const r = Math.floor(i / 9), c = i % 9;
    for (let v = 1; v <= 9; v++){
      if (v === ansC[i]) continue;
      if (okAt(boardC, r, c, v, LEVELS.medium)){ sneaky = i; sneakyVal = v; break; }
    }
  }
  ok('found a number that is legal here but is not the answer',
    sneaky >= 0, sneaky >= 0 ? sneakyVal + ' at square ' + sneaky + ' (answer is ' + ansC[sneaky] + ')' : 'none found');
  if (sneaky >= 0){
    const sneakRes = await ev(`(function(){
      var cells = document.querySelectorAll('#sudBoard [data-sud]');
      cells[${sneaky}].click();
      document.querySelector('#sudPad [data-sudkey="${sneakyVal}"]').click();
      var after = document.querySelectorAll('#sudBoard [data-sud]')[${sneaky}];
      return JSON.stringify({ red: after.classList.contains('bad'),
        flashing: after.classList.contains('flash'),
        clashMarks: document.querySelectorAll('#sudBoard .clash').length }); })()`);
    const SN = JSON.parse(sneakRes);
    ok('a legal-but-wrong number goes red, the way sudoku.com does it',
      SN.red === true, 'red: ' + SN.red);
    ok('and it flashes, so it is noticed', SN.flashing === true, 'flashing: ' + SN.flashing);
    ok('nothing is falsely marked as clashing with it, because nothing does',
      SN.clashMarks === 0, SN.clashMarks + ' squares marked as clashing');
    await shot('sudoku-legal-but-wrong.png');
  }

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
