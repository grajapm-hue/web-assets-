/* Run against the actual static Beta with temporary Playwright tooling on the Mac. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.MM_PLAYWRIGHT_MODULE || 'playwright');
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = path.resolve(option('--root', path.join(__dirname, '../..')));
const section = option('--section', 'orientation');
const engine = option('--browser', 'chromium');
const reportDir = path.resolve(option('--report-dir', path.join(root, 'artifacts/beta-responsive')));
const prefix = '/mathmatrix/beta-app/';
const routes = [
  ['app', 'beta.html'], ['index', 'index.html'], ['criss-cross', 'criss-cross.html'],
  ['tic-tac-toe', 'tic-tac-toe.html?size=3'], ['tunnels', 'tunnels-of-meta.html'],
  ['cave-maze', 'cave-treasure-hunt.html'], ['story-maze', 'treasure-hunt-landscape-prototype/index.html'],
  ['multiply-magic', 'MultiplyMagic3.html'], ['sound-lab', 'sound-lab.html']
];
const sizes = [[320,568],[568,320],[390,844],[844,390],[768,1024],[1024,768],[1280,720],[1920,1080]];
const mime = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.mp3':'audio/mpeg'};
fs.mkdirSync(reportDir, {recursive:true});
const results = [];
const metrics = [];
let servingRoot = root;
function check(name, condition, detail) {
  results.push({name, pass:!!condition, detail});
  if (!condition) console.log('FAIL ' + name + ': ' + JSON.stringify(detail));
}
async function test(name, run) {
  try { await run(); }
  catch(error) { check(name, false, error.message); }
}
const server = http.createServer((req,res) => {
  let filename;
  try { filename = path.resolve(servingRoot, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (!(filename === servingRoot || filename.startsWith(servingRoot + path.sep))) { res.writeHead(403).end(); return; }
  if (fs.existsSync(filename) && fs.statSync(filename).isDirectory()) filename = path.join(filename, 'index.html');
  fs.readFile(filename, (error,data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, {'Content-Type':mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(data);
  });
});
let browser, origin;
async function context(viewport = {width:390,height:844}, workers = 'block') {
  const ctx = await browser.newContext({viewport, isMobile:viewport.width < 1000, hasTouch:true,
    reducedMotion:'reduce', serviceWorkers:workers, deviceScaleFactor:1});
  await ctx.addInitScript(() => {
    localStorage.setItem('mmSound','off'); localStorage.setItem('mmMusic','off');
  });
  return ctx;
}
async function open(page, route, play = false) {
  await page.goto(origin + prefix + route, {waitUntil:'load', timeout:20000});
  if (play) {
    if (await page.locator('.splashPlay').isVisible()) await page.locator('.splashPlay').click();
    if (await page.locator('#tab-scHome').isVisible()) await page.locator('#tab-scHome').click();
    await page.locator('.categoryCard').first().waitFor();
  }
}
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(160);
}
async function orientation() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mathmatrix/beta-app/beta-manifest.json'), 'utf8'));
  check('installed app permits both orientations', manifest.orientation === 'any', manifest.orientation);
  for (const [name,route] of routes) await test(name + ' orientation', async () => {
    const ctx = await context(); const page = await ctx.newPage(); const errors=[];
    page.on('pageerror', error => errors.push(error.message));
    const started = Date.now();
    await open(page, route, name === 'app' || name === 'index');
    metrics.push({route, readyMs:Date.now()-started});
    for (const [width,height] of [[390,844],[844,390],[390,844]]) {
      await page.setViewportSize({width,height}); await settle(page);
      const info = await page.evaluate(() => ({classes:document.documentElement.className,
        transform:getComputedStyle(document.documentElement).transform,
        bodyTransform:getComputedStyle(document.body).transform,
        width:document.documentElement.getBoundingClientRect().width,
        viewport:visualViewport.width, overflow:document.documentElement.scrollWidth > innerWidth + 2}));
      check(`${name} upright ${width}x${height}`, info.transform === 'none' && info.bodyTransform === 'none'
        && !/lockRotate/.test(info.classes) && Math.abs(info.width-info.viewport)<2, info);
      if (width > height) await page.screenshot({path:path.join(reportDir, `orientation-${name}-${width}x${height}.png`)});
    }
    check(name + ' no uncaught errors', !errors.length, errors);
    await ctx.close();
  });
  await test('number entry preserved through rotation', async () => {
    const ctx=await context(); const page=await ctx.newPage();
    await open(page,'beta.html',true);
    await page.locator('.categoryCard[data-category="Add Magic"]').click();
    await page.locator('.bookChoice[data-size="3x3"]').click();
    await page.locator('#board input:not([readonly]):not([disabled])').first().click();
    await page.locator('.kp[data-k="1"]').click();
    const read=()=>page.locator('#board input').evaluateAll(nodes=>nodes.map(node=>node.value));
    const before=await read();
    assert(before.some(value=>value==='1'),'A real keypad press must enter 1 before rotating');
    for(const viewport of [{width:844,height:390},{width:390,height:844}]) {
      await page.setViewportSize(viewport); await settle(page);
      assert.deepEqual(await read(),before,'Rotation must preserve the entered numbers');
    }
    check('number entry preserved through rotation',true); await ctx.close();
  });
  await test('Tic-Tac-Toe move and turn preserved through rotation', async () => {
    const ctx=await context(); const page=await ctx.newPage();
    await open(page,'tic-tac-toe.html?size=3');
    await page.locator('#board .cell').first().click();
    const read=()=>page.evaluate(()=>({board:document.getElementById('board').innerText,
      turn:document.getElementById('status').textContent,
      scores:['scoreX','scoreO','scoreDraw'].map(id=>document.getElementById(id).textContent)}));
    const before=await read(); assert(before.board.includes('X'));
    for(const viewport of [{width:844,height:390},{width:390,height:844}]) {
      await page.setViewportSize(viewport); await settle(page); assert.deepEqual(await read(),before);
    }
    check('Tic-Tac-Toe move and turn preserved through rotation',true); await ctx.close();
  });
}
async function shell() {
  const ctx=await context(); const page=await ctx.newPage(); const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await open(page,'beta.html',true);
  for(const [width,height] of sizes) await test(`category layout ${width}x${height}`,async()=>{
    await page.setViewportSize({width,height}); await settle(page);
    const info=await page.evaluate(()=>({width:innerWidth,height:innerHeight,
      scrollWidth:document.documentElement.scrollWidth,
      shellWidth:document.querySelector('.appShell').getBoundingClientRect().width,
      cards:Array.from(document.querySelectorAll('.categoryCard')).map(button=>{
        const r=button.getBoundingClientRect(), text=button.querySelector('.categoryName');
        const t=text.getBoundingClientRect();
        return {name:button.dataset.category,x:r.x,y:r.y,w:r.width,h:r.height,
          textBottom:t.bottom,textTop:t.top,font:parseFloat(getComputedStyle(text).fontSize)};
      })}));
    check(`all 12 categories fit ${width}x${height}`,info.cards.length===12 && info.cards.every(c=>
      c.x>=-1 && c.y>=-1 && c.x+c.w<=width+1 && c.y+c.h<=height+1 && c.h>=43
      && c.textTop>=c.y && c.textBottom<=c.y+c.h && c.font>=13),info);
    check(`no horizontal page overflow ${width}x${height}`,info.scrollWidth<=info.width+2,info.scrollWidth);
    if(width>=1280) check(`wide workspace ${width}x${height}`,info.shellWidth>=1000,info.shellWidth);
    await page.screenshot({path:path.join(reportDir,`categories-${width}x${height}.png`)});
  });
  await page.setViewportSize({width:844,height:390}); await settle(page);
  for(const id of ['tab-scApp','tab-scFeed','tab-scHome']) {
    await page.locator('#'+id).click(); await settle(page);
    const box=await page.locator('#'+id).boundingBox();
    check(id+' stays reachable',box && box.y>=0 && box.y+box.height<=390,box);
  }
  check('shell no uncaught errors',!errors.length,errors);
  await ctx.close();
}
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  const launcher = engine === 'webkit' ? webkit : chromium;
  browser = await launcher.launch(engine === 'chromium' ? {channel:'chrome',headless:true} : {headless:true});
  if (section === 'orientation' || section === 'all') await orientation();
  if (section === 'shell' || section === 'all') await shell();
  if (!['orientation','shell','all'].includes(section)) throw new Error('Unknown validation section: ' + section);
}
main().catch(error => {check('validation runner', false, error.stack);}).finally(async () => {
  if (browser) await browser.close();
  server.close();
  const failed = results.filter(item => !item.pass);
  fs.writeFileSync(path.join(reportDir, 'checks.json'), JSON.stringify({engine,section,root,results,metrics},null,2));
  console.log(`${results.length-failed.length}/${results.length} checks passed (${engine}, ${section})`);
  process.exitCode = failed.length ? 1 : 0;
});
