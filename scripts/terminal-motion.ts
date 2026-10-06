import { resolve } from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.data/playwright');
const {chromium,expect}=await import('@playwright/test');
import { mkdir,writeFile } from 'node:fs/promises';

const dir='qa/terminal';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
const context=await browser.newContext({viewport:{width:1536,height:1024},deviceScaleFactor:1,reducedMotion:'no-preference',recordVideo:{dir:'.data/motion-video',size:{width:1536,height:1024}}});
const page=await context.newPage(),errors:string[]=[],report:any={};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript({content:`
  window.__samples=[];let last=0;
  function sample(t){if(t-last>35){last=t;const rows=[...document.querySelectorAll('.hero-tape .tape-row')];window.__samples.push({time:t,animating:document.querySelectorAll('[data-animating=true]').length,rows:rows.map(e=>({text:e.textContent,opacity:getComputedStyle(e).opacity})),bars:[...document.querySelectorAll('.economy-columns>div')].map(e=>getComputedStyle(e).transform)});if(window.__samples.length>1500)window.__samples.shift();}requestAnimationFrame(sample);}requestAnimationFrame(sample);
`});
await page.route('**/api/agents',async route=>{await new Promise(r=>setTimeout(r,1500));await route.continue();});
await page.goto('http://localhost:3000',{waitUntil:'domcontentloaded'});await expect(page.locator('.loading').first()).toBeVisible();report.progressiveLoading=true;await page.screenshot({path:dir+'/motion-loading.png'});
await page.locator('.globe.is-ready').waitFor();await page.locator('.compact-coins tbody tr').first().waitFor();await page.unrouteAll({behavior:'wait'});await page.waitForTimeout(1800);
report.chartAnimated=await page.evaluate(()=>(window as any).__samples.some((s:any)=>s.bars.some((v:string)=>v!=='none'&&v!=='matrix(1, 0, 0, 1, 0, 0)')));
const button=page.locator('.terminal-hero-actions .primary');await button.hover();await page.waitForTimeout(300);report.buttonHover=await button.evaluate(e=>({transform:getComputedStyle(e).transform,shadow:getComputedStyle(e).boxShadow}));await page.mouse.down();await page.waitForTimeout(250);report.buttonPress=await button.evaluate(e=>getComputedStyle(e).transform);await page.mouse.move(10,10);await page.mouse.up();expect(report.buttonHover.transform).not.toBe(report.buttonPress);
const card=page.locator('.terminal-service').first();await card.hover();await page.waitForTimeout(350);report.cardHover=await card.evaluate(e=>({transform:getComputedStyle(e).transform,border:getComputedStyle(e).borderColor}));expect(report.cardHover.transform).toContain('-2');await page.screenshot({path:dir+'/motion-hover.png'});
await page.getByRole('button',{name:'Connect Wallet',exact:true}).click();await page.getByRole('button',{name:'Use a development wallet'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
report.before=await page.locator('.terminal-metrics strong').allTextContents();await page.evaluate(()=>{(window as any).__samples=[];});
report.request=await page.evaluate(async()=>{const services=await(await fetch('/api/services')).json(),service=services.find((s:any)=>s.agent_name==='SEARCH');const response=await fetch('/api/services/'+service.id+'/request',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({input:{topic:'Review public Solana documentation for the INDUSTRY terminal motion audit.'}})});const result=await response.json();return {status:response.status,jobId:result.jobId};});expect(report.request.status).toBe(200);
report.observation=[];const started=Date.now();
for(let i=0;i<=6;i++){
 await page.waitForTimeout(Math.max(0,started+i*5000-Date.now()));
 report.observation.push(await page.evaluate(()=>({at:Date.now(),globe:{...document.querySelector<HTMLElement>('.globe-viewport')!.dataset},overlay:getComputedStyle(document.querySelector('.network-overlay')!).transform,dot:getComputedStyle(document.querySelector('.network-overlay .live-dot')!).opacity,number:[...document.querySelectorAll('.terminal-metrics strong')].map(e=>e.textContent),event:document.querySelector('.hero-tape .tape-row')?.textContent,top:document.querySelector('.hero-tape')!.getBoundingClientRect().top})));
 await page.screenshot({path:dir+`/motion-${i*5}s.png`});
}
report.durationMs=Date.now()-started;report.after=await page.locator('.terminal-metrics strong').allTextContents();
const samples=await page.evaluate(()=>(window as any).__samples);report.sampleCount=samples.length;report.liveCounterAnimation=samples.some((s:any)=>s.animating>0);report.liveRowAnimation=samples.some((s:any)=>s.rows.some((r:any)=>Number(r.opacity)<.98));
expect(report.durationMs).toBeGreaterThanOrEqual(30000);expect(report.after[2]).not.toBe(report.before[2]);expect(report.observation.at(-1).globe.rotation).not.toBe(report.observation[0].globe.rotation);expect(new Set(report.observation.map((s:any)=>s.globe.nodeGlow)).size).toBeGreaterThan(1);expect(new Set(report.observation.map((s:any)=>s.overlay)).size).toBeGreaterThan(1);expect(report.observation.some((s:any)=>Number(s.globe.pulses)>0)).toBe(true);expect(new Set(report.observation.map((s:any)=>s.top)).size).toBe(1);
await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(1200);const rotation=await page.locator('.globe-viewport').getAttribute('data-rotation');await page.waitForTimeout(1500);report.reduced={rotation,after:await page.locator('.globe-viewport').getAttribute('data-rotation'),overlay:await page.locator('.network-overlay').evaluate(e=>getComputedStyle(e).animationName)};expect(report.reduced.after).toBe(rotation);expect(report.reduced.overlay).toBe('none');
report.errors=errors;await writeFile(dir+'/motion.json',JSON.stringify(report,null,2));const video=page.video()!;await context.close();await video.saveAs(dir+'/motion.webm');await browser.close();console.log(JSON.stringify(report,null,2));expect(report.chartAnimated).toBe(true);expect(report.liveCounterAnimation).toBe(true);expect(report.liveRowAnimation).toBe(true);expect(errors).toEqual([]);
