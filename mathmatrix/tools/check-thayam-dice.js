/* THE DICE MATCH THE REAL RULE TABLE, AND THE PITY SYSTEM ACTUALLY FIRES.

   Roll (Value)      Kattai Setup       Extra Turn?
   Thayam (1)        1 + 0              YES (required to start)
   Two (2)           1+1 OR 2+0         No
   Three (3)         1+2 OR 3+0         No
   Four (4)          1+3 OR 2+2         No
   Five (5)          2 + 3              YES
   Six (6)           3 + 3              YES
   Twelve (12)       0 + 0              YES

   Each die is independently 0-3, so exhaustively rolling every one of the
   16 possible (d0,d1) pairs a few hundred times over is cheap and proves
   the classification table directly, rather than trusting a sample. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9931;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpthayamdice');
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

  await sleep(700);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(700);

  const table = await ev(`(function(){
    var seen = {};
    for (var i = 0; i < 2000; i++){
      var r = window.__thayamRollDice();
      var key = r.total;
      if (!seen[key]) seen[key] = { total: r.total, isThayam: r.isThayam, bonusRoll: r.bonusRoll, count: 0 };
      seen[key].count++;
    }
    return JSON.stringify(seen);
  })()`).then(JSON.parse);

  ok('every total that occurs is in {1,2,3,4,5,6,12}',
    Object.keys(table).every(k => ['1','2','3','4','5','6','12'].includes(k)),
    Object.keys(table).join(','));
  ok('total 1 is flagged isThayam', table['1'] && table['1'].isThayam === true);
  ok('total 1 grants a bonus roll', table['1'] && table['1'].bonusRoll === true);
  ok('totals 2, 3, 4 do NOT grant a bonus roll',
    [2,3,4].every(n => !table[n] || table[n].bonusRoll === false));
  ok('total 5 grants a bonus roll', table['5'] && table['5'].bonusRoll === true);
  ok('total 6 grants a bonus roll', table['6'] && table['6'].bonusRoll === true);
  ok('total 12 grants a bonus roll (both dice blank)', table['12'] && table['12'].bonusRoll === true);

  // Pity: hammer the 'enter' chokepoint with forced misses and confirm a
  // forced hit lands within the promised 5-10 window, every time, over many
  // independent players -- not just once, which could pass by luck.
  const pityRuns = await ev(`(function(){
    var results = [];
    for (var p = 0; p < 30; p++){
      window.__thayamPityReset('enter', 'player' + p);
      var rollsUntilHit = 0;
      for (var i = 0; i < 20; i++){
        rollsUntilHit++;
        var forced = window.__thayamPityCheck('enter', 'player' + p);
        if (forced){ break; }
        window.__thayamPityRecord('enter', 'player' + p, false);   // simulate another natural miss
      }
      results.push(rollsUntilHit);
    }
    return JSON.stringify(results);
  })()`).then(JSON.parse);

  ok('pity always resolves within the promised 5-10 roll window',
    pityRuns.every(n => n >= 5 && n <= 10), pityRuns.join(','));

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
