/* THE 5x5 THAYAM BOARD RENDERS WITH THE RIGHT MOUNT SQUARES.

   Nine safe squares total: four colours' own gates at the edge-midpoints,
   one more diagonal-inward square each near a different corner, plus the
   centre goal -- the exact pinwheel pattern confirmed against Raja's own
   marked-up photo earlier in the design conversation, not the PDF's
   "4 corners" claim (which the photo contradicted). */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9930;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpthayamboard');
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
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
  await ev(`document.querySelector('.toggleBtn[data-thayam-level]').click()`); await sleep(700);

  ok('the Thayam panel is showing', await ev(`document.body.classList.contains('thayamMode')`));
  ok('the 5x5 grid rendered 25 cells', (await ev(`document.querySelectorAll('#thayamGrid .thCell').length`)) === 25);

  const safeCount = await ev(`document.querySelectorAll('#thayamGrid .thCell.thSafe').length`);
  ok('8 Mount squares (4 gate cells + 4 inner-ring axis cells)', safeCount === 8, String(safeCount));

  // C1 + I1 together: not just a count -- the EXACT flat cell each Mount sits
  // on, ground-truthed against the approved mockup's own literal SAFE grid
  // (mathmatrix/tools/_mock-thayam-table.html), independently hand-parsed
  // from its 5x5 markup: A(pink)=2,6 D(green)=10,16 C(yellow)=18,22 B(blue)=8,14.
  const mountCells = await ev(`Array.from(document.querySelectorAll('#thayamGrid .thCell.thSafe'))
    .map(function(el){ return { cell: parseInt(el.dataset.thayamCell, 10), side: el.className.match(/entry-(\\w)/)[1] }; })
    .sort(function(a, b){ return a.cell - b.cell; })`);
  const expectedMounts = [
    { cell: 2, side: 'A' }, { cell: 6, side: 'A' },
    { cell: 8, side: 'B' }, { cell: 10, side: 'D' },
    { cell: 14, side: 'B' }, { cell: 16, side: 'D' },
    { cell: 18, side: 'C' }, { cell: 22, side: 'C' },
  ];
  ok('every Mount cell number + owning colour matches the approved mockup exactly',
    JSON.stringify(mountCells) === JSON.stringify(expectedMounts), JSON.stringify(mountCells));

  // The centre is a 9th square nothing can be captured on -- a rules-level
  // count, not a shared CSS class: the approved mockup renders it plain
  // (.thCenter only, no .thSafe crosshatch layered over its turn-indicator).
  const centerCount = await ev(`document.querySelectorAll('#thayamGrid .thCell.thCenter').length`);
  ok('exactly one centre goal cell', centerCount === 1, String(centerCount));

  const st = await ev(`JSON.stringify(window.__thayamState())`).then(JSON.parse);
  ok('board state exposes 25 cells', st.cells.length === 25, String(st.cells.length));

  /* ── Guards for the two ways this board has already broken ──────────────
     Both were reported from a real phone, by eye, AFTER shipping green tests
     -- because every assertion above checks STRUCTURE (which cells exist and
     what they are called) and none checked that the board actually RENDERS
     as itself. These do.

     1. beta-229: the cells carried a bare `.cell` class, and an unrelated
        wood-theme rule -- `.cell{ background:#FFFAF0 !important }`, written
        for Sudoku's own grid -- blanket-overrode every one of them. The X
        marks, the Mount tint, the gold centre ring and the coloured gate
        rings all silently vanished while the DOM stayed perfectly correct.
     2. beta-230: the panel's header used `.top`/`.title`, generic names with
        no matching CSS anywhere in this file, so the title kept the dark
        mockup's white and rendered near-invisible on sandalwood.

     A collision cannot be caught by asking "is the class present?" -- the
     class WAS present both times. It has to be caught by asking what the
     pixels ended up being. */
  /* Addressed through data-thayam-cell and the board's own reported state --
     never through the cell CLASS names. The collision this guards against
     leaves every class perfectly in place and changes only what gets painted,
     so a class-based probe can be satisfied by the very markup that is broken;
     worse, it breaks outright if the classes are ever renamed again, turning
     a precise paint failure into a crash. The cell index is the stable key. */
  const paint = await ev(`(function(){
    var st = window.__thayamState();
    var safeIdx = Object.keys(st.safe).map(Number);
    var at = function(i){ return document.querySelector('#thayamGrid [data-thayam-cell="' + i + '"]'); };
    var plainIdx = st.cells.filter(function(i){ return safeIdx.indexOf(i) === -1 && i !== st.center; })[0];
    var plain = at(plainIdx), safe = at(safeIdx[0]), mid = at(st.center);
    var cs = function(el, pseudo){ return getComputedStyle(el, pseudo || null); };
    var mark = cs(safe, '::before');
    return JSON.stringify({
      plainBg: cs(plain).backgroundColor,
      safeBg:  cs(safe).backgroundColor,
      midImg:  cs(mid).backgroundImage,
      markW:   parseFloat(mark.width) || 0,
      markH:   parseFloat(mark.height) || 0,
      gateRing: cs(safe).boxShadow
    });
  })()`).then(JSON.parse);

  // The wood theme's own Sudoku-grid fill. If a Thayam cell ever computes to
  // this, a generic-class collision is back.
  const WOOD_CELL_FILL = 'rgb(255, 250, 240)';
  ok('Mount cells are not being repainted by another puzzle\'s .cell rule',
    paint.safeBg !== WOOD_CELL_FILL && paint.plainBg !== WOOD_CELL_FILL,
    'plain=' + paint.plainBg + ' safe=' + paint.safeBg);
  ok('a Mount square is visibly tinted apart from an ordinary square',
    paint.safeBg !== paint.plainBg, paint.safeBg + ' vs ' + paint.plainBg);
  ok('the Mount X mark actually renders (::before has real size)',
    paint.markW > 4 && paint.markH > 0, paint.markW + 'x' + paint.markH);
  ok('the centre keeps its gradient goal ring', /gradient/.test(paint.midImg), paint.midImg.slice(0, 40));
  ok('a gate cell still carries its owning colour ring', /rgb/.test(paint.gateRing));

  /* Readability of the panel chrome against whatever ground the theme uses.
     4.5:1 is the WCAG AA floor for normal text; the title measured 1.9:1 when
     it shipped white onto sandalwood. */
  const contrast = await ev(`(function(){
    function lum(c){
      var p = c.match(/\\d+(\\.\\d+)?/g).slice(0,3).map(function(v){
        v = v / 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
      });
      return 0.2126*p[0] + 0.7152*p[1] + 0.0722*p[2];
    }
    function ratio(a, b){ var l1 = lum(a), l2 = lum(b);
      return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05); }
    var ground = getComputedStyle(document.body).backgroundColor;
    var title = document.querySelector('.thTitle');
    var say = document.getElementById('thaySay');
    return JSON.stringify({
      title: +ratio(getComputedStyle(title).color, ground).toFixed(2),
      say: +ratio(getComputedStyle(say).color, ground).toFixed(2)
    });
  })()`).then(JSON.parse);
  ok('the panel title is readable on this theme (>= 4.5:1)', contrast.title >= 4.5, contrast.title + ':1');
  ok('the status line is readable on this theme (>= 4.5:1)', contrast.say >= 4.5, contrast.say + ':1');

  /* Every seat must be reachable. Store B once sat 27px past the right edge
     of a 390px phone, unscrollable, because the board was sized independently
     of the row it lives in.

     The viewport is pinned explicitly here rather than trusted from Chrome's
     --window-size: that flag sizes the WINDOW, and this harness's own inner
     viewport came out 526px wide -- comfortably wide enough to hide the very
     overflow this check exists to catch. Measuring at the width the bug was
     reported at is the whole point, so it is set, not assumed. */
  /* Both languages. The stylesheet's own applyLang comment records why this
     matters: Tamil runs longer than English, this layout sizes itself by
     measuring its contents, and a translated board that overflows is exactly
     how the app lost a chip 11px off-screen once before. Thayam is translated
     now, so its fit has to be proven in Tamil, not just in English. */
  for (const lang of ['en', 'ta']){
  await ev(`window.__mmLang('${lang}')`);
  await sleep(120);
  for (const vw of [390, 360, 340]){
    await send('Emulation.setDeviceMetricsOverride', { width: vw, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(160);
    const f = await ev(`(function(){
      var seats = Array.prototype.map.call(document.querySelectorAll('.thSeat'), function(s){
        var b = s.getBoundingClientRect();
        return { side: s.dataset.side, left: Math.round(b.left), right: Math.round(b.right) };
      });
      return JSON.stringify({
        seats: seats,
        vw: document.documentElement.clientWidth,
        board: Math.round(document.getElementById('thayamGrid').getBoundingClientRect().width),
        pageOverflow: document.body.scrollWidth - document.body.clientWidth
      });
    })()`).then(JSON.parse);
    const off = f.seats.filter(s => s.left < 0 || s.right > f.vw);
    ok('[' + lang + '] at ' + vw + 'px every Store seat is fully on screen',
      off.length === 0, off.length ? JSON.stringify(off) : 'board=' + f.board + ' vw=' + f.vw);
    ok('[' + lang + '] at ' + vw + 'px the page never scrolls sideways', f.pageOverflow === 0, String(f.pageOverflow));
  }
  }
  await ev(`window.__mmLang('en')`);
  await send('Emulation.clearDeviceMetricsOverride', {});

  const fit = await ev(`(function(){
    var seats = Array.prototype.map.call(document.querySelectorAll('.thSeat'), function(s){
      var b = s.getBoundingClientRect();
      return { side: s.dataset.side, left: Math.round(b.left), right: Math.round(b.right) };
    });
    return JSON.stringify({
      seats: seats,
      vw: document.documentElement.clientWidth,
      pageOverflow: document.body.scrollWidth - document.body.clientWidth
    });
  })()`).then(JSON.parse);
  const offscreen = fit.seats.filter(s => s.left < 0 || s.right > fit.vw);
  ok('all four Store seats sit fully inside the viewport',
    offscreen.length === 0, offscreen.length ? JSON.stringify(offscreen) + ' vw=' + fit.vw : 'vw=' + fit.vw);
  ok('the page never scrolls sideways', fit.pageOverflow === 0, String(fit.pageOverflow));

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
