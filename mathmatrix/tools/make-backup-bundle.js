/* Build Raja's personal backup bundle for a published version.

     node make-backup-bundle.js v152       the live site
     node make-backup-bundle.js beta-255   the beta preview

   What comes out is a folder that owes nothing to this machine, this repo, or
   whoever built it. Two copies of the game and the papers that explain them:

     EDIT-THIS-MathMatrix-<ver>.html      the live page exactly as published.
                                          Readable, editable, and the one to
                                          work on. Needs the loose picture
                                          files beside it.

     PUBLISH-THIS-MathMatrix-<ver>.html   the same page with every picture, the
                                          music, the icons and the manifest
                                          folded inside it. One file, nothing
                                          beside it, works from a folder with
                                          no signal at all.

   The split matters: a 3 MB file with a megabyte of base64 in the middle is
   miserable to edit, and a file that needs eight pictures beside it is
   miserable to send. So there is one of each.

   Everything is fetched from the LIVE SITE, not from this checkout. A backup
   of what we think we published is worth nothing; this is a backup of what is
   actually there. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const VER = process.argv[2];
if (!/^(v\d+|beta-\d+)$/.test(VER || '')) {
  console.error('usage: node make-backup-bundle.js vNNN     (the live site)');
  console.error('       node make-backup-bundle.js beta-NNN (the beta preview)');
  process.exit(1);
}

/* The beta is a different site with differently-named plumbing, and every one
   of those names is load-bearing: the manifest it links, the worker it
   registers, and the page itself. Naming them once here is what lets the rest
   of this file stay a single code path instead of two that drift apart. */
const BETA = VER.startsWith('beta-');
const SITE = BETA ? 'https://grajapm-hue.github.io/web-assets-/mathmatrix/'
                  : 'https://kidsmathsmatrixpuzzle.github.io/';
const PAGE = BETA ? 'beta.html' : 'index.html';
const MANIFEST = BETA ? 'beta-manifest.json' : 'manifest.json';
const WORKER = BETA ? 'beta-sw.js' : 'sw.js';
const OUT = path.join(__dirname, '..', '..', '_bk', 'MathMatrix-' + VER);

/* Everything the live site serves. The pictures and the music are what get
   folded into the single-file copy; the rest travel as they are. */
