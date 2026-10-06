import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

// Read-only local review. No Coins, jobs, payments or account state are created.
const pass=process.argv[2]||'pass-1',dir='qa/coin-network/'+pass,base='http://localhost:3000';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors:string[]=[],checks:any[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 for(const width of [1440,1920,390,768]){
  await page.setViewportSize({width,height:width===390?844:width===768?1024:width===1920?1080:1000});
  await page.goto(base+'/coins/pulse?tab=network');
  await expect(page.getByRole('heading',{name:'Business connections'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Inspect supplier SEARCH'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.coin-network').screenshot({path:dir+'/network-'+width+'.png'});
  await page.screenshot({path:dir+'/profile-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'Inspect supplier SEARCH'}).click();
  await expect(page.locator('.cn-inspector')).toContainText('PULSE paid SEARCH');
  await expect(page.locator('.cn-receipt')).toHaveAttribute('href',/\/jobs\//);
  await page.getByRole('group',{name:'Rank connections by',exact:true}).getByRole('button',{name:'Jobs',exact:true}).click();
  await expect(page.locator('.cn-partner-value strong')).toHaveText('1 job');
  await page.getByRole('group',{name:'Rank connections by',exact:true}).getByRole('button',{name:'Payments',exact:true}).click();
  await page.getByLabel('Search connected Coins').fill('no-matching-coin');
  await expect(page.getByRole('heading',{name:'No matching connections'})).toBeVisible();
  await page.getByRole('button',{name:'Clear connection search',exact:true}).click();
  await expect(page.getByRole('button',{name:'Inspect supplier SEARCH'})).toBeVisible();
  checks.push({width,overflow:false,selection:true,search:true,metricSwitch:true});
 }
 if(pass==='pass-3'){
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'24h',exact:true}).click();
  await expect(page.locator('.cn-inspector-empty')).toBeVisible();
  await expect(page.locator('.cn-metrics strong').first()).toHaveText('0');
  await page.locator('.coin-network').screenshot({path:dir+'/empty-1440.png'});
  await page.getByRole('button',{name:'7d',exact:true}).click();
  await expect(page.getByRole('button',{name:'Inspect supplier SEARCH'})).toBeVisible();
  await page.getByRole('link',{name:'View latest receipt'}).click();
  await expect(page).toHaveURL(/\/jobs\//);
  await expect(page.getByRole('heading',{name:'Work, delivered.'})).toBeVisible();
  checks.push({emptyPeriod:true,receiptNavigation:true});
 }
 expect(errors).toEqual([]);await writeFile(dir+'/checks.json',JSON.stringify({pass,checks,errors,zoom:1,readOnly:true,fixture:false},null,2));console.log(JSON.stringify({pass,checks,errors}));
}finally{await browser.close();}
