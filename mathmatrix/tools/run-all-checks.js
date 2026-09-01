/* Run every permanent guard, one at a time, and print a single verdict.
   Every one of these exists because something reached Raja's phone broken, so
   the whole set runs before any ship -- and the ONLY line that matters at the
   end is the count of failures, not a wall of PASS lines.

   Serial on purpose. This machine's disk latency swings about 3x on identical
   work, and each check drives a real headless Chrome; run in parallel they
   fail on timing rather than on the product.

   Run: node run-all-checks.js            (all of them)
        node run-all-checks.js badge win  (only names containing badge or win) */
const { spawnSync } = require('child_process');
const fs = require('fs'); const path = require('path');

const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname)
  .filter(f => /^check-.*\.js$/.test(f))
  /* check-backup-bundle.js is a promotion-time tool, not a permanent guard:
     it needs a vNNN argument and holds only while the LIVE site still serves
     that exact version -- in this suite it just dies on its usage line in 0s.
     Run it by hand after building a bundle: node check-backup-bundle.js vNNN */
  .filter(f => f !== 'check-backup-bundle.js')
  .filter(f => !only.length || only.some(w => f.includes(w)))
  .sort();

if (!files.length){ console.log('no checks matched ' + only.join(' ')); process.exit(1); }

const failed = [];
const t0 = Date.now();
console.log('Running ' + files.length + ' guard' + (files.length > 1 ? 's' : '') + '\n');

for (const f of files){
  const started = Date.now();
  process.stdout.write('  ' + f.padEnd(34));
  const r = spawnSync(process.execPath, [f], { cwd: __dirname, encoding: 'utf8' });
  const secs = ((Date.now() - started) / 1000).toFixed(0) + 's';
  if (r.status === 0){ console.log('GREEN'.padEnd(14) + secs); continue; }
  console.log('*** FAIL ***'.padEnd(14) + secs);
  /* Keep the failing output, not the passing noise -- the reason a run is
     worth reading is the thing that broke. */
  const out = (r.stdout || '') + (r.stderr || '');
  failed.push({ f: f, lines: out.split('\n').filter(l => /FAIL|Error|error:/.test(l)).slice(0, 12), out: out });
}

const mins = ((Date.now() - t0) / 60000).toFixed(1);
if (!failed.length){
  console.log('\nALL ' + files.length + ' GUARDS GREEN   (' + mins + ' min)');
  process.exit(0);
}
console.log('\n' + failed.length + ' of ' + files.length + ' FAILED   (' + mins + ' min)\n');
for (const x of failed){
  console.log('--- ' + x.f);
  console.log(x.lines.length ? x.lines.map(l => '    ' + l.trim()).join('\n')
                             : '    (no FAIL line; full output in ' + x.f + '.log)');
  fs.writeFileSync(path.join(__dirname, x.f + '.log'), x.out);
}
process.exit(1);
