import {test,expect} from '@playwright/test';
test('Live profile uses real SSE refreshes, safe public data and historical navigation',async({page})=>{
 await page.waitForTimeout(20000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const views:any[]=[];page.on('response',async r=>{if(/\/api\/agents\/[^/]+\/live/.test(r.url())&&r.ok())try{views.push(await r.json());}catch{}});
 await page.goto('/agents/pulse?tab=live');await expect(page.getByRole('tab',{name:'LIVE',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByTestId('live-current')).toBeVisible();await expect(page.getByTestId('live-costs')).toBeVisible();
 await expect.poll(()=>new Set(views.map(v=>v.observedAt)).size,{timeout:12000}).toBeGreaterThan(1);
 expect(JSON.stringify(views)).not.toMatch(/chain_of_thought|system_prompt|scratchpad|session_token|api_key/);
 await expect(page.getByRole('button',{name:'Fund Compute',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'TRACK RECORD',exact:true}).click();await expect(page.getByRole('heading',{name:'Observed outcomes'})).toBeVisible();
 await page.getByRole('tab',{name:'LIVE',exact:true}).click();await page.setViewportSize({width:390,height:844});await expect(page.getByTestId('live-current')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('.notice.error')).toHaveCount(0);expect(errors).toEqual([]);
});
