import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('real directory filters, sort, view and Coin links preserve stored values',async({page,request})=>{
 const coins=await (await request.get('/api/agents')).json(),catalog=await (await request.get('/api/models')).json();
 await page.goto('/coins');await expect(page.locator('.cd-card')).toHaveCount(Math.min(20,coins.length));
 if(coins.length>20){const first=await page.locator('.cd-card h2').first().textContent();await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page).toHaveURL(/page=2/);await expect(page.locator('.cd-card h2').first()).not.toHaveText(first!);await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(page.locator('.cd-card h2').first()).toHaveText(first!);}
 const sidebar=page.locator('.cd-sidebar');
 await sidebar.getByRole('button',{name:/^Researcher/}).click();await sidebar.getByRole('button',{name:/^OpenAI/}).click();await sidebar.getByRole('button',{name:/^Active/}).click();
 const expected=coins.filter((a:any)=>a.job_type==='Researcher'&&catalog.models.some((m:any)=>m.id===a.config.brain&&m.provider.toLowerCase()==='openai')&&!a.paused&&!a.terminated_at&&a.health!=='ERROR'&&a.operational?.state!=='ERROR'&&!['SELF-SUSTAINING','DORMANT','LOW COMPUTE','BOOTING'].includes(a.metrics.lifecycle));
 await expect(page.locator('.cd-results-meta [role=status]')).toContainText(expected.length+' '+(expected.length===1?'Coin':'Coins'));
 await expect(page.locator('.cd-card')).toHaveCount(Math.min(20,expected.length));
 await sidebar.getByRole('button',{name:'Clear filters',exact:true}).click();await page.getByLabel('Search coins',{exact:true}).fill('PULSE');await expect(page.locator('.cd-card')).toHaveCount(1);
 await expect(page.locator('.cd-card')).toContainText('Researcher');await expect(page.locator('.cd-card .cd-card-metrics dd').nth(1)).toHaveText(String(coins.find((a:any)=>a.slug==='pulse').metrics.jobs));
 await page.getByRole('button',{name:'List view',exact:true}).click();await expect(page.locator('.terminal-table tbody tr')).toHaveCount(1);
 await page.getByLabel('Search coins',{exact:true}).fill('');await page.getByLabel('Sort coins').selectOption('Revenue');
 const revenues=await page.locator('.terminal-table tbody tr').evaluateAll(rows=>rows.map(r=>Number(r.children[5].textContent?.replace(/[^0-9.]/g,''))));expect(revenues).toEqual([...revenues].sort((a,b)=>b-a));
 await page.getByRole('button',{name:'Grid view',exact:true}).click();await page.getByLabel('Search coins',{exact:true}).fill('PULSE');await page.getByRole('link',{name:'Open PULSE Coin',exact:true}).click();await expect(page).toHaveURL(/\/coins\/pulse$/);
 await page.goto('/coins?category=Research');await expect(page.locator('.cd-card').first()).toBeVisible();await expect(page.locator('.cd-results-meta [role=status]')).toContainText(coins.filter((a:any)=>a.category==='Research').length+' Coins');await page.locator('.cd-sidebar').getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page).toHaveURL(/\/coins$/);
});

