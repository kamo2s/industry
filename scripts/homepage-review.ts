import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const pass=process.argv[2]||'baseline',dir='qa/homepage-final/'+pass;await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'});const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{await page.goto('http://localhost:3000/');await expect(page.locator('.globe-viewport')).toHaveAttribute('data-renderer','three-webgl');await expect(page.locator('.home-coin-table tbody tr').first()).toBeVisible();await page.waitForTimeout(1800);
const sizes=['pass-5','pass-6'].includes(pass)?[[1920,1080],[1440,1000],[768,1024],[390,844]]:[[1920,1080],[1440,1000],[390,844]];
for(const [width,height] of sizes){await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.locator(".terminal-bottom").scrollIntoViewIfNeeded();await page.waitForTimeout(1400);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(300);await page.screenshot({path:dir+'/'+width+'.png'});await page.screenshot({path:dir+'/'+width+'-full.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow at '+width).toBe(true);}
if(['pass-5','pass-6'].includes(pass)){await page.setViewportSize({width:390,height:844});for(const [name,selector] of [['globe','.terminal-network'],['activity','.hero-tape'],['coins','.top-coins'],['services','.featured-services'],['economy','.terminal-bottom']]){await page.locator(selector).scrollIntoViewIfNeeded();await page.waitForTimeout(400);await page.screenshot({path:dir+'/mobile-'+name+'.png'});}}
await writeFile(dir+'/checks.json',JSON.stringify({errors,viewports:sizes,zoom:1}));expect(errors).toEqual([]);
}finally{await browser.close();}



