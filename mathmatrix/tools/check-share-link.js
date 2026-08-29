/* Raja: the copy icon in Android's share sheet copies something that will not
   open in a fresh browser, while every other channel works.

   Android's copy icon is part of the SYSTEM share sheet — the page cannot
   remove it or change it. What the page CAN decide is what Android is given to
   copy, and that is the whole bug: pass a description alongside the link and
   Chrome joins them into one run of plain text, so the copy button hands over a
   paragraph. Pass the link alone and it hands over a URL.

   So the assertion is on the PAYLOAD, not on any visible thing: share must send
   a url and must NOT send text. Checking that a Share button exists, or that it
   opens a sheet, would have passed happily every day this was broken. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9989;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpshare');
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
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception || {}).description);
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1600);
  await ev(`(document.querySelector('.splashPlay')||{click(){}}).click()`); await sleep(900);

  /* Preview tags — the description the share used to carry now lives here, so
     a link-only share still arrives as a card with a name and an explanation.
     Dropping the text WITHOUT these would be a downgrade, not a fix. */
  const meta = await ev(`JSON.stringify({
    desc: (document.querySelector('meta[name="description"]')||{}).content || '',
    ogTitle: (document.querySelector('meta[property="og:title"]')||{}).content || '',
    ogDesc: (document.querySelector('meta[property="og:description"]')||{}).content || '',
    ogImg: (document.querySelector('meta[property="og:image"]')||{}).content || ''
  })`).then(JSON.parse);
  ok('the page carries a description for preview cards', meta.desc.length > 40 && meta.ogDesc.length > 40,
    'og:description ' + meta.ogDesc.length + ' chars');
  ok('and a title and image for them', meta.ogTitle.length > 5 && /^https:\/\//.test(meta.ogImg),
    meta.ogImg || '(no og:image)');
  ok('the preview image is an absolute address', /^https:\/\/[^ ]+\.png$/.test(meta.ogImg),
    'a crawler cannot resolve a relative one: ' + meta.ogImg);

  /* Stub the share sheet and capture exactly what the page hands the system. */
  await ev(`(function(){
    window.__shared = null;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: function(d){ window.__shared = d; return Promise.resolve(); }
    });
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: function(s){ window.__copied = s; return Promise.resolve(); } }
    });
  })()`);

  /* Both Share buttons: the one under Installed on the home list, and the one
     on the Get App screen. Raja named both, and they are wired by the same
     function — which is exactly why a payload fault hits both at once. */
  for (const b of [{ id: 'diffShare', where: 'the Share chip under Installed' },
                   { id: 'shareBtn',  where: 'Share on the Get App screen' }]){
    await ev(`window.__shared = null; document.getElementById('${b.id}').click()`);
    await sleep(400);
    const p = await ev(`JSON.stringify(window.__shared)`).then(v => v ? JSON.parse(v) : null);
    if (!p){ ok(b.where + ' opens the share sheet', false, 'nothing was shared'); continue; }
    const keys = Object.keys(p).sort().join(',');
    ok(b.where + ' shares a LINK, not a paragraph', !('text' in p) && typeof p.url === 'string' && /^https?:|^file:/.test(p.url),
      'fields sent: ' + keys + (('text' in p) ? '  <-- text is what Android glues onto the URL' : ''));
    /* Compare against the page's OWN address rather than the literal
       "beta.html". The property is that Share sends whatever page you are on,
       and hard-coding the beta filename made this fail on the promotion build
       — which is named _index-built.html — for a reason that had nothing to do
       with sharing. A promotion check that cries wolf is one that gets waved
       through, and this runs immediately before publishing to real users. */
    const here = await ev(`location.href.split('#')[0].split('?')[0]`);
    ok(b.where + ' sends the page it is running from', p.url === here,
      p.url + (p.url === here ? '' : '  (page is ' + here + ')'));
  }

  /* Copy Link: Raja's own words are that this one works everywhere. It has to
     stay a bare URL and nothing else — one line, no description, no newline. */
  await ev(`window.__copied = null; document.getElementById('copyLinkBtn').click()`);
  await sleep(400);
  const copied = await ev(`window.__copied`);
  ok('Copy Link puts a bare URL on the clipboard', typeof copied === 'string' && /^(https?|file):\/\/\S+$/.test(copied.trim()) && copied.indexOf('\n') === -1,
    JSON.stringify(copied));
  ok('and nothing but the URL', typeof copied === 'string' && !/puzzles for kids|offline/i.test(copied),
    'no description smuggled in alongside it');

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');

  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
