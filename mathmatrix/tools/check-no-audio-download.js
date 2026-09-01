/* THE BACKGROUND MUSIC MUST NEVER COME DOWN OFF THE NETWORK DURING A TEST RUN.

   Raja: "As part of this testing the audio download is getting trigged on IDM
   remove those tests / Make sure it does not happen."

   There were no audio tests to remove -- nothing in this suite tests sound.
   The 470KB mp3 was the product behaving normally, by two routes:

     1. the page   -- music defaults ON, every guard clicks splash Play, and
                      ensureMusic() builds new Audio(...) with preload='auto';
     2. beta-sw.js -- './bgm-monkeys.mp3' sits in the install-time cache.addAll.

   Route 2 was invisible from the page. Measured against the live beta: the
   page's own Network domain reported ZERO mp3 requests while 481,443 bytes sat
   in CacheStorage -- the service worker had pulled the whole file down on a
   session nobody was watching. That is the shape of bug this guard exists to
   stop coming back, because it looks green while it is wrong.

   tools/quiet-audio.js silences both routes by fulfilling any *.mp3 request
   with an empty 200. Empty rather than blocked on purpose: cache.addAll rejects
   the WHOLE install if a single request fails, so refusing it would have
   broken beta's offline play for a reason with nothing to do with the product.

   WHY THIS GUARD LAUNCHES CHROME STRAIGHT AT THE URL, unlike the two offline
   guards which start on about:blank: the whole difficulty is a race. The
   service worker starts precaching while the harness is still finding its page
   target, and interception armed after that point is a coin toss -- measured
   4 runs, silenced twice, missed twice. quiet-audio.early() now attaches the
   instant Chrome's debugging port answers, which freezes the worker before its
   first line runs. Starting on about:blank would sidestep that race and make
   this guard pass without testing the thing that was actually broken.

   Three of the checks below exist to stop this guard going vacuously green: if
   the service worker stops controlling, or the mp3 leaves the precache list, or
   music stops defaulting ON, then the scenario is no longer being exercised and
   "no bytes" would prove nothing. Those fail loudly instead. */
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs'); const path = require('path');
const CDP = 9942, HTTP = 8968;
const ROOT = path.join(__dirname, '..');
const URL = 'http://localhost:' + HTTP + '/beta.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };

(async () => {
  /* Served locally, not from the live beta: this guard must work with no
     connection, and must never be the thing that puts the file on the wire. */
  let servedMp3 = 0;
  const srv = http.createServer((req, res) => {
    let f = req.url.split('?')[0];
    if (f === '/') f = '/beta.html';
    if (/\.mp3$/.test(f)) servedMp3++;
    fs.readFile(path.join(ROOT, f.slice(1)), (err, data) => {
      if (err){ res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
                           'Cache-Control': 'no-store' });
      res.end(data);
    });
  }).listen(HTTP);
  await sleep(500);

  const tmp = path.join(__dirname, '_cpnoaudio');
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + CDP, '--user-data-dir=' + tmp,
     '--window-size=390,844', URL], { stdio: 'ignore' });
  await require('./quiet-audio').early(CDP);
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${CDP}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  const reqs = new Map(), bytes = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 200));
    if (m.method === 'Network.requestWillBeSent' && /\.mp3/.test(m.params.request.url)) reqs.set(m.params.requestId, m.params.request.url);
    if (m.method === 'Network.loadingFinished' && reqs.has(m.params.requestId)) bytes.set(m.params.requestId, m.params.encodedDataLength);
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable');
  await send('Network.enable');

  const waitFor = async (expr, ms) => {
    const until = Date.now() + (ms || 25000);
    while (Date.now() < until){ if (await ev(expr)) return true; await sleep(200); }
    return false;
  };
  /* Exactly what every other guard does, because that is the code path that
     used to fetch the file. */
  await waitFor(`!!document.querySelector('.splashPlay')`);
  await ev(`document.querySelector('.splashPlay') && document.querySelector('.splashPlay').click()`);
  await sleep(4000);   // room for the audio element AND the worker to fetch

  /* beta-sw.js calls clients.claim(), but only on activate -- which lands
     AFTER this page has already loaded. Read it once and the guard fails on
     timing rather than on truth. */
  await waitFor(`!!(navigator.serviceWorker && navigator.serviceWorker.controller)`, 15000);
  const sw = await ev(`(navigator.serviceWorker && navigator.serviceWorker.controller) ? 'controlling' : 'none'`);
  const musicDefault = await ev(`localStorage.getItem('mmMusic')`);
  const cached = await ev(`(async function(){
    try {
      var names = await caches.keys(), out = [];
      for (var i = 0; i < names.length; i++){
        var c = await caches.open(names[i]);
        var keys = await c.keys();
        for (var j = 0; j < keys.length; j++){
          if (!/\\.mp3/.test(keys[j].url)) continue;
          var r = await c.match(keys[j]);
          var b = r ? await r.clone().arrayBuffer() : null;
          out.push({ size: b ? b.byteLength : -1 });
        }
      }
      return JSON.stringify(out);
    } catch(e){ return '[]'; }
  })()`);
  const entries = JSON.parse(cached || '[]');
  let total = 0;
  for (const [rid] of reqs) if (typeof bytes.get(rid) === 'number') total += bytes.get(rid);

  /* Not vacuous: the scenario has to still be the scenario. */
  ok('the service worker is controlling, so the precache path really ran', sw === 'controlling', sw);
  ok('music still defaults ON, so the page really does build the Audio element', musicDefault !== 'off', 'mmMusic=' + musicDefault);
  ok('the mp3 is still in the precache list -- if this fails, beta-sw.js changed and this guard needs rewriting',
     entries.length > 0, entries.length + ' mp3 cache entr' + (entries.length === 1 ? 'y' : 'ies'));

  /* The thing Raja asked for. */
  const biggest = entries.reduce((m, e) => Math.max(m, e.size), 0);
  ok('NOTHING OF THE MP3 REACHED THE CACHE -- the 470KB download does not happen',
     entries.length > 0 && biggest < 1024, biggest + ' bytes cached (was 481443 before the fix)');
  ok('and no mp3 request pulled bytes off the wire', total < 1024, total + ' bytes over ' + reqs.size + ' request(s)');
  ok('the server was never asked for the file at all', servedMp3 === 0, servedMp3 + ' mp3 request(s) reached the server');
  ok('no JS errors', errs.length === 0, errs.join(' | '));

  ws.close(); ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  srv.close();
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch (e) {}
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
