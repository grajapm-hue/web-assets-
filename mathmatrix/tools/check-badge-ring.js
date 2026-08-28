/* Raja, on the line totals around the grid: "the outer cell scoring should be
   straight square instead of curved edge -- it will give more impact and
   differentiation between the inner table and the outer result cells", then
   "my wish is orange with straight square".

   Two measured defects went with the taste:

   1. Those totals were 2.2:1 against the sandalwood ground, less than half the
      4.5 floor. That is why they read smeared rather than merely dim -- and it
      is the sort of thing a screenshot review passes, because the text is
      plainly visible, just not legible.

   2. One rule lumped partial, full and win into a single green tint, so a
      badge could not say which of the three states it was in. That is the only
      thing a badge exists to do.

   So this asserts the numbers, not the appearance: every state, at every board
   size, above 4.5:1 -- and the two states VISIBLY different from each other,
   which a contrast figure alone would not catch (two different colours can
   both score well against their text and still look identical to each other).

   The square corners are checked too. They are not decoration: the inner cells
   stay rounded, so shape is a second signal for a child who cannot separate
   the hues. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9893;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

let sawOpen = false, sawDone = false;
const SIZES = ['3x3', '4x4', '10x10', 'ramanujan'];

const HELPERS = `
  function _rgb(s){ if(s.charAt(0)==='#'){return [parseInt(s.substr(1,2),16),parseInt(s.substr(3,2),16),parseInt(s.substr(5,2),16)];}
    var m=String(s).match(/[0-9.]+/g); return m&&m.length>=3?m.slice(0,3).map(Number):null; }
  function _lum(c){ var a=c.map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; }
  function _ratio(f,b){ var x=_lum(_rgb(f)),y=_lum(_rgb(b)); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); }
  function _dist(a,b){ var p=_rgb(a),q=_rgb(b); if(!p||!q) return 0;
    return Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1])+Math.abs(p[2]-q[2]); }`;

(async () => {
  const tmp = path.join(__dirname, '_cpbadge');
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch(e){}
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

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(900);

  for (const size of SIZES){
    await ev(`(function(){ var b=document.querySelector('.toggleBtn[data-size="${size}"]'); if(b) b.click(); })()`);
    await sleep(1000);

    /* Fill every cell but one. That leaves most lines COMPLETE (green) and the
       row/column through the gap still open (orange), so both states are on
       screen at once and can be compared against each other. */
    await ev(`document.getElementById('peekBtn').click()`);
    await sleep(400);
    const sol = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#board .cell')).map(function(i){ return i.value; }))`);
    await sleep(3600);
    await ev(`(function(){
      var sol = ${sol}, cs = document.querySelectorAll('#board .cell');
      for (var i = 0; i < cs.length - 1; i++){
        cs[i].focus(); cs[i].value = sol[i];
        cs[i].dispatchEvent(new Event('input', { bubbles:true }));
      }
      document.activeElement && document.activeElement.blur();
    })()`);
    await sleep(900);

    const r = await ev(`(function(){ ${HELPERS}
      function look(sel){
        var e = document.querySelector(sel); if (!e) return null;
        var s = getComputedStyle(e);
        return { c: Math.round(_ratio(s.color, s.backgroundColor)*10)/10,
                 bg: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius) || 0 };
      }
      var open = look('#board .badge:not(.full):not(.win)');
      var done = look('#board .badge.full, #board .badge.win');
      var cell = getComputedStyle(document.querySelector('#board .cell'));
      return JSON.stringify({ open: open, done: done,
        apart: (open && done) ? _dist(open.bg, done.bg) : 0,
        cellRadius: parseFloat(cell.borderTopLeftRadius) || 0 });
    })()`).then(JSON.parse);

    const tag = size.padEnd(10);
    /* Not every board can show both states. Sir Ramanujan's writes the rest of
       the square for you, so leaving one cell blank still finishes every line
       and there is no unfinished badge to look at. Judge whichever states this
       board actually produces, and require below that the run as a whole saw
       both -- an assertion that a state be present where it cannot be is a
       failing test that says nothing about the product. */
    if (r.open){ sawOpen = true;
      ok(tag + 'unfinished line is readable', r.open.c >= 4.5, r.open.c + ':1  ' + r.open.bg);
      ok(tag + 'unfinished result cells are square', r.open.radius === 0, r.open.radius + 'px');
    }
    if (r.done){ sawDone = true;
      ok(tag + 'finished line is readable', r.done.c >= 4.5, r.done.c + ':1  ' + r.done.bg);
      ok(tag + 'finished result cells are square', r.done.radius === 0, r.done.radius + 'px');
    }
    ok(tag + 'shows at least one result state', !!(r.open || r.done));

    /* Two states that each read well against their own text can still look
       identical to one another -- which is exactly what the old lumped rule
       did. So compare them directly, where both are on screen. */
    if (r.open && r.done){
      ok(tag + 'the two states are plainly different colours', r.apart >= 120,
         'channel distance ' + r.apart);
    }
    ok(tag + 'inner cells stay rounded, so shape separates the two zones',
       r.cellRadius > 0, 'cell radius ' + r.cellRadius + 'px');
  }

  /* Across the whole run both states must have been exercised somewhere --
     otherwise a regression that silently removed one would sail through. */
  ok('an unfinished line was seen on at least one board', sawOpen);
  ok('a finished line was seen on at least one board', sawDone);

  /* ---- THE ONE THAT MATTERS ----
     Raja, on the live board: a finished line was turning green whatever it
     added up to, so the board congratulated a wrong answer. The cause was that
     'full' means FILLED, not CORRECT, and beta-251 gave 'full' the green fill.

     Then, when it was fixed: "6x6 ok, 3 multiply not set well ... it look
     should verify entire puzzle deeply". He was right to distrust a spot
     check. The first version of this test covered ONE board, and the four
     boards above it are whichever four I happened to pick -- Multiply was
     never tested at all, and Multiply is the board where a mistake is most
     likely, because its lines MULTIPLY. A guard that checks one board tells
     you about one board.

     So: every board a child can type a wrong line into. Fill it correctly,
     then swap two squares that share no line. The lines through them now come
     out wrong while the rest still agree -- so the app still infers the right
     target and those lines are genuinely wrong, not merely unknown. Then no
     wrong line may be green, on any board.

     Ramanujan and the two binary boards are deliberately absent: they write
     the rest of the square for you from the top row, so a finished-but-wrong
     line cannot be produced by typing. Asserting a state where it cannot occur
     is a test that fails for the wrong reason and says nothing. */
  const JUDGED = ['3x3','4x4','5x5','6x6','8x8','10x10','3cube'];
  let sawWrong = false;
  for (const size of JUDGED){
    await ev(`(function(){ var b=document.querySelector('.toggleBtn[data-size="${size}"]'); if(b) b.click(); })()`);
    await sleep(1100);
    await ev(`document.getElementById('peekBtn').click()`);
    await sleep(500);
    const sol = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#board .cell')).map(function(i){ return i.value; }))`);
    await sleep(3600);
    await ev(`(function(){
      var sol = ${sol}, cs = document.querySelectorAll('#board .cell');
      /* 0 and half+1 never share a row, column or diagonal on these boards */
      var a = 0, b = Math.floor(cs.length/2) + 1;
      var t = sol[a]; sol[a] = sol[b]; sol[b] = t;
      for (var i=0;i<cs.length;i++){
        if (cs[i].readOnly || cs[i].disabled) continue;
        cs[i].focus(); cs[i].value = sol[i];
        cs[i].dispatchEvent(new Event('input', { bubbles:true }));
      }
      document.activeElement && document.activeElement.blur();
    })()`);
    await sleep(1000);

    const j = await ev(`(function(){
      var tv = document.getElementById('targetVal');
      var target = tv ? parseInt(tv.textContent, 10) : NaN;
      var green = 0, red = 0, greenWrong = 0, bad = [];
      document.querySelectorAll('#board .badge').forEach(function(b){
        var v = parseInt(b.textContent, 10);
        if (isNaN(v)) return;
        var bg = getComputedStyle(b).backgroundColor;
        var isGreen = /18, 122, 69/.test(bg), isRed = /179, 38, 30/.test(bg);
        if (isGreen) green++;
        if (isRed) red++;
        if (isGreen && !isNaN(target) && v !== target){
          greenWrong++; if (bad.length < 2) bad.push(v + ' green vs target ' + target); }
      });
      return JSON.stringify({ target:target, green:green, red:red,
        greenWrong:greenWrong, bad:bad });
    })()`).then(JSON.parse);

    const tag = size.padEnd(8);
    ok(tag + 'works its target out from the lines that agree', !isNaN(j.target),
       'target ' + j.target);
    ok(tag + 'shows NO finished-but-wrong line in green', j.greenWrong === 0,
       j.greenWrong ? j.bad.join(', ') : j.green + ' green, ' + j.red + ' red');
    ok(tag + 'shows a finished-but-wrong line in red instead', j.red >= 1,
       j.red + ' red, ' + j.green + ' green');
    if (j.red >= 1) sawWrong = true;
  }
  ok('the wrong-line state was genuinely reachable on these boards', sawWrong);

  /* ---- THE DIAGONALS, BY NAME ----
     Raja: "straight ok -- orange, green, [red] if error -- but diagonal not."

     The sweep above counted reds and I inferred the diagonals were among them.
     Inference is not a check, and it is the same shortcut that let Multiply
     go untested. So force each of the three states on the diagonals
     specifically and assert the CORNER badges, which are the two diagonals'
     own ends.

     The centre square is the lever: on an odd board it lies on both diagonals
     and on nothing else but its own row and column. Empty it and the diagonals
     are unfinished; spoil it and they are wrong.

     The third case is the one Raja actually photographed -- a wrong number at
     the bottom-middle, which is on NO diagonal. There the diagonals must stay
     green, because they really are still correct. That case is worth pinning
     precisely because it looks like a bug and is not: a line the mistake does
     not touch should keep saying so, which is what makes the ring useful for
     finding the mistake. */
  for (const size of ['3x3','5x5','3cube']){
    for (const mode of ['empty','wrong','off-diagonal']){
      await ev(`document.getElementById('tab-scHome').click()`);
      await sleep(300);
      await ev(`document.querySelector('.toggleBtn[data-size="${size}"]').click()`);
      await sleep(1000);
      await ev(`document.getElementById('peekBtn').click()`);
      await sleep(500);
      const sol = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#board .cell')).map(function(i){ return i.value; }))`);
      await sleep(3600);
      await ev(`(function(){
        var sol = ${sol}, cs = document.querySelectorAll('#board .cell');
        var n = Math.round(Math.sqrt(cs.length)), mid = Math.floor(n/2);
        var centre = mid*n + mid, offDiag = (n-1)*n + mid, mode = '${mode}';
        for (var i=0;i<cs.length;i++){
          if (cs[i].readOnly || cs[i].disabled) continue;
          var v = sol[i];
          if (mode === 'empty'        && i === centre)  v = '';
          if (mode === 'wrong'        && i === centre)  v = '99';
          if (mode === 'off-diagonal' && i === offDiag) v = '99';
          cs[i].focus(); cs[i].value = v;
          cs[i].dispatchEvent(new Event('input', { bubbles:true }));
        }
        document.activeElement && document.activeElement.blur();
      })()`);
      await sleep(1000);

      const d = await ev(`(function(){
        var out = [];
        document.querySelectorAll('#board .badge.corner').forEach(function(b){
          var bg = getComputedStyle(b).backgroundColor;
          out.push(/18, 122, 69/.test(bg) ? 'green'
                 : /179, 38, 30/.test(bg) ? 'red'
                 : /240, 165, 0/.test(bg) ? 'orange' : bg);
        });
        return JSON.stringify(out);
      })()`).then(JSON.parse);

      const want = mode === 'empty' ? 'orange' : mode === 'wrong' ? 'red' : 'green';
      const why  = mode === 'empty' ? 'unfinished diagonals are orange'
                 : mode === 'wrong' ? 'wrong diagonals go red'
                 : 'diagonals a mistake does not touch stay green';
      ok((size + ' ' + mode).padEnd(20) + why,
         d.length > 0 && d.every(c => c === want),
         d.join(',') + '  (wanted all ' + want + ')');
    }
  }

  /* Raja's other two: the duplicate line is gone from the applause panel, and
     the counter beside the target no longer melts into the background. */
  const counter = await ev(`(function(){
    var c = document.querySelector('.solvedCounter');
    if (!c) return '{}';
    var s = getComputedStyle(c);
    return JSON.stringify({ bg:s.backgroundColor, color:s.color });
  })()`).then(JSON.parse);
  ok('the counter beside the target is orange, not the background again',
     /240, 165, 0/.test(counter.bg || ''), JSON.stringify(counter));

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
