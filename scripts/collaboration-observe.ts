import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const dir='qa/collaboration/observation-'+(process.argv[3]||'latest').replace(/[^a-z0-9-]/gi,''),base='http://localhost:3000',state=JSON.parse(await readFile(process.argv.includes('--independent')?'.data/independent-pilot.json':'.data/collaboration-pilot.json','utf8'));await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),errors:string[]=[],samples:any[]=[],screens:any[]=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1}),pages=[];
try{
 for(const coin of state.coins){const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/coins/'+coin.slug);await expect(page.getByTestId('live-screen')).toBeVisible();pages.push({coin,page,seen:new Set<string>()});}
 const until=Date.now()+Number(process.argv[2]||120)*1000;
 while(Date.now()<until){for(const {coin,page,seen} of pages){const response=await context.request.get(base+'/api/coins/'+coin.id+'/live'),live=await response.json();const stage=live.operation?.stage||live.status?.state||'idle';samples.push({coin:coin.role,at:new Date().toISOString(),live});if(!seen.has(stage)){seen.add(stage);await page.locator('.coin-watch').screenshot({path:dir+'/pilot-'+coin.role.toLowerCase()+'-'+stage.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-')+'.png'});screens.push({coin:coin.role,stage});console.log(JSON.stringify({coin:coin.role,stage,status:live.operation?.status,captures:live.operation?.captures?.length,cost:live.operation?.costs}));}}
  await new Promise(r=>setTimeout(r,3500));
 }
 for(const {coin,page} of pages){const detail=await(await context.request.get(base+'/api/coins/'+coin.id)).json();await writeFile(dir+'/pilot-'+coin.role.toLowerCase()+'.json',JSON.stringify(detail,null,2));await page.screenshot({path:dir+'/pilot-'+coin.role.toLowerCase()+'-final.png',fullPage:true});}
 await writeFile(dir+'/pilot-observation.json',JSON.stringify({at:new Date().toISOString(),samples,screens,errors},null,2));console.log(JSON.stringify({observed:true,screens,errors}));expect(errors).toEqual([]);
}finally{await writeFile(dir+'/pilot-observation.json',JSON.stringify({at:new Date().toISOString(),samples,screens,errors},null,2));await browser.close();}
