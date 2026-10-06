import {chromium,expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
expect.configure({timeout:15000});
const base='http://localhost:3000',dir='qa/workspace';await mkdir(dir,{recursive:true});
const owner=JSON.parse(await readFile('.data/live-operations-acceptance.json','utf8'));
async function api(path:string,input?:any,cookie?:string,method?:string){const r=await fetch(base+'/api/'+path,{method:method||(input===undefined?'GET':'POST'),headers:{...(input===undefined?{}:{'Content-Type':'application/json',Origin:base,'Idempotency-Key':randomUUID()}),...(cookie?{Cookie:cookie}:{})},body:input===undefined?undefined:JSON.stringify(input)});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}
const browser=await chromium.launch({channel:'msedge'}),ctx=await browser.newContext({deviceScaleFactor:1}),desktop=await ctx.newPage(),mobile=await ctx.newPage(),wide=await ctx.newPage(),pages=[desktop,wide,mobile];
await desktop.setViewportSize({width:1440,height:1000});await mobile.setViewportSize({width:390,height:844});await wide.setViewportSize({width:1920,height:1080});const suffix=(p:Page)=>p===mobile?'mobile':p===wide?'1920':'desktop';
const errors:string[]=[],screens:any[]=[],states:any[]=[];
for(const p of pages){p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});}
async function shot(p:Page,name:string){await expect(p.getByTestId('live-screen')).toBeVisible();await expect(p.locator('#main')).toHaveCSS('opacity','1');await p.evaluate(()=>document.fonts.ready);if(await p.locator('.workspace-stage').count())await expect(p.locator('.workspace-stage')).toHaveCSS('opacity','1');await expect(p.locator('[data-animating=true]')).toHaveCount(0);await p.locator('.browser-pixels img').evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>(img as HTMLImageElement).decode()));});await p.screenshot({path:dir+'/'+name+'.png',fullPage:true});screens.push({name,...await p.evaluate(()=>({zoom:visualViewport?.scale,overflow:document.documentElement.scrollWidth>innerWidth}))});}
let latest:any,restore:any;
try{
 if(process.argv.includes('--live')){
  const a=(await api('agents/'+owner.radar.id)).agent;
  // Preserve every configurable field. Permit one additional QA supplier purchase
  // within existing balances/run caps, then restore the original daily policy.
  const c=a.config;restore={mission:a.mission,jobType:a.job_type,scope:c.scope,domains:c.domains,brain:c.brain,tools:c.tools,policy:c.policy,schedule:'manual',intervalMinutes:c.intervalMinutes,publicOutput:c.publicOutput,outputFormat:c.outputFormat};
  await api('agents/'+a.id,{...restore,policy:{...c.policy,purchasesPerDay:Math.min(50,c.policy.purchasesPerDay+2)}},owner.buyer,'PATCH');
  desktop.on('response',async r=>{if(r.url().includes('/api/agents/'+a.id+'/live'))try{latest=await r.json();states.push({at:latest.observedAt,jobId:latest.operation?.id,stage:latest.operation?.stage,status:latest.operation?.status});}catch{}});
  await Promise.all(pages.map(p=>p.goto(base+'/agents/'+a.slug+'?tab=live')));
  const previous=(await api('agents/'+a.id+'/live')).operation?.id;
  await api('agents/'+a.id+'/run',{},owner.buyer);
  const captured=new Set<string>(),start=Date.now();
  while(Date.now()-start<150000){
   const o=latest?.operation;
   if(o&&o.id!==previous){
    const mode=(await desktop.getByTestId('workspace-mode').textContent())?.trim();
    if(mode&&!captured.has(mode)){captured.add(mode);await Promise.all(pages.map(p=>shot(p,'final-runtime-'+mode.toLowerCase()+'-'+suffix(p))));}
    if(o.status==='succeeded')break;
    if(o.status==='failed')throw new Error('Live research acceptance failed');
   }
   await desktop.waitForTimeout(200);
  }
  expect(latest.operation.id).not.toBe(previous);expect(latest.operation.status).toBe('succeeded');
  expect(latest.operation.chain[0].paymentStatus).toBe('settled');expect(captured.has('SEARCH')).toBe(true);expect(captured.has('SUPPLIER')).toBe(true);expect(captured.has('SYNTHESIS')).toBe(true);
  for(const p of pages){await p.getByTestId('live-supply').locator('summary').first().click();await shot(p,'final-runtime-supplier-complete-'+suffix(p));}
  await writeFile(dir+'/final-runtime-acceptance.json',JSON.stringify({jobId:latest.operation.id,states,screens,errors,cost:latest.operation.costs,supplier:latest.operation.chain.map((n:any)=>({name:n.name,status:n.status,paymentStatus:n.paymentStatus,jobId:n.jobId}))},null,2));
 }else{
  const b=JSON.parse(await readFile(dir+'/browser-acceptance.json','utf8'));
  for(const p of pages){await p.goto(base+'/agents/'+b.agent.slug+'?tab=live&job='+b.jobId);await p.getByRole('tab',{name:'Browser',exact:true}).click();await expect(p.locator('.browser-pixels img')).toBeVisible();await shot(p,'final-browser-'+suffix(p));}
  await desktop.getByRole('button',{name:'Replay captures',exact:true}).click();const before=await desktop.locator('.capture-thumbnails button[aria-pressed=true]').getAttribute('aria-label');await expect.poll(()=>desktop.locator('.capture-thumbnails button[aria-pressed=true]').getAttribute('aria-label')).not.toBe(before);await desktop.getByRole('button',{name:'Pause replay',exact:true}).click();
  for(const p of pages){await p.goto(base+'/agents/'+owner.radar.slug+'?tab=live&job=5f5e57b7-8c7e-458c-a7ed-5bdbb9e943e5');await expect(p.getByTestId('workspace-mode')).toContainText('ERROR');await shot(p,'final-error-'+suffix(p));}
  const agents=await api('agents');let low=agents.find((a:any)=>a.slug==='workspace-compute-check-8d307b')||agents.find((a:any)=>a.operational?.state==='LOW COMPUTE');if(!low){const c=agents.find((a:any)=>a.id===owner.radar.id).config;low=await api('agents',{...c,name:'WORKSPACE COMPUTE CHECK',ticker:'LOWCHECK',description:'Workspace acceptance with no funded compute. No provider calls are authorized.',mission:'Remain idle until compute is funded.',tools:[],schedule:'manual',initialBudget:0,initialOperatingBudget:0,policy:{...c.policy,autoHire:false}},owner.buyer);await expect.poll(async()=>(await api('agents/'+low.id+'/live')).status.state).toBe('LOW COMPUTE');}
  for(const p of pages){await p.goto(base+'/agents/'+low.slug+'?tab=live');await expect(p.getByTestId('live-screen')).toContainText('Compute funding is below');await shot(p,'final-low-compute-'+suffix(p));}
  await writeFile(dir+'/states-review.json',JSON.stringify({screens,errors,replayVerified:true,lowComputeAgent:low.slug},null,2));
 }
 expect(screens.every(s=>s.zoom===1&&!s.overflow)).toBe(true);expect(errors).toEqual([]);console.log(JSON.stringify({passed:true,screens:screens.map(s=>s.name),errors}));
}finally{if(restore)await api('agents/'+owner.radar.id,restore,owner.buyer,'PATCH');await browser.close();}
