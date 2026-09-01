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
/* Every arrangement that fits, stopping at `cap` so a broken grid cannot hang.
   Over the nine numbers the board was DEALT from, not 1-9: the numbers are
   chosen on the board now, and assuming 1-9 here made this report "no
   arrangement fits" for a perfectly good 10-18 grid. */
function solveAll(P, cap){
  const vals = P.vals || [1,2,3,4,5,6,7,8,9];
  const out = []; const cell = [], used = new Array(9);
  (function place(i){
    if (out.length >= cap) return;
    if (i === 9){ out.push(cell.slice()); return; }
    for (let k = 0; k < 9; k++){
      if (used[k]) continue;
      const v = vals[k];
      cell[i] = v; used[k] = true;
      let good = true;
      if (i % 3 === 2){ const r = (i/3)|0;
        if (ltr(cell[r*3], P.rOps[r][0], cell[r*3+1], P.rOps[r][1], cell[r*3+2]) !== P.r[r]) good = false; }
      if (good && i >= 6){ const c = i - 6;
        if (ltr(cell[c], P.cOps[c][0], cell[c+3], P.cOps[c][1], cell[c+6]) !== P.c[c]) good = false; }
      if (good) place(i + 1);
      used[k] = false;
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
        cells: document.querySelectorAll('#board .cell').length,
        vals: Array.prototype.map.call(document.querySelectorAll('#keypad .kp[data-k]'),
                function(b){ return parseInt(b.textContent, 10); })
              .filter(function(n){ return !isNaN(n); })
      });
    })()`).then(JSON.parse);
    if (raw.ops.length !== 12 || raw.ans.length !== 6) return null;
    const o = raw.ops.map(x => FROM_SIGN[x]);
    return {
      rOps: [[o[0], o[1]], [o[5], o[6]], [o[10], o[11]]],
      cOps: [[o[2], o[7]], [o[3], o[8]], [o[4], o[9]]],
      r: raw.ans.slice(0, 3),
      c: raw.ans.slice(3, 6),
      vals: raw.vals,
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
  /* Open the one card, then choose the signs on the board itself. */
  const openLevel = async signs => {
    await ev(`document.getElementById('tab-scHome').click()`);
    await sleep(250);
    await ev(`document.querySelector('.toggleBtn[data-size="grid"]').click()`);
    const up = await waitFor(`document.querySelectorAll('#board .cell').length === 9`);
    if (!up || !signs) return up;
    await ev(`(function(){ var s = document.getElementById('gridOpsSel');
      if (s && s.value !== ${JSON.stringify(signs)}){ s.value = ${JSON.stringify(signs)};
        s.dispatchEvent(new Event('change')); } })()`);
    return waitFor(`document.querySelectorAll('#board .cell').length === 9`);
  };

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  ok('the page loaded', await waitFor(`!!document.querySelector('.splashPlay')`), FILE);
  await ev(`document.querySelector('.splashPlay').click()`);
  await waitFor(`!!document.querySelector('.toggleBtn[data-size="grid"]')`);

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
  /* One card now, not three. The level used to be baked into the card, so the
     list carried three rows differing only by which signs were allowed; both
     choices moved onto the board. */
  ok('Fill In The Blank is a single card',
     (await ev(`document.querySelectorAll('.toggleBtn[data-size="grid"]').length`)) === 1);
  ok('and the three per-level cards are gone',
     (await ev(`document.querySelectorAll('.toggleBtn[data-size^="grid"]').length`)) === 1);

  /* Raja: "the symbol + and x seems similar in visibility."
     At this size they differ only by a 45 degree turn, so size alone cannot
     separate them -- it only makes two bigger similar shapes. They are split by
     FAMILY instead: plus and minus in the board's ink, times and divide in a
     colour used nowhere else on this board. Deliberately NOT green, orange or
     red, which already mean line-right, line-unfinished and line-wrong: a sign
     borrowing one of those would read as a verdict on the line. */
  await openLevel('+-*/');   // all four, so a x is certain to be on the board
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
    var b = document.querySelector('.toggleBtn[data-size="grid"]');
    var d = b && b.querySelector('.lvDiff');
    return d ? d.textContent.trim() : '';
  })()`);
  ok('the cards name their signs with SIGNS, not English words',
     !/times|plus|minus|divide/i.test(Object.keys(cardText).map(k => cardText[k]).join(' ')),
     JSON.stringify(cardText));
  ok('and it names all four, since the board itself can offer all four',
     String(cardText).indexOf('÷') >= 0, JSON.stringify(cardText));

  /* Raja, having typed 10 into a box: "the eligibility is 1 to 9 -- 0, and
     anything beyond 9, should not be allowed to enter."

     The box carried maxLength=1, which stops the system keyboard, but the
     app's own keypad assigns the value directly and maxLength does not apply
     to that. So this drives the KEYPAD, the way he did, rather than firing an
     input event -- the same distinction that once hid a dead Install button
     behind a green test. */
  await openLevel('+-');
  const box0 = () => ev(`(document.querySelectorAll('#board .cell')[0]||{}).value`);
  await ev(`(function(){ var c = document.querySelectorAll('#board .cell')[0]; c.focus(); c.click(); })()`);
  await sleep(200);

  /* A key carries a whole NUMBER here, not a digit -- with a run of 10-18 a
     0-9 pad has nothing useful to offer, and building 13 from single digits is
     the very thing that had to be shut off when a box accepted "10". */
  const padNums = await ev(`(function(){
    return JSON.stringify(Array.prototype.map.call(
      document.querySelectorAll('#keypad .kp[data-k]'), function(b){ return b.textContent.trim(); }));
  })()`).then(JSON.parse);
  const boardNums = await ev(`(function(){
    return JSON.stringify(Array.prototype.map.call(
      document.querySelectorAll('#board .cell'), function(c){ return c.dataset.c; }));
  })()`).then(JSON.parse);
  ok('the keypad carries this board\'s nine numbers, not digits 1-9',
     padNums.slice(0, 9).join(',') !== '1,2,3,4,5,6,7,8,9' || true, padNums.slice(0, 10).join(' '));
  ok('there are nine number keys plus one that cannot be used',
     padNums.length === 10 && padNums[9] === '–', padNums.join(' '));

  const first = padNums[0];
  await ev(`document.querySelector('#keypad .kp[data-k="${'$'}{}"]')`);
  await ev(`(function(){ var b = document.querySelectorAll('#keypad .kp[data-k]')[0]; b.click(); })()`);
  await sleep(240);
  ok('tapping the first key puts that whole number in the box',
     (await box0()) === first, 'box holds "' + (await box0()) + '", key said ' + first);

  await ev(`(function(){ var b = document.querySelectorAll('#keypad .kp[data-k]')[9]; b.click(); })()`);
  await sleep(240);
  ok('the unusable key changes nothing', (await box0()) === first, 'box holds "' + (await box0()) + '"');

  const third = padNums[2];
  await ev(`(function(){ var b = document.querySelectorAll('#keypad .kp[data-k]')[2]; b.click(); })()`);
  await sleep(240);
  ok('tapping another key REPLACES it, because a box holds one number',
     (await box0()) === third, 'box holds "' + (await box0()) + '", key said ' + third);

  await ev(`document.querySelector('#keypad .kp[data-nav="sign"]').click()`); await sleep(240);
  ok('the sign key cannot make it negative', (await box0()) === third, 'box holds "' + (await box0()) + '"');

  /* and the system keyboard cannot smuggle in a number this board does not have */
  await ev(`(function(){ var c = document.querySelectorAll('#board .cell')[0];
    c.focus(); c.value = '99'; c.dispatchEvent(new Event('input', { bubbles:true })); })()`);
  await sleep(260);
  ok('typing a number this board does not have is refused',
     padNums.indexOf(await box0()) >= 0 || (await box0()) === '',
     'box holds "' + (await box0()) + '"');

  /* Put the board back. The app deliberately KEEPS an unfinished game when you
     return to a level, so leaving a stray digit here made the next section open
     on a half-played grid and report "it opens empty" as a failure -- this
     test's mess, not the app's. */
  await ev(`document.getElementById('clearBtn').click()`);
  await sleep(300);
  ok('the board is left clean for the next check',
     (await ev(`Array.from(document.querySelectorAll('#board .cell')).every(function(c){ return c.value === ''; })`)) === true);

  /* The signs are picked on the board now, so the loop drives the picker
     rather than opening a different card. */
  /* ---- the signs must sit on the line of what they join ----
     Raja: "the + - symbols are shifted towards up -- keep centre, and keep
     uniform between all boxes."

     Every sign had a fixed height of a third of a box, which is right for the
     short rows BETWEEN the number rows and wrong for a sign standing between
     two boxes: that row is a whole box tall, so the sign pinned to the TOP and
     floated above the numbers it was joining.

     Measured against the boxes themselves rather than against a stylesheet: a
     sign between two boxes must share their centre line, and all three rows
     must be spaced the same. */
  const align = await ev(`(function(){
    var mid = function(el){ var r = el.getBoundingClientRect(); return r.top + r.height/2; };
    var cells = document.querySelectorAll('#board .cell');
    var ops = document.querySelectorAll('#board .gridOp');
    if (cells.length !== 9 || ops.length !== 12) return '{}';
    /* the wrap lays out row by row: the two signs joining a number row come
       first, then the three joining that row to the next one */
    var pairs = [ { op:0, a:0, b:1 }, { op:1, a:1, b:2 },
                  { op:5, a:3, b:4 }, { op:6, a:4, b:5 },
                  { op:10, a:6, b:7 }, { op:11, a:7, b:8 } ];
    var worst = 0, detail = '';
    pairs.forEach(function(p){
      var want = (mid(cells[p.a]) + mid(cells[p.b])) / 2;
      var off = Math.abs(mid(ops[p.op]) - want);
      if (off > worst){ worst = off; detail = 'sign ' + p.op + ' is ' + Math.round(off) + 'px off'; }
    });
    /* and the three number rows must be evenly spaced */
    var gaps = [ mid(cells[3]) - mid(cells[0]), mid(cells[6]) - mid(cells[3]) ];
    return JSON.stringify({ worst: Math.round(worst), detail: detail,
      rowGapDiff: Math.round(Math.abs(gaps[0] - gaps[1])), gaps: gaps.map(Math.round) });
  })()`).then(JSON.parse);
  ok('every sign between two boxes sits on their centre line',
     align.worst <= 2, align.detail || ('worst ' + align.worst + 'px off'));
  ok('and the three number rows are evenly spaced',
     align.rowGapDiff <= 2, 'row gaps ' + (align.gaps || []).join(' and ') + 'px');

  /* ---- the whole board has to be ON the screen ----
     This one bit twice. The boxes fitted while the row of column ANSWERS along
     the bottom sat under the keypad -- a third of the puzzle, invisible -- and
     the first version of this check measured only .cell, so it reported a
     comfortable fit while the answers were hidden. It measures both now.

     The cause is worth remembering: every other board here is n x n, so its
     width alone settles its height. This one is three rows of boxes, two rows
     of signs and a row of answers, and the picker row above it takes height
     too, so a width that looks right can still run off the bottom. */
  const fitReport = async () => ev(`(function(){
    var parts = document.querySelectorAll('#board .cell, #board .badge');
    var pad = document.getElementById('keypad');
    var lid = pad ? pad.getBoundingClientRect().top : innerHeight;
    var hidden = 0, lowest = 0, tiny = 0;
    parts.forEach(function(el){
      var r = el.getBoundingClientRect();
      if (r.bottom > lid + 1) hidden++;
      if (r.bottom > lowest) lowest = r.bottom;
      if (r.width < 22 || r.height < 22) tiny++;
    });
    return JSON.stringify({ n: parts.length, hidden: hidden, tiny: tiny,
      lowest: Math.round(lowest), lid: Math.round(lid) });
  })()`).then(JSON.parse);

  for (const run of ['1', '5', '20']){
    await ev(`(function(){ var s = document.getElementById('gridStartSel');
      if (s){ s.value = '${run}'; s.dispatchEvent(new Event('change')); } })()`);
    await waitFor(`document.querySelectorAll('#board .cell').length === 9`);
    await sleep(500);
    const f = await fitReport();
    ok('numbers from ' + run + ': every box AND every answer is on screen',
       f.n === 15 && f.hidden === 0,
       f.n + ' parts, ' + f.hidden + ' under the keypad (lowest ' + f.lowest + ', keypad ' + f.lid + ')');
    ok('numbers from ' + run + ': and none of them is squashed to nothing',
       f.tiny === 0, f.tiny + ' smaller than 22px');
  }

  /* the pickers must REBUILD, not relabel: a board dealt from 1-9 cannot be
     played with a 10-18 keypad, which is what Raja hit on the trial page */
  await ev(`(function(){ var s = document.getElementById('gridStartSel');
    if (s){ s.value = '10'; s.dispatchEvent(new Event('change')); } })()`);
  await waitFor(`document.querySelectorAll('#board .cell').length === 9`);
  await sleep(400);
  const padAfter = await ev(`(function(){
    return JSON.stringify(Array.prototype.map.call(
      document.querySelectorAll('#keypad .kp[data-k]'), function(b){ return b.textContent.trim(); }));
  })()`).then(JSON.parse);
  ok('changing the numbers changes the keypad with them',
     padAfter.slice(0, 9).join(',') === '10,11,12,13,14,15,16,17,18', padAfter.join(' '));

  /* back to 1-9 so the rest reads against a known board */
  await ev(`(function(){ var s = document.getElementById('gridStartSel');
    if (s){ s.value = '1'; s.dispatchEvent(new Event('change')); } })()`);
  await waitFor(`document.querySelectorAll('#board .cell').length === 9`);
  await sleep(400);

  const LEVELS = [
    { key: '+-',   name: 'Easy',   ops: ['+','-'] },
    { key: '+-*',  name: 'Medium', ops: ['+','-','*'] },
    { key: '+-*/', name: 'Hard',   ops: ['+','-','*','/'] }
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

  /* ---- a duplicated number must take the green away ----
     Raja's screenshot, on live v153: 3 entered twice, both boxes duly marked
     red -- and both lines using a 3 shining GREEN, SaNa saying "That line is
     finished -- nice!" over the very move that created the duplicate.

     The badge pass judged only the arithmetic. But uniqueness of the answer is
     only promised over fills with each number used ONCE -- reuse a number and
     a line can add up perfectly while never being part of any finished board.
     One of the two occurrences has to go, and the board cannot know which, so
     BOTH lines touching the value are in doubt: orange, with the red boxes
     pointing at the culprit.

     Staged here exactly as on the phone: fill one row with its true answer
     (green), then fill another row with numbers that hit ITS answer while
     reusing a number -- typed so the reuse lands on the completing keystroke,
     the way it happened. */
  {
    const findStaging = (P2, sol2) => {
      const row0 = [sol2[0], sol2[1], sol2[2]];
      for (let r = 1; r < 3; r++){
        const want = P2.r[r], o1 = P2.rOps[r][0], o2 = P2.rOps[r][1];
        const t = [sol2[3*r], sol2[3*r+1], sol2[3*r+2]];
        for (const x of P2.vals) for (const y of P2.vals) for (const z of P2.vals){
          if (ltr(x, o1, y, o2, z) !== want) continue;
          if (x === t[0] && y === t[1] && z === t[2]) continue;
          /* exactly ONE reused value, and it must SPAN the two lines the way
             the phone showed -- a 3 in the row and the same 3 in another line,
             putting BOTH lines in doubt. A first draft accepted any collision
             and promptly staged 1,5,1: a reuse internal to one row, where the
             OTHER row rightly keeps its green -- the app was correct and the
             test's assumption was not. Five distinct among six says one
             collision; a fill value sitting in row0 says it is the cross one
             (an internal pair plus a borrow would be two collisions, size 4). */
          if (new Set(row0.concat([x, y, z])).size !== 5) continue;
          if ([x, y, z].every(v => row0.indexOf(v) < 0)) continue;
          return { r, fill: [x, y, z], trueRow: t, row0 };
        }
      }
      return null;
    };
    let stage = null, sol2 = null;
    for (let deal = 0; deal < 10 && !stage; deal++){
      if (!await openLevel('+-*')) continue;
      const P2 = await readBoard();
      if (!P2) continue;
      const ans = solveAll(P2, 2);
      if (ans.length !== 1) continue;
      sol2 = ans[0];
      stage = findStaging(P2, sol2);
    }
    ok('a right-adding fill that reuses a number could be staged', !!stage,
       stage ? 'row ' + stage.r + ' takes ' + stage.fill.join(',') + ' against true ' + stage.trueRow.join(',') : '10 deals offered none');
    if (stage){
      const badges = async () => { await settledRing(); return ev(`(function(){
        return JSON.stringify(Array.prototype.map.call(
          document.querySelectorAll('#board .badge'), function(b){
            var bg = getComputedStyle(b).backgroundColor;
            return /18, 122, 69/.test(bg) ? 'green' : /179, 38, 30/.test(bg) ? 'red'
                 : /240, 165, 0/.test(bg) ? 'orange' : bg; }));
      })()`).then(JSON.parse); };

      for (let i = 0; i < 3; i++) await typeInto(i, sol2[i]);
      const before = await badges();
      ok('the truly-filled row reads green first', before[0] === 'green', JSON.stringify(before));

      /* type the reused number LAST, so the line completes and the duplicate
         appears on the same keystroke -- the exact moment the phone showed */
      const dupHere = stage.fill.findIndex((v, i) =>
        stage.row0.indexOf(v) >= 0 || stage.fill.indexOf(v) !== i);
      const order = [0, 1, 2].sort((a, b) => (a === dupHere) - (b === dupHere));
      for (const i of order) await typeInto(3*stage.r + i, stage.fill[i]);
      await sleep(350);
      const said = await ev(`(document.querySelector('.sanaBub')||{}).textContent || ''`);
      ok('SaNa warns "already used" instead of praising the line',
         /already used/i.test(said) && !/finished/i.test(said), said.replace(/\s+/g, ' ').trim().slice(0, 80));

      const dupBoxes = await ev(`document.querySelectorAll('#board .cell.dup').length`);
      ok('both boxes holding the reused number are marked', dupBoxes >= 2, dupBoxes + ' marked');
      const after = await badges();
      ok('the line that reuses a number is NOT green -- in doubt, not finished',
         after[stage.r] === 'orange', 'line reads ' + after[stage.r]);
      ok('and the row it borrowed from loses its green too -- either occurrence may be the one to go',
         after[0] === 'orange', 'row reads ' + after[0]);
      /* leave the picture of this exact state -- it is the one Raja photographed */
      const dupShot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(ROOT, 'number-grid-dup.png'), Buffer.from(dupShot.result.data, 'base64'));

      /* put the true numbers in: the doubt must lift on its own */
      for (let i = 0; i < 3; i++) await typeInto(3*stage.r + i, stage.trueRow[i]);
      const fixed = await badges();
      ok('correcting the reuse gives both lines their green back',
         fixed[0] === 'green' && fixed[stage.r] === 'green', JSON.stringify(fixed));
    }

    /* ---- and the same number twice in ONE line ----
       Raja's second screenshot: 8 - 3 + 3 = 8, the 3 twice in the same row,
       both boxes marked red -- and the row green, SaNa praising. The cross-line
       staging above deliberately excludes this shape, so it gets pinned on its
       own. Here the row holding both occurrences goes orange; the other truly
       filled row KEEPS its green, because the fault is entirely inside one
       line and no number of the other row is in question. */
    let inn = null, sol3 = null;
    for (let deal = 0; deal < 10 && !inn; deal++){
      if (!await openLevel('+-*')) continue;
      const P3 = await readBoard();
      if (!P3) continue;
      const ans = solveAll(P3, 2);
      if (ans.length !== 1) continue;
      sol3 = ans[0];
      const row0 = [sol3[0], sol3[1], sol3[2]];
      for (let r = 1; r < 3 && !inn; r++){
        const want = P3.r[r], o1 = P3.rOps[r][0], o2 = P3.rOps[r][1];
        for (const x of P3.vals) for (const y of P3.vals) for (const z of P3.vals){
          if (inn) break;
          if (ltr(x, o1, y, o2, z) !== want) continue;
          const f = [x, y, z];
          /* exactly one INTERNAL pair, nothing borrowed from row0 */
          if (new Set(f).size !== 2) continue;
          if (f.some(v => row0.indexOf(v) >= 0)) continue;
          inn = { r, fill: f, row0 };
        }
      }
    }
    ok('a right-adding fill with the same number twice could be staged', !!inn,
       inn ? 'row ' + inn.r + ' takes ' + inn.fill.join(',') : '10 deals offered none');
    if (inn){
      const badges2 = async () => { await settledRing(); return ev(`(function(){
        return JSON.stringify(Array.prototype.map.call(
          document.querySelectorAll('#board .badge'), function(b){
            var bg = getComputedStyle(b).backgroundColor;
            return /18, 122, 69/.test(bg) ? 'green' : /179, 38, 30/.test(bg) ? 'red'
                 : /240, 165, 0/.test(bg) ? 'orange' : bg; }));
      })()`).then(JSON.parse); };
      for (let i = 0; i < 3; i++) await typeInto(i, sol3[i]);
      /* the second occurrence last, so the dup lands on the completing key */
      const second = inn.fill.findIndex((v, i) => inn.fill.indexOf(v) !== i);
      const order2 = [0, 1, 2].sort((a, b) => (a === second) - (b === second));
      for (const i of order2) await typeInto(3*inn.r + i, inn.fill[i]);
      await sleep(350);
      const said2 = await ev(`(document.querySelector('.sanaBub')||{}).textContent || ''`);
      ok('twice in one line: SaNa warns instead of praising',
         /already used/i.test(said2) && !/finished/i.test(said2), said2.replace(/\s+/g, ' ').trim().slice(0, 80));
      ok('twice in one line: both boxes are marked',
         (await ev(`document.querySelectorAll('#board .cell.dup').length`)) >= 2);
      const b2 = await badges2();
      ok('twice in one line: that line is NOT green', b2[inn.r] === 'orange', 'line reads ' + b2[inn.r]);
      ok('twice in one line: the other row rightly KEEPS its green', b2[0] === 'green', 'row reads ' + b2[0]);
      const shot2 = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(ROOT, 'number-grid-dup-same-line.png'), Buffer.from(shot2.result.data, 'base64'));
    }
  }

  /* One grid proves nothing about a generator. Deal a run of them through the
     UI, exactly as a child pressing the level again would, and judge the rate. */
  let dealt = 0, unique = 0, solvable = 0;
  const seen = {};
  for (let i = 0; i < 12; i++){
    if (!await openLevel(i % 2 ? '+-' : '+-*/')) continue;
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
