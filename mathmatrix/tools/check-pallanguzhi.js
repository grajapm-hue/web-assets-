/* Pallanguzhi — Raja's own game, and the first thing here that is a GAME
   between two people rather than a puzzle with an answer.

   THE ASSERTION THAT MATTERS is seed conservation. Every seed is either in a
   cup or in a store, and the total can never change: 70 at the start, 70 after
   any number of moves. Sowing, continuing, capturing and claiming a pasu all
   move seeds between those places, so a single arithmetic slip anywhere — a
   drop that does not decrement the hand, a capture paid out twice, a pasu taken
   from a cup already emptied — breaks it. Checking that "a move happened" or
   that "the board still renders" would pass through all of those.

   Played here by driving real clicks and real animation, not by calling the
   internals, so the click handler and the turn logic are under test too. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9994;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOTAL = 70;                       // 14 cups x 5 seeds
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cppal');
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
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || ''));
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const state = () => ev(`JSON.stringify(window.__palState())`).then(JSON.parse);
  /* Every seed is in a cup, in a store, or IN THE HAND being carried. Leave the
     hand out and the count comes up short mid-sow and the check reports a bug
     that is not there — the first run did exactly that. */
  const seeds = s => s.cups.reduce((a, b) => a + b, 0) + s.store[0] + s.store[1] + (s.hand || 0);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1700);
  await ev(`(document.querySelector('.splashPlay')||{click(){}}).click()`); await sleep(900);

  ok('the game is on the puzzle list', await ev(`!!document.getElementById('palTab')`));
  await ev(`document.getElementById('palTab').click()`);
  await sleep(2600);                              // let the opening fill finish

  /* THE RING. The top row is drawn right to left so that the array is a real
     ring on screen: leaving cup 6 at the bottom right you must arrive at cup 7
     directly above it, not jump across the board. Get this backwards and the
     game still runs, still conserves seeds, and is silently wrong — seeds would
     appear to teleport, which is exactly the kind of fault no arithmetic
     assertion can see. */
  const dom = await ev(`Array.from(document.querySelectorAll('#palBoard [data-pal]')).map(function(b){ return +b.dataset.pal; })`);
  ok('the board is two rows of seven', dom.length === 14, dom.join(','));
  ok('the top row runs 13 down to 7, left to right', dom.slice(0, 7).join(',') === '13,12,11,10,9,8,7', dom.slice(0, 7).join(','));
  ok('the bottom row runs 0 up to 6', dom.slice(7).join(',') === '0,1,2,3,4,5,6', dom.slice(7).join(','));
  ok('cup 7 sits directly above cup 6, so the ring does not jump',
    dom[6] === 7 && dom[13] === 6, 'top-right ' + dom[6] + ', bottom-right ' + dom[13]);

  let s = await state();
  ok('every cup opens with five seeds', s.cups.every(c => c === 5), s.cups.join(','));
  ok('and both stores have emptied into the board', s.store[0] === 0 && s.store[1] === 0,
    'stores ' + s.store.join(' / ') + ' — Raja: "reserve will lapse to zero"');
  ok('70 seeds are in play', seeds(s) === TOTAL, seeds(s) + ' seeds');
  ok('Player 1 opens', s.turn === 0 && s.playing);

  /* Play a real game with real clicks. Whoever's turn it is picks their
     left-most non-empty cup — a fixed rule, so a failure can be reproduced. */
  let moves = 0, broke = null, pasuSeen = 0;
  for (let m = 0; m < 40 && !broke; m++){
    s = await state();
    if (!s.playing) break;
    const mine = [];
    for (let i = s.turn * 7; i < s.turn * 7 + 7; i++) if (s.cups[i] > 0) mine.push(i);
    if (!mine.length) break;
    await ev(`document.querySelector('#palBoard [data-pal="${mine[0]}"]').click()`);
    moves++;
    // wait out the sowing, however long the move turns out to be
    for (let w = 0; w < 240; w++){
      await sleep(120);
      const st = await state();
      if (seeds(st) !== TOTAL){ broke = 'after move ' + moves + ': ' + seeds(st) + ' seeds (' + st.cups.reduce((a,b)=>a+b,0) + ' in cups, ' + st.store.join('+') + ' stored, ' + st.hand + ' in hand)'; break; }
      if (st.cups.filter(c => c === 4).length) pasuSeen++;
      if (!st.busy) break;
    }
  }
  ok('a real game can be played through', moves >= 6, moves + ' moves played');
  ok('no seed is created or destroyed, at any moment', !broke, broke || 'held at 70 throughout');
  s = await state();
  ok('and still 70 at the end', seeds(s) === TOTAL,
    s.cups.reduce((a, b) => a + b, 0) + ' on the board + ' + s.store[0] + ' + ' + s.store[1] + ' stored + ' + s.hand + ' in hand');
  ok('cups of four did appear, so the bonus is reachable', pasuSeen > 0, pasuSeen + ' sightings');

  /* LEAVING MID-MOVE. Seeds being carried are in neither a cup nor a store, so
     cancelling the sowing timer used to delete them outright: walk out of the
     game while seeds are in the air, come back, and the board is short. */
  await ev(`window.__palNew()`); await sleep(2500);
  await ev(`document.querySelector('#palBoard [data-pal="3"]').click()`);
  await sleep(400);                                    // catch it mid-flight
  const flying = await state();
  await ev(`window.__palStop()`);
  await sleep(200);
  const landed = await state();
  ok('walking away mid-move does not lose the seeds in hand', seeds(landed) === TOTAL,
    'was ' + seeds(flying) + ' (' + flying.hand + ' in hand), now ' + seeds(landed) +
    ' (' + landed.hand + ' in hand)');

  /* PASU. A cup of exactly four may be taken only by the player whose ROW it
     sits in — that ownership is the whole rule, and awarding it to whoever
     happens to be sowing would be a different game. Set one up and claim it. */
  await ev(`window.__palNew()`); await sleep(2600);
  /* A cup of four appears DURING sowing, not between moves — which is the
     whole point of the rule, since a player has to spot it while the other is
     still dropping seeds. Looking only between moves found none in thirty
     tries even though a hundred and fifty went past during play.
     The board is FROZEN once one is spotted, so the sower cannot drop a fifth
     seed in the gap between reading the state and tapping the cup. The claim
     is what is under test here, not who wins a race with a timer. */
  /* Claimed the way a player claims: SPOT the glow and TAP IT, while the other
     player is still sowing. Freezing the board first was tried and turned out
     worse than useless — stopping a move now runs it out to the end, so the very
     act of freezing moved the board past the cup being aimed at.
     A tap can lose the race to the next seed, so this keeps playing and keeps
     tapping until one lands, and reports how many it took. */
  let claimed = null, taps = 0, samples = 0;
  outer:
  for (let g = 0; g < 6 && !claimed; g++){
    if (g){ await ev(`window.__palNew()`); await sleep(2500); }
    for (let k = 0; k < 300; k++){
      const st = await state();
      if (!st.playing) break;
      const four = st.cups.findIndex((c, i) => c === 4 && !st.dead[i]);
      if (four >= 0){
        const own = four < 7 ? 0 : 1;
        const pre = st.store.slice();
        await ev(`document.querySelector('#palBoard [data-pal="${four}"]').click()`);
        taps++;
        const post = await state();
        if (post.store[own] === pre[own] + 4){
          claimed = { cup: four, own: own, pre: pre, post: post.store.slice(),
                      cups: post.cups.slice(), all: seeds(post) };
          break outer;
        }
      }
      if (!st.busy){
        const mine = [];
        for (let i = st.turn * 7; i < st.turn * 7 + 7; i++) if (st.cups[i] > 0) mine.push(i);
        if (!mine.length) break;
        await ev(`document.querySelector('#palBoard [data-pal="${mine[0]}"]').click()`);
      }
      samples++;
      await sleep(35);
    }
  }
  if (!claimed){
    ok('a cup of four could be claimed', false, taps + ' taps in ' + samples + ' samples across 6 games');
  } else {
    ok('claiming a cup of four pays the row OWNER, not the player sowing',
      claimed.post[claimed.own] === claimed.pre[claimed.own] + 4 &&
      claimed.post[1 - claimed.own] === claimed.pre[1 - claimed.own],
      'cup ' + claimed.cup + ' is Player ' + (claimed.own + 1) + "'s; stores " +
      claimed.pre.join('/') + ' -> ' + claimed.post.join('/') + '  (' + taps + ' taps)');
    ok('and the cup is emptied by the claim', claimed.cups[claimed.cup] === 0, 'cup holds ' + claimed.cups[claimed.cup]);
    ok('the seeds are still all accounted for', claimed.all === TOTAL, claimed.all + ' seeds');
  }

  /* A cup that reached five without being claimed is dead — Raja: "if forget to
     take and same filled next round fill with 5, after no right to take
     further". Nothing may be claimed from a cup that is not showing four. */
  const st2 = await state();
  const notFour = st2.cups.findIndex(c => c !== 4 && c > 0);
  if (notFour >= 0){
    const pre2 = await state();
    await ev(`document.querySelector('#palBoard [data-pal="${notFour}"]').click()`);
    await sleep(250);
    const post2 = await state();
    const gained = (post2.store[0] + post2.store[1]) - (pre2.store[0] + pre2.store[1]);
    ok('a cup not showing four cannot be claimed as a bonus', gained === 0,
      'cup ' + notFour + ' held ' + pre2.cups[notFour] + '; stores moved by ' + gained);
  }

  /* WHAT THE MASCOT SAYS. sfx() is wrapped so that every 'win' also makes SaNa
     announce "You solved it! Every row, column and diagonal matches." — the
     magic square's victory line. Pallanguzhi has no rows to match and no
     diagonals at all, and that sentence appeared across the top of the board
     the first time a capture was made. Nothing about the game state was wrong,
     which is why only looking at the screen caught it. */
  const sana = await ev(`(document.querySelector('.sana') || {}).textContent || ''`);
  ok('the mascot does not announce a solved magic square over this board',
    !/solved it|row, column and diagonal/i.test(sana),
    JSON.stringify(sana.trim().slice(0, 70)));

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');

  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
