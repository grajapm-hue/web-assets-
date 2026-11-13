'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {before,after,test}=require('node:test');
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../beta-app'),artifacts=process.env.MM_NAV_ARTIFACT_DIR;
let browser,server,base;
before(async()=>{
  if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
  server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  base=process.env.MM_LAYOUT_BASE_URL||`http://127.0.0.1:${server.address().port}/`;
  browser=await playwright[process.env.MM_BROWSER||'chromium'].launch();
});
after(async()=>{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
const sizes=[['android-portrait',393,852,true],['android-landscape',852,393,true],['iphone-portrait',390,844,true],['iphone-landscape',844,390,true],['small-phone',360,640,true],['narrow-phone',320,568,true],['narrow-phone-landscape',568,320,true],['android-tab-portrait',800,1280,true],['android-tab-landscape',1280,800,true],['ipad-portrait',768,1024,true],['ipad-landscape',1024,768,true],['ipad-pro-portrait',834,1194,true],['ipad-pro-landscape',1194,834,true],['laptop-small',1024,768,false],['laptop',1366,768,false],['laptop-large',1440,900,false]];
async function snapshot(page,name){if(artifacts)await page.screenshot({path:path.join(artifacts,name+'.png'),animations:'disabled'});}
async function geometry(page){return page.evaluate(()=>{
  const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};};
  return {header:box(document.querySelector('.appBar')),nav:box(document.querySelector('.tabBar')),cards:[...document.querySelectorAll('.categoryCard')].map(box),utilities:['appBarChip','diffInstall','diffTip','diffShare','barMore'].map(id=>({id,...box(document.getElementById(id))})),tabs:[...document.querySelectorAll('.tabBar .tabBtn')].filter(e=>e.getBoundingClientRect().width).map(box),overflow:document.documentElement.scrollWidth>innerWidth};
});}
async function header(page){
  assert.equal(await page.locator('#appUtilities').count(),1,'one shared utility header is required');
  for(const id of ['appBarChip','diffInstall','diffTip','diffShare']){
    assert.equal(await page.locator('.appBar #'+id).count(),1,id+' must move into the shared header');
    const b=await page.locator('#'+id).boundingBox();
    assert.ok(b.width>=40&&b.height>=44,`${id} is only ${b.width}×${b.height}`);
  }
  const g=await geometry(page);
  assert.ok(g.utilities.every(b=>b.hit&&b.x>=0&&b.right<=page.viewportSize().width&&b.bottom<=g.header.bottom+1),JSON.stringify(g.utilities));
  assert.equal(g.overflow,false);
}
for(const [name,width,height,touch] of sizes){
 test(`consolidated chooser and QR layout: ${name} ${width}x${height}`,{timeout:20000},async()=>{
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,serviceWorkers:'block',reducedMotion:'reduce'});
  try{
   await context.addInitScript(()=>{localStorage.setItem('mmSound','off');Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.testCopied=text;}}});});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'index.html');await page.locator('#splashPlay').click({force:true});await page.locator('#splashPlay').waitFor({state:'detached'});
   const g=await geometry(page);await snapshot(page,name+'-home');
   if(artifacts)fs.writeFileSync(path.join(artifacts,name+'-home.json'),JSON.stringify(g,null,2));
   await header(page);
   assert.equal(await page.locator('.categoryFooter').count(),0,'the duplicate utility footer must be removed');
   assert.equal(g.cards.length,12);assert.ok(g.cards.every(c=>c.hit&&c.bottom<=g.nav.y&&c.y>=g.header.bottom));
   const clipped=await page.locator('.categoryCard').evaluateAll(cards=>cards.filter(card=>{const copy=card.querySelector('.categoryCardCopy'),name=card.querySelector('.categoryName'),r=card.getBoundingClientRect(),n=name.getBoundingClientRect();return copy.scrollHeight>copy.clientHeight+1||n.top<r.top||n.bottom>r.bottom;}).map(card=>card.dataset.category));
   assert.deepEqual(clipped,[],'book titles and descriptions must fit inside their cards');
   assert.ok(g.nav.y-Math.max(...g.cards.map(c=>c.bottom))<=22,'books leave an unused band above navigation');
   assert.equal(g.tabs.length,4);assert.ok(g.tabs.every(t=>t.hit&&t.height>=56));
   assert.ok(Math.max(...g.tabs.map(t=>t.width))-Math.min(...g.tabs.map(t=>t.width))<=1,'bottom tabs must have equal widths');
   assert.equal(await page.locator('#tab-scApp').innerText(),'QR Code');
   await page.getByRole('button',{name:'Add Magic, 6 puzzles',exact:true}).click();
   await header(page);assert.equal(await page.locator('.bookChoice:visible').count(),6);
   await page.locator('#navBack').click();assert.equal(await page.locator('.categoryCard:visible').count(),12);
   await page.locator('#tab-scApp').click();await header(page);await snapshot(page,name+'-qr');
   for(const id of ['shareBtn','installBtn','offlineBtn','updateBtn','rowOffline'])assert.equal(await page.locator('#'+id).isVisible(),false,'repeated action '+id+' is visible on QR page');
   const qr=await page.locator('#shareQrCode').boundingBox(),about=await page.locator('#rowAbout').boundingBox(),nav=await page.locator('.tabBar').boundingBox();
   assert.ok(qr.width>=128&&qr.height>=128&&qr.y>=0&&qr.y+qr.height<=nav.y,'QR code must fit and remain scannable');
   assert.ok(about.y+about.height<=nav.y,'About must remain above the bottom navigation');
   assert.equal(await page.locator('.shareQrCopy h3').count(),1);
   await page.locator('#copyLinkBtn').click();
   const copied=await page.evaluate(()=>window.testCopied);
   assert.equal(new URL(copied).origin,new URL(base).origin,'Copy Link must point at this app origin');
   assert.ok(new URL(copied).pathname.startsWith(new URL(base).pathname),'Copy Link must keep the Beta app path');
   assert.equal(await page.locator('#shareQrCode').getAttribute('aria-label'),'QR code for '+copied,'QR and Copy Link must share the same target');
   await page.locator('#diffTip').click();assert.equal(await page.locator('#sheetHost').isVisible(),true);await page.locator('#shClose').click();
   await page.locator('#rowAbout').click();assert.match(await page.locator('#sheetHost .categoryVersion').innerText(),/Beta V\.224/);await page.locator('#shClose').click();
   await page.locator('#navBack').click();assert.equal(await page.locator('.categoryCard:visible').count(),12);
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 });
}
test('rotating the same tablet retains chooser and QR controls',async()=>{
 const context=await browser.newContext({viewport:{width:768,height:1024},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:'reduce'});
 try{
  const page=await context.newPage();await page.goto(base+'beta.html');await page.locator('#splashPlay').click({force:true});await page.locator('#splashPlay').waitFor({state:'detached'});
  for(const v of [{width:1024,height:768},{width:768,height:1024}]){await page.setViewportSize(v);await header(page);assert.equal(await page.locator('.categoryCard:visible').count(),12);}
  await page.locator('#tab-scApp').click();await page.locator('#copyLinkBtn').focus();for(const v of [{width:1024,height:768},{width:768,height:1024}]){await page.setViewportSize(v);await header(page);assert.equal(await page.locator('#shareQrCode').isVisible(),true);assert.equal(await page.locator('#copyLinkBtn').evaluate(e=>e===document.activeElement),true,'rotation must preserve Copy Link focus');}
 }finally{await context.close();}
});
for(const [name,width,height,insets] of [['iphone-safe-portrait',390,844,{top:47,left:0,right:0,bottom:34}],['iphone-safe-landscape',844,390,{top:0,left:44,right:44,bottom:21}],['iphone-x-safe-landscape',812,375,{top:0,left:44,right:44,bottom:21}]]){
 test(name+' keeps controls clear of the notch and home indicator',async()=>{
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:'reduce'});
  try{
   const page=await context.newPage();await page.goto(base+'beta.html');
   await page.evaluate(insets=>{for(const [k,v] of Object.entries(insets))document.documentElement.style.setProperty('--safe'+k[0].toUpperCase()+k.slice(1),v+'px');window.dispatchEvent(new Event('resize'));},insets);
   await page.locator('#splashPlay').click({force:true});await page.locator('#splashPlay').waitFor({state:'detached'});
   for(const screen of ['home','qr']){
    if(screen==='qr')await page.locator('#tab-scApp').click();
    const g=await geometry(page);
    assert.ok(g.utilities.every(b=>b.x>=insets.left&&b.right<=width-insets.right&&b.y>=insets.top),'header enters a safe area');
    assert.ok(g.tabs.every(b=>b.x>=insets.left&&b.right<=width-insets.right&&b.bottom<=height-insets.bottom+1),'navigation enters the home-indicator area');
    if(screen==='home')assert.ok(g.cards.every(c=>c.bottom<=g.nav.y&&c.hit));
    else {const qr=await page.locator('#shareQrCode').boundingBox();assert.ok(qr.x>=insets.left&&qr.x+qr.width<=width-insets.right,'QR code enters the notch area');}
    await snapshot(page,name+'-'+screen);
   }
  }finally{await context.close();}
 });
}
test('Installed status fits beside Back on a narrow iPhone',async()=>{
 const context=await browser.newContext({viewport:{width:375,height:667},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:'reduce'});
 try{
  await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
  const page=await context.newPage();await page.goto(base+'index.html');await page.locator('#splashPlay').click({force:true});await page.locator('#splashPlay').waitFor({state:'detached'});
  assert.equal(await page.locator('#diffInstall').innerText(),'Installed');assert.equal(await page.locator('#diffInstall').isDisabled(),true);
  await page.locator('#tab-scApp').click();await header(page);await snapshot(page,'iphone-installed-qr');
 }finally{await context.close();}
});
