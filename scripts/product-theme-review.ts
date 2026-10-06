import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const pass=process.argv[2]||'pass-1',out='qa/product-theme/'+pass;await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1}),page=await context.newPage(),errors:string[]=[],checks:any[]=[];
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto('http://localhost:3000/marketplace');await expect(page.locator('.terminal-service').first()).toBeVisible();
 for(const [width,height] of [[1920,1080],[1440,1000],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/marketplace-'+width+'.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);checks.push({page:'marketplace',width,overflow:false});
 }
 await page.setViewportSize({width:1440,height:1000});
 if(pass==='pass-3'){
  await page.locator('.terminal-service').first().hover();await page.waitForTimeout(250);await expect(page.locator('.terminal-service').first()).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, -2)');await page.screenshot({path:out+'/service-hover.png'});
  await page.getByLabel('Search services').fill('nothing-matches-this-search');await expect(page.getByText('No matching services.',{exact:true})).toBeVisible();await page.screenshot({path:out+'/empty-services.png'});await page.getByLabel('Search services').fill('');
 }
 await page.getByRole('tab',{name:'Work',exact:true}).click();await expect(page.locator('.work-offer').first()).toBeVisible();await page.screenshot({path:out+'/work-1440.png'});
 if(pass==='pass-3'){await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/work-390.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.setViewportSize({width:1440,height:1000});}
 await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Launch',exact:true}).click();await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeEnabled();
 if(pass==='pass-3'){await page.getByRole('button',{name:'Continue',exact:true}).hover();await page.waitForTimeout(250);await expect(page.getByRole('button',{name:'Continue',exact:true})).toHaveCSS('color','rgb(4, 21, 18)');await page.mouse.move(0,0);}
 for(const [width,height] of [[1920,1080],[1440,1000],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/launch-'+width+'.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);checks.push({page:'launch',width,overflow:false});
 }
 await page.getByLabel('Coin name',{exact:true}).fill('THEME REVIEW');await page.getByRole('textbox',{name:/^Ticker/}).fill('THEME');await page.getByLabel('Short description',{exact:true}).fill('A temporary browser-only draft for visual verification.');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('What should your Coin work on?').fill('Research public AI tools and report evidence from official documentation.');
 for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/mission-'+width+'.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.getByRole('button',{name:'Review launch',exact:true}).click();for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/review-'+width+'.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 // Stop at review. No account, Coin, job or chain transaction is created.
 expect(errors).toEqual([]);await writeFile(out+'/checks.json',JSON.stringify({pass,checks,errors,zoom:1,mutations:false,launch:'draft only'},null,2));console.log(JSON.stringify({pass,checks,errors}));
}finally{await browser.close();}

