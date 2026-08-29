/* Raja, on 3³ Multiply: "3 multiply text is not shrinked when more digits
   present — you ensure it other applicable puzzles too yourself."

   His board was the powers-of-two square scaled by 11, so the centre was 176
   and every line multiplied to 176³ = 5,451,776. Seven digits in a badge sized
   for three: the numbers overflowed and ran into each other, unreadable.

   fitCells() has always shrunk the digits INSIDE a square by how many there
   are. The ring never had that: --badgeFont scales with the board, not with
   the number.

   This measures OVERFLOW rather than font size. Font-size arithmetic can be
   wrong in the same direction as the fix and still agree with it; scrollWidth
   against clientWidth is the browser's own answer to "does this text fit". */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9877;
const ROOT = path.join(__dirname, '..');
const MT = process.env.MM_TARGET || 'beta.html';
const FILE = /^https?:/.test(MT) ? MT : 'file:///' + path.join(ROOT, MT).split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

/* Raja's own board: centre 176, so every line makes 5,451,776 */
const BIG3CUBE = ['88','2816','22','44','176','704','1408','11','352'];
const SIZES = ['3x3', '4x4', '5x5', '6x6', '8x8', '10x10', '3cube', 'ramanujan'];

(async () => {
  const tmp = path.join(__dirname, '_cpbfit');
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp,
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(300);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch(e){} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 160));
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  /* Wait for the page rather than sleeping a guessed amount. Fixed sleeps are
     generous over file:// and far too short over the network, which made this
     fail against the live URL for reasons that had nothing to do with the
     product -- exactly when a promotion check most needs to be trusted. */
  const waitFor = async (expr, ms) => {
    const until = Date.now() + (ms || 20000);
    while (Date.now() < until){ if (await ev(expr)) return true; await sleep(200); }
    return false;
  };
  await waitFor(`!!document.querySelector('.splashPlay')`);
  await ev(`document.querySelector('.splashPlay').click()`);
  await waitFor(`!!document.querySelector('.toggleBtn[data-size="3x3"]')`);

  /* every badge must contain its own text, and the text must still be legible */
  const overflow = () => ev(`(function(){
    var worst = null, over = 0, n = 0, smallest = 999;
    document.querySelectorAll('#board .badge').forEach(function(b){
      var txt = (b.textContent || '').trim();
      if (!txt || txt === '?') return;
      n++;
      var fs = parseFloat(getComputedStyle(b).fontSize);
      if (fs < smallest) smallest = fs;
      var spill = b.scrollWidth - b.clientWidth;
      if (spill > 1){ over++;
        if (!worst || spill > worst.spill) worst = { txt:txt, spill:spill, w:b.clientWidth, sw:b.scrollWidth, fs:fs }; }
    });
    return JSON.stringify({ n:n, over:over, worst:worst, smallest:smallest });
  })()`).then(JSON.parse);

  for (const size of SIZES){
    await ev(`document.getElementById('tab-scHome').click()`);
    await sleep(250);
    await ev(`document.querySelector('.toggleBtn[data-size="${size}"]').click()`);
    await waitFor(`document.querySelectorAll('#board .badge').length > 0`);
    await sleep(400);
    await ev(`document.getElementById('peekBtn').click()`);
    await sleep(450);
    const sol = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#board .cell')).map(function(i){ return i.value; }))`);
    await sleep(3600);
    await ev(`(function(){
      var sol = ${sol}, cs = document.querySelectorAll('#board .cell');
      for (var i=0;i<cs.length;i++){
        if (cs[i].readOnly || cs[i].disabled) continue;
        cs[i].focus(); cs[i].value = sol[i];
        cs[i].dispatchEvent(new Event('input', { bubbles:true }));
      }
      document.activeElement && document.activeElement.blur();
    })()`);
    await sleep(700);
    const r = await overflow();
    ok(size.padEnd(10) + 'every line total fits inside its badge',
       r.n > 0 && r.over === 0,
       r.over ? r.over + '/' + r.n + ' spill, worst "' + r.worst.txt + '" needs ' +
                r.worst.sw + 'px in ' + r.worst.w + 'px'
              : r.n + ' badges, smallest text ' + r.smallest + 'px');
    ok(size.padEnd(10) + 'and stays big enough to read', r.smallest >= 7,
       r.smallest + 'px');
  }

  /* ---- the board Raja actually photographed ----
     Powers of two scaled by 11: centre 176, so every line makes 176³. This is
     the case the ring was built without: a seven-digit total. */
  await ev(`document.getElementById('tab-scHome').click()`);
  await sleep(250);
  await ev(`document.querySelector('.toggleBtn[data-size="3cube"]').click()`);
  await sleep(1100);
  await ev(`(function(){
    var v = ${JSON.stringify(BIG3CUBE)}, cs = document.querySelectorAll('#board .cell');
    for (var i=0;i<cs.length;i++){
      cs[i].focus(); cs[i].value = v[i];
      cs[i].dispatchEvent(new Event('input', { bubbles:true }));
    }
    document.activeElement && document.activeElement.blur();
  })()`);
  await sleep(900);

  const target = await ev(`(document.getElementById('targetVal')||{}).textContent || '?'`);
  ok('Raja\'s 176-centre board really makes 5451776', target === '5451776', 'target ' + target);
  const big = await overflow();
  ok('a seven-digit total fits inside its badge', big.n > 0 && big.over === 0,
     big.over ? big.over + '/' + big.n + ' spill, worst "' + big.worst.txt + '" needs ' +
                big.worst.sw + 'px in ' + big.worst.w + 'px at ' + big.worst.fs + 'px'
              : big.n + ' badges, smallest text ' + big.smallest + 'px');
  ok('and it shrank rather than being clipped', big.smallest < 14, big.smallest + 'px');

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, 'badge-fit-3cube.png'), Buffer.from(shot.result.data, 'base64'));

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
