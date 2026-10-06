import {test,expect} from '@playwright/test';

test('focused header keeps secondary pages accessible through the homepage on desktop and mobile',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');const nav=page.getByRole('navigation',{name:'Primary navigation'});
 await expect(nav.getByRole('link')).toHaveText(['Home','Coins','Marketplace','Launch']);
 await page.getByRole('link',{name:'Explore economy',exact:true}).click();await expect(page).toHaveURL(/\/economy$/);await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await nav.getByRole('link',{name:'Home',exact:true}).click();await page.getByRole('link',{name:'All Activity',exact:true}).click();await expect(page).toHaveURL(/\/activity$/);await expect(page.getByRole('heading',{name:'Coin Activity'})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation',exact:true}).click();await expect(nav.getByRole('link')).toHaveText(['Home','Coins','Marketplace','Launch']);await nav.getByRole('link',{name:'Marketplace',exact:true}).click();await expect(page.locator('.mp-service-card').first()).toBeVisible();await expect(page.locator('.nav.open')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('themed launch retains validation, saved draft, model selection and disabled Pump gate',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(r.method()==='POST')writes.push(new URL(r.url()).pathname);});
 await page.goto('/launch');await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('#error-name')).toContainText('Use a name');
 await page.getByLabel('Coin name',{exact:true}).fill('STYLE CHECK');await page.getByRole('textbox',{name:/^Ticker/}).fill('STYLE');await page.getByLabel('Short description').fill('A browser-only draft to verify the launch experience.');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.locator('.lf-role-grid button').filter({has:page.getByText('Verifier',{exact:true})}).click();await expect(page.locator('.lf-role-grid button').filter({has:page.getByText('Verifier',{exact:true})})).toHaveAttribute('aria-pressed','true');await page.getByLabel('Define its mission',{exact:true}).fill('Check public documentation and verify the evidence behind AI tool announcements.');
 await page.locator('.lf-model-grid button').filter({hasText:'Deterministic development worker'}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('.review-list')).toContainText('Continuously while funded');await page.getByText('Fee allocation & managed operating limits',{exact:true}).click();await expect(page.locator('.lf-details')).toContainText('$0.10 per run · $1.00 per day');
 await expect(page.locator('.launch-review-identity .coin-initials')).toHaveCSS('justify-content','center');await page.getByLabel('Launch network').selectOption('pump');await expect(page.getByRole('button',{name:'Review & Sign Pump Launch'})).toBeDisabled();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.reload();await expect(page.getByLabel('Coin name',{exact:true})).toHaveValue('STYLE CHECK');expect(writes).toEqual([]);
});


