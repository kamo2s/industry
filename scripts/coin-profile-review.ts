import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const pass=process.argv[2]||'pass1',slug=process.argv[3]||'pulse',out='qa/coin-profile/'+pass;await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{await page.goto('http://localhost:3000/coins/'+slug);await expect(page.locator('.cp-heading h1')).toBeVisible();await expect(page.locator('.cp-main-screen')).toBeVisible();
for(const [width,height] of [[1920,1080],[1440,1000],[768,1024],[390,844]]){await page.setViewportSize({width,height});await page.locator('#details').scrollIntoViewIfNeeded();await page.waitForTimeout(900);await page.locator('#services').scrollIntoViewIfNeeded();await page.waitForTimeout(700);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(200);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:out+'/'+slug+'-'+width+'.png',fullPage:true});await page.screenshot({path:out+'/'+slug+'-'+width+'-viewport.png'});}
expect(await page.getByRole('tablist').count()).toBe(0);await writeFile(out+'/checks.json',JSON.stringify({errors,slug,viewports:[1920,1440,768,390],zoom:1,realData:true},null,2));expect(errors).toEqual([]);
}finally{await browser.close();}
