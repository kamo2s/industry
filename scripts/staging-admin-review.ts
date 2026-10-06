import {readFile,writeFile} from 'node:fs/promises';import {chromium,expect} from '@playwright/test';
const people=JSON.parse(await readFile('.data/staging/identities.json','utf8')),base='http://localhost:3100',browser=await chromium.launch({channel:'msedge'}),context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
await context.addCookies([{name:'industry_session',value:people[0].session,url:base}]);const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/admin');await expect(page.getByRole('heading',{name:'System health',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Pause providers',exact:true})).toBeVisible();
 try{await page.getByRole('button',{name:'Pause providers',exact:true}).click();await expect(page.getByRole('button',{name:'Resume providers',exact:true})).toBeVisible();const r=await page.request.get(base+'/api/admin/status');if(!(await r.json()).health.budget.paused)throw Error('Provider pause not enforced');}
 finally{if(await page.getByRole('button',{name:'Resume providers',exact:true}).count()){await page.getByRole('button',{name:'Resume providers',exact:true}).click();await expect(page.getByRole('button',{name:'Pause providers',exact:true})).toBeVisible();}}
 await page.screenshot({path:'qa/staging/admin-1440.png',fullPage:true});
 const data=await (await page.request.get(base+'/api/admin/status')).json();const checks={providerPauseAndResume:true,providerResumed:!data.health.budget.paused,treasuryBlocked:!data.health.pump.treasuryConfigured,collectorBlocked:!data.health.pump.collectorConfigured,broadcastDisabled:!data.health.pump.enabled&&!data.health.pump.collectionEnabled,noOverflow:await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),noPageErrors:errors.length===0};
 await writeFile('qa/staging/admin.json',JSON.stringify({at:new Date().toISOString(),checks,errors},null,2));console.log(JSON.stringify(checks));if(Object.values(checks).some(v=>!v))process.exitCode=1;
}finally{await browser.close();}
