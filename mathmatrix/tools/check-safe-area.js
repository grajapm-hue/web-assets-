/* Raja, on an iPhone: "top center occupied area hide our app tab message that
   areas."

   The page is served viewport-fit=cover, which draws UNDER the notch and the
   rounded corners on purpose, and .appShell fills the whole 100dvh. Every
   safe-area allowance in the file was env(safe-area-inset-BOTTOM) -- no top,
   no left, no right -- so on every iPhone since the X the Dynamic Island sits
   on top of the app bar, over the title and the Logic/Watch/Sound buttons, and
   in landscape the notch takes the same bite out of one side.

   It is the same fault the tab bar had at the other end of the screen, and it
   hid for the same reason: Android SHRINKS the viewport for its system bars,
   so nothing looks wrong on the device this is built against, while iOS
   OVERLAYS them. No amount of testing on Android would ever show it.

   env() cannot be faked from a headless browser, so a rule written directly
   against env() is a rule nothing can check -- which is why the insets are held
   in CSS variables. This sets them to a real iPhone's values through a
   STYLESHEET rule (an inline style loses to the theme's !important; that is a
   trap this project has already been caught by once) and then measures whether
   the bars actually moved.

   The numbers are an iPhone 14 Pro: 59px top in portrait, 48px side in
   landscape. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9923;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpsafe');
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch(e){}
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

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(900);

  const setInsets = (top, left, right) => ev(`(function(){
    var old = document.getElementById('__safeTest'); if (old) old.remove();
    var s = document.createElement('style'); s.id = '__safeTest';
    s.textContent = ':root{ --safeTop:${top}px !important; --safeLeft:${left}px !important; --safeRight:${right}px !important; }';
    document.head.appendChild(s);
  })()`);

  /* Baseline: with no insets nothing may change. Android shrinks its viewport,
     so the bar must stay exactly the 56px it has always been there. */
  const base = await ev(`Math.round(document.querySelector('.appBar').getBoundingClientRect().height)`);
  ok('with no notch the app bar is unchanged at 56px', base === 56, base + 'px');

  /* PORTRAIT: the Dynamic Island. Nothing in the bar may sit under it. */
  await setInsets(59, 0, 0);
  await sleep(350);
  const portrait = await ev(`(function(){
    var bar = document.querySelector('.appBar');
    var kids = Array.from(bar.children).filter(function(k){ var r=k.getBoundingClientRect(); return r.width>0 && r.height>0; });
    var worst = null;
    kids.forEach(function(k){ var r = k.getBoundingClientRect();
      if (worst === null || r.top < worst.top) worst = { top: Math.round(r.top), what: (k.id || k.className || k.tagName) }; });
    var say = document.querySelector('.sanaBub') || document.querySelector('#sanaBub');
    return JSON.stringify({ barH: Math.round(bar.getBoundingClientRect().height),
      barTop: Math.round(bar.getBoundingClientRect().top), highest: worst,
      sanaTop: say ? Math.round(say.getBoundingClientRect().top) : null }); })()`).then(JSON.parse);

  ok('the bar grows by the notch instead of hiding under it',
     portrait.barH >= 56 + 59, portrait.barH + 'px (was ' + base + ')');
  ok('nothing in the app bar sits under the Dynamic Island',
     portrait.highest && portrait.highest.top >= 59,
     'highest item "' + (portrait.highest || {}).what + '" at y=' + (portrait.highest || {}).top + ', island ends at 59');
  ok("SaNa's message is clear of it too",
     portrait.sanaTop === null || portrait.sanaTop >= 59, 'sana top ' + portrait.sanaTop);

  /* LANDSCAPE: the notch moves to one edge, which is where the title and the
     Logic/Watch/Sound buttons live. */
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await setInsets(0, 48, 48);
  await sleep(400);
  const land = await ev(`(function(){
    var bar = document.querySelector('.appBar');
    var kids = Array.from(bar.children).filter(function(k){ var r=k.getBoundingClientRect(); return r.width>0 && r.height>0; });
    var minL = 99999, maxR = -1;
    kids.forEach(function(k){ var r = k.getBoundingClientRect();
      if (r.left < minL) minL = Math.round(r.left);
      if (r.right > maxR) maxR = Math.round(r.right); });
    var tabs = Array.from(document.querySelectorAll('.tabBtn')).filter(function(k){ return k.getBoundingClientRect().width>0; });
    var tL = 99999, tR = -1;
    tabs.forEach(function(k){ var r = k.getBoundingClientRect();
      if (r.left < tL) tL = Math.round(r.left);
      if (r.right > tR) tR = Math.round(r.right); });
    return JSON.stringify({ barLeft: minL, barRight: maxR, tabLeft: tL, tabRight: tR, w: window.innerWidth }); })()`).then(JSON.parse);

  ok('in landscape the app bar keeps clear of the notch on both edges',
     land.barLeft >= 48 && land.barRight <= land.w - 48,
     'content spans ' + land.barLeft + '..' + land.barRight + ' of 0..' + land.w + ', safe is 48..' + (land.w - 48));
  ok('the first and last tab keep clear of it too',
     land.tabLeft >= 48 && land.tabRight <= land.w - 48,
     'tabs span ' + land.tabLeft + '..' + land.tabRight);

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
