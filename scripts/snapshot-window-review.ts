import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

// Existing local Coins only. This review never launches work or changes balances.
const pass=process.argv[2]||'pass-1',dir='qa/snapshot-window/'+pass,base='http://localhost:3000';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors:string[]=[],checks:any[]=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 for(const width of [1440,1920,390]){
  await page.setViewportSize({width,height:width===390?844:width===1920?1080:1000});
  await page.goto(base+'/coins/review-analyst-bbf586');
  await expect(page.getByRole('heading',{name:'Awaiting browser activity'})).toBeVisible();
  await expect(page.getByTestId('browser-signal')).toHaveText('STANDBY');
  await expect(page.getByRole('button',{name:'Replay captures',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.coin-watch').screenshot({path:dir+'/empty-'+width+'.png'});
  await page.screenshot({path:dir+'/overview-'+width+'.png',fullPage:true});
  await page.getByRole('tab',{name:'Current work',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Operations are paused.',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Live window',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Awaiting browser activity'})).toBeVisible();
  await page.getByRole('tab',{name:'LIVE',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Awaiting browser activity'})).toBeVisible();
  await page.getByTestId('live-screen').screenshot({path:dir+'/live-'+width+'.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  checks.push({width,emptyOverview:true,emptyLive:true,currentWorkAccessible:true,overflow:false});
 }
 if(pass==='pass-3'){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base+'/coins/review-scout-bf61b0');
  await expect(page.locator('.browser-pixels img')).toHaveAttribute('data-loaded','true');
  await expect(page.getByTestId('browser-signal')).toHaveText('LAST CAPTURE');
  await page.getByRole('button',{name:'Replay captures',exact:true}).click();
  await expect(page.getByTestId('browser-signal')).toHaveText('REPLAY');
  await expect(page.getByRole('button',{name:'Browser capture 2',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Follow latest',exact:true}).click();
  await page.getByRole('button',{name:'Expand screen',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.evaluate(()=>document.exitFullscreen());
  for(const width of [1440,1920,390]){
   await page.setViewportSize({width,height:width===390?844:width===1920?1080:1000});
   await page.locator('.coin-watch').screenshot({path:dir+'/recorded-'+width+'.png'});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'Zoom page',exact:true}).click();
  expect(await page.locator('.browser-pixels').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Fit page to screen',exact:true}).click();
  checks.push({realRetainedFrames:true,replay:true,fullscreen:true,mobileZoom:true});
 }
 expect(errors).toEqual([]);
 await writeFile(dir+'/checks.json',JSON.stringify({pass,checks,errors,deviceScaleFactor:1,fixture:false,readOnly:true},null,2));
 console.log(JSON.stringify({pass,checks,errors}));
}finally{await browser.close();}
