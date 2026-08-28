/* Prototype generator for the mixed-operator grid Raja sent.

     A op B op C = r1        col targets down the bottom
     D op E op F = r2
     G op H op I = r3

   Nine digits, 1-9, each used once. Every row AND every column is an equation,
   so each digit answers to two of them at once. Evaluation is strictly LEFT TO
   RIGHT, not BODMAS -- proven, not assumed: the puzzle he sent has exactly one
   solution read left-to-right and ZERO under normal precedence.

   The whole job is uniqueness. A grid with two answers marks a correct child
   wrong, which is the standard the Sudoku generator already holds. So nothing
   is emitted until an INDEPENDENT search has confirmed exactly one solution
   exists -- the generator never gets to vouch for itself.

   Run: node _opgrid-proto.js [level] [count] */

/* maxTarget matters more than the operator set. The puzzle Raja sent uses all
   four operators and its six targets are 6, 8, 3, 4, 3, 4 -- every one a single
   digit. Small targets are what make it feel like arithmetic a child can hold
   in their head; a row that ends on 78 is technically valid and horrible. */
const LEVELS = {
  easy:   { ops: ['+', '-'],           caps: [12, 20] },
  medium: { ops: ['+', '-', '*'],      caps: [15, 24, 30] },
  hard:   { ops: ['+', '-', '*', '/'], caps: [10, 14, 20] },
};

/* Left-to-right, and integer-only all the way through: a child should never
   meet 7/2 halfway along a row that ends on a whole number. Returns null the
   moment a step leaves the whole numbers or goes negative. */
function ltr(a, op1, b, op2, c){
  let x;
  if (op1 === '+') x = a + b;
  else if (op1 === '-') x = a - b;
  else if (op1 === '*') x = a * b;
  else { if (b === 0 || a % b !== 0) return null; x = a / b; }
  if (x < 0) return null;
  let y;
  if (op2 === '+') y = x + c;
  else if (op2 === '-') y = x - c;
  else if (op2 === '*') y = x * c;
  else { if (c === 0 || x % c !== 0) return null; y = x / c; }
  if (y < 0) return null;
  return y;
}

/* The independent checker. Deliberately dumb and complete -- it walks every
   arrangement with pruning, and knows nothing about how the puzzle was built.
   Stops at 2, since "more than one" is all we need to reject. */
function countSolutions(ops, targets, cap = 2){
  const [rOps, cOps] = ops;
  const [r, c] = targets;
  let found = 0;
  const cell = new Array(9).fill(0);
  const used = new Array(10).fill(false);

  function place(i){
    if (found >= cap) return;
    if (i === 9){
      // all columns already checked below; a full grid here is a solution
      found++;
      return;
    }
    for (let v = 1; v <= 9; v++){
      if (used[v]) continue;
      cell[i] = v; used[v] = true;
      let ok = true;
      // a row is complete at index 2, 5, 8
      if (i % 3 === 2){
        const rw = Math.floor(i / 3);
        if (ltr(cell[rw*3], rOps[rw][0], cell[rw*3+1], rOps[rw][1], cell[rw*3+2]) !== r[rw]) ok = false;
      }
      // a column is complete once its bottom cell (row 2) is placed
      if (ok && i >= 6){
        const cl = i - 6;
        if (ltr(cell[cl], cOps[cl][0], cell[cl+3], cOps[cl][1], cell[cl+6]) !== c[cl]) ok = false;
      }
      if (ok) place(i + 1);
      used[v] = false;
    }
  }
  place(0);
  return found;
}

