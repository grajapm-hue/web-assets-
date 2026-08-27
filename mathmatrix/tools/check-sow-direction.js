/* BOTH BOARDS MUST SOW THE SAME WAY ROUND.

   Raja: "in pallanguzhi 4 players the sequence of filling and continuing the
   seed -- in 2 player it is anti-clockwise which is the normal order, but in
   4 player it is opposite." Measured, and he was right: 2-player ran
   anti-clockwise, 4-player ran clockwise. He confirmed anti-clockwise is how
   the game is really played, so the 4-player board was turned to match.

   This watches where seeds ACTUALLY land during a real sow -- polling the
   live board and recording which cup gains a seed, in order -- then works
   out the direction from those cups' real screen positions. It deliberately
   does NOT re-implement the ring formula: a test that mirrors the code it is
   checking would agree with that code even when both are wrong.

   Sign convention: screen y grows DOWNWARD, which flips the usual maths, so
   a POSITIVE shoelace sum means clockwise as a person sees it. Proved below
   against a square whose direction is not in doubt, rather than assumed --
   the first version of this measurement had the sign inverted and
   confidently reported both boards backwards. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9985;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

function signedArea(pts){          // POSITIVE = clockwise on screen (y down)
  let a = 0;
  for (let i = 0; i < pts.length; i++){
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += (p.x * q.y - q.x * p.y);
  }
  return a;
}

(async () => {
  const knownCW = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];   // TL->TR->BR->BL = clockwise
  ok('sign convention proved: a known-clockwise square reads positive',
    signedArea(knownCW) > 0, String(signedArea(knownCW)));

  const tmp = path.join(__dirname, '_cpsowdir');
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

  await sleep(600);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(600);

  /* Watch a live sow and record, in order, which cups GAIN a seed. Seeds
     drop about 400ms apart, so an 80ms poll catches every one. */
  async function watchDrops(stateExpr, liftExpr, ringLen){
    const drops = [];
    let prev = await ev(`JSON.stringify(${stateExpr}.cups)`).then(JSON.parse);
    await ev(liftExpr);
    for (let s = 0; s < 400; s++){
      const cur = await ev(`JSON.stringify(${stateExpr}.cups)`).then(JSON.parse);
      for (let i = 0; i < ringLen; i++){
        if (cur[i] > prev[i]) drops.push(i);          // this cup just received seed(s)
      }
      prev = cur;
      if (!(await ev(`${stateExpr}.busy`))) break;
      await sleep(80);
    }
    return drops;
  }

  async function pointsFor(indices, sel){
    const pts = [];
    for (const i of indices){
      const p = await ev(`(function(){
        var el = document.querySelector('${sel.replace('IDX', i)}');
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) });
      })()`);
      if (p) pts.push(JSON.parse(p));
    }
    return pts;
  }

  // ================= 2-PLAYER: the reference, unchanged =================
  await ev(`document.getElementById('palTab').click()`); await sleep(800);
  for (const side of [1, 2]){
    await ev(`document.querySelector('#palSide${side} .palStore').click()`);
    for (let i = 0; i < 80; i++){ if (!(await ev(`window.__palState().busy`))) break; await sleep(120); }
  }
  const drops2 = await watchDrops(`window.__palState()`,
    `document.querySelector('#palBoard [data-pal="0"]').click()`, 14);
  const pts2 = await pointsFor(drops2.slice(0, 10), `#palBoard [data-pal="IDX"]`);
  const a2 = signedArea(pts2);
  ok('2-player: seeds observed landing in ' + drops2.length + ' cups', drops2.length >= 4, drops2.slice(0, 10).join('>'));
  ok('2-player board sows ANTI-CLOCKWISE (the reference)', a2 < 0, 'signedArea=' + a2);

  // ================= 4-PLAYER: the board that was flipped =================
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(800);
  for (const s of ['A', 'B', 'C', 'D']){
    await ev(`document.querySelector('#pal4Card${s} .pal4CardStore').click()`);
    for (let i = 0; i < 80; i++){ if (!(await ev(`window.__pal4State().busy`))) break; await sleep(120); }
  }
  const before = await ev(`JSON.stringify(window.__pal4State())`).then(JSON.parse);
  const drops4 = await watchDrops(`window.__pal4State()`,
    `document.querySelector('#pal4Frame .pal4Cup.sideA').click()`, 28);
  const pts4 = await pointsFor(drops4.slice(0, 12), `#pal4Frame [data-pal4="IDX"]`);
  const a4 = signedArea(pts4);
  ok('4-player: seeds observed landing in ' + drops4.length + ' cups', drops4.length >= 4, drops4.slice(0, 12).join('>'));
  ok('4-player board sows ANTI-CLOCKWISE', a4 < 0, 'signedArea=' + a4);

  ok('both boards run the SAME way round', (a2 < 0) === (a4 < 0),
    '2p=' + (a2 < 0 ? 'anti-clockwise' : 'clockwise') + '  4p=' + (a4 < 0 ? 'anti-clockwise' : 'clockwise'));

  const after = await ev(`JSON.stringify(window.__pal4State())`).then(JSON.parse);
  const tot = s => s.cups.reduce((a,b)=>a+b,0) + s.store.reduce((a,b)=>a+b,0) + (s.hand||0);
  ok('a real sow still conserves every seed after the flip', tot(after) === 140, tot(before) + ' -> ' + tot(after));
  ok('and the sow actually moved seeds', JSON.stringify(before.cups) !== JSON.stringify(after.cups));

  /* THE TURN MUST TRAVEL THE SAME WAY THE SEEDS DO.

     Raja: "the auto next player SaNa pointer should be in ADCB direction."
     If the seeds run anti-clockwise but the turn still passes A->B->C->D,
     SaNa's arrow hands play to the side OPPOSITE the one the sowing just
     ran towards. This plays real moves and records who is actually up
     next, rather than reading the turn function -- the pointer a player
     sees is driven by the same `active` value being checked here. */
  const turns = [];
  for (let m = 0; m < 10; m++){
    const s = await ev(`JSON.stringify(window.__pal4State())`).then(JSON.parse);
    if (!s.playing) break;
    if (turns[turns.length - 1] !== s.active) turns.push(s.active);
    if (turns.length >= 5) break;
    const ai = ['A','B','C','D'].indexOf(s.active);
    let idx = -1;
    for (let k = ai * 7; k < ai * 7 + 7; k++){ if (s.cups[k] > 0 && !s.pillai[k]){ idx = k; break; } }
    if (idx < 0) break;
    await ev(`document.querySelector('#pal4Frame .pal4Cup[data-pal4="${idx}"]').click()`);
    for (let i = 0; i < 120; i++){ if (!(await ev(`window.__pal4State().busy`))) break; await sleep(100); }
  }
  // expected walk from wherever it started, going A -> D -> C -> B -> A
  const ORDER = ['A', 'D', 'C', 'B'];
  let expected = [];
  if (turns.length){
    let at = ORDER.indexOf(turns[0]);
    for (let i = 0; i < turns.length; i++) expected.push(ORDER[(at + i) % 4]);
  }
  ok('the turn passes A -> D -> C -> B (anti-clockwise), matching the seeds',
    turns.length >= 3 && turns.join('') === expected.join(''),
    'observed ' + turns.join('>') + (expected.length ? '   expected ' + expected.join('>') : ''));

  const lookCls = await ev(`(document.getElementById('pal4Look')||{}).className || ''`);
  const liveActive = await ev(`window.__pal4State().active`);
  ok("SaNa's pointer points at whoever is actually up next",
    lookCls.indexOf('look' + liveActive) > -1, lookCls + ' vs active=' + liveActive);

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
