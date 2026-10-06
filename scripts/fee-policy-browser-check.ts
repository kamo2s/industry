import { chromium,expect } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { defaultFeePolicy,splitFeeReceipt } from '../packages/core/fee-policy';
const dir='qa/fee-economics';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({baseURL:'http://localhost:3000',viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors:string[]=[],shots:any[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function policy(){const view=page.getByTestId('fee-policy');await expect(view).toContainText('Approved V1 defaults');const rows=view.locator('tbody tr');await expect(rows).toHaveCount(3);await expect(rows.nth(0)).toContainText('60%40%0%');await expect(rows.nth(1)).toContainText('40%60%0%');await expect(rows.nth(2)).toContainText('20%65%15%');}
async function shot(name:string){await policy();await expect(page.locator('.loading')).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();scrollTo(0,0);});await expect(page.locator('#main')).toHaveCSS('opacity','1');await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});shots.push({name,...await page.evaluate(()=>({zoom:visualViewport?.scale,overflow:document.documentElement.scrollWidth>innerWidth}))});}
await page.goto('/economy');expect(await (await page.request.get('/api/treasury/policy')).json()).toMatchObject({source:'v1-default',policy:defaultFeePolicy});await policy();await shot('economy-desktop');
await page.setViewportSize({width:390,height:844});await shot('economy-mobile');await page.setViewportSize({width:1440,height:1000});
await page.getByRole('button',{name:'Connect Wallet',exact:true}).click();await page.getByRole('button',{name:'Use a development wallet'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Launch',exact:true}).click();
await page.getByLabel('Business name',{exact:true}).fill('FEE REVIEW');await page.getByLabel('Token ticker',{exact:true}).fill('FREVIEW');await page.getByLabel('One-line description').fill('Review finalized fee economics without launching a business.');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Deterministic development worker/}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await policy();await shot('launch-economics');
await page.goto('/agents/pulse?tab=financials');await page.getByRole('tab',{name:'FINANCIALS',exact:true}).click();await policy();await shot('business-financials');
await page.goto('/docs');await policy();await shot('docs');
// Clearly scoped UI fixtures exercise panels unavailable without an actual Pump launch.
const allocation=splitFeeReceipt(95000000n,20000000n,defaultFeePolicy);
const fixture={business_id:'fixture',name:'PUMP QA FIXTURE',mint:'fixture-mint',routing_status:'VERIFIED',pending:'0.000000000',earned:'0.200000000',asset:'SOL',creditedUsd:'20.000000',usdUnit:'TEST_USDC',pendingConversion:0,awaitingPolicy:0,cumulativeCreatorFeesUsd:'115.000000',nextFeePhase:'ESTABLISHED',last_collection:new Date().toISOString(),collection_state:'idle',receipts:[{id:'fixture-receipt',normalized_amount:'0.200000000',signature:'UI fixture only — no chain transaction',slot:100,block_time:new Date().toISOString(),allocation_status:'ALLOCATED',phase:'MIXED',allocation,usd_value:'20000000',price_proof:{price:'10000000000',exponent:-8,publishTime:Math.floor(Date.now()/1000)}}]};
await page.route('**/api/admin/status',r=>r.fulfill({json:{settings:[],jobs:[],attempts:[],payments:[],reports:[],audit:[]}}));
await page.route('**/api/admin/pump-fees',r=>r.fulfill({json:{config:{collectionEnabled:false},businesses:[fixture]}}));
await page.goto('/admin');await policy();await expect(page.getByRole('button',{name:'Collect Now'})).toBeDisabled();await shot('admin-policy-ui-fixture');
await page.route('**/api/agents/pulse',async r=>{const response=await r.fetch(),json=await response.json();json.agent.config.tokenMode='pump';await r.fulfill({json});});
await page.route('**/api/agents/*/pump-fees',r=>r.fulfill({json:fixture}));
await page.goto('/agents/pulse?tab=financials');await page.getByRole('tab',{name:'FINANCIALS',exact:true}).click();await page.getByText('Receipt and price evidence',{exact:true}).click();await expect(page.getByRole('cell',{name:'$2.250000',exact:true})).toBeVisible();await shot('allocation-details-ui-fixture');
await page.setViewportSize({width:390,height:844});await shot('allocation-mobile-ui-fixture');
const config=await (await page.request.get('/api/pump/config')).json();expect(config.enabled).toBe(false);expect(config.collectionEnabled).toBe(false);
await browser.close();await writeFile(`${dir}/browser.json`,JSON.stringify({at:new Date().toISOString(),errors,shots,fixtureViews:['admin','Pump receipt detail'],transactionsSubmitted:0},null,2));expect(errors).toEqual([]);expect(shots.every(s=>s.zoom===1&&!s.overflow)).toBe(true);console.log(JSON.stringify({errors,shots}));
