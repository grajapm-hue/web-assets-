/* Raja, on the 5-input XNOR room with every input OFF and the answer ON:
   "the hint instructs any odd input output is off, else even inputs are ON --
   if all input is Off how this instruction apply? Verify and ensure it other
   logic gates instructions and play outputs."

   Two questions live in that, with different answers.

   Is the GATE right? Yes, and this proves it exhaustively: every gate, at 2, 3
   and 5 inputs, every row of every truth table, against an implementation
   written HERE from the English rule rather than reused from the app. A test
   that imports the code under test only proves the code equals itself. If the
   rule text and the behaviour ever disagree, one of them is wrong and this
   goes red -- which playing rooms by hand would not reliably find, since a
   wrong row could sit anywhere in 32.

   Is the RULE well written? That is the real complaint, and it was fair. XNOR
   with nothing switched on is ON because zero inputs are ON and zero is even:
   true, and useless to a child who does not count zero as an even number. So
   the parity rules now say what happens when everything is OFF, and that is
   asserted here.

   The short labels are checked for a harder reason -- they were WRONG. "ON
   when different" / "ON when the same" describe TWO inputs, and the card
   carrying them covers the 2, 3 and 5-input levels together. Three inputs all
   ON are all the same, and XNOR gives OFF. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9878;
const ROOT = path.join(__dirname, '..');
const MT = process.env.MM_TARGET || 'beta.html';
const FILE = /^https?:/.test(MT) ? MT : 'file:///' + path.join(ROOT, MT).split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const FROM_THE_WORDS = {
  and:  b => b.every(v => v === 1),                       // ON only when ALL inputs are ON
  or:   b => b.some(v => v === 1),                        // ON when ANY input is ON
  not:  b => b[0] === 0,                                  // flips the input
  nand: b => !b.every(v => v === 1),                      // OFF only when ALL inputs are ON
  nor:  b => !b.some(v => v === 1),                       // ON only when ALL inputs are OFF
  xor:  b => b.filter(v => v === 1).length % 2 === 1,     // ON for an ODD number ON
  xnor: b => b.filter(v => v === 1).length % 2 === 0      // ON for an EVEN number ON
};

(async () => {
  const tmp = path.join(__dirname, '_cpgate');
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
  await sleep(900);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(900);
  await ev(`document.getElementById('gateListBtn').click()`);
  await sleep(900);

  const back  = () => ev(`(function(){ var b=document.getElementById('gateBackBtn'); if(b) b.click(); })()`);
  const gate  = k => ev(`(function(){ var b=document.querySelector('.rowBtn[data-gate="' + ${JSON.stringify('K')}.replace('K','${k}') + '"]:not([data-level])'); if(b) b.click(); })()`);
  const level = (k, i) => ev(`(function(){ var b=document.querySelector('.rowBtn[data-gate="${k}"][data-level="${i}"]'); if(b) b.click(); })()`);

  const gates = await ev(`(function(){
    return JSON.stringify(Array.prototype.map.call(
      document.querySelectorAll('.rowBtn[data-gate]'), function(b){ return b.getAttribute('data-gate'); }));
  })()`).then(JSON.parse);
  ok('all seven gates are listed', gates.length === 7, gates.join(', '));

  let totalRows = 0;
  for (const key of gates){
    if (!FROM_THE_WORDS[key]){ ok(key + ': this test knows its rule', false, 'not encoded'); continue; }
    await back(); await sleep(400);
    await gate(key); await sleep(700);
    /* NOT has a single level, so the app takes you straight into it and never
       draws a level list. Treating "no level buttons" as "no levels" reported
       0 rows checked and called it a failure of the gate -- it was a failure of
       this loop's assumption. One level, entered directly. */
    const levelBtns = await ev(`document.querySelectorAll('.rowBtn[data-gate="${key}"][data-level]').length`);
    const levels = levelBtns || 1;

    let checked = 0; const bad = [], allOff = [];
    for (let li = 0; li < levels; li++){
      if (levelBtns) await level(key, li);
      await sleep(800);
      const d = await ev(`(function(){
        var lb = document.getElementById('logicBox');
        var tb = lb && lb.querySelector('table');
        if (!tb) return '{}';
        var head = [], rows = [];
        tb.querySelectorAll('tr').forEach(function(tr){
          var c = Array.prototype.map.call(tr.children, function(td){ return (td.textContent||'').trim().toUpperCase(); });
          if (!c.length) return;
          if (!head.length && c[c.length-1] === 'OUTPUT'){ head = c; return; }
          if (head.length) rows.push(c);
        });
        return JSON.stringify({ inputs: head.length - 1, rows: rows });
      })()`).then(JSON.parse);

      if (!d.rows || !d.rows.length){ bad.push('level ' + li + ': no truth table on screen'); }
      else {
        for (const row of d.rows){
          const inputs = row.slice(0, d.inputs).map(v => v === 'ON' ? 1 : 0);
          const shown = row[d.inputs] === 'ON';
          const want = !!FROM_THE_WORDS[key](inputs);
          checked++;
          if (shown !== want && bad.length < 3)
            bad.push(d.inputs + '-input [' + row.slice(0, d.inputs).join(',') + '] shows ' +
                     row[d.inputs] + ', the rule says ' + (want ? 'ON' : 'OFF'));
        }
        const zero = d.rows.find(r => r.slice(0, d.inputs).every(v => v === 'OFF'));
        if (zero){
          const want = FROM_THE_WORDS[key](new Array(d.inputs).fill(0)) ? 'ON' : 'OFF';
          allOff.push(d.inputs + ' inputs OFF -> ' + zero[d.inputs] + (zero[d.inputs] === want ? '' : ' WANT ' + want));
        }
      }
      await back(); await sleep(350);
      await gate(key); await sleep(500);
    }
    totalRows += checked;
    ok(key.toUpperCase().padEnd(5) + 'every row of every truth table obeys its stated rule',
       checked > 0 && bad.length === 0,
       bad.length ? bad.join(' | ') : checked + ' rows over ' + levels + ' levels');
    ok(key.toUpperCase().padEnd(5) + 'and the all-OFF row agrees with it',
       allOff.length > 0 && allOff.every(x => x.indexOf('WANT') < 0), allOff.join(' · '));
  }
  ok('a real number of rows was checked, not zero', totalRows >= 100, totalRows + ' rows in total');

  /* Now the wording, which is what Raja actually tripped over. */
  await back(); await sleep(500);
  const words = await ev(`(function(){
    var out = {};
    ['xor','xnor'].forEach(function(k){
      var b = document.querySelector('.rowBtn[data-gate="' + k + '"]:not([data-level])');
      out[k] = b ? (b.textContent||'').replace(/\\s+/g,' ').trim() : '';
    });
    return JSON.stringify(out);
  })()`).then(JSON.parse);
  ok('the gate card no longer says "the same" / "different", true only of TWO inputs',
     !/when the same|when different/i.test(words.xor + ' ' + words.xnor), JSON.stringify(words));

  await ev(`(function(){ var b=document.querySelector('.rowBtn[data-gate="xnor"]:not([data-level])'); if(b) b.click(); })()`);
  await sleep(600);
  await level('xnor', 2);
  await sleep(900);
  const rule = await ev(`((document.getElementById('logicBox')||{}).textContent||'').replace(/\\s+/g,' ')`);
  ok('the XNOR rule spells out what happens with every input OFF',
     /every input off|all off|none at all/i.test(rule), rule.slice(0, 150));

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
