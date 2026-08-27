/* Raja's iPhone stayed on v139 no matter how often he tapped Online Update.

   Every build carries its own updater, and the one shipped in v139 finds the
   version by grepping the page it fetches for a QUOTED literal:

       txt.match(/window\.BETA_VER\s*=\s*'([^']+)'/)

   That literal stopped existing when BETA_VER became derived from BUILD_VER.
   So an old install fetches the newest page, matches nothing, returns early,
   and decides there is nothing newer -- silently, permanently. Nothing to do
   with iOS: every install older than that change is stranded identically.

   beta.html now carries a beacon those old updaters can still read. This file
   guards it, and the guard matters more than the beacon: a beacon frozen at an
   old number strands people exactly as thoroughly as no beacon at all, and it
   would do it while looking present and correct.

   Runs on the SOURCE text, no browser needed -- the thing being tested is what
   an old client's regex sees in the bytes we serve. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, process.env.MM_TARGET || 'beta.html');
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x !== undefined ? '  -> ' + x : '')); if (!c) fail++; };

const src = fs.readFileSync(FILE, 'utf8');

// exactly the pattern the stranded builds run
const OLD_CLIENT = /window\.BETA_VER\s*=\s*'([^']+)'/;

const build = (src.match(/var BUILD_VER = '([^']+)';/) || [])[1];
ok('the page declares a BUILD_VER', !!build, build || '(none)');
const shortVer = (build || '').split(' ')[0];

const beacon = src.match(OLD_CLIENT);
ok('an old install can still find a version on this page', !!beacon,
   beacon ? beacon[1] : 'NO MATCH -- every pre-derived-BETA_VER install is stranded');
ok('the beacon is THIS build, not a stale one', beacon && beacon[1] === shortVer,
   (beacon ? beacon[1] : '(none)') + ' vs ' + shortVer);

/* Only one match may exist. A second, older copy earlier in the file would be
   the one an old client finds -- String.match returns the FIRST hit -- and it
   would happily report an ancient version as the newest available. */
const all = src.match(/window\.BETA_VER\s*=\s*'[^']+'/g) || [];
ok('there is exactly ONE such literal, so the first match is the right one',
   all.length === 1, all.length + ' found: ' + all.join(' | '));

/* The decisive one: replay the stranded build's ACTUAL updater against this
   page. Copied verbatim from git (5b6f904^), not paraphrased -- note it uses
   the matched value DIRECTLY, with no .split(), which is why the beacon has to
   carry the short version and not the long descriptive BUILD_VER string. */
function strandedClientWouldUpdate(pageText, installedVer){
  const m = pageText.match(/window\.BETA_VER\s*=\s*'([^']+)'/);
  if (!m || !m[1] || m[1] === installedVer) return false;   // it gives up here
  return m[1];                                              // it reloads to this
}
const rescued = strandedClientWouldUpdate(src, 'v139');
ok('a v139 install replaying its own updater now decides to update',
   rescued === shortVer, rescued ? 'would reload to ' + rescued : 'would STAY on v139');
ok('and an install already on this version is left alone (no reload loop)',
   strandedClientWouldUpdate(src, shortVer) === false);

/* The live app's own updater reads BUILD_VER instead; it must keep working. */
ok('the current updater still greps BUILD_VER', /txt\.match\(\/BUILD_VER/.test(src));
ok('BETA_VER is still DERIVED, not a second source of truth',
   /window\.BETA_VER = BUILD_VER\.split/.test(src));

/* "Online Update" must clear the caches this build actually writes. Live ships
   caches called mathmatrix-v148 while beta writes mathmatrix-beta-v248, and the
   promotion had never rewritten this filter -- so the live button hunted for
   beta caches, found none, emptied nothing, and left the stale page in place. */
const swName = (src.match(/register\('([^']+)'/) || [])[1] || '';
const isLive = swName === 'sw.js';
const clears = (src.match(/k\.indexOf\('([^']+)'\) === 0/) || [])[1];
ok('Online Update clears a cache namespace', !!clears, clears || '(none)');
if (isLive) {
  ok('the LIVE build clears live caches (mathmatrix-*), not beta ones',
     clears === 'mathmatrix-', clears);
} else {
  ok('the BETA build clears only its own caches', clears === 'mathmatrix-beta-', clears);
}

console.log(fail ? '\n' + fail + ' FAILURES' : '\nALL GREEN');
process.exit(fail ? 1 : 0);
