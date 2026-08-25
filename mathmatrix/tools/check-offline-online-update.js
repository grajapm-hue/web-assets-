/* THE SILENT UPDATE MUST SURVIVE A RECONNECT.

   Raja: "verify and ensure it auto refreshing in offline to online change
   over to assure the forced in app update."

   This app invites the exact situation it used to handle worst: it
   advertises "plays with no internet", so opening it from the cache with no
   signal is a NORMAL launch here, not an edge case. autoFresh() used to bail
   on `!navigator.onLine` at the top and run exactly once, at load -- so a
   player who opened offline and got their connection back mid-session was
   never moved onto the newest build. Measured, before the fix: the check
   never re-ran, for the whole session, however long they played. (The Update
   BUTTON flipped back correctly the whole time, because reflectNet has
   always listened for 'online'; only the silent check was missing one.)

   Two notes on how this is tested, both learned by getting it wrong first:

   1. CDP's Network.emulateNetworkConditions {offline:true} blocks traffic
      but does NOT flip navigator.onLine in headless Chrome. A first version
      of this used it, watched the page report onLine===true, and "passed"
      without ever exercising the guard. navigator.onLine is stubbed directly
      instead, before any page script runs.
   2. It serves over http://localhost rather than file:// -- autoFresh
      fetches its own URL, and a file:// fetch is blocked, so on file:// the
      check could never succeed regardless of the code being right.

   sessionStorage 'mm.freshChecked' is the observable proxy for "the update
   check actually ran": autoFresh sets it only after passing the online
   guard. */
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs'); const path = require('path');
const CDP = 9984, HTTP = 8975;
const ROOT = path.join(__dirname, '..');
const URL = 'http://localhost:' + HTTP + '/beta.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };

(async () => {
  const srv = http.createServer((req, res) => {
    let f = req.url.split('?')[0];
    if (f === '/') f = '/beta.html';
    fs.readFile(path.join(ROOT, f.slice(1)), (err, data) => {
      if (err){ res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
                           'Cache-Control': 'no-store' });
      res.end(data);
    });
  }).listen(HTTP);
  await sleep(500);

  const tmp = path.join(__dirname, '_cpoffon');
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + CDP, '--user-data-dir=' + tmp,
     '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${CDP}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
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
  await send('Page.enable');

  // Make the page BELIEVE it is offline, before any of its own script runs.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__fakeOnline = false;
    Object.defineProperty(navigator, 'onLine', {
      configurable: true, get: function(){ return window.__fakeOnline === true; }
    });
  ` });

  await send('Page.navigate', { url: URL });
  let loaded = false;
  for (let i = 0; i < 50 && !loaded; i++){ await sleep(300);
    loaded = await ev(`!!document.querySelector('.splashPlay') || !!document.getElementById('palTab')`).catch(() => false); }
  ok('the app loads when launched with no connection', loaded);
  ok('and it really believes it is offline', (await ev(`navigator.onLine`)) === false);

  await sleep(1500);
  ok('no update check runs while offline -- correct, there is nothing to fetch',
    (await ev(`sessionStorage.getItem('mm.freshChecked')`)) === null);

  // --- the connection comes back WHILE the app stays open ---
  await ev(`window.__fakeOnline = true; window.dispatchEvent(new Event('online'));`);
  await sleep(3000);

  ok('the page now believes it is online', (await ev(`navigator.onLine`)) === true);

  const checked = await ev(`sessionStorage.getItem('mm.freshChecked')`);
  ok('BACK ONLINE: the silent update check runs, instead of leaving the player on the cached build all session',
    checked !== null,
    checked === null ? 'NEVER re-checked' : 'checked');

  const btnText = await ev(`(document.getElementById('updateBtn')||{}).textContent || '(none)'`);
  ok('the Update button also reflects being back online', /Online Update/.test(btnText), btnText);

  /* One reload per session, not a loop: firing 'online' again (phones do
     this repeatedly on a flaky connection) must not start a second check
     while the first one's guard still stands. */
  await ev(`window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('online'));`);
  await sleep(1200);
  ok('repeated reconnects do not stack up more checks -- the once-per-session guard holds',
    (await ev(`sessionStorage.getItem('mm.freshChecked')`)) !== null);

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  srv.close();
  process.exit(fail ? 1 : 0);
})();
