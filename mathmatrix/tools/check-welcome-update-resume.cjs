'use strict';
// Exercise real navigation and worker activation, including updates arriving after Play.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {before, after, test} = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const parent = path.resolve(__dirname, '..');
const root = fs.existsSync(path.join(parent, 'category-chooser.js')) ? parent : path.join(parent, 'beta-app');
const beta = fs.existsSync(path.join(root, 'beta.html'));
const entries = beta ? ['index.html', 'beta.html'] : ['index.html', 'KidsMathsMatrixPuzzle.html'];
const worker = beta ? 'beta-sw.js' : 'sw.js';
const artifacts = process.env.MM_UPDATE_ARTIFACT_DIR;
let browser;
before(async () => {
  browser = await playwright[process.env.MM_BROWSER || 'chromium'].launch();
  if (artifacts) fs.mkdirSync(artifacts, {recursive:true});
});
after(async () => { await browser?.close(); });

async function fixture(t, entry, probe = false, startOffline = false) {
  let revision = 0, publish = false;
  const held = [];
  let probeSeen;
  const probed = new Promise(resolve => { probeSeen = resolve; });
  const html = fs.readFileSync(path.join(root, entry), 'utf8');
  const current = Number(html.match(/var BUILD_VER = '[^']*V\.(\d+)/)[1]);
  const newer = html.replace(/(var BUILD_VER = '[^']*V\.)\d+/, '$1' + (current + 1));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const types = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.mp3':'audio/mpeg'};
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    if (probe && url.searchParams.has('fresh')) { held.push(res); probeSeen(); return; }
    if (entries.includes(path.basename(file))) { res.end(publish ? newer : html); return; }
    if (path.basename(file) === worker) {
      res.end(fs.readFileSync(file, 'utf8') + '\n// Regression fixture revision ' + revision);
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext({viewport:{width:1280,height:800}, hasTouch:true,
    ...(probe ? {serviceWorkers:'block'} : {}), reducedMotion:'reduce'});
  await context.addInitScript(({probe, startOffline}) => {
    localStorage.setItem('mmSound', 'off');
    if (!sessionStorage.getItem('test.boots')) localStorage.setItem('update-test-saved', 'preserved');
    if (!probe) sessionStorage.setItem('mm.freshChecked', '1');
    // Model the connectivity notification independently of transport. Actual
    // worker caching and offline restoration are exercised by separate probes.
    if (startOffline && !sessionStorage.getItem('test.boots')) {
      window.testOnline = false;
      Object.defineProperty(navigator, 'onLine', {get:() => window.testOnline});
    }
    sessionStorage.setItem('test.boots', String(Number(sessionStorage.getItem('test.boots') || 0) + 1));
  }, {probe, startOffline});
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => {
    if (artifacts && !page.isClosed()) await page.screenshot({path:path.join(artifacts, (probe ? 'probe-' : 'worker-') + entry + '.png')});
    await context.close();
    held.forEach(res => res.end(html));
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return {page, errors, context, url:`http://127.0.0.1:${server.address().port}/${entry}`,
    update:() => { revision++; },
    probeCount:() => held.length,
    waitForProbe:() => probed,
    publish:() => { publish = true; held.splice(0).forEach(res => res.end(newer)); }};
}
async function play(page) {
  await page.locator('#splashPlay').click({force:true});
  await page.locator('#splashPlay').waitFor({state:'detached'});
  assert.equal(await page.locator('.categoryCard:visible').count(), 12);
}
async function settledWorker(page) {
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!navigator.serviceWorker.controller && r?.active?.state === 'activated' && r.active === navigator.serviceWorker.controller && !r.installing && !r.waiting;
  });
}
async function staysOnChooser(page, errors) {
  await page.waitForLoadState('load');
  assert.equal(await page.locator('#splashPlay').count(), 0, 'background update reopened the welcome screen after Play');
  assert.equal(await page.locator('.categoryCard:visible').count(), 12);
  assert.equal(await page.evaluate(() => localStorage.getItem('update-test-saved')), 'preserved');
  assert.deepEqual(errors, []);
}
for (const entry of entries) {
  test(`${entry}: delayed worker activation preserves the chooser after Play`, async t => {
    const f = await fixture(t, entry);
    await f.page.goto(f.url);
    await settledWorker(f.page);
    await f.page.waitForFunction(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).length))).some(count => count >= 30));
    await play(f.page);
    await Promise.all([f.page.waitForURL(url => url.searchParams.has('mm-update')), f.page.locator('#appBarChip').click()]);
    await f.page.locator('.categoryCard:visible').first().waitFor();
    const boots = await f.page.evaluate(() => Number(sessionStorage.getItem('test.boots')));
    assert.equal(await f.page.evaluate(() => hadController), true, 'installed launch must already have a controller');
    f.update();
    await f.page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await f.page.waitForFunction(n => Number(sessionStorage.getItem('test.boots')) > n, boots);
    await settledWorker(f.page);
    await staysOnChooser(f.page, f.errors);
  });
  test(`${entry}: delayed newer-build response preserves the chooser after Play`, async t => {
    const f = await fixture(t, entry, true);
    await f.page.goto(f.url);
    await play(f.page);
    assert.equal(f.probeCount(), 1);
    f.publish();
    await f.page.waitForURL(url => url.searchParams.has('v'));
    await staysOnChooser(f.page, f.errors);
  });
  test(`${entry}: a background update before Play keeps the initial welcome`, async t => {
    const f = await fixture(t, entry, true);
    await f.page.goto(f.url);
    await f.page.locator('#splashPlay').waitFor({state:'visible'});
    f.publish();
    await f.page.waitForURL(url => url.searchParams.has('v'));
    await f.page.waitForLoadState('load');
    assert.equal(await f.page.locator('#splashPlay:visible').count(), 1);
    await play(f.page);
    await staysOnChooser(f.page, f.errors);
  });
  test(`${entry}: an online event retries the version check without another welcome`, async t => {
    const f = await fixture(t, entry, true, true);
    await f.page.goto(f.url);
    await play(f.page);
    assert.equal(f.probeCount(), 0, 'an offline launch must defer the version check');
    await f.page.evaluate(() => { window.testOnline = true; window.dispatchEvent(new Event('online')); });
    await f.waitForProbe();
    f.publish();
    await f.page.waitForURL(url => url.searchParams.has('v'));
    await staysOnChooser(f.page, f.errors);
  });
}
