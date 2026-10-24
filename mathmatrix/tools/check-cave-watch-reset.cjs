'use strict';
// Run with node --test. Set PLAYWRIGHT_MODULE if Playwright is not installed
// locally; CAVE_WATCH_URL can target a deployed page instead of the local file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {before, after, test} = require('node:test');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.env.CAVE_WATCH_URL || pathToFileURL(path.resolve(
  process.env.CAVE_MAZE_FILE || path.join(__dirname, '..', 'beta-app', 'cave-treasure-hunt.html')
)).href;
const output = process.env.CAVE_MAZE_ARTIFACT_DIR;
let browser;
before(async () => {
  if (output) fs.mkdirSync(output, {recursive:true});
  browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true});
});
after(async () => { await browser?.close(); });

async function openGame(t) {
  const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const dialogs = [], errors = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('mmSound','off'); localStorage.setItem('mmMusic','off');
  });
  await page.goto(game);
  await page.locator('#ball circle').waitFor();
  await page.getByRole('radio',{name:'Red player',exact:true}).tap();
  t.after(async () => {
    if (output) fs.writeFileSync(path.join(output,t.name.replace(/\W+/g,'-')+'.json'),JSON.stringify({dialogs,errors},null,2));
    await page.close();
    assert.deepEqual(errors,[],'no browser script errors');
  });
  return {page,dialogs};
}
async function watch(page,until='moving') {
  await page.locator('#watchButton').tap();
  if(until==='won') {
    await page.waitForFunction(() => document.querySelector('#location').textContent==='Cave exit · escaped',null,{timeout:40000});
    assert.equal(await page.locator('#progress').textContent(),'10 / 10 stages');
  } else if(until==='rest') {
    await page.waitForFunction(() => document.querySelector('#location').textContent.startsWith('Rest checkpoint'),null,{timeout:35000});
  } else {
    await page.waitForFunction(() => Number(document.querySelector('#ball circle').getAttribute('cy'))>20);
  }
}
async function resetState(page) {
  assert.equal(await page.locator('#watchButton').getAttribute('aria-pressed'),'false','Watch must stop');
  assert.equal(await page.locator('#watchButton .top-label').textContent(),'Watch');
  assert.equal(await page.locator('#progress').textContent(),'1 / 10 stages','only Start stays complete');
  assert.deepEqual(await page.locator('#ball circle').evaluate(e=>({x:Number(e.getAttribute('cx')),y:Number(e.getAttribute('cy')),color:e.getAttribute('fill')})),
    {x:62,y:18,color:'#e32b2b'},'the chosen red pawn must return to Start');
  assert.equal(await page.getByRole('radio',{name:'Red player',exact:true}).getAttribute('aria-checked'),'true');
  assert.equal(await page.getByRole('button',{name:'Move down',exact:true}).isEnabled(),true,'manual play must be available');
}
async function canMove(page) {
  await page.getByRole('button',{name:'Move down',exact:true}).tap();
  assert.ok(Number(await page.locator('#ball circle').getAttribute('cy'))>18,'the same pawn must move immediately');
}

test('Clear after a completed Watch resets the chosen pawn for manual play',async t=>{
  // Catches Clear being disabled or ignored in the won state.
  const {page,dialogs}=await openGame(t);await watch(page,'won');
  if(output)await page.screenshot({path:path.join(output,'watch-completed.png')});
  assert.equal(await page.locator('#clearTrail').isEnabled(),true,'Clear must be enabled after Watch finishes');
  await page.locator('#clearTrail').tap();await resetState(page);
  if(output)await page.screenshot({path:path.join(output,'clear-after-watch.png')});
  await canMove(page);assert.deepEqual(dialogs,[]);
});

test('Start after a completed Watch immediately resets without a confirmation',async t=>{
  // Catches the won-state confirmation that interrupts restarting.
  const {page,dialogs}=await openGame(t);await watch(page,'won');
  await page.locator('#newRun').tap();
  assert.deepEqual(dialogs,[],'Start must not ask to replay the same fixed cave');
  await resetState(page);await canMove(page);
});

test('Clear can stop an active Watch and its queued movement',async t=>{
  // Catches the watchActive guard and an uncancelled animation frame.
  const {page,dialogs}=await openGame(t);await watch(page);
  assert.equal(await page.locator('#clearTrail').isEnabled(),true,'Clear must remain available during Watch');
  await page.locator('#clearTrail').tap();await resetState(page);
  await page.waitForTimeout(1100);await resetState(page);
  await canMove(page);assert.deepEqual(dialogs,[]);
});

test('Clear during Watch Rest cancels the countdown and old progress',async t=>{
  // Catches a surviving Rest interval granting completion to the new attempt.
  const {page,dialogs}=await openGame(t);await watch(page,'rest');
  assert.equal(await page.locator('#clearTrail').isEnabled(),true,'Clear must remain available during the Watch rest pause');
  await page.locator('#clearTrail').tap();await resetState(page);
  await page.waitForTimeout(3300);await resetState(page);
  await canMove(page);assert.deepEqual(dialogs,[]);
});

test('Start during Watch stops the demo without a confirmation',async t=>{
  // Catches the playing-state confirmation and a demo resuming after Start.
  const {page,dialogs}=await openGame(t);await watch(page);
  await page.locator('#newRun').tap();
  assert.deepEqual(dialogs,[],'Start must restart Watch without a modal');
  await resetState(page);await page.waitForTimeout(1100);await resetState(page);
  await canMove(page);
});

test('Start during manual play restarts immediately with the same color',async t=>{
  // Catches a remaining playing-state confirmation outside Watch.
  const {page,dialogs}=await openGame(t);await page.locator('#newRun').tap();await canMove(page);
  await page.locator('#newRun').tap();
  assert.deepEqual(dialogs,[],'Start must not ask before beginning the selected-color attempt');
  await resetState(page);await canMove(page);
});
