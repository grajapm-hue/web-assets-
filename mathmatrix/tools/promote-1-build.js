/* beta.html -> the live index.html, as v135.

   Beta is deliberately built WITHOUT what a real installable app needs, so it
   can never shadow the real one. Promotion has to put all of that back, and
   every item below is something that has bitten a previous promotion:
     - beta-manifest.json declares name "(Beta)" and start_url ./beta.html, so
       shipping it installs a Beta icon pointing at a 404
     - the service worker registers with {scope:'./beta.html'}, and that scope
       matches NOTHING under the name index.html — the page silently gets no
       worker at all and no offline play
     - the version label MUST change, or autoFresh() never reloads anyone
   Writes _index-built.html and reports what it changed. Nothing is published here. */
const fs = require('fs');
const path = require('path');

const NEW_VER = process.argv[2];
if (!/^v\d+$/.test(NEW_VER || '')) {
  console.error('usage: node promote-1-build.js vNNN   (e.g. v136)');
  process.exit(1);
}
const src = fs.readFileSync(path.join(__dirname, '..', 'beta.html'), 'utf8');
let out = src;
const notes = [];
function sub(label, re, rep, expect){
  const before = out;
  const hits = (out.match(re) || []).length;
  out = out.replace(re, rep);
  const ok = expect === undefined ? hits > 0 : hits === expect;
  notes.push({ label, hits, ok, changed: before !== out });
}

// 1. the manifest a real install needs
sub('beta-manifest.json -> manifest.json', /beta-manifest\.json/g, 'manifest.json');

// 2. the service worker, and its scope
sub("register('beta-sw.js', {scope}) -> register('sw.js')",
  /register\(\s*'beta-sw\.js'\s*,\s*\{[^}]*\}\s*\)/g, "register('sw.js')");
sub("any bare 'beta-sw.js' left", /'beta-sw\.js'/g, "'sw.js'", 0);

// 3. the version label. BETA_VER is derived, so only BUILD_VER changes.
sub('BUILD_VER -> ' + NEW_VER, /var BUILD_VER = '[^']+';/,
  "var BUILD_VER = '" + NEW_VER + "';", 1);

/* 4. Comments that describe beta's arrangement. Left alone they would state the
   opposite of what this file does — the next person reading index.html would be
   told its worker is narrowly scoped to a page that is not this one. */
sub('rewrite the service-worker scope comment',
  /\/\* Raja, after three rounds landing on the same wall without one: build the[\s\S]*?'mathmatrix-beta-v\*'\)\. \*\//,
  "/* Registered with its DEFAULT scope, which is this folder — correct here,\n" +
  "   because this file IS the app at the root of its own origin. The beta\n" +
  "   preview does the opposite on purpose: it registers beta-sw.js scoped to\n" +
  "   exactly './beta.html' so it can never claim these pages or collide with\n" +
  "   this worker's cache namespace ('mathmatrix-v*' vs 'mathmatrix-beta-v*'). */", 1);
sub('rewrite the getRegistration comment',
  /\/\/ getRegistration\(\) \(singular, no scope arg\) -- the registration that[\s\S]*?\/\/ this button should only ever touch beta's own state\./,
  "// getRegistration() (singular, no scope arg) -- the registration that\n" +
  "        // actually controls THIS document. Deliberately not getRegistrations()\n" +
  "        // (plural): that returns every SW registered for the whole origin,\n" +
  "        // which on a device that also has the beta preview installed would\n" +
  "        // unregister beta's worker too. This button should only ever touch\n" +
  "        // this app's own state.", 1);

/* 5. The one place the word BETA is actually READ by a player: the credit
   block. Live v134 words it "Found something odd? Tell us on the Feedback tab",
   so match that rather than invent a third wording. */
sub('credit line: BETA -> live wording',
  /<span style="color:#9A3412; font-weight:800;">BETA<\/span> — tell us what breaks\s*\n?\s*on the 💬 Feedback tab\./,
  '<span style="color:#9A3412; font-weight:800;">Found something odd?</span> Tell us on the 💬 Feedback tab.', 1);

