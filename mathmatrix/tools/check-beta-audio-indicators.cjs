'use strict';
// Real button presses, rendered colours and saved preferences in both Beta entries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {before, after, test} = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../beta-app');
const artifacts = process.env.MM_AUDIO_ARTIFACT_DIR;
const green = 'rgb(21, 128, 61)', red = 'rgb(185, 28, 28)';
let browser, server, base;
before(async () => {
  if (artifacts) fs.mkdirSync(artifacts, {recursive:true});
  server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end(); return;
    }
    res.writeHead(200, {'Content-Type':({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.mp3':'audio/mpeg', '.png':'image/png'})[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = process.env.MM_LAYOUT_BASE_URL || `http://127.0.0.1:${server.address().port}/`;
  browser = await playwright[process.env.MM_BROWSER || 'chromium'].launch();
});
after(async () => {
  await browser?.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
async function play(page) {
  await page.locator('#splashPlay').click({force:true});
  await page.locator('#splashPlay').waitFor({state:'detached'});
  assert.equal(await page.locator('.categoryCard:visible').count(), 12);
}
async function state(page, sound, music) {
  const audibleMusic = sound && music;
  for (const [selector, on] of [['#barMore .audioSpeaker', sound], ['#barMore .audioMusic', audibleMusic], ['#soundBtn', sound], ['#musicBtn', audibleMusic]]) {
    assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).color), on ? green : red, selector);
  }
  assert.equal(await page.locator('#soundBtn').getAttribute('aria-pressed'), String(sound));
  assert.equal(await page.locator('#musicBtn').getAttribute('aria-pressed'), String(audibleMusic));
  assert.equal(await page.locator('#musicBtn').isDisabled(), !sound);
  assert.match(await page.locator('#barMore').getAttribute('aria-label'), new RegExp(`Sound is ${sound ? 'on' : 'off'}; music is ${audibleMusic ? 'on' : 'off'}`));
  const geometry = await page.locator('#barMore').evaluate(button => {
    const rect = button.getBoundingClientRect();
    return {fits:[...button.querySelectorAll('i')].every(icon => {
      const r = icon.getBoundingClientRect();
      return r.width >= 16 && r.height >= 16 && r.left >= rect.left && r.right <= rect.right && r.top >= rect.top && r.bottom <= rect.bottom;
    }), onScreen:rect.left >= 0 && rect.right <= innerWidth, overflow:document.documentElement.scrollWidth > innerWidth};
  });
  assert.equal(geometry.fits, true, 'both status icons must fit the existing top button');
  assert.equal(geometry.onScreen, true); assert.equal(geometry.overflow, false);
}
for (const entry of ['index.html', 'beta.html']) {
  for (const viewport of [{width:360,height:800}, {width:1024,height:768}]) {
    test(`${entry}: independent sound/music status and persistence at ${viewport.width}x${viewport.height}`, async () => {
      const context = await browser.newContext({viewport, hasTouch:true, serviceWorkers:'block', reducedMotion:'reduce'});
      try {
        await context.addInitScript(() => {sessionStorage.setItem('mm.freshChecked', '1');});
        const page = await context.newPage(), errors = [];
        page.setDefaultTimeout(8000);
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + entry); await play(page);
        await page.locator('#barMore').click(); await state(page, true, true);
        const musicOnMask = await page.locator('#barMore .audioMusic').evaluate(el => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
        await page.locator('#musicBtn').click(); await state(page, true, false);
        const musicOffMask = await page.locator('#barMore .audioMusic').evaluate(el => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
        assert.notEqual(musicOffMask, musicOnMask, 'muted music must add an X to the note');
        assert.notEqual(musicOffMask, 'none');
        if (artifacts) await page.screenshot({path:path.join(artifacts, `${path.basename(entry,'.html')}-${viewport.width}-music-off.png`)});
        await page.locator('#soundBtn').click(); await state(page, false, false);
        await page.reload(); await play(page); await page.locator('#barMore').click();
        await state(page, false, false);
        assert.deepEqual(await page.evaluate(() => [localStorage.getItem('mmSound'),localStorage.getItem('mmMusic')]), ['off','off']);
        await page.locator('#soundBtn').click(); await state(page, true, false);
        await page.locator('#musicBtn').click(); await state(page, true, true);
        await page.locator('#soundBtn').click(); await state(page, false, true);
        assert.equal(await page.evaluate(() => localStorage.getItem('mmMusic')), 'on', 'master mute must retain the music preference');
        await page.locator('#soundBtn').click(); await state(page, true, true);
        await page.locator('#shClose').click();
        await page.reload(); await play(page); await page.locator('#barMore').click();
        await state(page, true, true);
        if (artifacts) await page.screenshot({path:path.join(artifacts, `${path.basename(entry,'.html')}-${viewport.width}-on.png`)});
        assert.deepEqual(errors, []);
      } finally {await context.close();}
    });
  }
}
test('Beta V229 labels and cache agree while retaining the original app identity', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'beta-manifest.json'),'utf8'));
  assert.equal(manifest.id, './beta-app/beta.html'); assert.equal(manifest.start_url, './beta.html'); assert.equal(manifest.scope, './');
  assert.match(manifest.name, /V229/);
  const worker = fs.readFileSync(path.join(root,'beta-sw.js'),'utf8');
  const cache = worker.match(/const CACHE_VERSION = '([^']+)'/)[1];
  assert.match(cache, /mathmatrix-beta-v241-/);
  const context = await browser.newContext({serviceWorkers:'block'});
  try {
    const page = await context.newPage();
    for (const entry of ['index.html','beta.html']) {
      const source = fs.readFileSync(path.join(root,entry),'utf8');
      assert.equal(source.match(/window\.BETA_VER\s*=\s*'([^']+)'/)[1], 'v229', 'older installed versions must detect V229 too');
      await page.goto(base + entry); await play(page);
      assert.match(await page.title(), /V\.229/);
      assert.equal(await page.evaluate(() => window.BETA_VER), 'v229');
      await page.locator('#tab-scApp').click(); await page.locator('#rowAbout').click();
      assert.equal(await page.locator('#sheetHost .categoryVersion').innerText(), 'Beta V.229');
      assert.match(await page.locator('#verLabel').textContent(), /V\.229/);
    }
  } finally {await context.close();}
});
