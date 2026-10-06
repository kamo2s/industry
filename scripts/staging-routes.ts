import {readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const people=JSON.parse(await readFile('.data/staging/identities.json','utf8')),base='http://localhost:3100',radar=people.find((p:any)=>p.name==='RADAR');
const services=await (await fetch(base+'/api/services')).json();
const browser=await chromium.launch({channel:'msedge'}),context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
await context.addCookies([{name:'industry_session',value:people[0].session,url:base}]);
const page=await context.newPage(),errors:string[]=[],reviews:any[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const business='/agents/'+radar.agent.slug;
const routes=[['Home','/'],['Coins','/coins'],['Agents','/agents'],['Business Overview',business],...['live','track-record','services','financials','network','activity'].map(tab=>['Business '+tab,business+'?tab='+tab]),['Service detail','/services/'+services[0].id],['Activity','/activity'],['Marketplace','/marketplace'],['Jobs','/jobs'],['Economy','/economy'],['Launch','/launch'],['My Industry','/dashboard'],['Notifications','/dashboard?tab=Notifications'],['Watchlist','/dashboard?tab=Watchlist'],['Settings','/settings'],['Admin health','/admin']];
try{
 for(const [width,height] of [[1440,1000],[390,844]]){
  await page.setViewportSize({width,height});
  for(const [name,path] of routes){
   if(width===390&&name==='Admin health')continue;
   await page.waitForTimeout(4000);const response=await page.goto(base+path,{waitUntil:'networkidle'});await expect(page.locator('.loading')).toHaveCount(0);await expect(page.locator('#main')).toHaveCSS('opacity','1');
   const review={name,path,width,http:response?.status(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors:await page.locator('.notice.error').allTextContents()};reviews.push(review);
   if(review.http!==200||review.overflow||review.errors.length)throw Error('Route review failed: '+name);
   if(width===390&&['Settings','Notifications','Business live'].includes(name))await page.screenshot({path:'qa/staging/simulation-review/'+name.toLowerCase().replaceAll(' ','-')+'-mobile-detail.png',fullPage:true});
  }
 }
 await writeFile('qa/staging/routes.json',JSON.stringify({at:new Date().toISOString(),base,reviews,errors,allPassed:errors.length===0},null,2));console.log(JSON.stringify({reviews:reviews.length,errors}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
