import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium,expect}=require(process.env.MM_PLAYWRIGHT || '@playwright/test');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const server=createServer(async(request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  const file=resolve(root,'.'+pathname);
  if(!file.startsWith(root+sep)){response.writeHead(403).end();return;}
  try{
    const data=await readFile(file);
    const mime={'.html':'text/html','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.json':'application/json','.mp3':'audio/mpeg'};
    response.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(data);
  }catch{response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=process.env.SANA_BASE_URL || `http://127.0.0.1:${server.address().port}/mathmatrix/beta-app/`;
const output=process.env.SANA_SHOTS || resolve(root,'artifacts','sana-bob');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.MM_CHROME?{executablePath:process.env.MM_CHROME}:{})});
const evidence=[];
let checks=0;
async function motion(locator){
  return locator.evaluate(element=>{
    const animation=element.getAnimations()[0];
    if(!animation)return null;
    const running=animation.playState==='running';
    const duration=animation.effect.getTiming().duration;
    const easing=getComputedStyle(element).animationTimingFunction;
    animation.pause();
    const positions=[0,duration/2,duration].map(time=>{
      animation.currentTime=time;
      return new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;
    });
    animation.play();
    return {running,duration,easing,positions};
  });
}
try{
  const context=await browser.newContext({viewport:{width:768,height:1024},hasTouch:true,reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('mmSound','off');localStorage.setItem('mmMusic','off');});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'criss-cross.html');
  const reference=await motion(page.locator('.sanaAvatar'));
  assert(reference?.running,'Criss-Cross reference animates');
  assert.equal(reference.duration,3000);
  assert.deepEqual(reference.positions,[0,-5,0]); checks++;
  for(const route of ['cave-treasure-hunt.html','treasure-hunt-landscape-prototype/index.html']){
    await page.goto(base+route);
    const avatar=page.locator('#playerFace');
    await expect(avatar).toBeVisible();
    const actual=await motion(avatar);
    assert(actual?.running,route+': SaNa must bob automatically');
    assert.deepEqual(actual,reference,route+': motion matches Criss-Cross'); checks++;
    evidence.push({route,...actual});
    for(const [width,height] of [[390,844],[768,1024]]){
      await page.setViewportSize({width,height});
      await expect(avatar).toBeInViewport();
      await expect(page.locator('#newRun')).toBeInViewport();
      const name=route.startsWith('cave')?'cave':'interactive';
      await page.screenshot({path:resolve(output,`${name}-${width}.png`)}); checks++;
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await expect.poll(()=>avatar.evaluate(element=>element.getAnimations().length)).toBe(0); checks++;
    await page.emulateMedia({reducedMotion:'no-preference'});
    await expect.poll(()=>avatar.evaluate(element=>element.getAnimations().length)).toBe(1);
    await page.locator('#ball circle').waitFor();
    await page.getByRole('radio',{name:'Red player',exact:true}).click();
    await page.locator('#newRun').click();
    // The interactive story pauses movement until its existing introduction is continued.
    if(await page.locator('#storyReveal').isVisible()){
      await expect.poll(()=>page.locator('#storyImage').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
      for(let frame=0;frame<4&&await page.locator('#storyReveal').isVisible();frame++)await page.locator('#storyContinue').click();
      await expect(page.locator('#storyReveal')).toBeHidden(); checks++;
    }
    const position=()=>page.locator('#ball circle').evaluate(element=>[element.getAttribute('cx'),element.getAttribute('cy')]);
    const start=await position();
    await page.keyboard.press('ArrowDown');
    assert.notDeepEqual(await position(),start,route+': physical key moves the pawn'); checks++;
    await page.keyboard.press('ArrowUp');
    assert.deepEqual(await position(),start,route+': backtracking returns to the entrance'); checks++;
    const now=new Date();await page.clock.install({time:now});await page.clock.pauseAt(now);
    await page.locator('#watchButton').click();
    await expect(page.locator('#watchButton')).toHaveAttribute('aria-pressed','true');
    await page.clock.runFor(1600);
    await page.locator('#clearTrail').click();
    await expect(page.locator('#watchButton')).toHaveAttribute('aria-pressed','false');
    const cleared=await position();
    await page.clock.runFor(3000);
    assert.deepEqual(await position(),cleared,route+': Clear cancels queued Watch movement'); checks++;
    assert(await motion(avatar),route+': SaNa still animates after gameplay'); checks++;
    await page.clock.resume();
  }
  assert.deepEqual(errors,[],'No browser script errors'); checks++;
  await writeFile(resolve(output,'motion-evidence.json'),JSON.stringify(evidence,null,2));
  console.log(`PASS: ${checks} checks; Criss-Cross and both Treasure Hunt avatars move 0 → -5 → 0 px every 3 seconds. Evidence: ${output}`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
