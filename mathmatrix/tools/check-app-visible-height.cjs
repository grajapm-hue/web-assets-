'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {before,after,test}=require('node:test');
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../beta-app'),engine=process.env.MM_BROWSER||'chromium',artifacts=process.env.MM_VIEWPORT_ARTIFACT_DIR;
let browser,server,base;
before(async()=>{
 if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
 server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 base=process.env.MM_LAYOUT_BASE_URL||`http://127.0.0.1:${server.address().port}/`;
 browser=await playwright[engine].launch();
});
after(async()=>{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
async function setup(t,entry,size){
 const context=await browser.newContext({viewport:size,isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:'reduce'});
 t.after(()=>context.close());await context.addInitScript(()=>localStorage.setItem('mmSound','off'));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+entry);await page.locator('#splashPlay').click({force:true});await page.locator('#splashPlay').waitFor({state:'detached'});
 return {page,context,errors};
}
async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function geometry(page){return page.evaluate(()=>{
 const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
 return {innerHeight,visualHeight:visualViewport?.height,shell:box('.appShell'),nav:box('.tabBar'),cards:[...document.querySelectorAll('.categoryCard')].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}),overflow:document.documentElement.scrollWidth>innerWidth};
});}
function check(g,height){
 assert.ok(Math.abs(g.shell.bottom-height)<=1,'shell does not follow visible height: '+JSON.stringify(g));
 assert.ok(Math.abs(g.nav.bottom-height)<=1,'navigation leaves a bottom band or extends beyond the visible area: '+JSON.stringify(g));
 assert.equal(g.cards.length,12);assert.ok(g.cards.every(c=>c.hit&&c.bottom<=g.nav.top+1),'books must stay above navigation and remain reachable');assert.equal(g.overflow,false);
}
async function capture(page,name,g){if(!artifacts)return;
 fs.writeFileSync(path.join(artifacts,name+'.json'),JSON.stringify(g,null,2));
 await page.screenshot({path:path.join(artifacts,name+'.png'),animations:'disabled'});
 const {width,height}=page.viewportSize();await page.screenshot({path:path.join(artifacts,name+'-bottom.png'),clip:{x:0,y:Math.max(0,height-160),width,height:Math.min(160,height)},animations:'disabled'});
}
for(const entry of ['beta.html','index.html']){
 for(const [mode,size] of [['portrait',{width:393,height:800}],['landscape',{width:800,height:393}]]){
  test(`${entry} uses available ${mode} height when small viewport stays 50px shorter`,{skip:engine!=='chromium'},async t=>{
   const {page,context,errors}=await setup(t,entry,size),cdp=await context.newCDPSession(page);
   await cdp.send('Emulation.setSmallViewportHeightDifferenceOverride',{difference:50});await settle(page);
   const g=await geometry(page);await capture(page,entry+'-'+mode+'-small-viewport',g);check(g,size.height);
   await cdp.send('Emulation.setSmallViewportHeightDifferenceOverride',{difference:0});await settle(page);check(await geometry(page),size.height);assert.deepEqual(errors,[]);
  });
 }
 test(`${entry} fits after viewport settling, rotation, Update and Tic-Tac-Toe Back`,async t=>{
  const {page,errors}=await setup(t,entry,{width:393,height:800});
  for(const size of [{width:393,height:750},{width:393,height:852},{width:852,height:393},{width:852,height:343},{width:800,height:1280},{width:1280,height:800},{width:393,height:800}]){
   await page.setViewportSize(size);await settle(page);check(await geometry(page),size.height);
  }
  await Promise.all([page.waitForURL(u=>u.searchParams.has('mm-update')),page.locator('#appBarChip').click()]);
  await page.locator('.categoryChooser').waitFor({state:'visible'});await settle(page);check(await geometry(page),800);
  await page.getByRole('button',{name:'Tic-Tac-Toe, play puzzle',exact:true}).click();await page.waitForURL(/tic-tac-toe\.html/);
  await page.locator('a.back').click();await page.waitForURL(u=>/\/(index|beta)\.html$/.test(u.pathname));await page.locator('.categoryChooser').waitFor({state:'visible'});await settle(page);
  const g=await geometry(page);await capture(page,entry+'-after-return',g);check(g,800);assert.equal(await page.locator('#splashPlay').count(),0);assert.deepEqual(errors,[]);
 });
 test(`${entry} keeps navigation inside the reported visible viewport on resize and resume`,async t=>{
  const {page,errors}=await setup(t,entry,{width:393,height:800});
  // Model asynchronous viewport reporting; this does not emulate an OS keyboard.
  await page.evaluate(()=>{window.__testVisibleHeight=visualViewport.height;Object.defineProperty(visualViewport,'height',{configurable:true,get(){return window.__testVisibleHeight;}});});
  for(const [height,event] of [[750,'visual-resize'],[850,'resize'],[760,'pageshow'],[800,'visibilitychange']]){
   await page.evaluate(({height,event})=>{window.__testVisibleHeight=height;if(event==='visual-resize')visualViewport.dispatchEvent(new Event('resize'));else if(event==='visibilitychange')document.dispatchEvent(new Event(event));else window.dispatchEvent(new Event(event));},{height,event});
   await settle(page);check(await geometry(page),Math.min(800,height));
  }
  assert.deepEqual(errors,[]);
 });
}
