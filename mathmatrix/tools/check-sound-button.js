/* Raja: "3 dots settings provided only for sound options, so can change this
   to speaker symbol and it is easy catch by seeing in front page itself."

   He is right that the sheet behind that button is sound-only (Sound, Music,
   Spatial stereo). This guards the replacement:

   1. The button carries a SPEAKER and the WORD "Sound" -- the same
      glyph+word rule the Logic and Watch buttons beside it already follow.
   2. The speaker REFLECTS STATE: muted shows a crossed speaker, so the front
      page tells you sound is off without opening anything. This is the part
      that can silently rot -- it depends on refreshSoundBtn() being in scope
      at barButtons(), 8,700 lines away, and on every toggle routing through
      that one function.
   3. No JS errors -- a ReferenceError in barButtons() would take the whole
      app bar down, not just this button.
   4. The bar still fits at 340/360/390px. The old button was a fixed 46px
      square; barWord is auto-width, so this is a real (if small) layout
      change and the narrow phones are where it would show. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9971;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpsound');
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

  await send('Runtime.enable');
  await sleep(600);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(700);

  /* 1. It exists, and the bare three-dots glyph is gone for good. */
  const shape = await ev(`(function(){
    var b = document.getElementById('barMore');
    if (!b) return JSON.stringify({ missing:true });
    return JSON.stringify({
      cls: b.className,
      glyph: (b.querySelector('i')||{}).textContent || '',
      word: (b.querySelector('span')||{}).textContent || '',
      aria: b.getAttribute('aria-label') || '',
      raw: b.textContent
    });
  })()`).then(JSON.parse);
  ok('settings button exists in the app bar', !shape.missing, JSON.stringify(shape));
  ok('it is a speaker, not three dots', shape.glyph === '\u{1F50A}' && shape.raw.indexOf('\u22EF') === -1, shape.glyph);
  ok('it carries the word "Sound", like Logic and Watch beside it', shape.word === 'Sound', shape.word);
  ok('it uses the barWord icon+label class', /\bbarWord\b/.test(shape.cls || ''), shape.cls);
  ok('its aria-label names the state and what it opens', /sound is on/i.test(shape.aria) && /settings/i.test(shape.aria), shape.aria);

  /* 2. The state-reflecting part -- the reason this is better than a static
        speaker. Toggle sound OFF via the real button and the bar must follow. */
  await ev(`document.getElementById('soundBtn').click()`);
  await sleep(250);
  const off = await ev(`(function(){
    var b = document.getElementById('barMore');
    return JSON.stringify({ glyph:(b.querySelector('i')||{}).textContent||'', aria:b.getAttribute('aria-label')||'' });
  })()`).then(JSON.parse);
  ok('sound OFF: the bar shows a MUTED speaker', off.glyph === '\u{1F507}', off.glyph);
  ok('sound OFF: aria-label says so', /sound is off/i.test(off.aria), off.aria);

  await ev(`document.getElementById('soundBtn').click()`);
  await sleep(250);
  const back = await ev(`(document.getElementById('barMore').querySelector('i')||{}).textContent`);
  ok('sound back ON: the bar returns to the plain speaker', back === '\u{1F50A}', back);

  /* 3. It still opens the sheet, and the sheet is titled for what is in it. */
  await ev(`document.getElementById('barMore').click()`);
  await sleep(400);
  const sheet = await ev(`(function(){
    var t = document.getElementById('shTitle');
    var host = document.getElementById('sheetHost') || document.querySelector('.sheetHost');
    return JSON.stringify({ title: t ? t.textContent : '', open: !!(host && /\\bon\\b/.test(host.className)) });
  })()`).then(JSON.parse);
  ok('tapping it opens the settings sheet', sheet.open === true, JSON.stringify(sheet));
  ok('the sheet is titled for sound, not a generic "Quick settings"',
     sheet.title.indexOf('Sound') !== -1 && sheet.title.indexOf('Quick settings') === -1, sheet.title);
  await ev(`(function(){ var c=document.querySelector('.shClose'); if(c) c.click(); })()`);
  await sleep(300);

  /* 4. The app bar must not overflow on the narrow phones -- barWord is
        auto-width where the old button was a fixed square. */
  for (const w of [340, 360, 390]) {
    await send('Emulation.setDeviceMetricsOverride',
      { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
    await sleep(350);
    const fit = await ev(`(function(){
      var bar = document.querySelector('.appBar');
      var b = document.getElementById('barMore');
      var br = bar.getBoundingClientRect(), mr = b.getBoundingClientRect();
      return JSON.stringify({
        barRight: Math.round(br.right), moreRight: Math.round(mr.right),
        moreLeft: Math.round(mr.left), w: Math.round(mr.width),
        vis: getComputedStyle(b).display !== 'none' && mr.width > 0
      });
    })()`).then(JSON.parse);
    ok('at ' + w + 'px the Sound button is visible and inside the bar',
       fit.vis && fit.moreRight <= fit.barRight + 1 && fit.moreLeft >= -1, JSON.stringify(fit));
  }
  await send('Emulation.clearDeviceMetricsOverride');

  ok('no JS errors', errs.length === 0, errs.join(' | '));

  ws.close(); ch.kill();
  await sleep(300);
  /* Deleting the throwaway profile must never decide the verdict. Chrome can
     still be letting go of it when we get here -- back-to-back runs of this
     file turned a fully green pass into an EPERM crash exactly that way, and
     a red suite that means "the temp folder was busy" wastes the time of
     whoever reads it. */
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) {}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
