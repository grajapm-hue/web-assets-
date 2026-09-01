/* Raja: "before going main from beta, how to ensure all puzzles the correction
   are implemented well -- verify yourself, play it in UI as like users live
   play."

   Every other guard here drives the board by dispatching an `input` event
   straight at a cell. That is not what a child does, and the difference has
   already cost this app a release: the splash Install button was DEAD on a
   phone because touchstart+preventDefault() cancels the click, and the test
   that "passed" used .click(), which fires no touch events at all.

   So this one plays with a finger. Every action is Input.dispatchTouchEvent at
   the element's real screen position -- tapping the puzzle card, tapping a
   square, tapping each digit on the keypad, tapping backspace. Nothing reaches
   into app state.

   Raw touch is chosen deliberately over Input.synthesizeTapGesture. Measured
   on this page: raw touch delivers the full real-device sequence
   (pointerdown, touchstart, touchend, mousedown, mouseup, click) and opens the
   puzzle, while synthesizeTapGesture stops at touchend and never clicks. Raw
   touch is also the honest one: if the app ever cancelled the click the way
   the splash did, this harness would go red instead of quietly passing.

   Every step proves itself. An earlier version tapped PEEK, got nothing, typed
   empty strings into every square and still reported "8/8 filled" -- it was
   counting its own taps. So each step now reads the page back: the puzzle
   really opened, the answer really appeared, the square really holds the digits
   that were tapped into it.

   It plays each board the way a child meets Raja's bug:
     1. fill it correctly except ONE square   -> ring shows unfinished as orange
     2. tap a WRONG number into that square   -> those lines must go RED
     3. backspace, tap the right one          -> they must go GREEN
     4. the board completes                   -> the applause panel opens
   and photographs all four, so the claim can be looked at rather than trusted.

   Run: node play-like-a-user.js                        (live beta URL)
        MM_TARGET=beta.html node play-like-a-user.js    (the local file) */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9844;
