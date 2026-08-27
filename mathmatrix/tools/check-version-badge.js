/* The version badge at the foot of the puzzle list. Raja could not read it, so
   the thing to check is CONTRAST, not merely that it is present — measure the
   painted colours and work out the ratio the way an accessibility check does. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9985;
const FILE = 'file:///' + path.join(__dirname, '..', process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const lum = ([r, g, b]) => {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb = s => (s.match(/\d+/g) || []).slice(0, 3).map(Number);

(async () => {
  fs.rmSync(path.join(__dirname, '_cpver'), { recursive: true, force: true, maxRetries: 3 });
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cpver'),
     '--window-size=390,844', FILE], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40 && !t; i++){ await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1800);
  await ev(`document.querySelector('.splashPlay').click()`); await sleep(900);
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(400);
  await ev(`(function(){ var e=document.getElementById('verFooter'); if(e) e.scrollIntoView({block:'center'}); })()`);
  await sleep(400);

  const d = JSON.parse(await ev(`(function(){
    var e = document.getElementById('verFooter');
    if (!e) return JSON.stringify({ error: 'no version footer' });
    var cs = getComputedStyle(e), r = e.getBoundingClientRect();
    return JSON.stringify({ text: e.textContent.trim(), colour: cs.color, bg: cs.backgroundColor,
      size: parseFloat(cs.fontSize), weight: cs.fontWeight, opacity: cs.opacity,
      w: Math.round(r.width), h: Math.round(r.height) }); })()`));

  ok('the version badge is there and names the build', /^(v|beta-)\d+/.test(d.text || ''), d.text);
  const c = ratio(rgb(d.colour), rgb(d.bg));
  ok('its text has real contrast against its own background', c >= 4.5,
    c.toFixed(1) + ':1  (' + d.colour + ' on ' + d.bg + ')');
  ok('it is not dimmed by opacity', parseFloat(d.opacity) === 1, 'opacity ' + d.opacity);
  ok('it is big enough to read', d.size >= 10, d.size + 'px, weight ' + d.weight);

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await sleep(400);
  /* Capture the VIEWPORT, not beyond it. The footer lives inside the puzzle
     list's own scrolling container, so its page coordinate and its on-screen
     position are different numbers — captureBeyondViewport wants the former and
     getBoundingClientRect gives the latter. Mixing them produced a perfectly
     sharp screenshot of the Sudoku cards sitting just above the badge, which is
     the worst kind of wrong: it looks like a successful capture. */
  const box = JSON.parse(await ev(`(function(){
    var e = document.querySelector('.verFooter');
    e.scrollIntoView({ block: 'center' });
    var r = e.getBoundingClientRect();
    return JSON.stringify({ x: Math.max(0, Math.floor(r.left) - 8), y: Math.max(0, Math.floor(r.top) - 8),
      w: Math.ceil(r.width) + 16, h: Math.ceil(r.height) + 16 }); })()`));
  await sleep(350);
  const shot = await send('Page.captureScreenshot', { format: 'png',
    clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 3 } });
  fs.writeFileSync(path.join(__dirname, 'shots', 'version-badge.png'),
    Buffer.from(shot.result.data, 'base64'));

  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