/* The BETA flag element does not exist in either file — only its CSS, which
   live v134 carries too — so there is nothing to strip there. The <title> is
   already identical in both, so it is left alone rather than churned. */

fs.writeFileSync(path.join(__dirname, '_index-built.html'), out, 'utf8');

console.log('--- transformations ---');
notes.forEach(n => console.log((n.ok ? '  ok  ' : ' CHECK') + ' ' + n.label + '  (' + n.hits + ' hits)'));

console.log('\n--- what the built file says ---');
const show = (label, re) => {
  const m = out.match(re);
  console.log('  ' + label.padEnd(26) + (m ? m[0].slice(0, 78) : 'NOT FOUND'));
};
show('BUILD_VER', /var BUILD_VER = '[^']+';/);
show('BETA_VER', /window\.BETA_VER = [^;]+;/);
show('sw register', /register\('[^']+'[^)]*\)/);
show('manifest link', /<link[^>]+manifest[^>]*>/);
show('autoFresh regex', /var m = txt\.match\([^;]+\);/);

console.log('\n--- leftovers to eyeball ---');
const leftovers = [
  ['beta-sw', /beta-sw/g],
  ['beta-manifest', /beta-manifest/g],
  ['beta.html', /beta\.html/g],
  ['betaFlag class', /betaFlag/g],
  ['visible "Beta"/"BETA"', />[^<]*\b(Beta|BETA)\b[^<]*</g]
];
leftovers.forEach(([label, re]) => {
  const m = out.match(re) || [];
  console.log('  ' + label.padEnd(24) + m.length + (m.length ? '  e.g. ' + JSON.stringify(m[0].slice(0, 60)) : ''));
});

console.log('\nsize: beta ' + src.length + ' -> live ' + out.length);

/* The service worker is built HERE too, rather than left as a step to remember.
   Publishing index.html with an unchanged CACHE_VERSION means every device keeps
   serving the old page out of cache and nobody sees the release — the failure is
   silent, and the release looks fine from a desktop browser. The worker is taken
   from what is LIVE right now (not from beta-sw.js, which caches a different set
   of files under a different name) and only its version is changed. */
const swLive = require('child_process')
  .execSync('curl -s "https://kidsmathsmatrixpuzzle.github.io/sw.js?cb=' + NEW_VER + '"',
            { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const wasVer = (swLive.match(/CACHE_VERSION\s*=\s*'([^']+)'/) || [])[1];
if (!wasVer){
  console.log('\n CHECK  could not read CACHE_VERSION from the live sw.js — not written');
} else {
  const swOut = swLive.replace(/CACHE_VERSION\s*=\s*'[^']+'/, "CACHE_VERSION = 'mathmatrix-" + NEW_VER + "'");
  fs.writeFileSync(path.join(__dirname, '_sw-built.js'), swOut, 'utf8');
  console.log('  ok   sw.js CACHE_VERSION ' + wasVer + ' -> mathmatrix-' + NEW_VER);
  /* Every file the worker caches must exist, because cache.addAll() rejects
     WHOLESALE on a single 404 — one missing asset and the worker caches nothing
     at all, killing offline play with no error anyone would notice. */
  const listed = [...new Set((swOut.match(/'\.\/[^']*'/g) || [])
    .map(s => s.replace(/'/g, '').replace('./', '')))].filter(Boolean);
  const repo = JSON.parse(require('child_process')
    .execSync('gh api repos/KidsMathsMatrixPuzzle/kidsmathsmatrixpuzzle.github.io/contents --jq "[.[].name]"',
              { encoding: 'utf8' }));
  const missing = listed.filter(a => repo.indexOf(a) < 0);
  console.log((missing.length ? ' CHECK  ' : '  ok   ') + 'every cached asset exists  (' +
    listed.length + ' listed' + (missing.length ? ', MISSING: ' + missing.join(', ') : '') + ')');
}
