/* Raja, after clearing his browser and reinstalling: "installation tab is in
   active... did installation by tap to play > get app, installation done well
   there." The splash Install button was not disabled -- it was unreadable, so
   he took it for disabled and installed from somewhere else.

   Cause: three buttons share one set of state painters, and those colours were
   written for the Get App CHIP (#installBtn, background #0a1a33, near-black)
   where pale #7dd3fc reads well. The splash pill is the inverse -- a bright
   #38bdf8 background -- so the same pale blue landed at about 1.3:1 contrast,
   and "How to Install" at about 1.6:1. Both look greyed out.

   This measures real contrast from COMPUTED styles in every state, for every
   install button, against the WCAG 4.5:1 floor. A screenshot review would pass
   this bug -- the button is plainly visible, just not legible -- and eyeballing
   two blues is exactly the judgement call a number should make instead. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9931;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

/* Walks up for the first non-transparent background, the way a reader's eye
   does -- a button with `background: transparent` is really sitting on
   whatever is behind it, and scoring it against rgba(0,0,0,0) would invent a
   contrast figure that nobody actually sees. */
const CONTRAST_FN = `
  function _rgb(s){ var m = s.match(/[\\d.]+/g); return m ? m.slice(0,3).map(Number) : null; }
  function _lum(c){ var a = c.map(function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2]; }
  function _bgOf(el){
    while (el && el !== document.documentElement){
      var b = getComputedStyle(el).backgroundColor;
      var m = b.match(/[\\d.]+/g);
      if (m && (m.length < 4 || Number(m[3]) > 0.5)) return _rgb(b);
      el = el.parentElement;
    }
    return [255,255,255];
  }
  function _contrast(el){
    var fg = _rgb(getComputedStyle(el).color), bg = _bgOf(el);
    if (!fg || !bg) return 0;
    var a = _lum(fg), b = _lum(bg);
    return (Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05);
  }`;

(async () => {
  const tmp = path.join(__dirname, '_cpinstallbtn');
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

  /* file:// never fires beforeinstallprompt, so after the 2.5s fallback every
     button is in the "How to Install" state -- exactly what a first-time
     visitor sees before Chrome has made up its mind. */
  await sleep(4200);

  const IDS = ['splashInstall', 'installBtn', 'diffInstall'];
  const readState = async () => ev(`(function(){ ${CONTRAST_FN}
    return JSON.stringify(${JSON.stringify(IDS)}.map(function(id){
      var b = document.getElementById(id);
      if (!b) return { id: id, missing: true };
      var cs = getComputedStyle(b);
      return { id: id, text: b.textContent.trim(), disabled: b.disabled,
        color: cs.color, bg: cs.backgroundColor,
        contrast: Math.round(_contrast(b) * 100) / 100 };
    })); })()`).then(JSON.parse);

  const howto = await readState();
  console.log('--- "How to Install" state (no install API yet) ---');
  howto.forEach(b => {
    if (b.missing) { ok(b.id + ' exists', false, 'missing'); return; }
    ok(b.id + ' is readable in the How-to state', b.contrast >= 4.5,
       b.contrast + ':1  "' + b.text + '"  ' + b.color + ' on ' + b.bg);
  });

  ok('the splash button is not actually disabled', howto[0] && howto[0].disabled === false);

  /* Now the state Raja's phone was really in: Chrome HAD offered a one-tap
     install, so the label said "Install App" -- and that was the washed-out
     one in his screenshot. A plain synthetic event is enough to drive the
     app's own listener and repaint every button. */
  await ev(`(function(){ var e = new Event('beforeinstallprompt');
    e.prompt = function(){}; e.userChoice = Promise.resolve({outcome:'dismissed'});
    window.dispatchEvent(e); })()`);
  await sleep(400);

  const can = await readState();
  console.log('--- "Install App" state (one-tap install offered) ---');
  can.forEach(b => {
    if (b.missing) return;
    ok(b.id + ' is readable when an install is offered', b.contrast >= 4.5,
       b.contrast + ':1  "' + b.text + '"  ' + b.color + ' on ' + b.bg);
  });
  ok('every button now offers the install', can.every(b => b.missing || /Install App/.test(b.text)),
     can.map(b => b.text).join(' | '));

  /* And it must still DO something. The fallback opens the offline sheet,
     which sits at z-index 80 under the splash's 200 -- so the splash has to
     get out of the way, or the tap looks dead. */
  await ev(`(function(){ var b=document.getElementById('splashInstall');
    b.style.background=''; b.style.color=''; })()`);   // back to stylesheet defaults
  await sleep(100);

  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch(e){}
  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
