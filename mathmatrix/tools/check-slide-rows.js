/* beta-147: a ROW is red until every cell in it is right, then green, and red
   again the moment it is disturbed. Checked against a hand-computed row state
   after every real move — and specifically on the LAST row of each board,
   which contains cells that must end up EMPTY, the case a naive "all blocks
   correct" test would get wrong. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9977;
const FILE = 'file:///' + path.join(__dirname, '..', 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

/* goalRow = the row this board proves the GREEN case on.

   1-15 proves BOTH shapes of row, because it is small enough to plan on:
   row 0 is four blocks and nothing else, row 3 is "13 14 15" followed by a
   square that must END UP EMPTY. Those are the two cases slideRowDone has to
   get right, and it is the same function on every board.

   A-Z + 1-9 is 6x6 with a single gap, and the abstraction that makes planning
   cheap does not scale to it — pinning six blocks and the gap on 36 squares is
   ~1.4 billion states, versus ~520k for four blocks on 16. So that board gets
   the hand-count checks over real play, and the green transition is proved on
   1-15 through the identical code path. Said plainly rather than papered over. */
const BOARDS = {
  fifteen: { cols: 4, rows: 4, gaps: 1, goalRows: [0, 3],
             tiles: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15'] },
  /* 3x9, because 27 squares is the only way 26 letters leave a single gap.
     Its last row is Y, Z and a square that must end up EMPTY — two blocks and
     one gap over 27 squares is ~17k states, so it is the cheapest green-row
     proof of the three and worth keeping. */
  az:      { cols: 3, rows: 9, gaps: 1, goalRows: [8],
             tiles: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
  azn:     { cols: 6, rows: 6, gaps: 1, goalRows: [],
             tiles: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['1','2','3','4','5','6','7','8','9']) }
};
function expectedRows(cells, cfg){
  const out = [];
  for (let r = 0; r < cfg.rows; r++){
    let good = true;
    for (let c = 0; c < cfg.cols; c++){
      const i = r * cfg.cols + c;
      const want = i < cfg.tiles.length ? cfg.tiles[i] : '';
      if (cells[i] !== want){ good = false; break; }
    }
    out.push(good);
  }
  return out;
}

(async () => {
  try { fs.rmSync(path.join(__dirname, '_cprw147'), { recursive: true, force: true }); } catch (e) {}
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(__dirname, '_cprw147'),
    '--window-size=390,844', FILE], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(280);
    try { t = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { encoding: 'utf8' })).find(x => x.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); let errs = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 200)); });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'shots', n), Buffer.from(r.result.data, 'base64')); };
  const cells = () => ev(`(function(){ var o=[];
    document.querySelectorAll('#slideBoard > .slideTile, #slideBoard > .slideCell').forEach(function(c){
      o.push(c.classList.contains('slideCell') ? '' : c.textContent); }); return o; })()`);
  /* The bubble is capped at three lines on a phone and hides the overflow, so
     a hint that grows too long is silently cut mid-word — which is exactly how
     the row wording first shipped. Compare painted height to content height. */
  const bubbleCut = () => ev(`(function(){ var b=document.querySelector('.sanaBub');
    if(!b) return 'no bubble';
    return b.scrollHeight > b.clientHeight + 1
      ? 'CUT: needs ' + b.scrollHeight + 'px, has ' + b.clientHeight + 'px — "' + b.textContent.slice(-34) + '"'
      : ''; })()`);
  const marks = () => ev(`(function(){ var o=[];
    document.querySelectorAll('#slideBoard > .slideTile, #slideBoard > .slideCell').forEach(function(c){
      o.push(c.classList.contains('rowOk') ? 'ok' : c.classList.contains('rowBad') ? 'bad' : '?'); }); return o; })()`);

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1700);
  /* This used to assert the literal 'beta-147', which is worse than useless: it
     PINNED a stale value. BETA_VER was a second hardcoded string that nobody
     bumped, so the footer and the BETA flag read beta-147 for two releases while
     this check went green on it. Assert the two agree, and that the label on the
     page shows the same thing — no literal to go stale. */
  const vers = await ev(`(function(){
    var el = document.getElementById('verLabel');
    return JSON.stringify({ flag: window.BETA_VER, label: el ? el.textContent : '' }); })()`);
  const V = JSON.parse(vers);
  ok('the BETA flag version matches the build it came from',
    V.label.split(' ')[0] === V.flag && /^(beta-|v)\d+$/.test(V.flag),
    'flag ' + V.flag + ', build "' + V.label.slice(0, 40) + '..."');

  /* autoFresh() is what makes an installed app update itself with no Update
     tap — Raja confirmed that behaviour on v134 and it is the reason the
     version label must increment. It works by REGEXING THE VERSION OUT OF THE
     PAGE TEXT, so it breaks silently the moment that text stops being a quoted
     literal — which is exactly what happened when BETA_VER became derived.
     Run the real regex against the real file and check it still finds the
     version this page is running. (fetch cannot run over file://, so the regex
     is applied to the shipped file on disk and compared with what the loaded
     page reports — same claim, and the regex is the fragile part, not the
     fetch.) */
  const src = fs.readFileSync(path.join(__dirname, '..', 'beta.html'), 'utf8');
  const liveRe = (src.match(/var m = txt\.match\((\/[^;]+\/)\);/) || [])[1];
  const found = (src.match(/BUILD_VER\s*=\s*'([^']+)'/) || [])[1];
  const running = await ev(`window.BETA_VER`);
  ok('auto-update still reads the version out of the page',
    !!found && found.split(' ')[0] === running,
    'regex found ' + (found ? found.split(' ')[0] : 'NOTHING') + ', page is running ' + running);
  ok('auto-update matches BUILD_VER, the one that is still a literal',
    !!liveRe && /BUILD_VER/.test(liveRe), liveRe || '(regex not found)');
  await ev(`document.querySelector('.splashPlay').click()`); await sleep(900);

  for (const key of ['fifteen', 'az', 'azn']){
    const cfg = BOARDS[key];
    await ev(`document.getElementById('tab-scHome').click()`); await sleep(220);
    await ev(`document.querySelector('.toggleBtn[data-slide-level="${key}"]').click()`); await sleep(700);

    const cut0 = await bubbleCut();
    ok(key + ": SaNa's opening hint fits the bubble", !cut0, cut0 || 'fits in 3 lines');

    /* Raja: "The blank slot should be ONE like original physical play board."
       Asserted on the board itself rather than trusting the level table — and
       per board, because the middle rung is the one place two spaces are right
       (26 letters cannot leave one). Blocks are measured too: the way to get a
       single gap was more columns, which shrinks them. */
    const c0 = await cells();
    const gaps = c0.filter(x => !x).length;
    ok(key + ': the board has exactly ' + cfg.gaps + ' empty space(s)', gaps === cfg.gaps, gaps + ' gaps');
    ok(key + ': every block is present and unique',
      new Set(c0.filter(Boolean)).size === cfg.tiles.length,
      new Set(c0.filter(Boolean)).size + ' distinct blocks, expected ' + cfg.tiles.length);
    /* The floor is the one the layout code itself enforces (34px), not the 44px
       finger guideline. Raja chose one gap on every board, and 26 letters can
       only do that at 3x9, which puts the blocks under 44 — but this app already
       ships 22px cells on the 10x10 magic square, and a slide block is dragged
       as well as tapped. The measured size is printed either way, so shrinking
       blocks stay visible rather than silently accepted. */
    const tile = await ev(`(function(){ var t=document.querySelector('#slideBoard .slideTile');
      if(!t) return 0; return Math.round(t.getBoundingClientRect().width); })()`);
    ok(key + ': blocks are at or above the layout floor of 34px', tile >= 34, tile + 'px');

    // every cell must be marked, and every cell in a row must agree
    const m0 = await marks();
    ok(key + ': every cell carries a row mark', m0.every(x => x !== '?'), m0.filter(x => x === '?').length + ' unmarked');
    let inconsistent = null;
    for (let r = 0; r < cfg.rows && !inconsistent; r++){
      const slice = m0.slice(r * cfg.cols, (r + 1) * cfg.cols);
      if (new Set(slice).size !== 1) inconsistent = 'row ' + r + ': ' + slice.join(',');
    }
    ok(key + ': all cells in a row share one colour', !inconsistent, inconsistent);

    // and the colour matches a hand-computed row state, after every real move
    let drift = null, moves = 0, sawOk = false, sawLost = false;
    let prevOk = expectedRows(await cells(), cfg).filter(Boolean).length;
    for (let step = 0; step < 30 && !drift; step++){
      const c0 = await cells(), want = expectedRows(c0, cfg), got = await marks();
      for (let r = 0; r < cfg.rows; r++){
        const isOk = got[r * cfg.cols] === 'ok';
        if (isOk !== want[r]){ drift = 'after ' + moves + ' moves, row ' + r + ' shows ' + (isOk ? 'green' : 'red') + ' but should be ' + (want[r] ? 'green' : 'red'); break; }
      }
      if (drift) break;
      const nowOk = want.filter(Boolean).length;
      if (nowOk > prevOk) sawOk = true;
      if (nowOk < prevOk) sawLost = true;
      prevOk = nowOk;
      const movable = await ev(`Array.from(document.querySelectorAll('#slideBoard .slideTile.canMove')).map(function(b){ return b.dataset.slide; })`);
      if (!movable.length) break;
      const pick = movable[Math.floor(Math.random() * movable.length)];
      await ev(`(function(){var e=document.querySelector('[data-slide="' + ${pick} + '"]'); if(e) e.click();})()`);
      await sleep(130); moves++;
    }
    ok(key + ': row colours match a hand count after each of ' + moves + ' moves', !drift, drift);
    /* Random play never completes a row, so the GREEN case was going untested —
       every assertion above was really only checking "red, correctly". So build
       the situation deliberately: plan a finished row, play it, watch it turn
       green, then disturb it and watch it go back to red.

       Planning it needed the right problem, not a cleverer search. Hill-climbing
       the live board was flaky, and greedy search over full board states sat on
       a plateau, because Manhattan distance over four blocks is nearly flat.
       But for "is THIS row finished?", only that row's blocks and the gaps have
       identity — every other block is interchangeable. Abstracting them away
       leaves a space small enough for plain BFS to return an exact plan:

         1-15, top row  : 4 blocks + 1 gap  over 16 cells -> ~520k states
         1-15, last row : 3 blocks + 1 gap  over 16 cells ->  ~44k states
         A-Z,  last row : 2 blocks + 2 gaps over 28 cells -> ~246k states

       Both rows of 1-15 are proved because they are the two SHAPES of row that
       exist: one made only of blocks, and one that must END in empty squares.
       A-Z's last row is proved as well — it is the only two-gap board left, so
       it is the only place the pick-then-choose move still gets played.
       See the note on BOARDS for why the 6x6 board is not planned. */
    const N = cfg.cols * cfg.rows;
    const nbrs = [];
    for (let i = 0; i < N; i++){
      const r = Math.floor(i / cfg.cols), c = i % cfg.cols, a = [];
      if (r > 0) a.push(i - cfg.cols);
      if (r < cfg.rows - 1) a.push(i + cfg.cols);
      if (c > 0) a.push(i - 1);
      if (c < cfg.cols - 1) a.push(i + 1);
      nbrs.push(a);
    }
    const stKey = (tp, gaps) => tp.join(',') + '|' + gaps.slice().sort((a, b) => a - b).join(',');
    /* A block touching TWO gaps makes the app ask which way to go: one tap
       selects it, a second on the space commits. Those moves must stay IN the
       search — the only way to bring two gaps side by side is to move the block
       between them, so excluding them makes a row ending in two spaces
       unreachable, which is exactly how this test first failed. */
    function succ(tp, gaps){
      const gapSet = new Set(gaps), out = [];
      for (const g of gaps){
        for (const n of nbrs[g]){
          if (gapSet.has(n)) continue;
          let touching = 0;
          for (const nn of nbrs[n]) if (gapSet.has(nn)) touching++;
          const ntp = tp.slice(), ti = tp.indexOf(n);
          if (ti >= 0) ntp[ti] = g;
          out.push({ tp: ntp, gaps: gaps.map(x => x === g ? n : x), from: n, to: g, ask: touching > 1 });
        }
      }
      return out;
    }
    function planRow(board, wantTiles, isGoal){
      const tp = wantTiles.map(w => board.indexOf(w.tile)), gaps = [];
      for (let i = 0; i < N; i++) if (!board[i]) gaps.push(i);
      if (tp.some(x => x < 0)) return null;
      if (isGoal(tp, gaps)) return [];
      const nodes = [{ tp, gaps, from: -1, to: -1, ask: false, parent: -1 }];
      const seen = new Set([stKey(tp, gaps)]);
      for (let head = 0; head < nodes.length; head++){
        for (const s of succ(nodes[head].tp, nodes[head].gaps)){
          const k = stKey(s.tp, s.gaps);
          if (seen.has(k)) continue;
          seen.add(k);
          nodes.push({ tp: s.tp, gaps: s.gaps, from: s.from, to: s.to, ask: s.ask, parent: head });
          if (isGoal(s.tp, s.gaps)){
            const path = [];
            for (let p = nodes.length - 1; p > 0; p = nodes[p].parent)
              path.unshift({ from: nodes[p].from, to: nodes[p].to, ask: nodes[p].ask });
            return path;
          }
        }
      }
      return null;
    }
    const click = i => ev(`(function(){var e=document.querySelector('[data-slide="' + ${i} + '"]'); if(e) e.click();})()`);

    for (const goalRow of cfg.goalRows){
      const wantTiles = [], wantEmpty = [];
      for (let c = 0; c < cfg.cols; c++){
        const i = goalRow * cfg.cols + c;
        if (i < cfg.tiles.length) wantTiles.push({ tile: cfg.tiles[i], home: i });
        else wantEmpty.push(i);
      }
      const shape = wantEmpty.length ? 'ends in an empty square' : 'all blocks';
      const isGoal = (tp, gaps) => wantTiles.every((w, i) => tp[i] === w.home)
        && wantEmpty.every(e => gaps.indexOf(e) >= 0);
      const label = key + ' row ' + goalRow + ' (' + shape + ')';

      const plan = planRow(await cells(), wantTiles, isGoal);
      if (plan){
        for (const mv of plan){
          await click(mv.from);
          if (mv.ask) await click(mv.to);      // it asked which space — answer it
        }
        await sleep(220);
      }
      const built = plan ? expectedRows(await cells(), cfg)[goalRow] : false;
      ok(label + ': deliberately finished', built,
        plan ? 'planned ' + plan.length + ' moves, board agrees: ' + built
             : 'no plan found — the green case stays unproven');
      if (!built) continue;

      const g = await marks();
      ok(label + ': shows GREEN', g[goalRow * cfg.cols] === 'ok', 'marked ' + g[goalRow * cfg.cols]);
      await shot('149-green-' + key + '-row' + goalRow + '.png');

      // disturb it — move one of that row's own blocks out into a gap
      const board = await cells();
      let moved = -1, dest = -1;
      for (let c = 0; c < cfg.cols && moved < 0; c++){
        const i = goalRow * cfg.cols + c;
        if (!board[i]) continue;
        for (const n of nbrs[i]) if (!board[n]){ moved = i; dest = n; break; }
      }
      if (moved >= 0){
        const ambiguous = nbrs[moved].filter(n => !board[n]).length > 1;
        await click(moved);
        if (ambiguous) await click(dest);
        await sleep(200);
        const after = await cells(), g2 = await marks();
        const stillRight = expectedRows(after, cfg)[goalRow];
        ok(label + ': goes back to RED when disturbed',
          !stillRight && g2[goalRow * cfg.cols] === 'bad',
          'now ' + g2[goalRow * cfg.cols] + ', hand count says ' + (stillRight ? 'ok' : 'bad'));
      } else {
        ok(label + ': goes back to RED when disturbed', false, 'no block in that row could move');
      }
    }

    // the last row includes cells that must END UP EMPTY — prove the check
    // handles that rather than only looking at blocks
    const lastRowStart = (cfg.rows - 1) * cfg.cols;
    const hasEmptyInGoal = lastRowStart + cfg.cols > cfg.tiles.length;
    if (hasEmptyInGoal){
      const c = await cells(), want = expectedRows(c, cfg), got = await marks();
      ok(key + ': the final row (which must end with empty cells) is judged correctly',
        (got[lastRowStart] === 'ok') === want[cfg.rows - 1],
        'shows ' + got[lastRowStart] + ', hand count says ' + (want[cfg.rows - 1] ? 'ok' : 'bad'));
    }
    // the shuffle hint is a different message — check it fits too
    await ev(`document.getElementById('slideShuffle').click()`); await sleep(400);
    const cut1 = await bubbleCut();
    ok(key + ": SaNa's shuffle hint fits the bubble", !cut1, cut1 || 'fits in 3 lines');
    await shot('147-rows-' + key + '.png');
  }

  const counter = await ev(`document.getElementById('slideHome').textContent`);
  ok('the counter now speaks in rows', /Rows done: \d+ of \d+/.test(counter), counter);

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  ws.close(); ch.kill();
  console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILURES'));
  process.exit(fail === 0 ? 0 : 1);
})();
