/* Blocks are no longer square on the letter board, and the drag maths used one
   step for both axes. Drag for real — pointer events with pointerType 'touch',
   the way a finger does it — and check a block actually moves BOTH ways.

   Moving is not the whole claim though. The old shared step also CLAMPED travel
   to one block WIDTH, so on the stretched board a vertical drag let the block
   follow the finger 111px — more than two rows — before stopping. That is a
   visual defect a "did it move?" check sails straight past, so the drag is also
   sampled mid-gesture: a block must never travel further than the one cell it
   is actually going to. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9993;
const FILE = 'file:///' + path.join(__dirname, '..', process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  try { fs.rmSync(path.join(__dirname, '_cpd153'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpd153'),
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 140)); });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const cells = () => ev(`(function(){ var o=[];
    document.querySelectorAll('#slideBoard > .slideTile, #slideBoard > .slideCell').forEach(function(c){
      o.push(c.classList.contains('slideCell') ? '' : c.textContent); }); return o; })()`);

  async function dragFromTo(a, b, overshoot){
    const pts = await ev(`(function(){
      function mid(i){ var e=document.querySelector('[data-slide="'+i+'"]'); if(!e) return null;
        var r=e.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; }
      var A=mid(${a}), B=mid(${b}); return A&&B ? JSON.stringify({A:A,B:B}) : ''; })()`);
    if (!pts) return null;
    const { A, B } = JSON.parse(pts);
    const opt = { pointerType: 'touch', button: 'left', buttons: 1, clickCount: 1 };
    await send('Input.dispatchMouseEvent', Object.assign({ type: 'mousePressed', x: A.x, y: A.y }, opt));
    let maxTravel = 0;
    // push PAST the target so a clamp that is too generous shows itself
    const over = overshoot || 1;
    for (let s = 1; s <= 6; s++){
      await send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseMoved',
        x: A.x + (B.x - A.x) * over * s / 6, y: A.y + (B.y - A.y) * over * s / 6 }, opt));
      await sleep(28);
      const tr = await ev(`(function(){ var e=document.querySelector('#slideBoard .dragging');
        if(!e) return 0; var m=getComputedStyle(e).transform;
        if(!m||m==='none') return 0; var p=m.match(/matrix\\(([^)]+)\\)/);
        if(!p) return 0; var v=p[1].split(',').map(Number);
        return Math.max(Math.abs(v[4]||0), Math.abs(v[5]||0)); })()`);
      if (tr > maxTravel) maxTravel = tr;
    }
    await send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseReleased', x: B.x, y: B.y }, opt));
    await sleep(280);
    return { maxTravel: Math.round(maxTravel) };
  }
  const gapAt = async () => ev(`(function(){ var g=-1;
    document.querySelectorAll('#slideBoard > .slideTile, #slideBoard > .slideCell').forEach(function(c,i){
      if (c.classList.contains('slideCell')) g=i; }); return g; })()`);

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1700);
  await ev(`document.querySelector('.splashPlay').click()`); await sleep(800);

  for (const lv of [{ k: 'az', cols: 3, wide: true }, { k: 'fifteen', cols: 4, wide: false }]){
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(250);
    await ev(`document.querySelector('.toggleBtn[data-slide-level="${lv.k}"]').click()`); await sleep(800);

    const shape = await ev(`(function(){ var t=document.querySelector('#slideBoard .slideTile');
      var r=t.getBoundingClientRect();
      return JSON.stringify({ w:Math.round(r.width), h:Math.round(r.height),
        wide: document.getElementById('slideBoard').classList.contains('slideWideCells') }); })()`);
    const SH = JSON.parse(shape);
    console.log('\n   ' + lv.k + ': blocks ' + SH.w + 'x' + SH.h + (SH.wide ? ' (stretched)' : ' (square)'));
    ok(lv.k + ': block shape is ' + (lv.wide ? 'stretched' : 'square'), SH.wide === lv.wide,
      SH.w + 'x' + SH.h);

    // drag the block ABOVE the gap downwards, and the one BESIDE it sideways
    for (const dir of ['vertical', 'horizontal']){
      const g = await gapAt();
      const from = dir === 'vertical'
        ? (g - lv.cols >= 0 ? g - lv.cols : g + lv.cols)
        : ((g % lv.cols) > 0 ? g - 1 : g + 1);
      const before = await cells();
      const res = await dragFromTo(from, g, 1.8);   // deliberately overshoot
      const after = await cells();
      ok(lv.k + ': a ' + dir + ' drag moves the block',
        res && before[from] === after[g] && after[from] === '',
        res ? '"' + before[from] + '" ' + from + ' -> ' + g + ', landed "' + after[g] + '"' : 'no cells');
      if (res){
        // one cell along the axis actually dragged, plus the gap, plus slack
        const limit = (dir === 'vertical' ? SH.h : SH.w) + 12;
        ok(lv.k + ': the block never travels past its target on a ' + dir + ' drag',
          res.maxTravel <= limit, res.maxTravel + 'px travelled, one cell is ' + limit + 'px');
      }
    }
  }
  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