const ASSETS = ['cheat-3x3.png', 'cheat-4x4.png', 'cheat-5x5.png', 'cheat-6x6.png',
  'cheat-8x8.png', 'cheat-10x10.png', 'cheat-3cube.png', 'cheat-ramanujan.jpg',
  'bgm-monkeys.mp3', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
const LOOSE = [WORKER, MANIFEST, 'MultiplyMagic3.html', 'sound-lab.html',
  'design-preview.html'];
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', mp3: 'audio/mpeg' };

fs.mkdirSync(OUT, { recursive: true });
const grab = (name) => {
  const dest = path.join(OUT, name);
  execSync(`curl -sfL -o "${dest}" "${SITE}${name}"`, { stdio: 'pipe' });
  const b = fs.readFileSync(dest);
  if (!b.length) throw new Error('empty download: ' + name);
  return b;
};

console.log('fetching ' + SITE + ' ...');
const indexBuf = grab(PAGE);
const index = indexBuf.toString('utf8');
/* The beta's BUILD_VER carries a sentence of release notes after the number.
   The version is the first word; the rest is prose. */
const live = ((index.match(/BUILD_VER = '([^']+)'/) || [])[1] || '').split(' ')[0];
if (live !== VER) {
  console.error(`\nthe live site is serving ${live}, not ${VER} — refusing to label a bundle wrongly`);
  process.exit(1);
}
console.log('  live is ' + live + ', as asked');

const bytes = {};
for (const a of ASSETS.concat(LOOSE)) { bytes[a] = grab(a); process.stdout.write('.'); }
console.log('\n  ' + (ASSETS.length + LOOSE.length + 1) + ' files fetched');

/* ---- the editable copy: the live page, untouched ---- */
const EDIT = `EDIT-THIS-MathMatrix-${VER}.html`;
fs.writeFileSync(path.join(OUT, EDIT), indexBuf);

/* ---- the single-file copy ---- */
const dataUri = (name) => 'data:' + MIME[name.split('.').pop()] + ';base64,' + bytes[name].toString('base64');

let one = index;
let inlined = 0;
for (const a of ASSETS) {
  if (!MIME[a.split('.').pop()]) continue;
  const uri = dataUri(a);
  /* Only ever replace a whole quoted token. A blind string replace would also
     hit the same name inside sw.js's cache list and inside comments. */
  for (const q of ['"', "'"]) {
    for (const p of ['', '/', './']) {
      const needle = q + p + a + q;
      while (one.includes(needle)) { one = one.replace(needle, q + uri + q); inlined++; }
    }
  }
}

/* The manifest travels inside the page too, with its own icons inside IT, so
   the app still knows its name and pictures with not one file beside it. */
const mf = JSON.parse(bytes[MANIFEST].toString('utf8'));
if (Array.isArray(mf.icons)) mf.icons.forEach(i => {
  const f = String(i.src).replace(/^\.?\//, '');
  if (bytes[f]) i.src = dataUri(f);
});
const mfUri = 'data:application/manifest+json;base64,' + Buffer.from(JSON.stringify(mf), 'utf8').toString('base64');
const mfBefore = one;
one = one.replace(new RegExp('href="' + MANIFEST.replace('.', '\\.') + '"', 'g'), `href="${mfUri}"`);
if (one === mfBefore) console.log(`  NOTE: no href="${MANIFEST}" found to inline`);

/* The stock worker caches a dozen files BY NAME. In the single-file edition
   those files do not exist, so it fails to install and you silently get no
   offline play at all. Point at the one that only has the page to look after. */
/* The beta registers its worker with a scope pinned to beta.html. The
   single-file copy is uploaded as index.html, so that scope would lock the
   worker to a page that is not there. Take the whole call, options and all. */
const swBefore = one;
one = one.replace(new RegExp("register\\('" + WORKER.replace('.', '\\.') + "'(?:\\s*,\\s*\\{[^}]*\\})?\\)", 'g'),
  "register('sw-standalone.js')");
if (one === swBefore) console.log(`  NOTE: no register('${WORKER}') found to repoint`);

const PUB = `PUBLISH-THIS-MathMatrix-${VER}.html`;
fs.writeFileSync(path.join(OUT, PUB), one, 'utf8');
console.log(`  inlined ${inlined} asset references + the manifest`);

/* ---- the worker that partners the single-file copy ---- */
fs.writeFileSync(path.join(OUT, 'sw-standalone.js'), `// Service worker for the SINGLE-FILE edition (${PUB}).
//
// The stock sw.js caches a dozen separate files by name. In the single-file
// edition those files do not exist -- every picture, icon and the music live
// inside the page itself -- so the stock worker fails to install and you get
// no offline support at all.
//
// This one has only one thing to look after: the page.
//
// Upload BOTH files to your site:
//    ${PUB}  ->  index.html
//    sw-standalone.js${' '.repeat(Math.max(1, PUB.length - 15))}->  sw-standalone.js
//
// If you ever edit the page, change the version below so returning visitors are
// given the new copy instead of the old cached one.

const CACHE_VERSION = 'mathmatrix-standalone-${VER}';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(['./', './index.html'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Network first, so an edit you upload is picked up; the cache is the fallback
// for when there is no signal.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
      return res;
    }).catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
  );
});
`, 'utf8');

/* ---- the papers ----
   A release note is the one page that cannot be measured out of the files, so
   it is written by hand and kept in the repo next to this script. If there is
   one for this version it travels with the bundle and the index links it. */
const note = path.join(__dirname, `whats-new-${VER}.md`);
if (fs.existsSync(note)) fs.copyFileSync(note, path.join(OUT, `WHATS-NEW-${VER}.md`));
const docs = require('./bundle-docs')({ OUT, VER, BETA, SITE, PAGE, MANIFEST, WORKER, EDIT, PUB, ASSETS });
console.log(`  ${docs.count} guides written` + (fs.existsSync(note) ? ' + the release note' : '')
  + `  (${docs.levels.length} puzzles, ${docs.sheets} formula sheets)`);

/* ---- fingerprints, so anyone can prove nothing was altered ---- */
const names = fs.readdirSync(OUT).filter(f => f !== 'SHA256SUMS.txt').sort();
const sums = names.map(f => crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, f))).digest('hex') + '  ' + f);
fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'), sums.join('\n') + '\n', 'utf8');

console.log('\nbundle at ' + OUT);
for (const f of fs.readdirSync(OUT).sort())
  console.log('  ' + String(Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + ' kB').padStart(8) + '  ' + f);