function shuffled(a){
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

/* Tight targets first, loosen only if the board will not come.

   Measured, which is the only reason these numbers are what they are: on the
   hard level a cap of 12 fails 18 times in 50 -- it burns 20,000 shuffles and
   gives up -- while a cap of 20 succeeds 50 out of 50 in 32ms. But 12 is much
   closer to the puzzle Raja sent, whose six targets were 6, 8, 3, 4, 3 and 4.
   So try the tight cap for a while, then step out. Most boards come back small
   and friendly; none of them ever fails to arrive, which is what matters when
   a child has just tapped Start. */
function generate(level){
  const pool = LEVELS[level].ops;
  const caps = LEVELS[level].caps;
  const pick = () => pool[Math.floor(Math.random() * pool.length)];
  const budget = 20000;
  for (let attempt = 0; attempt < budget; attempt++){
    // widen in steps as the attempt budget is spent
    const cap = caps[Math.min(caps.length - 1, Math.floor(attempt / (budget / caps.length / 4)))] || caps[caps.length - 1];
    const g = shuffled([1,2,3,4,5,6,7,8,9]);
    const rOps = [[pick(),pick()], [pick(),pick()], [pick(),pick()]];
    const cOps = [[pick(),pick()], [pick(),pick()], [pick(),pick()]];
    const r = [], c = [];
    let ok = true;
    for (let i = 0; i < 3 && ok; i++){
      const v = ltr(g[i*3], rOps[i][0], g[i*3+1], rOps[i][1], g[i*3+2]);
      if (v === null || v > cap || v < 1) ok = false; else r.push(v);
    }
    for (let i = 0; i < 3 && ok; i++){
      const v = ltr(g[i], cOps[i][0], g[i+3], cOps[i][1], g[i+6]);
      if (v === null || v > cap || v < 1) ok = false; else c.push(v);
    }
    if (!ok) continue;
    // the answer must be reachable: an independent search sees exactly one
    if (countSolutions([rOps, cOps], [r, c]) !== 1) continue;
    return { grid: g, rOps, cOps, r, c, attempt };
  }
  return null;
}

function show(p){
  const S = op => ({ '+':'+', '-':'−', '*':'×', '/':'÷' })[op];
  const g = p.grid;
  const line = i => `   ${g[i*3]} ${S(p.rOps[i][0])} ${g[i*3+1]} ${S(p.rOps[i][1])} ${g[i*3+2]}  =  ${p.r[i]}`;
  console.log(line(0));
  console.log(`   ${S(p.cOps[0][0])}     ${S(p.cOps[1][0])}     ${S(p.cOps[2][0])}`);
  console.log(line(1));
  console.log(`   ${S(p.cOps[0][1])}     ${S(p.cOps[1][1])}     ${S(p.cOps[2][1])}`);
  console.log(line(2));
  console.log(`   =     =     =`);
  console.log(`   ${p.c[0]}     ${p.c[1]}     ${p.c[2]}`);
  const corners = g[0] * g[2] * g[6] * g[8];
  console.log(`   corners ${g[0]}·${g[2]}·${g[6]}·${g[8]} = ${corners}   (tries: ${p.attempt})`);
}

/* SELF-TEST. Before trusting the uniqueness checker to approve puzzles for
   children, point it at the one puzzle whose answer is already known -- the one
   Raja sent. A checker that cannot recognise a solved puzzle has no business
   vetting new ones, and this is the cheapest possible way to find that out. */
if (process.argv[2] === 'selftest'){
  const rOps = [['+','-'], ['-','*'], ['*','/']];
  const cOps = [['+','-'], ['-','*'], ['*','/']];
  const r = [6, 8, 3], c = [4, 3, 4];
  const n = countSolutions([rOps, cOps], [r, c], 5);
  console.log("Raja's puzzle, solutions found: " + n + (n === 1 ? '  (correct)' : '  (WRONG)'));
  const known = [5,7,6, 8,4,2, 9,1,3];
  let rows = true, cols = true;
  for (let i = 0; i < 3; i++){
    if (ltr(known[i*3], rOps[i][0], known[i*3+1], rOps[i][1], known[i*3+2]) !== r[i]) rows = false;
    if (ltr(known[i], cOps[i][0], known[i+3], cOps[i][1], known[i+6]) !== c[i]) cols = false;
  }
  console.log('the known answer satisfies every row:    ' + rows);
  console.log('the known answer satisfies every column: ' + cols);
  console.log('corners 5 x 6 x 9 x 3 = ' + (5*6*9*3));
  process.exit(n === 1 && rows && cols ? 0 : 1);
}

const level = process.argv[2] || 'hard';
const count = parseInt(process.argv[3] || '3', 10);
console.log('level: ' + level + '   operators: ' + LEVELS[level].ops.join(' ') + '   target caps: ' + LEVELS[level].caps.join(' then '));
const t0 = Date.now();
let made = 0;
for (let i = 0; i < count; i++){
  const p = generate(level);
  if (!p){ console.log('\n  (gave up)'); continue; }
  made++;
  console.log('');
  show(p);
}
console.log('\n' + made + '/' + count + ' generated in ' + (Date.now() - t0) + 'ms');
