import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
const load=async(n:string)=>JSON.parse(await readFile('qa/coin-profile/'+n+'.json','utf8'));
test('real single profile navigation, old URLs, services, outputs and measured charts',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/coins/pulse');await expect(page.locator('.cp-heading h1')).toHaveText('PULSE');
 await expect(page.getByRole('tablist')).toHaveCount(0);await expect(page.getByRole('navigation').getByRole('link',{name:'Coins',exact:true})).toHaveClass('active');
 await page.getByRole('link',{name:'Watch live',exact:true}).click();await expect(page).toHaveURL(/#live$/);await expect(page.locator('#live')).toBeFocused();
 await page.goto('/agents/pulse?tab=financials');await expect(page).toHaveURL(/\/coins\/pulse#performance$/);await expect(page.getByRole('heading',{name:'Business & Performance'})).toBeVisible();
 await page.getByLabel('Chart period').selectOption('30');await expect(page.locator('.cp-footnote').filter({hasText:'Charts: 30 UTC'})).toBeVisible();
 await expect(page.locator('#services .cp-service')).not.toHaveCount(0);const service=page.locator('#services a.button').first();const href=await service.getAttribute('href');await service.click();await expect(page).toHaveURL(new RegExp(href!));
 await page.goto('/coins/pulse?tab=track-record');await expect(page).toHaveURL(/#outputs$/);await expect(page.locator('.cp-output').first()).toBeVisible();await page.locator('.cp-output').first().click();await expect(page).toHaveURL(/\/jobs\//);
 await page.goto('/coins/pulse?tab=activity');await expect(page.locator('.cp-activity li').first()).toBeVisible();const before=await page.locator('.cp-activity li').count();await page.getByRole('button',{name:'Show more activity'}).click();expect(await page.locator('.cp-activity li').count()).toBeGreaterThan(before);
 await expect(page.getByText('Owner account details',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/Buy|Hire|Run now|Pause Coin/})).toHaveCount(0);
 expect(errors).toEqual([]);
});
test('real retained browser frames, replay, zoom and fullscreen',async({page})=>{
 await page.goto('/coins/review-verifier-76c4aa#live');const screen=page.locator('.coin-browser');await expect(screen.locator('.browser-pixels img')).toHaveAttribute('data-loaded','true');await expect(page.getByTestId('browser-signal')).toHaveText('LAST CAPTURE');
 await page.getByRole('button',{name:'Browser capture 1',exact:true}).click();await expect(page.getByRole('button',{name:'Browser capture 1',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Replay captures'}).click();await expect(page.getByRole('button',{name:'Pause replay'})).toBeVisible();await page.waitForTimeout(2200);await expect(page.getByRole('button',{name:'Browser capture 2',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Zoom page',exact:true}).click();await expect(page.locator('.browser-pixels')).toHaveClass(/is-zoomed/);await page.getByRole('button',{name:'Fit page to screen'}).click();
 await page.getByRole('button',{name:'Expand screen'}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await page.evaluate(()=>document.exitFullscreen());
 await page.getByRole('button',{name:'Follow latest'}).click();await expect(page.getByRole('button',{name:'Follow latest'})).toHaveCount(0);
});
test('automatic workspace modes, private browser and sparse profile (isolated UI fixtures)',async({page})=>{
 const base=await load('gold-live'),state=structuredClone(base);state.operation.status='running';state.operation.error=null;state.operation.finishedAt=null;state.operation.stage='SEARCH';state.status={state:'SEARCHING',active:true};state.operation.searches=[{type:'SEARCH_STARTED',data:{query:'Review fixture: public documentation',provider:'Recorded search provider'}}];state.operation.sources=[];state.operation.captures=[];state.lastBrowserSession=null;
 await page.route('**/api/agents/*/live*',r=>r.fulfill({json:state}));
 await page.goto('/coins/gold-7ed0ed');await expect(page.getByTestId('workspace-mode')).toHaveText('SEARCH');await expect(page.getByText('Review fixture: public documentation')).toBeVisible();await expect(page.locator('.browser-pixels')).toHaveCount(0);
 await mkdir('qa/coin-profile/states',{recursive:true});
 for(const [stage,mode] of [['SEARCH','SEARCH'],['SOURCE INSPECTION','FETCH'],['WAITING FOR SUPPLIER','SUPPLIER'],['SYNTHESIZING','SYNTHESIS'],['BROWSER','BROWSER']] ){
 state.operation.stage=stage;state.operation.events=[{id:'fixture-'+mode,type:mode+'_STARTED',at:new Date().toISOString(),summary:'Review fixture: '+mode.toLowerCase()+' in progress.',data:{}}];state.operation.next='Awaiting the recorded '+mode.toLowerCase()+' result.';state.operation.browser=stage==='BROWSER'?{state:'RUNNING'}:null;state.operation.chain=base.operation.chain.map((n:any)=>({...n,status:'running',paymentStatus:'reserved',completedAt:null}));await page.reload();await expect(page.getByTestId('workspace-mode')).toHaveText(mode);await page.waitForTimeout(250);await page.locator('#live').screenshot({path:'qa/coin-profile/states/fixture-'+mode.toLowerCase()+'.png'});
 }
 state.operation.privateEvidence=true;await page.reload();await expect(page.getByText('This session is private.',{exact:true})).toBeVisible();await expect(page.getByTestId('browser-signal')).toHaveText('PRIVATE');await expect(page.locator('.browser-pixels img')).toHaveCount(0);
 state.operation.privateEvidence=false;state.operation.status='succeeded';state.operation.stage='COMPLETED';state.operation.browser=null;state.operation.output={summary:'Review fixture: a completed report.',sources:0};state.operation.finishedAt=new Date().toISOString();await page.goto('/coins/gold-7ed0ed?job='+state.operation.id+'#live');await expect(page.getByTestId('workspace-mode')).toHaveText('OUTPUT');await expect(page.getByText('Review fixture: a completed report.')).toBeVisible();await page.locator('#live').screenshot({path:'qa/coin-profile/states/fixture-output.png'});await page.getByRole('button',{name:'View evidence'}).click();await expect(page.getByTestId('workspace-mode')).toHaveText('EVIDENCE');await page.getByRole('button',{name:'Follow current work'}).click();await expect(page.getByTestId('workspace-mode')).toHaveText('OUTPUT');
 state.operation=null;state.recent=[];state.active=[];state.lastCompleted=null;state.status={state:'READY',active:false};await page.goto('/coins/gold-7ed0ed');await expect(page.getByText('Awaiting browser activity',{exact:true})).toBeVisible();await expect(page.getByTestId('browser-signal')).toHaveText('STANDBY');await expect(page.getByText('Actions appear when the Coin begins working.')).toBeVisible();await page.locator('#live').screenshot({path:'qa/coin-profile/states/fixture-empty.png'});
});
test('mobile anchors, escaped long names and pump links without launching (isolated UI fixture)',async({page,context})=>{
 const d=await load('gold');d.agent.name='A very long Coin business name for narrow screens';d.agent.token={mint:'So11111111111111111111111111111111111111112',network:'mainnet-beta',launched_at:d.agent.created_at};d.agent.business={...d.agent.business,token_mode:'PUMP',routing_status:'VERIFIED'};d.agent.config.tokenMode='pump';d.own=false;
 await page.route('**/api/agents/gold-7ed0ed',r=>r.fulfill({json:d}));await page.setViewportSize({width:390,height:844});await page.goto('/coins/gold-7ed0ed');await expect(page.locator('.cp-heading h1')).toHaveText(d.agent.name);await page.getByRole('link',{name:'Watch live',exact:true}).click();await expect(page).toHaveURL(/#live$/);await page.locator('#details').scrollIntoViewIfNeeded();await expect(page.getByRole('link',{name:'Pump ↗',exact:true})).toHaveAttribute('href','https://pump.fun/coin/'+d.agent.token.mint);await expect(page.getByText('Owner account details',{exact:true})).toHaveCount(0);await context.grantPermissions(['clipboard-read','clipboard-write']);await page.getByRole('button',{name:'Copy mint',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Address copied'})).toBeVisible();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(d.agent.token.mint);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('profile watchlist and owner details remain permission-scoped (UI fixture)',async({page})=>{
 const d=await load('gold');d.own=true;let watched=false;
 await page.route('**/api/auth/session',r=>r.fulfill({json:{profile:{id:'profile-review',wallet:d.agent.creator_wallet,credits:0},demo:true}}));
 await page.route('**/api/agents/gold-7ed0ed',r=>r.fulfill({json:d}));await page.route('**/api/watchlist',r=>r.fulfill({json:watched?[d.agent]:[]}));await page.route('**/api/watchlist/set',r=>{watched=r.request().postDataJSON().watch;return r.fulfill({json:{ok:true}});});
 await page.goto('/coins/gold-7ed0ed');await page.getByRole('button',{name:'Add to watchlist',exact:true}).click();await expect(page.getByRole('button',{name:'Remove from watchlist',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Remove from watchlist',exact:true}).click();await expect(page.getByRole('button',{name:'Add to watchlist',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.getByText('Owner account details',{exact:true})).toBeVisible();
});
test('one lazy record read is shared and refreshes after completed work (UI fixture)',async({page})=>{
 const d=await load('profile-shape'),record=await load('record-shape');let reads=0;
 await page.addInitScript(()=>{(window as any).EventSource=class {addEventListener(type:string,fn:()=>void){if(type==='refresh'){fn();window.addEventListener('review-refresh',fn);}}close(){}};});
 await page.route('**/api/agents/pulse',r=>r.fulfill({json:d}));await page.route('**/api/agents/*/record',r=>{reads++;return r.fulfill({json:record});});
 await page.goto('/coins/pulse');await page.locator('#outputs').scrollIntoViewIfNeeded();await expect(page.locator('.cp-output').first()).toBeVisible();await expect(page.getByLabel('Chart period')).toBeVisible();expect(reads).toBe(1);
 d.agent.metrics.jobs++;await page.evaluate(()=>window.dispatchEvent(new Event('review-refresh')));await expect.poll(()=>reads).toBe(2);await expect(page.locator('.cp-output').first()).toBeVisible();
});
