/* Raja: the pad kept the previous board's numbers when the picker changed, so
   the page showed two different answers to "which nine numbers is this?".
   Check the picker, the pad and the board's own arithmetic all agree -- for
   every start, without pressing Deal. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9891;
const MT = process.env.MM_TARGET || 'blankseq.html';
const FILE = /^https?:/.test(MT) ? MT : 'file:///' + path.join(__dirname, '..', MT).split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n,c,x) => { console.log((c?'  PASS  ':'  FAIL  ')+n+(x!==undefined?'  -> '+x:'')); if(!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpseqc');
  try { fs.rmSync(tmp, { recursive:true, force:true, maxRetries:8, retryDelay:250 }); } catch(e){}
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--disable-gpu','--no-sandbox','--mute-audio',
     '--remote-debugging-port='+PORT,'--user-data-dir='+tmp,'--window-size=560,900',FILE],{stdio:'ignore'});
  let t=null;
  for (let i=0;i<100&&!t;i++){ await sleep(300);
    try { t=JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`,{encoding:'utf8'})).find(x=>x.type==='page'); } catch(e){} }
  if (!t){ console.log('  FAIL  Chrome never opened a page'); process.exit(1); }
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r));
  let id=0; const pend=new Map(); const errs=[];
  ws.addEventListener('message',e=>{ const m=JSON.parse(e.data);
    if (m.method==='Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description||'').slice(0,170));
    if (m.id&&pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); } });
  const send=(mm,p)=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:mm,params:p}));});
  const ev=async x=>(await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true,timeout:300000})).result?.result?.value;
  await send('Runtime.enable');
  /* Wait for the page to have built itself rather than sleeping a guessed
     amount. 2.2s was generous over file:// and short over the network, and the
     picker then read as empty -- which looks like the page being broken and is
     only this file being impatient. */
  const waitFor = async (expr, ms) => {
    const until = Date.now() + (ms || 25000);
    while (Date.now() < until){ if (await ev(expr)) return true; await sleep(250); }
    return false;
  };
  ok('the trial page loaded and dealt its first board',
     await waitFor(`document.querySelectorAll('#startSel option').length > 0
                    && document.querySelectorAll('#pad .key').length > 0`), FILE);

  const starts = await ev(`Array.prototype.map.call(document.querySelectorAll('#startSel option'), function(o){ return o.value; })`);
  ok('the picker offers several runs of nine', starts.length >= 4, starts.join(', '));

  for (const st of starts){
    /* change the picker exactly as a finger does, and DO NOT press Deal */
    await ev(`(function(){ var s = document.getElementById('startSel');
      s.value = '${st}'; s.dispatchEvent(new Event('change')); })()`);
    await sleep(700);

    const state = await ev(`(function(){
      var picked = +document.getElementById('startSel').value;
      var want = []; for (var i=0;i<9;i++) want.push(picked+i);
      var pad = Array.prototype.map.call(document.querySelectorAll('#pad .key'),
        function(b){ return b.textContent.trim(); }).filter(function(x){ return /^[0-9]+$/.test(x); }).map(Number);
      return JSON.stringify({
        want: want,
        pad: pad,
        vals: P ? P.vals : null,
        say: document.getElementById('say').textContent.replace(/\\s+/g,' ').trim().slice(0,60),
        boxes: document.querySelectorAll('#grid .cell').length,
        answers: document.querySelectorAll('#grid .tgt').length
      });
    })()`).then(JSON.parse);

    const tag = (st + '\u2013' + (+st + 8)).padEnd(7);
    ok(tag + 'the pad offers exactly the numbers the picker names',
       state.pad.join(',') === state.want.join(','),
       'pad ' + state.pad.join(',') + '  picker wants ' + state.want.join(','));
    ok(tag + 'and the board itself was rebuilt from them',
       state.vals && state.vals.join(',') === state.want.join(','),
       state.vals ? state.vals.join(',') : 'no board');
    ok(tag + 'with nine boxes and six answers', state.boxes === 9 && state.answers === 6,
       state.boxes + ' boxes, ' + state.answers + ' answers');
    ok(tag + 'and the line under it says the same run', state.say.indexOf(state.want[0] + '\u2013' + state.want[8]) >= 0,
       state.say);
  }

  /* the answers must be reachable: solve the board with its own numbers */
  const solved = await ev(`(function(){
    for (var i=0;i<9;i++) entry[i] = P.grid[i];
    paint();
    return document.querySelectorAll('#grid .tgt.done').length;
  })()`);
  ok('revealing the answer turns all six lines green', solved === 6, solved + '/6');

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill(); await sleep(300);
  try { fs.rmSync(tmp,{recursive:true,force:true,maxRetries:8,retryDelay:250}); } catch(e){}
  console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
  process.exit(fail ? 1 : 0);
})();
