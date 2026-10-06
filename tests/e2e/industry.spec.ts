import { test,expect } from '@playwright/test';
// Full document reloads intentionally exercise fresh SSE handshakes. Pace the
// browser suite within the production stream rate limit; never reset it for QA.
test.beforeEach(async({page})=>{await page.waitForTimeout(20000);});
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
test('home, discovery, marketplace and core pages have no console errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const path of ['/','/agents','/agents/pulse','/marketplace','/docs','/settings','/dashboard','/activity','/debug','/coins','/jobs','/economy']){
    await page.goto(path);await expect(page.locator('h1')).toBeVisible();await expect(page.locator('.loading')).toHaveCount(0);await expect(page.locator('.notice.error')).toHaveCount(0);
  }
  await page.goto('/agents?q=PULSE');await expect(page.locator('.terminal-table tbody tr')).toHaveCount(1);await expect(page.locator('.coin-cell strong')).toHaveText('PULSE');
  expect(errors).toEqual([]);
});
test('launch once, observe autonomous execution and reject creator commands',async({page})=>{
 test.setTimeout(120000);const name='QA COIN '+Date.now().toString().slice(-6);
 await page.goto('/launch');await page.getByRole('button',{name:'Connect Wallet',exact:true}).click();await page.getByRole('button',{name:'Use a development wallet'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const launchKey=await page.evaluate(()=>localStorage.getItem('industry-launch-key'));await page.reload();await expect(page.getByRole('button',{name:'My Industry',exact:true})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('industry-launch-key'))).toBe(launchKey);
 const icon=await sharp({create:{width:32,height:32,channels:4,background:'#49f2a1'}}).png().toBuffer();await page.locator('input[type=file]').setInputFiles({name:'qa-icon.png',mimeType:'image/png',buffer:icon});await expect(page.getByText('Image uploaded',{exact:true})).toBeVisible();
 await page.getByLabel('Coin name',{exact:true}).fill(name);await page.getByLabel('Ticker',{exact:false}).fill('QACOIN');await page.getByLabel('Short description').fill('Observe autonomous public documentation research.');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Review launch',exact:true}).click();await expect(page.locator('.guided-form [role=alert]')).toContainText('Tell your Coin what to work on');
 await page.getByLabel('What should your Coin work on?',{exact:false}).fill('Research official Solana documentation and return structured evidence with sources.');await page.getByText('Choose a brain and specialist activity',{exact:true}).click();await page.getByRole('combobox',{name:'AI model',exact:true}).selectOption('development/mock');
 await expect(page.getByLabel('Service name',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Review launch',exact:true}).click();await expect(page.getByText('$0.10 per run · $1.00 per day',{exact:true})).toBeVisible();await expect(page.getByText('Research a topic · $0.010 / request',{exact:true})).toBeVisible();await expect(page.locator('.launch-review-identity img')).toHaveCSS('opacity','1');await expect(page.locator('.launch-review-identity img')).toHaveAttribute('alt',name+' coin');
 await mkdir('qa/autonomous-coins/final-identity',{recursive:true});
 for(const width of [1440,1920,390]){await page.setViewportSize({width,height:width===390?844:width===1920?1080:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'qa/autonomous-coins/final-identity/launch-review-'+width+'.png',fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Create test Coin',exact:true}).click();
 await expect(page).toHaveURL(/\/coins\/qa-coin/);await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^(Pause|Resume|Fund Business|Agent settings|Run Now|Hire Agent)$/})).toHaveCount(0);
 await page.getByRole('tab',{name:'TRACK RECORD',exact:true}).click();await expect(page.locator('.record-row').first()).toBeVisible({timeout:30000});
 const result=await page.evaluate(async()=>{const slug=location.pathname.split('/').at(-1),c=await(await fetch('/api/coins/'+slug)).json();const paths=['/api/coins/'+c.agent.id+'/run','/api/agents/'+c.agent.id+'/pause','/api/coins/'+c.agent.id+'/fund','/api/work'];return Promise.all(paths.map(async path=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:'{}'});return {status:r.status,code:(await r.json()).error?.code};}));});expect(result).toEqual(Array(4).fill({status:403,code:'AUTONOMOUS_ONLY'}));
 await page.getByRole('tab',{name:'SERVICES',exact:true}).click();await expect(page.locator('.terminal-service')).toHaveCount(1);await expect(page.getByRole('button',{name:/Publish|Hire|Buy|Pay/})).toHaveCount(0);await page.getByRole('link',{name:'View service',exact:true}).click();await expect(page.getByRole('link',{name:'Watch live',exact:true})).toBeVisible();
 await page.goto('/dashboard');await expect(page.getByRole('tab',{name:'Created Coins',exact:true})).toBeVisible();await expect(page.locator('.owner-business').filter({hasText:name})).toBeVisible();await expect(page.getByRole('button',{name:/Manage|Pause|Run Now/})).toHaveCount(0);
});

test('mobile navigation and responsive layouts fit the viewport',async({page})=>{
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:width===390?844:1024});await page.goto('/');await expect(page.locator('.terminal-service').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Marketplace',exact:true}).click();await expect(page.getByRole('heading',{name:'Marketplace',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('API enforces CSRF and authentication, rejects unsafe images',async({request,page})=>{
  const csrf=await request.post('/api/agents',{data:{name:'blocked'},headers:{Origin:'https://untrusted.example'}});expect(csrf.status()).toBe(403);
  const unauth=await request.post('/api/agents',{data:{name:'blocked'},headers:{Origin:'http://localhost:3000','Idempotency-Key':crypto.randomUUID()}});expect(unauth.status()).toBe(401);
  await page.goto('/settings');await expect(page.locator('header').getByRole('button',{name:'Connect Wallet',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Connect Wallet',exact:true}).last().click();await page.getByRole('button',{name:'Use a development wallet'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const response=await page.evaluate(async()=>{const form=new FormData();form.set('file',new File(['<script>alert(1)</script>'],'unsafe.svg',{type:'image/svg+xml'}));return (await fetch('/api/uploads',{method:'POST',body:form})).status;});expect(response).toBe(400);
});
