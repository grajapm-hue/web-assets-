/* Raja, relaying his group: "suggest remove triangle puzzle, it was completely
   mind mapping and dragging to follow — I too feel same. Can opt there another
   with including calculation behind ... just fill in the blanks to match the
   result by using the placed calculation."

   So the triangle is gone and this took its seat. What has to be true:

   FAIR — every grid handed to a child must have exactly ONE arrangement that
   fits. A grid with two answers tells them they are wrong when they are not,
   which is the worst thing a puzzle can do.

   LEFT TO RIGHT — the rule everything rests on. 8 − 6 × 2 is 4 here, not −4.
   If the board and the arithmetic ever disagreed the grid would be impossible,
   and it would look like the child's fault.

   Nothing here is read out of the app's own variables. The board is read off
   the SCREEN — the signs between the boxes and the six answers around the edge
   — and solved here, by a solver written in this file. That is what a child
   has to work from, so it is what gets checked; and a checker that borrows the
   code under test only proves the code agrees with itself. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9881;
const ROOT = path.join(__dirname, '..');
const MT = process.env.MM_TARGET || 'beta.html';
const FILE = /^https?:/.test(MT) ? MT : 'file:///' + path.join(ROOT, MT).split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const OPS = { '+':(a,b)=>a+b, '-':(a,b)=>a-b, '*':(a,b)=>a*b,
              '/':(a,b)=> (b !== 0 && a % b === 0) ? a/b : null };
const FROM_SIGN = { '+':'+', '\u2212':'-', '-':'-', '\u00d7':'*', 'x':'*', '\u00f7':'/' };
function ltr(a, o1, b, o2, c){
  const x = OPS[o1](a, b); if (x === null || x < 0) return null;
  const y = OPS[o2](x, c); if (y === null || y < 0) return null;
  return y;
}
/* every arrangement that fits, stopping at `cap` so a broken grid cannot hang */
function solveAll(P, cap){
  const out = []; const cell = [], used = new Array(10);
  (function place(i){
    if (out.length >= cap) return;
    if (i === 9){ out.push(cell.slice()); return; }
    for (let v = 1; v <= 9; v++){
      if (used[v]) continue;
      cell[i] = v; used[v] = true;
      let good = true;
      if (i % 3 === 2){ const r = (i/3)|0;
        if (ltr(cell[r*3], P.rOps[r][0], cell[r*3+1], P.rOps[r][1], cell[r*3+2]) !== P.r[r]) good = false; }
      if (good && i >= 6){ const c = i - 6;
        if (ltr(cell[c], P.cOps[c][0], cell[c+3], P.cOps[c][1], cell[c+6]) !== P.c[c]) good = false; }
      if (good) place(i + 1);
      used[v] = false;
    }
  })(0);
  return out;
}

