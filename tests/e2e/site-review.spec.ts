import {test,expect} from '@playwright/test';

test('contrast preference survives reload, direct entry and cross-tab changes',async({page,context})=>{
 await page.goto('/settings');const toggle=page.getByRole('checkbox',{name:'Higher contrast labels'});
 await toggle.check();await expect(page.locator('body')).toHaveClass(/high-contrast/);
 await page.reload();await expect(toggle).toBeChecked();await expect(page.locator('body')).toHaveClass(/high-contrast/);
 const second=await context.newPage();await second.goto('/coins');await expect(second.locator('body')).toHaveClass(/high-contrast/);
 await toggle.uncheck();await expect(second.locator('body')).not.toHaveClass(/high-contrast/);
 await second.reload();await expect(second.locator('body')).not.toHaveClass(/high-contrast/);
});

test('wallet dialog contains keyboard focus, dismisses and restores the trigger',async({page})=>{
 await page.goto('/settings');const trigger=page.locator('header .wallet-button');await trigger.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeFocused();
 await page.keyboard.press('/');await expect(dialog).toBeFocused();await expect(page.locator('.header-find-results')).toHaveCount(0);
 const first=dialog.getByRole('button',{name:'Close wallet dialog'}),last=dialog.getByRole('button').last();
 await page.keyboard.press('Tab');await expect(first).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(last).toBeFocused();await page.keyboard.press('Tab');await expect(first).toBeFocused();
 await expect(page.locator('body')).toHaveCSS('overflow','hidden');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await expect(page.locator('body')).not.toHaveCSS('overflow','hidden');
 await page.setViewportSize({width:390,height:844});const menu=page.getByRole('button',{name:'Open navigation'});await menu.click();await expect(page.getByRole('button',{name:'Close navigation'})).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Escape');await expect(menu).toBeFocused();await expect(menu).toHaveAttribute('aria-expanded','false');
});

test('settings remain usable when persistent browser storage is blocked',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new DOMException('Blocked','SecurityError');};Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError');};});
 await page.goto('/settings');await page.getByRole('checkbox',{name:'Higher contrast labels'}).check();await expect(page.locator('body')).toHaveClass(/high-contrast/);expect(errors).toEqual([]);
});
