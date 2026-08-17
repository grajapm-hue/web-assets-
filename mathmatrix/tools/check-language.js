/* English / தமிழ், for Pallanguzhi only.

   The first version of this switched the WHOLE app. Raja looked at the
   screenshots and settled it: "understand change entire app to Tamil is possible
   to collapse the UI decoration. Instead can make Pallanguzhi only, that too
   toggle option inside puzzle table only." He was right, and it had already
   shown up in measurements — in Tamil the nine-puzzle ladder stopped fitting one
   screen and a chip was cut 11px short.

   So the guarantee has INVERTED, and that is what this checks. It is no longer
   "how much of the app is Tamil" but:

     1. Pallanguzhi is COMPLETELY Tamil — labels and the running sentences both,
        since most of what this board says is assembled as it is said.
     2. NOTHING ELSE CHANGES. A toggle that leaked into the puzzle list would
        bring back exactly the collapse he rejected, and it would do it quietly.
     3. The switch works BOTH ways, and nothing on the board is cut off in
        either. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9984;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };
const TAMIL = /[\u0B80-\u0BFF]/;

(async () => {
  const tmp = path.join(__dirname, '_cplang');
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp,
     '--window-size=360,800', FILE], { stdio: 'ignore' });
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
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
  await sleep(1700);
  await ev(`(document.querySelector('.splashPlay')||{click(){}}).click()`); await sleep(1000);

  /* Take a fingerprint of the rest of the app BEFORE any switching, so the
     "nothing else changed" claim is a comparison and not an opinion. */
  const outside = () => ev(`(function(){
    return JSON.stringify({
      tabs: document.querySelector('.tabBar').textContent.replace(/\\s+/g,' ').trim(),
      list: document.querySelector('.difficultyBar').textContent.replace(/\\s+/g,' ').trim().slice(0, 400),
      sana: (document.querySelector('.sanaBub') || {}).textContent || ''
    }); })()`).then(JSON.parse);
  const beforeSwitch = await outside();

  await ev(`document.getElementById('palTab').click()`); await palReady(ev, sleep);

  /* 1. The toggle lives ON THE BOARD. It began beside Sound and Music, which was
        right for an app-wide switch and wrong for one that changes a single
        game — a control in global settings that only affects one puzzle is a
        promise the app does not keep. */
  const where = await ev(`(function(){
    var b = document.getElementById('langBtn');
    if (!b) return 'missing';
    if (!b.offsetParent) return 'present but not visible';
    var foot = b.closest('.palFoot');
    var settings = document.getElementById('soundBtn');
    if (settings && settings.parentElement === b.parentElement) return 'in the app settings row';
    return foot ? 'on the Pallanguzhi board' : 'somewhere else';
  })()`);
  ok('the toggle sits on the Pallanguzhi board, not in app settings',
    where === 'on the Pallanguzhi board', where);
  ok('and reads as English to start with', /English/.test(await ev(`document.getElementById('langBtn').textContent`)));

  /* 2. Everything the board says, in Tamil — including the live sentence, which
        is assembled at the moment it is said and so cannot be swapped from a
        table of finished strings. */
  await ev(`window.__mmLang('ta')`); await sleep(800);
  const board = await ev(`(function(){
    var out = { untranslated: [], total: 0 };
    var w = document.createTreeWalker(document.getElementById('palPanel'), NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())){
      var p = n.parentElement; if (!p) continue;
      if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE') continue;
      var s = n.nodeValue.replace(/\\s+/g,' ').trim();
      if (!s || !/[A-Za-z]{2}/.test(s)) continue;
      out.untranslated.push(s.slice(0, 40));
    }
    out.say = document.getElementById('palSay').textContent.trim();
    out.turn = (document.querySelector('.palSide.turn .palTurn') || {}).textContent || '';
    out.count = document.getElementById('palOnBoard').textContent.trim();
    out.store = document.querySelector('.palStoreCap').textContent.trim();
    out.name = document.getElementById('palName1').getAttribute('placeholder');
    out.btn = document.getElementById('langBtn').textContent.trim();
    return JSON.stringify(out); })()`).then(JSON.parse);

  ok('the button switches to Tamil', TAMIL.test(board.btn), board.btn);
  ok('the live sentence is Tamil, not just the labels', TAMIL.test(board.say) && !/[A-Za-z]{3}/.test(board.say),
    JSON.stringify(board.say.slice(0, 60)));
  ok('the turn tab is Tamil', TAMIL.test(board.turn), JSON.stringify(board.turn.slice(0, 50)));
  ok('the seed count is Tamil', TAMIL.test(board.count), JSON.stringify(board.count));
  ok('the store label is Tamil', TAMIL.test(board.store), JSON.stringify(board.store));
  ok('the empty name box prompts in Tamil', TAMIL.test(board.name), JSON.stringify(board.name));
  ok('no English is left anywhere on the board',
    board.untranslated.length === 0,
    board.untranslated.length ? board.untranslated.join(' | ') : 'none');

  /* 3. NOTHING ELSE MOVED. The whole point of narrowing the feature. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(800);
  const after = await outside();
  ok('the tab bar is untouched', after.tabs === beforeSwitch.tabs, JSON.stringify(after.tabs));
  ok('the puzzle list is untouched and still English',
    after.list === beforeSwitch.list && !TAMIL.test(after.list),
    after.list === beforeSwitch.list ? 'identical to before the switch' : 'CHANGED');
  /* The mascot was the one thing that could plausibly carry Tamil off the board,
     since it sits above every screen and speaks the game's commentary — "a new
     board, Player 1 starts". It turns out leaving the game gives it its own
     English line back, so no Tamil follows the player out at all. Worth pinning:
     the mascot is the only route by which a Tamil sentence could end up over an
     English puzzle list, and it is closed.
     (An earlier version of this compared the line against a snapshot taken
     before the game was opened, and failed because the line had changed for the
     honest reason that a game had been played.) */
  ok('no Tamil follows the player off the board, not even on the mascot',
    !TAMIL.test(after.sana), JSON.stringify(after.sana.trim().slice(0, 50)));

  /* 4. Nothing on the Tamil board is cut off — Tamil runs longer than English
        and this board is full of fixed shapes. */
  await ev(`document.getElementById('palTab').click()`); await palReady(ev, sleep);
  const cut = JSON.parse(await ev(`(function(){
    var bad = [];
    document.querySelectorAll('#palPanel *').forEach(function(el){
      if (!el.offsetParent || el.children.length) return;
      var s = (el.textContent || '').trim(); if (!s) return;
      var cs = getComputedStyle(el);
      var wOver = el.scrollWidth - el.clientWidth, hOver = el.scrollHeight - el.clientHeight;
      var ell = cs.textOverflow === 'ellipsis';
      if ((wOver > 1 && (cs.overflowX !== 'visible' || ell)) ||
          (hOver > 1 && (cs.overflowY !== 'visible' || ell))) bad.push(s.slice(0,28));
    });
    return JSON.stringify(bad.slice(0,6)); })()`));
  ok('nothing on the Tamil board is cut off', cut.length === 0, cut.length ? cut.join(' | ') : 'every label fits');

  /* THE PLAYER STRIP MUST STAY ON ONE LINE. Tamil's wider "சேமிப்பு" pushed the
     store chip and the name box past the row and they wrapped — the store
     dropping to a line of its own, each player strip growing by 40px. Nothing
     was truncated and the board still fitted above the tab bar, so every
     assertion passed and only the screenshot showed it. Wrapping is not
     clipping, and needed its own question: are these two things still side by
     side? Their vertical centres answer it. */
  const rows = JSON.parse(await ev(`(function(){
    var out = [];
    [1,2].forEach(function(i){
      var side = document.getElementById('palSide' + i);
      var name = side.querySelector('.palName').getBoundingClientRect();
      var store = side.querySelector('.palStore').getBoundingClientRect();
      out.push({ p:i, gap: Math.round(Math.abs((name.top+name.height/2) - (store.top+store.height/2))),
                 h: Math.round(side.getBoundingClientRect().height) });
    });
    return JSON.stringify(out); })()`));
  rows.forEach(r => ok('Player ' + r.p + '’s name and store stay side by side in Tamil',
    r.gap <= 4, 'centres ' + r.gap + 'px apart, strip ' + r.h + 'px tall'));
  const fits = await ev(`(function(){
    var f = document.querySelector('.palFoot').getBoundingClientRect().bottom;
    var b = document.querySelector('.tabBar').getBoundingClientRect().top;
    return Math.round(f) + ' vs ' + Math.round(b) + (f <= b + 1 ? ' fits' : ' OVERFLOWS'); })()`);
  ok('the Tamil board still fits above the tab bar', / fits$/.test(fits), fits);

  /* 5. Back to English — the direction nobody tests, and the one where a child
        left in a script they cannot read has no way out. */
  await ev(`window.__mmLang('en')`); await sleep(800);
  const back = await ev(`(function(){
    var p = document.getElementById('palPanel');
    return JSON.stringify({
      tamilLeft: /[\\u0B80-\\u0BFF]/.test(p.textContent),
      say: document.getElementById('palSay').textContent.trim().slice(0,40),
      btn: document.getElementById('langBtn').textContent.trim()
    }); })()`).then(JSON.parse);
  ok('switching back to English leaves no Tamil behind', !back.tamilLeft,
    'say line now: ' + JSON.stringify(back.say));
  ok('and the button says English again', /English/.test(back.btn), back.btn);

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();

/* Same reason as in check-pallanguzhi.js: wait for the board to be dealt rather
   than for a number of milliseconds that was only ever a guess. */
async function palReady(ev, sleep){
  for (let i = 0; i < 120; i++){
    const st = await ev('window.__palState ? JSON.stringify(window.__palState()) : ""');
    if (st){ const s = JSON.parse(st); if (s.playing && !s.busy) return true; }
    await sleep(60);
  }
  return false;
}
