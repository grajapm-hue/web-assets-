'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {before,after,test}=require('node:test');
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
const artifacts=process.env.MM_LAYOUT_ARTIFACT_DIR;
let browser,server,base;
before(async()=>{
  if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
  server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  base=process.env.MM_LAYOUT_BASE_URL||`http://127.0.0.1:${server.address().port}/mathmatrix/beta-app/`;
  browser=await playwright[process.env.MM_BROWSER||'chromium'].launch();
});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
for(const [width,height] of [[1024,600],[1024,768],[1280,800],[1366,768],[1180,820]]){
  test(`landscape tablet books fill the space above navigation at ${width}x${height}`,async()=>{
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:'reduce'});
    try{
      const page=await context.newPage();
      await page.goto(base+'beta.html');
      await page.locator('#splashPlay').click({force:true});
      await page.locator('#splashPlay').waitFor({state:'detached'});
      await page.waitForTimeout(180);
      const metrics=await page.evaluate(()=>{
        const footer=document.querySelector('.categoryFooter').getBoundingClientRect();
        const nav=document.querySelector('.tabBar').getBoundingClientRect();
        const cards=[...document.querySelectorAll('.categoryCard')].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
        const targets=[...document.querySelectorAll('.categoryFooter #diffTip,.categoryFooter .diffShare')].map(e=>e.getBoundingClientRect().height);
        return {footerGap:nav.top-footer.bottom,bookGap:nav.top-Math.max(...cards.map(c=>c.bottom)),footerHeight:footer.height,targets,cards,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      if(artifacts){await page.screenshot({path:path.join(artifacts,`tablet-${width}x${height}.png`),animations:'disabled'});fs.writeFileSync(path.join(artifacts,`tablet-${width}x${height}.json`),JSON.stringify(metrics,null,2));}
      assert.equal(metrics.cards.length,12);
      assert.ok(metrics.cards.every(c=>c.hit&&c.top>=0&&c.bottom<=height),JSON.stringify(metrics));
      assert.equal(metrics.overflow,false);
      assert.ok(metrics.footerGap<=12,`unused space below footer: ${metrics.footerGap}px`);
      assert.ok(metrics.footerGap>=6,`footer is too close to navigation: ${metrics.footerGap}px`);
      assert.ok(metrics.targets.every(h=>h>=40),`tablet utility targets are too small: ${metrics.targets.join(', ')}`);
      assert.ok(metrics.bookGap<=metrics.footerHeight+22,`books end ${metrics.bookGap}px above navigation; footer needs only ${metrics.footerHeight}px`);
      await page.getByRole('button',{name:'Add Magic, 6 puzzles',exact:true}).click();
      assert.equal(await page.locator('.bookChoice:visible').count(),6);
    }finally{await context.close();}
  });
}
