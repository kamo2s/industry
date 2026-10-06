import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const pass=process.argv[2]||'pass-1',dir='qa/coins-directory/'+pass;
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors:string[]=[],checks:any[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto('http://localhost:3000/coins');await expect(page.locator('.cd-card').first()).toBeVisible();
 for(const [width,height] of [[1920,1080],[1440,1000],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(650);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:dir+'/coins-'+width+'.png'});
  checks.push({width,height,overflow:false,cards:await page.locator('.cd-card').count()});
 }
 if(pass==='pass-3'){
  await page.locator('.cd-card').first().screenshot({path:dir+'/mobile-card.png'});await page.evaluate(()=>scrollTo(0,0));
  await page.getByRole('button',{name:'Filters',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:/Researcher/}).click();await expect(page.locator('.cd-card').first()).toContainText('Researcher');
  await page.getByRole('dialog').screenshot({path:dir+'/mobile-filters.png'});
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({width:1440,height:1000});await page.locator('.cd-sidebar').getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.locator('.cd-card').first().hover();await page.waitForTimeout(300);await expect(page.locator('.cd-card').first()).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, -2)');
  await page.locator('.cd-card').first().locator('.cd-open').hover();await page.waitForTimeout(200);await page.screenshot({path:dir+'/hover-1440.png'});
  await page.getByLabel('Search coins').fill('PULSE');await expect(page.locator('.cd-card')).toHaveCount(1);
  await page.getByRole('button',{name:'List view',exact:true}).click();await expect(page.locator('.terminal-table tbody tr')).toHaveCount(1);
  await page.screenshot({path:dir+'/list-view.png'});await page.getByRole('button',{name:'Grid view',exact:true}).click();
  await page.getByLabel('Search coins').fill('there-is-no-such-coin');await expect(page.getByRole('heading',{name:'No Coins match these filters'})).toBeVisible();
  await page.screenshot({path:dir+'/empty.png'});await page.locator('.cd-empty').getByRole('button',{name:'Clear filters'}).click();
  await page.getByRole('button',{name:'Top revenue',exact:true}).click();await expect(page.getByLabel('Sort coins')).toHaveValue('Revenue');
  await page.getByLabel('Search coins').fill('cxzczxdd');await expect(page.locator('.cd-artwork.has-art')).toHaveCount(1);await page.screenshot({path:dir+'/uploaded-artwork.png'});
  await page.getByLabel('Search coins').fill('PULSE');await page.getByRole('link',{name:'Open PULSE Coin',exact:true}).click();await expect(page).toHaveURL(/\/coins\/pulse$/);await expect(page.getByRole('tab',{name:'LIVE',exact:true})).toBeVisible();
  checks.push({drawer:true,role:true,search:true,gridList:true,empty:true,sort:true,uploadedArtwork:true,coinNavigation:true});
 }
 expect(errors).toEqual([]);await writeFile(dir+'/checks.json',JSON.stringify({pass,checks,errors,zoom:1,readOnly:true,fixture:false},null,2));console.log(JSON.stringify({pass,checks,errors}));
}finally{await browser.close();}
