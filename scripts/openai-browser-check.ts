import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const dir='qa/openai-live',actual=JSON.parse(await readFile(dir+'/ui-results.json','utf8'));
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({baseURL:'http://localhost:3000',viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors:string[]=[],shots:any[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function shot(name:string){await expect(page.locator('.loading')).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();scrollTo(0,0);});await expect(page.locator('#main')).toHaveCSS('opacity','1');await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});shots.push({name,...await page.evaluate(()=>({zoom:visualViewport?.scale,overflow:document.documentElement.scrollWidth>innerWidth}))});}
try{
 await page.goto('/settings');await expect(page.getByText('OpenAI — LIVE',{exact:true})).toBeVisible();await expect(page.getByText('OpenAI Web Search — LIVE',{exact:true})).toBeVisible();await expect(page.getByText('HTTPS Fetch — LIVE',{exact:true})).toBeVisible();await expect(page.getByText('Local Playwright — AVAILABLE',{exact:true})).toBeVisible();await expect(page.getByText('NOT CONFIGURED',{exact:true})).toHaveCount(2);await shot('providers-desktop');
 await page.setViewportSize({width:390,height:844});await shot('providers-mobile');await page.setViewportSize({width:1440,height:1000});
 await page.goto('/launch');await page.getByLabel('Business name',{exact:true}).fill('LIVE BRAIN REVIEW');await page.getByLabel('Token ticker',{exact:true}).fill('LBR');await page.getByLabel('One-line description').fill('Review the actual configured model catalog without creating a business.');await page.getByRole('button',{name:'Continue',exact:true}).click();
 const model=page.getByRole('button',{name:/GPT-6 Luna/});await expect(model).toHaveClass(/selected/);await expect(model).toContainText('$0.1 input / $0.5 output');await expect(model).toContainText('Structured output');await shot('launch-brain');await page.reload();await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByRole('button',{name:/GPT-6 Luna/})).toHaveClass(/selected/);
 // Render unmodified real receipts from the isolated acceptance database.
 // This route mapping is a UI test fixture, not an insertion into the app database.
 for(const job of actual.jobs)await page.route(`**/api/jobs/${job.id}`,route=>route.fulfill({json:job}));
 const scout=actual.jobs[0];await page.goto('/jobs/'+scout.id);await expect(page.getByRole('heading',{name:'Work, delivered.'})).toBeVisible();await expect(page.locator('.source-list a').first()).toHaveAttribute('href',/^https:\/\//);await expect(page.getByText('OpenAI · gpt-6-luna',{exact:true}).first()).toBeVisible();await shot('real-scout-receipt-export');
 await page.getByRole('link',{name:'View purchased service result'}).click();await expect(page.getByRole('heading',{name:'Work, delivered.'})).toBeVisible();await expect(page.getByText('settled',{exact:true})).toBeVisible();await shot('real-supplier-receipt-export');
 await page.setViewportSize({width:390,height:844});await shot('real-supplier-mobile-export');
 const config=await (await page.request.get('/api/pump/config')).json();expect(config.enabled).toBe(false);expect(config.collectionEnabled).toBe(false);
 expect(errors).toEqual([]);expect(shots.every(s=>s.zoom===1&&!s.overflow)).toBe(true);
 await writeFile(dir+'/browser.json',JSON.stringify({at:new Date().toISOString(),errors,shots,actualSettings:true,actualCatalog:true,receiptSource:actual.source,receiptRouteFixtures:actual.jobs.map((j:any)=>j.id),businessesCreated:0,providerCalls:0},null,2));console.log(JSON.stringify({errors,shots}));
}finally{await browser.close();}
