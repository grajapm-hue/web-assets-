/* The bottom bar is the only way to reach Play, Get App and Feedback. Raja
   opened the app from one of his two home-screen icons and it was not there at
   all.

   The useful assertion is NOT "is the bar in the page" — it was in the page the
   whole time, and the live file proved it. It is "can the shell ever be taller
   than the screen", because this shell is a flex column with overflow:hidden:
   any surplus height is taken off the bottom, and the bar is what is at the
   bottom. A shell one pixel too tall is a bar one pixel clipped; a shell fifty
   pixels too tall is no navigation at all. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9987;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  /* Source guard first: the units are the whole fix, and a later edit tidying
     "duplicate" height declarations would silently undo it. */
  const src = fs.readFileSync(path.join(ROOT, process.env.MM_TARGET || 'beta.html'), 'utf8');
  /* .appShell is styled by THREE rules — a positioning one, a flex one, and the
     one that sets its height. Taking the first match read the positioning rule
     and reported the fix missing while it was sitting there in the third. Find
     the rule that actually sets a height. */
  const shell = (src.match(/\.appShell\{[^}]*\}/g) || []).filter(r => /height:/.test(r)).join(' ');
  ok('the shell is bounded by the SMALL viewport (100svh)', /height:100svh/.test(shell),
    /height:100svh/.test(shell) ? 'height:100svh present'
      : 'no 100svh — the shell can be sized to a height the screen does not have');
  ok('and capped there too', /max-height:100svh/.test(shell), 'max-height:100svh');

  const tmp = path.join(__dirname, '_cptab');
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
  let id = 0; const pend = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable');

  const look = () => ev(`(function(){
    var bar = document.querySelector('.tabBar');
    if (!bar) return JSON.stringify({ gone: true });
    var r = bar.getBoundingClientRect();
    var sh = document.querySelector('.appShell').getBoundingClientRect();
    /* visualViewport is what is actually on screen once browser UI is taken
       out; innerHeight is not always the same number. Judge against the
       smaller of the two, which is what a person can really see. */
    var seen = Math.min(window.innerHeight, (window.visualViewport && window.visualViewport.height) || window.innerHeight);
    return JSON.stringify({
      barTop: Math.round(r.top), barBottom: Math.round(r.bottom), barH: Math.round(r.height),
      shellH: Math.round(sh.height), seen: Math.round(seen),
      tabs: document.querySelectorAll('.tabBtn').length,
      labels: Array.prototype.map.call(document.querySelectorAll('.tabBtn'), function(b){ return b.textContent.replace(/[^A-Za-z ]/g, '').trim(); }).join(' / '),
      onScreen: r.bottom <= seen + 1 && r.top < seen && r.height > 20
    }); })()`).then(JSON.parse);

  /* Sizes across the range of real phones, plus two deliberately short ones —
     a short screen is where a shell that overshoots does its damage soonest. */
  for (const S of [{ w: 390, h: 844 }, { w: 360, h: 800 }, { w: 360, h: 740 },
                   { w: 412, h: 915 }, { w: 340, h: 680 }, { w: 360, h: 640 }]){
    await send('Emulation.setDeviceMetricsOverride', { width: S.w, height: S.h, deviceScaleFactor: 2, mobile: true });
    await send('Page.reload', { ignoreCache: true }); await sleep(1700);
    await ev(`document.querySelector('.splashPlay').click()`); await sleep(900);
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(500);

    const a = await look();
    const tag = S.w + 'x' + S.h;
    if (a.gone){ ok(tag + ': the bar exists', false, 'no .tabBar in the page'); continue; }
    ok(tag + ': shell fits the screen', a.shellH <= a.seen + 1,
      a.shellH <= a.seen + 1 ? 'shell ' + a.shellH + ' <= screen ' + a.seen
        : 'shell ' + a.shellH + ' is TALLER than the ' + a.seen + ' on screen — ' +
          (a.shellH - a.seen) + 'px comes off the bottom');
    ok(tag + ': all four tabs on screen', a.onScreen && a.tabs === 4,
      a.onScreen ? a.labels : 'bar ends at ' + a.barBottom + ', screen ends at ' + a.seen);
  }

  ws.close(); ch.kill();
  /* No delete here — Chrome has not let go of the profile the instant it is
     killed, and an EPERM on cleanup would report a passing check as a crash.
     It is removed at the start of the next run instead. */
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
