/* Raja, on the people he already shared the link with: "how we solve this...
   should we again inform everyone to pass new instructions? It was not fair."

   He is right that it would not be. So this asks the only question that
   matters: does a device that ALREADY HAS THE OLD APP INSTALLED heal itself,
   with nobody told anything?

   It is not a thought experiment. It builds a real one:

     1. serves the genuine pre-fix build (git 5b6f904^, the last one whose
        updater greps for a quoted window.BETA_VER) over real HTTP,
     2. lets it register its service worker and fill its caches, then reloads
        so the worker is actually CONTROLLING the page -- the state every
        installed app is in, and the state that makes stale pages stick,
     3. swaps what the server returns to the current build, exactly as
        publishing does,
     4. clears sessionStorage, which is what closing and reopening an
        installed app does, and reloads.

   If the rescue works, that old build's own updater fetches the new page,
   finds the beacon, and moves itself forward with no user action at all.

   The service worker is the part that could still defeat it: autoFresh
   fetches its own URL, and if the worker answered from cache the old build
   would keep reading its own version back for ever. */
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs'); const path = require('path');
const CDP = 9927, HTTP = 8971;
const ROOT = path.join(__dirname, '..');
const PAGE = 'http://localhost:' + HTTP + '/beta.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };

(async () => {
  // the real pre-fix build, straight out of git
  const OLD = path.join(__dirname, '_oldbuild.html');
  execSync('git show 5b6f904^:mathmatrix/beta.html > "' + OLD + '"',
           { cwd: ROOT, shell: 'C:/Program Files/Git/bin/bash.exe', maxBuffer: 64 * 1024 * 1024 });
  const oldSrc = fs.readFileSync(OLD, 'utf8');
  const oldVer = (oldSrc.match(/BETA_VER\s*=\s*'([^']+)'/) || [])[1];
  const newSrc = fs.readFileSync(path.join(ROOT, process.env.MM_TARGET || 'beta.html'), 'utf8');
  const newVer = ((newSrc.match(/var BUILD_VER = '([^']+)';/) || [])[1] || '').split(' ')[0];
  ok('the old build under test really is a pre-fix one', !!oldVer && oldVer !== newVer,
     'old=' + oldVer + '  new=' + newVer);

  let serveNew = false;             // flipped when we "publish"
  /* THE STRANDED CONDITION, modelled deliberately. Raja's iPhone opens and
     paints the OLD page -- that is the whole complaint; if a plain reload
     fetched the new page he would never have noticed a problem. So after
     publishing, the next NAVIGATION still hands back the old build, exactly as
     a stale cache does, while autoFresh's own `?fresh=` probe sees what is
     really published. That leaves the beacon as the only thing that can save
     the device, which is precisely what needs proving.

     Without this the test flatters itself: served no-store, the page simply
     re-fetches and updates, and the beacon is never exercised at all. */
  let staleNavs = 0;
  const srv = http.createServer((req, res) => {
    let f = req.url.split('?')[0];
    const q = req.url.split('?')[1] || '';
    if (f === '/') f = '/beta.html';
    if (f === '/beta.html'){
      let body;
      if (!serveNew) body = oldSrc;
      else if (/fresh=/.test(q)) body = newSrc;          // the version probe
      else if (staleNavs > 0){ staleNavs--; body = oldSrc; }   // stale page load
      else body = newSrc;
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      res.end(body);
      return;
    }
    fs.readFile(path.join(ROOT, f.slice(1)), (err, data) => {
      if (err){ res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(HTTP);
  await sleep(500);

  const tmp = path.join(__dirname, '_cprescue');
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch(e){}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + CDP, '--user-data-dir=' + tmp,
     '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${CDP}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const go = async (url) => { await send('Page.navigate', { url }); await sleep(2600); };

  await send('Page.enable');

  // ---- 1. install the old build, the way a shared link does
  await go(PAGE);
  await sleep(2500);
  ok('the old build is what is installed', (await ev(`window.BETA_VER`)) === oldVer, await ev(`window.BETA_VER`));

  // ---- 2. reload so the worker is actually CONTROLLING, and caches are warm
  await go(PAGE);
  await sleep(2500);
  /* A worker does not take control the instant the page loads -- it installs,
     activates, and only then claims the client, and how long that takes moves
     with machine load. A fixed 2.5s wait made this guard fail about one run in
     five with "NONE", which reads exactly like the rescue being broken and was
     never anything but a race in this file. Wait for control, with a ceiling so
     a worker that genuinely never activates still fails. */
  let sw = 'NONE';
  for (let i = 0; i < 40; i++){
    sw = await ev(`navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : 'NONE'`);
    if (/sw\.js/.test(String(sw))) break;
    await sleep(300);
  }
  ok('its service worker is controlling the page', /sw\.js/.test(String(sw)), String(sw));
  const cached = await ev(`caches.keys().then(function(k){ return k.join(','); })`);
  ok('and its caches are populated, so a stale page could stick', !!cached, cached || '(none)');

  // ---- 3. publish the new build, and make the next launch paint STALE,
  //         which is the condition Raja's phone is actually in
  serveNew = true;
  staleNavs = 1;

  // ---- 4. reopen the app: a relaunch clears sessionStorage, which is the
  //         guard that lets autoFresh run at most once per session
  await ev(`sessionStorage.clear()`);
  await go(PAGE);
  await sleep(4500);

  const landedVer = await ev(`window.BETA_VER`);
  const landedUrl = await ev(`location.href`);
  ok('A STRANDED INSTALL RESCUES ITSELF, with nobody told anything',
     landedVer === newVer, 'opened stale, now on ' + landedVer);
  ok('and it got there through its OWN updater, which redirects with ?v=',
     /[?&]v=/.test(String(landedUrl)), String(landedUrl).slice(-46));

  // ---- 5. it must settle, not bounce between versions for ever
  await ev(`sessionStorage.clear()`);
  await go(PAGE);
  await sleep(3500);
  ok('reopening again leaves it alone -- no reload loop',
     (await ev(`window.BETA_VER`)) === newVer, await ev(`window.BETA_VER`));

  ws.close(); ch.kill(); srv.close(); await sleep(400);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch(e){}
  try { fs.unlinkSync(OLD); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
