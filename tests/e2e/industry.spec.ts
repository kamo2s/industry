import { test,expect } from '@playwright/test';
import sharp from 'sharp';
test('home, discovery, marketplace and core pages have no console errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const path of ['/','/agents','/agents/pulse','/marketplace','/docs','/settings','/dashboard','/activity','/debug']){
    await page.goto(path);await expect(page.locator('h1')).toBeVisible();await expect(page.locator('.loading')).toHaveCount(0);await expect(page.locator('.notice.error')).toHaveCount(0);
  }
  await page.goto('/agents?q=PULSE');await expect(page.locator('.agent-grid .agent-card')).toHaveCount(1);await page.getByRole('button',{name:'Table view'}).click();await expect(page.getByRole('table')).toBeVisible();
  expect(errors).toEqual([]);
});
test('signed development wallet, seven-step launch, worker execution, purchase, policy and funding',async({page})=>{
  const name='QA WORKER '+Date.now().toString().slice(-6);
  await page.goto('/launch');await page.getByRole('button',{name:'Connect Wallet',exact:true}).click();await page.getByRole('button',{name:'Use a development wallet'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const launchKey=await page.evaluate(()=>localStorage.getItem('industry-launch-key'));
  await page.reload();expect(await page.evaluate(()=>localStorage.getItem('industry-launch-key'))).toBe(launchKey);
  const icon=await sharp({create:{width:32,height:32,channels:4,background:'#49f2a1'}}).png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({name:'qa-icon.png',mimeType:'image/png',buffer:icon});await expect(page.getByText('Image uploaded.',{exact:true})).toBeVisible();
  await page.getByLabel('Agent name',{exact:true}).fill(name);await page.getByLabel('Token ticker',{exact:true}).fill('QATEST');await page.getByLabel('One-line description').fill('Collect and organize public source evidence for technology research.');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Full mission').fill('Research public technology documentation and return structured evidence with sources.');await page.getByLabel('Input scope / topics').fill('Solana public documentation');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('Service name',{exact:true}).fill('QA research '+name);await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Create Agent',exact:true}).click();
  await expect(page).toHaveURL(/\/agents\/qa-worker/);await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await expect(page.locator('.job-list .badge').first()).toHaveText('succeeded',{timeout:20000});
  await page.getByRole('tab',{name:'MEMORY',exact:true}).click();await expect(page.locator('.memory-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();await page.getByRole('button',{name:'Resume',exact:true}).click();
  await page.getByRole('button',{name:'Fund Compute',exact:true}).click();await page.getByLabel('Amount (test USDC)').fill('2');await page.getByRole('button',{name:'Add Test Funding'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Agent settings',exact:true}).click();await page.getByLabel('Allow automatic agent hiring').check();await page.getByRole('button',{name:'Save Policy'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab',{name:'SERVICES',exact:true}).click();await page.getByRole('button',{name:'Publish a Service'}).click();await page.getByLabel('Service name',{exact:true}).fill('Additional '+name);await page.getByLabel('Description',{exact:true}).fill('A second service backed by the same bounded worker runtime.');await page.getByRole('button',{name:'Publish Service',exact:true}).click();await expect(page.locator('.service-card')).toHaveCount(2);
  await page.goto('/marketplace');await page.getByLabel('Search services').fill('QA research '+name);await page.getByRole('button',{name:'Hire',exact:true}).click();await page.getByLabel('What should the agent work on?').fill('Research official Solana documentation.');await page.getByRole('button',{name:/Request service/}).click();await expect(page).toHaveURL(/\/jobs\//);await expect(page.getByRole('heading',{name:'Work, delivered.'})).toBeVisible({timeout:20000});await expect(page.getByText('settled',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Sources & evidence'})).toBeVisible();
  await page.goto('/marketplace');await page.getByLabel('Search services').fill('Verify a claim');await page.getByRole('button',{name:'Hire',exact:true}).click();await page.getByLabel('What should the agent work on?').fill('Review public Solana documentation.');await expect(page.getByLabel('Pay as')).toBeVisible();const option=await page.getByLabel('Pay as').locator('option').filter({hasText:name}).getAttribute('value');await page.getByLabel('Pay as').selectOption(option!);await page.getByRole('button',{name:/Request service/}).click();await expect(page.getByRole('heading',{name:'Work, delivered.'})).toBeVisible({timeout:20000});
  await page.goto('/dashboard');await expect(page.locator('.agent-card').filter({hasText:name})).toBeVisible();await expect(page.getByText('Verify a claim',{exact:true})).toBeVisible();
});
test('mobile navigation and responsive layouts fit the viewport',async({page})=>{
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:width===390?844:1024});await page.goto('/');await expect(page.locator('.featured .agent-card').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Marketplace',exact:true}).click();await expect(page.getByRole('heading',{name:'Work, on demand.'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('API enforces CSRF and authentication, rejects unsafe images',async({request,page})=>{
  const csrf=await request.post('/api/agents',{data:{name:'blocked'},headers:{Origin:'https://untrusted.example'}});expect(csrf.status()).toBe(403);
  const unauth=await request.post('/api/agents',{data:{name:'blocked'},headers:{Origin:'http://localhost:3000','Idempotency-Key':crypto.randomUUID()}});expect(unauth.status()).toBe(401);
  await page.goto('/settings');await page.getByRole('button',{name:'Connect Wallet',exact:true}).last().click();await page.getByRole('button',{name:'Use a development wallet'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const response=await page.evaluate(async()=>{const form=new FormData();form.set('file',new File(['<script>alert(1)</script>'],'unsafe.svg',{type:'image/svg+xml'}));return (await fetch('/api/uploads',{method:'POST',body:form})).status;});expect(response).toBe(400);
});
