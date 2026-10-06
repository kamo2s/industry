import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('Coin activity links work and slow refreshes never overlap',async({page})=>{
 await page.waitForTimeout(20000);
 let reads=0;
 await page.route('**/api/agents',async route=>{
  reads++;if(reads===1)await new Promise(resolve=>setTimeout(resolve,4200));
  await route.continue();
 });
 await page.goto('/coins');
 await expect(page.getByRole('heading',{name:'Coins',exact:true})).toBeVisible();
 await page.waitForTimeout(3500);expect(reads).toBe(1);
 await page.getByRole('button',{name:'List view',exact:true}).click();await expect(page.locator('.paired-agent').first()).toBeVisible();
 await page.getByLabel('Search coins').fill('PULSE');
 const link=page.getByRole('link',{name:'Open PULSE workspace',exact:true});
 await expect(link).toContainText('Researcher');await expect(link).toHaveAttribute('href','/coins/pulse?tab=live');
 await mkdir('qa/performance',{recursive:true});
 await page.screenshot({path:'qa/performance/paired-agent-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await link.scrollIntoViewIfNeeded();await page.screenshot({path:'qa/performance/paired-agent-mobile.png',fullPage:true});
 await link.click();await expect(page).toHaveURL(/coins\/pulse\?tab=live/);
 await expect(page.getByRole('tab',{name:'LIVE',exact:true})).toHaveAttribute('aria-selected','true');
});

test('six hidden tabs release live connections and a new tab remains responsive',async({context})=>{
 test.setTimeout(120000);
 await new Promise(resolve=>setTimeout(resolve,20000));
 // Headless pages are all reported visible by Chromium. Model the browser's
 // real visibility events explicitly; the network connections remain real.
 await context.addInitScript(()=>{
  let visibility='visible';
  Object.defineProperty(document,'visibilityState',{get:()=>visibility});
  (window as any).setTestVisibility=(value:string)=>{visibility=value;document.dispatchEvent(new Event('visibilitychange'));};
  const Native=window.EventSource;
  (window as any).liveOpen=0;
  window.EventSource=class extends Native {
   private closedForTest=false;
   constructor(url:string|URL,config?:EventSourceInit){super(url,config);(window as any).liveOpen++;}
   close(){if(!this.closedForTest){this.closedForTest=true;(window as any).liveOpen--;}super.close();}
  };
 });
 const tabs=[];let hiddenReads=0;
 for(let i=0;i<6;i++){
  const page=await context.newPage();tabs.push(page);
  await page.goto('/coins');await page.getByRole('button',{name:'List view',exact:true}).click();await expect(page.locator('.paired-agent').first()).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).liveOpen)).toBe(1);
  await page.evaluate(()=>(window as any).setTestVisibility('hidden'));
  await expect.poll(()=>page.evaluate(()=>(window as any).liveOpen)).toBe(0);
  page.on('request',r=>{if(r.url().endsWith('/api/agents'))hiddenReads++;});
 }
 await new Promise(resolve=>setTimeout(resolve,3500));expect(hiddenReads).toBe(0);
 const fresh=await context.newPage(),start=Date.now();await fresh.goto('/coins');
 await expect(fresh.locator('.paired-agent').first()).toBeVisible();
 const elapsed=Date.now()-start;console.log('Seventh tab interactive coin list:',elapsed,'ms');expect(elapsed).toBeLessThan(10000);
 await tabs[0].evaluate(()=>(window as any).setTestVisibility('visible'));
 await expect.poll(()=>hiddenReads).toBeGreaterThan(0);
 for(const tab of [...tabs,fresh])await tab.close();
});

