/* Does the backup bundle actually stand on its own?

     node check-backup-bundle.js v153

   The claim the bundle makes is a strong one: copy ONE file anywhere, with no
   signal and nothing beside it, and the whole game still works. That claim is
   only worth something if it is tested the way it is stated -- so the file is
   copied ALONE into an empty folder, opened with the network switched off at
   the browser, and played from there. If it secretly still wanted a picture
   from beside it, or from the web, it fails here.

   The editable copy is checked too, but against a different promise: it is the
   live page, so it SHOULD want its pictures beside it. What matters for that
   one is that it is byte-for-byte what the site is serving. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

const VER = process.argv[2];
if (!/^(v\d+|beta-\d+)$/.test(VER || '')) {
  console.error('usage: node check-backup-bundle.js vNNN | beta-NNN');
  process.exit(1);
}
const BETA = VER.startsWith('beta-');
const SITE = BETA ? 'https://grajapm-hue.github.io/web-assets-/mathmatrix/'
                  : 'https://kidsmathsmatrixpuzzle.github.io/';
const PAGE = BETA ? 'beta.html' : 'index.html';
const DIR = path.join(__dirname, '..', '..', '_bk', 'MathMatrix-' + VER);
const PUB = `PUBLISH-THIS-MathMatrix-${VER}.html`;
const EDIT = `EDIT-THIS-MathMatrix-${VER}.html`;
const PORT = 9971;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const LEVELS = ['3x3', '4x4', '5x5', '6x6', '8x8', '10x10', '3cube', 'triangle', 'ramanujan', 'binary', 'binary2'];

(async () => {
  /* ---- the editable copy is the live page, unchanged ---- */
  const liveTmp = path.join(os.tmpdir(), 'mmlive-' + Date.now() + '.html');
  execSync(`curl -sfL -o "${liveTmp}" "${SITE}${PAGE}"`);
  const h = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  ok('the editable copy is byte-for-byte the published page',
     h(path.join(DIR, EDIT)) === h(liveTmp), h(path.join(DIR, EDIT)).slice(0, 16));
  /* The beta's BUILD_VER has a sentence of release notes after the number, so
     the version ends at the closing quote OR at the first space. */
  ok('and it is the version this bundle claims',
     new RegExp(`BUILD_VER = '${VER}[ ']`).test(fs.readFileSync(path.join(DIR, EDIT), 'utf8')), VER);
  fs.unlinkSync(liveTmp);

  /* ---- fingerprints match what is in the folder ---- */
  const sums = fs.readFileSync(path.join(DIR, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
  let bad = [];
  for (const line of sums) {
    const [sum, name] = line.split(/\s+/);
    const p = path.join(DIR, name);
    if (!fs.existsSync(p)) { bad.push(name + ' missing'); continue; }
    if (h(p) !== sum) bad.push(name + ' altered');
  }
  ok('every fingerprint in SHA256SUMS.txt matches', bad.length === 0, bad.join(', ') || sums.length + ' files');

  /* ---- the single-file copy, ALONE, with no network ---- */
  const alone = fs.mkdtempSync(path.join(os.tmpdir(), 'mmalone-'));
  fs.copyFileSync(path.join(DIR, PUB), path.join(alone, 'index.html'));
  ok('nothing is in the test folder but the one file',
     fs.readdirSync(alone).length === 1, fs.readdirSync(alone).join(','));

  const FILE = 'file:///' + path.join(alone, 'index.html').split(path.sep).join('/');
  const prof = path.join(__dirname, '_cpbundle');
  try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5 }); } catch (e) {}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof,
     '--window-size=390,844', FILE], { stdio: 'ignore' });

  await require('./quiet-audio').early(PORT);
  let t = null;
  for (let i = 0; i < 100 && !t; i++) { await sleep(300);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  if (!t) { console.log('  FAIL  Chrome never opened the page'); process.exit(1); }

  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); let errs = []; const wanted = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 160));
    /* anything it tries to pull off the network is a file it secretly still needs */
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (/^https?:/.test(u)) wanted.push(u.slice(0, 90));
    }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const waitFor = async (x, ms = 15000) => { const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(x)) return true; await sleep(200); } return false; };

  await send('Runtime.enable'); await send('Network.enable');
  /* the network is switched off at the browser: if it needs the web, it breaks */
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  ok('it opens with the network switched off', await waitFor(`!!document.querySelector('.splashPlay')`), FILE);
  await ev(`document.querySelector('.splashPlay').click()`);
  ok('the puzzle list appears', await waitFor(`!!document.querySelector('.toggleBtn[data-size="3x3"]')`));

  for (const lv of LEVELS) {
    errs = [];
    await ev(`document.getElementById('tab-scHome').click()`);
    await waitFor(`!!document.querySelector('.toggleBtn[data-size="${lv}"]')`);
    await ev(`document.querySelector('.toggleBtn[data-size="${lv}"]').click()`);
    const on = await waitFor(`!!document.querySelector('[data-screen="scPlay"].on')`);
    await sleep(250);
    const visible = await ev(`(function(){
      var s = document.querySelector('[data-screen="scPlay"].on'); if (!s) return false;
      var e = s.querySelectorAll('button, .cell, input');
      for (var i = 0; i < e.length; i++){ var r = e[i].getBoundingClientRect(); if (r.width > 0 && r.height > 0) return true; }
      return false; })()`);
    ok(lv + ' plays from the single file', on && visible && errs.length === 0,
       `open=${on} visible=${visible}` + (errs.length ? ' err=' + errs[0] : ''));
  }

  /* The formula sheets are the real test of the inlining, and they are the
     easiest thing to get wrong: they are opened from JS as openCheat('name'),
     not written as <img src>, so counting <img> tags on the home screen proves
     nothing at all -- there are none. Open the sheets and look at the picture
     that actually arrives. */
  const SHEETS = ['3x3', '4x4', '5x5', '6x6', '8x8', '10x10', '3cube', 'ramanujan'];
  for (const lv of SHEETS) {
    await ev(`document.getElementById('tab-scHome').click()`);
    await waitFor(`!!document.querySelector('.toggleBtn[data-size="${lv}"]')`);
    await ev(`document.querySelector('.toggleBtn[data-size="${lv}"]').click()`);
    await waitFor(`!!document.querySelector('[data-screen="scPlay"].on')`);
    /* Blank the picture first. Without this a puzzle whose sheet never opens
       shows the PREVIOUS puzzle's picture, still loaded in the modal, and the
       check happily passes on it -- 3cube "passed" at 614x964, which was
       10x10's sheet. A stale image must not be able to stand in for a missing
       one. */
    await ev(`(function(){ var i = document.getElementById('cheatImg');
      if (i) i.removeAttribute('src'); })()`);
    /* Reach the sheet the way a child does: the 💡 Logic button in the bar,
       then the "Quick formula sheet" row. Hunting for a stray button with
       openCheat in its onclick found one for six puzzles and missed 3cube,
       whose sheet lives only behind the bulb -- the app's own route works for
       all of them. */
    await ev(`document.getElementById('barLearn').click()`);
    const row = await waitFor(`!!document.querySelector('.rowBtn[data-learn="sheet"]')`, 6000);
    const opened = row ? await ev(`(function(){
      document.querySelector('.rowBtn[data-learn="sheet"]').click(); return true; })()`)
      : 'no formula-sheet row offered';
    const shown = await waitFor(`(function(){ var i = document.getElementById('cheatImg');
      return !!i && i.complete && i.naturalWidth > 0; })()`, 8000);
    const held = await ev(`/^data:/.test((document.getElementById('cheatImg')||{}).src || '')`);
    const size = await ev(`(function(){ var i = document.getElementById('cheatImg');
      return i ? i.naturalWidth + 'x' + i.naturalHeight : '-'; })()`);
    ok(lv + ' formula sheet is carried inside the file and really draws',
       opened === true && shown && held, `${size}, held inside: ${held}`);
    await ev(`(function(){ var m = document.getElementById('cheatModal'); if (m) m.style.display='none'; })()`);
  }

  /* The music is fetched by JS too (new Audio(...)), so there is no <audio>
     tag to inspect -- read the file itself. */
  const oneSrc = fs.readFileSync(path.join(DIR, PUB), 'utf8');
  ok('the music is carried inside the file, with no filename left to fetch',
     /new Audio\(ASSET\('data:audio\/mpeg;base64,/.test(oneSrc) && !/['"]\/?bgm-monkeys\.mp3['"]/.test(oneSrc),
     'no bgm-monkeys.mp3 reference remains');
  ok('and no picture filename is left to fetch either',
     !/['"]\/?\.?\/?cheat-(3x3|4x4|5x5|6x6|8x8|10x10|3cube)\.png['"]/.test(oneSrc)
     && !/['"]\/?\.?\/?cheat-ramanujan\.jpg['"]/.test(oneSrc),
     'every cheat sheet is held inside');

  ok('it never reached for anything on the web',
     wanted.length === 0, wanted.slice(0, 3).join(' | ') || 'no network requests at all');

  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5 }); } catch (e) {}
  try { fs.rmSync(alone, { recursive: true, force: true, maxRetries: 5 }); } catch (e) {}

  /* ---- the editable copy, played from the bundle folder itself ----
     WORKFLOW.md tells Raja he can open the edit copy in Chrome from this folder
     and everything works "as long as the loose pictures are in that folder".
     That sentence is a promise, so it gets tested rather than asserted. */
  const eFile = 'file:///' + path.join(DIR, EDIT).split(path.sep).join('/');
  const prof2 = path.join(__dirname, '_cpbundle2');
  try { fs.rmSync(prof2, { recursive: true, force: true, maxRetries: 5 }); } catch (e) {}
  const ch2 = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + (PORT + 1), '--user-data-dir=' + prof2,
     '--window-size=390,844', eFile], { stdio: 'ignore' });
  let t2 = null;
  for (let i = 0; i < 100 && !t2; i++) { await sleep(300);
    try { t2 = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT + 1}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  if (t2) {
    const w2 = new WebSocket(t2.webSocketDebuggerUrl);
    await new Promise(r => w2.addEventListener('open', r));
    let i2 = 0; const p2 = new Map();
    w2.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && p2.has(m.id)) { p2.get(m.id)(m); p2.delete(m.id); } });
    const s2 = (mm, p) => new Promise(res => { const i = ++i2; p2.set(i, res); w2.send(JSON.stringify({ id: i, method: mm, params: p })); });
    const e2 = async x => (await s2('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
    const wf2 = async (x, ms = 15000) => { const end = Date.now() + ms;
      while (Date.now() < end) { if (await e2(x)) return true; await sleep(200); } return false; };
    await s2('Runtime.enable');
    await s2('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await wf2(`!!document.querySelector('.splashPlay')`);
    await e2(`document.querySelector('.splashPlay').click()`);
    await wf2(`!!document.querySelector('.toggleBtn[data-size="3x3"]')`);
    await e2(`document.querySelector('.toggleBtn[data-size="3x3"]').click()`);
    const played = await wf2(`!!document.querySelector('[data-screen="scPlay"].on')`);
    await e2(`document.getElementById('barLearn').click()`);
    await wf2(`!!document.querySelector('.rowBtn[data-learn="sheet"]')`, 6000);
    await e2(`document.querySelector('.rowBtn[data-learn="sheet"]').click()`);
    const sheet = await wf2(`(function(){ var i = document.getElementById('cheatImg');
      return !!i && i.complete && i.naturalWidth > 0; })()`, 8000);
    ok('the editable copy plays from this folder, using the loose pictures beside it',
       played && sheet, `puzzle opened: ${played}, formula sheet drew: ${sheet}`);
    w2.close(); ch2.kill(); await sleep(300);
  } else { ok('the editable copy plays from this folder', false, 'Chrome never opened it'); ch2.kill(); }
  try { fs.rmSync(prof2, { recursive: true, force: true, maxRetries: 5 }); } catch (e) {}

  /* ---- the papers have to render, not just exist ----
     They are read in Markor on a phone. Markor is strict about two things that
     are easy to get wrong by hand: a table whose rows do not all have the same
     number of columns renders as raw pipes, and an unclosed ``` fence swallows
     the rest of the page. A link to a file that is not here is just a dead end. */
  const docs = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
  ok('the guides are all present', docs.length >= 7, docs.join(', '));
  for (const d of docs) {
    const text = fs.readFileSync(path.join(DIR, d), 'utf8');
    const lines = text.split(/\r?\n/);
    const problems = [];

    if ((text.match(/^```/gm) || []).length % 2 !== 0) problems.push('unclosed ``` fence');

    /* every table: the row under the header must be the dashes, and every row
       must have the same number of columns as its header */
    for (let i = 0; i < lines.length; i++) {
      const cols = l => l.trim().replace(/^\||\|$/g, '').split('|').length;
      if (!/^\s*\|/.test(lines[i])) continue;
      if (!/^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1] || '')) continue;   // not a header
      const want = cols(lines[i]);
      if (cols(lines[i + 1]) !== want) problems.push(`line ${i + 2}: divider has ${cols(lines[i + 1])} columns, header has ${want}`);
      for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++)
        if (cols(lines[j]) !== want) problems.push(`line ${j + 1}: row has ${cols(lines[j])} columns, header has ${want}`);
    }

    for (const m of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|#|mailto:)/.test(target)) continue;
      if (!fs.existsSync(path.join(DIR, target))) problems.push('link to missing file: ' + target);
    }

    ok(d + ' renders cleanly', problems.length === 0, problems.slice(0, 2).join('; ') || `${lines.length} lines`);
  }
  console.log(fail ? `\n${fail} FAILURES` : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
