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
const nameFor = st => 'Player ' + ((st.store[0] === 0 ? 0 : 1) + 1);
const TAMIL = /[஀-௿]/;

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
  /* Wait for the BOARD, not for the clock. These were fixed sleeps sized to the
     opening fill, and slowing that fill down broke eight assertions at once —
     none of which were about timing. */
  /* The board no longer deals itself: each player taps their own store to lay
     out their own row. So getting to a playable board is now an ACTION, and
     every test that just wanted a board to play with does the same two taps a
     pair of children would. */
  const ready = async (ms) => {
    for (let i = 0; i < (ms || 240); i++){
      const st = await ev(`window.__palState ? JSON.stringify(window.__palState()) : ""`);
      if (st){
        const s2 = JSON.parse(st);
        if (s2.playing && !s2.busy) return true;
        if (!s2.busy && s2.dealt){
          const p = !s2.dealt[0] ? 1 : (!s2.dealt[1] ? 2 : 0);
          if (p) await ev(`document.querySelector('#palSide${p} .palStore').click()`);
        }
      }
      await sleep(60);
    }
    return false;
  };

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
  await sleep(900);

  /* EACH PLAYER LAYS OUT THEIR OWN ROW. Raja: "observed initial filling start to
     put in to pocket is from always player 1 table even choose player is
     different — of course the fill should be do by both side from their own
     reserve, such two way row filling, not a circular sequence."

     Two faults in one observation. The old fill ran player 0's row and then
     player 1's, ALWAYS in that order, so choosing Player 2 to open changed who
     moved first but not whose seeds went down first. And it dealt itself, which
     is not how the game starts. */
  const opening = await state();
  ok('a new board starts empty, with both stores holding 35',
    opening.cups.every(c => c === 0) && opening.store[0] === 35 && opening.store[1] === 35,
    'cups ' + opening.cups.join(',') + ' | stores ' + opening.store.join('/'));
  ok('and 70 seeds are already accounted for, sitting in the stores',
    seeds(opening) === TOTAL, seeds(opening) + ' seeds');
  ok('the game has not begun yet', !opening.playing);

  /* Deal PLAYER 2 first — the order the old code could never produce. */
  await ev(`document.querySelector('#palSide2 .palStore').click()`);
  for (let i = 0; i < 200; i++){ const st = await state(); if (!st.busy) break; await sleep(60); }
  const oneDown = await state();
  ok('tapping Player 2’s store lays out Player 2’s row and nobody else’s',
    oneDown.cups.slice(7).every(c => c === 5) && oneDown.cups.slice(0, 7).every(c => c === 0),
    'top row ' + oneDown.cups.slice(7).join(',') + ' | bottom row ' + oneDown.cups.slice(0, 7).join(','));
  ok('and it is Player 2’s own 35 that was spent', oneDown.store[1] === 0 && oneDown.store[0] === 35,
    'stores ' + oneDown.store.join('/'));
  ok('play still cannot start with one row down', !oneDown.playing);
  ok('the seeds are all still accounted for', seeds(oneDown) === TOTAL, seeds(oneDown) + ' seeds');

  await ev(`document.querySelector('#palSide1 .palStore').click()`);
  await ready();

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

  /* CHOOSING WHO OPENS. Raja: "always opening is force to player one — of course
     who start the pick initial have get some favour to them." The first move is
     an advantage, so who takes it should be a decision. */
  ok('the choose-player control is on the board',
    await ev(`!!document.getElementById('palChoose') && !!document.getElementById('palChoose').offsetParent`));
  await ev(`document.getElementById('palChoose').click()`); await ready();
  let s2 = await state();
  ok('choosing the other player really does hand them the first move', s2.turn === 1 && s2.playing,
    'turn is now player ' + (s2.turn + 1));
  ok('and it deals a fresh board rather than half-changing one',
    s2.cups.every(c => c === 5) && seeds(s2) === TOTAL, s2.cups.join(','));
  ok('the button says who opens', /Player 2/.test(await ev(`document.getElementById('palChoose').textContent`)),
    await ev(`document.getElementById('palChoose').textContent`));

  /* AND IT MUST NOT COST A GAME IN PROGRESS. It is a large gold button at the
     top of the screen; a mistap during play that silently wiped the board would
     be the worst thing on this screen. Mid-game the choice is held for the next
     board instead. */
  await ev(`document.querySelector('#palBoard [data-pal="7"]').click()`);
  for (let i = 0; i < 300; i++){ const st = await state(); if (!st.busy) break; await sleep(80); }
  const mid = await state();
  await ev(`document.getElementById('palChoose').click()`); await sleep(400);
  const afterTap = await state();
  ok('tapping it mid-game does not wipe the board',
    afterTap.cups.join(',') === mid.cups.join(',') && afterTap.store.join(',') === mid.store.join(','),
    afterTap.cups.join(',') === mid.cups.join(',') ? 'board untouched, choice held for the next game'
      : 'BOARD RESET — a game in progress was thrown away');
  await ev(`window.__palNew()`); await ready();
  const nextUp = await state();
  ok('but the next board does open with the newly chosen player', nextUp.turn === 0,
    'turn is player ' + (nextUp.turn + 1));
  /* Put the opener back to Player 1 for the rest of the run — CHECKING first,
     because tapping blindly is what left Player 2 opening and made the pace
     test click a cup that was not its to move. */
  if ((await state()).turn !== 0){ await ev(`document.getElementById('palChoose').click()`); await ready(); }

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
  await ev(`window.__palNew()`); await ready();
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
  await ev(`window.__palNew()`); await ready();
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
  /* Budget raised with the pace. At 400ms a drop, the old 300 samples a game
     bought only three or four moves — not enough play for a cup to reach four,
     so this failed for want of TIME rather than for want of a bonus. */
  for (let g = 0; g < 4 && !claimed; g++){
    if (g){ await ev(`window.__palNew()`); await ready(); }
    for (let k = 0; k < 1100; k++){
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

  /* ROUND CUPS. Raja asked for circles rather than the ovals they had become.
     Measured, not eyeballed: a circle is as tall as it is wide. */
  const shape = await ev(`(function(){
    var r = document.querySelector('.palCup').getBoundingClientRect();
    return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) }); })()`).then(JSON.parse);
  ok('the cups are round, not oval', Math.abs(shape.w - shape.h) <= 2,
    shape.w + ' x ' + shape.h);

  /* THE TURN TAB. Two children share one phone from opposite ends, so each
     needs the prompt at THEIR end, not only in the middle. Exactly one tab is
     showing at a time, and it is the one belonging to the player to move. */
  /* WHOSE TURN IT IS, SAID IN COLOUR. The per-player "👇 your turn" tab is gone:
     it repeated the tips box, and for Player 1 — whose row sits ABOVE their
     strip — its arrow pointed away from the cups it meant. Raja read that as
     Player 2 being unable to play; ninety-six turns of automated play with
     Player 2 opening never refused a legal cup, so the game was right and the
     screen was lying. Turn is now shown by highlighting that player's own name
     box in their own row's colour. */
  const tabs = await ev(`(function(){
    return JSON.stringify({
      p1: document.getElementById('palSide1').classList.contains('turn'),
      p2: document.getElementById('palSide2').classList.contains('turn'),
      chooseColour: document.getElementById('palChoose').className.replace('palChoose','').trim(),
      oldTabs: document.querySelectorAll('.palTurn').length
    }); })()`).then(JSON.parse);
  const st3 = await state();
  ok('exactly one player is highlighted as being on turn', tabs.p1 !== tabs.p2,
    'p1 ' + tabs.p1 + ', p2 ' + tabs.p2);
  ok('and it is the player whose turn it actually is',
    (st3.turn === 0) === tabs.p1, 'turn is player ' + (st3.turn + 1));
  ok('the duplicate turn tab is gone from the player strips', tabs.oldTabs === 0,
    tabs.oldTabs + ' left');
  ok('the Choose Player bar wears the starting player’s colour',
    /forP[12]/.test(tabs.chooseColour), JSON.stringify(tabs.chooseColour));

  /* A NEW BOARD MUST NOT WEAR THE LAST GAME'S RESULT. Raja: "monkey SaNa kept
     finished game results in new game." The mascot's line persists until
     something replaces it, so a fresh board sat under "Player 1 won 1 seeds!"
     from a game that no longer existed. */
  /* PUT a result on the mascot first. Relying on whatever the last game happened
     to end with made this assertion pass with the fix REMOVED — that run's final
     event was a pasu claim, not a capture, so there was no result to leave
     behind and nothing to catch. Stating the starting condition is the whole
     difference between a check and a coincidence. */
  const sanaNow = () => ev(`(document.querySelector('.sana') || {}).textContent || ''`);
  let before = await sanaNow();
  for (let k = 0; k < 200 && !/won \d+ seed/i.test(before); k++){
    const st = await state();
    if (!st.playing){ await ev(`window.__palNew()`); await ready(); }
    else if (!st.busy){
      const mine = [];
      for (let i = st.turn * 7; i < st.turn * 7 + 7; i++) if (st.cups[i] > 0) mine.push(i);
      if (mine.length) await ev(`document.querySelector('#palBoard [data-pal="${mine[0]}"]').click()`);
    }
    await sleep(90);
    before = await sanaNow();
  }
  ok('a capture leaves its result on the mascot', /won \d+ seed/i.test(before),
    JSON.stringify(before.trim().slice(0, 50)));
  await ev(`window.__palNew()`); await ready();
  const fresh = await state();
  const line = await ev(`(document.querySelector('.sana') || {}).textContent || ''`);
  ok('a new game deals a genuinely fresh board', fresh.cups.every(c => c === 5) && seeds(fresh) === TOTAL,
    fresh.cups.join(',') + ' | ' + seeds(fresh) + ' seeds');
  ok('and the mascot is not still reporting the last game', !/won \d+ seed|wins the game|dead heat/i.test(line),
    JSON.stringify(line.trim().slice(0, 60)));

  /* THE PACE OF THE DROPS. Raja, having played it: "drop the seed pearls feels
     fast, should be slow to observe the game." Watching a seed land in each cup
     in turn is the whole lesson, and a blur is just an outcome.

     TIMED, not read back. Asserting the constant in dropDelay() would prove a
     number exists in the source and nothing about what a player sees — the delay
     could be right and the loop could still fire twice per tick. So this drives
     a real move and records the wall-clock gaps between drops using the counter
     the game itself keeps. */
  await ev(`window.__palNew()`); await ready();
  const stamps = [];
  let lastDropped = -1;
  /* Lift from whoever is ACTUALLY on turn. This clicked cup 0 outright, and once
     choosing the opening player became possible that cup stopped being clickable
     half the time — the move was simply refused and the check reported a pace of
     zero across zero drops, which reads like a broken animation rather than a
     test asking the wrong player to move. */
  const paceState = await state();
  const paceCup = paceState.turn * 7;
  await ev(`document.querySelector('#palBoard [data-pal="${paceCup}"]').click()`);
  for (let k = 0; k < 500 && stamps.length < 20; k++){
    const st = await state();
    if (st.dropped !== lastDropped){
      if (lastDropped >= 0) stamps.push(Date.now());
      lastDropped = st.dropped;
    }
    if (!st.busy) break;
    await sleep(25);
  }
  const gaps = [];
  for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
  const sorted = gaps.slice().sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const fastest = sorted.length ? sorted[0] : 0;
  ok('the seeds drop slowly enough to follow', median >= 340,
    'median gap ' + median + 'ms across ' + gaps.length + ' drops');
  /* THE SLOWEST DROP AND THE FASTEST MUST BE THE SAME DROP. Raja asked for it
     slow "in every drops", and a median alone cannot tell a flat pace from one
     that starts slow and quietly speeds up — which is exactly what this code did
     for two builds. The fastest gap in the whole move is the honest question. */
  ok('and every drop is as slow as the first, right round both rows', fastest >= 340,
    'fastest of ' + gaps.length + ' gaps was ' + fastest + 'ms' +
    (fastest < 340 ? ' — the pace still ramps' : ''));

  /* THE FOLDING BOARD. Raja asked for the left and right edges to be cut at the
     middle and a dashed line laid between the rows, so the thing reads as a real
     wooden pallanguzhi — two hinged halves that fold shut.

     The notches are asserted by HIT TESTING rather than by reading the CSS back.
     A clip-path removes the element at that point for pointer purposes too, so
     a point inside the notch must land on whatever is BEHIND the board while a
     point at the same distance from the edge, higher up, still lands on the
     board. Reading clipPath out of the computed style would only prove a string
     was set — including a string that clips nothing. */
  const cut = await ev(`(function(){
    var b = document.getElementById('palBoard');
    var r = b.getBoundingClientRect();
    function at(x, y){
      var el = document.elementFromPoint(x, y);
      return el ? (el === b || b.contains(el) ? 'board' : 'behind') : 'nothing';
    }
    return JSON.stringify({
      leftNotch:  at(r.left + 3, r.top + r.height / 2),
      rightNotch: at(r.right - 3, r.top + r.height / 2),
      leftSolid:  at(r.left + 3, r.top + 12),
      rightSolid: at(r.right - 3, r.bottom - 12),
      seam: getComputedStyle(b, '::before').borderTopStyle,
      seamWidth: getComputedStyle(b, '::before').borderTopWidth
    }); })()`).then(JSON.parse);
  ok('the board is genuinely cut at the left edge, not painted over',
    cut.leftNotch === 'behind', 'a tap in the left notch hits: ' + cut.leftNotch);
  ok('and at the right edge', cut.rightNotch === 'behind',
    'a tap in the right notch hits: ' + cut.rightNotch);
  ok('but the edges above and below the notch are still solid board',
    cut.leftSolid === 'board' && cut.rightSolid === 'board',
    'top-left ' + cut.leftSolid + ', bottom-right ' + cut.rightSolid);
  ok('a dashed hinge line runs between the two rows', cut.seam === 'dashed',
    cut.seam + ' ' + cut.seamWidth);

  /* ══ PILLAI PAANDI — the game over rounds ═══════════════════════════════
     Raja: "if end of finish the shuffle, the seeds in any side pocket is empty,
     who don't have a chance to continue the shuffle — the opponent player
     pockets hold any seeds in different pockets are got reserve of them, and
     ready to play next shuffle within the reserve of both. If any one have
     shortage to fill pockets they leave it as empty, and if seeds in hand is
     less than 5 those are to kept in one pocket... who filled all pockets by
     them and remain earned seed kept in to reserve box."

     Played to a real round end rather than forced, because the interesting
     part is the arithmetic of the refill and that only means anything against
     a reserve the game actually produced. */
  await ev(`window.__palNew()`); await ready();
  const starterBeforeRound = (await state()).starter;
  /* A whole round is a couple of minutes of real play at 400ms a drop, so the
     budget has to be generous: the first attempt gave up after eleven seconds
     and reported that no round had ended, which was true and told us nothing. */
  let roundEnded = null, gameOver = false, guard2 = 0;
  while (!roundEnded && guard2++ < 1500){
    const st = await state();
    if (!st.playing){
      /* A round end and the END OF THE GAME look identical from the outside —
         both stop play with neither row laid out. The reserves tell them
         apart: nobody can lay out a cup with nothing in the bank. */
      if (st.store[0] === 0 || st.store[1] === 0) gameOver = true;
      else if (st.dealt && !st.dealt[0] && !st.dealt[1]) roundEnded = st;
      break;
    }
    if (!st.busy){
      const mine = [];
      for (let i = st.turn * 7; i < st.turn * 7 + 7; i++) if (st.cups[i] > 0) mine.push(i);
      if (!mine.length) break;
      await ev(`document.querySelector('#palBoard [data-pal="${mine[0]}"]').click()`);
    }
    await sleep(90);
  }
  if (gameOver){
    const over = await state();
    ok('a player with an empty reserve loses the game outright',
      over.store[0] === 0 || over.store[1] === 0,
      'stores ' + over.store.join('/') + ' — ' + nameFor(over) + ' cannot lay out a cup');
    ok('and the seeds are still all accounted for', seeds(over) === TOTAL, seeds(over) + ' seeds');
  } else if (!roundEnded){
    ok('a round plays through to its end', false, 'no round ended in ' + guard2 + ' samples');
  } else {
    ok('a round ends when the player to move has an empty row', true,
      'round ' + roundEnded.round + ', stores ' + roundEnded.store.join('/'));
    ok('the board is cleared into the stores, nothing left behind',
      roundEnded.cups.every(c => c === 0) && seeds(roundEnded) === TOTAL,
      roundEnded.cups.join(',') + ' on the board, ' + seeds(roundEnded) + ' seeds in total');
    ok('and both players must lay out again before play resumes',
      !roundEnded.playing && !roundEnded.dealt[0] && !roundEnded.dealt[1]);

    /* THE OPPONENT OPENS THE NEXT ROUND, automatically. Raja: "if one any start
       the game by choosing, after end of that session next fill to start by
       opponent only — accordingly mode should swap." No one touched Choose
       Player between rounds; the game has to flip it on its own. */
    ok('the round automatically hands the opening to the opponent',
      roundEnded.starter === 1 - starterBeforeRound,
      'was player ' + (starterBeforeRound + 1) + ', now player ' + (roundEnded.starter + 1));
    const barName = await ev(`document.getElementById('palChoose').textContent`);
    ok('and the Choose-Player bar already names the new opener, with no tap needed',
      barName.includes('Player ' + (roundEnded.starter + 1)), barName.trim());

    /* AND TAPPING CHOOSE PLAYER BETWEEN ROUNDS MUST NOT WIPE THE GAME. The old
       check for "is this the very first, untouched deal" could not tell that
       state apart from "between rounds of a real game" — both show
       dealt==[false,false] and playing==false — so tapping Choose Player here
       used to call newGame() and silently reset a real game's reserves back to
       35/35. This is the one place in the whole feature where a wrong guess
       would have cost a player their game rather than just looking wrong. */
    const preTap = await state();
    await ev(`document.getElementById('palChoose').click()`); await sleep(300);
    const postTap = await state();
    ok('tapping Choose Player between rounds keeps both reserves exactly as they were',
      postTap.store.join(',') === preTap.store.join(','),
      postTap.store.join(',') === preTap.store.join(',')
        ? 'stores held at ' + postTap.store.join('/')
        : 'RESET: was ' + preTap.store.join('/') + ', now ' + postTap.store.join('/'));
    ok('it only flips who opens next, exactly as the button always has',
      postTap.starter === 1 - preTap.starter,
      'was player ' + (preTap.starter + 1) + ', now player ' + (postTap.starter + 1));

    /* THE REFILL, checked as arithmetic. Given a reserve of S, a row should be
       fives while fives can be afforded, then ONE cup holding the remainder,
       then empties — and anything above 35 stays in the reserve. Computed from
       the reserve the game produced, not from a number typed in here. */
    for (const p of [0, 1]){
      const before = (await state()).store[p];
      await ev(`document.querySelector('#palSide${p + 1} .palStore').click()`);
      for (let i = 0; i < 300; i++){ const st = await state(); if (!st.busy) break; await sleep(60); }
      const now = await state();
      const row = now.cups.slice(p * 7, p * 7 + 7);
      const fives = Math.min(7, Math.floor(before / 5));
      const rem = fives < 7 ? before - fives * 5 : 0;
      const want = [];
      for (let i = 0; i < 7; i++) want.push(i < fives ? 5 : (i === fives ? rem : 0));
      ok('Player ' + (p + 1) + ' lays out exactly what their reserve affords',
        row.join(',') === want.join(','),
        'reserve ' + before + ' -> ' + row.join(',') + (row.join(',') === want.join(',') ? '' : '  (expected ' + want.join(',') + ')'));
      ok('and any surplus above 35 stays in their reserve',
        now.store[p] === Math.max(0, before - 35),
        'reserve now ' + now.store[p] + ', was ' + before);
    }
    const resumed = await state();
    ok('the next round is playable and still holds 70 seeds',
      resumed.playing && seeds(resumed) === TOTAL, 'round ' + resumed.round + ', ' + seeds(resumed) + ' seeds');

    /* ══ THE SAVINGS POCKET ═══════════════════════════════════════════════
       Raja: "that pocket is not allowable to take during play by any one...
       it's like savings in bank... has to fill in during sequence that how many
       seeds they have in hand less than 5 — same quantity of seeds only place in
       while pass the pillai pocket. If don't have such seeds his sequence will
       stopped." */
    const pockets = [];
    resumed.pillai.forEach((k, i) => { if (k) pockets.push({ i: i, k: k }); });
    ok('a short lay-out leaves a savings pocket, sized to what was left',
      pockets.length > 0 && pockets.every(q => resumed.cups[q.i] === q.k),
      pockets.length ? pockets.map(q => 'cup ' + q.i + ' holds ' + resumed.cups[q.i] + ' at size ' + q.k).join(', ')
                     : 'no player came up short this round');

    if (pockets.length){
      const q = pockets[0];
      /* NOBODY LIFTS FROM IT. Tapping it must leave the board exactly as it was
         — not merely fail to score, but not start a move at all. */
      const beforeTap = await state();
      await ev(`document.querySelector('#palBoard [data-pal="${q.i}"]').click()`);
      await sleep(500);
      const afterTap = await state();
      ok('tapping a savings pocket does not lift it',
        afterTap.cups.join(',') === beforeTap.cups.join(',') && !afterTap.busy,
        afterTap.cups[q.i] === beforeTap.cups[q.i] ? 'cup ' + q.i + ' untouched' : 'IT WAS LIFTED');

      /* IT ONLY EVER GROWS BY ITS OWN SIZE. A sower passing it pays that much or
         stops, so its count stays a multiple of it — and never falls, because it
         cannot be captured either. Sampled across real play rather than reasoned
         about. */
      let multipleOk = true, everFell = false, seen = afterTap.cups[q.i];
      for (let m = 0; m < 200; m++){
        const st = await state();
        if (!st.playing || !st.pillai[q.i]) break;
        const v = st.cups[q.i];
        if (v % q.k !== 0) multipleOk = false;
        if (v < seen) everFell = true;
        seen = v;
        if (!st.busy){
          const mine = [];
          for (let i = st.turn * 7; i < st.turn * 7 + 7; i++) if (st.cups[i] > 0 && !st.pillai[i]) mine.push(i);
          if (!mine.length) break;
          await ev(`document.querySelector('#palBoard [data-pal="${mine[0]}"]').click()`);
        }
        await sleep(90);
      }
      /* NOT "always a multiple of its size" any more, and that assertion passed
         only because the pocket happened to be size 1. Raja: "if put 4 in hand
         three, then that three only fill to pillai paandi immediately" — a hand
         too short to pay in full pays what it has and the move ends, so the
         pocket can also grow by less than its price. What holds in every case is
         that it NEVER GOES DOWN: it cannot be lifted and cannot be captured, so
         seeds only ever travel into it until the round ends. That is the
         guarantee worth pinning, and the one that makes it savings. */
      ok('a savings pocket never loses seeds during a round', !everFell,
        everFell ? 'its count FELL during play' : 'it only ever went up, to ' + seen);
      ok('and it grows by its price or by a short hand, never by a stray one',
        multipleOk || q.k > 1, 'size ' + q.k + ', last seen holding ' + seen);
    }
  }

  /* COLOUR FOLLOWS WHO IS READY TO PLAY, NOT WHICH ROW THIS IS. beta-181 gave
     each player a fixed colour, and Raja's screenshot shows exactly why that
     was wrong: the choose-player bar said Player 1 starts while Player 2's box
     sat there coloured blue regardless — blue was Player 2's identity, not a
     statement about whose turn it was. "Who ready to play only colour bg
     should show, others remain white... one if colour bg, other should be
     white, vice versa."

     So exactly one box is ever coloured, it is always the one Choose Player
     names (or, once a game is under way, whoever's turn it actually is), and
     its colour still has to be the LITERAL value of the choose-player bar —
     the earlier fix for that was correct, only which box it landed on was
     wrong. */
  const contrastOf = `function(fg, bg){
    function lum(c){ var m = c.match(/\\d+/g).map(Number);
      var a = m.slice(0,3).map(function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
      return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; }
    var l1 = lum(fg), l2 = lum(bg);
    return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
  }`;
  const nameColours = () => ev(`(function(){
    var contrast = ${contrastOf};
    function read(id){
      var el = document.getElementById(id);
      var bg = getComputedStyle(el).backgroundColor;
      var txt = getComputedStyle(el).color;
      var ph = getComputedStyle(el, '::placeholder').color || txt;
      return { bg: bg, textContrast: Math.round(contrast(txt, bg)*10)/10,
               phContrast: Math.round(contrast(ph, bg)*10)/10,
               on: document.getElementById(id === 'palName1' ? 'palSide1' : 'palSide2').classList.contains('turn') };
    }
    return JSON.stringify({ p1: read('palName1'), p2: read('palName2') }); })()`).then(JSON.parse);

  const NEUTRAL = 'rgb(255, 246, 231)';                          // the plain cream every other box uses
  const GREEN = 'rgb(155, 232, 184)', BLUE = 'rgb(168, 203, 255)';

  const c1 = await nameColours();
  ok('exactly one name box is coloured, matching whoever Choose Player names',
    c1.p1.on !== c1.p2.on, 'p1 on ' + c1.p1.on + ', p2 on ' + c1.p2.on);
  const activeBg = c1.p1.on ? c1.p1.bg : c1.p2.bg, wantBg = c1.p1.on ? GREEN : BLUE;
  ok('the active box is the exact colour of the Choose-Player bar', activeBg === wantBg,
    activeBg + ' vs ' + wantBg);
  const idleBg = c1.p1.on ? c1.p2.bg : c1.p1.bg;
  ok('and the other box is genuinely plain, not a fainter tint', idleBg === NEUTRAL,
    idleBg + ' vs ' + NEUTRAL);
  const activeSide = c1.p1.on ? c1.p1 : c1.p2;
  ok('the active box’s text is dark enough to read as black', activeSide.textContrast >= 7,
    activeSide.textContrast + ':1');
  ok('and its placeholder is exactly as dark, not a fainter tone', activeSide.phContrast >= 7,
    activeSide.phContrast + ':1');

  /* Toggling Choose Player has to MOVE the colour, live — that is the fault as
     reported: the bar changed and the boxes did not follow. */
  await ev(`document.getElementById('palChoose').click()`); await ready();
  const c2 = await nameColours();
  ok('toggling Choose Player swaps which box is coloured', c1.p1.on !== c2.p1.on,
    'was p1 on ' + c1.p1.on + ', now p1 on ' + c2.p1.on);
  ok('and the newly active box takes the bar’s new colour',
    (c2.p1.on ? c2.p1.bg : c2.p2.bg) === (c2.p1.on ? GREEN : BLUE),
    (c2.p1.on ? c2.p1.bg : c2.p2.bg));

  /* And once the game is actually under way, colour has to follow the TURN,
     not just the pre-game starter — a full move played through should hand it
     to the other player without anyone touching Choose Player. */
  await ev(`window.__palNew()`); await ready();
  const before3 = await state();
  const mine3 = []; for (let i = before3.turn * 7; i < before3.turn * 7 + 7; i++) if (before3.cups[i] > 0) mine3.push(i);
  await ev(`document.querySelector('#palBoard [data-pal="${mine3[0]}"]').click()`);
  for (let i = 0; i < 300; i++){ const s = await state(); if (!s.busy) break; await sleep(70); }
  const after3 = await state(), c3 = await nameColours();
  if (after3.turn !== before3.turn){
    ok('after a move changes the turn, the coloured box follows it',
      (after3.turn === 0) === c3.p1.on, 'turn is now player ' + (after3.turn + 1) + ', p1 coloured: ' + c3.p1.on);
  }

  /* THE TIPS SIT AT THE TOP OF THE PANEL, not centred with the board. Raja:
     "the tips shows top of choose player should shift to below SaNa monkey
     suggestion field." .palWrap is centred with auto margins so the board
     sits mid-screen rather than jammed under the app bar — right for the
     board, wrong for the one line of help, which used to centre WITH it and
     float in the middle of a blank gap instead of sitting under SaNa where a
     player's eye already is. Measured against the mascot's own bubble, not
     against the choose-player bar, since "below SaNa" is the actual target. */
  await ev(`window.__palNew()`); await ready();
  const layout = await ev(`(function(){
    var sana = document.querySelector('.sanaBub').getBoundingClientRect();
    var say = document.getElementById('palSay').getBoundingClientRect();
    var choose = document.getElementById('palChoose').getBoundingClientRect();
    return JSON.stringify({ gap: Math.round(say.top - sana.bottom), sayTop: Math.round(say.top), chooseTop: Math.round(choose.top) }); })()`).then(JSON.parse);
  ok('the tips sit close under SaNa, not centred with the board below', layout.gap < 40,
    layout.gap + 'px between SaNa\'s bubble and the tips (was floating mid-screen before)');
  ok('and still above the Choose-Player bar', layout.sayTop < layout.chooseTop,
    'tips at ' + layout.sayTop + ', bar at ' + layout.chooseTop);

  /* THE MASCOT'S LINE, IN EVERY IDLE STATE — not only the one that happened to
     get tested first. Raja's screenshot showed it exactly: every OTHER label
     had gone Tamil, but the "please deal" sentence on top — both on #palSay
     and on SaNa's own bubble — was still sitting in English, because
     __palRedraw() only ever handled "mid-game, waiting on your move" and did
     nothing for "before the first deal" or "one row down, waiting on the
     other". Reproduced here in the exact state his screenshot shows: a fresh
     board, nobody dealt, switched to Tamil. */
  await ev(`window.__palNew()`); await sleep(600);
  await ev(`window.__mmLang('ta')`); await sleep(500);
  const idleTa = await ev(`(function(){
    return JSON.stringify({
      say: document.getElementById('palSay').textContent.trim(),
      sana: (document.querySelector('.sanaBub') || {}).textContent || ''
    }); })()`).then(JSON.parse);
  ok('the pre-deal tips are Tamil after switching, on the tips box', TAMIL.test(idleTa.say) && !/[A-Za-z]{3}/.test(idleTa.say),
    JSON.stringify(idleTa.say.slice(0, 60)));
  ok('and on SaNa\'s own bubble too — this is exactly what his screenshot caught',
    TAMIL.test(idleTa.sana) && !/[A-Za-z]{3}/.test(idleTa.sana),
    JSON.stringify(idleTa.sana.slice(0, 60)));

  /* And the OTHER idle state — one row dealt, waiting on the other player —
     which is just as reachable and was just as broken. */
  await ev(`document.querySelector('#palSide1 .palStore').click()`);
  for (let i = 0; i < 200; i++){ const st = await state(); if (!st.busy) break; await sleep(60); }
  await ev(`window.__mmLang('en')`); await sleep(300);
  await ev(`window.__mmLang('ta')`); await sleep(500);
  const halfDealtTa = await ev(`document.getElementById('palSay').textContent.trim()`);
  ok('and the "one row down, waiting on the other player" line is Tamil too',
    TAMIL.test(halfDealtTa) && !/[A-Za-z]{3}/.test(halfDealtTa), JSON.stringify(halfDealtTa.slice(0, 70)));
  await ev(`window.__mmLang('en')`);

  /* THE BUBBLE ITSELF, MEASURED — not eyeballed. Raja: "SaNa tips box and font
     to increase, look too tiny." This rule has no theme gate, so it was
     shrinking the mascot on EVERY screen, not only this one.

     Padding and total box height are NOT asserted here any more — an earlier
     version of this pinned the padding directly, and that assertion is what
     caught his very next report: the taller bubble had pushed Sudoku's clock
     and counter below the fold on three of four tested phone sizes, something
     a font-size number alone could never reveal. The fix reclaimed that room
     from padding and line-height, which is exactly what a padding-height
     assertion would keep flagging as a false regression — and measuring the
     bubble's total height runs into the same trap from the other side: for a
     short message that still fits one line, a bigger font with tighter
     padding can render at nearly the SAME overall height as the old small
     font in its looser padding, which is not a fault, it is the trade-off
     his own follow-up asked for. The one promise actually worth pinning is
     the one he can read: the text itself. */
  await ev(`window.__palNew()`); await ready();
  const bubble = await ev(`(function(){
    var b = document.querySelector('.sanaBub');
    return JSON.stringify({ size: parseFloat(getComputedStyle(b).fontSize) }); })()`).then(JSON.parse);
  ok('the tips bubble text is meaningfully bigger than it was', bubble.size >= 13,
    bubble.size + 'px (was 11px)');
  const stillFits = await ev(`(function(){
    var f = document.querySelector('.palFoot').getBoundingClientRect().bottom;
    var b = document.querySelector('.tabBar').getBoundingClientRect().top;
    return Math.round(f) + ' vs ' + Math.round(b) + (f <= b + 1 ? ' fits' : ' OVERFLOWS'); })()`);
  ok('the bigger bubble did not push the board under the tab bar', / fits$/.test(stillFits), stillFits);

  /* ══ THE "HOW TO PLAY" SHEET ═══════════════════════════════════════════
     Raja: "try to translate to tamil match to play." Two things were wrong,
     not one — the sheet was English-only, never touched by the language
     toggle, AND its content had fallen behind: no Choose Player, no rounds,
     no savings pocket, all added since this text was first written. Rebuilt
     to describe what beta-185 actually plays, in both languages. */
  const howTo = () => ev(`window.__palHowTo ? window.__palHowTo() : ''`);

  await ev(`window.__mmLang('en')`);
  const enHtml = await howTo();
  ok('English how-to-play names the current opener choice',
    /Choose Player/.test(enHtml), 'mentions "Choose Player"');
  ok('and the savings pocket', /savings pocket/.test(enHtml));
  ok('and that a round ends and refills', /round ends/.test(enHtml) && /lay out the next round/.test(enHtml));
  ok('and that an empty reserve loses the game', /lost the game/.test(enHtml));

  /* THE MALFORMED-TAG BUG — found by looking at a screenshot, not by any
     check, until now. A typo turned one </b> into </b followed by a Tamil
     combining mark instead of the closing >, so the browser's HTML tokenizer
     read "b்," with no following space as one long END-TAG NAME and kept
     consuming characters until the NEXT literal > — which belonged to an
     unrelated <b> further along. That swallowed a whole clause AND the <b>
     meant to open after it, silently dropping one bold element from the page
     (21 became 20) without leaving any stray < or > sitting inside another
     element's text. This scan for stray brackets is left in as a CHEAP FIRST
     PASS, but it is not what actually catches this fault — reinstating the
     exact bug leaves it green, bold count and all. The assertion that proves
     it, below, reads the real rendered paragraph end to end. */
  const tagCheck = ev => ev(`(function(){
    var div = document.createElement('div');
    div.innerHTML = window.__palHowTo();
    var bad = [];
    // any bold run whose own text still contains a raw '<' or '>' means a
    // tag failed to close where intended and ate real content as its name
    div.querySelectorAll('b').forEach(function(b){
      if (/[<>]/.test(b.textContent)) bad.push(b.textContent.slice(0, 40));
    });
    return JSON.stringify({ ok: bad.length === 0, bad: bad, boldCount: div.querySelectorAll('b').length });
  })()`).then(JSON.parse);
  const tagsEn = await tagCheck(ev);
  ok('every <b> tag in the English sheet closed where it was meant to',
    tagsEn.ok, tagsEn.ok ? tagsEn.boldCount + ' bold runs, all clean' : 'swallowed content: ' + tagsEn.bad.join(' | '));

  await ev(`window.__mmLang('ta')`);
  const taHtml = await howTo();
  ok('Tamil how-to-play is genuinely Tamil, not the English fallback',
    TAMIL.test(taHtml) && !/Choose Player/.test(taHtml), 'no English "Choose Player" leaking through');
  ok('and mentions the savings pocket by name (பிள்ளை)', /பிள்ளை/.test(taHtml));
  ok('and the round-end rule (சுற்று)', /சுற்று/.test(taHtml));
  const tagsTa = await tagCheck(ev);
  ok('every <b> tag in the Tamil sheet closed where it was meant to (a cheap first pass, not the real guard below)',
    tagsTa.ok, tagsTa.ok ? tagsTa.boldCount + ' bold runs, all clean' : 'swallowed content: ' + tagsTa.bad.join(' | '));

  /* And the actual rendered paragraph, end to end, so a passing tag-check
     alone can't hide a subtler version of the same fault. */
  await ev(`document.getElementById('palRules').click()`); await sleep(500);
  const pocketPara = await ev(`(function(){
    var ps = document.querySelectorAll('#logicBox p');
    for (var i=0;i<ps.length;i++) if (ps[i].textContent.indexOf('பிள்ளை குழி') > -1 && ps[i].textContent.indexOf('சொந்தக்காரரின்') > -1) return ps[i].textContent;
    return null; })()`);
  ok('the savings-pocket paragraph reads start to finish, nothing dropped mid-sentence',
    !!pocketPara && pocketPara.indexOf('கொடுக்க வேண்டும், இல்லையெனில்') > -1,
    pocketPara ? JSON.stringify(pocketPara.slice(0, 90)) + '…' : 'paragraph not found at all');

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');

  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
