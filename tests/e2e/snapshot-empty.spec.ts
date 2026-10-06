import {test,expect} from '@playwright/test';

// Read-only UI fixtures: no Coin is launched or modified and no provider runs.
test('the viewing window survives empty history, non-browser work and private sessions',async({page,request})=>{
 const response=await request.get('/api/coins/trend/live');expect(response.ok()).toBe(true);
 const base=await response.json(),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 let state={...base,operation:null,lastBrowserSession:null,lastCompleted:null,recent:[],active:[]};
 await page.route(/\/api\/agents\/[^/]+\/live(?:\?|$)/,route=>route.fulfill({json:state}));
 await page.goto('/coins/trend');
 const screen=page.getByTestId('live-screen');
 await expect(screen.getByRole('heading',{name:'Awaiting browser activity'})).toBeVisible();
 await expect(screen.getByTestId('browser-signal')).toHaveText('STANDBY');
 await expect(screen.getByRole('button',{name:'Replay captures'})).toBeDisabled();
 await expect(screen.getByRole('button',{name:'Zoom page',exact:true})).toBeDisabled();
 await expect(screen.locator('.browser-pixels img')).toHaveCount(0);
 await expect(page.getByTestId('live-watch-now')).toBeVisible();
 await screen.getByRole('tab',{name:'Current work',exact:true}).click();
 await expect(screen).toContainText('No completed work yet');
 await screen.getByRole('tab',{name:'Live window',exact:true}).click();
 await expect(screen.getByRole('heading',{name:'Awaiting browser activity'})).toBeVisible();
 await page.getByRole('tab',{name:'LIVE',exact:true}).click();
 await expect(screen.getByRole('heading',{name:'Awaiting browser activity'})).toBeVisible();

 // A real runtime state can change without a navigation or an existing capture.
 const operation={...base.operation,status:'running',stage:'BROWSING',runId:'ui-fixture-run',captures:[],browser:{state:'RUNNING',url:'https://example.org/',title:'UI fixture'},privateEvidence:false};
 state={...base,status:{state:'WORKING',active:true},operation,lastBrowserSession:null};
 await expect(screen).toContainText('Waiting for the first browser capture.');
 await expect(screen.getByTestId('browser-signal')).toHaveText('STANDBY');
 await expect(screen.locator('.browser-pixels img')).toHaveCount(0);
 state={...state,operation:{...operation,privateEvidence:true,browser:null}};
 await expect(screen.getByRole('heading',{name:'This session is private.'})).toBeVisible();
 await expect(screen.getByTestId('browser-signal')).toHaveText('PRIVATE');
 await expect(screen).not.toContainText('https://example.org/');
 expect(errors).toEqual([]);
});
