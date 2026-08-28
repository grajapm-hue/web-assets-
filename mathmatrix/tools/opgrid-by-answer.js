/* Raja: "how do you choose the right and bottom numbers to match the corner
   number -- is there any calculation behind it?"

   The honest answer is that there is NO calculation in that direction, and the
   reason is structural rather than a limitation of the code:

     - each of the six targets is fixed by THREE particular digits and TWO
       operators, the moment those are placed. Nothing is chosen.
     - each corner digit sits in one row AND one column, so it is tangled with
       the five non-corner digits inside four different equations.
     - so the corner product is a CONSEQUENCE of the arrangement, never an
       input to it. You cannot run the targets backwards out of 384.

   But the thing he is really reaching for does exist: pick the answer FIRST,
   then go and find a puzzle that has it. That is not a formula, it is a
   search -- and it works, because 384 pins the corner digits to {2,4,6,8},
   which cuts the space from 362,880 arrangements down to 2,880.

   Run: node opgrid-by-answer.js 384 */

const OPS = { '+':(a,b)=>a+b, '-':(a,b)=>a-b, '*':(a,b)=>a*b,
              '/':(a,b)=> (b!==0 && a%b===0) ? a/b : null };
const SY  = { '+':'+', '-':'−', '*':'×', '/':'÷' };

function ltr(a,o1,b,o2,c){
  const x = OPS[o1](a,b); if (x===null||x<0) return null;
  const y = OPS[o2](x,c); if (y===null||y<0) return null;
  return y;
}

/* which sets of four distinct digits multiply to this? */
function cornerSets(product){
  const out = [];
  for (let a=1;a<=9;a++) for (let b=a+1;b<=9;b++)
    for (let c=b+1;c<=9;c++) for (let d=c+1;d<=9;d++)
      if (a*b*c*d === product) out.push([a,b,c,d]);
  return out;
}

function countSolutions(rOps,cOps,r,c,stopAt){
  let found=0; const cell=[], used=new Array(10).fill(false);
  (function place(i){
    if (found>=stopAt) return;
    if (i===9){ found++; return; }
    for (let v=1;v<=9;v++){
      if (used[v]) continue;
      cell[i]=v; used[v]=true;
      let ok=true;
      if (i%3===2){ const rw=(i/3)|0;
        if (ltr(cell[rw*3],rOps[rw][0],cell[rw*3+1],rOps[rw][1],cell[rw*3+2])!==r[rw]) ok=false; }
      if (ok&&i>=6){ const cl=i-6;
        if (ltr(cell[cl],cOps[cl][0],cell[cl+3],cOps[cl][1],cell[cl+6])!==c[cl]) ok=false; }
      if (ok) place(i+1);
      used[v]=false;
    }
  })(0);
  return found;
}

/* the same reasoning gate the playable page uses: a puzzle nobody can reason
   their way through is not worth handing to a child, whatever its answer */
function deduce(P){
  const cand = Array.from({length:9}, () => [1,2,3,4,5,6,7,8,9]);
  const eqs = [];
  for (let i=0;i<3;i++) eqs.push({cells:[i*3,i*3+1,i*3+2], ops:P.rOps[i], target:P.r[i]});
  for (let i=0;i<3;i++) eqs.push({cells:[i,i+3,i+6],       ops:P.cOps[i], target:P.c[i]});
  let changed=true, guard=0;
  while (changed && guard++ < 60){
    changed=false;
    for (const eq of eqs){
      const ways=[];
      for (const a of cand[eq.cells[0]]) for (const b of cand[eq.cells[1]]){
        if (b===a) continue;
        for (const c of cand[eq.cells[2]]){
          if (c===a||c===b) continue;
          if (ltr(a,eq.ops[0],b,eq.ops[1],c)===eq.target) ways.push([a,b,c]);
        }
      }
      if (!ways.length) return false;
      for (let k=0;k<3;k++){
        const allow = new Set(ways.map(w=>w[k])), idx = eq.cells[k];
        const before = cand[idx].length;
        cand[idx] = cand[idx].filter(v=>allow.has(v));
        if (cand[idx].length < before) changed = true;
      }
    }
    for (let i=0;i<9;i++){
      if (cand[i].length!==1) continue;
      const v = cand[i][0];
      for (let j=0;j<9;j++){
        if (j===i || !cand[j].includes(v)) continue;
        cand[j] = cand[j].filter(x=>x!==v);
        changed = true;
      }
    }
  }
  return cand.every(s=>s.length===1);
}

function perms(arr){
  if (arr.length<=1) return [arr];
  const out=[];
  arr.forEach((v,i)=>{
    const rest = arr.slice(0,i).concat(arr.slice(i+1));
    for (const p of perms(rest)) out.push([v, ...p]);
  });
  return out;
}

