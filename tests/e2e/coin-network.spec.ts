import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('relationship direction, unique counts, sorting, paging, search and artwork remain accurate',async({page,request})=>{
 const coins=await(await request.get('/api/coins')).json(),pulse=coins.find((c:any)=>c.slug==='pulse'),artwork=coins.find((c:any)=>c.name==='cxzczxdd');
 expect(pulse).toBeTruthy();expect(artwork?.icon_url).toBeTruthy();
 const root={id:pulse.id,name:pulse.name,slug:pulse.slug,ticker:pulse.ticker,role:pulse.job_type},nodes=[root,...Array.from({length:5},(_,i)=>({id:'fixture-'+i,name:'Connection '+i,slug:'fixture-'+i,ticker:'C'+i,role:'Researcher'})),{id:artwork.id,name:artwork.name,slug:artwork.slug,ticker:artwork.ticker,role:artwork.job_type,image_url:artwork.icon_url}];
 const edges=nodes.slice(1).map((n,i)=>({source:pulse.id,target:n.id,jobs:i+1,volume:(6-i)/100,last_at:'2026-10-05T00:00:00Z',last_job_id:null}));
 edges.push({source:nodes[1].id,target:pulse.id,jobs:2,volume:.03,last_at:'2026-10-05T00:00:00Z',last_job_id:null});
 // Explicit UI-only fixture. It never writes invented relationships to the ledger.
 await page.route('**/api/network/graph?**',route=>route.fulfill({json:{nodes,edges,days:7,limit:60}}));
 await page.goto('/coins/pulse?tab=network');
 const screen=page.getByRole('region',{name:'Coin business connections'}),details=page.getByRole('complementary',{name:'Relationship details'});
 await expect(screen.locator('.cn-metrics strong')).toHaveText(['6','$0.030','$0.210','23']);
 await page.getByRole('button',{name:'Inspect customer Connection 0',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(details).toContainText('Connection 0 paid PULSE');
 await expect(details).toContainText('Payments received');
 await expect(details.getByRole('link',{name:'View latest receipt'})).toHaveCount(0);
 await page.getByRole('button',{name:'Next suppliers',exact:true}).click();
 await expect(page.getByRole('button',{name:'Inspect supplier Connection 3',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(details).toContainText('PULSE paid Connection 3');
 await page.getByRole('group',{name:'Rank connections by'}).getByRole('button',{name:'Jobs',exact:true}).click();
 await expect(page.getByRole('group',{name:'Suppliers',exact:true}).getByRole('button').first()).toHaveAttribute('aria-label','Inspect supplier '+artwork.name);
 await expect(page.locator('.cn-partner img').first()).toHaveCSS('opacity','1');
 await expect(details.locator('.coin-portrait img')).toHaveCSS('opacity','1');
 await page.getByLabel('Search connected Coins').fill('C0');
 await expect(page.getByRole('button',{name:/Inspect (customer|supplier) Connection 0/})).toHaveCount(2);
 await expect(screen.locator('.cn-metrics strong').first()).toHaveText('6');
 await page.getByRole('button',{name:'Clear connection search'}).click();
 const out='qa/coin-network/edge-states';await mkdir(out,{recursive:true});
 for(const [width,height] of [[1440,1000],[1920,1080],[390,844]]){
  await page.setViewportSize({width,height});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await screen.screenshot({path:out+'/populated-fixture-'+width+'.png'});
 }
 // Long business names and a failed image must not distort the network.
 root.name='NORTHSTAR RESEARCH COLLECTIVE';
 await page.route('**'+artwork.icon_url,route=>route.fulfill({contentType:'image/webp',body:Buffer.from('invalid image fixture')}));
 await page.reload();
 await page.getByRole('group',{name:'Rank connections by'}).getByRole('button',{name:'Jobs',exact:true}).click();
 const imageButton=page.getByRole('button',{name:'Inspect supplier '+artwork.name,exact:true});
 await expect(imageButton.locator('.coin-initials')).toBeVisible();
 await expect(imageButton.locator('img')).toHaveCount(0);
 await expect(page.locator('.cn-hub-name h3')).toHaveAttribute('title',root.name);
 for(const [width,height] of [[1440,1000],[390,844]]){
  await page.setViewportSize({width,height});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await screen.screenshot({path:out+'/long-name-fallback-fixture-'+width+'.png'});
 }
});

test('loading and unavailable graph states stay honest and can recover',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let unavailable=true;
 await page.route('**/api/network/graph?**',async route=>{await gate;if(unavailable)await route.fulfill({status:503,json:{error:{message:'Connections temporarily unavailable'}}});else await route.continue();});
 await page.goto('/coins/pulse?tab=network');
 const screen=page.getByRole('region',{name:'Coin business connections'});
 await expect(screen.getByRole('status',{name:'Loading data'})).toBeVisible();
 await expect(screen.locator('.cn-metrics')).toHaveCount(0);release();
 await expect(screen.getByRole('alert')).toContainText('Connections temporarily unavailable');
 await expect(screen.locator('.cn-metrics')).toHaveCount(0);
 unavailable=false;await screen.getByRole('button',{name:'Retry connections'}).click();
 await expect(screen.locator('.cn-metrics strong').first()).toHaveText('1');
 await expect(screen.getByRole('alert')).toHaveCount(0);
});
