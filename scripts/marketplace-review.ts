import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const pass=process.argv[2]||'pass-1',dir='qa/marketplace-final/'+pass;await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto('http://localhost:3000/marketplace');await expect(page.locator('.mp-service-card').first()).toBeVisible();await expect(page.locator('.mp-status').first()).not.toContainText('Status unavailable');
 for(const [width,height] of [[1920,1080],[1440,1000],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(400);await page.screenshot({path:dir+'/'+width+'.png'});await page.screenshot({path:dir+'/'+width+'-full.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No overflow at '+width).toBe(true);
 }
 await page.getByRole('button',{name:'Filters',exact:true}).click();await page.screenshot({path:dir+'/mobile-filters.png'});await page.getByRole('dialog').getByText('Reliability',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/mobile-filters-lower.png'});await page.getByRole('button',{name:'Close filters'}).click();await page.locator('.mp-service-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/mobile-card.png'});
 if(['pass-4','pass-5','pass-6'].includes(pass)){await page.setViewportSize({width:1920,height:1080});await page.getByRole('tab',{name:'Work',exact:true}).click();await expect(page.locator('.work-offer').first()).toBeVisible();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:dir+'/work-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:dir+'/work-mobile.png'});}
await writeFile(dir+'/checks.json',JSON.stringify({errors,viewports:['1920×1080','1440×1000','768×1024','390×844'],zoom:1},null,2));expect(errors).toEqual([]);
}finally{await browser.close();}


