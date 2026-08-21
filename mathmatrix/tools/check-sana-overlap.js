/* Raja: "ensure it every where the font and box size should not affected to
   near one areas in any layers" — after enlarging SaNa's bubble (beta-184),
   make sure the extra height it now takes never collides with whatever sits
   just beneath it, on ANY screen the mascot appears on.

   SaNa is a single shared element, inserted once right after .appBar and
   before .screens — it is not part of any individual screen, so growing it
   was one change with as many places to check as the app has screens: the
   puzzle list, all eleven grid puzzles, Gate Logic, all three Slide levels,
   all four Sudoku levels, Pallanguzhi, and the non-puzzle Get App and
   Feedback screens. Checking two of those (as the previous fix did) proves
   nothing about the other eighteen.

   THE MEASUREMENT is a real overlap test, not a size check: does any part of
   the first thing below SaNa's bubble sit ABOVE where the bubble now ends?
   A bubble that grew and simply pushed its neighbour down is fine; a bubble
   that grew and now sits ON TOP of its neighbour is the fault being guarded
   against, and only overlap distinguishes the two. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9971;
const FILE = 'file:///' + path.join(__dirname, '..', 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const GRID_LEVELS = ['3x3', '4x4', '5x5', '6x6', '8x8', '10x10', '3cube', 'triangle', 'ramanujan', 'binary', 'binary2'];

(async () => {
  const tmp = path.join(__dirname, '_cpsov');
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
  await ev(`(document.querySelector('.splashPlay')||{click(){}}).click()`); await sleep(1000);

  /* Find whatever sits directly under SaNa's bubble — the first element below
     it, on whatever screen is currently open, PICKED BY POSITION rather than
     by name, because every screen's next-thing is different (the puzzle list,
     the sudoku board, the Pallanguzhi tips, a plain sheet). Picking by
     position is what makes one probe work on all twenty screens. */
  const overlap = () => ev(`(function(){
    var bub = document.querySelector('.sanaBub');
    if (!bub) return JSON.stringify({ missing: true });
    var b = bub.getBoundingClientRect();
    var scr = document.querySelector('.screen.on') || document.body;
    var cands = scr.querySelectorAll('*');
    var below = null, belowTop = Infinity;
    for (var i = 0; i < cands.length; i++){
      var el = cands[i];
      if (el.closest('.sana')) continue;              // SaNa's own subtree
      if (!el.offsetParent && el !== document.body) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;       // skip zero-size wrappers
      if (r.top >= b.bottom - 1 && r.top < belowTop && r.left < b.right && r.right > b.left){
        belowTop = r.top; below = el;
      }
    }
    return JSON.stringify({
      bubBottom: Math.round(b.bottom),
      nextTop: below ? Math.round(belowTop) : null,
      nextTag: below ? (below.className || below.tagName) : '(nothing found below)',
      overlapPx: below ? Math.round(b.bottom - belowTop) : 0
    }); })()`).then(JSON.parse);

  const check = async (label) => {
    const r = await overlap();
    if (r.missing){ ok(label + ': SaNa is present', false, 'no .sanaBub found'); return; }
    ok(label + ': the bubble does not overlap what is below it', r.overlapPx <= 1,
      r.overlapPx > 1 ? 'OVERLAPS by ' + r.overlapPx + 'px into ' + String(r.nextTag).slice(0, 40)
                       : 'clear (bubble ends ' + r.bubBottom + ', next thing starts ' + r.nextTop + ')');
  };

  await check('puzzle list');

  for (const lv of GRID_LEVELS){
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
    await ev(`document.querySelector('.toggleBtn[data-size="${lv}"]').click()`); await sleep(700);
    await check(lv);
  }

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.getElementById('gateListBtn').click()`); await sleep(700);
  await check('gatelogic');

  for (const lv of ['fifteen', 'az', 'azn']){
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
    await ev(`document.querySelector('.toggleBtn[data-slide-level="${lv}"]').click()`); await sleep(700);
    await check('slide-' + lv);
  }

  for (const lv of ['mini', 'medium', 'hard', 'master']){
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
    await ev(`document.querySelector('.toggleBtn[data-sud-level="${lv}"]').click()`); await sleep(700);
    await check('sudoku-' + lv);
  }

  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`window.__palClearSave && window.__palClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('palTab').click()`); await sleep(1200);
  await check('pallanguzhi');

  await ev(`document.getElementById('tab-scApp').click()`); await sleep(500);
  await check('get app');
  await ev(`document.getElementById('tab-scFeed').click()`); await sleep(500);
  await check('feedback');

  /* THE SIBLING PROBE ABOVE CANNOT ACTUALLY FAIL, and it is worth saying so
     plainly rather than leaving it looking like the real guard. Everything on
     these screens is normal document flow: a taller box simply pushes what
     follows it further down, it can never sit on top of it, so "does the
     bubble overlap its neighbour" was proved vacuous by running it against a
     deliberately inflated bubble and watching it report ALL GREEN regardless.
     What CAN actually happen — and DID happen, the very next report after
     enlarging the bubble — is that a screen with a FIXED vertical budget
     (Sudoku's board, sized against the tab bar) gets less room than before and
     needs to scroll to reach controls that used to sit comfortably above the
     fold. Two more panels size themselves the same way and were never checked
     against this specific regression: Pallanguzhi, and Slide. Same four sizes
     check-sudoku-fit.js already uses for the same reason. */
  const TIGHT = [{ w: 340, h: 780 }, { w: 360, h: 740 }, { w: 360, h: 800 }, { w: 390, h: 844 }];

  for (const S of TIGHT){
    await send('Emulation.setDeviceMetricsOverride', { width: S.w, height: S.h, deviceScaleFactor: 2, mobile: true });
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
    await ev(`window.__palClearSave && window.__palClearSave()`);   // force fresh -- see beta-217 comment above
    await ev(`document.getElementById('palTab').click()`);
    for (let i = 0; i < 200; i++){
      const s = await ev(`window.__palState?JSON.stringify(window.__palState()):""`);
      if (s){ const st = JSON.parse(s);
        if (st.playing && !st.busy) break;
        if (!st.busy){ const w = !st.dealt[0] ? 1 : (!st.dealt[1] ? 2 : 0); if (w) await ev(`document.querySelector('#palSide${w} .palStore').click()`); } }
      await sleep(60);
    }
    const r = await ev(`(function(){
      var f = document.querySelector('.palFoot').getBoundingClientRect().bottom;
      var b = document.querySelector('.tabBar').getBoundingClientRect().top;
      return JSON.stringify({ fits: f <= b + 1, f: Math.round(f), b: Math.round(b) }); })()`).then(JSON.parse);
    ok('pallanguzhi ' + S.w + 'x' + S.h + ': the board still fits above the tab bar', r.fits,
      r.fits ? 'foot ' + r.f + ', bar ' + r.b : 'OVERFLOWS by ' + (r.f - r.b) + 'px');
  }

  for (const S of TIGHT){
    await send('Emulation.setDeviceMetricsOverride', { width: S.w, height: S.h, deviceScaleFactor: 2, mobile: true });
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
    /* A-Z+1-9 is the tallest slide board — 6x6 rather than 4x4 — and the one
       most likely to show a fit regression first. */
    await ev(`document.querySelector('.toggleBtn[data-slide-level="azn"]').click()`); await sleep(700);
    const r = await ev(`(function(){
      var foot = document.querySelector('.slideFoot');
      if (!foot) return JSON.stringify({ missing: true });
      var f = foot.getBoundingClientRect().bottom;
      var b = document.querySelector('.tabBar').getBoundingClientRect().top;
      return JSON.stringify({ fits: f <= b + 1, f: Math.round(f), b: Math.round(b) }); })()`).then(JSON.parse);
    if (r.missing){ ok('slide-azn ' + S.w + 'x' + S.h + ': the foot is present', false, 'no .slideFoot found'); continue; }
    ok('slide-azn ' + S.w + 'x' + S.h + ': the board still fits above the tab bar', r.fits,
      r.fits ? 'foot ' + r.f + ', bar ' + r.b : 'OVERFLOWS by ' + (r.f - r.b) + 'px');
  }

  ok('no JS errors across the whole sweep', errs.length === 0, errs.join(' | ') || '');
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
