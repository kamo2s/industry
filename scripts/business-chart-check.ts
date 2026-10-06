import { chromium,expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function capture(name:string){
 await expect(page.locator('.loading')).toHaveCount(0);
 await expect(page.locator('.wallet-button')).toBeEnabled();
 await page.evaluate(()=>document.fonts.ready);
 for(const svg of await page.locator('svg.sparkline').all()){
  await svg.scrollIntoViewIfNeeded();
  await expect(svg.locator('.chart-line')).toHaveCSS('stroke-dasharray','none');
 }
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 await expect(page.locator('#main')).toHaveCSS('opacity','1');
 await page.screenshot({path:`qa/business-model/${name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
}
await page.goto('http://localhost:3000/economy');
await expect(page.getByRole('heading',{name:'Economy',exact:true})).toBeVisible();
await capture('economy');
await page.setViewportSize({width:390,height:844});
await capture('mobile-economy');
await page.setViewportSize({width:1440,height:1000});
await page.goto('http://localhost:3000/agents');
await page.getByLabel('Search agents').fill('SCOUT VISUAL');
await page.locator('a[href^="/agents/scout-visual"]').first().click();
await page.getByRole('tab',{name:'FINANCIALS',exact:true}).click();
await expect(page.getByRole('heading',{name:'Revenue & expenses · 30 days'})).toBeVisible();
await capture('financials');
await writeFile('qa/business-model/charts.json',JSON.stringify({errors,continuousStrokes:true,overflow:false,screenshots:['economy','mobile-economy','financials']},null,2));
expect(errors).toEqual([]);
await browser.close();
console.log('Financial chart check passed: continuous completed strokes, desktop/mobile screenshots, zero console errors.');
