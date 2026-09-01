/* Pallanguzhi · 4 Players — the real game.

   Started as UI-only, per Raja's own staging: "do UI process first around
   table contents." The bottom half of this file is that original pass —
   the frame is a genuinely different shape from every other puzzle here, a
   ring rather than a line or a grid, so the things worth measuring were
   different too: is it actually 28 cups in a closed square, do all four
   sides carry a distinct identity, does the interior well hold everyone
   without overlapping.

   The top of the file (below) is the rules pass: "go through for
   integration of code for same as existing 2 player game rules and
   procedures... the seed fill sequence will circulate by as same methode
   of existing game." Same algorithm as the 2-player board — sowing,
   capture, pasu, pillai pockets, round-end — run on a 28-cup ring with 2,
   3 or 4 live seats instead of a fixed 14-cup, 2-seat board. Verified with
   real invariants (seed conservation in cups+store+hand, no negative
   counts, turn only ever lands on an enabled side) rather than eyeballing
   a screenshot, the same discipline the 2-player board's own check file
   uses. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9953;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cppal4');
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
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1700);
  await ev(`(document.querySelector('.splashPlay')||{click(){}}).click()`); await sleep(900);

  ok('the 4-player card is on the puzzle list', await ev(`!!document.getElementById('pal4Tab')`));
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(800);
  ok('the panel opens', await ev(`getComputedStyle(document.getElementById('pal4Panel')).display`) !== 'none');

  /* THE RING. 28 cups, 4 corners, and — the part that actually matters —
     every cup is owned by exactly one of the four sides, with no cup
     belonging to two sides or to none. */
  const shape = await ev(`(function(){
    var cups = document.querySelectorAll('#pal4Frame .pal4Cup');
    var out = { total: cups.length, perSide: { A:0, B:0, C:0, D:0 }, unowned: 0, multi: 0 };
    cups.forEach(function(c){
      var owned = ['A','B','C','D'].filter(function(s){ return c.classList.contains('side'+s); });
      if (owned.length === 0) out.unowned++;
      else if (owned.length > 1) out.multi++;
      else out.perSide[owned[0]]++;
    });
    out.corners = document.querySelectorAll('#pal4Frame .pal4Corner').length;
    return JSON.stringify(out); })()`).then(JSON.parse);
  ok('28 cups in all', shape.total === 28, shape.total + ' cups');
  ok('4 empty corners where the ring turns', shape.corners === 4, shape.corners + ' corners');
  ok('every cup belongs to exactly one side', shape.unowned === 0 && shape.multi === 0,
    shape.unowned + ' unowned, ' + shape.multi + ' claimed by more than one side');
  ok('each side holds exactly 7 cups', Object.values(shape.perSide).every(n => n === 7),
    'A:' + shape.perSide.A + ' B:' + shape.perSide.B + ' C:' + shape.perSide.C + ' D:' + shape.perSide.D);

  /* THE FOUR CARDS. Present, distinctly coloured from one another (this
     project has shipped identical-looking "distinct" colours before — the
     lesson from the 2-player board's own review), and holding a real,
     typeable name box. */
  const cards = await ev(`(function(){
    var out = {};
    ['A','B','C','D'].forEach(function(s){
      var el = document.getElementById('pal4Card' + s);
      var nm = el && el.querySelector('.pal4CardName');
      var bg = nm ? getComputedStyle(nm).backgroundColor : null;
      out[s] = { present: !!el, bg: bg, isInput: nm && nm.tagName === 'INPUT' };
    });
    return JSON.stringify(out); })()`).then(JSON.parse);
  ['A', 'B', 'C', 'D'].forEach(s => ok(s + '\u2019s card is present and its name box is a real input', cards[s].present && cards[s].isInput));
  const bgs = ['A', 'B', 'C', 'D'].map(s => cards[s].bg);
  ok('all four cards are visibly different colours from each other', new Set(bgs).size === 4, bgs.join(' | '));

  /* SaNa, named, and the arrow that points at whoever Choose Player names. */
  const sana = await ev(`(function(){
    var f = document.querySelector('.pal4SanaFace');
    var n = document.querySelector('.pal4SanaName');
    return JSON.stringify({ face: !!f, name: n ? n.textContent.trim() : null }); })()`);
  const sanaP = JSON.parse(sana);
  ok('SaNa sits in the middle with her name under her', sanaP.face && sanaP.name === 'SaNa', JSON.stringify(sanaP));

  const before = await ev(`(function(){
    var look = document.getElementById('pal4Look');
    return JSON.stringify({ cls: look.className, txt: document.getElementById('pal4Choose').textContent }); })()`).then(JSON.parse);
  ok('starts pointed at Player A', /lookA/.test(before.cls) && /Player A starts/.test(before.txt), JSON.stringify(before));

  /* A -> D -> C -> B, not A -> B -> C -> D. Raja, once the seeds themselves
     were turned anti-clockwise to match the 2-player board: "the auto next
     player SaNa pointer should be in ADCB direction." Play now travels the
     same way round as the sowing does -- four people sitting round a phone
     pass play the way the board runs, not against it -- so this expects the
     new order deliberately. */
  for (const want of ['D', 'C', 'B', 'A']){
    await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);
    const st = await ev(`(function(){
      var look = document.getElementById('pal4Look');
      var activeCups = document.querySelectorAll('.pal4Cup.side${want}.active').length;
      var otherActive = document.querySelectorAll('.pal4Cup.active:not(.side${want})').length;
      return JSON.stringify({ cls: look.className, activeCups: activeCups, otherActive: otherActive,
        txt: document.getElementById('pal4Choose').textContent }); })()`).then(JSON.parse);
    ok('Choose Player advances to ' + want + ' — arrow, highlight and label all agree',
      st.cls.indexOf('look' + want) > -1 && st.activeCups === 7 && st.otherActive === 0 && st.txt.indexOf('Player ' + want) > -1,
      JSON.stringify(st));
  }

  /* Renaming a card updates the Choose Player label live, the same
     immediate-feedback behaviour the 2-player board already has. */
  await ev(`var el = document.querySelector('#pal4CardA .pal4CardName'); el.value = 'Raja';
            el.dispatchEvent(new Event('input'));`);
  await sleep(150);
  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);   // -> D
  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);   // -> C
  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);   // -> B
  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);   // -> A (Raja)
  const renamed = await ev(`document.getElementById('pal4Choose').textContent`);
  ok('a typed name reaches the Choose Player label', /Raja starts/.test(renamed), renamed);

  /* THE APP-BAR TITLE MUST NOT TRUNCATE — the screenshot caught it once
     already: the fuller name overflowed to an ellipsis mid-word. */
  const titleFit = await ev(`(function(){
    var t = document.getElementById('appBarTitle');
    return JSON.stringify({ text: t.textContent.trim(), overflows: t.scrollWidth > t.clientWidth + 1 }); })()`).then(JSON.parse);
  ok('the app-bar title fits without truncating', !titleFit.overflows, JSON.stringify(titleFit));

  /* THE TICK BOXES — Raja: "select sub level, either 2 player or 3 or
     four... the select will done by four tick box that decide who are to
     enable the run fill seed sequence." Measured on the actual cups and
     cards, not a proxy — the lesson from the input-width bug earlier in
     this file: a container can look right while its content doesn't. */
  const tickState = () => ev(`JSON.stringify(window.__pal4State())`).then(JSON.parse);

  const t0 = await tickState();
  ok('all four sides start enabled', ['A', 'B', 'C', 'D'].every(s => t0.enabled[s]), JSON.stringify(t0.enabled));

  await ev(`document.querySelector('.pal4Tick.sideB input').click()`); await sleep(150);
  const afterB = await ev(`(function(){
    var cups = document.querySelectorAll('.pal4Cup.sideB');
    var allOff = cups.length === 7 && Array.from(cups).every(function(c){ return c.classList.contains('off'); });
    var card = document.getElementById('pal4CardB');
    return JSON.stringify({ allOff: allOff, cardOff: card.classList.contains('off') }); })()`).then(JSON.parse);
  ok('unticking B dims all 7 of its cups', afterB.allOff, JSON.stringify(afterB));
  ok('and dims its card too', afterB.cardOff);

  await ev(`document.querySelector('.pal4Tick.sideC input').click()`); await sleep(150);
  const t2 = await tickState();
  ok('dropping to 2 players (A and D) is allowed', t2.enabled.A && !t2.enabled.B && !t2.enabled.C && t2.enabled.D, JSON.stringify(t2.enabled));

  await ev(`document.querySelector('.pal4Tick.sideD input').click()`); await sleep(150);
  const dChecked = await ev(`document.querySelector('.pal4Tick.sideD input').checked`);
  const t3 = await tickState();
  ok('a third uncheck that would drop to 1 player is blocked',
    dChecked === true && t3.enabled.D === true, 'checked=' + dChecked + ' enabled.D=' + t3.enabled.D);

  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);
  const afterChoose1 = await tickState();
  ok('Choose Player skips disabled sides entirely — lands on D, not B or C', afterChoose1.active === 'D', afterChoose1.active);
  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);
  const afterChoose2 = await tickState();
  ok('and cycles only back to A, never touching B or C', afterChoose2.active === 'A', afterChoose2.active);

  await ev(`document.querySelector('.pal4Tick.sideB input').click()`); await sleep(150);
  const bRestored = await ev(`(function(){
    var cups = document.querySelectorAll('.pal4Cup.sideB');
    return Array.from(cups).every(function(c){ return !c.classList.contains('off'); }); })()`);
  ok('re-ticking B lifts the dimming from all 7 of its cups', bRestored);

  /* Active side is A here (A/B/D enabled, C still off). Unticking the
     ACTIVE side itself — not some other side — is the case the earlier
     sequence never exercised, since active stayed on A throughout it. */
  await ev(`document.querySelector('.pal4Tick.sideA input').click()`); await sleep(150);
  const afterActiveUnticked = await tickState();
  ok('unticking the currently-active side moves the highlight off it, not stuck on a disabled side',
    afterActiveUnticked.enabled[afterActiveUnticked.active] === true && afterActiveUnticked.active !== 'A',
    JSON.stringify(afterActiveUnticked));
  await ev(`document.querySelector('.pal4Tick.sideA input').click()`); await sleep(150);   // restore A

  await ev(`document.querySelector('.pal4Tick.sideC input').click()`); await sleep(150);
  const tFinal = await tickState();
  ok('all four sides back to enabled by the end', ['A', 'B', 'C', 'D'].every(s => tFinal.enabled[s]), JSON.stringify(tFinal.enabled));

  /* NEW GAME — UI-only reset, mirrors the 2-player board's 🔄 New game.
     Leave the board in a scrambled state (some sides off, Choose Player
     cycled), hit it, and confirm everything actually snaps back: state,
     AND the checkbox elements themselves, not just the JS side of it. */
  await ev(`document.querySelector('.pal4Tick.sideB input').click()`); await sleep(150);
  await ev(`document.querySelector('.pal4Tick.sideC input').click()`); await sleep(150);
  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);
  await ev(`document.getElementById('pal4New').click()`); await sleep(300);
  const afterNew = await tickState();
  const boxesChecked = await ev(`(function(){
    return ['A','B','C','D'].every(function(s){
      return document.querySelector('.pal4Tick.side' + s + ' input').checked; }); })()`);
  ok('New game resets all four sides enabled and Choose Player back to A',
    ['A', 'B', 'C', 'D'].every(s => afterNew.enabled[s]) && afterNew.active === 'A', JSON.stringify(afterNew));
  ok('and the tick-box elements themselves show checked, not just internal state', boxesChecked);

  /* THE WELL. Nothing inside the square's open middle should spill outside
     it or overlap the cup ring — a real risk on the narrowest phones, since
     the well shrinks with the whole frame while the cards inside it don't. */
  const overlap = await ev(`(function(){
    var well = document.querySelector('.pal4Well').getBoundingClientRect();
    var bad = [];
    /* THE LEAF ELEMENTS, not just the containers around them. Raja circled the
       exact bug this replaced: the containers (.pal4Card) were always sized
       correctly — a fixed, absolutely-positioned 76px box, safely inside the
       well — while the <input> living inside one took the browser's own
       default width (about 170-200px, from the implicit size=20 no one had
       overridden) and simply ignored its parent's declared size, bleeding
       into the cup ring on both sides. A check that only measures the
       container never sees that, because the container never moved — only
       its child did. Proved by putting the old CSS back: the container-only
       version of this check stayed green throughout. */
    document.querySelectorAll('.pal4Card, .pal4SanaMid, .pal4CardName, .pal4CardStore').forEach(function(el){
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.left < well.left - 2 || r.right > well.right + 2 || r.top < well.top - 2 || r.bottom > well.bottom + 2)
        bad.push((el.className.split(' ')[0] || el.tagName) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + '] vs well [' + Math.round(well.left) + '..' + Math.round(well.right) + ']');
    });
    return JSON.stringify(bad); })()`).then(JSON.parse);
  ok('every card, its name box, its store, and SaNa all stay inside the open well',
    overlap.length === 0, overlap.length ? overlap.join(' | ') : 'all contained, leaf elements included');

  /* SWITCHING AWAY MUST CLOSE THIS CLEANLY, and switching to every other
     puzzle from here must not leave this panel showing underneath it. The
     2-player board had exactly this class of bug for several other modes at
     various points, which is why every one of them is swept here rather than
     trusted by pattern alone. */
  const others = [
    { go: `document.querySelector('.toggleBtn[data-sud-level="mini"]').click()`, wait: 700, name: 'Sudoku' },
    { go: `document.querySelector('.toggleBtn[data-size="binary"]').click()`, wait: 700, name: 'Binary' },
    { go: `document.getElementById('gateListBtn').click()`, wait: 700, name: 'Gate Logic' },
    { go: `document.getElementById('palTab').click()`, wait: 1000, name: 'Pallanguzhi (2-player)' },
    { go: `document.querySelector('.toggleBtn[data-size="3x3"]').click()`, wait: 700, name: '3x3 grid puzzle' }
  ];
  for (const o of others){
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
    await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
    await ev(`document.getElementById('pal4Tab').click()`); await sleep(700);   // open it fresh each time
    await ev(o.go); await sleep(o.wait);
    const still = await ev(`getComputedStyle(document.getElementById('pal4Panel')).display`);
    ok('opening ' + o.name + ' closes the 4-player panel', still === 'none', 'display: ' + still);
  }

  /* And the reverse: opening this from every other mode must close THEM. */
  const froms = [
    { go: `document.querySelector('.toggleBtn[data-sud-level="mini"]').click()`, wait: 700, panel: 'sudokuPanel', name: 'Sudoku' },
    { go: `document.getElementById('palTab').click()`, wait: 1000, panel: 'palPanel', name: 'Pallanguzhi (2-player)' },
    { go: `document.querySelector('.toggleBtn[data-size="3x3"]').click()`, wait: 700, panel: null, name: '3x3 grid' }
  ];
  for (const f of froms){
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
    await ev(f.go); await sleep(f.wait);
    await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
    await ev(`document.getElementById('pal4Tab').click()`); await sleep(800);
    const nowOpen = await ev(`getComputedStyle(document.getElementById('pal4Panel')).display`) !== 'none';
    ok('opening the 4-player board from ' + f.name + ' actually shows it', nowOpen);
    if (f.panel){
      const otherStill = await ev(`getComputedStyle(document.getElementById('${f.panel}')).display`);
      ok('and closes ' + f.name + ' behind it', otherStill === 'none', 'display: ' + otherStill);
    }
  }

  /* THE TIGHTEST PHONE — a square board is exactly the shape most likely to
     overflow a narrow screen, since its height is tied to its width. Unlike
     the 2-player board, #pal4Panel is built with overflow-y:auto — scrolling
     to reach the foot row is the DESIGN, not a failure, especially now that
     the foot row carries four items (language, New game, How to play,
     the reserve stat) instead of the original one. The guarantee here is
     "reachable", not "visible without scrolling". */
  await send('Emulation.setDeviceMetricsOverride', { width: 340, height: 780, deviceScaleFactor: 2, mobile: true });
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(800);
  const tight = await ev(`(function(){
    var panel = document.getElementById('pal4Panel');
    var frame = document.querySelector('.pal4Frame').getBoundingClientRect();
    panel.scrollTop = panel.scrollHeight;   // scroll all the way, as a player would
    var f = document.querySelector('.pal4Foot').getBoundingClientRect();
    var b = document.querySelector('.tabBar').getBoundingClientRect().top;
    return JSON.stringify({ footReachable: f.bottom <= b + 1, footBottom: Math.round(f.bottom), bar: Math.round(b),
      frameWidth: Math.round(frame.width), scrolled: panel.scrollHeight > panel.clientHeight + 1 }); })()`).then(JSON.parse);
  ok('at 340x780, the foot row (language / New game / How to play / reserve) is reachable by scrolling',
    tight.footReachable,
    tight.footReachable
      ? 'foot ' + tight.footBottom + ', bar ' + tight.bar + (tight.scrolled ? ' (scrolling was needed)' : ' (fit without scrolling)')
      : 'STILL unreachable even scrolled to the end — foot ' + tight.footBottom + ', bar ' + tight.bar);

  /* Raja: "are you ensured and verified your self the correction of text
     font size increase change should not over ride or that cause existing
     any tab or usage area should not Miss out in with in screen." Direct
     answer: no, the first attempt at pal4Say's own size (19px, passing
     every overflow/collision/scroll-budget check that existed at the time)
     pushed the tick-box row and Choose Player button below the fold ON
     OPEN, unscrolled — a real regression none of those checks were built
     to catch, since none of them asked "is everything still visible
     without scrolling the moment this screen opens." This is that check,
     kept permanent so a future size change can't reintroduce the same gap
     silently. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(800);
  const onOpen = await ev(`(function(){
    var panel = document.getElementById('pal4Panel');
    panel.scrollTop = 0;   // exactly how the screen looks the moment it opens
    var tabBar = document.querySelector('.tabBar').getBoundingClientRect();
    var select = document.querySelector('.pal4Select').getBoundingClientRect();
    var choose = document.querySelector('.pal4Choose').getBoundingClientRect();
    return JSON.stringify({
      selectVisible: select.bottom <= tabBar.top + 1 && select.top >= 0,
      chooseVisible: choose.bottom <= tabBar.top + 1 && choose.top >= 0,
      selectBottom: Math.round(select.bottom), chooseBottom: Math.round(choose.bottom),
      tabBarTop: Math.round(tabBar.top) }); })()`).then(JSON.parse);
  ok('at 340x780, the tick-box row is visible the moment the screen opens — no scroll needed',
    onOpen.selectVisible, 'select bottom ' + onOpen.selectBottom + ' vs tab bar ' + onOpen.tabBarTop);
  ok('and so is Choose Player', onOpen.chooseVisible, 'choose bottom ' + onOpen.chooseBottom + ' vs tab bar ' + onOpen.tabBarTop);
  ok('and the square frame itself is a sensible size, not crushed', tight.frameWidth >= 250, tight.frameWidth + 'px wide');

  /* Raja again, on the tick-box row specifically: "reduce the tab and font
     size it's too big keep it all in single row." The row not overflowing
     ITS OWN box (already checked) is not the same guarantee as the four
     chips staying on one LINE — flex-wrap kicks in long before any actual
     overflow, so no prior check ever caught it. Checked across the whole
     realistic phone width range (340-412px), not just the one tightest
     size, since the wrap point turned out to depend on width in a way a
     single sample would miss. */
  const widths = [340, 360, 375, 390, 412];
  for (const w of widths){
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(150);
    await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
    await ev(`document.getElementById('pal4Tab').click()`); await sleep(500);
    const row = await ev(`(function(){
      var tops = Array.from(document.querySelectorAll('#pal4Select .pal4Tick')).map(function(c){ return Math.round(c.getBoundingClientRect().top); });
      return JSON.stringify({ singleRow: new Set(tops).size === 1, tops: tops }); })()`).then(JSON.parse);
    ok('at ' + w + 'px, all four tick boxes stay on one line', row.singleRow, JSON.stringify(row.tops));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 340, height: 780, deviceScaleFactor: 2, mobile: true });

  /* D, SaNa and B all sit on the SAME horizontal band in the well's middle
     row. The well-containment check above only guards the well's OUTER
     edge — two siblings can each stay safely inside that edge and still
     collide with each other in the middle, which containment alone would
     never see. This is the sizing pass's own real risk: Raja asked for
     "as much maximum increase font and tab size" on these cards, and the
     first attempt at that (proven by deliberately widening .pal4D to
     130px during this change) sailed straight through the containment
     check while visibly overlapping SaNa. Measuring the actual gaps
     between the three is what catches that a containment check cannot. */
  const bandGaps = await ev(`(function(){
    var d = document.querySelector('.pal4D').getBoundingClientRect();
    var sana = document.querySelector('.pal4SanaFace').getBoundingClientRect();
    var b = document.querySelector('.pal4B').getBoundingClientRect();
    return JSON.stringify({ dSanaGap: Math.round(sana.left - d.right), sanaBGap: Math.round(b.left - sana.right) }); })()`).then(JSON.parse);
  /* 4px is not an arbitrary floor — it is the actual safety margin the
     card-width search (beta-196) was run against when finding the true
     maximum size for these cards: "your self verify how much maximum font
     size can fix any where with out collide to near any one." Enforcing
     the same number here means a future size bump that erodes back below
     the margin the search itself required gets caught, not just anything
     that touches outright. */
  ok('at 340x780, Player D\'s card keeps its full design margin from SaNa', bandGaps.dSanaGap >= 4, bandGaps.dSanaGap + 'px gap');
  ok('and Player B\'s card keeps its margin too', bandGaps.sanaBGap >= 4, bandGaps.sanaBGap + 'px gap');

  /* ══ THE REAL GAME ═══════════════════════════════════════════════════
     Back to a normal, un-shrunk phone and a fresh board for the rules
     pass — the UI-fit checks above deliberately left things resized. */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(700);   // __pal4New() fires, fresh state

  const state = () => ev(`JSON.stringify(window.__pal4State())`).then(JSON.parse);
  const total = s => s.cups.reduce((a, b) => a + b, 0) + s.store.reduce((a, b) => a + b, 0) + s.hand;
  async function untick(side){ await ev(`document.querySelector('.pal4Tick.side${side} input').click()`); await sleep(60); }
  async function dealSide(side){
    await ev(`document.querySelector('#pal4Card${side} .pal4CardStore').click()`);
    await sleep(2050);   // 7 drops * 260ms + margin — real time, not force-finished (see the deal/sow note below)
  }
  /* Pillai pockets left over from the round that just ended (beta-212) now
     block dealing until every owner has tapped their own to collect it --
     any redeal loop written before that landed needs to clear those first,
     or dealSide() calls just get silently refused forever. */
  async function collectAllPillai4(){
    for (let guard = 0; guard < 10; guard++){
      const st = await state();
      const idx = st.pillai.findIndex((p, i) => p && st.cups[i] > 0 && !st.dealt[Math.floor(i / 7)]);
      if (idx < 0) return;
      await ev(`document.querySelector('.pal4Cup[data-pal4="${idx}"]').click()`);
      await sleep(150);
    }
  }
  async function findLiftable(activeLetter){
    return ev(`(function(){
      var SIDES = ['A','B','C','D'], p = SIDES.indexOf('${activeLetter}');
      var st = window.__pal4State();
      for (var i = p*7; i < p*7+7; i++) if (st.cups[i] > 0 && !st.pillai[i]) return i;
      return null; })()`);
  }
  async function findPasu(){
    return ev(`(function(){
      var st = window.__pal4State();
      for (var i = 0; i < 28; i++) if (st.cups[i] === 4 && !st.dead[i] && !st.pillai[i]) return i;
      return null; })()`);
  }

  /* DEALING — before any deal, tapping a cup must refuse with "lay out
     both rows first", never silently do nothing. */
  const preDeal = await ev(`(function(){
    var say = document.getElementById('pal4Say').innerHTML;
    document.querySelector('.pal4Cup[data-pal4="0"]').click();
    return { before: say, after: document.getElementById('pal4Say').innerHTML }; })()`);
  ok('tapping a cup before anyone has dealt is refused, not silently ignored', preDeal.after !== preDeal.before, preDeal.after);

  await dealSide('A');
  let st = await state();
  ok('after only A deals, play has not started yet', !st.playing, JSON.stringify(st.dealt));
  ok('A’s row is 5 seeds a cup, A’s store is drained to 0', st.cups.slice(0, 7).every(c => c === 5) && st.store[0] === 0,
    'A cups=' + JSON.stringify(st.cups.slice(0, 7)) + ' store=' + st.store[0]);
  ok('every OTHER row is still empty and every other store still 35', st.cups.slice(7).every(c => c === 0) && st.store.slice(1).every(s => s === 35),
    JSON.stringify(st.store));

  const alreadyDealt = await ev(`(function(){
    var say = document.getElementById('pal4Say').innerHTML;
    document.querySelector('#pal4CardA .pal4CardStore').click();
    return document.getElementById('pal4Say').innerHTML !== say; })()`);
  ok('tapping an already-dealt store says so rather than re-dealing', alreadyDealt);

  await dealSide('B'); await dealSide('C'); await dealSide('D');
  st = await state();
  ok('play starts the instant the LAST enabled side deals', st.playing, JSON.stringify(st.dealt));
  ok('every store drained to 0, every cup at 5, 140 seeds total', total(st) === 140 && st.store.every(s => s === 0) && st.cups.every(c => c === 5),
    'total=' + total(st));
  ok('active starts on the chosen starter (A by default)', st.active === 'A', st.active);

  /* TICK BOXES LOCK once dealing has begun — not just cosmetically; the
     actual `enabled` state must refuse to change, since the ring math and
     everyone's reserves already assume this exact seat list. */
  const lockAttempt = await ev(`(function(){
    var cb = document.querySelector('.pal4Tick.sideD input');
    cb.checked = false; cb.dispatchEvent(new Event('change'));
    return cb.checked; })()`);
  ok('unticking a side mid-game is rejected — checkbox snaps back', lockAttempt === true, 'checked=' + lockAttempt);
  st = await state();
  ok('and D is still genuinely enabled in the real game state, not just the checkbox', st.enabled.D === true, JSON.stringify(st.enabled));

  /* NOT YOURS / EMPTY / PLAY A REAL MOVE, with seed conservation checked
     after every single move — the one assertion (mirroring the 2-player
     check file's own) that would catch a sowing loop dropping a seed, a
     capture paying out twice, or a pasu claimed from an already-empty cup. */
  const notYours = await ev(`(function(){
    var say = document.getElementById('pal4Say').innerHTML;
    document.querySelector('.pal4Cup[data-pal4="7"]').click();   // cup 7 is B's, A is active
    return document.getElementById('pal4Say').innerHTML !== say; })()`);
  ok('tapping a cup that is not the active player’s own is refused', notYours);

  let pasuClaimed = false, sawMultiCupCascade = false, moveCount = 0;
  while (moveCount < 60){
    st = await state();
    if (!st.playing) break;
    const pasuIdx = await findPasu();
    if (pasuIdx !== null && !pasuClaimed){
      const before = await state();
      await ev(`document.querySelector('.pal4Cup[data-pal4="${pasuIdx}"]').click()`); await sleep(80);
      const after = await state();
      ok('claiming a pasu (cup of four) pays out correctly and clears the cup',
        total(before) === total(after) && after.cups[pasuIdx] === 0, 'before=' + total(before) + ' after=' + total(after));
      pasuClaimed = true;
      continue;
    }
    const liftIdx = await findLiftable(st.active);
    if (liftIdx === null) break;
    const before = await state();
    await ev(`document.querySelector('.pal4Cup[data-pal4="${liftIdx}"]').click()`);
    await ev(`window.__pal4Stop()`);   // force this move to finish instantly, same safety valve the 2-player board exposes
    await sleep(40);
    const after = await state();
    if (total(before) !== total(after)){
      ok('seed conservation on move ' + moveCount, false, 'before=' + total(before) + ' after=' + total(after));
      break;
    }
    if (after.dropped > 1) sawMultiCupCascade = true;
    if (after.playing && !Object.keys(after.enabled).filter(k => after.enabled[k]).includes(after.active)){
      ok('turn only ever lands on an enabled side', false, 'active=' + after.active);
      break;
    }
    moveCount++;
  }
  ok('seed total (140) held across every move played', total(await state()) === 140, 'moves played: ' + moveCount);
  ok('at least one cascading multi-cup move occurred', sawMultiCupCascade);

  /* A 2-OF-4 GAME — the disabled sides' reserves must never move, not even
     by one seed, across the whole game. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(700);
  await untick('B'); await untick('D');
  await dealSide('A'); await dealSide('C');
  st = await state();
  ok('a 2-player game (A+C) starts once just those two have dealt', st.playing, JSON.stringify(st.dealt));
  ok('B and D’s 35 each sit completely untouched at 70 seeds in play', st.store[1] === 35 && st.store[3] === 35 &&
    st.cups.slice(7, 14).every(c => c === 0) && st.cups.slice(21, 28).every(c => c === 0),
    'store=' + JSON.stringify(st.store));
  for (let i = 0; i < 15 && st.playing; i++){
    const liftIdx = await findLiftable(st.active);
    if (liftIdx === null) break;
    await ev(`document.querySelector('.pal4Cup[data-pal4="${liftIdx}"]').click()`);
    await ev(`window.__pal4Stop()`); await sleep(40);
    st = await state();
  }
  ok('B and D still completely untouched after real play in a 2-player game',
    st.store[1] === 35 && st.store[3] === 35 && st.cups.slice(7, 14).every(c => c === 0) && st.cups.slice(21, 28).every(c => c === 0),
    'store=' + JSON.stringify(st.store));
  ok('and the 70 seeds actually in play are still fully conserved', st.cups.slice(0, 7).reduce((a, b) => a + b, 0) +
    st.cups.slice(14, 21).reduce((a, b) => a + b, 0) + st.store[0] + st.store[2] + st.hand === 70,
    JSON.stringify(st));

  /* PILLAI FORMATION ON A REDEAL — Raja: "pillai savings should be filled
     by only who previously ended the sequence in shortfall... but here
     both are filling during sequence." A symmetric "always leftmost cup"
     strategy for both sides mirrors their play exactly and their stores
     never diverge, so this deliberately plays A and C asymmetrically
     (leftmost vs rightmost) until a round ends with an UNEVEN split, then
     inspects the very next deal directly: the richer side (>35, a surplus)
     must get NO pillai pockets at all; the shortfall side (<35) must get
     exactly one, sized to its own remainder past the last full five. */
  function asymLift(state, letter){
    var range = letter === 'A' ? [0, 6] : [14, 20];
    if (letter === 'A'){ for (var i = range[0]; i <= range[1]; i++) if (state.cups[i] > 0 && !state.pillai[i]) return i; }
    else { for (var i = range[1]; i >= range[0]; i--) if (state.cups[i] > 0 && !state.pillai[i]) return i; }
    return null;
  }
  let unevenFound = false, preSplit = null, postDeal = null;
  for (let round = 0; round < 6 && !unevenFound; round++){
    for (let move = 0; move < 80; move++){
      st = await state();
      if (!st.playing){
        if (st.store[0] > 0 && st.store[2] > 0 && (!st.dealt[0] || !st.dealt[2])){
          await collectAllPillai4();   // clear any leftover pillai first, or dealSide below just gets refused
          st = await state();
          if (st.store[0] !== st.store[2]){
            preSplit = st;
            if (!st.dealt[0]) await dealSide('A');
            if (!st.dealt[2]) await dealSide('C');
            postDeal = await state();
            unevenFound = true;
          } else {
            if (!st.dealt[0]) await dealSide('A');
            if (!st.dealt[2]) await dealSide('C');
            continue;
          }
        }
        break;
      }
      const liftIdx = asymLift(st, st.active);
      if (liftIdx === null) break;
      await ev(`document.querySelector('.pal4Cup[data-pal4="${liftIdx}"]').click()`);
      await ev(`window.__pal4Stop()`); await sleep(40);
    }
  }
  ok('an uneven A/C store split happened after a round ended', unevenFound && preSplit,
    preSplit ? ('A=' + preSplit.store[0] + ' C=' + preSplit.store[2]) : 'never happened');
  if (unevenFound){
    const aStore = preSplit.store[0], cStore = preSplit.store[2];
    const richer = aStore > cStore ? 'A' : 'C', poorer = richer === 'A' ? 'C' : 'A';
    const richerRange = richer === 'A' ? [0, 6] : [14, 20], poorerRange = poorer === 'A' ? [0, 6] : [14, 20];
    let richerPillai = 0, poorerPillai = 0;
    for (let i = richerRange[0]; i <= richerRange[1]; i++) if (postDeal.pillai[i]) richerPillai++;
    for (let i = poorerRange[0]; i <= poorerRange[1]; i++) if (postDeal.pillai[i]) poorerPillai++;
    const poorerAmount = Math.min(aStore, cStore);
    ok('richer side (' + richer + ', had ' + Math.max(aStore, cStore) + ') gets NO pillai pockets on redeal',
      richerPillai === 0, richer + ' pillai cups: ' + richerPillai);
    ok('shortfall side (' + poorer + ', had ' + poorerAmount + ') gets exactly the one pillai pocket its own remainder implies',
      poorerAmount % 5 === 0 ? poorerPillai === 0 : poorerPillai === 1,
      poorer + ' pillai cups: ' + poorerPillai + ' (remainder past full fives: ' + (poorerAmount % 5) + ')');
  }

  /* PASU CLAIM ON YOUR OWN LAST CUP — Raja, from a real device: with B's
     whole row empty, the game never handed the turn to C; it just sat
     stuck on B, and B had nothing to tap. Root cause: a pasu claim is
     allowed at any time and correctly never consumes a turn, but that
     also meant it never checked whether the player to move now has an
     empty row, the way a completed sow does via endTurn4. Play until the
     active player's only remaining liftable cups are ALL exactly 4 (a
     symmetric "always leftmost" strategy never produces this on its own,
     so this specifically claims pasus instead of sowing once it arises),
     then claim them as pasu bonuses instead of sowing and confirm the
     round ends instead of leaving the game stuck. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(700);
  let pasuStuckFound = false, pasuBefore = null, pasuAfter = null;
  outerPasu:
  for (let round = 0; round < 15; round++){
    for (let move = 0; move < 150; move++){
      st = await state();
      if (!st.playing){
        const letters = ['A', 'B', 'C', 'D'];
        if (letters.every(s => st.store[letters.indexOf(s)] === 0)) break outerPasu;
        await collectAllPillai4();   // clear any leftover pillai first, or dealSide below just gets refused
        for (const s of letters) if (!st.dealt[letters.indexOf(s)]) await dealSide(s);
        continue;
      }
      const activeIdx = ['A', 'B', 'C', 'D'].indexOf(st.active);
      const ownLiftable = [];
      for (let i = activeIdx * 7; i < activeIdx * 7 + 7; i++) if (st.cups[i] > 0 && !st.pillai[i]) ownLiftable.push(i);
      const allFour = ownLiftable.length > 0 && ownLiftable.every(i => st.cups[i] === 4 && !st.dead[i]);
      if (allFour){
        pasuBefore = st;
        for (const idx of ownLiftable){ await ev(`document.querySelector('.pal4Cup[data-pal4="${idx}"]').click()`); await sleep(150); }
        pasuAfter = await state();
        pasuStuckFound = true;
        break outerPasu;
      }
      const liftIdx = await findLiftable(st.active);
      if (liftIdx === null) break;
      await ev(`document.querySelector('.pal4Cup[data-pal4="${liftIdx}"]').click()`);
      await ev(`window.__pal4Stop()`); await sleep(30);
    }
  }
  ok('reached a state where the active player’s only remaining cups were all exactly 4', pasuStuckFound,
    pasuStuckFound ? ('active was ' + pasuBefore.active) : 'never happened in the move budget');
  if (pasuStuckFound){
    const activeIdx = ['A', 'B', 'C', 'D'].indexOf(pasuBefore.active);
    const rowSlice = pasuAfter.cups.slice(activeIdx * 7, activeIdx * 7 + 7);
    const pillaiSlice = pasuAfter.pillai.slice(activeIdx * 7, activeIdx * 7 + 7);
    /* "No LIFTABLE seeds left", not "every cup reads zero". Since beta-213 a
       savings pocket is NOT swept at round end -- it stays in its own cup
       until its owner taps it -- so a legitimately-uncollected pillai can
       still show a nonzero here and that is correct, not a leftover. The
       2-player suite's twin assertion was corrected the same way for the
       same reason; this one only started failing once the turn order changed
       and the playthrough happened to arrive with a pocket standing. */
    const noneLiftable = rowSlice.every((c, k) => c === 0 || pillaiSlice[k]);
    ok(pasuBefore.active + '’s row has no liftable seeds left after claiming its last cups as pasu bonuses',
      noneLiftable,
      JSON.stringify(rowSlice) + ' pillai: ' + JSON.stringify(pillaiSlice));
    ok('the game does not stay stuck on ' + pasuBefore.active + ' -- the round ended or turn moved on',
      pasuAfter.playing === false || pasuAfter.active !== pasuBefore.active,
      'active: ' + pasuAfter.active + ' playing: ' + pasuAfter.playing);
    ok('all 140 seeds still conserved through the round-end the claim triggered', total(pasuAfter) === 140, 'total: ' + total(pasuAfter));
  }

  /* MANUAL PILLAI COLLECTION (beta-212) — Raja: "keep pillai pandi in cup
     who owned... later by click pillai pandi the seeds will transfer to
     store." Play until a round ends with a pending pillai pocket, confirm
     dealing is refused until it's collected, collect it by tapping the
     cup, confirm the exact amount moves into its own owner's store, and
     confirm dealing works again afterward -- without a fresh pillai formed
     by that very redeal (a real gap this caught) blocking anyone else. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(700);
  await untick('B'); await untick('D');
  await dealSide('A'); await dealSide('C');
  let roundEndedWithPillai = false, pillaiEndState = null;
  outerCollect:
  for (let round = 0; round < 8 && !roundEndedWithPillai; round++){
    for (let move = 0; move < 150; move++){
      st = await state();
      if (!st.playing){
        const hasPending = st.pillai.some((p, idx) => p && st.cups[idx] > 0);
        if (hasPending){ roundEndedWithPillai = true; pillaiEndState = st; break outerCollect; }
        if (st.store[0] > 0 && st.store[2] > 0 && (!st.dealt[0] || !st.dealt[2])){
          if (!st.dealt[0]) await dealSide('A');
          if (!st.dealt[2]) await dealSide('C');
          continue;
        }
        break outerCollect;
      }
      const liftIdx = asymLift(st, st.active);
      if (liftIdx === null) break;
      await ev(`document.querySelector('.pal4Cup[data-pal4="${liftIdx}"]').click()`);
      await ev(`window.__pal4Stop()`); await sleep(30);
    }
  }
  ok('reached a round-end with at least one pending pillai pocket to collect', roundEndedWithPillai,
    roundEndedWithPillai ? 'found' : 'never happened in the move budget');
  if (roundEndedWithPillai){
    const pendIdx = pillaiEndState.pillai.findIndex((p, idx) => p && pillaiEndState.cups[idx] > 0);
    const pendOwnerIdx = Math.floor(pendIdx / 7);
    const pendOwner = ['A', 'B', 'C', 'D'][pendOwnerIdx];

    const sayBefore = await ev(`document.getElementById('pal4Say').textContent`);
    await ev(`document.querySelector('#pal4Card${pendOwner} .pal4CardStore').click()`); await sleep(200);
    const stRefused = await state();
    const sayAfterRefusal = await ev(`document.getElementById('pal4Say').textContent`);
    ok('dealing is refused while a pillai pocket is still pending', stRefused.dealt[pendOwnerIdx] === false && sayAfterRefusal !== sayBefore, sayAfterRefusal);

    const before = await state();
    const storeBefore = before.store[pendOwnerIdx], pillaiAmount = before.cups[pendIdx];
    await ev(`document.querySelector('.pal4Cup[data-pal4="${pendIdx}"]').click()`); await sleep(200);
    const after = await state();
    ok('tapping the pillai cup moves exactly its own amount into the owner’s store',
      after.store[pendOwnerIdx] === storeBefore + pillaiAmount, storeBefore + ' + ' + pillaiAmount + ' = ' + after.store[pendOwnerIdx]);
    ok('the cup is now empty and no longer marked pillai', after.cups[pendIdx] === 0 && after.pillai[pendIdx] === 0);

    await collectAllPillai4();
    const stClear = await state();
    ok('no pillai pockets remain pending after collecting them all', !stClear.pillai.some((p, idx) => p && stClear.cups[idx] > 0));

    if (!stClear.dealt[0]) await dealSide('A');
    if (!stClear.dealt[2]) await dealSide('C');
    const stRedeal = await state();
    ok('dealing (and so the next round) works again once every pillai pocket is collected — including when that very redeal forms a brand-new one',
      stRedeal.playing === true, JSON.stringify({ playing: stRedeal.playing, dealt: stRedeal.dealt }));
    ok('all 140 seeds still conserved through the whole collect-then-redeal sequence', total(stRedeal) === 140, 'total: ' + total(stRedeal));
  }

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
