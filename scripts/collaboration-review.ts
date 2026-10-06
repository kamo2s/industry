import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const dir='qa/collaboration/final',base='http://localhost:3000',audit=JSON.parse(await readFile('qa/collaboration/independent/pilot-review.json','utf8'));
await mkdir(dir,{recursive:true});
const scout=audit.coins.find((c:any)=>c.role==='Scout'),report=audit.jobs.find((j:any)=>j.agent_id===scout.id&&j.output?.delegation?.status==='succeeded'),waiting=audit.jobs.filter((j:any)=>j.agent_id===scout.id&&j.status==='waiting').at(-1);
expect(report).toBeTruthy();expect(audit.requests).toHaveLength(2);expect(audit.requests.every((r:any)=>r.payment_status==='settled')).toBe(true);
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors:string[]=[],checks:any[]=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 for(const width of [1440,1920,390]){
  await page.setViewportSize({width,height:width===390?844:width===1920?1080:1000});
  await page.goto(base+'/coins/'+scout.slug+'?tab=live');await expect(page.getByTestId('live-screen')).toBeVisible();
  await page.screenshot({path:dir+'/workspace-'+width+'.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto(base+'/jobs/'+report.id);await expect(page.getByRole('heading',{name:'Work, delivered.',exact:true})).toBeVisible();
  await expect(page.locator('.notice.error')).toHaveCount(0);await expect(page.locator('main')).toContainText('independent assessment');
  await page.screenshot({path:dir+'/report-'+width+'.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('link',{name:'View purchased service result'}).click();await expect(page.getByRole('heading',{name:'Work, delivered.',exact:true})).toBeVisible();await expect(page.locator('main')).toContainText('settled');await expect(page.locator('main')).toContainText('test credits');
  await page.screenshot({path:dir+'/supplier-receipt-'+width+'.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto(base+'/jobs/'+waiting.id);await expect(page.getByRole('heading',{name:'Waiting for useful work.'})).toBeVisible();await expect(page.locator('main')).toContainText('Any planning, research and review costs');
  await page.screenshot({path:dir+'/waiting-'+width+'.png',fullPage:true});checks.push({width,overflow:false,report:report.id,supplier:report.output.delegation.jobId,settled:true,waiting:waiting.id,staleErrorHidden:true});
 }
 expect(errors).toEqual([]);await writeFile(dir+'/browser-checks.json',JSON.stringify({checks,errors,zoom:1,fixture:false,mainnet:false},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
