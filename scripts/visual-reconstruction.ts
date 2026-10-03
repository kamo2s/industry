import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
const pass=process.argv[2]||'initial',all=process.argv.includes('--all');
await mkdir('qa/reconstruction',{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const measurements:any[]=[];
for(const [name,width,height] of [['desktop',1440,1000],['reference',1216,1296],...(all?[['tablet',768,1024],['mobile',390,844]]:[])] as [string,number,number][]){
  await page.setViewportSize({width,height});await page.goto('http://localhost:3000');
  await page.locator('.globe.is-ready').waitFor();await page.locator('.featured .agent-card h3').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(900);
  const fullHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
  if(name==='desktop')await page.screenshot({path:`qa/reconstruction/${pass}-viewport.png`});
  if(name==='mobile')await page.screenshot({path:`qa/reconstruction/${pass}-mobile-viewport.png`});
  await page.setViewportSize({width,height:Math.max(height,fullHeight)});await page.waitForTimeout(350);
  await page.screenshot({path:`qa/reconstruction/${pass}-${name}.png`,fullPage:true});
  const data=await page.evaluate(()=>({width:innerWidth,scale:visualViewport?.scale,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth,background:getComputedStyle(document.body).backgroundColor,globe:{...document.querySelector<HTMLElement>('.globe-viewport')!.dataset},layout:Object.fromEntries(['.hero','.activity-panel','.featured','.bottom-grid'].map(s=>{const e=document.querySelector(s)!;const r=e.getBoundingClientRect();return [s,{top:r.top,height:r.height,width:r.width}];}))}));
  measurements.push({name,...data});console.log(JSON.stringify({name,...data}));
}
await writeFile(`qa/reconstruction/${pass}-measurements.json`,JSON.stringify({measurements,errors},null,2));
await browser.close();if(errors.length){console.error(errors);process.exitCode=1;}
