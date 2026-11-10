/* Run against the actual static Beta using temporary Playwright tooling. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chromium, webkit } = require(process.env.MM_PLAYWRIGHT_MODULE || 'playwright');
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = path.resolve(option('--root', path.join(__dirname, '../..')));
const baselineRoot = option('--baseline-root', '') && path.resolve(option('--baseline-root', ''));
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
    window.__mmObserverCalls={ResizeObserver:0,MutationObserver:0};
    for(const name of Object.keys(window.__mmObserverCalls)){
      const Native=window[name];window[name]=class extends Native{constructor(callback){super((...args)=>{window.__mmObserverCalls[name]++;callback(...args);});}};
    }
    window.__mmPointerTypes=[];document.addEventListener('pointerdown',e=>window.__mmPointerTypes.push(e.pointerType),true);
    window.__mmRuntimeErrors=[];window.addEventListener('error',e=>window.__mmRuntimeErrors.push(e.message),true);
  });
  ctx.setDefaultTimeout(6000);
  return ctx;
}
const gameControls={
  'criss-cross':['#ccmBack','#logicBtn','#watchTopBtn','#ccmSoundBtn','#ccmNewBtn','#ccmClearBtn','#ccmCalcOpenBtn'],
  'tic-tac-toe':['.back','#logicBtn','#watchBtn','#soundBtn','#newRound','#clearBoard'],
  tunnels:['#backBtn','#logicBtn','#watchBtn','#soundBtn','#newBtn','#clearBtn','button[data-dx]'],
  'cave-maze':['#backToBeta','#logicButton','#watchButton','#soundButton','#newRun','#clearTrail','.pad'],
  'story-maze':['#backToBeta','#logicButton','#watchButton','#soundButton','#newRun','#clearTrail','.pad'],
  'multiply-magic':['#clearBtn','#showBtn','#watchBtn','#soundBtn','#logicBtn'],
  'sound-lab':['button.tone','.foot a']
};
async function dragPointer(page,start,end,steps=12){
  if(engine==='chromium'){
    const session=await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    for(let i=1;i<=steps;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/steps,y:start.y+(end.y-start.y)*i/steps}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
    assert((await page.evaluate(()=>window.__mmPointerTypes)).includes('touch'),'Browser must dispatch genuine touch pointers');
  }else{
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps});await page.mouse.up();
  }
}
async function controlLayout(page,selectors){
  return page.locator(selectors.join(',')).evaluateAll(nodes=>nodes.map(node=>{
    let rect=node.getBoundingClientRect(), good=rect.width>0 && rect.height>0, reason='';
    for(let parent=node.parentElement;parent && good;parent=parent.parentElement){
      const css=getComputedStyle(parent), box=parent.getBoundingClientRect();
      if(/auto|scroll/.test(css.overflowY) && parent.scrollHeight>parent.clientHeight+1){
        if(parent.clientHeight<Math.min(35,rect.height)){good=false;reason='collapsed scroll area';}
        rect={...rect,top:Math.max(box.top,0),bottom:Math.min(box.bottom,innerHeight)};
      } else if(/hidden|clip/.test(css.overflowY) && (rect.top<box.top-2 || rect.bottom>box.bottom+2)){
        good=false;reason='clipped by '+(parent.id||parent.className||parent.tagName);
      }
    }
    return {id:node.id||node.getAttribute('aria-label')||node.textContent.trim().slice(0,18),good,reason};
  }));
}
async function games(){
  for(const [name,route] of routes.filter(([name])=>!['app','index'].includes(name))) await test(name+' responsive controls',async()=>{
    const ctx=await context(); const page=await ctx.newPage(); const errors=[];
    page.on('pageerror',e=>errors.push(e.message)); await open(page,route);
    for(const [width,height] of sizes){
      await page.setViewportSize({width,height}); await settle(page);
      const controls=await controlLayout(page,gameControls[name]);
      check(`${name} reachable controls ${width}x${height}`,controls.length>0 && controls.every(x=>x.good),controls.filter(x=>!x.good));
      const geometry=await page.evaluate(()=>{
        const svg=document.querySelector('#maze,#mazeSvg'), board=document.querySelector('.board-wrap');
        const matrix=svg?.getScreenCTM(); const box=board?.getBoundingClientRect();
        return {overflow:document.documentElement.scrollWidth>innerWidth+2,
          ratio:matrix?Math.hypot(matrix.a,matrix.b)/Math.hypot(matrix.c,matrix.d):1,
          square:document.documentElement.classList.contains('tttViewport')?Math.abs(box.width-box.height):0};
      });
      check(`${name} geometry ${width}x${height}`,!geometry.overflow && Math.abs(geometry.ratio-1)<.01 && geometry.square<2,geometry);
      if((width===390&&height===844)||(width===844&&height===390)||(width===1280&&height===720))
        await page.screenshot({path:path.join(reportDir,`${name}-${width}x${height}.png`)});
    }
    check(name+' no uncaught errors',!errors.length,errors); await ctx.close();
  });
  for(const size of [3,4,5]) await test('Tic-Tac-Toe '+size+' win and rotation',async()=>{
    const ctx=await context();const page=await ctx.newPage();await open(page,'tic-tac-toe.html?size='+size);
    for(let column=0;column<size;column++){
      await page.locator('#board .cell').nth(column).click();
      if(column<size-1)await page.locator('#board .cell').nth(size+column).click();
    }
    assert.equal(await page.locator('#scoreX').innerText(),'1');
    assert.equal(await page.locator('#board .winner').count(),size);
    const before=await page.locator('#board').innerText();await page.setViewportSize({width:844,height:390});await settle(page);
    assert.equal(await page.locator('#board').innerText(),before);
    assert.equal(await page.locator('#scoreX').innerText(),'1');
    await page.locator('#newRound').click();assert.equal(await page.locator('#scoreX').innerText(),'1');
    assert.equal(await page.locator('#board [data-mark="X"]').count(),0);
    check('Tic-Tac-Toe '+size+' win and rotation',true);await ctx.close();
  });
  await test('Criss-Cross keypad entry survives rotation',async()=>{
    const ctx=await context();const page=await ctx.newPage();await open(page,'criss-cross.html');
    const input=page.locator('#ccmGrid input').first();await input.click();
    // Guided mode rejects guesses that cannot complete the generated puzzle.
    for(let number=1;number<=9 && !(await input.inputValue());number++)
      await page.locator('#ccmDock').getByRole('button',{name:String(number),exact:true}).click();
    const value=await input.inputValue();assert(value,'One of the legal digits must be accepted');
    await page.setViewportSize({width:844,height:390});await settle(page);assert.equal(await input.inputValue(),value);
    check('Criss-Cross keypad entry survives rotation',true);await ctx.close();
  });
  for(const route of ['cave-treasure-hunt.html','treasure-hunt-landscape-prototype/index.html']) await test(route+' pointer mapping and collision',async()=>{
    const ctx=await context();const page=await ctx.newPage();await open(page,route);await page.locator('#newRun').click();
    for(let frame=0;frame<10 && await page.locator('#storyReveal:visible').count();frame++){await page.locator('#storyContinue').click();await page.waitForTimeout(30);}
    const position=()=>page.locator('#ball circle').evaluate(el=>({x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy'))}));
    async function drag(dx,dy){
      const points=await page.evaluate(({dx,dy})=>{
        const svg=document.getElementById('maze'),ball=document.querySelector('#ball circle');
        const p=svg.createSVGPoint();p.x=Number(ball.getAttribute('cx'));p.y=Number(ball.getAttribute('cy'));
        const start=p.matrixTransform(svg.getScreenCTM());p.x+=dx;p.y+=dy;const end=p.matrixTransform(svg.getScreenCTM());
        return {start:{x:start.x,y:start.y},end:{x:end.x,y:end.y}};
      },{dx,dy});
      await dragPointer(page,points.start,points.end);
    }
    const before=await position();await drag(0,24);const moved=await position();assert(moved.y>before.y,'Dragging down the entrance tunnel must move SaNa');
    await drag(-100,0);const blocked=await position();assert(blocked.x>moved.x-90,'A wall must block the requested lateral drag');
    await page.setViewportSize({width:844,height:390});await settle(page);assert.deepEqual(await position(),blocked);
    await drag(0,24);assert((await position()).y>blocked.y,'Dragging after rotation must use the new screen coordinates');
    check(route+' pointer mapping and collision',true);await ctx.close();
  });
  await test('Tunnels valid moves, walls, and pointer alignment',async()=>{
    const ctx=await context();const page=await ctx.newPage();await open(page,'tunnels-of-meta.html');
    const read=()=>page.evaluate(()=>{const store=JSON.parse(localStorage.getItem('mmTunnelsOfSaNaSave'));return store.levels[store.activeLevel];});
    let state=await read();
    const directions=[['top',0,-1,'ArrowUp'],['right',1,0,'ArrowRight'],['bottom',0,1,'ArrowDown'],['left',-1,0,'ArrowLeft']];
    function next(game,blocked=false){const at=game.path.at(-1),cell=game.cells[at.y][at.x];return directions.find(([side,dx,dy])=>!!cell.walls[side]===blocked && (blocked || (at.x+dx>=0&&at.x+dx<game.cols&&at.y+dy>=0&&at.y+dy<game.rows)));}
    const move=next(state);await page.keyboard.press(move[3]);let moved=await read();assert.equal(moved.path.length,state.path.length+1);
    const wall=next(moved,true);if(wall){await page.keyboard.press(wall[3]);assert.deepEqual((await read()).path,moved.path);}
    await page.setViewportSize({width:844,height:390});await settle(page);assert.deepEqual((await read()).path,moved.path);
    const direction=next(moved),at=moved.path.at(-1),target={x:at.x+direction[1],y:at.y+direction[2]};
    const points=await page.evaluate(({at,target,cols,rows})=>{
      const svg=document.getElementById('mazeSvg'),box=svg.viewBox.baseVal;
      const screen=cell=>{const p=svg.createSVGPoint();p.x=box.x+(cell.x+.5)*box.width/cols;p.y=box.y+(cell.y+.5)*box.height/rows;const q=p.matrixTransform(svg.getScreenCTM());return{x:q.x,y:q.y};};
      return{start:screen(at),end:screen(target)};
    },{at,target,cols:moved.cols,rows:moved.rows});
    await dragPointer(page,points.start,points.end,10);
    assert.deepEqual((await read()).path.at(-1),target);check('Tunnels valid moves, walls, and pointer alignment',true);await ctx.close();
  });
  await inlineInteractions();
  await dialogs();
  await test('utility page input and sound controls',async()=>{
    const ctx=await context();const page=await ctx.newPage();await open(page,'MultiplyMagic3.html');
    const input=page.locator('#board input').first();await input.fill('2');
    await page.setViewportSize({width:844,height:390});await settle(page);assert.equal(await input.inputValue(),'2');
    await open(page,'sound-lab.html');await page.locator('button.tone').first().click();
    await page.setViewportSize({width:844,height:390});await page.locator('button.tone').last().click();
    check('utility page input and sound controls',true);await ctx.close();
  });
  await test('story reveal remains usable in short viewports',async()=>{
    const ctx=await context();const page=await ctx.newPage();await open(page,'treasure-hunt-landscape-prototype/index.html');
    await page.locator('#newRun').click();
    await page.locator('#storyReveal:visible').waitFor();
    for(const [width,height]of [[568,320],[844,390],[390,300]]){
      await page.setViewportSize({width,height});await settle(page);
      const b=await page.locator('#storyContinue').boundingBox();
      check(`story Continue reachable ${width}x${height}`,b&&b.y>=0&&b.y+b.height<=height+1,b);
      await page.screenshot({path:path.join(reportDir,`story-reveal-${width}x${height}.png`)});
    }
    await page.locator('#storyContinue').click();check('story Continue uses original handler',true);await ctx.close();
  });
  await edges();
}
async function edges(){
  const ctx=await context(),page=await ctx.newPage();
  for(const [width,height]of [[320,568],[568,320]])for(let index=0;index<6;index++)await test(`number board reachable ${index} ${width}x${height}`,async()=>{
    await page.setViewportSize({width,height});await choose(page,'Add Magic',index);
    const inputs=page.locator('#board input');
    const clipped=await inputs.evaluateAll(es=>{const box=document.getElementById('boardWrap').getBoundingClientRect();return es.filter(e=>{const r=e.getBoundingClientRect();return r.top<box.top-1||r.bottom>box.bottom+1||r.left<box.left-1||r.right>box.right+1;}).length;});
    check(`board ${index} reserves every cell ${width}x${height}`,clipped===0,{clipped});
    for(const target of [inputs.first(),inputs.last()]){
      await target.tap();
      const info=await target.evaluate(e=>{const r=e.getBoundingClientRect(),box=document.getElementById('boardWrap').getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{inside:r.top>=box.top-1&&r.bottom<=box.bottom+1,hit:hit===e};});
      check(`board ${index} input visible ${width}x${height}`,info.inside&&info.hit,info);
    }
  });
  for(const [width,height]of [[568,320],[844,390],[390,300]])await test(`Gate choices usable ${width}x${height}`,async()=>{
    await page.setViewportSize({width,height});await choose(page,'Gate Logic');
    const read=selector=>page.locator(selector).evaluateAll(es=>es.map(e=>({text:e.textContent.trim(),height:e.getBoundingClientRect().height,overflow:e.scrollHeight>e.clientHeight+2})));
    let rows=await read('#gatePicker .rowBtn');check('Gate picker target and content '+width+'x'+height,rows.every(r=>r.height>=44&&!r.overflow),rows);
    await page.locator('#gatePicker [data-gate="and"]').tap();const levels=page.locator('#gatePicker .rowBtn:visible:not(.gateLevelBack)');if(await levels.count())await levels.first().tap();
    rows=await read('#gateRoom .gateChoiceBtn');check('Gate answer target and content '+width+'x'+height,rows.length>0&&rows.every(r=>r.height>=44&&!r.overflow),rows);
    await page.locator('#gateRoom .gateChoiceBtn').last().tap();
    await page.screenshot({path:path.join(reportDir,`gate-readable-${width}x${height}.png`)});
  });
  for(const [name,route]of routes.filter(([n])=>['app','criss-cross','tic-tac-toe','tunnels'].includes(n)))await test(name+' observers become idle',async()=>{
    await open(page,route,name==='app');if(name==='app')await choose(page,'Add Magic');
    for(const [width,height]of [[844,390],[390,844]]){await page.setViewportSize({width,height});await settle(page);}
    await page.waitForTimeout(350);const before=await page.evaluate(()=>({...window.__mmObserverCalls}));await page.waitForTimeout(1100);
    const after=await page.evaluate(()=>({...window.__mmObserverCalls}));assert.deepEqual(after,before,'Layout observers must stop firing while idle');
    assert.deepEqual(await page.evaluate(()=>window.__mmRuntimeErrors),[],'No hidden runtime or observer-loop errors');
    check(name+' observers become idle',true,after);
  });
  await ctx.close();
}
async function choose(page,name,index=0){
  await open(page,'beta.html',true);await page.locator(`.categoryCard[data-category="${name}"]`).click();
  const choices=page.locator('#categoryOptions .bookChoice:visible');if(await choices.count())await choices.nth(index).click();
  await settle(page);
}
async function inlineInteractions(){
  const cases=[
    {name:'Multiply Magic',act:async p=>{await p.locator('#board input:not([readonly])').first().click();await p.locator('.kp[data-k="2"]').click();},read:p=>p.locator('#board input').evaluateAll(x=>x.map(n=>n.value))},
    {name:'Birthday Magic',act:async p=>{await p.locator('#board input:not([readonly])').first().click();await p.locator('.kp[data-k="2"]').click();},read:p=>p.locator('#board input').evaluateAll(x=>x.map(n=>n.value))},
    {name:'Gate Logic',act:async p=>{await p.locator('#gatePicker .rowBtn[data-gate="and"]').click();const levels=p.locator('#gatePicker .rowBtn:visible:not(.gateLevelBack)');if(await levels.count())await levels.first().click();await p.locator('#gateRoom .gateChoiceBtn').first().click();},read:p=>p.locator('#gateRoom').innerText()},
    {name:'Binary Magic',act:async p=>{await p.locator('#mrGo').click();await p.locator('.mrNo').click();await p.waitForFunction(()=>document.querySelector('#mrCard .mrHead b')?.textContent==='Card 2');},read:p=>p.locator('#binaryPanel').innerText()},
    {name:'Slide Magic',act:async p=>{await p.locator('.slideTile.canMove').first().click();if(await p.locator('.slideTarget').count())await p.locator('.slideTarget').first().click();},read:p=>p.locator('#slideBoard').innerHTML()},
    {name:'Sudoku',act:async p=>{await p.locator('.sudCell:not(.given)').first().click();await p.locator('[data-sudkey="1"]').click();},read:p=>p.locator('.sudCell').evaluateAll(x=>x.map(n=>n.textContent))},
    {name:'Pallanguzhi',act:p=>p.locator('#palChoose').click(),read:p=>p.locator('#palChoose').textContent()},
    {name:'Pallanguzhi',index:1,act:p=>p.locator('#pal4Choose').click(),read:p=>p.locator('#pal4Choose').textContent()},
    {name:'Thayam',act:p=>p.locator('#thayamChoose').click(),read:p=>p.locator('#thayamChoose').textContent()}
  ];
  for(const entry of cases)await test(entry.name+' interaction and rotation '+(entry.index||0),async()=>{
    const ctx=await context();const page=await ctx.newPage();await choose(page,entry.name,entry.index||0);
    const initial=await entry.read(page);await entry.act(page);const changed=await entry.read(page);
    assert.notDeepEqual(changed,initial,'A real game interaction must change the state');
    await page.setViewportSize({width:844,height:390});await settle(page);
    const normalize=x=>typeof x==='string'?x.replace(/\s+/g,' ').trim():x;
    assert.deepEqual(normalize(await entry.read(page)),normalize(changed),'Rotation must preserve the interaction');
    await page.screenshot({path:path.join(reportDir,`play-${entry.name.replace(/\W/g,'-')}-${entry.index||0}-landscape.png`)});
    check(entry.name+' interaction and rotation '+(entry.index||0),true);await ctx.close();
  });
}
async function dialogs(){
  const cases=[
    {route:'beta.html',app:true,buttons:[['#barLearn','.sheet.on .shHead button'],['#barMore','.sheet.on .shHead button']]},
    {route:'criss-cross.html',buttons:[['#logicBtn','#logicClose'],['#ccmSoundBtn','#ccmSoundClose']]},
    {route:'tic-tac-toe.html',buttons:[['#logicBtn','#logicDialog .close'],['#soundBtn','#soundDialog .close']]},
    {route:'tunnels-of-meta.html',buttons:[['#logicBtn','#logicClose'],['#soundBtn','#soundClose']]},
    ...['cave-treasure-hunt.html','treasure-hunt-landscape-prototype/index.html'].map(route=>({route,buttons:[['#logicButton','#closeLogic'],['#soundButton','#soundClose']]}))
  ];
  for(const entry of cases)await test(entry.route+' dialogs',async()=>{
    const ctx=await context();const page=await ctx.newPage();
    if(entry.app)await choose(page,'Add Magic');else await open(page,entry.route);
    for(const [width,height] of [[390,844],[844,390],[568,320],[390,300]])for(const [trigger,close]of entry.buttons){
      await page.setViewportSize({width,height});await page.locator(trigger).click();await settle(page);
      const box=await page.locator(close).boundingBox();
      check(`${entry.route} ${trigger} close ${width}x${height}`,box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,box);
      check(`${entry.route} ${trigger} focus is not a text input`,await page.evaluate(()=>!document.activeElement.matches('input,textarea,[contenteditable="true"]')));
      await page.locator(close).click();
    }
    await ctx.close();
  });
}
async function open(page, route, play = false) {
  await page.goto(origin + prefix + route, {waitUntil:'load', timeout:20000});
  if (play) {
    if (await page.locator('.splashPlay').isVisible()) await page.locator('.splashPlay').click();
    await page.locator('.splash').waitFor({state:'hidden',timeout:4000});
    if (await page.locator('#tab-scHome').isVisible()) await page.locator('#tab-scHome').click();
    await page.locator('.categoryCard').first().waitFor();
  }
}
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(160);
}
async function installedOrientation() {
  // Exercise the browser API boundary; this does not emulate physical-device rotation.
  for (const scenario of ['browser','installed','gesture-required','rejected','unsupported-ios']) await test('installed orientation '+scenario,async()=>{
    const ctx=await context(),page=await ctx.newPage(),errors=[];
    try {
      page.on('pageerror',e=>errors.push(e.message));
      await ctx.addInitScript(scenario=>{
        window.__orientationRequests=[];window.__orientationAccepted=false;window.__trustedTap=false;
        document.addEventListener('pointerup',e=>{if(e.isTrusted)window.__trustedTap=true;},true);
        const nativeMatch=window.matchMedia.bind(window);
        window.matchMedia=query=>{
          const result=nativeMatch(query);
          if(query==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:scenario!=='browser'&&scenario!=='unsupported-ios'});
          return result;
        };
        Object.defineProperty(navigator,'standalone',{value:scenario==='unsupported-ios',configurable:true});
        Object.defineProperty(screen.orientation,'lock',{configurable:true,value:scenario==='unsupported-ios'?undefined:function(value){
          window.__orientationRequests.push(value);
          if(scenario==='rejected')return Promise.reject(new DOMException('Unavailable','NotSupportedError'));
          if(scenario==='gesture-required'&&!window.__trustedTap)return Promise.reject(new DOMException('Tap required','SecurityError'));
          window.__orientationAccepted=true;return Promise.resolve();
        }});
      },scenario);
      await choose(page,'Add Magic');
      await page.locator('#board input:not([readonly]):not([disabled])').first().click();
      await page.locator('.kp[data-k="2"]').click();
      const before=await page.locator('#board input').first().inputValue();
      for(const viewport of [{width:844,height:390},{width:390,height:844}]){
        await page.setViewportSize(viewport);await settle(page);
        assert.equal(await page.locator('#board input').first().inputValue(),before);
      }
      const boundary=await page.evaluate(()=>({requests:window.__orientationRequests,accepted:window.__orientationAccepted}));
      if(['browser','unsupported-ios'].includes(scenario))assert.deepEqual(boundary.requests,[]);
      else {
        assert(boundary.requests.length>0&&boundary.requests.every(value=>value==='any'),'Installed app must request all allowed orientations from its native container');
        assert.equal(boundary.accepted,scenario!=='rejected');
        assert(boundary.requests.length<=2,'Orientation requests must not repeat on every tap or resize');
      }
      assert.equal(before,'2');assert.deepEqual(errors,[]);
      check('installed orientation '+scenario,true,boundary);
    } finally {await ctx.close();}
  });
}
async function keypad() {
  const read = page => page.evaluate(() => Object.fromEntries(
    ['#boardWrap','#board','#keypad','#playRow'].map(selector => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return [selector, {x:box.x,y:box.y,width:box.width,height:box.height}];
    })));
  for (const route of ['beta.html','index.html']) {
    const ctx=await context(), page=await ctx.newPage();
    try {
      for (const category of ['Add Magic','Multiply Magic','Birthday Magic']) {
        await open(page,route,true);
        await page.locator(`.categoryCard[data-category="${category}"]`).click();
        const choices=page.locator('#categoryOptions .bookChoice:visible');
        if (await choices.count()) await choices.first().click();
        await settle(page);
        for (const [width,height] of [[568,320],[800,322],[844,390],[1024,768],[1280,720]]) {
          await page.setViewportSize({width,height}); await settle(page);
          const boxes=await read(page), board=boxes['#board'], keys=boxes['#keypad'], controls=boxes['#playRow'];
          const offset=Math.abs(keys.y+keys.height/2-board.y-board.height/2);
          check(`${route} ${category} keypad centered ${width}x${height}`,offset<=2&&keys.x>=board.x+board.width,{offset,boxes});
          check(`${route} ${category} controls do not overlap keypad ${width}x${height}`,controls.y>=keys.y+keys.height,{boxes});
        }
      }
    } finally { await ctx.close(); }
  }
  if (baselineRoot) for (const [width,height] of [[390,844],[768,1024],[1024,1366]]) {
    let before;
    for (const [label,source] of [['before',baselineRoot],['after',root]]) {
      servingRoot=source;
      const ctx=await context({width,height}),page=await ctx.newPage();
      try {
        await choose(page,'Add Magic');
        const boxes=await read(page);
        const screenshot=await page.screenshot({path:path.join(reportDir,`portrait-${label}-${width}x${height}.png`),animations:'disabled',caret:'hide',mask:[page.locator('#timerBox')]});
        if (label==='before') before={boxes,screenshot};
        else {
          check(`portrait geometry unchanged ${width}x${height}`,JSON.stringify(boxes)===JSON.stringify(before.boxes),{before:before.boxes,after:boxes});
          check(`portrait appearance unchanged ${width}x${height}`,screenshot.equals(before.screenshot));
        }
      } finally { await ctx.close(); }
    }
  }
  servingRoot=root;
}
async function orientation() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mathmatrix/beta-app/beta-manifest.json'), 'utf8'));
  check('installed app defers orientation to device settings', [undefined,'any'].includes(manifest.orientation), manifest.orientation);
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
        viewport:visualViewport.width, overflow:document.documentElement.scrollWidth > innerWidth + 2,
        blockerVisible:!!document.querySelector('#portraitLock') && getComputedStyle(document.querySelector('#portraitLock')).display !== 'none'}));
      check(`${name} upright ${width}x${height}`, info.transform === 'none' && info.bodyTransform === 'none'
        && !/lockRotate/.test(info.classes) && !info.blockerVisible && Math.abs(info.width-info.viewport)<2, info);
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
  await test('Add Magic Watch continues after rotating',async()=>{
    const ctx=await context(); const page=await ctx.newPage();
    await open(page,'beta.html',true);
    await page.locator('.categoryCard[data-category="Add Magic"]').click();
    await page.locator('.bookChoice[data-size="3x3"]').click();
    await page.locator('#barWatch').click();
    const filled=()=>page.locator('#board input').evaluateAll(nodes=>nodes.filter(node=>node.value).length);
    const before=await filled(); await page.setViewportSize({width:844,height:390});
    await page.waitForFunction(count=>Array.from(document.querySelectorAll('#board input')).filter(node=>node.value).length>count,before,{timeout:3500});
    check('Add Magic Watch continues after rotating',true); await ctx.close();
  });
  for(const route of ['cave-treasure-hunt.html','treasure-hunt-landscape-prototype/index.html']) {
    await test(route+' preserves maze state and Watch on rotation',async()=>{
      const ctx=await context(); const page=await ctx.newPage(); await open(page,route);
      await page.locator('#newRun').click(); await settle(page);
      for(let frame=0;frame<10 && await page.locator('#storyReveal:visible').count();frame++) {
        await page.locator('#storyContinue').click();await page.waitForTimeout(30);
      }
      const read=()=>page.evaluate(()=>({maze:document.getElementById('maze').innerHTML,
        progress:document.getElementById('progress').textContent}));
      const before=await read(); await page.setViewportSize({width:844,height:390}); await settle(page);
      assert.deepEqual(await read(),before,'The started maze and stage must survive rotation');
      await page.locator('#watchButton').click();
      assert.equal(await page.locator('#watchButton').getAttribute('aria-pressed'),'true');
      await page.setViewportSize({width:390,height:844}); await settle(page);
      assert.equal(await page.locator('#watchButton').getAttribute('aria-pressed'),'true','Rotation must not stop maze Watch');
      // Story frames intentionally pause playback; advance them using their real control.
      for(let frame=0;frame<10 && await page.locator('#storyReveal:visible').count();frame++) {
        await page.locator('#storyContinue').click(); await page.waitForTimeout(30);
      }
      const watching=await page.locator('#maze').innerHTML();
      await page.waitForFunction(html=>document.getElementById('maze').innerHTML!==html,watching,{timeout:8000});
      check(route+' preserves maze state and Watch on rotation',true); await ctx.close();
    });
  }
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
  const books=await page.evaluate(()=>Array.from(document.querySelectorAll('.categoryOptions .modeGroup')).map(group=>({
    name:group.querySelector('.modeHead b').textContent.trim(),
    choices:Array.from(group.querySelectorAll('.bookChoice')).map(button=>({...button.dataset}))
  })));
  const standalone={crisscross:'criss-cross.html',tunnels:'tunnels-of-meta.html',
    'cave-treasure':'cave-treasure-hunt.html','sana-treasure-hunt':'treasure-hunt-landscape-prototype/index.html','tic-tac-toe':'tic-tac-toe.html'};
  for(const book of books) for(let index=0;index<book.choices.length;index++) await test(`${book.name} choice ${index+1}`,async()=>{
    await open(page,'beta.html',true); await page.locator(`.categoryCard[data-category="${book.name}"]`).click();
    if(book.choices.length>1) await page.locator('#categoryOptions .bookChoice:visible').nth(index).click();
    const choice=book.choices[index], target=standalone[choice.size];
    if(target) {
      await page.waitForURL(url=>url.pathname.endsWith('/'+target));
      check(`${book.name} choice ${index+1} original route`,true);
      return;
    }
    await page.locator('[data-screen="scPlay"].on').waitFor(); await settle(page);
    let selector='#boardWrap';
    if(choice.slideLevel) selector='#slidePanel';
    else if(choice.sudLevel) selector='#sudokuPanel';
    else if(choice.palLevel) selector='#palPanel';
    else if(choice.pal4Level) selector='#pal4Panel';
    else if(choice.thayamLevel) selector='#thayamPanel';
    else if(book.name==='Gate Logic') selector='#gatePanel';
    else if(/^binary/.test(choice.size||'')) selector='#binaryPanel';
    for(const viewport of [{width:844,height:390},{width:390,height:844}]) {
      await page.setViewportSize(viewport); await settle(page);
      const info=await page.locator(selector).evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,display:getComputedStyle(el).display}));
      check(`${book.name} ${index+1} visible ${viewport.width}x${viewport.height}`,info.width>100 && info.height>60 && info.display!=='none',info);
      if(/^\d+x\d+$/.test(choice.size||'')) {
        const n=Number(choice.size.split('x')[0]);
        check(`${choice.size} keeps all inputs`,await page.locator('#board input').count()===n*n);
      }
    }
    if(index===0) await page.screenshot({path:path.join(reportDir,'game-'+book.name.replace(/\W+/g,'-')+'.png')});
  });
  await open(page,'beta.html',true);
  await page.locator('.categoryCard[data-category="Add Magic"]').click();
  await page.locator('.bookChoice[data-size="3x3"]').click();
  const labels=await page.locator('.appBar .barBtn:visible').evaluateAll(buttons=>buttons.map(button=>({
    text:button.textContent.trim(),color:getComputedStyle(button.querySelector('span')).color,bg:getComputedStyle(button).backgroundColor
  })));
  const luminance=color=>{
    const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  for(const label of labels){const a=luminance(label.color),b=luminance(label.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);check(label.text+' readable label',ratio>=4.5,{...label,ratio});}
  check('shell no uncaught errors',!errors.length,errors);
  await test('enlarged category text remains scrollable',async()=>{
    await open(page,'beta.html',true);await page.setViewportSize({width:320,height:568});
    await page.addStyleTag({content:'.categoryName{font-size:200% !important}'});await settle(page);
    for(const name of ['Add Magic','Thayam']){
      const card=page.locator(`.categoryCard[data-category="${name}"]`);await card.scrollIntoViewIfNeeded();
      const info=await card.evaluate(e=>{const b=e.getBoundingClientRect(),t=e.querySelector('.categoryName').getBoundingClientRect();return{clipped:t.top<b.top||t.bottom>b.bottom||t.right>b.right};});
      check(name+' enlarged text is readable',!info.clipped,info);
      await card.click();await page.locator('#navBack').click();
    }
  });
  await test('viewport observers settle after repeated resize',async()=>{
    await open(page,'beta.html',true);
    await page.evaluate(()=>{window.__mmResizeEvents=0;window.addEventListener('mathmatrixviewportchange',()=>window.__mmResizeEvents++);});
    for(const [width,height]of [[844,390],[390,844],[568,320],[390,844]]){await page.setViewportSize({width,height});await settle(page);}
    const count=await page.evaluate(()=>window.__mmResizeEvents);await page.waitForTimeout(750);
    assert.equal(await page.evaluate(()=>window.__mmResizeEvents),count);check('viewport observers settle after repeated resize',true);
  });
  await ctx.close();
  await zoom();
}
async function zoom(){
  const ctx=await context(),page=await ctx.newPage();
  for(const [name,route]of routes.filter(([n])=>n!=='index'))await test(name+' browser zoom',async()=>{
    await open(page,route,name==='app');
    const policy=await page.evaluate(()=>{const event=new Event('gesturestart',{cancelable:true});document.dispatchEvent(event);return{meta:document.querySelector('meta[name="viewport"]').content,cancelled:event.defaultPrevented};});
    check(name+' prevents page zoom',/user-scalable\s*=\s*no/.test(policy.meta)&&policy.cancelled,policy);
  });
  await ctx.close();
}
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  const launcher = engine === 'webkit' ? webkit : chromium;
  browser = await launcher.launch(engine === 'chromium' ? {channel:'chrome',headless:true} : {headless:true});
  if (section === 'installed-orientation' || section === 'all') await installedOrientation();
  if (section === 'keypad' || section === 'all') await keypad();
  if (section === 'orientation' || section === 'all') await orientation();
  if (section === 'shell' || section === 'all') await shell();
  if (section === 'games' || section === 'all') await games();
  if (section === 'offline' || section === 'all') await release();
  if (section === 'zoom') await zoom();
  if (section === 'edges') await edges();
  if (section === 'colors' || (section === 'all' && baselineRoot)) await colors();
  if (section === 'diagnostic') await diagnostic();
  if (section === 'errors'){
    const ctx=await context(),page=await ctx.newPage();await choose(page,'Add Magic');
    await page.setViewportSize({width:568,height:320});await settle(page);
    check('number layout no observer-loop errors',(await page.evaluate(()=>window.__mmRuntimeErrors)).length===0,await page.evaluate(()=>window.__mmRuntimeErrors));await ctx.close();
  }
  if (!['installed-orientation','keypad','orientation','shell','games','offline','zoom','edges','colors','diagnostic','errors','all'].includes(section)) throw new Error('Unknown validation section: ' + section);
}
async function diagnostic(){
  await test('isolated browser rotation diagnostic',async()=>{
    assert(fs.existsSync(path.join(root,'mathmatrix-beta-rotation-check.html')),'Missing independent diagnostic page');
    const ctx=await context(),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/mathmatrix-beta-rotation-check.html');
    assert.equal(await page.locator('#viewportShape').textContent(),'Portrait');
    await page.setViewportSize({width:844,height:390});await settle(page);
    assert.equal(await page.locator('#viewportShape').textContent(),'Landscape');
    assert.equal(await page.locator('#displayMode').textContent(),'Browser');
    const info=JSON.parse(await page.locator('#details').textContent());
    assert.equal(info.viewport.width,844);assert(info.viewportShapeSwitchObserved);assert.equal(await page.locator('link[rel="manifest"]').count(),0);assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(reportDir,'rotation-diagnostic.png')});
    check('isolated browser rotation diagnostic',true);await ctx.close();
  });
}
async function colors(){
  assert(baselineRoot,'Original V218 baseline required');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'mathmatrix/beta-app/beta-manifest.json'),'utf8'));
  check('installation does not fix portrait or landscape',[undefined,'any'].includes(manifest.orientation),manifest.orientation);
  const ctx=await context(),page=await ctx.newPage();
  const read=selectors=>page.locator(selectors).evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return{selector:e.id||e.className,color:s.color,backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage};}));
  async function capture(label){
    const paints={};await open(page,'beta.html');await page.locator('.splash').waitFor({state:'visible'});
    paints.welcome=await read('.splash,.splashName,.splashTag,.splashCaution,.splashPlay');
    await page.locator('.splashPlay').click();await page.locator('.splash').waitFor({state:'hidden'});await page.locator('#tab-scHome').click();
    paints.library=await read('.appShell,.appBar,.appBarTitle,.sanaBub,.tabBar,.categoryCard');
    await page.screenshot({path:path.join(reportDir,label+'-library.png')});
    await page.locator('.categoryCard[data-category="Add Magic"]').click();
    paints.choices=await read('.categoryOptions .bookChoice:visible,.categoryOptions .bookChoice:visible .lvName');
    await page.locator('.bookChoice[data-size="3x3"]').click();await settle(page);
    paints.play=await read('.appShell,.appBar,.kp,#targetPill,#board input');
    await page.screenshot({path:path.join(reportDir,label+'-play.png')});
    for(const [name,route]of routes.filter(([n])=>!['app','index'].includes(n))){
      await open(page,route);paints[name]=await read('body,.bar,.ccmBar,body>header,#board .cell,.key,.pad,button.tone');
      paints[name+' browser theme']=[{color:await page.locator('meta[name="theme-color"]').count()?await page.locator('meta[name="theme-color"]').getAttribute('content'):'',backgroundColor:'',backgroundImage:''}];
    }
    return paints;
  }
  servingRoot=baselineRoot;const before=await capture('v218');servingRoot=root;const current=await capture('current');
  for(const name of Object.keys(before)){
    // Class names and dynamic labels can change; the original paint is the contract.
    const paint=rows=>rows.map(({color,backgroundColor,backgroundImage})=>({color,backgroundColor,backgroundImage}));
    check(name+' restores V218 colors',JSON.stringify(paint(before[name]))===JSON.stringify(paint(current[name])),{before:paint(before[name]),current:paint(current[name])});
  }
  await ctx.close();servingRoot=root;
}
async function release(){
  const dir=path.join(root,'mathmatrix/beta-app'),sw=fs.readFileSync(path.join(dir,'beta-sw.js'),'utf8');
  const cacheVersion=sw.match(/const CACHE_VERSION = '([^']+)'/)[1];
  const assets=Array.from(sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g),x=>x[1]);
  await test('Beta release metadata and precache',async()=>{
    const manifest=JSON.parse(fs.readFileSync(path.join(dir,'beta-manifest.json'),'utf8'));
    assert.equal(manifest.name,'MathMatrix Beta');assert.equal(manifest.short_name,'MathMatrix Beta');assert([undefined,'any'].includes(manifest.orientation));
    assert(cacheVersion.includes('v233'));assert(assets.includes('./responsive-ui.css'));
    for(const asset of assets)assert(fs.existsSync(path.join(dir,asset)),asset);
    assert(fs.readFileSync(path.join(dir,'beta.html')).equals(fs.readFileSync(path.join(dir,'index.html'))));
    assert(fs.readFileSync(path.join(dir,'beta.html'),'utf8').includes("BUILD_VER = 'Beta - V.223 Unified'"));
    check('Beta release metadata and precache',true,{cacheVersion,assets:assets.length});
  });
  await test('active route script syntax and original maze engines',async()=>{
    const ctx=await context(),page=await ctx.newPage();
    const originals={};
    for(const [name,route]of routes){
      await open(page,route);
      const scripts=await page.locator('script:not([src])').evaluateAll(es=>es.filter(e=>!e.type||/javascript|module/.test(e.type)).map(e=>e.textContent));
      for(const [i,script]of scripts.entries())new vm.Script(script,{filename:route+' inline '+i});
      const source=fs.readFileSync(path.join(dir,route.split('?')[0]),'utf8');
      assert(!/lockRotateCW|lockRotateCCW|id="portraitLock"/.test(source),route+' obsolete lock');
      if(['cave-maze','story-maze'].includes(name))originals[route]=scripts.reduce((a,b)=>a.length>b.length?a:b,'').replace(/\r\n/g,'\n');
    }
    for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(dir,file),'utf8'),{filename:file});
    if(baselineRoot){
      servingRoot=baselineRoot;
      for(const [route,engineSource]of Object.entries(originals)){
        await open(page,route);const original=await page.locator('script:not([src])').evaluateAll(es=>es.map(e=>e.textContent).reduce((a,b)=>a.length>b.length?a:b,''));
        assert.equal(engineSource,original.replace(/\r\n/g,'\n'),route+' original engine/map/story data');
      }
      servingRoot=root;
    }
    check('active route script syntax and original maze engines',true);await ctx.close();
  });
  servingRoot=root;
  if(!baselineRoot){check('baseline required for upgrade and performance',false,'Pass --baseline-root');return;}
  await test('existing installation upgrades and works offline',async()=>{
    servingRoot=baselineRoot;
    const ctx=await context({width:390,height:844},'allow'),page=await ctx.newPage();await choose(page,'Add Magic');
    await page.locator('#board input').first().click();await page.locator('.kp[data-k="1"]').click();
    const save=await page.evaluate(()=>localStorage.getItem('mm.save.magic.3x3'));assert(save,'Real input must save the board');
    await page.evaluate(async()=>{localStorage.setItem('mm.preservation-check','kept');await caches.open('mathmatrix-v-preservation-check');await navigator.serviceWorker.ready;});
    await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?.active&&r.active===navigator.serviceWorker.controller&&!r.waiting&&!r.installing;});
    servingRoot=root;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
    await page.waitForFunction(async expected=>{const r=await navigator.serviceWorker.getRegistration();return r?.active&&r.active===navigator.serviceWorker.controller&&!r.waiting&&!r.installing&&(await caches.keys()).includes(expected);},cacheVersion,{timeout:30000});
    await choose(page,'Add Magic');assert.equal(await page.locator('#board input').first().inputValue(),'1');
    const data=await page.evaluate(async()=>({save:localStorage.getItem('mm.save.magic.3x3'),marker:localStorage.getItem('mm.preservation-check'),keys:await caches.keys()}));
    assert.equal(data.save,save);assert.equal(data.marker,'kept');assert(data.keys.includes('mathmatrix-v-preservation-check'));
    assert(!data.keys.some(key=>key.startsWith('mathmatrix-beta-')&&key!==cacheVersion));
    await ctx.setOffline(true);await page.reload();await page.locator('.categoryCard').first().waitFor();
    for(const [name,route]of routes.filter(([name])=>name!=='index')){
      await open(page,route,name==='app');const marker=await page.locator('html').getAttribute('data-mm-page');
      assert.equal(marker,name==='app'?'app':name);
      assert(await page.evaluate(()=>Array.from(document.styleSheets).some(sheet=>sheet.href?.endsWith('/responsive-ui.css'))),'Offline responsive stylesheet must load');
      check(name+' offline launch and presentation',true);
    }
    await open(page,'tic-tac-toe.html?size=5');assert.equal(await page.locator('#board .cell').count(),25);
    check('existing installation upgrades and works offline',true,data);await ctx.close();
  });
  servingRoot=root;
  await test('same-machine baseline performance comparison',async()=>{
    const timings={baseline:[],updated:[]};
    for(let trial=0;trial<3;trial++)for(const label of ['baseline','updated']){
      servingRoot=label==='baseline'?baselineRoot:root;
      const ctx=await context(),page=await ctx.newPage();const start=Date.now();await choose(page,'Add Magic');
      const readyMs=Date.now()-start;await page.locator('#board input').first().click();
      await page.evaluate(()=>{document.querySelector('.kp[data-k="1"]').addEventListener('click',()=>{const t=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.__inputPaintMs=performance.now()-t));},{once:true,capture:true});});
      await page.locator('.kp[data-k="1"]').click();await page.waitForFunction(()=>window.__inputPaintMs!==undefined);
      timings[label].push({readyMs,inputPaintMs:await page.evaluate(()=>window.__inputPaintMs)});await ctx.close();
    }
    const median=(rows,key)=>rows.map(x=>x[key]).sort((a,b)=>a-b)[1];
    metrics.push({performance:timings});
    check('no repeatable startup regression',median(timings.updated,'readyMs')<median(timings.baseline,'readyMs')*1.8+250,timings);
    check('no repeatable input paint regression',median(timings.updated,'inputPaintMs')<median(timings.baseline,'inputPaintMs')*1.8+80,timings);
  });
  servingRoot=root;
}
main().catch(error => {check('validation runner', false, error.stack);}).finally(async () => {
  if (browser) await browser.close();
  server.close();
  const failed = results.filter(item => !item.pass);
  fs.writeFileSync(path.join(reportDir, 'checks.json'), JSON.stringify({engine,section,root,results,metrics},null,2));
  console.log(`${results.length-failed.length}/${results.length} checks passed (${engine}, ${section})`);
  process.exitCode = failed.length ? 1 : 0;
});
