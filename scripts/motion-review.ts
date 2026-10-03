import { mkdir,writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { resolve } from 'node:path';

const directory=process.argv[2]||'qa/reconstruction',idle=process.argv.includes('--idle');await mkdir(directory,{recursive:true});
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.data/playwright');
const {chromium,expect}=await import('@playwright/test');
const browser=await chromium.launch({channel:'msedge'});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'no-preference',recordVideo:{dir:'.data/motion-video',size:{width:1440,height:1000}}});
const page=await context.newPage(),errors:string[]=[],report:any={};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript({content:`
  window.__motionAudit=[];let lastMotionSample=0;
  function sampleMotion(now){
    if(now-lastMotionSample>40){lastMotionSample=now;const hero=document.querySelector('.hero h1'),rows=[...document.querySelectorAll('.activity-panel .activity-row')],table=document.querySelector('.activity-panel');
      window.__motionAudit.push({time:now,headline:hero?{opacity:getComputedStyle(hero).opacity,transform:getComputedStyle(hero).transform}:null,numbers:[...document.querySelectorAll('.hero-metrics strong')].map(e=>e.textContent),tableTop:table?.getBoundingClientRect().top,rows:rows.map(e=>({text:e.textContent,opacity:getComputedStyle(e).opacity,y:e.getBoundingClientRect().top})),animating:document.querySelectorAll('[data-animating=true]').length});if(window.__motionAudit.length>1000)window.__motionAudit.shift();
    }requestAnimationFrame(sampleMotion);
  }requestAnimationFrame(sampleMotion);
`});
// Delay delivery of actual local API responses to inspect progressive loading.
await page.route('**/api/agents',async route=>{await new Promise(r=>setTimeout(r,1800));await route.continue();});
await page.goto('http://localhost:3000',{waitUntil:'domcontentloaded'});
await expect(page.locator('.skeleton-card').first()).toBeVisible();await page.waitForTimeout(450);
await page.screenshot({caret:'initial',path:directory+'/motion-loading.png'});
await page.locator('.globe.is-ready').waitFor();await page.locator('.featured .agent-card h3').first().waitFor();await page.waitForTimeout(1000);await page.unrouteAll({behavior:'wait'});
report.loadingSkeleton=true;report.initialSamples=await page.evaluate(()=>(window as any).__motionAudit);
const globeFrames:Buffer[]=[];report.globe=[];
for(let i=0;i<6;i++){
  await page.waitForTimeout(1500);
  report.globe.push(await page.evaluate(()=>({globe:{...document.querySelector<HTMLElement>('.globe-viewport')!.dataset},label:getComputedStyle(document.querySelector('.label-0')!).transform})));
  globeFrames.push(await page.screenshot({caret:'initial',clip:{x:695,y:60,width:710,height:465},path:directory+`/motion-globe-${i}.png`}));
}
const images=await Promise.all(globeFrames.map(f=>sharp(f).resize(568,372).toBuffer()));
await sharp({create:{width:1704,height:744,channels:4,background:'#060809'}}).composite(images.map((input,i)=>({input,left:(i%3)*568,top:Math.floor(i/3)*372}))).png().toFile(directory+'/motion-globe-sequence.png');
expect(Number(report.globe.at(-1).globe.rotation)).toBeGreaterThan(Number(report.globe[0].globe.rotation));
expect(new Set(report.globe.map((g:any)=>g.label)).size).toBeGreaterThan(1);
expect(report.globe.some((g:any)=>Number(g.globe.pulses)>0)).toBe(true);
const button=page.locator('.hero-actions .primary');await button.hover();await page.waitForTimeout(300);
report.buttonHover=await button.evaluate(e=>({transform:getComputedStyle(e).transform,shadow:getComputedStyle(e).boxShadow}));await page.screenshot({caret:'initial',path:directory+'/motion-button-hover.png'});
expect(report.buttonHover.transform).toContain('-1');await button.focus();report.keyboardOutline=await button.evaluate(e=>getComputedStyle(e).outlineStyle);
const card=page.locator('.featured .agent-card').first();await card.hover();await page.waitForTimeout(350);report.cardHover=await card.evaluate(e=>({transform:getComputedStyle(e).transform,border:getComputedStyle(e).borderColor}));expect(report.cardHover.transform).toContain('-3');await page.screenshot({caret:'initial',path:directory+'/motion-card-hover.png'});
await page.evaluate(()=>window.scrollTo({top:document.querySelector('.bottom-grid')!.getBoundingClientRect().top+scrollY-280,behavior:'instant'}));
await page.waitForTimeout(110);report.chartStart=await page.locator('.chart-line').evaluateAll(es=>es.map(e=>e.getAttribute('stroke-dasharray')));await page.screenshot({caret:'initial',path:directory+'/motion-chart-drawing.png'});
await page.waitForTimeout(1300);report.chartEnd=await page.locator('.chart-line').evaluateAll(es=>es.map(e=>e.getAttribute('stroke-dasharray')));await page.screenshot({caret:'initial',path:directory+'/motion-chart-complete.png'});
expect(report.chartStart).not.toEqual(report.chartEnd);
await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
await page.getByRole('button',{name:'Connect Wallet',exact:true}).click();await page.getByRole('button',{name:'Use a development wallet'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
const before=await page.locator('.hero-metrics strong').allTextContents();
await page.evaluate(()=>{(window as any).__motionAudit.length=0;});
report.serviceRequest=await page.evaluate(async()=>{const services=await(await fetch('/api/services')).json(),service=services.find((s:any)=>s.agent_name==='SEARCH');const response=await fetch(`/api/services/${service.id}/request`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({input:{topic:'Review official Solana documentation for the frontend motion verification.'}})});const receipt=await response.json();return {status:response.status,jobId:receipt.jobId};});
expect(report.serviceRequest.status).toBe(200);
if(idle){
  // A genuine service job is queued above. No input, navigation, or synthetic
  // data is sent during this 30-second observation of the existing worker/SSE.
  const started=Date.now();report.idle=[];
  for(let i=0;i<=6;i++){
    await page.waitForTimeout(Math.max(0,started+i*5000-Date.now()));
    report.idle.push(await page.evaluate(()=>({time:performance.now(),globe:{...document.querySelector<HTMLElement>('.globe-viewport')!.dataset},labels:[...document.querySelectorAll('.globe-label')].map(e=>getComputedStyle(e).transform),statusOpacity:getComputedStyle(document.querySelector('.online .live-dot')!).opacity,numbers:[...document.querySelectorAll('.hero-metrics strong')].map(e=>e.textContent),event:document.querySelector('.activity-row')?.textContent,sectionTop:document.querySelector('.activity-panel')!.getBoundingClientRect().top})));
    await page.screenshot({caret:'initial',path:directory+`/idle-${i*5}s.png`});
  }
  report.idleDurationMs=Date.now()-started;
  const idleImages=await Promise.all([0,10,20,30].map(seconds=>sharp(directory+`/idle-${seconds}s.png`).extract({left:695,top:60,width:710,height:465}).resize(710,465).toBuffer()));
  await sharp({create:{width:1420,height:930,channels:4,background:'#060809'}}).composite(idleImages.map((input,i)=>({input,left:(i%2)*710,top:Math.floor(i/2)*465}))).png().toFile(directory+'/idle-globe-sequence.png');
}
await expect(page.locator('.hero-metrics strong').nth(2)).not.toHaveText(before[2],{timeout:25000});await page.waitForTimeout(1300);
report.liveBefore=before;report.liveAfter=await page.locator('.hero-metrics strong').allTextContents();report.liveSamples=await page.evaluate(()=>(window as any).__motionAudit);
report.liveCounterAnimation=report.liveSamples.some((s:any)=>s.animating>0);report.liveRowAnimation=report.liveSamples.some((s:any)=>s.rows.some((r:any)=>Number(r.opacity)<.98));
await page.screenshot({caret:'initial',path:directory+'/motion-live-update.png'});
const agentsNav=page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Agents',exact:true});await agentsNav.hover();await page.waitForTimeout(250);report.navHover=await agentsNav.evaluate(e=>getComputedStyle(e,'::after').transform);await agentsNav.click();await expect(page).toHaveURL(/\/agents$/);await expect(page.locator('.agent-grid .agent-card').first()).toBeVisible();report.navigation=true;
await page.goto('http://localhost:3000');await page.locator('.globe.is-ready').waitFor();await page.waitForTimeout(1800);await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(1200);
const reducedStart=await page.locator('.globe-viewport').getAttribute('data-rotation');await page.waitForTimeout(1500);const reducedEnd=await page.locator('.globe-viewport').getAttribute('data-rotation');report.reduced={start:reducedStart,end:reducedEnd,label:await page.locator('.label-0').evaluate(e=>getComputedStyle(e).animationName)};expect(reducedStart).toBe(reducedEnd);expect(report.reduced.label).toBe('none');
report.errors=errors;await writeFile(directory+'/motion-review.json',JSON.stringify(report,null,2));
const video=page.video()!;await context.close();await video.saveAs(directory+'/motion-review.webm');await browser.close();
console.log(JSON.stringify({...report,initialSamples:`${report.initialSamples.length} captured frames`,liveSamples:`${report.liveSamples.length} captured frames`},null,2));expect(errors).toEqual([]);expect(report.liveCounterAnimation).toBe(true);expect(report.liveRowAnimation).toBe(true);
if(idle){expect(report.idleDurationMs).toBeGreaterThanOrEqual(30000);expect(new Set(report.idle.map((s:any)=>s.event)).size).toBeGreaterThan(1);expect(new Set(report.idle.map((s:any)=>s.globe.nodeGlow)).size).toBeGreaterThan(1);expect(new Set(report.idle.map((s:any)=>s.statusOpacity)).size).toBeGreaterThan(1);expect(new Set(report.idle.map((s:any)=>s.sectionTop)).size).toBe(1);}