(async () => {
  const tmp = path.join(__dirname, '_cpgrid');
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp,
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  /* Wait generously for Chrome, and say so plainly if it never arrives. The
     old 12s ceiling was enough on an idle machine and not always enough while
     the rest of the suite is running, and the script then died on
     `t.webSocketDebuggerUrl` of null -- a stack trace that names this file and
     says nothing about the real cause, which is that the browser had not
     started yet. */
  let t = null;
  for (let i = 0; i < 100 && !t; i++){ await sleep(300);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch(e){} }
  if (!t){
    console.log('  FAIL  Chrome never opened a page on port ' + PORT + ' within 30s — the browser did not start, nothing was tested');
    try { ch.kill(); } catch(e){}
    process.exit(1);
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); let errs = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 170));
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const waitFor = async (expr, ms) => {
    const until = Date.now() + (ms || 20000);
    while (Date.now() < until){ if (await ev(expr)) return true; await sleep(200); }
    return false;
  };

  /* The board as a child sees it. The wrap lays out row by row, so the signs
     come in a fixed order: the two joining each number row, then the three
     joining that row to the next one. */
  const readBoard = async () => {
    const raw = await ev(`(function(){
      return JSON.stringify({
        ops: Array.prototype.map.call(document.querySelectorAll('#board .gridOp'),
               function(o){ return (o.textContent||'').trim(); }),
        ans: Array.prototype.map.call(document.querySelectorAll('#board .badge'),
               function(b){ return parseInt(b.textContent, 10); }),
        cells: document.querySelectorAll('#board .cell').length
      });
    })()`).then(JSON.parse);
    if (raw.ops.length !== 12 || raw.ans.length !== 6) return null;
    const o = raw.ops.map(x => FROM_SIGN[x]);
    return {
      rOps: [[o[0], o[1]], [o[5], o[6]], [o[10], o[11]]],
      cOps: [[o[2], o[7]], [o[3], o[8]], [o[4], o[9]]],
      r: raw.ans.slice(0, 3),
      c: raw.ans.slice(3, 6),
      cells: raw.cells
    };
  };
  /* Count the badges that are NOT one of the three states too, and say what
     colour they were. Dropping them silently turned a puzzling state into a
     puzzling number -- "4 badges, none red" reads like a judging bug when the
     truth may be that two badges are a colour this test has never heard of. */
  const ring = () => ev(`(function(){
    var n = { green:0, red:0, orange:0, other:0, otherWas:[] };
    document.querySelectorAll('#board .badge').forEach(function(b){
      var bg = getComputedStyle(b).backgroundColor;
      if (/18, 122, 69/.test(bg)) n.green++;
      else if (/179, 38, 30/.test(bg)) n.red++;
      else if (/240, 165, 0/.test(bg)) n.orange++;
      else { n.other++;
        var tag = bg + ' [' + b.className + '] "' + (b.textContent||'').trim() + '"';
        if (n.otherWas.indexOf(tag) < 0) n.otherWas.push(tag); }
    });
    return JSON.stringify(n);
  })()`).then(JSON.parse);
  /* Read the ring only once it has stopped moving. The badges carry a 300ms
     colour fade, and this machine's timings swing enough that a fixed settle
     was occasionally read mid-change -- which shows up as a colour count that
     is nobody's bug. Poll until two reads agree, with a ceiling so a genuinely
     stuck board still fails rather than hanging. */
  const settledRing = async () => {
    let prev = null;
    for (let i = 0; i < 25; i++){
      const now = await ring();
      /* Settled means every badge is one of the three states AND the reading
         has stopped moving. Comparing only the COUNTS was not enough: two reads
         taken during the 300ms fade can report the same counts while sitting on
         different intermediate colours, so the poll would declare a mid-fade
         board settled and report "4 green, 0 red, 0 orange" -- two badges
         quietly dropped for being neither. Comparing the colours too closes it,
         and requiring none left over says out loud what settled means. */
      const key = JSON.stringify(now);
      if (prev === key && now.other === 0) return now;
      prev = key;
      await sleep(160);
    }
    return ring();
  };
  const typeInto = async (i, v) => ev(`(function(){
    var cs = document.querySelectorAll('#board .cell');
    cs[${i}].focus(); cs[${i}].value = '${v}';
    cs[${i}].dispatchEvent(new Event('input', { bubbles:true }));
    document.activeElement && document.activeElement.blur();
  })()`);
  const openLevel = async key => {
    await ev(`document.getElementById('tab-scHome').click()`);
    await sleep(250);
    await ev(`document.querySelector('.toggleBtn[data-size="${key}"]').click()`);
    return waitFor(`document.querySelectorAll('#board .cell').length === 9`);
  };

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  ok('the page loaded', await waitFor(`!!document.querySelector('.splashPlay')`), FILE);
  await ev(`document.querySelector('.splashPlay').click()`);
  await waitFor(`!!document.querySelector('.toggleBtn[data-size="grid1"]')`);

  /* The triangle is gone -- and gone from everywhere. A card left behind that
     opens a puzzle whose code was deleted is worse than either. */
  ok('Triangle Magic is off the puzzle list',
     (await ev(`document.querySelectorAll('.toggleBtn[data-size="triangle"]').length`)) === 0);
  /* innerText, not textContent. textContent includes the text inside <script>
     elements, so the release note in BUILD_VER -- which names the puzzle it
     removed -- made this fail while the puzzle list was perfectly clean.
     innerText is what is actually rendered, which is what "still offers it"
     means. */
  ok('and nothing on screen still offers it',
     (await ev(`/Triangle Magic/.test(document.body.innerText||'')`)) === false);
  ok('all three Number Grid levels are listed',
     (await ev(`document.querySelectorAll('.toggleBtn[data-size^="grid"]').length`)) === 3);

  /* Raja: "the symbol + and x seems similar in visibility."
     At this size they differ only by a 45 degree turn, so size alone cannot
     separate them -- it only makes two bigger similar shapes. They are split by
     FAMILY instead: plus and minus in the board's ink, times and divide in a
     colour used nowhere else on this board. Deliberately NOT green, orange or
     red, which already mean line-right, line-unfinished and line-wrong: a sign
     borrowing one of those would read as a verdict on the line. */
  await openLevel('grid3');
  const signs = await ev(`(function(){
    var out = {};
    document.querySelectorAll('#board .gridOp').forEach(function(o){
      var cs = getComputedStyle(o);
      out[o.textContent.trim()] = cs.color + '|' + Math.round(parseFloat(cs.fontSize));
    });
    return JSON.stringify(out);
  })()`).then(JSON.parse);
  const plus = signs['+'], times = signs['×'];
  if (plus && times){
    ok('+ and x are not drawn the same way', plus !== times, '+ ' + plus + '   x ' + times);
    ok('and they differ in COLOUR, not just size — the two shapes are one rotation apart',
       plus.split('|')[0] !== times.split('|')[0], '+ ' + plus.split('|')[0] + '   x ' + times.split('|')[0]);
    ok('the times sign is not smaller than the plus, as the font draws it',
       parseInt(times.split('|')[1], 10) >= parseInt(plus.split('|')[1], 10),
       '+ ' + plus.split('|')[1] + 'px   x ' + times.split('|')[1] + 'px');
  }
  /* the sign IS the instruction on this board, so it must not be invisible to
     a screen reader the way an aria-hidden decoration would be */
  ok('every sign says its own word for a screen reader',
     (await ev(`Array.prototype.every.call(document.querySelectorAll('#board .gridOp'),
        function(o){ return /plus|minus|times|divided/.test(o.getAttribute('aria-label')||''); })`)) === true);

  /* the name Raja asked for, in the list AND in the bar above the board */
  ok('the puzzle is called Fill In The Blank on the board too',
     (await ev(`/Fill In The Blank/.test((document.getElementById('appBarTitle')||{}).textContent||'')`)) === true,
     await ev(`(document.getElementById('appBarTitle')||{}).textContent`));

  /* Raja: "remove that word times -- it represents only the operation behind
     the play, the name will confuse a player who does not know the times
     operation."

     Right, and the word was doing no work the symbol cannot do better. The
     cards name their signs with the signs themselves, which a child who cannot
     yet read "times" still recognises -- and which reads the same in Tamil. */
  const cardText = await ev(`(function(){
    var out = {};
    document.querySelectorAll('.toggleBtn[data-size^="grid"]').forEach(function(b){
      var d = b.querySelector('.lvDiff');
      out[b.getAttribute('data-size')] = d ? d.textContent.trim() : '';
    });
    return JSON.stringify(out);
  })()`).then(JSON.parse);
  ok('the cards name their signs with SIGNS, not English words',
     !/times|plus|minus|divide/i.test(Object.keys(cardText).map(k => cardText[k]).join(' ')),
     JSON.stringify(cardText));
  ok('and each card shows exactly the signs its level uses',
     cardText.grid1 === '+ −' && cardText.grid2 === '+ − ×' &&
     cardText.grid3 === '+ − × ÷', JSON.stringify(cardText));

  /* Raja, having typed 10 into a box: "the eligibility is 1 to 9 -- 0, and
     anything beyond 9, should not be allowed to enter."

     The box carried maxLength=1, which stops the system keyboard, but the
     app's own keypad assigns the value directly and maxLength does not apply
     to that. So this drives the KEYPAD, the way he did, rather than firing an
     input event -- the same distinction that once hid a dead Install button
     behind a green test. */
  await openLevel('grid1');
  const tapKey = k => ev(`(function(){ var b = document.querySelector('#keypad .kp[data-k="' + ${JSON.stringify('K')}.replace('K','${'$'}') + '"]'); if (b) b.click(); })()`);
  const box0 = () => ev(`(document.querySelectorAll('#board .cell')[0]||{}).value`);
  await ev(`(function(){ var c = document.querySelectorAll('#board .cell')[0]; c.focus(); c.click(); })()`);
  await sleep(200);

  await ev(`document.querySelector('#keypad .kp[data-k="1"]').click()`); await sleep(220);
  ok('tapping 1 puts a 1 in the box', (await box0()) === '1', 'box holds "' + (await box0()) + '"');

  await ev(`document.querySelector('#keypad .kp[data-k="0"]').click()`); await sleep(260);
  ok('tapping 0 after it does NOT make 10 — 0 is not a legal entry',
     (await box0()) === '1', 'box holds "' + (await box0()) + '"');

  await ev(`document.querySelector('#keypad .kp[data-k="7"]').click()`); await sleep(260);
  ok('tapping another digit REPLACES it, because a box holds one digit',
     (await box0()) === '7', 'box holds "' + (await box0()) + '"');

  await ev(`document.querySelector('#keypad .kp[data-nav="sign"]').click()`); await sleep(260);
  ok('the sign key cannot make it negative either',
     (await box0()) === '7', 'box holds "' + (await box0()) + '"');

  /* and the system keyboard / a paste cannot get round it either */
  await ev(`(function(){ var c = document.querySelectorAll('#board .cell')[0];
    c.focus(); c.value = '10'; c.dispatchEvent(new Event('input', { bubbles:true })); })()`);
  await sleep(260);
  ok('typing 10 straight into the box is refused as well',
     ['1','0',''].indexOf(await box0()) < 0 ? false : (await box0()) !== '10',
     'box holds "' + (await box0()) + '"');
  ok('and the keys that cannot help are shown as unavailable',
     (await ev(`parseFloat(getComputedStyle(document.querySelector('#keypad .kp[data-k="0"]')).opacity)`)) < 0.6,
     'zero key opacity ' + (await ev(`getComputedStyle(document.querySelector('#keypad .kp[data-k="0"]')).opacity`)));

  /* Put the board back. The app deliberately KEEPS an unfinished game when you
     return to a level, so leaving a stray digit here made the next section open
     on a half-played grid and report "it opens empty" as a failure -- this
     test's mess, not the app's. */
  await ev(`document.getElementById('clearBtn').click()`);
  await sleep(300);
  ok('the board is left clean for the next check',
     (await ev(`Array.from(document.querySelectorAll('#board .cell')).every(function(c){ return c.value === ''; })`)) === true);

  const LEVELS = [
    { key: 'grid1', name: 'Easy',   ops: ['+','-'] },
    { key: 'grid2', name: 'Medium', ops: ['+','-','*'] },
    { key: 'grid3', name: 'Hard',   ops: ['+','-','*','/'] }
  ];

  for (const L of LEVELS){
    errs = [];
    ok(L.name + ': the board opens with nine boxes', await openLevel(L.key));
    const P = await readBoard();
    ok(L.name + ': six answers and twelve signs are printed on it', !!P);
    if (!P) continue;
    ok(L.name + ': it opens empty, nothing filled in',
       (await ev(`Array.from(document.querySelectorAll('#board .cell')).every(function(c){ return c.value === ''; })`)) === true);
    ok(L.name + ': it only uses the signs this level promises',
       P.rOps.concat(P.cOps).every(pr => pr.every(o => L.ops.indexOf(o) >= 0)),
       P.rOps.concat(P.cOps).map(x => x.join('')).join(' '));
    /* Raja, on the Medium card's "plus, minus and times": "what it means, that
       times it must need?"

       It has to. Every sign used to be drawn at random from the level's pool,
       so nothing stopped a Medium grid arriving with no x anywhere -- an Easy
       grid under the wrong name. A card must not promise what the puzzle only
       tends to do, so the level's signs are now required, and this checks the
       card against the board. */
    const onBoard = P.rOps.concat(P.cOps).reduce((a, pr) => a.concat(pr), []);
    ok(L.name + ': and every sign the card names really appears',
       L.ops.every(o => onBoard.indexOf(o) >= 0),
       'card says ' + L.ops.join(' ') + ', board has ' +
       L.ops.filter(o => onBoard.indexOf(o) >= 0).join(' '));

    const answers = solveAll(P, 2);
    ok(L.name + ': the grid on screen can be solved at all, reading LEFT TO RIGHT',
       answers.length >= 1, answers.length ? answers[0].join(',') : 'NO arrangement of 1-9 fits');
    ok(L.name + ': and exactly ONE arrangement fits', answers.length === 1,
       answers.length === 1 ? 'unique' : answers.length + ' answers');
    if (!answers.length) continue;
    const sol = answers[0];

    /* ---- play it: eight right, one still empty ---- */
    for (let i = 0; i < 8; i++) await typeInto(i, sol[i]);
    const mid = await settledRing();
    ok(L.name + ': with one box empty its two lines are still waiting', mid.orange >= 2, JSON.stringify(mid));
    ok(L.name + ': the lines already finished show green', mid.green >= 2, JSON.stringify(mid));

    /* ---- a wrong number: its lines must go RED, never green ---- */
    const wrong = sol[8] === sol[0] ? sol[1] : sol[0];
    await typeInto(8, wrong);
    /* Check the number actually went IN before judging the colours. A run once
       reported "a wrong number stays orange", which reads like the ring failing
       to judge -- when the real story could equally be that the box never took
       the digit. Two very different bugs, and the colour count alone cannot
       tell them apart. */
    const inBox = await ev(`(document.querySelectorAll('#board .cell')[8]||{}).value`);
    ok(L.name + ': the wrong number actually went into the box',
       String(inBox) === String(wrong), 'box holds "' + inBox + '", typed ' + wrong);
    const bad = await settledRing();
    ok(L.name + ': a wrong number turns its lines RED, never green', bad.red >= 1,
       'put ' + wrong + ' where ' + sol[8] + ' belongs -> ' + JSON.stringify(bad));

    /* ---- a full board may never claim to be unfinished ----
       The bug this pins: gridLineValue() returns null both for an empty box and
       for arithmetic that cannot be done at all -- a step going negative, or a
       division that is not whole. Treating them alike showed a badly wrong line
       as ORANGE, exactly as if the child had not finished it.

       Filling every box with a shifted permutation guarantees several lines are
       not just wrong but impossible. With all nine boxes full, "unfinished" is
       not a state the board can honestly be in. */
    const scrambled = sol.slice(1).concat(sol[0]);
    for (let i = 0; i < 9; i++) await typeInto(i, scrambled[i]);
    const fullBoard = await settledRing();
    const allIn = await ev(`Array.prototype.every.call(document.querySelectorAll('#board .cell'),
      function(c){ return c.value !== ''; })`);
    ok(L.name + ': every box took a number', allIn === true);
    ok(L.name + ': with every box full, no line still says "unfinished"',
       fullBoard.orange === 0, JSON.stringify(fullBoard));
    ok(L.name + ': and the broken lines say WRONG instead', fullBoard.red >= 1,
       JSON.stringify(fullBoard));

    /* ---- and the right one finishes it ---- */
    for (let i = 0; i < 8; i++) await typeInto(i, sol[i]);
    await sleep(500);
    await typeInto(8, sol[8]);
    let won = false;
    for (let i = 0; i < 10 && !won; i++){
      await sleep(600);
      won = await ev(`(function(){ var m = document.getElementById('congratsModal');
        return !!m && getComputedStyle(m).display !== 'none'; })()`);
    }
    ok(L.name + ': filling it correctly wins', won === true);

    /* Raja: after solving it, all six answers turned into 6.

       win() was written for a magic square, whose lines all make the SAME
       number, so it stamps that number into every badge -- and it was handed
       the COUNT of finished lines, six, which is how every answer became 6.
       This board's six lines deliberately make six DIFFERENT numbers, printed
       on it from the start. Solving must not erase the very thing that was
       solved, so the answers are read back and compared with what the board
       showed before the win. */
    if (won){
      const after = await readBoard();
      ok(L.name + ': the six answers still say what they said before',
         !!after && after.r.concat(after.c).join(',') === P.r.concat(P.c).join(','),
         after ? 'was ' + P.r.concat(P.c).join(',') + ' -> now ' + after.r.concat(after.c).join(',')
               : 'the answers could not be read at all');
      const panel = await ev(`(function(){
        var m = document.getElementById('congratsModal');
        return ((m && m.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      })()`);
      ok(L.name + ': and the panel does not claim one number for every line',
         !/Every line/i.test(panel), panel);
    }
    if (won) await ev(`(function(){ var b = document.getElementById('nextBtn'); if (b) b.click(); })()`);
    ok(L.name + ': no JS errors while playing it', errs.length === 0, errs.join(' | '));
  }

  /* One grid proves nothing about a generator. Deal a run of them through the
     UI, exactly as a child pressing the level again would, and judge the rate. */
  let dealt = 0, unique = 0, solvable = 0;
  const seen = {};
  for (let i = 0; i < 12; i++){
    if (!await openLevel(i % 2 ? 'grid1' : 'grid3')) continue;
    const P = await readBoard();
    if (!P) continue;
    dealt++;
    seen[P.r.join(',') + '|' + P.c.join(',')] = 1;
    const a = solveAll(P, 2);
    if (a.length >= 1) solvable++;
    if (a.length === 1) unique++;
  }
  ok('a run of fresh grids was dealt', dealt >= 10, dealt + ' dealt');
  ok('every one of them is solvable', solvable === dealt, solvable + '/' + dealt);
  ok('every one of them has exactly ONE answer', unique === dealt, unique + '/' + dealt);
  ok('and they are not the same grid over and over',
     Object.keys(seen).length >= Math.max(2, dealt - 2),
     Object.keys(seen).length + ' different grids in ' + dealt);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, 'number-grid.png'), Buffer.from(shot.result.data, 'base64'));

  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
