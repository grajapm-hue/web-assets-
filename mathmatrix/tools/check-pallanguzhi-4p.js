/* Pallanguzhi · 4 Players — UI ONLY, per Raja's own staging: "do UI process
   first around table contents." No sowing, no capture, no rounds, no reserve
   arithmetic exists yet — those wait on two open questions (which cup a
   capture points at with four sides instead of two; how a round ends with
   four reserves). What DOES exist, and is what this checks, is the table
   itself: the square frame, whose cups belong to whom, the four name+store
   cards, SaNa in the middle, and the cosmetic Choose Player preview.

   The frame is a genuinely different shape from every other puzzle here — a
   ring rather than a line or a grid — so the things worth measuring are
   different too: is it actually 28 cups in a closed square, do all four sides
   carry a distinct identity, does the interior well hold everyone without
   overlapping, and does opening/closing this new mode leave every other
   puzzle exactly as it was. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9953;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, 'beta.html').split(path.sep).join('/');
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
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1700);
  await ev(`(document.querySelector('.splashPlay')||{click(){}}).click()`); await sleep(900);

  ok('the 4-player card is on the puzzle list', await ev(`!!document.getElementById('pal4Tab')`));
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

  for (const want of ['B', 'C', 'D', 'A']){
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
  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);   // -> B
  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);   // -> C
  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);   // -> D
  await ev(`document.getElementById('pal4Choose').click()`); await sleep(150);   // -> A (Raja)
  const renamed = await ev(`document.getElementById('pal4Choose').textContent`);
  ok('a typed name reaches the Choose Player label', /Raja starts/.test(renamed), renamed);

  /* THE APP-BAR TITLE MUST NOT TRUNCATE — the screenshot caught it once
     already: the fuller name overflowed to an ellipsis mid-word. */
  const titleFit = await ev(`(function(){
    var t = document.getElementById('appBarTitle');
    return JSON.stringify({ text: t.textContent.trim(), overflows: t.scrollWidth > t.clientWidth + 1 }); })()`).then(JSON.parse);
  ok('the app-bar title fits without truncating', !titleFit.overflows, JSON.stringify(titleFit));

  /* THE WELL. Nothing inside the square's open middle should spill outside
     it or overlap the cup ring — a real risk on the narrowest phones, since
     the well shrinks with the whole frame while the cards inside it don't. */
  const overlap = await ev(`(function(){
    var well = document.querySelector('.pal4Well').getBoundingClientRect();
    var bad = [];
    document.querySelectorAll('.pal4Card, .pal4SanaMid').forEach(function(el){
      var r = el.getBoundingClientRect();
      if (r.left < well.left - 2 || r.right > well.right + 2 || r.top < well.top - 2 || r.bottom > well.bottom + 2)
        bad.push(el.className.split(' ')[0] || el.tagName);
    });
    return JSON.stringify(bad); })()`).then(JSON.parse);
  ok('every card and SaNa stay inside the open well, nothing spills onto the ring',
    overlap.length === 0, overlap.length ? overlap.join(', ') + ' spilled out' : 'all contained');

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
    await ev(`document.getElementById('pal4Tab').click()`); await sleep(800);
    const nowOpen = await ev(`getComputedStyle(document.getElementById('pal4Panel')).display`) !== 'none';
    ok('opening the 4-player board from ' + f.name + ' actually shows it', nowOpen);
    if (f.panel){
      const otherStill = await ev(`getComputedStyle(document.getElementById('${f.panel}')).display`);
      ok('and closes ' + f.name + ' behind it', otherStill === 'none', 'display: ' + otherStill);
    }
  }

  /* THE TIGHTEST PHONE — a square board is exactly the shape most likely to
     overflow a narrow screen, since its height is tied to its width. */
  await send('Emulation.setDeviceMetricsOverride', { width: 340, height: 780, deviceScaleFactor: 2, mobile: true });
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(800);
  const tight = await ev(`(function(){
    var f = document.querySelector('.pal4Foot').getBoundingClientRect();
    var b = document.querySelector('.tabBar').getBoundingClientRect().top;
    var frame = document.querySelector('.pal4Frame').getBoundingClientRect();
    return JSON.stringify({ footFits: f.bottom <= b + 1, footBottom: Math.round(f.bottom), bar: Math.round(b),
      frameWidth: Math.round(frame.width) }); })()`).then(JSON.parse);
  ok('at 340x780, the whole board and its controls fit above the tab bar', tight.footFits,
    tight.footFits ? 'foot ' + tight.footBottom + ', bar ' + tight.bar : 'OVERFLOWS by ' + (tight.footBottom - tight.bar) + 'px');
  ok('and the square frame itself is a sensible size, not crushed', tight.frameWidth >= 250, tight.frameWidth + 'px wide');

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
