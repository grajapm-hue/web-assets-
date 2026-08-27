/* Raja: "place the name SaNa below wherever monkey persist."

   The monkey introduces itself by name once, in its opening line, and after
   that every other thing it says is a sentence beside a face — a child landing
   on a puzzle screen has never been told who is talking to them. So the name
   travels with the face.

   ASSERTING IT EXISTS IS NOT ENOUGH, and this project has the scar: the version
   label was present, correct and effectively invisible — muted brown at 75%
   opacity on a tan background — and every check passed. So this measures the
   CONTRAST RATIO between the painted text and what is painted behind it, on
   every screen the monkey appears on, the way an accessibility check does. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9988;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpsana');
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
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1700);
  await ev(`(document.querySelector('.splashPlay')||{click(){}}).click()`); await sleep(1000);

  /* Walk up from the label until something actually paints a background — a
     transparent parent tells you nothing about what the reader sees. */
  const look = () => ev(`(function(){
    var el = document.querySelector('.sanaName');
    if (!el) return JSON.stringify({ missing: true });
    var cs = getComputedStyle(el);
    function rgb(s){ var m = s.match(/[\\d.]+/g); return m ? m.slice(0,3).map(Number) : null; }
    var fg = rgb(cs.color), bg = null, p = el;
    while (p && !bg){
      var b = getComputedStyle(p).backgroundColor;
      if (b && b !== 'transparent' && !/rgba\\(0, 0, 0, 0\\)/.test(b)) bg = rgb(b);
      p = p.parentElement;
    }
    if (!bg) bg = [255,255,255];
    function lum(c){ var a = c.map(function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
      return 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2]; }
    var l1 = lum(fg), l2 = lum(bg);
    var ratio = (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
    var r = el.getBoundingClientRect();
    var face = document.querySelector('.sanaFace').getBoundingClientRect();
    return JSON.stringify({
      text: el.textContent.trim(),
      ratio: Math.round(ratio * 10) / 10,
      size: parseFloat(cs.fontSize), weight: cs.fontWeight, opacity: cs.opacity,
      visible: r.width > 0 && r.height > 0,
      belowFace: r.top >= face.bottom - 1,
      centred: Math.abs((r.left + r.width/2) - (face.left + face.width/2)) <= 3,
      fg: 'rgb(' + fg.join(',') + ')', bg: 'rgb(' + bg.join(',') + ')'
    }); })()`).then(JSON.parse);

  const home = await look();
  ok('the monkey is named', !home.missing && home.text === 'SaNa', home.text);
  ok('the name is BELOW the face, not beside it', home.belowFace,
    home.belowFace ? 'sits under it' : 'not below the face');
  ok('and centred under it', home.centred);
  ok('it is readable, not a faint smudge', home.ratio >= 4.5,
    home.ratio + ':1  (' + home.fg + ' on ' + home.bg + ')');
  ok('at a size a child can read', home.size >= 9 && +home.weight >= 700 && +home.opacity === 1,
    home.size + 'px, weight ' + home.weight + ', opacity ' + home.opacity);

  /* RED, because Raja asked for red rather than the near-black it started as.
     Contrast alone would not notice a slide back to brown — a dark brown reads
     BETTER on tan than a dark red does, so a future tidy-up "improving" the
     contrast would quietly undo the instruction and every other assertion here
     would still pass. Red means the red channel clearly leads. */
  const c = home.fg.match(/\d+/g).map(Number);
  ok('the name is red, not brown or black',
    c[0] >= 90 && c[0] - Math.max(c[1], c[2]) >= 55,
    home.fg + '  (red leads green/blue by ' + (c[0] - Math.max(c[1], c[2])) + ')');

  /* "Wherever monkey persist" — the mascot follows the player onto every
     screen, so the name has to survive the trip, including onto a puzzle
     where the whole row is squeezed to give the board its height. */
  for (const trip of [
    { go: `document.getElementById('palTab').click()`, wait: 2700, where: 'Pallanguzhi' },
    { go: `document.getElementById('sudMiniTab').click()`, wait: 1400, where: 'Sudoku' },
    { go: `document.getElementById('tab-scHome').click()`, wait: 900,  where: 'back on the puzzle list' }
  ]){
    await ev(trip.go); await sleep(trip.wait);
    const s = await look();
    ok('the name is still under the monkey on ' + trip.where,
      !s.missing && s.text === 'SaNa' && s.visible && s.belowFace && s.ratio >= 4.5,
      s.missing ? 'gone' : s.ratio + ':1, ' + s.size + 'px');
  }

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
