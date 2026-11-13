'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {before,after,test}=require('node:test');
const playwrightModule=process.env.PLAYWRIGHT_MODULE||'playwright';
const playwright=require(playwrightModule);
const {PNG}=require(process.env.PNGJS_MODULE||require.resolve('pngjs',{paths:[path.dirname(require.resolve(playwrightModule))]}));
const root=path.resolve(__dirname,'../beta-app'),artifacts=process.env.MM_PAINT_ARTIFACT_DIR;
const engine=process.env.MM_BROWSER||'chromium';
let browser,server,base;
before(async()=>{
 if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
 server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 base=process.env.MM_LAYOUT_BASE_URL||`http://127.0.0.1:${server.address().port}/`;
 browser=await playwright[engine].launch(engine==='chromium'?{args:['--disable-features=BackForwardCache']}:{});
});
after(async()=>{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
function warmPixels(buffer){
 const png=PNG.sync.read(buffer);let warm=0;const samples=[];
 for(const y of [.12,.3,.5,.7,.88])for(const x of [.12,.3,.5,.7,.88]){
  const i=(Math.floor(png.height*y)*png.width+Math.floor(png.width*x))*4;
  const [r,g,b]=png.data.subarray(i,i+3);if(r>100&&r>=b+15&&g>=b+8)warm++;
  samples.push([r,g,b]);
 }
 return {ratio:warm/samples.length,samples};
}
async function setup(t,width,height){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<1200,isMobile:width<1200,deviceScaleFactor:Number(process.env.MM_PAINT_DPR)||1,serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(()=>localStorage.setItem('mmSound','off'));
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 t.after(()=>context.close());return {context,page,errors};
}
async function enter(page,entry){await page.goto(base+entry);await page.locator('#splashPlay').click({force:true});await page.locator('#splashPlay').waitFor({state:'detached'});}
for(const entry of ['beta.html','index.html'])for(const action of ['update','tic-tac-toe-back'])for(const [width,height] of [[390,844],[844,390],[1024,768],[1366,768]]){
 test(`${entry} ${action} paints a warm handoff at ${width}x${height}`,{timeout:25000},async t=>{
  const {context,page,errors}=await setup(t,width,height);await enter(page,entry);
  if(action==='tic-tac-toe-back'){
   // Exercise the cold fallback used when the prior page cannot be identified.
   // Normal history reuse is tested separately below.
   await page.evaluate(()=>{const meta=document.createElement('meta');meta.name='referrer';meta.content='no-referrer';document.head.appendChild(meta);});
   await page.getByRole('button',{name:'Tic-Tac-Toe, play puzzle',exact:true}).click();await page.waitForURL(/tic-tac-toe\.html/);
  }
  let reached,release;const blocked=new Promise(r=>{reached=r;}),gate=new Promise(r=>{release=r;});
  await context.route('**/qrcode.min.js',async route=>{reached();await gate;await route.continue();});
  const navigating=page.locator(action==='update'?'#appBarChip':'a.back').click({noWaitAfter:true});
  let metrics;
  try{
   await blocked;
   await page.waitForFunction(()=>document.body&&document.documentElement.classList.contains('mmBooting'));
   await page.waitForTimeout(80);
   metrics=await page.evaluate(()=>({root:getComputedStyle(document.documentElement).backgroundColor,cover:getComputedStyle(document.body,'::before').backgroundImage,app:getComputedStyle(document.querySelector('.appShell')).backgroundImage,brand:getComputedStyle(document.body,'::before').content,booting:document.documentElement.classList.contains('mmBooting')}));
   const name=`${entry}-${action}-${width}x${height}`;
   // WebKit's screenshot API waits for fonts while parser-blocking code is
   // deliberately held. Verify its computed loading surface and real return;
   // use Chromium for the actual delayed-load pixel capture.
   metrics.pixelCapture=engine==='chromium';
   if(metrics.pixelCapture){
    const screenshot=await page.screenshot({animations:'disabled'});Object.assign(metrics,warmPixels(screenshot));
    if(artifacts){fs.writeFileSync(path.join(artifacts,name+'.png'),screenshot);await page.screenshot({path:path.join(artifacts,name+'-center.png'),clip:{x:width*.1,y:height*.35,width:width*.8,height:height*.3}});}
   }
   if(artifacts)fs.writeFileSync(path.join(artifacts,name+'.json'),JSON.stringify(metrics,null,2));
  }finally{release();}
  await navigating;await page.waitForURL(u=>/\/(beta|index)\.html$/.test(u.pathname));
  await page.locator('.categoryChooser').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('mmBooting'));
  assert.equal(await page.locator('#splashPlay').count(),0);
  assert.equal(await page.locator('.categoryCard:visible').count(),12);
  assert.equal(metrics.cover,metrics.app,'loading surface must match the finished app palette');
  assert.match(metrics.brand,/MathMatrix Pro\+\+/,'loading surface must identify the app');
  if(metrics.pixelCapture)assert.ok(metrics.ratio>=.85,'loading frame leaves the warm app palette: '+JSON.stringify(metrics));
  assert.deepEqual(errors,[]);
 });
}
for(const entry of ['beta.html','index.html','']){
 test(`${entry} Tic-Tac-Toe Back reuses the previous chooser history entry`,async t=>{
  const {page}=await setup(t,390,844);await enter(page,entry+'?test-route=preserved');
  const before={url:page.url(),length:await page.evaluate(()=>history.length)};
  await page.getByRole('button',{name:'Tic-Tac-Toe, play puzzle',exact:true}).click();await page.waitForURL(/tic-tac-toe\.html/);
  await page.locator('a.back').click();await page.waitForURL(before.url);
  await page.locator('.categoryChooser').waitFor({state:'visible'});
  assert.equal(page.url(),before.url,'Back should preserve the original entrypoint and URL');
  assert.ok(await page.evaluate(()=>history.length)<=before.length+1,'Back creates another app navigation instead of traversing history');
  assert.equal(await page.locator('#splashPlay').count(),0);
 });
}
for(const entry of ['beta.html','index.html']){
 test(`${entry} paints warm before external scripts finish loading`,{timeout:25000},async t=>{
  const {context,page,errors}=await setup(t,390,844);await enter(page,entry);
  let reached,release;const blocked=new Promise(r=>{reached=r;}),gate=new Promise(r=>{release=r;});
  await context.route('**/category-chooser.js',async route=>{reached();await gate;await route.continue();});
  const navigating=page.locator('#appBarChip').click({noWaitAfter:true});let metrics;
  try{
   await blocked;await page.waitForTimeout(80);
   metrics=await page.evaluate(()=>{
    const critical=document.getElementById('mmBootPaint'),external=document.querySelector('script[src]');
    return {root:getComputedStyle(document.documentElement).backgroundColor,criticalFirst:!!critical&&!!(critical.compareDocumentPosition(external)&Node.DOCUMENT_POSITION_FOLLOWING)};
   });
   if(artifacts)fs.writeFileSync(path.join(artifacts,entry+'-early-head.json'),JSON.stringify(metrics,null,2));
  }finally{release();}
  await navigating;await page.locator('.categoryChooser').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('mmBooting'));
  assert.equal(metrics.root,'rgb(201, 168, 124)','early canvas must use the warm app background');
  assert.equal(metrics.criticalFirst,true,'loading colors must precede external scripts');
  assert.equal(await page.locator('html').getAttribute('aria-busy'),null);
  assert.deepEqual(errors,[]);
 });
}
