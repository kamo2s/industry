import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('retired Network links redirect while profile relationships and coin artwork remain usable',async({page,request})=>{
  test.setTimeout(150000);
  // Keep the gently drifting homepage link stable for repeatable click/capture QA.
  await page.emulateMedia({reducedMotion:'reduce'});
  const out='qa/network-removal';await mkdir(out,{recursive:true});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const old=await request.get('/network',{maxRedirects:0});
  expect(old.status()).toBe(307);expect(old.headers().location).toBe('/coins');
  // This endpoint also supplies the homepage globe and profile relationships.
  const graph=await request.get('/api/network/graph?days=7');
  expect(graph.ok()).toBe(true);expect((await graph.json()).nodes.length).toBeGreaterThan(0);

  // Pass 1: homepage purpose and destinations at the normal desktop width.
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.locator('.globe.is-ready')).toBeVisible();
  await expect(page.locator('.loading')).toHaveCount(0);
  await expect(page.locator('.notice.error')).toHaveCount(0);
  const nav=page.getByRole('navigation',{name:'Primary navigation'});
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(page.locator('a[href="/network"]')).toHaveCount(0);
  await expect(page.locator('.network-overlay')).toHaveAttribute('href','/activity');
  await expect(page.getByRole('link',{name:'Explore economy',exact:true})).toHaveAttribute('href','/economy');
  await page.screenshot({path:out+'/pass-1-home-1440.png',fullPage:true,animations:'disabled'});
  await page.locator('.network-overlay').click();
  await expect(page).toHaveURL(/\/activity$/);await expect(page.locator('.loading')).toHaveCount(0);

  // Pass 2: desktop spacing and shared portrait styling after CSS extraction.
  await page.setViewportSize({width:1920,height:1080});await page.goto('/network');
  await expect(page).toHaveURL(/\/coins$/);await page.getByRole('button',{name:'List view',exact:true}).click();await expect(page.locator('.terminal-table tbody tr').first()).toBeVisible();
  await expect(page.locator('.coin-portrait').first()).toHaveCSS('border-radius','50%');
  await page.screenshot({path:out+'/pass-2-coins-1920.png',fullPage:true,animations:'disabled'});
  await page.goto('/agents/pulse?tab=network');
  await expect(page.locator('.business-graph')).toBeVisible();
  await expect(page.locator('.flow-focus .coin-portrait')).toBeVisible();
  await expect(page.locator('.notice.error')).toHaveCount(0);
  await page.screenshot({path:out+'/pass-2-profile-1920.png',fullPage:true,animations:'disabled'});

  // Pass 3: mobile drawer, navigation and profile continuity.
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.locator('.globe.is-ready')).toBeVisible();
  await expect(page.locator('.loading')).toHaveCount(0);
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await expect(nav.getByRole('link',{name:'Network',exact:true})).toHaveCount(0);
  await expect(nav.getByRole('link',{name:'Launch',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:out+'/pass-3-menu-390.png',animations:'disabled'});
  await nav.getByRole('link',{name:'Coins',exact:true}).click();
  await expect(page).toHaveURL(/\/coins$/);await expect(page.locator('.nav.open')).toHaveCount(0);
  await expect(page.locator('.loading')).toHaveCount(0);
  await page.screenshot({path:out+'/pass-3-coins-390.png',fullPage:true,animations:'disabled'});
  await page.goto('/agents/pulse?tab=network');await expect(page.locator('.business-graph')).toBeVisible();
  await expect(page.locator('.notice.error')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:out+'/pass-3-profile-390.png',fullPage:true,animations:'disabled'});
  expect(errors).toEqual([]);
});


