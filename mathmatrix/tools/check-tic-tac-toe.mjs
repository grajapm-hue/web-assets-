import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';

const require = createRequire(import.meta.url);
const { chromium, expect } = require(process.env.MM_PLAYWRIGHT || '@playwright/test');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + pathname);
  if (!file.startsWith(root + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))) {
    response.writeHead(403).end(); return;
  }
  try {
    const data = await readFile(file);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.json': 'application/json', '.png': 'image/png' };
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.MM_BASE_URL || `http://127.0.0.1:${server.address().port}/mathmatrix/beta-app/`;
const browser = await chromium.launch({ headless: true, ...(process.env.MM_CHROME ? { executablePath: process.env.MM_CHROME } : {}) });
const shots = process.env.MM_SHOTS || resolve(root, 'artifacts', 'tic-tac-toe');
await mkdir(shots, { recursive: true });
const errors = [];
let checks = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + 'beta.html');
  for (const source of await page.locator('script:not([src])').allTextContents()) new Script(source);
  assert.equal(await page.locator('button[data-size="tic-tac-toe"]').count(), 1, 'One Tic-Tac-Toe menu card'); checks++;
  await page.getByRole('button', { name: 'Tap to play' }).click();
  await page.locator('.splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Puzzles', exact: false }).click();
  const menuCard = page.locator('button[data-size="tic-tac-toe"]');
  await menuCard.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(shots, 'single-menu-card.png'), animations: 'disabled' });
  await menuCard.click();
  await expect(page).toHaveURL(/tic-tac-toe\.html$/); checks++;
  for (const source of await page.locator('script:not([src])').allTextContents()) new Script(source);
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  const notifications = page.getByRole('status', { name: 'SaNa notifications' });
  await expect(notifications).toBeVisible();
  await expect(notifications).toContainText('Hello! I’m SaNa'); checks++;
  await expect(page.getByText('SaNa', { exact: true })).toBeVisible(); checks++;
  await expect(page.getByRole('button', { name: 'Logic', exact: true })).toBeVisible(); checks++;
  await page.getByRole('button', { name: 'Logic', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Logic/ })).toContainText('3 in a row');
  await page.getByRole('button', { name: 'Close logic' }).click(); checks++;
  const cell = (row, column) => page.getByRole('button', { name: new RegExp(`^Row ${row}, column ${column}(?:,| )`) });
  const marks = () => page.locator('#board [data-mark]').count();
  await cell(1,1).click();
  await expect(notifications).toContainText('O, tap an empty square');
  await cell(1,1).click();
  await expect(notifications).toContainText('already taken');
  assert.equal(await marks(), 1);
  await expect(page.locator('#status')).toContainText('O’s turn'); checks++;
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(notifications).toContainText('Board and scores reset'); checks++;
  for (const size of [3, 4, 5]) {
    await page.getByRole('button', { name: `${size}×${size}`, exact: true }).click();
    await expect(page.getByRole('group', { name: `${size} by ${size} Tic-Tac-Toe board` }).getByRole('button')).toHaveCount(size * size);
    for (let column = 1; column <= size; column++) {
      await cell(1, column).click();
      if (column < size) await cell(2, column).click();
    }
    await expect(page.locator('#status')).toHaveText('X wins!');
    await expect(notifications).toContainText('Well played'); checks++;
    assert.equal(await page.locator('.winner').count(), size); checks++;
    await cell(size, size).click();
    assert.equal(await marks(), 2 * size - 1, 'Finished game rejects moves'); checks++;
    await page.getByRole('button', { name: 'New', exact: true }).click();
    assert.equal(await marks(), 0);
    await expect(page.locator('#scoreX')).toHaveText('1'); checks++;
    await expect(notifications).toContainText('scores are kept'); checks++;
    await page.getByRole('button', { name: 'Watch', exact: true }).click();
    await expect(page.locator('#status')).toContainText('Watch');
    await expect(notifications).toContainText('showing X and O'); checks++;
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.clock.runFor(10000);
    assert.equal(await marks(), 0, 'Clear cancels pending Watch moves');
    await expect(page.locator('#scoreX')).toHaveText('0'); checks++;
    await page.getByRole('button', { name: 'Watch', exact: true }).click();
    await page.clock.runFor(10000);
    await expect(page.locator('#status')).toContainText('X wins');
    await expect(notifications).toContainText('green line'); checks++;
    await expect(page.locator('#scoreX')).toHaveText('0'); checks++;
    if (size === 5) {
      await page.setViewportSize({width:768,height:1024});
      await page.screenshot({path:resolve(shots,'watch-with-sana.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
    }
    await page.getByRole('button', { name: 'New', exact: true }).click();
  }
  await page.getByRole('button', { name: '3×3', exact: true }).click();
  await cell(3,3).click();
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  await page.clock.runFor(1500);
  await page.getByRole('button', { name: 'Stop Watch', exact: true }).click();
  await expect(cell(3,3)).toHaveText('X');
  await expect(page.locator('#status')).toContainText('O’s turn');
  await page.clock.runFor(10000);
  assert.equal(await marks(), 1, 'Stop restores the interrupted round'); checks++;
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.clock.runFor(10000);
  assert.equal(await marks(), 0, 'New cancels Watch'); checks++;
  // A full board without a line is a draw.
  for (const [row, column] of [[1,1],[1,2],[1,3],[2,2],[2,1],[2,3],[3,2],[3,1],[3,3]]) await cell(row, column).click();
  await expect(page.locator('#status')).toHaveText('It’s a draw!'); checks++;
  await expect(notifications).toContainText('Every square is filled'); checks++;
  await page.getByRole('button', { name: 'Sound & Music settings' }).click();
  const musicLoaded = page.waitForResponse(response => response.url().endsWith('bgm-beyond-stone-gate.mp3') && response.ok());
  await page.getByRole('button', { name: 'Sound: OFF', exact: true }).click();
  await musicLoaded; checks++;
  assert.equal(await page.evaluate(() => localStorage.getItem('mmSound')), 'on');
  await page.getByRole('button', { name: 'Music: ON', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('mmMusic')), 'off');
  await page.getByRole('button', { name: 'Sound: ON', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Music: OFF', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close sound settings' }).click(); checks++;
  const shared = await context.newPage();
  await shared.goto(base + 'tic-tac-toe.html');
  await shared.getByRole('button', { name: 'Sound & Music settings' }).click();
  await expect(shared.getByRole('button', { name: 'Sound: OFF', exact: true })).toBeVisible();
  await expect(shared.getByRole('button', { name: 'Music: OFF', exact: true })).toBeDisabled();
  await shared.close(); checks++;
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await cell(1,1).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await expect(cell(1,2)).toBeFocused(); checks++;
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  await page.getByRole('button', { name: '5×5', exact: true }).click();
  await page.clock.fastForward(10000);
  assert.equal(await marks(), 0, 'Size change cancels Watch'); checks++;
  for (const [width,height] of [[360,740],[768,1024],[1440,900]]) {
    await page.setViewportSize({width,height});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No overflow at ${width}`);
    await expect(notifications).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeInViewport();
    await page.screenshot({ path: resolve(shots, `game-${width}.png`), fullPage: true }); checks++;
  }
  const offline = await browser.newContext();
  const installed = await offline.newPage();
  await installed.goto(base + 'beta.html');
  await installed.evaluate(async () => { await navigator.serviceWorker.ready; });
  await installed.waitForFunction(() => !!navigator.serviceWorker.controller);
  await offline.setOffline(true);
  await installed.goto(base + 'tic-tac-toe.html?size=4');
  await expect(installed.getByRole('group', { name: '4 by 4 Tic-Tac-Toe board' }).getByRole('button')).toHaveCount(16); checks++;
  await offline.close();
  assert.deepEqual(errors, [], 'No browser JavaScript errors'); checks++;
  console.log(`PASS: ${checks} checks; screenshots: ${shots}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
