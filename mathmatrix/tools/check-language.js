/* English / தமிழ் toggle.

   The app holds roughly 5,900 words a player can read, so this is being
   translated in slices and will be part-English for a while. That is fine as
   long as the gap is a NUMBER WE WATCH rather than something discovered on a
   screenshot — so the headline output here is COVERAGE per screen: of the
   English strings visible on that screen, how many actually turn into Tamil.

   Two failures matter more than coverage, and both are asserted:

   1. THE SWITCH MUST GO BOTH WAYS. Swapping text in place is easy to get wrong
      in the direction nobody tests — back to English — and a child left stuck
      in a language they cannot read has no way out.

   2. TAMIL MUST STILL FIT. Every layout in this app is measured-to-fit and
      Tamil words are longer and taller than their English counterparts. The
      puzzle list sizes itself by measurement, so switching language without
      re-measuring either overflows the screen or wastes the space. Checked the
      way the tab bar and board checks do it: against the tab bar, not the
      viewport. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9984;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

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

  ok('the language toggle sits with the sound settings',
    await ev(`(function(){ var l = document.getElementById('langBtn'), s = document.getElementById('soundBtn');
      return !!(l && s && l.parentElement === s.parentElement); })()`));
  const label = await ev(`document.getElementById('langBtn').textContent`);
  ok('and says which language is on', /English/.test(label), JSON.stringify(label));

  /* Coverage: count what a Tamil reader would still be reading in English. Any
     text with two or more Latin letters left after switching is untranslated —
     numbers, ×, · and emoji need no translation and are not counted. */
  const coverage = async () => JSON.parse(await ev(`(function(){
    var areas = { 'tab bar':'.tabBar', 'puzzle list':'.difficultyBar', 'Pallanguzhi':'#palPanel' };
    var out = {};
    Object.keys(areas).forEach(function(k){
      var total = 0, latin = 0, samples = [];
      document.querySelectorAll(areas[k]).forEach(function(root){
        var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
        while ((n = w.nextNode())){
          var p = n.parentElement; if (!p) continue;
          if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE') continue;
          var s = n.nodeValue.replace(/\\s+/g,' ').trim();
          if (!s) continue;
          var en = n.__key;
          if (!en) continue;                     // never had English in it
          total++;
          if (/[A-Za-z]{2}/.test(s)){ latin++; if (samples.length < 3) samples.push(s.slice(0, 34)); }
        }
      });
      out[k] = { total: total, untranslated: latin, samples: samples };
    });
    return JSON.stringify(out); })()`));

  await ev(`window.__mmLang('ta')`); await sleep(700);
  const taLabel = await ev(`document.getElementById('langBtn').textContent`);
  ok('switching to Tamil relabels the button in Tamil', /தமிழ்/.test(taLabel), JSON.stringify(taLabel));

  const cov = await coverage();
  console.log('\n   coverage with Tamil on:');
  Object.keys(cov).forEach(k => {
    const c = cov[k];
    const done = c.total - c.untranslated;
    const pct = c.total ? Math.round(done / c.total * 100) : 100;
    console.log('     ' + String(pct).padStart(3) + '%  ' + k + '  (' + done + ' of ' + c.total + ' strings)' +
      (c.samples.length ? '   still English: ' + c.samples.join(' | ') : ''));
  });
  ok('the tab bar is fully Tamil', cov['tab bar'].untranslated === 0,
    cov['tab bar'].untranslated + ' left in English');
  /* The puzzle list is the slice that was promised, so it is held to a real
     number rather than "some of it". Names like Sudoku and 3³ stay Latin by
     design, so this is not 100%. */
  const listPct = Math.round((cov['puzzle list'].total - cov['puzzle list'].untranslated) / cov['puzzle list'].total * 100);
  ok('the puzzle list is at least 85% Tamil', listPct >= 85,
    listPct + '% of ' + cov['puzzle list'].total + ' strings');

  /* Does Tamil still fit? The list measures itself, and Tamil is bigger. */
  const fit = await ev(`(function(){
    var bar = document.querySelector('.tabBar').getBoundingClientRect();
    var list = document.querySelector('.difficultyBar');
    var over = 0, worst = '';
    list.querySelectorAll('.lvCard').forEach(function(c){
      if (c.scrollHeight > c.clientHeight + 2){ over++; if (!worst) worst = c.textContent.trim().slice(0,28); }
    });
    return JSON.stringify({
      listBottom: Math.round(list.getBoundingClientRect().bottom),
      barTop: Math.round(bar.top),
      clipped: over, worst: worst,
      scale: getComputedStyle(list).getPropertyValue('--lvScale').trim()
    }); })()`).then(JSON.parse);
  ok('no puzzle card clips its own Tamil text', fit.clipped === 0,
    fit.clipped ? fit.clipped + ' clipped, e.g. "' + fit.worst + '"' : 'none clipped, scale ' + fit.scale);
  ok('the list still stops above the tab bar', fit.listBottom <= fit.barTop + 1,
    'list ends ' + fit.listBottom + ', bar starts ' + fit.barTop);

  /* TRUNCATION, anywhere. Checking .lvCard heights alone passed while the
     "plays with no internet" chip was visibly cut to "இணையம் இல்லாமல்
     விளையாட…" — a different element, cut on a different axis. Tamil is wider
     than English, so anything with a fixed width or an ellipsis is a candidate,
     and the honest test is to ask every element whether its own text fits
     inside it. */
  const cut = JSON.parse(await ev(`(function(){
    var bad = [];
    document.querySelectorAll('.difficultyBar *, .tabBar *, .palSide *, .palFoot *').forEach(function(el){
      if (!el.offsetParent) return;
      var kids = el.children.length;
      if (kids) return;                      // only leaves hold text
      var s = (el.textContent || '').trim();
      if (!s) return;
      var wOver = el.scrollWidth - el.clientWidth;
      var hOver = el.scrollHeight - el.clientHeight;
      var cs = getComputedStyle(el);
      var ell = cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none';
      if ((wOver > 1 && (cs.overflowX !== 'visible' || ell)) ||
          (hOver > 1 && (cs.overflowY !== 'visible' || ell))){
        bad.push(s.slice(0, 30) + ' [' + (wOver > 1 ? 'w+' + wOver : '') + (hOver > 1 ? ' h+' + hOver : '') + ']');
      }
    });
    return JSON.stringify(bad.slice(0, 6)); })()`));
  ok('nothing on the list or tab bar is cut off in Tamil', cut.length === 0,
    cut.length ? cut.join('  |  ') : 'every label fits its own box');

  /* How much taller did Tamil make the list? Not a pass or fail — the list has
     always been scrollable — but a number worth stating, because in English the
     whole ladder fits one screen and a child can see Pallanguzhi without
     knowing to scroll. */
  const grew = await ev(`(function(){
    var d = document.querySelector('.difficultyBar');
    return Math.max(0, d.scrollHeight - d.clientHeight); })()`);
  console.log('   Tamil list overflows its screen by ' + grew + 'px' +
    (grew ? '  (English fits with room to spare)' : ''));

  /* Back to English — the direction nobody tests. */
  await ev(`window.__mmLang('en')`); await sleep(700);
  const back = await ev(`(function(){
    var t = document.getElementById('tab-scHome').textContent;
    var h = document.querySelector('.difficultyBar').textContent;
    return JSON.stringify({ tab: t.replace(/[^A-Za-z ]/g,'').trim(),
      tamilLeft: /[\\u0B80-\\u0BFF]/.test(h) }); })()`).then(JSON.parse);
  ok('switching back to English restores it completely',
    back.tab === 'Puzzles' && !back.tamilLeft,
    'tab reads "' + back.tab + '", Tamil left on the list: ' + back.tamilLeft);

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