const OPSET = ['+','-','*','/'];
function findPuzzle(product, maxTarget = 20){
  const sets = cornerSets(product);
  if (!sets.length) return { error:'no four digits multiply to ' + product };
  if (sets.length > 1) return { error:product + ' is ambiguous: ' +
    sets.map(s=>'{'+s.join(',')+'}').join(' and ') + ' — the reverse question has no single answer' };

  const corner = sets[0];
  const middle = [1,2,3,4,5,6,7,8,9].filter(d => !corner.includes(d));
  const cornerPerms = perms(corner), middlePerms = perms(middle);
  let tried = 0;

  // corners sit at 0,2,6,8 ; the other five fill 1,3,4,5,7
  for (const cp of cornerPerms) for (const mp of middlePerms){
    const g = [];
    g[0]=cp[0]; g[2]=cp[1]; g[6]=cp[2]; g[8]=cp[3];
    g[1]=mp[0]; g[3]=mp[1]; g[4]=mp[2]; g[5]=mp[3]; g[7]=mp[4];
    /* operators are the only free choice left, and even they are not chosen to
       hit a number -- every combination is tried and the targets simply fall
       out of whichever one survives */
    for (let n=0;n<4096;n++){
      tried++;
      const pickOp = k => OPSET[(n >> (k*2)) & 3];
      const rOps=[[pickOp(0),pickOp(1)],[pickOp(2),pickOp(3)],[pickOp(4),pickOp(5)]];
      const cOps=[[pickOp(6),pickOp(7)],[pickOp(8),pickOp(9)],[pickOp(10),pickOp(11)]];
      const r=[], c=[]; let ok=true, v;
      for (let i=0;i<3&&ok;i++){ v=ltr(g[i*3],rOps[i][0],g[i*3+1],rOps[i][1],g[i*3+2]);
        if (v===null||v<1||v>maxTarget) ok=false; else r.push(v); }
      for (let i=0;i<3&&ok;i++){ v=ltr(g[i],cOps[i][0],g[i+3],cOps[i][1],g[i+6]);
        if (v===null||v<1||v>maxTarget) ok=false; else c.push(v); }
      if (!ok) continue;
      if (countSolutions(rOps,cOps,r,c,2)!==1) continue;
      const P = { grid:g, rOps, cOps, r, c };
      if (!deduce(P)) continue;
      return { P, tried, corner };
    }
  }
  return { error:'searched ' + tried + ' combinations, none worked', corner };
}

const want = parseInt(process.argv[2] || '384', 10);
console.log('Asked for a puzzle whose four corners multiply to ' + want + '\n');
const sets = cornerSets(want);
console.log('  step 1 — which four digits can multiply to ' + want + '?');
console.log('           ' + (sets.length ? sets.map(s=>'{'+s.join(', ')+'}').join('   ') : 'none'));
if (sets.length === 1)
  console.log('           one set only, so the corner digits are forced: {' + sets[0].join(', ') + '}');

const t0 = Date.now();
const res = findPuzzle(want);
if (res.error){ console.log('\n  ' + res.error); process.exit(1); }

const g = res.P.grid;
const step = (a,o1,b,o2,c) =>
  (o1==='+'||o1==='-') && (o2==='+'||o2==='-')
    ? `${a} ${SY[o1]} ${b} ${SY[o2]} ${c}`
    : `(${a} ${SY[o1]} ${b}) ${SY[o2]} ${c}`;

console.log('  step 2 — put those four in the corners, the other five between them');
console.log('  step 3 — try operator sets; the targets are whatever they come out as');
console.log('  step 4 — keep it only if it has ONE answer and can be reasoned out\n');
console.log('  found after ' + res.tried.toLocaleString() + ' combinations, ' + (Date.now()-t0) + 'ms\n');
for (let i=0;i<3;i++)
  console.log('   Row ' + (i+1) + '   ' + step(g[i*3],res.P.rOps[i][0],g[i*3+1],res.P.rOps[i][1],g[i*3+2]).padEnd(16) + ' = ' + res.P.r[i]);
for (let i=0;i<3;i++)
  console.log('   Col ' + (i+1) + '   ' + step(g[i],res.P.cOps[i][0],g[i+3],res.P.cOps[i][1],g[i+6]).padEnd(16) + ' = ' + res.P.c[i]);
console.log('\n   corners ' + g[0] + ' × ' + g[2] + ' × ' + g[6] + ' × ' + g[8] +
            ' = ' + (g[0]*g[2]*g[6]*g[8]));