test('catalog facets, address search, market ranking, image failure and mobile keyboard states',async({page,request})=>{
 const base=(await (await request.get('/api/agents')).json())[0],models=[{id:'reviewed/a',name:'Reviewed A',provider:'openai',development:false},{id:'reviewed/b',name:'Reviewed B',provider:'openai',development:false}];
 const fixtures=[0,1,2].map(i=>({...base,id:`00000000-0000-4000-8000-00000000000${i}`,name:['A very long Coin business name that must remain contained','SECOND','THIRD'][i],ticker:['LONGTICKER','SECOND','THIRD'][i],slug:'fixture-'+i,icon_url:i===0?'/api/uploads/00000000-0000-4000-8000-000000000001':'',health:'HEALTHY',operational:null,terminated_at:null,paused:i===2,job_type:i===1?'Verifier':'Researcher',config:{...base.config,brain:models[i===1?1:0].id},token:i===1?{mint:'verified-mint-address',network:'mainnet-beta'}:null,market:i===1?{marketCap:42000,volume24h:1000,source:'UI fixture only',observedAt:new Date().toISOString()}:null,metrics:{...base.metrics,lifecycle:'ACTIVE',revenue7d:i+1,jobs7d:3-i}}));
 await page.route('**/api/agents',r=>r.fulfill({json:fixtures}));await page.route('**/api/models',r=>r.fulfill({json:{models}}));await page.route('**/api/network/images/*',r=>r.fulfill({status:404,body:''}));
 await page.goto('/coins');await expect(page.locator('.cd-card')).toHaveCount(3);
 await page.locator('.cd-sidebar').getByRole('button',{name:/^OpenAI/}).click();await page.getByLabel('Coin model',{exact:true}).selectOption('reviewed/b');await expect(page.locator('.cd-card')).toHaveCount(1);await expect(page.locator('.cd-card')).toContainText('SECOND');
 await page.locator('.cd-sidebar').getByRole('button',{name:'Clear filters',exact:true}).click();await page.getByLabel('Search coins',{exact:true}).fill('verified-mint-address');await expect(page.locator('.cd-card')).toHaveCount(1);await expect(page.locator('.cd-card .cd-card-metrics')).toContainText('$42,000');
 await page.getByRole('button',{name:'Clear search'}).click();await page.getByRole('button',{name:'Highest market cap',exact:true}).click();await expect(page.locator('.cd-card').first()).toContainText('SECOND');
 await page.getByRole('button',{name:'Most active',exact:true}).click();await expect(page.locator('.cd-card').first()).toContainText('A very long');await expect(page.locator('.cd-card').first().locator('.cd-artwork img')).toHaveCount(0);await expect(page.locator('.cd-card').first().getByLabel('LONGTICKER artwork placeholder')).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Filters',exact:true}).click();const drawer=page.getByRole('dialog');await expect(drawer).toBeVisible();await drawer.getByRole('button',{name:/^Paused/}).click();await expect(page.locator('.cd-card')).toHaveCount(1);await expect(page.locator('.cd-card')).toContainText('THIRD');
 await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(page.getByRole('button',{name:/^Filters/})).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:/^Filters/}).click();await drawer.getByRole('button',{name:'Clear filters',exact:true}).click();await drawer.getByRole('button',{name:'Show 3 Coins',exact:true}).click();await expect(page.locator('.cd-card')).toHaveCount(3);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.cd-card').first().hover();await expect(page.locator('.cd-card').first()).toHaveCSS('transform','none');
 await mkdir('qa/coins-directory/edge-states',{recursive:true});await page.screenshot({path:'qa/coins-directory/edge-states/mobile-fixture.png',fullPage:true});
});

test('progressive loading and request failure offer an honest retry',async({page})=>{
 let fail=true;
 await page.route('**/api/agents',async route=>{await new Promise(resolve=>setTimeout(resolve,700));if(fail)await route.fulfill({status:503,json:{error:{message:'Directory temporarily unavailable'}}});else await route.continue();});
 await page.goto('/coins');await expect(page.getByLabel('Loading Coin directory')).toBeVisible();await expect(page.locator('.coins-directory [role=alert]')).toContainText('Directory temporarily unavailable');await expect(page.getByRole('heading',{name:'No Coins match these filters'})).toHaveCount(0);
 await mkdir('qa/coins-directory/edge-states',{recursive:true});await page.screenshot({path:'qa/coins-directory/edge-states/error.png'});fail=false;await page.getByRole('button',{name:'Retry loading Coins'}).click();await expect(page.locator('.cd-card').first()).toBeVisible();await expect(page.locator('.coins-directory [role=alert]')).toHaveCount(0);
});


