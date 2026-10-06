import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.QA_BASE_URL||'http://localhost:3000';
const phase=process.argv.includes('--baseline')?'baseline':process.argv.includes('--staging')?'simulation-review':'regression';
const dir=`qa/staging/${phase}`;await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
const context=await browser.newContext({deviceScaleFactor:1,reducedMotion:'reduce'});
try {
 if(process.argv.includes('--staging')){const people=JSON.parse(await readFile('.data/staging/identities.json','utf8'));await context.addCookies([{name:'industry_session',value:people[0].session,url:base}]);}
 else {
  const auth=JSON.parse(await readFile('.data/live-operations-acceptance.json','utf8'));
  const cookie=auth.radarCookie||auth.cookie;
  if(typeof cookie==='string') {const i=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,i),value:cookie.slice(i+1),url:base}]);}
 }
}catch{}
const page=await context.newPage(),errors:string[]=[],screens:any[]=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const business=process.env.QA_BUSINESS_SLUG||(process.argv.includes('--staging')?JSON.parse(await readFile('.data/staging/identities.json','utf8')).find((p:any)=>p.name==='RADAR').agent.slug:'radar-ops-9804-e972a2');
try {
  for(const [width,height] of [[1440,1000],[1920,1080],[390,844]]) {
    await page.setViewportSize({width,height});
    for(const [name,path] of [['home','/'],['overview',`/agents/${business}`],['live',`/agents/${business}?tab=live`],['economy','/economy'],['coins','/coins'],['marketplace','/marketplace'],['launch','/launch'],['my-industry','/dashboard']]) {
      await page.waitForTimeout(3500);const start=Date.now();await page.goto(base+path,{waitUntil:'networkidle'});
      await page.evaluate(()=>document.fonts.ready);await expect(page.locator('#main')).toHaveCSS('opacity','1');
      await page.screenshot({path:`${dir}/${name}-${width}.png`,fullPage:true});
      screens.push({name,path,width,height,loadMs:Date.now()-start,...await page.evaluate(()=>({zoom:visualViewport?.scale,overflow:document.documentElement.scrollWidth>innerWidth}))});
    }
  }
  await writeFile(`${dir}/results.json`,JSON.stringify({at:new Date().toISOString(),base,phase,screens,errors},null,2));
  console.log(JSON.stringify({phase,screens:screens.length,errors,overflow:screens.filter(s=>s.overflow)}));
}finally{await browser.close();}

