/* Raja: "observed below the target text in tab for the games up to Sir
   Ramanujan matrix is seen too tiny — so can merge the target box and below
   box for increasing the height and split 2/3 portion, target in one box left
   side and another box in right split for level appreciation notes."

   #targetPill and #solvedCounter used to be two full-width strips stacked
   vertically. The bottom one — the progress sentence — was 9px on the live
   PLAY screen, several CSS layers deep, well under anything comfortable to
   read. They are one row now, side by side inside .targetRow: target on the
   left (roughly 2 parts), the progress sentence on the right (roughly 3, since
   it is the longer text), both bigger than before, in the SAME vertical space
   the pair used to share by stacking.

   THE MEASUREMENTS HERE ARE THE ONES THAT MATTER, not "does a targetRow
   exist": the font sizes actually rendering, the reading ORDER of the wrapped
   sentence (a real bug this build introduced and fixed — a stray display:flex
   split "0/2" onto its own line ahead of the words meant to precede it), that
   both survive at the tightest phone size, and that the row still vanishes
   completely on every puzzle type it was never meant to appear on. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9965;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cptr');
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

  await ev(`document.querySelector('.toggleBtn[data-size="ramanujan"]').click()`); await sleep(800);

  const layout = () => ev(`(function(){
    var row = document.querySelector('.targetRow');
    var t = document.getElementById('targetPill'), s = document.getElementById('solvedCounter');
    if (!row || !t || !s) return JSON.stringify({ missing: true });
    var rt = t.getBoundingClientRect(), rs = s.getBoundingClientRect();
    return JSON.stringify({
      sideBySide: Math.abs(rt.top - rs.top) < 4 && rt.right <= rs.left + 2,
      tFont: parseFloat(getComputedStyle(t).fontSize),
      sFont: parseFloat(getComputedStyle(s).fontSize),
      tWidth: Math.round(rt.width), sWidth: Math.round(rs.width),
      sText: s.textContent.replace(/\\s+/g,' ').trim(),
      sDisplay: getComputedStyle(s).display
    }); })()`).then(JSON.parse);

  const g = await layout();
  ok('target and its box exist together', !g.missing);
  ok('the two boxes sit side by side, not stacked', g.sideBySide,
    'target/notes on the same row: ' + g.sideBySide);
  ok('the target box reads at a real size', g.tFont >= 13, g.tFont + 'px (was 12.5px)');
  ok('the progress sentence reads at a real size, not 9px', g.sFont >= 11,
    g.sFont + 'px (was 9px on the live screen)');
  ok('the progress box is the wider of the two, for its longer sentence',
    g.sWidth > g.tWidth, 'target ' + g.tWidth + 'px, notes ' + g.sWidth + 'px');

  /* THE READING ORDER — the actual bug caught while building this. A stray
     display:flex on an element containing "🏆 <b>0/2</b> different targets…"
     split that text into separate anonymous flex items instead of one
     wrapping sentence, so the wrapped LINES reordered — "different targets ·
     solve 2" rendered ahead of "0/2" rather than after it — while textContent
     stayed identical, because textContent reads DOM ORDER, which this bug
     never touched. Reading it back was tried first and passed even with the
     fault reinstated, which is why the assertion is on the actual mechanism
     instead: is the element a flex container at all. That is the one thing
     that both causes the fault and is simple enough to guard directly. */
  ok('the sentence is not a flex container — flex splits its "0/2" onto its own line',
    g.sDisplay !== 'flex', 'display: ' + g.sDisplay);

  /* THE TIGHTEST PHONE — the size that has caught real regressions in this
     project before. Board still has to fit, and the row still has to show
     both sides legibly. */
  await send('Emulation.setDeviceMetricsOverride', { width: 340, height: 780, deviceScaleFactor: 2, mobile: true });
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`document.querySelector('.toggleBtn[data-size="10x10"]').click()`); await sleep(900);
  const tight = await layout();
  ok('at 340x780, on the biggest board, the row is still side by side', tight.sideBySide);
  ok('and both sides still read at a real size', tight.tFont >= 13 && tight.sFont >= 11,
    'target ' + tight.tFont + 'px, notes ' + tight.sFont + 'px');
  const fit = await ev(`(function(){
    var last = document.getElementById('timerBox') || document.querySelector('.btnRow');
    var r = (last || document.body).getBoundingClientRect();
    var b = document.querySelector('.tabBar').getBoundingClientRect().top;
    return JSON.stringify({ fits: r.bottom <= b + 1, bottom: Math.round(r.bottom), bar: Math.round(b) }); })()`).then(JSON.parse);
  ok('the board\'s own controls still clear the tab bar at that size', fit.fits,
    fit.fits ? 'clears (' + fit.bottom + ' vs ' + fit.bar + ')' : 'OVERFLOWS by ' + (fit.bottom - fit.bar) + 'px');

  /* AND IT VANISHES COMPLETELY where it always did — Sudoku, Slide, Gate
     Logic, Binary and Pallanguzhi never showed this row, and merging its two
     halves must not leave an empty box or a stray gap behind on any of them. */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const others = [
    { go: `document.getElementById('palTab').click()`, wait: 1200, name: 'Pallanguzhi' },
    { go: `document.querySelector('.toggleBtn[data-sud-level="mini"]').click()`, wait: 800, name: 'Sudoku' },
    { go: `document.querySelector('.toggleBtn[data-slide-level="fifteen"]').click()`, wait: 800, name: 'Slide' },
    { go: `document.getElementById('gateListBtn').click()`, wait: 800, name: 'Gate Logic' },
    { go: `document.querySelector('.toggleBtn[data-size="binary"]').click()`, wait: 800, name: 'Binary' }
  ];
  for (const o of others){
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
    await ev(o.go); await sleep(o.wait);
    const h = await ev(`(function(){ var r = document.querySelector('.targetRow'); return r ? Math.round(r.getBoundingClientRect().height) : -1; })()`);
    ok(o.name + ': the merged row takes up no space at all', h <= 1, h + 'px tall (was two visible strips before merging)');
  }

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
