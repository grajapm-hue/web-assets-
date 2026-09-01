/* Raja marked the empty band on the right of the puzzle list and asked for the
   groups below it to move up beside the one-card groups. This is a DOM move, so
   the things worth checking are structural: nothing lost, nothing duplicated,
   the intended groups really share a line, and no card overlaps or overflows. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9987;
const FILE = 'file:///' + path.join(__dirname, '..', process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  try { fs.rmSync(path.join(__dirname, '_cpl151'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpl151'),
    '--window-size=390,844', FILE], { stdio: 'ignore' });
  await require('./quiet-audio').early(PORT);
  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 160)); });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'shots', n), Buffer.from(r.result.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable');

  for (const S of [{ w: 360, h: 800 }, { w: 390, h: 844 }, { w: 340, h: 780 }]){
    await send('Emulation.setDeviceMetricsOverride', { width: S.w, height: S.h, deviceScaleFactor: 2, mobile: true });
    await send('Page.reload', { ignoreCache: true }); await sleep(1700);
    await ev(`document.querySelector('.splashPlay').click()`); await sleep(800);
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(600);
    console.log('\n=== ' + S.w + 'x' + S.h + ' ===');

    const raw = await ev(`(function(){
      var out = { groups: [], cards: 0, dupIds: [] };
      var seen = {};
      document.querySelectorAll('.difficultyBar .toggleBtn').forEach(function(b){
        out.cards++;
        if (b.id){ if (seen[b.id]) out.dupIds.push(b.id); seen[b.id] = 1; }
      });
      document.querySelectorAll('.modeGroup').forEach(function(g){
        var h = g.querySelector('.modeHead b'), r = g.getBoundingClientRect();
        var c = g.querySelector('.toggleBtn');
        var cr = c ? c.getBoundingClientRect() : null;
        var nm = c ? c.querySelector('.lvName') : null;
        out.groups.push({ name: h ? h.textContent : '?',
          cards: g.querySelectorAll('.toggleBtn').length,
          cardW: cr ? Math.round(cr.width) : 0,
          // how many lines the puzzle's NAME wraps to — the quarter-width bug
          // showed up here first, as "3³ Multiply" breaking across two lines
          nameLines: nm ? Math.round(nm.getBoundingClientRect().height /
                       (parseFloat(getComputedStyle(nm).lineHeight) || 18)) : 0,
          l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) });
      });
      out.page = document.documentElement.clientWidth;
      out.listBottom = Math.round(document.querySelector('.difficultyBar').scrollHeight);
      return JSON.stringify(out); })()`);
    const D = JSON.parse(raw);
    console.log('   ' + D.groups.map(g => g.name + '(' + g.cards + ') y' + g.t + ' x' + g.l + '..' + g.r).join('\n   '));

    // nothing lost, nothing duplicated
    /* Named, not counted. A bare count says "8" and goes stale the moment a
       puzzle is added — it failed on the day Pallanguzhi arrived, reporting a
       fault where there was only a ninth game. Naming them keeps the real
       guarantee, that nothing SILENTLY DISAPPEARS from the list, while letting
       the list grow. */
    const WANT = ['Add Magic', 'Multiply Magic', 'Triangle Magic', 'Birthday Magic',
                  'Gate Logic', 'Binary Magic', 'Slide Magic', 'Sudoku', 'Pallanguzhi'];
    const have = D.groups.map(g => g.name);
    const missing = WANT.filter(w => !have.some(h => h.indexOf(w) > -1));
    ok(S.w + ': every puzzle group is still on the list', missing.length === 0,
      missing.length ? 'MISSING: ' + missing.join(', ') : have.length + ' groups, none lost');
    ok(S.w + ': no duplicated card id', D.dupIds.length === 0, D.dupIds.join(',') || 'none');
    const byName = {}; D.groups.forEach(g => byName[g.name] = g);
    ok(S.w + ': Gate Logic still has exactly one card',
      byName['Gate Logic'] && byName['Gate Logic'].cards === 1,
      byName['Gate Logic'] ? byName['Gate Logic'].cards + ' cards' : 'group missing');

    const sameLine = (a, b) => a && b && Math.abs(a.t - b.t) <= 2 && a.r <= b.l + 1;
    if (D.page >= 360){
      ok(S.w + ': Multiply and Triangle share a line',
        sameLine(byName['Multiply Magic'], byName['Triangle Magic']),
        'multiply y' + byName['Multiply Magic'].t + ', triangle y' + byName['Triangle Magic'].t);
      ok(S.w + ': Sir Ramanujan and Gate Logic share a line',
        sameLine(byName['Sir Ramanujan MathMagic'] || byName['Birthday Magic'], byName['Gate Logic']),
        'birthday y' + (byName['Birthday Magic'] || {}).t + ', gate y' + byName['Gate Logic'].t);
      ok(S.w + ': Gate Logic now sits ABOVE Binary Magic, as marked',
        byName['Gate Logic'].t < byName['Binary Magic'].t,
        'gate y' + byName['Gate Logic'].t + ' vs binary y' + byName['Binary Magic'].t);

      /* A paired card must be as wide as a card in a normal two-column row.
         The first attempt left the inner grid at two columns, so each card got
         a QUARTER of the screen and the names broke mid-word. Overlap and
         overflow checks all passed on that — only width caught it. */
      const ref = byName['Binary Magic'].cardW;      // a card on a normal line
      ['Multiply Magic', 'Triangle Magic', 'Birthday Magic', 'Gate Logic'].forEach(n => {
        ok(S.w + ': ' + n + ' card is a full half-row wide, not a quarter',
          byName[n].cardW >= ref * 0.9, byName[n].cardW + 'px vs ' + ref + 'px on a normal row');
      });
      ok(S.w + ': no paired puzzle name breaks onto extra lines',
        ['Multiply Magic', 'Triangle Magic', 'Gate Logic'].every(n => byName[n].nameLines <= 1),
        ['Multiply Magic', 'Triangle Magic', 'Gate Logic'].map(n => n + '=' + byName[n].nameLines + 'ln').join(', '));
    } else {
      // narrow phones keep one column, so pairs must stack rather than squeeze
      ok(S.w + ': narrow phone keeps the groups stacked',
        byName['Multiply Magic'].t < byName['Triangle Magic'].t
        && byName['Multiply Magic'].l === byName['Triangle Magic'].l,
        'multiply y' + byName['Multiply Magic'].t + ', triangle y' + byName['Triangle Magic'].t);
    }

    ok(S.w + ': every group fits inside the page',
      D.groups.every(g => g.l >= -1 && g.r <= D.page + 1), 'page ' + D.page + 'px');
    let overlap = '';
    for (let i = 0; i < D.groups.length; i++) for (let j = i + 1; j < D.groups.length; j++){
      const p = D.groups[i], q = D.groups[j];
      if (p.l < q.r - 1 && q.l < p.r - 1 && p.t < q.b - 1 && q.t < p.b - 1) overlap = p.name + ' overlaps ' + q.name;
    }
    ok(S.w + ': no group overlaps another', !overlap, overlap || 'clear');
    if (S.w === 360) await shot('151-list.png');
  }

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
