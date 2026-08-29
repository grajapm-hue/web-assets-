/* Run one guard repeatedly and report how many runs were green.

   A guard that passes once tells you nothing about a guard that was failing
   two runs in five. check-sudoku.js was doing exactly that -- on the base
   commit as well, so it was never anyone's regression -- because it asserted
   things that were only true of some deals: that filling a box greens nothing
   else (it can also finish a row), that a given happens to sit where the first
   square can see it, and it raced its own erase key. Each of those looks like
   a product bug in a single run and is only visible as a rate.

   Run: node run-repeat.js check-sudoku.js 10 */
const { spawnSync } = require('child_process');
const file = process.argv[2] || 'check-sudoku.js';
const N = +(process.argv[3] || 8);
let green = 0; const fails = [];
for (let i = 0; i < N; i++){
  const r = spawnSync(process.execPath, [file], { cwd: __dirname, encoding: 'utf8' });
  if (r.status === 0) green++;
  else fails.push((r.stdout || '').split('\n').filter(l => /FAIL/.test(l)).map(l => l.trim()).join(' ;; '));
  process.stdout.write(r.status === 0 ? 'G' : 'F');
}
console.log('\n' + file + ': ' + green + '/' + N + ' green');
fails.forEach(f => console.log('   ' + f.slice(0, 220)));
process.exit(green === N ? 0 : 1);
