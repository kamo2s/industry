import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
test('shared business identity and treasury loading/error states remain honest',async({page,request})=>{
 test.setTimeout(120000);await page.waitForTimeout(20000);
 const out='qa/master-completion/product/identity-pass-3';await mkdir(out,{recursive:true});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const agents=await(await request.get('/api/agents')).json(),photo=agents.find((a:any)=>a.name==='cxzczxdd');
 for(const [width,height] of [[1440,1000],[1920,1080],[390,844]]){
  await page.setViewportSize({width,height});await page.goto('/agents/pulse?tab=network');
  await expect(page.locator('.flow-focus .coin-portrait')).toBeVisible();await expect(page.locator('.network-inspector .coin-portrait')).toBeVisible();
  const frame=await page.locator('.flow-scroll').boundingBox(),focus=await page.locator('.flow-focus').boundingBox();expect(focus!.x).toBeGreaterThanOrEqual(frame!.x);expect(focus!.x+focus!.width).toBeLessThanOrEqual(frame!.x+frame!.width+1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${out}/profile-network-${width}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('tab',{name:'SERVICES',exact:true}).click();await expect(page.locator('.terminal-service').first()).toBeVisible();await expect(page.locator('.notice.error')).toHaveCount(0);
  await page.waitForTimeout(3500);
 }
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Global search'}).click();
 await page.getByLabel('Search coins, services, work').fill(photo.name);await expect(page.locator('.search-results img')).toHaveCSS('opacity','1');
 await page.screenshot({path:out+'/search-artwork-1440.png',fullPage:true,animations:'disabled'});
 // Hold just the balance read to inspect the real loading UI; never alter ledger data.
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/agents/*/treasury',async route=>{await gate;await route.fulfill({status:503,json:{error:{message:'Balance service temporarily unavailable'}}});});
 await page.goto('/agents/'+photo.slug);
 const treasury=page.locator('section').filter({has:page.getByRole('heading',{name:'INDUSTRY Treasury Ledger',exact:true})});
 await expect(treasury.getByRole('status')).toBeVisible();await expect(treasury.locator('.financial-costs')).toHaveCount(0);release();
 await expect(treasury.getByRole('alert')).toContainText('Balance service temporarily unavailable');await expect(treasury.getByRole('button',{name:'Retry balances'})).toBeVisible();await expect(treasury.locator('.financial-costs')).toHaveCount(0);
 await page.screenshot({path:out+'/balance-error-1440.png',fullPage:true,animations:'disabled'});
 await page.unroute('**/api/agents/*/treasury');await treasury.getByRole('button',{name:'Retry balances'}).click();await expect(treasury.locator('.financial-costs')).toContainText('Compute Credits');await expect(treasury.getByRole('alert')).toHaveCount(0);
 await expect(page.locator('.detail-top img')).toHaveCSS('opacity','1');expect(errors).toEqual([]);
});
