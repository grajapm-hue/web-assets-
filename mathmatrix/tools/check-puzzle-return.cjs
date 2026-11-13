'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {before,after,test}=require('node:test');
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../beta-app'),artifacts=process.env.MM_RETURN_ARTIFACT_DIR;
const engine=process.env.MM_BROWSER||'chromium';
let browser,server,base;
before(async()=>{
 if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
 server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg','.png':'image/png'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 base=process.env.MM_LAYOUT_BASE_URL||`http://127.0.0.1:${server.address().port}/`;
 browser=await playwright[engine].launch(engine==='chromium'?{args:['--disable-features=BackForwardCache']}:{});
});
after(async()=>{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
async function fixture(t,width=390,height=844){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<1200,isMobile:width<1200,serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(()=>{
  localStorage.setItem('mmSound','off');
  if(/\/(beta|index)\.html$/.test(location.pathname))sessionStorage.setItem('test.appBoots',String(Number(sessionStorage.getItem('test.appBoots')||0)+1));
 });
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 t.after(async()=>{if(artifacts&&!page.isClosed())await page.screenshot({path:path.join(artifacts,t.name.replace(/[^a-z0-9]+/gi,'-')+'.png')});await context.close();});
 return {context,page,errors};
}
async function enter(page,entry){
 await page.goto(base+entry);await page.locator('#splashPlay').click({force:true});await page.locator('#splashPlay').waitFor({state:'detached'});
}
async function returned(page,errors,book){
 await page.waitForURL(url=>['beta.html','index.html'].some(entry=>url.pathname===new URL(entry,base).pathname));
 await page.waitForLoadState('load');
 assert.equal(await page.locator('#splashPlay').count(),0,'returning from a puzzle must not reopen welcome');
 await page.waitForFunction(()=>!document.documentElement.classList.contains('mmBooting'));
 if(book){assert.equal(await page.locator('.categoryOptions:visible .bookChoice:visible').count(),3);assert.match(await page.locator('.categoryTitle').innerText(),/SaNaMaze/);}
 else assert.equal(await page.locator('.categoryCard:visible').count(),12);
 assert.deepEqual(errors,[]);
}
for(const entry of ['beta.html','index.html'])for(const [width,height] of [[390,844],[844,390],[1024,768],[1366,768]]){
 test(`${entry} Tic-Tac-Toe arrow returns to chooser at ${width}x${height}`,async t=>{
  const {page,errors}=await fixture(t,width,height);await enter(page,entry);
  for(let repeat=0;repeat<2;repeat++){
   await page.getByRole('button',{name:'Tic-Tac-Toe, play puzzle',exact:true}).click();await page.waitForURL(/tic-tac-toe\.html/);
   await page.locator('.cell').first().click();await page.getByRole('link',{name:'Back to puzzles',exact:true}).click();
   await returned(page,errors);assert.equal(new URL(page.url()).searchParams.has('mm-return'),false,'return URL marker must be consumed');
  }
 });
}
for(const entry of ['beta.html','index.html']){
 test(`${entry} browser Back works without relying on the back-forward cache`,async t=>{
  const {page,errors}=await fixture(t);await enter(page,entry);
  const boots=await page.evaluate(()=>Number(sessionStorage.getItem('test.appBoots')));
  await page.getByRole('button',{name:'Tic-Tac-Toe, play puzzle',exact:true}).click();await page.waitForURL(/tic-tac-toe\.html/);await page.goBack();
  await returned(page,errors);
  if(engine==='chromium')assert.ok(await page.evaluate(()=>Number(sessionStorage.getItem('test.appBoots')))>boots,'exercise a fresh document return');
 });
}
const standalone=[['tic-tac-toe.html','a.back'],['criss-cross.html','#ccmBack'],['MultiplyMagic3.html','.backLink a'],['tunnels-of-meta.html','#backBtn'],['cave-treasure-hunt.html','#backToBeta'],['treasure-hunt-landscape-prototype/index.html','#backToBeta']];
for(const [file,back] of standalone){
 test(`${file} direct-entry back button opens the chooser without welcome`,async t=>{
  const {page,errors}=await fixture(t);await page.goto(base+file);await page.locator(back).click();await returned(page,errors);
  assert.equal(new URL(page.url()).searchParams.has('mm-return'),false);
  await page.reload();assert.equal(await page.locator('#splashPlay:visible').count(),1,'a return marker must not suppress future new launches');
 });
}
for(const [size,back] of [['tunnels','#backBtn'],['cave-treasure','#backToBeta'],['sana-treasure-hunt','#backToBeta']]){
 test(`${size} back restores the SaNaMaze book without welcome`,async t=>{
  const {page,errors}=await fixture(t,1024,768);await enter(page,'beta.html');
  await page.locator('.categoryCard[data-category="SaNaMaze"]').click();
  await page.locator('.bookChoice[data-size="'+size+'"]:visible').click();
  await page.locator(back).click();await returned(page,errors,true);
 });
}
test('Criss-Cross browser Back restores its chooser on a fresh document',async t=>{
 const {page,errors}=await fixture(t);await enter(page,'index.html');
 await page.locator('.categoryCard[data-category="Criss-Cross"]').click();await page.waitForURL(/criss-cross\.html/);await page.goBack();await returned(page,errors);
});
for(const invalid of ['{bad',JSON.stringify({name:'No such book',direct:true,choice:0,time:1}),JSON.stringify({name:'Tic-Tac-Toe',direct:true,choice:'wrong',time:1})]){
 test(`invalid return state does not bypass welcome: ${invalid.slice(0,35)}`,async t=>{
  const {page,context}=await fixture(t);
  await context.addInitScript(({key,invalid})=>sessionStorage.setItem(key,invalid),{key:'mathmatrix-book-return:'+new URL(base).pathname,invalid});
  await page.goto(base+'beta.html');assert.equal(await page.locator('#splashPlay:visible').count(),1);
 });
}
for(const entry of ['beta.html','index.html']){
 test(`${entry} explicit puzzle return works with session storage unavailable`,async t=>{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});t.after(()=>context.close());
  await context.addInitScript(()=>{localStorage.setItem('mmSound','off');Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Storage unavailable','SecurityError');}});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+entry+'?mm-return=puzzles');await returned(page,errors);
  assert.equal(new URL(page.url()).searchParams.has('mm-return'),false);
  await page.reload();assert.equal(await page.locator('#splashPlay:visible').count(),1);
 });
}
