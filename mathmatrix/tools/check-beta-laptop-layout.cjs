'use strict';
// PLAYWRIGHT_MODULE=/path/to/playwright node --test mathmatrix/tools/check-beta-laptop-layout.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {before, after, test} = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const artifacts = process.env.MM_LAYOUT_ARTIFACT_DIR;
let browser, server, base;

before(async () => {
  if (artifacts) fs.mkdirSync(artifacts, {recursive:true});
  server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.mp3':'audio/mpeg'};
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = process.env.MM_LAYOUT_BASE_URL || `http://127.0.0.1:${server.address().port}/mathmatrix/beta-app/`;
  browser = await playwright[process.env.MM_BROWSER || 'chromium'].launch({headless:true});
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function open(context, file = 'beta.html') {
  const page = await context.newPage();
  await page.goto(base + file);
  if (file === 'beta.html' || file === 'index.html') {
    await page.locator('#splashPlay').waitFor({state:'visible'});
    await page.locator('#splashPlay').click({force:true});
    await page.locator('#splashPlay').waitFor({state:'detached'});
    await page.locator('.categoryCard').first().waitFor({state:'visible'});
  }
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function screenshot(page, name) {
  if (artifacts) await page.screenshot({path:path.join(artifacts, name + '.png'), animations:'disabled'});
}

for (const [width, height] of [[1024,768], [1366,768], [1440,900], [1920,1080]]) {
  test(`laptop home uses the window and keeps all categories reachable at ${width}x${height}`, async () => {
    const context = await browser.newContext({viewport:{width,height}, serviceWorkers:'block', reducedMotion:'reduce'});
    try {
      const page = await open(context);
      await screenshot(page, `laptop-home-${width}x${height}`);
      const result = await page.evaluate(() => {
        const app = document.querySelector('.appShell').getBoundingClientRect();
        const panel = document.querySelector('.categoryChooser').getBoundingClientRect();
        const grid = document.querySelector('.categoryGrid').getBoundingClientRect();
        const nav = document.querySelector('.tabBar').getBoundingClientRect();
        return {appWidth:app.width, gridHeight:grid.height, panelHeight:panel.height,
          cards:[...document.querySelectorAll('.categoryCard')].map(e => {
            const r = e.getBoundingClientRect();
            return {name:e.dataset.category, visible:r.width>0 && r.height>0 && r.x>=0 && r.right<=innerWidth && r.y>=0 && r.bottom<=nav.top,
              hit:e.contains(document.elementFromPoint(r.x+r.width/2, r.y+r.height/2))};
          }), overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.ok(result.appWidth >= width * .95, `app occupies only ${result.appWidth}px of ${width}px`);
      assert.ok(result.gridHeight >= result.panelHeight * .70, 'categories leave most of the content area unused');
      assert.equal(result.cards.length, 12);
      assert.ok(result.cards.every(c => c.visible && c.hit), JSON.stringify(result.cards));
      assert.equal(result.overflow, false);
      await page.getByRole('button', {name:'Add Magic, 6 puzzles', exact:true}).click();
      await page.locator('.bookChoice:visible').first().click();
      const cell = await page.locator('input[aria-label="Row 1, column 1"]').boundingBox();
      assert.ok(Math.abs(cell.width-cell.height)<2, 'the puzzle cells must remain square');
      await screenshot(page, `laptop-add-${width}x${height}`);
      if (width===1366) {
        const solution = [8,1,6,3,5,7,4,9,2];
        for (let i=0;i<solution.length;i++) {
          await page.locator('input[aria-label^="Row "]:visible').nth(i).click();
          await page.getByRole('button', {name:String(solution[i]), exact:true}).click();
        }
        await page.getByRole('button', {name:'📋 Pick another puzzle ▼', exact:true}).waitFor({state:'visible'});
        assert.match(await page.locator('body').innerText(), /You solved it|Solved it!/);
        await page.getByRole('button', {name:'📋 Pick another puzzle ▼', exact:true}).click();
        assert.equal(await page.locator('.categoryCard:visible').count(), 12);
      }
    } finally { await context.close(); }
  });
}

for (const file of ['criss-cross.html','tic-tac-toe.html','tunnels-of-meta.html','cave-treasure-hunt.html','treasure-hunt-landscape-prototype/index.html']) {
  test(`standalone ${file} uses the laptop landscape layout`, async () => {
    const context = await browser.newContext({viewport:{width:1366,height:768}, serviceWorkers:'block', reducedMotion:'reduce'});
    try {
      const page = await open(context, file);
      const result = await page.evaluate(() => ({landscape:document.documentElement.classList.contains('lsLayout'),
        width:(document.querySelector('.app') || document.body).getBoundingClientRect().width,
        overflow:document.documentElement.scrollWidth>innerWidth}));
      await screenshot(page, 'laptop-' + file.replace(/[^a-z0-9]/gi, '-'));
      assert.equal(result.landscape, true, 'desktop is incorrectly kept in the portrait layout');
      assert.ok(result.width >= 1366 * .95, `game uses only ${result.width}px of the laptop window`);
      assert.equal(result.overflow, false);
    } finally { await context.close(); }
  });
}

test('every puzzle choice opens in a usable laptop frame without script errors', async () => {
  const context = await browser.newContext({viewport:{width:1366,height:768}, serviceWorkers:'block', reducedMotion:'reduce'});
  try {
    let page = await open(context);
    const errors = [], opened = [];
    const plan = await page.locator('.modeGroup').evaluateAll(groups => groups.flatMap(group => {
      const name = group.querySelector('.modeHead b').textContent;
      const choices = [...group.querySelectorAll('.toggleBtn')];
      const paths = {crisscross:'criss-cross.html', tunnels:'tunnels-of-meta.html', 'cave-treasure':'cave-treasure-hunt.html',
        'sana-treasure-hunt':'treasure-hunt-landscape-prototype/index.html', 'tic-tac-toe':'tic-tac-toe.html'};
      return choices.map((button, index) => ({name:button.dataset.name, index, count:choices.length,
        path:paths[button.dataset.size],
        category:name + (choices.length===1 ? ', play puzzle' : ', '+choices.length+' puzzles')}));
    }));
    for (const choice of plan) {
      if (!page.url().endsWith('/beta.html')) { await page.close(); page = await open(context); }
      page.on('pageerror', error => errors.push(error.message));
      await page.locator('#tab-scHome').click();
      let launch = page.getByRole('button', {name:choice.category, exact:true});
      if (choice.count>1) {
        await launch.click();
        launch = page.locator('.bookChoice:visible').nth(choice.index);
      }
      if (choice.path) await Promise.all([
        page.waitForURL(url => url.pathname.endsWith('/'+choice.path), {waitUntil:'domcontentloaded'}), launch.click()
      ]);
      else await launch.click();
      const result = await page.evaluate(() => {
        const frame = document.querySelector('.appShell,.app') || document.body;
        return {width:frame.getBoundingClientRect().width, overflow:document.documentElement.scrollWidth>innerWidth,
          text:document.body.innerText.slice(0,300)};
      });
      opened.push({name:choice.name, ...result});
      assert.ok(result.width >= 1366*.95, choice.name+' returned to a narrow frame');
      assert.equal(result.overflow, false, choice.name+' overflows horizontally');
      await screenshot(page, 'choice-'+opened.length);
    }
    assert.equal(opened.length, 28);
    assert.deepEqual(errors, []);
    if (artifacts) fs.writeFileSync(path.join(artifacts,'all-choices.json'), JSON.stringify(opened,null,2));
  } finally { await context.close(); }
});

for (const [width,height] of [[390,844], [393,852], [844,390], [851,393]]) {
  test(`phone categories stay visible at ${width}x${height}`, async () => {
    const context = await browser.newContext({viewport:{width,height}, hasTouch:true, isMobile:true, serviceWorkers:'block', reducedMotion:'reduce'});
    try {
      const page = await open(context);
      await screenshot(page, `phone-home-${width}x${height}`);
      const result = await page.evaluate(() => ({desktop:document.documentElement.classList.contains('desktopViewport'),
        cards:[...document.querySelectorAll('.categoryCard')].map(e=>{
          const r=e.getBoundingClientRect();return r.width>0 && r.height>0 && r.x>=0 && r.right<=innerWidth && r.y>=0 && r.bottom<=document.querySelector('.tabBar').getBoundingClientRect().top;
        })}));
      assert.equal(result.desktop, false);
      assert.equal(result.cards.length, 12);
      assert.ok(result.cards.every(Boolean));
    } finally { await context.close(); }
  });
}
