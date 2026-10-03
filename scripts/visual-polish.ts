import { chromium,expect } from '@playwright/test';
import { mkdir,readFile,writeFile } from 'node:fs/promises';

const pass=process.argv[2]||'baseline',directory='qa/polish';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
const errors:string[]=[],measurements:any[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const selectors=['.header','.home','.hero','.hero-copy','.globe','.activity-panel','.statement','.featured','.featured .agent-card','.network-stats','.top-earners','.get-started','.footer'];
for(const [name,width,height] of [['desktop',1440,1000],['reference',1216,1296],['tablet',768,1024],['mobile',390,844]] as [string,number,number][]){
  await page.setViewportSize({width,height});await page.goto('http://localhost:3000');
  await page.locator('.globe.is-ready').waitFor();await page.locator('.featured .agent-card h3').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);
  const data=await page.evaluate(selectors=>({viewport:innerWidth,zoom:visualViewport?.scale,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth,layout:Object.fromEntries(selectors.map(s=>{const r=document.querySelector(s)!.getBoundingClientRect();return[s,{x:r.x,y:r.y,width:r.width,height:r.height}];})),type:Object.fromEntries(['.hero h1','.hero-copy>p','.hero-actions .button','.hero-metrics strong'].map(s=>{const c=getComputedStyle(document.querySelector(s)!);return[s,{fontSize:c.fontSize,lineHeight:c.lineHeight}];})),globe:{...document.querySelector<HTMLElement>('.globe-viewport')!.dataset}}),selectors);
  measurements.push({name,...data});
  await page.screenshot({path:`${directory}/${pass}-${name}-top.png`,caret:'initial'});
  await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));await page.waitForTimeout(350);
  await page.screenshot({path:`${directory}/${pass}-${name}-bottom.png`,caret:'initial'});
  const fullHeight=await page.evaluate(()=>document.documentElement.scrollHeight);await page.setViewportSize({width,height:Math.max(height,fullHeight)});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(250);
  await page.screenshot({path:`${directory}/${pass}-${name}.png`,fullPage:true,caret:'initial'});
}
await browser.close();
const geometryChanges:any[]=[];
if(pass!=='baseline'){
  const baseline=JSON.parse(await readFile(`${directory}/baseline.json`,'utf8')).measurements;
  for(const current of measurements){const old=baseline.find((m:any)=>m.name===current.name);for(const selector of selectors){for(const property of ['x','y','width','height']){const delta=current.layout[selector][property]-old.layout[selector][property];if(Math.abs(delta)>.5)geometryChanges.push({viewport:current.name,selector,property,delta});}}expect(current.type).toEqual(old.type);}
}
await writeFile(`${directory}/${pass}.json`,JSON.stringify({measurements,geometryChanges,errors},null,2));
console.log(JSON.stringify({pass,viewports:measurements.map(m=>({name:m.name,width:m.layout['.home'].width,overflow:m.overflow,zoom:m.zoom})),geometryChanges,errors}));
expect(geometryChanges).toEqual([]);expect(errors).toEqual([]);expect(measurements.every(m=>!m.overflow)).toBe(true);
