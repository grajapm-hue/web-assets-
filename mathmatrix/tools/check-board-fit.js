/* Raja's A-Z screenshots have no "Show me how" / "Shuffle again" buttons and a
   footer hint cut mid-sentence, while his 1-15 screenshots show both. His phone
   is 720x1600 at DPR 2 -> a 360x800 CSS viewport, shorter than the 390x844 I
   have been testing at. Measure, at several real phone sizes, whether the
   controls and the footer actually sit inside the viewport on each board. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9981;
const FILE = 'file:///' + path.join(__dirname, '..', process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const SIZES = [
  { w: 360, h: 800, name: "360x800 (Raja's phone)" },
  { w: 390, h: 844, name: '390x844 (what I tested on)' },
  { w: 360, h: 740, name: '360x740 (shorter Android)' }
];

(async () => {
  try { fs.rmSync(path.join(__dirname, '_cpf148'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpf148'),
    '--window-size=390,844', FILE], { stdio: 'ignore' });
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
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'shots', n), Buffer.from(r.result.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable');

  for (const S of SIZES){
    await send('Emulation.setDeviceMetricsOverride', { width: S.w, height: S.h, deviceScaleFactor: 2, mobile: true });
    await send('Page.reload', { ignoreCache: true });
    await sleep(1800);
    await ev(`document.querySelector('.splashPlay').click()`); await sleep(900);
    console.log('\n=== ' + S.name + ' ===');

    for (const lv of ['fifteen', 'az', 'azn']){
      await ev(`document.getElementById('tab-scHome').click()`); await sleep(220);
      await ev(`document.querySelector('.toggleBtn[data-slide-level="${lv}"]').click()`); await sleep(800);

      /* The tab bar is pinned to the bottom, so "inside the viewport" is not
         enough — anything underneath the bar is just as invisible. Measure
         against the top of the tab bar, which is the real floor. */
      const r = await ev(`(function(){
        var bar = document.querySelector('.tabBar');
        var floor = bar ? bar.getBoundingClientRect().top : window.innerHeight;
        function box(sel){ var e = document.querySelector(sel); if(!e) return null;
          var b = e.getBoundingClientRect();
          return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; }
        var out = { floor: Math.round(floor), vh: window.innerHeight };
        out.show    = box('#slideShow');
        out.shuffle = box('#slideShuffle');
        out.hint    = box('#slideSpareLabel');
        out.home    = box('#slideHome');
        out.board   = box('#slideBoard');
        var tl = document.querySelector('#slideBoard .slideTile');
        out.tile = tl ? Math.round(tl.getBoundingClientRect().width) : 0;
        return JSON.stringify(out);
      })()`);
      const m = JSON.parse(r || '{}');
      const vis = b => b && b.bottom <= m.floor + 0.5;
      console.log('   ' + lv + ': blocks ' + m.tile + 'px, board ends ' +
        (m.board ? m.board.bottom : '?') + ', tab bar at ' + m.floor);
      // a board that shrinks past the layout floor means the fit gave up
      ok(lv + ' @ ' + S.w + 'x' + S.h + ': blocks did not shrink past the floor',
        m.tile >= 26, m.tile + 'px');
      ok(lv + ' @ ' + S.w + 'x' + S.h + ': "Show me how" is above the tab bar',
        vis(m.show), m.show ? 'bottom ' + m.show.bottom + ' vs floor ' + m.floor : 'element missing');
      ok(lv + ' @ ' + S.w + 'x' + S.h + ': "Shuffle again" is above the tab bar',
        vis(m.shuffle), m.shuffle ? 'bottom ' + m.shuffle.bottom + ' vs floor ' + m.floor : 'element missing');
      ok(lv + ' @ ' + S.w + 'x' + S.h + ': the row hint is fully visible',
        vis(m.hint), m.hint ? 'bottom ' + m.hint.bottom + ' vs floor ' + m.floor : 'element missing');
      if (S.w === 360 && S.h === 800) await shot('148-fit-' + lv + '.png');
    }
  }
  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
