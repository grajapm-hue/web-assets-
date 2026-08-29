/* Photograph the Fill In The Blank board as a player actually sees it.

   check-number-grid.js shoots at the END of its run, by which point the board
   it was testing has been cleared -- its picture shows an empty screen and
   proves nothing about the layout. This opens the board and shoots THAT.

   node shot-grid.js [out.png]        beta.html in this checkout
   MM_TARGET=<url> node shot-grid.js  any built or live copy */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9883;
const ROOT = path.join(__dirname, '..');
const MT = process.env.MM_TARGET || 'beta.html';
const FILE = /^https?:/.test(MT) ? MT : 'file:///' + path.join(ROOT, MT).split(path.sep).join('/');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'grid-shot.png'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const tmp = path.join(__dirname, '_cpshot');
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp,
     '--window-size=390,844', FILE], { stdio: 'ignore' });

  let t = null;
  for (let i = 0; i < 100 && !t; i++){ await sleep(300);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch(e){} }
  if (!t){ console.log('Chrome never opened a page on port ' + PORT); try { ch.kill(); } catch(e){} process.exit(1); }

  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const waitFor = async (x, ms = 12000) => { const end = Date.now() + ms;
    while (Date.now() < end){ if (await ev(x)) return true; await sleep(200); } return false; };

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await waitFor(`!!document.querySelector('.splashPlay')`);
  await ev(`document.querySelector('.splashPlay').click()`);
  await waitFor(`!!document.querySelector('.toggleBtn[data-size="grid"]')`);
  await ev(`document.querySelector('.toggleBtn[data-size="grid"]').click()`);
  await waitFor(`document.querySelectorAll('#board .cell').length === 9`);
  await sleep(900);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('wrote ' + OUT);

  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
})();
