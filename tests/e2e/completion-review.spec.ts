import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT||'qa/master-completion/product/final';
test('controlled full-site review and first-time visitor, creator and account journeys',async({page,request})=>{
 test.setTimeout(480000);await mkdir(out,{recursive:true});await page.waitForTimeout(20000);
 const errors:string[]=[],timings:Record<string,number>={};page.on('pageerror',e=>errors.push(e.message));
 const agents=await(await request.get('/api/agents')).json(),photo=agents.find((a:any)=>a.name==='cxzczxdd');
 const services=await(await request.get('/api/services')).json(),service=services.find((s:any)=>s.agent_name==='VERIFY')||services[0];
 const record=await(await request.get('/api/agents/pulse/record')).json();
 const routes=[['home','/'],['coins','/coins'],['marketplace','/marketplace'],['work','/marketplace?tab=work'],['economy','/economy'],['activity','/activity'],['launch','/launch'],['overview','/agents/pulse'],['live','/agents/pulse?tab=live'],['track-record','/agents/pulse?tab=track-record'],['services','/agents/pulse?tab=services'],['financials','/agents/pulse?tab=financials'],['settings','/settings'],['service','/services/'+service.id],['actual-coin','/agents/'+photo.slug]];
 if(record.jobs?.[0])routes.push(['receipt','/jobs/'+record.jobs[0].id]);
 const focus=process.env.QA_FOCUS?.split(',');const selectedRoutes=focus?routes.filter(([name])=>focus.includes(name)):routes;
 for(const [width,height] of [[1440,1000],[1920,1080],[390,844]]){
  await page.setViewportSize({width,height});
  for(const [name,path] of selectedRoutes){
   await page.waitForTimeout(4500);const start=Date.now();await page.goto(path);await expect(page.locator('.loading')).toHaveCount(0);await expect(page.locator('main')).toHaveCSS('opacity','1');await page.waitForTimeout(350);await expect(page.locator('.loading')).toHaveCount(0);
   if(name==='settings')await expect(page.getByText('Checking',{exact:true})).toHaveCount(0);
   if(name==='actual-coin')await expect(page.locator('.detail-top img')).toHaveCSS('opacity','1');
   await expect(page.locator('.notice.error')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' '+width).toBe(true);
   timings[name+'-'+width]=Date.now()-start;await page.screenshot({path:`${out}/${name}-${width}.png`,fullPage:true,animations:'disabled'});
  }
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto('/launch');
 await page.getByLabel('Coin name',{exact:true}).fill('COMPLETION REVIEW');await page.getByLabel('Ticker',{exact:false}).fill('REVIEW');await page.getByLabel('Short description').fill('A draft used to review the creator journey.');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByLabel('What should your Coin work on?',{exact:false}).fill('Research official AI documentation, cite sources, and report useful changes.');await page.getByRole('button',{name:'Review launch',exact:true}).click();await expect(page.getByText('$0.10 per run · $1.00 per day',{exact:true})).toBeVisible();
 await page.screenshot({path:out+'/creator-review-1440.png',fullPage:true,animations:'disabled'});
 await page.getByLabel('Launch network').selectOption('pump');await expect(page.getByRole('button',{name:'Review & Sign Pump Launch'})).toBeDisabled();
 await page.goto('/');await page.getByRole('button',{name:'Connect Wallet',exact:true}).click();await page.getByRole('button',{name:'Use a development wallet'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 let watchReads=0;page.on('request',r=>{if(r.method()==='GET'&&new URL(r.url()).pathname==='/api/watchlist')watchReads++;});
 await page.goto('/coins');await expect(page.locator('.loading')).toHaveCount(0);await expect(page.getByRole('button',{name:'Add to watchlist'}).first()).toBeVisible();
 await page.waitForTimeout(500);const initialWatchReads=watchReads;expect(initialWatchReads).toBe(1);
 await page.getByRole('button',{name:'List view',exact:true}).click();await page.getByLabel('Search coins').fill(photo.name);await page.getByRole('button',{name:'Add to watchlist',exact:true}).click();await expect(page.getByRole('button',{name:'Remove from watchlist'})).toBeVisible();
 for(const [width,height] of [[1440,1000],[390,844]]){await page.setViewportSize({width,height});for(const tab of ['Created Coins','Watchlist','Notifications']){
  await page.goto('/dashboard?tab='+tab);await expect(page.locator('.loading')).toHaveCount(0);await expect(page.locator('.notice.error')).toHaveCount(0);await expect(page.getByRole('heading',{name:'My Industry',exact:true})).toBeVisible();
  if(tab==='Watchlist')await expect(page.locator('main')).toContainText(photo.name);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),tab).toBe(true);await page.screenshot({path:`${out}/account-${tab.toLowerCase()}-${width}.png`,fullPage:true,animations:'disabled'});
 }}
 await page.goto('/dashboard?tab=Watchlist');await page.getByRole('button',{name:'Remove from watchlist'}).click();await expect(page.getByRole('button',{name:'Remove from watchlist'})).toHaveCount(0);
 await page.goto('/services/'+service.id);await expect(page.getByRole('button',{name:/Hire|Buy|Pay/})).toHaveCount(0);await expect(page.getByRole('link',{name:'Watch live',exact:true})).toBeVisible();await page.screenshot({path:out+'/observer-service-390.png',fullPage:true,animations:'disabled'});
 await writeFile(out+'/checks.json',JSON.stringify({at:new Date().toISOString(),viewports:[1440,1920,390],routes:selectedRoutes.length,timings,initialWatchReads,watchReads,errors,creatorDraftOnly:true,pumpDisabled:true,account:'Temporary development identity; watch entry removed',observer:'Read-only service and existing settled receipt; no manual purchasing'},null,2));expect(errors).toEqual([]);
});

