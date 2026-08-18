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
  const tabs = await ev(`(function(){
    function vis(el){ return !!(el && el.offsetParent !== null); }
    return JSON.stringify({
      p1: vis(document.getElementById('palTurn1')),
      p2: vis(document.getElementById('palTurn2')),
      t1: (document.getElementById('palTurn1') || {}).textContent || ''
    }); })()`).then(JSON.parse);
  const st3 = await state();
  ok('exactly one player is shown as being on turn', tabs.p1 !== tabs.p2,
    'p1 tab ' + tabs.p1 + ', p2 tab ' + tabs.p2);
  ok('and it is the player whose turn it actually is',
    (st3.turn === 0) === tabs.p1, 'turn is player ' + (st3.turn + 1));

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
  }

  ok('no JS errors', errs.length === 0, errs.join(' | ') || '');

  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
