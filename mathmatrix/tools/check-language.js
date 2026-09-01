/* English / தமிழ், for the Pallanguzhi family only — both the 2-player board
   and the 4-player one, one shared LANG switch between them.

   The first version of this switched the WHOLE app. Raja looked at the
   screenshots and settled it: "understand change entire app to Tamil is possible
   to collapse the UI decoration. Instead can make Pallanguzhi only, that too
   toggle option inside puzzle table only." He was right, and it had already
   shown up in measurements — in Tamil the nine-puzzle ladder stopped fitting one
   screen and a chip was cut 11px short.

   So the guarantee has INVERTED, and that is what this checks. It is no longer
   "how much of the app is Tamil" but:

     1. Pallanguzhi is COMPLETELY Tamil — labels and the running sentences both,
        since most of what this board says is assembled as it is said. This now
        holds for BOTH boards, not just the 2-player one — Raja: "keep the tabs
        what are in two players existing game have such translation."
     2. NOTHING ELSE CHANGES. A toggle that leaked into the puzzle list would
        bring back exactly the collapse he rejected, and it would do it quietly.
     3. The switch works BOTH ways, and nothing on either board is cut off in
        either, and toggling from EITHER board's own button moves both. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9984;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, process.env.MM_TARGET || 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };
const TAMIL = /[\u0B80-\u0BFF]/;

(async () => {
  const tmp = path.join(__dirname, '_cplang');
  /* Windows keeps a lock on a Chrome profile for a moment after the browser
     exits, so deleting it can throw EPERM -- which killed the whole run before
     a single thing was checked, and read as this guard failing. Every other
     check in this folder swallows it; this one did not. */
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch(e){}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
     '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp,
     '--window-size=360,800', FILE], { stdio: 'ignore' });
  await require('./quiet-audio').early(PORT);
  let t = null;
  for (let i = 0; i < 100 && !t; i++){ await sleep(280);
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
  /* Nothing here tests audio, but music defaults ON and the splash click
     builds `new Audio('bgm-monkeys.mp3')` with preload='auto'. Over an http
     target that is a real 470KB download, once per guard. */
  await require('./quiet-audio')(ws, send);
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
      /* The PUZZLE CARDS only. This used to fingerprint the whole
         .difficultyBar, which also carries the Install and Share chips -- and
         the install chip relabels itself from "Install App" to "How to Install"
         once the browser settles whether it can offer a prompt. That happens on
         its own schedule, so the snapshot changed for a reason having nothing to
         do with language, and this assertion failed calling it a leak. Its name
         says puzzle list; now it reads the puzzle list. */
      list: Array.prototype.map.call(document.querySelectorAll('.difficultyBar .modeGroup'),
              function(g){ return g.textContent.replace(/\\s+/g,' ').trim(); }).join(' | ').slice(0, 400),
      sana: (document.querySelector('.sanaBub') || {}).textContent || ''
    }); })()`).then(JSON.parse);
  const beforeSwitch = await outside();

  await ev(`window.__palClearSave && window.__palClearSave()`);   // force fresh -- see beta-217 comment above
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
    out.turn = (document.getElementById('palChoose') || {}).textContent || '';
    out.count = document.getElementById('palOnBoard').textContent.trim();
    out.store = document.querySelector('.palStoreCap').textContent.trim();
    out.name = document.getElementById('palName1').getAttribute('placeholder');
    out.btn = document.getElementById('langBtn').textContent.trim();
    out.btnLabel2p = document.getElementById('palRules').textContent.trim();
    return JSON.stringify(out); })()`).then(JSON.parse);

  ok('the button switches to Tamil', TAMIL.test(board.btn), board.btn);
  ok('the live sentence is Tamil, not just the labels', TAMIL.test(board.say) && !/[A-Za-z]{3}/.test(board.say),
    JSON.stringify(board.say.slice(0, 60)));
  ok('the choose-player bar is Tamil', TAMIL.test(board.turn), JSON.stringify(board.turn.slice(0, 50)));
  ok('the seed count is Tamil', TAMIL.test(board.count), JSON.stringify(board.count));
  ok('the store label is Tamil', TAMIL.test(board.store), JSON.stringify(board.store));
  ok('the empty name box prompts in Tamil', TAMIL.test(board.name), JSON.stringify(board.name));
  ok('no English is left anywhere on the board',
    board.untranslated.length === 0,
    board.untranslated.length ? board.untranslated.join(' | ') : 'none');

  /* 2B. THE 4-PLAYER BOARD — same guarantee, same mechanism (one shared LANG,
         walked over #pal4Panel too now). LANG is already 'ta' from above, so
         opening the board fresh should show Tamil immediately — including
         the top-bar LOGIC button, which used to show stale content from
         whichever board opened last until the opener was taught to
         pre-populate it, same as the 2-player one already does. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(800);
  const board4 = await ev(`(function(){
    var out = { untranslated: [], total: 0 };
    var w = document.createTreeWalker(document.getElementById('pal4Panel'), NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())){
      var p = n.parentElement; if (!p) continue;
      if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE') continue;
      var s = n.nodeValue.replace(/\\s+/g,' ').trim();
      if (!s || /^[A-D]$/.test(s)) continue;   // the tick-box letters themselves, not English words
      // SaNa is a proper name, kept untranslated everywhere in the app —
      // not "English left behind" the way a sentence or label would be
      var stripped = s.replace(/SaNa/g, '');
      if (!/[A-Za-z]{2}/.test(stripped)) continue;
      out.untranslated.push(s.slice(0, 40));
    }
    out.say = document.getElementById('pal4Say').textContent.trim();
    out.roundChip = document.getElementById('pal4RoundChip').textContent.trim();
    out.select = document.querySelector('.pal4SelectLabel').textContent.trim();
    out.choose = document.getElementById('pal4Choose').textContent.trim();
    out.onBoard = document.getElementById('pal4OnBoard').textContent.trim();
    out.store = document.querySelector('.pal4CardStoreCap').textContent.trim();
    out.name = document.querySelector('#pal4CardA .pal4CardName').getAttribute('placeholder');
    out.newBtn = document.getElementById('pal4New').textContent.trim();
    out.rulesBtn = document.getElementById('pal4Rules').textContent.trim();
    out.btn = document.getElementById('pal4LangBtn').textContent.trim();
    out.logicBox = document.getElementById('logicBox').textContent.trim().slice(0, 60);
    return JSON.stringify(out); })()`).then(JSON.parse);

  ok('the 4-player button reads Tamil too', TAMIL.test(board4.btn), board4.btn);
  ok('the 4-player intro line is Tamil', TAMIL.test(board4.say) && !/[A-Za-z]{3}/.test(board4.say.replace(/SaNa/g, '')),
    JSON.stringify(board4.say.slice(0, 50)));
  // Raja: "ring order is not much need to know... it was just information
  // — replace this tab to Live Round." The chip below Choose Player is now
  // informational (round number, not a button); its old ring-order
  // explanation moved into How to play instead — check both.
  ok('the live-round chip reads in Tamil', TAMIL.test(board4.roundChip), board4.roundChip);
  await ev(`document.getElementById('pal4Rules').click()`); await sleep(300);
  const howToText = await ev(`document.getElementById('logicBox').textContent.trim()`);
  /* The ring turned ANTI-CLOCKWISE to match the 2-player board (Raja: "in 2
     player it is anti-clockwise which is the normal order, but in 4 player it
     is opposite"), so this now checks the Tamil describes the CORRECT way
     round -- down the LEFT into D -- not merely that some ring sentence is
     present. A direction flip that left the instructions describing the old
     path would be exactly the kind of quiet contradiction worth catching. */
  ok('How to play folds in the ring order, in Tamil, describing the anti-clockwise path',
    TAMIL.test(howToText) && howToText.indexOf('இடப் பக்கமாக இறங்கி D') > -1,
    JSON.stringify(howToText.slice(0, 120)));
  ok('the "Players:" tick-row label is Tamil', TAMIL.test(board4.select), board4.select);
  ok('the choose-player bar is Tamil, with the live name substituted in', TAMIL.test(board4.choose), board4.choose);
  ok('the seed-reserve stat is Tamil', TAMIL.test(board4.onBoard), board4.onBoard);
  ok('the card STORE label is Tamil', TAMIL.test(board4.store), board4.store);
  ok('an empty card box prompts in Tamil', TAMIL.test(board4.name), board4.name);
  ok('New game reuses the same Tamil as the 2-player board', TAMIL.test(board4.newBtn), board4.newBtn);
  // Raja: "remove how this differ replace it with how to play... both
  // english and tamil" — the button now reuses the 2-player board's exact
  // own label/key, so this also confirms the two literally match, not just
  // that both happen to be Tamil.
  ok('the rules button reads "How to play", reusing the 2-player board\'s own label exactly',
    board4.rulesBtn === board.btnLabel2p, board4.rulesBtn + ' vs 2-player’s ' + JSON.stringify(board.btnLabel2p));
  ok('no English is left anywhere on the 4-player board',
    board4.untranslated.length === 0,
    board4.untranslated.length ? board4.untranslated.join(' | ') : 'none');
  // "how this differs" became "how to play" once the rules pass shipped —
  // the button/popup content changed on purpose (beta content-changelog),
  // so the keyword this checks for changed with it, not the assertion's intent
  ok('the top-bar LOGIC button is pre-loaded with the 4-player sheet, in Tamil, on open — not stale content from whichever board opened last',
    TAMIL.test(board4.logicBox) && board4.logicBox.indexOf('விளையாடுவது') > -1, JSON.stringify(board4.logicBox));

  /* 3. NOTHING ELSE MOVED. The whole point of narrowing the feature. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(800);
  const after = await outside();
  ok('the tab bar is untouched', after.tabs === beforeSwitch.tabs, JSON.stringify(after.tabs));
  ok('the puzzle list is untouched and still English',
    after.list === beforeSwitch.list && !TAMIL.test(after.list),
    after.list === beforeSwitch.list ? 'identical to before the switch'
      : 'CHANGED  before[' + beforeSwitch.list.slice(0, 200) +
        ']  after[' + after.list.slice(0, 200) + ']');
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
  await ev(`window.__palClearSave && window.__palClearSave()`);   // force fresh -- see beta-217 comment above
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

  /* 4B. THE 4-PLAYER BOARD IN TAMIL — same two risks as the 2-player board:
         text cut off, and — its own version of the "player strip" bug — a
         card's name or store spilling out of the tight 76px well it lives
         in, the exact class of bug the containment check in
         check-pallanguzhi-4p.js exists for, run here under Tamil specifically
         since Tamil is the longer text that would actually trigger it. */
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(300);
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(800);
  const cut4 = JSON.parse(await ev(`(function(){
    var bad = [];
    document.querySelectorAll('#pal4Panel *').forEach(function(el){
      if (!el.offsetParent || el.children.length) return;
      var s = (el.textContent || '').trim(); if (!s) return;
      var cs = getComputedStyle(el);
      var wOver = el.scrollWidth - el.clientWidth, hOver = el.scrollHeight - el.clientHeight;
      var ell = cs.textOverflow === 'ellipsis';
      if ((wOver > 1 && (cs.overflowX !== 'visible' || ell)) ||
          (hOver > 1 && (cs.overflowY !== 'visible' || ell))) bad.push(s.slice(0,28));
    });
    return JSON.stringify(bad.slice(0,6)); })()`));
  ok('nothing on the Tamil 4-player board is cut off', cut4.length === 0, cut4.length ? cut4.join(' | ') : 'every label fits');
  const contained4 = JSON.parse(await ev(`(function(){
    var well = document.querySelector('.pal4Well').getBoundingClientRect();
    var bad = [];
    document.querySelectorAll('.pal4Card, .pal4CardName, .pal4CardStore, .pal4SanaMid').forEach(function(el){
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.left < well.left - 2 || r.right > well.right + 2 || r.top < well.top - 2 || r.bottom > well.bottom + 2)
        bad.push((el.className.split(' ')[0] || el.tagName));
    });
    return JSON.stringify(bad); })()`));
  ok('in Tamil, every card and its leaf elements still stay inside the well',
    contained4.length === 0, contained4.length ? contained4.join(' | ') : 'all contained');
  // #pal4Panel scrolls by design (overflow-y:auto, unlike palPanel) — the
  // guarantee is reachable, not visible-without-scrolling; see the matching
  // comment in check-pallanguzhi-4p.js's own tightest-phone check.
  const fits4 = await ev(`(function(){
    var panel = document.getElementById('pal4Panel');
    panel.scrollTop = panel.scrollHeight;
    var f = document.querySelector('.pal4Foot').getBoundingClientRect().bottom;
    var b = document.querySelector('.tabBar').getBoundingClientRect().top;
    return Math.round(f) + ' vs ' + Math.round(b) + (f <= b + 1 ? ' reachable' : ' UNREACHABLE'); })()`);
  ok('in Tamil, the 4-player foot row is reachable by scrolling', / reachable$/.test(fits4), fits4);

  /* Raja: "are you ensured and verified your self the correction of text
     font size increase change should not over ride or that cause existing
     any tab or usage area should not Miss out in with in screen." The
     first attempt at pal4Say's Tamil size passed every existing check
     (no self-overflow, no scroll-budget breach) while quietly pushing the
     tick-box row and Choose Player button below the fold in exactly this
     language, at exactly this size — the combination that actually
     surfaced it. Kept permanent so a future translation or size change
     can't reintroduce the same gap. */
  await ev(`(function(){ document.getElementById('pal4Panel').scrollTop = 0; })()`);
  const onOpen4 = await ev(`(function(){
    var tabBar = document.querySelector('.tabBar').getBoundingClientRect();
    var select = document.querySelector('.pal4Select').getBoundingClientRect();
    var choose = document.querySelector('.pal4Choose').getBoundingClientRect();
    return JSON.stringify({
      selectVisible: select.bottom <= tabBar.top + 1 && select.top >= 0,
      chooseVisible: choose.bottom <= tabBar.top + 1 && choose.top >= 0,
      selectBottom: Math.round(select.bottom), chooseBottom: Math.round(choose.bottom),
      tabBarTop: Math.round(tabBar.top) }); })()`).then(JSON.parse);
  ok('in Tamil at 360x800, the tick-box row is visible the moment the screen opens — no scroll needed',
    onOpen4.selectVisible, 'select bottom ' + onOpen4.selectBottom + ' vs tab bar ' + onOpen4.tabBarTop);
  ok('and so is Choose Player', onOpen4.chooseVisible, 'choose bottom ' + onOpen4.chooseBottom + ' vs tab bar ' + onOpen4.tabBarTop);

  /* Raja: "reduce the tab and font size it's too big keep it all in single
     row." Tamil is the language most likely to force a wrap first — longer
     words ("வீரர்கள்:", "A"/"B"/"C"/"D" chip padding aside) push the row's
     content width further than English does at the same size. Checked
     across the realistic phone width range, same as the English version
     in check-pallanguzhi-4p.js. */
  for (const w of [340, 360, 375, 390, 412]){
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(150);
    await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
    await ev(`document.getElementById('pal4Tab').click()`); await sleep(500);
    /* Scoped to #pal4Select on purpose. Thayam reuses .pal4Tick for its own
       Players and Seeds rows, and an unscoped query also collected those --
       hidden, so they report top:0, so "all on one line" was false and this
       assertion failed for five builds while Pallanguzhi's row was perfectly
       fine. A test about THIS row must measure only this row. */
    const row = await ev(`(function(){
      var tops = Array.from(document.querySelectorAll('#pal4Select .pal4Tick')).map(function(c){ return Math.round(c.getBoundingClientRect().top); });
      return JSON.stringify({ singleRow: new Set(tops).size === 1, tops: tops }); })()`).then(JSON.parse);
    ok('in Tamil at ' + w + 'px, all four tick boxes stay on one line', row.singleRow, JSON.stringify(row.tops));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });

  /* 5. Back to English — the direction nobody tests, and the one where a child
        left in a script they cannot read has no way out. */
  await ev(`window.__mmLang('en')`); await sleep(800);
  const back = await ev(`(function(){
    var p = document.getElementById('palPanel');
    var p4 = document.getElementById('pal4Panel');
    return JSON.stringify({
      tamilLeft: /[\\u0B80-\\u0BFF]/.test(p.textContent),
      tamilLeft4: /[\\u0B80-\\u0BFF]/.test(p4.textContent),
      say: document.getElementById('palSay').textContent.trim().slice(0,40),
      say4: document.getElementById('pal4Say').textContent.trim().slice(0,40),
      choose4: document.getElementById('pal4Choose').textContent.trim(),
      onBoard4: document.getElementById('pal4OnBoard').textContent.trim(),
      btn: document.getElementById('langBtn').textContent.trim(),
      btn4: document.getElementById('pal4LangBtn').textContent.trim()
    }); })()`).then(JSON.parse);
  ok('switching back to English leaves no Tamil behind on the 2-player board', !back.tamilLeft,
    'say line now: ' + JSON.stringify(back.say));
  ok('and none on the 4-player board either', !back.tamilLeft4,
    'say line now: ' + JSON.stringify(back.say4));
  ok('the 4-player choose-player bar and reserve stat both flip back to English too',
    !TAMIL.test(back.choose4) && !TAMIL.test(back.onBoard4),
    back.choose4 + ' | ' + back.onBoard4);
  ok('and the button says English again', /English/.test(back.btn), back.btn);
  ok('both language buttons agree — toggling either one moves both boards',
    /English/.test(back.btn4), back.btn4);

  /* THE N-PLAYER MESSAGE KEYS — dealWaitingMulti, starts, and the rest are
     genuinely NEW additions for the rules pass ("go through for
     integration of code for same as existing 2 player game rules and
     procedures"), not reused 2-player strings, so their Tamil branch has
     never actually been exercised until now. */
  await ev(`window.__mmLang('ta')`); await sleep(400);
  await ev(`document.getElementById('tab-scHome').click()`); await sleep(200);
  await ev(`window.__pal4ClearSave && window.__pal4ClearSave()`);   // force fresh -- see beta-217 comment above
  await ev(`document.getElementById('pal4Tab').click()`); await sleep(700);   // __pal4New(), fresh Tamil board
  const dealtOne = await ev(`(function(){
    document.querySelector('#pal4CardA .pal4CardStore').click();
    return null; })()`);
  await sleep(2100);
  const waitingLine = await ev(`document.getElementById('pal4Say').innerHTML`);
  ok('dealing one of several sides shows the multi-player "waiting on" line, in Tamil',
    TAMIL.test(waitingLine) && !/[A-Za-z]{3}/.test(waitingLine.replace(/SaNa/g, '')), waitingLine);
  await ev(`document.querySelector('#pal4CardB .pal4CardStore').click()`); await sleep(2100);
  await ev(`document.querySelector('#pal4CardC .pal4CardStore').click()`); await sleep(2100);
  await ev(`document.querySelector('#pal4CardD .pal4CardStore').click()`); await sleep(2100);
  const startsLine = await ev(`document.getElementById('pal4Say').innerHTML`);
  ok('once everyone has dealt, the "starts" line reads in Tamil too', TAMIL.test(startsLine), startsLine);
  await ev(`window.__mmLang('en')`); await sleep(300);   // leave the suite back in English, same as every other section here

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();

/* Same reason as in check-pallanguzhi.js: wait for the board to be dealt rather
   than for a number of milliseconds that was only ever a guess. */
async function palReady(ev, sleep){
  // the board is dealt by the players now — tap each store, as they would
  for (let i = 0; i < 240; i++){
    const st = await ev('window.__palState ? JSON.stringify(window.__palState()) : ""');
    if (st){
      const s = JSON.parse(st);
      if (s.playing && !s.busy) return true;
      if (!s.busy && s.dealt){
        const p = !s.dealt[0] ? 1 : (!s.dealt[1] ? 2 : 0);
        if (p) await ev("document.querySelector('#palSide" + p + " .palStore').click()");
      }
    }
    await sleep(60);
  }
  return false;
}
