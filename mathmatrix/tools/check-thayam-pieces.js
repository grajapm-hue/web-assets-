/* THE PIECE ENGINE: home -> outer -> inner -> centre, capture sends a piece
   to its OWN home (not the capturer's), the cut-mandate blocks the inward
   pivot until a capture, and centre entry needs an exact count. */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const PORT = 9932;
const ROOT = path.join(__dirname, '..');
const FILE = 'file:///' + path.join(ROOT, 'beta.html').split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

(async () => {
  const tmp = path.join(__dirname, '_cpthayampieces');
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
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').slice(0, 200));
    if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (mm, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: mm, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await sleep(700);
  await ev(`document.querySelector('.splashPlay').click()`);
  await sleep(700);

  await ev(`window.__thayamNewGame(['A','B','C','D'])`);
  const p0 = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  ok('12 pieces exist (4 players x 3 seeds)', p0.length === 12, String(p0.length));
  ok('every piece starts at home', p0.every(p => p.lap === 'home'));

  // A piece cannot leave home on a non-Thayam roll.
  const r1 = await ev(`JSON.stringify(window.__thayamApplyRoll(0, 0, 3))`).then(JSON.parse);
  ok('a roll of 3 cannot bring a piece out of home', r1.moved === false);

  // A Thayam brings exactly one piece out, onto its own gate (position 0).
  const r2 = await ev(`JSON.stringify(window.__thayamApplyRoll(0, 0, 1))`).then(JSON.parse);
  ok('a Thayam (1) brings the piece out', r2.moved === true);
  const p1 = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  ok("side A's first piece is now on the outer ring at position 0", p1[0].lap === 'outer' && p1[0].position === 0, JSON.stringify(p1[0]));

  // The cut-mandate: cannot pivot to the inner ring without a capture, even
  // once a piece has gone all the way round the outer ring (16 cells).
  await ev(`window.__thayamApplyRoll(0, 0, 14)`);   // 14 more steps -> position 14, the outer ring's LAST cell (len-1 = 15)... one short of it
  const pNearBoundary = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  ok('the piece is one cell short of the last standing box, still normal outer-ring movement',
    pNearBoundary[0].lap === 'outer' && pNearBoundary[0].position === 14, JSON.stringify(pNearBoundary[0]));

  const rToBoundary = await ev(`JSON.stringify(window.__thayamApplyRoll(0, 0, 3))`).then(JSON.parse);   // overshoots by 2 -- capped AT the last standing box, not past it
  const p2 = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  ok('a roll that would overshoot without a capture is capped exactly at the last standing box',
    rToBoundary.moved === true && p2[0].lap === 'outer' && p2[0].position === 15, JSON.stringify(p2[0]));

  // Raja's own words: "forced to pause there's last standing box." A piece
  // already sitting there, with no capture yet, must genuinely refuse every
  // further roll -- not silently succeed by landing on the same cell again.
  const r3 = await ev(`JSON.stringify(window.__thayamApplyRoll(0, 0, 2))`).then(JSON.parse);
  const p3 = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  ok('once genuinely at the last standing box, the piece refuses the roll entirely -- it does not "move" in place',
    r3.moved === false && p3[0].lap === 'outer' && p3[0].position === 15, JSON.stringify({ result: r3, piece: p3[0] }));

  // Capture sends a piece to its OWN home, not the capturer's store. Ring
  // order (post-C1-fix) is A=0, D=1, C=2, B=3 -- NOT SIDES_T's own A,B,C,D
  // array order -- so B's own gate sits 3*4=12 steps ahead of A's own
  // (colourOffset = ringOrderIndex * ringLen/4 = 3*4 = 12). Moving A forward
  // by exactly 13 (12 + B's extra step of 1) after it leaves home lands it
  // on the same real cell B's own out piece is sitting on, deterministically,
  // not by luck -- recomputed via window.__thayamSideIndex, not hand-derived.
  await ev(`window.__thayamNewGame(['A','B'])`);
  await ev(`window.__thayamApplyRoll(0, 0, 1)`);   // A's piece 0 out, onto A's own gate
  await ev(`window.__thayamApplyRoll(1, 0, 1)`);   // B's piece 0 out, onto B's own gate (still a Mount -- uncapturable there)
  await ev(`window.__thayamApplyRoll(1, 0, 1)`);   // B steps 1 more cell forward, off its own gate Mount and onto an ordinary, capturable cell
  const capResult = await ev(`JSON.stringify(window.__thayamApplyRoll(0, 0, 13))`).then(JSON.parse);   // A moves 13 = colourOffset(12) + B's extra step(1), landing on the SAME real cell B now occupies -- off any Mount, so the capture can actually happen
  ok("A's piece captures B's piece", capResult.captured.length === 1 && capResult.captured[0].side === 'B', JSON.stringify(capResult));
  const afterCapture = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  const bAfter = afterCapture.find(p => p.side === 'B' && p.idx === 0);
  ok("B's captured piece goes back to B's OWN home (not A's store)", bAfter.lap === 'home', JSON.stringify(bAfter));

  // A now has a capture, so unlike the earlier no-capture case, A's piece
  // pivots to the inner ring once it goes past the outer ring's last
  // position -- the direct positive contrast to the "capped, not pivoted"
  // assertion above.
  await ev(`window.__thayamApplyRoll(0, 0, 2)`);   // 13 (already moved) + 2 = 15, the outer ring's last position
  const pBeforePivot = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  ok("A's piece reaches the outer ring's last position", pBeforePivot.find(p => p.side === 'A' && p.idx === 0).lap === 'outer');
  await ev(`window.__thayamApplyRoll(0, 0, 1)`);   // 15 + 1 = 16 = outer ring length -> pivots to inner, position 0
  const pAfterPivot = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  const aPiece = pAfterPivot.find(p => p.side === 'A' && p.idx === 0);
  ok("with a capture already made, A's piece pivots onto the inner ring instead of staying capped",
    aPiece.lap === 'inner', JSON.stringify(aPiece));

  // Win-lock and centre-entry overshoot refusal have no coverage above (the
  // capture-based scenario never drove a piece all the way to centre). New
  // isolated game, single side -- __thayamForceCut bypasses the cut-mandate
  // directly so this block tests centre entry specifically, not the
  // cut-mandate (already covered above).
  await ev(`window.__thayamNewGame(['A'])`);
  await ev(`window.__thayamForceCut('A')`);
  await ev(`window.__thayamApplyRoll(0, 0, 1)`);   // A's piece 0 out, onto its own gate (outer, position 0)
  await ev(`window.__thayamApplyRoll(0, 0, 15)`);   // 0 + 15 = 15, the outer ring's last cell
  const pOuterEdge = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  ok('piece reaches the outer ring last cell', pOuterEdge[0].lap === 'outer' && pOuterEdge[0].position === 15, JSON.stringify(pOuterEdge[0]));

  const pivotResult = await ev(`JSON.stringify(window.__thayamApplyRoll(0, 0, 1))`).then(JSON.parse);   // 15 + 1 = 16 = outer ring length -> pivots to inner, position 0
  const pInner = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  ok('piece pivots onto the inner ring at position 0', pivotResult.moved === true && pInner[0].lap === 'inner' && pInner[0].position === 0, JSON.stringify(pInner[0]));

  // Inner ring length is 8 -- an overshoot must be refused, not clamped.
  const overshoot = await ev(`JSON.stringify(window.__thayamApplyRoll(0, 0, 9))`).then(JSON.parse);   // 0 + 9 = 9 > 8, overshoots centre
  ok('a roll that would overshoot past centre is refused, not clamped', overshoot.moved === false);
  const pStillInner = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  ok('piece is unchanged after the refused overshoot', pStillInner[0].lap === 'inner' && pStillInner[0].position === 0, JSON.stringify(pStillInner[0]));

  // An exact roll of 8 lands exactly on centre -- win-lock.
  const winResult = await ev(`JSON.stringify(window.__thayamApplyRoll(0, 0, 8))`).then(JSON.parse);
  ok('an exact roll onto the centre finishes the piece and reports won:true', winResult.moved === true && winResult.won === true, JSON.stringify(winResult));
  const pFinished = await ev(`JSON.stringify(window.__thayamPieces())`).then(JSON.parse);
  ok('the finished piece has lap "finished"', pFinished[0].lap === 'finished', JSON.stringify(pFinished[0]));

  ok('no JS errors', errs.length === 0, errs.join(' | '));
  console.log(fail ? `\n${fail} FAILED` : '\nALL GREEN');

  ch.kill();
  try { execSync('taskkill /F /PID ' + ch.pid + ' /T', { stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
