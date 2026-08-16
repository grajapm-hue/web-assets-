/* Build two restorable backups:
     mathmatrix-live-v135.zip   — the app children actually load
     mathmatrix-beta-154.zip    — the test build

   The live files are pulled from the LIVE REPO rather than from this repo's
   mirror, because the mirror has drifted before and a backup that quietly
   captures the wrong thing is worse than no backup. Every download is checked
   against the size the API reports, so a truncated file cannot slip in. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIVE = 'KidsMathsMatrixPuzzle/kidsmathsmatrixpuzzle.github.io';
const stage = f => path.join(__dirname, '_stage', f);
const api = a => JSON.parse(execSync('gh api ' + a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

fs.rmSync(path.join(__dirname, '_stage'), { recursive: true, force: true });
fs.mkdirSync(stage('live'), { recursive: true });
fs.mkdirSync(stage('live/beta'), { recursive: true });
fs.mkdirSync(stage('beta'), { recursive: true });

/* ---------- LIVE ---------- */
const listing = api(`repos/${LIVE}/contents`);
let bad = [];
function pull(remote, local, expect){
  const url = `https://raw.githubusercontent.com/${LIVE}/main/${remote}`;
  execSync(`curl -sL "${url}" -o "${local}"`, { stdio: 'pipe' });
  const got = fs.statSync(local).size;
  if (expect !== undefined && got !== expect) bad.push(`${remote}: got ${got}, expected ${expect}`);
  return got;
}
let liveBytes = 0, liveCount = 0;
for (const f of listing){
  if (f.type !== 'file') continue;
  liveBytes += pull(f.name, stage('live/' + f.name), f.size);
  liveCount++;
}
// the /beta preview hosted on the live site is part of that site too
for (const f of api(`repos/${LIVE}/contents/beta`)){
  if (f.type !== 'file') continue;
  liveBytes += pull('beta/' + f.name, stage('live/beta/' + f.name), f.size);
  liveCount++;
}
console.log('live : ' + liveCount + ' files, ' + Math.round(liveBytes / 1024) + ' KB');

/* ---------- BETA ---------- */
/* Exactly what beta needs to run: its three own files, plus every asset its
   service worker caches. Anything the worker lists but the folder lacks would
   make cache.addAll() reject and cache NOTHING, so the list is taken from the
   worker itself rather than typed out by hand. */
const swSrc = fs.readFileSync(path.join(__dirname, '..', 'beta-sw.js'), 'utf8');
const cached = [...new Set((swSrc.match(/'\.\/[^']+'/g) || [])
  .map(s => s.replace(/'/g, '').replace('./', '')))].filter(Boolean);
const betaFiles = [...new Set(['beta.html', 'beta-sw.js', 'beta-manifest.json'].concat(cached))];
let betaBytes = 0;
for (const f of betaFiles){
  const src = path.join(__dirname, '..', f);
  if (!fs.existsSync(src)){ bad.push('beta asset missing from mathmatrix/: ' + f); continue; }
  fs.copyFileSync(src, stage('beta/' + f));
  betaBytes += fs.statSync(src).size;
}
console.log('beta : ' + betaFiles.length + ' files, ' + Math.round(betaBytes / 1024) + ' KB');
console.log('       (asset list read from beta-sw.js, not typed by hand)');

if (bad.length){
  console.log('\nPROBLEMS:');
  bad.forEach(b => console.log('  ' + b));
  process.exit(1);
}
console.log('\nstaged clean — no size mismatches, no missing assets');
