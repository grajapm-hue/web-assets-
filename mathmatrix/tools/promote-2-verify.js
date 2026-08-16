/* Verify the BUILT index.html before it goes anywhere near the live repo.
   Static checks first, then load it in a browser and play the things Raja
   asked for by name — the Gate Logic skip option above all, since "that was
   not implemented in gate logic with questions skip option, be implement it
   from beta to existing" is the specific reason for this release. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9995;
const BUILT = path.join(__dirname, '_index-built.html');
const FILE = 'file:///' + BUILT.split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const src = fs.readFileSync(BUILT, 'utf8');

  console.log('--- static ---');
  // every <script> block must parse
  let bad = 0, n = 0;
  src.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g, (m, js) => {
    n++;
    const f = path.join(__dirname, '_chk' + n + '.js');
    fs.writeFileSync(f, js, 'utf8');
    try { execSync(`node --check "${f}"`, { stdio: 'pipe' }); }
    catch (e) { console.log('   script block ' + n + ': ' + String(e.stderr || e).slice(0, 200)); bad++; }
    fs.unlinkSync(f);
    return m;
  });
  ok('every script block parses', bad === 0, n + ' blocks, ' + bad + ' broken');

  let cbad = 0, cn = 0;
  src.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (m, css) => {
    cn++;
    const o = (css.match(/\/\*/g) || []).length, c = (css.match(/\*\//g) || []).length;
    if (o !== c) cbad++;
    return m;
  });
  ok('CSS comments balanced', cbad === 0, cn + ' style blocks');

  /* The version is READ from the built file, not pinned here. A literal in a
     check does not verify anything — it just freezes the check to one release,
     and it is exactly how a stale value once went green for two releases. What
     matters is that the version is well formed and, below, that it is NOT the
     one already live: reusing a number leaves autoFresh() with nothing to
     notice, so nobody's app updates itself. */
  const built = (src.match(/var BUILD_VER = '([^']+)';/) || [])[1];
  ok('version is a well-formed vNNN', /^v\d+$/.test(built || ''), built || '(none)');
  ok('service worker is sw.js with default scope',
    /register\('sw\.js'\)/.test(src) && !/register\(\s*'beta-sw/.test(src),
    (src.match(/register\('[^']+'[^)]*\)/) || [])[0]);
  ok('manifest is the real one', /href="manifest\.json"/.test(src) && !/beta-manifest/.test(src));
  ok('auto-update reads a literal that exists',
    (src.match(/BUILD_VER\s*=\s*'([^']+)'/) || [])[1] === built
    && /txt\.match\(\/BUILD_VER/.test(src));

  // reusing the live number means autoFresh() sees no difference and nobody updates
  let liveVer = '(could not fetch)';
  try {
    liveVer = (execSync('curl -s "https://kidsmathsmatrixpuzzle.github.io/?cb=verify"', { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
      .match(/BUILD_VER\s*=\s*'([^']+)'/) || [])[1] || '(not found)';
  } catch (e) {}
  ok('this version is NOT the one already live', built !== liveVer,
    'building ' + built + ', live is ' + liveVer);

  // no user-visible "beta" in text the player reads
  const visible = src
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  const betaWords = (visible.match(/\b(beta|BETA|Beta)\b/g) || []);
  ok('no visible "beta" left in what the player reads', betaWords.length === 0, betaWords.join(', ') || 'clean');

  console.log('\n--- in a browser ---');
  try { fs.rmSync(path.join(__dirname, '_cpv135'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpv135'),
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
  const shot = async nm => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'shots', nm), Buffer.from(r.result.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1800);
  await ev(`document.querySelector('.splashPlay').click()`); await sleep(900);

  ok('the page reports the version it was built as',
    (await ev(`window.BETA_VER`)) === built, await ev(`window.BETA_VER`) + ' vs ' + built);

  // the three slide levels
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(400);
  const cards = await ev(`Array.from(document.querySelectorAll('.toggleBtn[data-slide-level]')).map(function(b){
    return b.dataset.slideLevel + '|' + b.querySelector('.lvDiff').textContent; })`);
  ok('Slide Magic arrived with all three levels', cards.length === 3, cards.join('  //  '));

  for (const lv of ['fifteen', 'az', 'azn']){
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
    await ev(`document.querySelector('.toggleBtn[data-slide-level="${lv}"]').click()`); await sleep(700);
    const st = await ev(`(function(){
      var gaps = document.querySelectorAll('#slideBoard > .slideCell').length;
      var tiles = document.querySelectorAll('#slideBoard > .slideTile').length;
      return JSON.stringify({ gaps: gaps, tiles: tiles }); })()`);
    const S = JSON.parse(st);
    ok(lv + ' plays with one gap', S.gaps === 1, S.tiles + ' blocks, ' + S.gaps + ' gap(s)');
  }

  // GATE LOGIC + the skip option, the reason for this release
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
  await ev(`document.getElementById('gateListBtn').click()`); await sleep(900);
  ok('Gate Logic opens', await ev(`!!document.getElementById('gatePanel') &&
    document.querySelector('[data-screen="scPlay"]').classList.contains('on')`));
  /* The walk is gate list -> that gate's levels -> a room. The level buttons
     are the ones carrying BOTH data-gate and data-level; the gate buttons carry
     data-gate alone. Walking it for real is the point: the skip control only
     exists once you are actually inside a room. */
  const gates = await ev(`document.querySelectorAll('[data-gate]:not([data-level])').length`);
  ok('all seven gates are listed', gates >= 7, gates + ' gates');
  await ev(`(function(){ var b=document.querySelector('[data-gate]:not([data-level])'); if(b) b.click(); })()`);
  await sleep(800);
  const levels = await ev(`document.querySelectorAll('[data-gate][data-level]').length`);
  const locked = await ev(`document.querySelectorAll('.gateLevelLocked').length`);
  ok('every level of that gate is offered, none locked', levels > 0 && locked === 0,
    levels + ' levels, ' + locked + ' locked');
  await shot('135-gate-levels.png');
  await ev(`(function(){ var b=document.querySelector('[data-gate][data-level]'); if(b) b.click(); })()`);
  await sleep(1000);
  const skip = await ev(`(function(){ var s=document.getElementById('gateSkipBtn');
    if(!s) return 'MISSING'; var r=s.getBoundingClientRect();
    return (r.width>0 && r.height>0) ? 'visible: "' + s.textContent.trim().slice(0,40) + '"' : 'present but not visible'; })()`);
  ok('the Gate Logic skip option is there and visible', /visible:/.test(skip), skip);
  await shot('135-gate-skip.png');

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN — safe to publish' : fail + ' FAILURES — do not publish'));
  process.exit(fail === 0 ? 0 : 1);
})();
