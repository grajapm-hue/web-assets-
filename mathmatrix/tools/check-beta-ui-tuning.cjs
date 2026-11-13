'use strict';
// Run locally: node --test mathmatrix/tools/check-beta-ui-tuning.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {before, after, test} = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
let browser, server, base;
before(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json'};
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = process.env.MM_LAYOUT_BASE_URL || `http://127.0.0.1:${server.address().port}/mathmatrix/beta-app/`;
  browser = await playwright[process.env.MM_BROWSER || 'chromium'].launch();
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
async function app(run) {
  const context = await browser.newContext({viewport:{width:1366,height:768}, serviceWorkers:'block', reducedMotion:'reduce'});
  try {
    const page = await context.newPage();
    await page.goto(base + 'beta.html');
    await page.locator('#splashPlay').click({force:true});
    await page.locator('#splashPlay').waitFor({state:'detached'});
    await run(page);
  } finally { await context.close(); }
}
test('small Sudoku presents a readable board close to its keypad', () => app(async page => {
  await page.getByRole('button', {name:'Sudoku, 5 puzzles', exact:true}).click();
  await page.locator('.bookChoice:visible').first().click();
  await page.waitForTimeout(500);
  const board = await page.locator('#sudBoard').boundingBox();
  const pad = await page.locator('#sudPad').boundingBox();
  assert.ok(board.width >= 330, `small board is only ${board.width}px wide`);
  assert.ok(Math.abs(board.y+board.height/2-pad.y-pad.height/2)<130, 'keypad and board are vertically disconnected');
  const cell = page.locator('.sudCell:not(.given)').first();
  await cell.click(); await page.locator('.sudKey').first().click();
  assert.match(await cell.innerText(), /1/);
}));
test('two-choice menus avoid window-height empty cards', () => app(async page => {
  for (const category of ['Binary Magic', 'Pallanguzhi', 'Thayam']) {
    await page.locator('#tab-scHome').click();
    await page.getByRole('button', {name:category+', 2 puzzles', exact:true}).click();
    if (category==='Binary Magic') assert.match(await page.locator('.sanaBub').innerText(), /range/i);
    const cards = await page.locator('.bookChoice:visible').evaluateAll(a=>a.map(e=>{
      const r=e.getBoundingClientRect();return {height:r.height,overflow:e.scrollHeight>e.clientHeight+2};
    }));
    assert.ok(cards.every(c=>c.height<=280 && !c.overflow), category+': '+JSON.stringify(cards));
  }
}));
test('navigation and game actions use readable text and reliable targets', () => app(async page => {
  const navSize = await page.locator('#tab-scHome').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  assert.ok(navSize>=15, `tab label is only ${navSize}px`);
  await page.getByRole('button',{name:'Pallanguzhi, 2 puzzles',exact:true}).click();
  await page.locator('.bookChoice:visible').first().click();
  const action=await page.locator('#palNew').evaluate(e=>({height:e.getBoundingClientRect().height,font:parseFloat(getComputedStyle(e).fontSize)}));
  assert.ok(action.height>=44 && action.font>=14,JSON.stringify(action));
}));
test('utility pages bound their text and hide unrelated game tools', () => app(async page => {
  await page.getByRole('button',{name:'Add Magic, 6 puzzles',exact:true}).click();
  await page.locator('.bookChoice:visible').first().click();
  for (const tab of ['scApp','scFeed']) {
    await page.locator('#tab-'+tab).click();
    assert.equal(await page.locator('#barLearn').isVisible(),false,tab+' retains game Logic');
  }
  const field=await page.locator('#fbText').boundingBox();
  assert.ok(field.width<=800,`feedback text spans ${field.width}px`);
}));
test('desktop help uses a readable content width', () => app(async page => {
  await page.locator('#barMore').click();
  const panel=await page.locator('#sheetHost .shBody').boundingBox();
  assert.ok(panel.width<=800 && panel.width>=500,`help panel is ${panel.width}px wide`);
  await page.locator('#shClose').click();
  assert.equal(await page.locator('#sheetHost').isVisible(),false);
}));
test('standalone game toolbars share readable captions', async () => {
  const context = await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
  try {
    const page=await context.newPage();
    for (const file of ['criss-cross.html','tic-tac-toe.html','tunnels-of-meta.html','cave-treasure-hunt.html','treasure-hunt-landscape-prototype/index.html']) {
      await page.goto(base+file);
      const sizes=await page.locator('.ccmTopBtn span,.top-label,.top-actions>.top span').evaluateAll(a=>a.map(e=>parseFloat(getComputedStyle(e).fontSize)));
      assert.ok(sizes.length>=3 && sizes.every(s=>s>=11),file+': '+sizes.join(', '));
    }
  } finally {await context.close();}
});
test('both Beta entrypoints show the same current release', async () => {
  const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
  try {
    const page=await context.newPage();
    for (const file of ['beta.html','index.html']) {
      await page.goto(base+file);
      await page.locator('#splashPlay').click({force:true});
      await page.locator('#splashPlay').waitFor({state:'detached'});
      assert.match(await page.title(),/V\.222 UI Tuning/);
      assert.equal(await page.locator('.categoryVersion').innerText(),'Beta V.222');
      assert.equal(await page.locator('.categoryCard:visible').count(),12);
    }
  } finally {await context.close();}
});
test('player-game controls align vertically with their boards', () => app(async page => {
  for (const [category,index,panel,board,first,foot] of [
    ['Pallanguzhi',1,'pal4Panel','#pal4Frame','#pal4Say','.pal4Foot'],
    ['Thayam',0,'thayamPanel','.thayamTable','.thTop','.thFoot']
  ]) {
    await page.locator('#tab-scHome').click();
    await page.getByRole('button',{name:category+', 2 puzzles',exact:true}).click();
    await page.locator('.bookChoice:visible').nth(index).click();
    const box=page.locator('#'+panel);
    const a=await box.locator(first).boundingBox(), z=await box.locator(foot).boundingBox(), b=await box.locator(board).boundingBox();
    assert.ok(Math.abs((a.y+z.y+z.height)/2-(b.y+b.height/2))<120,category+' control group is disconnected from its board');
  }
}));
test('Binary introduction gives number-card instructions', () => app(async page => {
  await page.getByRole('button',{name:'Binary Magic, 2 puzzles',exact:true}).click();
  await page.locator('.bookChoice:visible').first().click();
  assert.match(await page.locator('.sanaBub').innerText(),/think of any number/i);
}));
