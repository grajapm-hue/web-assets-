'use strict';
// node --test mathmatrix/tools/check-cave-visible-viewport.cjs
// Simulates a shell where the layout viewport remains taller than the visible viewport.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {before, after, test} = require('node:test');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceFile = process.env.CAVE_DVH_FILE || path.resolve(__dirname, '..', 'beta-app', 'cave-treasure-hunt.html');
const source = fs.readFileSync(sourceFile, 'utf8');
const artifactDirectory = process.env.CAVE_VISIBLE_VIEWPORT_ARTIFACT_DIR;
let browser, server, base;

before(async () => {
  if (artifactDirectory) fs.mkdirSync(artifactDirectory, {recursive:true});
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/cave-treasure-hunt.html') {
      response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      response.end(source);
      return;
    }
    if (pathname === '/sw.js' || pathname === '/beta-sw.js') {
      response.writeHead(200, {'Content-Type':'application/javascript'});
      response.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));");
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true});
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

for (const device of [
  {name:'Android phone',viewport:{width:390,height:844},visibleHeight:620,isMobile:true},
  {name:'Android tablet',viewport:{width:800,height:1280},visibleHeight:980,isMobile:false},
]) test(`direction pad remains visible in one row on ${device.name}`, async () => {
  const page = await browser.newPage({viewport:device.viewport,hasTouch:true,isMobile:device.isMobile});
  try {
    // Simulate Android browser chrome/insets reducing the visible viewport.
    await page.addInitScript(visibleHeight => {
      Object.defineProperty(window.visualViewport, 'height', {configurable:true,get:()=>visibleHeight});
    },device.visibleHeight);
    await page.goto(base + 'cave-treasure-hunt.html');
    await page.locator('#ball circle').waitFor();
    const result = await page.evaluate(() => {
      const rect = element => {
        const r = element.getBoundingClientRect();
        return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};
      };
      const buttons = [...document.querySelectorAll('.pad')];
      const viewportHeight = visualViewport ? visualViewport.height : innerHeight;
      return {
        layoutViewportHeight: innerHeight,
        viewportHeight,
        footer: rect(document.querySelector('.bottom')),
        buttons: buttons.map(rect),
        oneRow: buttons.length === 4 && buttons.every(button =>
          Math.abs(button.getBoundingClientRect().y - buttons[0].getBoundingClientRect().y) < 1),
        allVisible: buttons.length === 4 && buttons.every(button => {
          const r = button.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= viewportHeight;
        }),
      };
    });
    if (artifactDirectory) {
      const fileName = device.name.toLowerCase().replace(/\s+/g,'-');
      fs.writeFileSync(path.join(artifactDirectory,`${fileName}.json`),JSON.stringify(result,null,2));
      await page.screenshot({path:path.join(artifactDirectory,`${fileName}.png`),clip:{
        x:0,y:0,width:device.viewport.width,height:device.visibleHeight,
      }});
    }
    assert.ok(result.viewportHeight < result.layoutViewportHeight,'the fixture has a shorter visible viewport');
    assert.equal(result.oneRow,true,'direction buttons stay in a single row');
    assert.equal(result.allVisible,true,JSON.stringify(result,null,2));
  } finally {
    await page.close();
  }
});
