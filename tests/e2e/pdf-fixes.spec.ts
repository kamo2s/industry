import {test,expect} from '@playwright/test';

test('whole Coin cards open the same profile as their labelled link',async({page})=>{
 await page.goto('/coins');const card=page.locator('.cd-card').first();await expect(card).toBeVisible();const target=await card.locator('a.cd-open').getAttribute('href');
 for(const part of ['.cd-artwork','.cd-description']){const box=await card.locator(part).boundingBox();await page.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);await expect(page).toHaveURL(new RegExp(target!+'$'));await page.goto('/coins');await expect(card).toBeVisible();}
 await card.locator('a.cd-open').focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(new RegExp(target!+'$'));
});

test('header search stays inline, supports keyboard, clear, empty and failure states',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('.home-coin-table tbody tr')).toHaveCount(5);await page.keyboard.press('/');const input=page.getByLabel('Search coins, services, work');await expect(input).toBeFocused();await input.fill('PULSE');await expect(page.locator('.search-results a').first()).toContainText('PULSE');await expect(page.getByRole('dialog')).toHaveCount(0);
 const field=await input.boundingBox(),header=await page.locator('header.header').boundingBox();expect(field!.y+field!.height).toBeLessThanOrEqual(header!.y+header!.height);
 await page.keyboard.press('ArrowDown');await expect(page.locator('.search-results a').first()).toBeFocused();await page.keyboard.press('Escape');await expect(input).toBeFocused();await expect(page.locator('.header-find-results')).toHaveCount(0);
 await input.click();await input.fill('PULSE');await expect(page.locator('.search-results a').first()).toBeVisible();await page.keyboard.press('Enter');await expect(page).toHaveURL(/coins\/pulse/);await expect(input).toHaveValue('');
 await input.fill('nonexistent-pdf-test-8899');await expect(page.locator('.header-find-status')).toHaveText('No matching records.');await page.getByRole('button',{name:'Clear search'}).click();await expect(input).toHaveValue('');
 await page.route('**/api/search?**',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Temporarily unavailable'}})}));await input.fill('fail');await expect(page.locator('.header-find-results')).toContainText('Temporarily unavailable');await page.unroute('**/api/search?**');
 await page.setViewportSize({width:390,height:844});await input.fill('PULSE');await expect(page.locator('.search-results a').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.cp-metric').first().click();await expect(page.locator('.header-find-results')).toHaveCount(0);expect(errors).toEqual([]);
});

test('profile rows align, homepage panels separate and service buttons have padding',async({page})=>{
 for(const width of [1920,1440]){await page.setViewportSize({width,height:1000});await page.goto('/coins/pulse');await expect(page.locator('.cp-live-rail')).toBeVisible();await page.locator('#network').scrollIntoViewIfNeeded();await expect(page.locator('#network .cp-panel')).toBeVisible();await expect(page.locator('#outputs .cp-output').first()).toBeVisible();
  const live=await page.locator('.cp-main-screen').boundingBox(),rail=await page.locator('.cp-live-rail').boundingBox();expect(Math.abs(live!.height-rail!.height)).toBeLessThan(2);
  const panels=await page.locator('.cp-business-grid .cp-panel').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));for(let i=0;i<panels.length;i+=width===1920?4:2){expect(Math.abs(panels[i].top-panels[i+1].top)).toBeLessThan(2);expect(Math.abs(panels[i].bottom-panels[i+1].bottom)).toBeLessThan(2);}
  await page.goto('/');await expect(page.locator('.home-service .hire-button').first()).toBeVisible();const activity=await page.locator('.hero-tape').boundingBox(),services=await page.locator('.featured-services').boundingBox();expect(services!.y-(activity!.y+activity!.height)).toBeGreaterThanOrEqual(12);
  for(const card of await page.locator('.home-service .terminal-service').all()){const box=await card.boundingBox(),button=await card.locator('.hire-button').boundingBox();expect(box!.y+box!.height-button!.y-button!.height).toBeGreaterThanOrEqual(14);}
 }
 const input=page.getByLabel('Search coins, services, work');await input.focus();await expect(input).toHaveCSS('outline-style','none');await page.getByRole('link',{name:'Explore Coins',exact:true}).focus();await expect(page.getByRole('link',{name:'Explore Coins',exact:true})).toHaveCSS('outline-width','1px');
});

test('footer guides are complete, linked and usable on mobile',async({page,request})=>{
 await page.goto('/');const footer=page.getByRole('navigation',{name:'Project information'});await expect(footer.getByRole('link')).toHaveCount(3);await expect(footer).not.toContainText('Privacy');await expect(footer).not.toContainText('Terms');
 for(const [name,path,title] of [['Docs','/docs','How INDUSTRY works.'],['About','/about','A business with a mission.'],['FAQ','/faq','Questions, answered.']]){await footer.getByRole('link',{name,exact:true}).click();await expect(page).toHaveURL(new RegExp(path+'$'));await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();expect((await request.get(path)).ok()).toBe(true);}
 const question=page.locator('summary').filter({hasText:'Why is my Coin waiting'});await question.click();await expect(question.locator('..')).toContainText('no useful new data');await page.setViewportSize({width:390,height:844});await page.locator('.guide-nav a').filter({hasText:'Balances and results'}).click();await expect(page).toHaveURL(/#money$/);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.goto('/docs');await page.locator('.guide-nav a').filter({hasText:'Fee allocation policy'}).click();await expect(page.getByTestId('fee-policy')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});



