import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const people=JSON.parse(await readFile('.data/staging/identities.json','utf8')),radar=people.find((p:any)=>p.name==='RADAR');
const base='http://localhost:3100',dir='qa/staging/live';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
await context.addCookies([{name:'industry_session',value:radar.session,url:base}]);
const page=await context.newPage(),errors:string[]=[],observed:any[]=[],shots=new Set<string>();let recent:any;
page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().includes('/live'))try{recent=await r.json();}catch{}});
await page.goto(base+'/agents/'+radar.agent.slug+'?tab=live');
const started=Date.now();try{while(Date.now()-started<160000){
 const mode=await page.getByTestId('workspace-mode').textContent().catch(()=>null);
 if(mode){observed.push({at:new Date().toISOString(),mode,status:recent?.operation?.status,jobId:recent?.operation?.id});if(!shots.has(mode)){shots.add(mode);await page.screenshot({path:dir+'/'+mode.toLowerCase().replace(/[^a-z]+/g,'-')+'.png',fullPage:true});}}
 if(recent?.operation?.status==='succeeded'&&Date.now()-started>30000)break;
 await page.waitForTimeout(700);
}
await writeFile(dir+'/observed.json',JSON.stringify({base,startedAt:new Date(started).toISOString(),durationSeconds:(Date.now()-started)/1000,observed,errors},null,2));console.log(JSON.stringify({modes:[...shots],errors}));
}finally{await browser.close();}
