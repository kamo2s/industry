import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
test('Coin observer journey: visual hierarchy, responsive layouts and immutable launch review',async({page})=>{
 test.setTimeout(180000);await page.waitForTimeout(20000);
 const pass=process.env.QA_COIN_PASS||'final',width=Number(process.env.QA_COIN_WIDTH||1440),height=width===390?844:width===1920?1080:1000,out=`qa/autonomous-coins/${pass}`;
 await mkdir(out,{recursive:true});await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [name,path] of [['home','/'],['coins','/coins'],['services','/marketplace'],['work','/marketplace?tab=work'],['profile','/coins/pulse'],['live','/coins/pulse?tab=live']]){
  await page.waitForTimeout(4000);await page.goto(path);await expect(page.locator('.loading')).toHaveCount(0);await expect(page.locator('main')).toHaveCSS('opacity','1');await expect(page.locator('.notice.error')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name).toBe(true);
  await expect(page.getByRole('button',{name:/^(Hire Agent|Buy Service|Pay|Post a Job|Run Now|Fund Business|Publish Service)$/})).toHaveCount(0);
  await page.screenshot({path:`${out}/${name}-${width}.png`,fullPage:true,animations:'disabled'});
 }
 await page.goto('/launch');await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeEnabled();await page.getByLabel('Coin name',{exact:true}).fill('SIGNAL');await page.getByLabel('Ticker',{exact:false}).fill('SIGNAL');await page.getByLabel('Short description').fill('Discover useful AI tools and verify their public evidence.');
 await page.screenshot({path:`${out}/launch-identity-${width}.png`,fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('What should your Coin work on?',{exact:false}).fill('Find useful new AI tools. Compare pricing and cite official documentation.');await page.getByText('Choose a brain and specialist activity',{exact:true}).click();await page.getByRole('combobox',{name:'AI model',exact:true}).selectOption('development/mock');
 await page.screenshot({path:`${out}/launch-mission-${width}.png`,fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Review launch',exact:true}).click();await expect(page.getByText('$0.10 per run · $1.00 per day',{exact:true})).toBeVisible();await expect(page.locator('main')).toContainText('There are no manual orders or creator controls afterwards.');await page.screenshot({path:`${out}/launch-review-${width}.png`,fullPage:true,animations:'disabled'});
 await page.getByLabel('Launch network').selectOption('pump');await expect(page.getByRole('button',{name:'Review & Sign Pump Launch'})).toBeDisabled();
 await page.goto('/dashboard');await expect(page.getByRole('button',{name:'Connect Wallet',exact:true}).last()).toBeVisible();await page.getByRole('button',{name:'Connect Wallet',exact:true}).last().click();await page.getByRole('button',{name:'Use a development wallet'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.loading')).toHaveCount(0);await expect(page.getByRole('tab',{name:'Created Coins',exact:true})).toBeVisible();await page.screenshot({path:`${out}/my-industry-${width}.png`,fullPage:true,animations:'disabled'});
 if(width===390){await page.getByRole('button',{name:'Open navigation',exact:true}).click();const nav=page.getByRole('navigation',{name:'Primary navigation'});await expect(nav.getByRole('link')).toHaveCount(5);await expect(nav.getByRole('link',{name:'My Industry',exact:true})).toBeVisible();await expect(nav.getByRole('link',{name:/Agents|Jobs|Network/})).toHaveCount(0);await nav.getByRole('link',{name:'Marketplace',exact:true}).click();await expect(page).toHaveURL(/marketplace$/);}
 await writeFile(out+'/checks.json',JSON.stringify({width,height,errors,zoom:'100% / deviceScaleFactor default',draftOnly:true,pumpDisabled:true,manualPurchasesAbsent:true},null,2));expect(errors).toEqual([]);
});
test('saved drafts keep identity and mission but review fixed platform defaults before launch',async({page})=>{
 await page.waitForTimeout(20000);await page.goto('/launch');await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeEnabled();
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('industry-launch-draft')!);d.name='Saved draft';d.ticker='SAVED';d.description='A preserved business description';d.scope='Research official documentation.';d.brain='development/mock';d.mission='Preserve this specific creator launch mandate.';d.policy.maxRunCost=.02;d.policy.autoHire=false;d.initialBudget=90;d.services[0].price=500;localStorage.setItem('industry-launch-draft',JSON.stringify(d));});
 await page.reload();await expect(page.getByLabel('Coin name',{exact:true})).toHaveValue('Saved draft');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Review launch',exact:true}).click();await expect(page.getByText('$0.10 per run · $1.00 per day',{exact:true})).toBeVisible();await expect(page.getByText('Research a topic · $0.010 / request',{exact:true})).toBeVisible();const d=await page.evaluate(()=>JSON.parse(localStorage.getItem('industry-launch-draft')!));expect(d.mission).toBe('Preserve this specific creator launch mandate.');expect(d.policy.autoHire).toBe(true);expect(d.initialBudget).toBe(10);expect(d.services[0].price).toBe(.01);
});