const ROOT = path.join(__dirname, '..');
const MT = process.env.MM_TARGET || 'https://grajapm-hue.github.io/web-assets-/mathmatrix/beta.html';
const FILE = /^https?:/.test(MT) ? MT : 'file:///' + path.join(ROOT, MT).split(path.sep).join('/');
const SHOTS = path.join(ROOT, 'play-shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const BOARDS = ['3x3', '4x4', '5x5', '6x6', '3cube'];
const ALSO   = ['8x8', '10x10', 'ramanujan', 'triangle'];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tmp = path.join(__dirname, '_cpplay');
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp,
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(300);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch(e){} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); let errs = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 160));
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  /* Where to put the finger -- and a check that the finger would actually land
     on the thing, rather than on whatever is covering it. */
  const aim = async sel => await ev(`(function(){
    var e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return null;
    var r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    if (r.top < 64 || r.bottom > innerHeight - 8){
      e.scrollIntoView({ block:'center' });
      r = e.getBoundingClientRect();
    }
    var x = Math.round(r.left + r.width/2), y = Math.round(r.top + r.height/2);
    var hit = document.elementFromPoint(x, y);
    return JSON.stringify({ x:x, y:y, onTarget: !!(hit && (hit === e || e.contains(hit) || hit.contains(e))) });
  })()`).then(s => s ? JSON.parse(s) : null);

  async function tap(sel, settle){
    const p = await aim(sel);
    if (!p || !p.onTarget) return false;
    const pt = [{ x: p.x, y: p.y, radiusX: 10, radiusY: 10, force: 1 }];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
    await sleep(40);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(settle === undefined ? 55 : settle);
    return true;
  }
  async function typeDigits(str){
    if (!String(str).length) return false;
    for (const d of String(str)) if (!await tap(`#keypad .kp[data-k="${d}"]`)) return false;
    return true;
  }
  const tapCell = i => tap(`#board .cell:nth-of-type(${i + 1})`, 80);
  async function backspace(n){ for (let i = 0; i < n; i++) await tap(`#keypad .kp[data-nav="back"]`); }

  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  const cellValues = () => ev(`JSON.stringify(Array.from(document.querySelectorAll('#board .cell')).map(function(i){ return i.value; }))`).then(JSON.parse);
  const screen = () => ev(`(function(){ var o=document.querySelector('[data-screen].on'); return o?o.getAttribute('data-screen'):'none'; })()`);
  /* Badges carry `transition: all .3s ease`, so for 300ms after a line changes
     state they are a blend of the old colour and the new one. Reading inside
     that window showed four "muddy brown" badges that were simply orange on
     its way to green -- the fade a child is meant to see, not a defect. Wait
     past it, then insist every badge is definitively one of the three colours:
     if a real fourth state ever appeared, this would catch it. */
  const SETTLE = 520;
  const ring = () => ev(`(function(){
    var tv = document.getElementById('targetVal');
    var n = { orange:0, green:0, red:0, other:0, otherWas:[] };
    document.querySelectorAll('#board .badge').forEach(function(b){
      if (isNaN(parseInt(b.textContent,10))) return;
      var bg = getComputedStyle(b).backgroundColor;
      if (/18, 122, 69/.test(bg)) n.green++;
      else if (/179, 38, 30/.test(bg)) n.red++;
      else if (/240, 165, 0/.test(bg)) n.orange++;
      else { n.other++;
        var tag = bg + ' [' + b.className + ']';
        if (n.otherWas.indexOf(tag) < 0) n.otherWas.push(tag); }
    });
    n.target = tv ? tv.textContent : '?';
    return JSON.stringify(n);
  })()`).then(JSON.parse);

  let ready = false;
  for (let i = 0; i < 25 && !ready; i++){ await sleep(500); ready = await ev(`!!document.querySelector('.splashPlay')`); }
  ok('the page opened', ready === true, FILE);
  await shot('00-splash');
  await tap('.splashPlay', 1400);
  ok('tapping the splash goes in', ['scHome','scPlay'].includes(await screen()), await screen());
  await shot('01-home');

  for (const size of BOARDS){
    errs = [];
    console.log('\n--- playing ' + size + ' with real taps');
    await tap('#tab-scHome', 500);
    await tap(`.toggleBtn[data-size="${size}"]`, 1400);
    ok(size + ': tapping its card really opens the board', (await screen()) === 'scPlay', await screen());

    /* SETUP, and the ONE action here that is not a finger.

       Learning the answer needs the 👁 SHOW button, and the play layout hides
       the row it lives in outright:
           #learnRow,#learnHint,#rotateHint,#msg{ display:none !important; }
       so it cannot be tapped -- there is nothing on screen to tap. Worth
       knowing on its own: every other guard in this folder drives that button
       with .click(), which works on a hidden element and hides the fact that a
       player can never reach it.

       So the answer is read through it programmatically, purely to know what
       to type. Everything being TESTED below -- entering numbers, the badge
       colours, correcting a mistake, the applause panel -- is a real tap. */
    await ev(`document.getElementById('peekBtn').click()`);
    await sleep(800);
    const sol = await cellValues();
    const revealed = sol.filter(v => v !== '').length;
    ok(size + ': the answer can be read for setup', revealed === sol.length && sol.length > 0,
       revealed + '/' + sol.length + ' squares');
    if (revealed !== sol.length){ ok(size + ': SKIPPED, cannot play without the answer', false); continue; }
    await sleep(3800);
    ok(size + ': tapping CLEAR really empties the board', await tap('#clearBtn', 700));

    const n = sol.length, side = Math.round(Math.sqrt(n));
    const gap = (side - 1) * side + Math.floor(side / 2);   // bottom middle: on no diagonal

    /* 1 -- fill every square but one, by tapping */
    for (let i = 0; i < n; i++){
      if (i === gap) continue;
      if (await tapCell(i)) await typeDigits(sol[i]);
    }
    const after = await cellValues();
    const landed = after.filter((v, i) => i !== gap && v === sol[i]).length;
    ok(size + ': every square holds the number that was tapped into it', landed === n - 1,
       landed + '/' + (n - 1) + ' squares');
    await sleep(SETTLE);
    const partial = await ring();
    await shot('play-' + size + '-1-partial');
    ok(size + ': with one square empty the unfinished lines are ORANGE', partial.orange >= 1, JSON.stringify(partial));
    ok(size + ': once the fade settles every badge is orange, green or red',
       partial.other === 0, JSON.stringify(partial.otherWas));

    /* 2 -- tap a WRONG number into the last square.

       Not "99": these boards reject digits outside their own range, so 99 was
       silently clipped to 9 and on 3x3 that happened to BE the right answer --
       the board solved itself and the test read 16 greens where it wanted red.
       Borrow another square's number instead: every value on a magic square is
       distinct, so it is certainly wrong here, certainly in range, and it also
       makes a duplicate, which is what a child actually does. */
    const bad = sol[gap === 0 ? 1 : 0];
    await tapCell(gap);
    await typeDigits(bad);
    await sleep(800 + SETTLE);
    const wrong = await ring();
    await shot('play-' + size + '-2-wrong');
    ok(size + ': a wrong number turns its lines RED, not green', wrong.red >= 1,
       'typed ' + bad + ' where ' + sol[gap] + ' belongs -> ' + JSON.stringify(wrong));
    ok(size + ': no line is green while it disagrees with the target', wrong.target !== '?', 'target ' + wrong.target);

    /* 3 -- rub it out and tap the right one in, as a child fixes it.

       Exactly as many backspaces as there are digits in the square. Four
       blanket presses walked backwards out of the square and emptied three
       INNOCENT ones behind it, and the test then blamed the app for the eight
       orange badges it had just caused itself. */
    await tapCell(gap);
    await backspace(String(bad).length);
    const emptied = (await cellValues())[gap];
    ok(size + ': backspace clears the square it is in, and no other',
       emptied === '' && (await cellValues()).filter((v,i) => i !== gap && v === '').length === 0,
       'square now "' + emptied + '"');
    await typeDigits(sol[gap]);
    await sleep(900 + SETTLE);
    const fixed = await ring();
    await shot('play-' + size + '-3-fixed');
    ok(size + ': correcting it clears every red', fixed.red === 0, JSON.stringify(fixed));

    /* 4 -- the board is complete, so the applause must arrive */
    let up = false;
    for (let i = 0; i < 10 && !up; i++){
      await sleep(600);
      up = await ev(`(function(){ var m=document.getElementById('congratsModal');
        return !!m && getComputedStyle(m).display !== 'none'; })()`);
    }
    ok(size + ': finishing it opens the applause panel', up === true);
    if (up){
      await shot('play-' + size + '-4-solved');
      const p = await ev(`(function(){
        var m = document.getElementById('congratsModal');
        var c = document.getElementById('solvedCounter');
        var b = document.getElementById('board');
        var r = b.getBoundingClientRect(), q = m.getBoundingClientRect();
        return JSON.stringify({
          repeats: /master this level/i.test((m.textContent||'').replace(/\\s+/g,' ')),
          boardVisible: Math.round(Math.min(r.bottom, q.top) - r.top),
          counterBg: c ? getComputedStyle(c).backgroundColor : '?'
        });
      })()`).then(JSON.parse);
      ok(size + ': the panel does not repeat the counter\'s sentence', p.repeats === false);
      ok(size + ': the solved board is still visible above it', p.boardVisible > 120, p.boardVisible + 'px showing');
      ok(size + ': the counter beside the target is orange', /240, 165, 0/.test(p.counterBg), p.counterBg);
      await tap('#nextBtn', 800);
    }
    ok(size + ': no JS errors while playing it', errs.length === 0, errs.join(' | '));
  }

  for (const size of ALSO){
    errs = [];
    await tap('#tab-scHome', 500);
    await tap(`.toggleBtn[data-size="${size}"]`, 1400);
    const onPlay = (await screen()) === 'scPlay';
    const cells = await ev(`document.querySelectorAll('#board .cell').length`);
    if (onPlay){ await tapCell(0); await typeDigits('1'); }
    await shot('play-other-' + size);
    ok(size + ': opens by tapping its card and shows a board', onPlay && cells > 0, cells + ' squares');
    ok(size + ': no JS errors', errs.length === 0, errs.join(' | '));
  }

  console.log('\nscreenshots in ' + SHOTS);
  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
