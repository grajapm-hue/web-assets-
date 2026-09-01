/* Three cards in a two-column grid is exactly where a layout goes wrong, so
   look at the picker rather than trusting that the span worked. Also checks no
   card overlaps another and none overflows the page width. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9985;
const FILE = 'file:///' + path.join(__dirname, '..', process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  try { fs.rmSync(path.join(__dirname, '_cpp150'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpp150'),
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
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(500);
    // bring the slide group into view
    await ev(`(function(){ var b=document.getElementById('slideAznTab'); if(b) b.scrollIntoView({block:'center'}); })()`);
    await sleep(400);

    const r = await ev(`(function(){
      var bs = Array.from(document.querySelectorAll('.toggleBtn[data-slide-level]'));
      var out = bs.map(function(b){ var q=b.getBoundingClientRect();
        return { k:b.dataset.slideLevel, l:Math.round(q.left), r:Math.round(q.right),
                 t:Math.round(q.top), b:Math.round(q.bottom), w:Math.round(q.width) }; });
      out.push({ page: document.documentElement.clientWidth });
      return JSON.stringify(out); })()`);
    const a = JSON.parse(r); const page = a.pop().page;
    const [c1, c2, c3] = a;
    console.log('\n=== ' + S.w + 'x' + S.h + ' ===');
    console.log('   ' + a.map(c => c.k + ' ' + c.w + 'px @' + c.l + '..' + c.r + ' y' + c.t).join('\n   '));
    ok(S.w + ': all three cards fit inside the page', a.every(c => c.l >= -1 && c.r <= page + 1),
      'page ' + page + 'px');
    // no two cards may overlap
    let overlap = '';
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++){
      const p = a[i], q = a[j];
      if (p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b) overlap = p.k + ' overlaps ' + q.k;
    }
    ok(S.w + ': no card overlaps another', !overlap, overlap || 'clear');
    /* Below 360px the picker is deliberately ONE column, so every card is full
       width and there is no odd-one-out to span. Assert the span only where a
       second column exists — and assert the single column where it does not,
       so this stays a real check at both widths rather than a skipped one. */
    if (page >= 360){
      ok(S.w + ': the hard card spans the full row, not half of it',
        c3.w > c1.w * 1.5, 'hard ' + c3.w + 'px vs easy ' + c1.w + 'px');
      ok(S.w + ': easy and medium sit side by side', c1.t === c2.t && c2.l > c1.r,
        'easy y' + c1.t + ' ends ' + c1.r + ', medium y' + c2.t + ' starts ' + c2.l);
    } else {
      ok(S.w + ': narrow phone stacks all three at full width',
        c1.w === c2.w && c2.w === c3.w && c1.t < c2.t && c2.t < c3.t,
        'all ' + c1.w + 'px, stacked');
    }
    if (S.w === 360) await shot('150-picker.png');
  }
  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
