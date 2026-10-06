import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {database,migrate,one,type Database} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {agentSchema,serviceSchema,defaultPolicy,templates} from '../packages/core';
import {autonomousLaunch,autonomousLimits,assertObserverOperation} from '../packages/core/autonomy';
import {executeRun,MockLLMProvider} from '../packages/agent/runtime';
let db:Database,d:Domain,owner:string,other:string,buyer:any,seller:any,order:any;
async function login(){const k=nacl.sign.keyPair(),wallet=bs58.encode(k.publicKey),c=await d.publicDispatch('auth/challenge',{wallet});return (await d.publicDispatch('auth/verify',{id:c.id,wallet,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(c.message),k.secretKey))})).session;}
function input(name:string,role:'Researcher'|'Verifier'='Researcher'){return agentSchema.parse({name,ticker:name.replaceAll(' ','').slice(0,10),description:'Autonomous public evidence business',mission:'Discover useful AI projects and verify source evidence.',scope:'Investigate official public AI documentation.',jobType:role,category:'Research',tags:[],tools:['web_search'],brain:'development/mock',tokenMode:'sandbox',initialBudget:99,initialOperatingBudget:0,schedule:'manual',policy:{...defaultPolicy,autoHire:false,dailySpend:999,maxRunCost:50},services:[serviceSchema.parse({name:'Manual old contract',description:'A contract replaced by the launch activity preset.',price:500,active:false})]});}
async function run(claim:any){expect(claim).toBeTruthy();const result=await executeRun(claim,async(op,b)=>{if(op==='dependency'){const next=await d.worker('claim',{worker:'supplier',serviceOnly:true});if(next)await run(next);}return d.worker(op,b);});if('deferred' in result)throw Error('This receipt test expects useful work');await d.worker('complete',{id:claim.job.id,lease:claim.job.lease,...result});if(claim.job.type!=='SERVICE')await db.query("UPDATE agents SET next_run_at=now()+interval '1 day' WHERE id=$1",[claim.agent.id]);return result;}
beforeAll(async()=>{vi.stubEnv('APP_MODE','demo');vi.stubEnv('WALLET_ENCRYPTION_KEY','4'.repeat(64));vi.stubEnv('OPENROUTER_API_KEY','');db=await database(true);await migrate(db);d=new Domain(db);owner=await login();other=await login();seller=await d.publicDispatch('agents/create',{input:input('AUTO VERIFY','Verifier'),key:randomUUID()},other);await run(await d.worker('claim',{worker:'first'}));buyer=await d.publicDispatch('agents/create',{input:input('AUTO SCOUT'),key:randomUUID()},owner);});
afterEach(()=>vi.restoreAllMocks());
afterAll(async()=>{await db.close();vi.unstubAllEnvs();});
it('normalizes all nine launch activities, funding and service contracts without changing the mission',()=>{
 for(const role of templates){const original={...input('NORMALIZED'),jobType:role},c=autonomousLaunch(original,true);expect(c.autonomyVersion).toBe(1);expect(c.mission).toBe(original.mission);expect(c.scope).toBe(original.scope);expect(c.policy).toMatchObject({...autonomousLimits.policy,preferredCategories:expect.any(Array)});expect(c.schedule).toBe('continuous');expect(c.services).toHaveLength(1);expect(c.services[0]).toMatchObject({price:.01,active:true});expect(c.tools).toContain('marketplace');expect(c.initialBudget).toBe(10);expect(c.initialOperatingBudget).toBe(1);}
 expect(autonomousLaunch(input('NO TEST MONEY'),false).initialBudget).toBe(0);
 expect(autonomousLaunch({...input('PUMP LIMITS'),tokenMode:'pump'},true).initialOperatingBudget).toBe(0);
 expect(()=>autonomousLaunch({...input('NO BRAIN'),brain:''},true)).toThrow('Choose an available AI model');
});
it('blocks every creator and human transaction route before any mutation, even for the owner',async()=>{
 const before=(await d.publicDispatch('agents/get',{id:buyer.id},owner)).agent,credits=(await d.publicDispatch('auth/session',{},owner)).profile.credits;
 for(const op of ['agents/update','agents/pause','agents/resume','agents/terminate','agents/run','agents/fund','agents/service','agents/service-update','agents/routing-check','work/create','work/accept','work/cancel','services/request','services/invoke']){
  await expect(d.publicDispatch(op,{id:buyer.id,input:{requesterAgentId:buyer.id,brain:'development/mock'},key:randomUUID(),lease:randomUUID()},owner)).rejects.toMatchObject({code:'AUTONOMOUS_ONLY',status:403});
  expect(()=>assertObserverOperation(op)).toThrow('autonomously');
 }
 expect((await d.publicDispatch('agents/get',{id:buyer.id},owner)).agent).toEqual(before);expect((await d.publicDispatch('auth/session',{},owner)).profile.credits).toBe(credits);
 await expect(d.publicDispatch('agents/create',{input:{}},undefined)).rejects.toMatchObject({status:401});
 expect(readFileSync('packages/db/server.ts','utf8')).toContain('domain.publicDispatch(input.op,input.body,input.session)');
});
it('executes launch → planned supplier → delivered result → settlement with real balanced receipts',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No paid provider is permitted in this test'));
 const before=(await d.publicDispatch('agents/get',{id:buyer.id})).agent.metrics,supplierBefore=(await d.publicDispatch('agents/get',{id:seller.id})).agent.metrics;
 const claim=await d.worker('claim',{worker:'autonomous'}),result=await run(claim);expect(claim.agent.id).toBe(buyer.id);expect(result.output.delegation.status).toBe('succeeded');expect(result.output.delegation.execution).toMatchObject({providerCoinId:seller.id,separateJob:true,sameOwner:false,sameBrain:true});
 const work=await d.publicDispatch('marketplace/work');expect(work).toHaveLength(1);order=work[0];expect(order).toMatchObject({buyer_name:'AUTO SCOUT',seller_name:'AUTO VERIFY',amount:.01,status:'succeeded',payment_status:'settled'});expect(order.input).toBeUndefined();expect(order.output).toBeUndefined();expect(order.requester_profile_id).toBeUndefined();
 const after=(await d.publicDispatch('agents/get',{id:buyer.id})).agent.metrics,supplier=(await d.publicDispatch('agents/get',{id:seller.id})).agent.metrics;
 expect(after.operatingBalance).toBeCloseTo(before.operatingBalance-.01,6);expect(supplier.operatingBalance).toBeCloseTo(supplierBefore.operatingBalance+.01,6);expect(after.computeCredits).toBeLessThan(before.computeCredits);
 expect((await d.publicDispatch('jobs/get',{id:order.job_id})).receipt.status).toBe('settled');expect((await d.publicDispatch('search',{q:'AUTO SCOUT'})).some((r:any)=>r.kind==='Work'&&r.href==='/jobs/'+order.job_id)).toBe(true);
 expect((await db.query("SELECT t.id FROM ledger_transactions t LEFT JOIN ledger_postings p ON p.transaction_id=t.id GROUP BY t.id HAVING count(p.*)<>2 OR sum(CASE p.direction WHEN 'credit' THEN p.amount ELSE -p.amount END)<>0")).rows).toEqual([]);
 expect(fetch).not.toHaveBeenCalled();
});
it('allows the model to decline a supplier and uses prior results on the next scheduled run',async()=>{
 await db.query("UPDATE agents SET next_run_at=now()-interval '1 second' WHERE id=$1",[buyer.id]);
 const planner=vi.spyOn(MockLLMProvider.prototype,'plan').mockResolvedValue({plan:{steps:[],serviceId:null},cost:500});
 const claim=await d.worker('claim',{worker:'interval'});expect(claim.agent.id).toBe(buyer.id);expect(claim.job.trigger_type).toBe('continuous');const result=await run(claim);expect(result.output.delegation).toBeUndefined();
 const context=planner.mock.calls[0][4]!;expect(context.services).toHaveLength(1);expect(context.memory.length).toBeGreaterThan(0);expect(context.memory[0].summary.length).toBeLessThanOrEqual(700);expect((await d.publicDispatch('marketplace/work')).length).toBe(1);
});
it('does not execute a model-invented supplier ID or pass private history to the catalogue',async()=>{
 await db.query("UPDATE agents SET next_run_at=now()-interval '1 second' WHERE id=$1",[buyer.id]);
 vi.spyOn(MockLLMProvider.prototype,'plan').mockResolvedValue({plan:{steps:[],serviceId:randomUUID(),objective:'Assess public transport security guarantees'},cost:500});
 await run(await d.worker('claim',{worker:'invented'}));expect((await d.publicDispatch('marketplace/work')).length).toBe(1);
 await db.query("UPDATE agents SET visibility='private' WHERE id=$1",[seller.id]);expect(await d.publicDispatch('marketplace/work')).toEqual([]);await db.query("UPDATE agents SET visibility='public' WHERE id=$1",[seller.id]);
});
it('retains watchlists but never grants worker or administrator authority to creators',async()=>{
 await d.publicDispatch('watchlist/set',{businessId:seller.id,watch:true},owner);expect((await d.publicDispatch('watchlist',{},owner))[0].id).toBe(seller.id);
 await expect(d.publicDispatch('admin/agent',{id:buyer.id,paused:true},owner)).rejects.toMatchObject({status:403});
 await expect(d.worker('purchase',{id:order.job_id,lease:randomUUID(),serviceId:order.service_id,input:{claim:'Forged request'}})).rejects.toThrow();
 expect(await one(db,"SELECT count(*) n FROM service_requests")).toMatchObject({n:1});
});
it('refuses completion when measured compute plus the supplier exceed the shared run ceiling',async()=>{
 await db.query("UPDATE agents SET next_run_at=now()-interval '1 second' WHERE id=$1",[buyer.id]);
 const claim=await d.worker('claim',{worker:'combined-budget'}),service=(await d.publicDispatch('services/list')).find((s:any)=>s.agent_id===seller.id);
 await d.worker('purchase',{id:claim.job.id,lease:claim.job.lease,serviceId:service.id,input:{claim:'Verify the recorded public evidence'}});await run(await d.worker('claim',{worker:'supplier-budget',serviceOnly:true}));
 const policy=await d.worker('policy',{id:claim.job.id,lease:claim.job.lease});expect(policy.serviceSpentMicro).toBe(10000);
 const runs=[{kind:'model',provider:'test',name:'measured-overage',cost:95000}];await d.worker('usage',{id:claim.job.id,lease:claim.job.lease,cost:95000,runs});
 await expect(d.worker('complete',{id:claim.job.id,lease:claim.job.lease,cost:95000,runs,output:{summary:'Over-budget result'}})).rejects.toMatchObject({code:'RUN_LIMIT'});
 await d.worker('fail',{id:claim.job.id,lease:claim.job.lease,error:'Combined run budget exceeded',permanent:true});
 expect((await d.publicDispatch('jobs/get',{id:claim.job.id})).status).toBe('failed');
});
it('stores case-sensitive creator tickers unchanged in Coin records and config',async()=>{
 for(const ticker of ['radar','RADAR','Radar','rAdAr']){const session=await login(),created=await d.publicDispatch('agents/create',{input:{...input('Case preservation'),ticker},key:randomUUID()},session),row=await one(db,'SELECT ticker,config FROM agents WHERE id=$1',[created.id]);expect(row?.ticker).toBe(ticker);expect(row?.config.ticker).toBe(ticker);}
});
it('allows waiting only after a failed supplier is refunded, never with a live dependency',async()=>{
 await db.query('UPDATE agents SET paused=true');
 const supplier=await d.publicDispatch('agents/create',{input:input('REFUND VERIFY','Verifier'),key:randomUUID()},other);await run(await d.worker('claim',{worker:'refund-baseline'}));
 const customer=await d.publicDispatch('agents/create',{input:input('REFUND BUYER'),key:randomUUID()},owner),c=await d.worker('claim',{worker:'refund-buyer'});expect(c.agent.id).toBe(customer.id);
 const s=(await d.publicDispatch('services/list')).find((s:any)=>s.agent_id===supplier.id);
 const receipt=await d.worker('purchase',{id:c.job.id,lease:c.job.lease,serviceId:s.id,input:{claim:'Check this claim'}});
 await expect(d.worker('defer',{id:c.job.id,lease:c.job.lease,deferred:{reason:'awaiting-data',seconds:60}})).rejects.toMatchObject({code:'DEPENDENCY_EXISTS'});
 const sc=await d.worker('claim',{worker:'refund-supplier',serviceOnly:true});expect(sc.job.id).toBe(receipt.jobId);await d.worker('fail',{id:sc.job.id,lease:sc.job.lease,error:'Unavailable source',permanent:true});
 await d.worker('defer',{id:c.job.id,lease:c.job.lease,deferred:{reason:'awaiting-data',seconds:60}});
 expect((await d.publicDispatch('jobs/get',{id:c.job.id})).status).toBe('waiting');expect((await d.publicDispatch('jobs/get',{id:sc.job.id})).receipt.status).toBe('refunded');
});
it('does not advertise or accept an autonomous order during supplier budget cooldown',async()=>{
 await db.query('UPDATE agents SET paused=true');
 const supplier=await d.publicDispatch('agents/create',{input:input('BUDGET VERIFY','Verifier'),key:randomUUID()},other);await run(await d.worker('claim',{worker:'budget-baseline'}));
 const customer=await d.publicDispatch('agents/create',{input:input('BUDGET BUYER'),key:randomUUID()},owner),c=await d.worker('claim',{worker:'budget-buyer'});expect(c.agent.id).toBe(customer.id);
 await db.query("UPDATE agents SET config=jsonb_set(config,'{policy,hourlySpend}','0.1') WHERE id=$1",[supplier.id]);
 const s=(await d.publicDispatch('services/list')).find((s:any)=>s.agent_id===supplier.id);
 expect((await d.worker('services',{})).some((v:any)=>v.id===s.id)).toBe(false);
 await expect(d.worker('purchase',{id:c.job.id,lease:c.job.lease,serviceId:s.id,input:{claim:'Check this claim'}})).rejects.toMatchObject({code:'SERVICE_UNAVAILABLE'});
 expect((await db.query('SELECT id FROM service_requests WHERE parent_job_id=$1',[c.job.id])).rows).toHaveLength(0);
});
it('parks pending supplier work without burning attempts or losing its payment',async()=>{
 await db.query('UPDATE agents SET paused=true');
 const supplier=await d.publicDispatch('agents/create',{input:input('WAIT VERIFY','Verifier'),key:randomUUID()},other);await run(await d.worker('claim',{worker:'wait-baseline'}));
 const customer=await d.publicDispatch('agents/create',{input:input('WAIT BUYER'),key:randomUUID()},owner),c=await d.worker('claim',{worker:'wait-buyer'});expect(c.agent.id).toBe(customer.id);
 const s=(await d.publicDispatch('services/list')).find((s:any)=>s.agent_id===supplier.id),receipt=await d.worker('purchase',{id:c.job.id,lease:c.job.lease,serviceId:s.id,input:{claim:'Check supplied evidence'}});
 await d.worker('usage',{id:c.job.id,lease:c.job.lease,cost:1500,runs:[{kind:'model',provider:'test',name:'plan',cost:1500}]});
 await d.worker('await-supplier',{id:c.job.id,lease:c.job.lease});expect(await one(db,'SELECT status,phase,attempts FROM jobs WHERE id=$1',[c.job.id])).toMatchObject({status:'queued',phase:'WAITING_SUPPLIER',attempts:0});
 expect((await d.publicDispatch('jobs/get',{id:receipt.jobId})).receipt.status).toBe('reserved');
 await run(await d.worker('claim',{worker:'wait-supplier',serviceOnly:true}));await db.query('UPDATE jobs SET run_after=now() WHERE id=$1',[c.job.id]);const resumed=await d.worker('claim',{worker:'wait-resume'});expect(resumed.job.id).toBe(c.job.id);expect(resumed.job.dependencies[0]).toMatchObject({jobId:receipt.jobId,status:'succeeded'});const result=await executeRun(resumed,(op,b)=>d.worker(op,b));await d.worker('usage',{id:c.job.id,lease:resumed.job.lease,cost:2300,runs:[{kind:'model',provider:'test',name:'plan',cost:2300}]});await d.worker('complete',{id:c.job.id,lease:resumed.job.lease,...result,cost:2300,runs:[{kind:'model',provider:'test',name:'plan',cost:2300}]});expect((await d.publicDispatch('jobs/get',{id:c.job.id})).status).toBe('succeeded');
 const charges=(await db.query("SELECT amount,idempotency_key FROM ledger_entries WHERE job_id=$1 AND category='compute'",[c.job.id])).rows;
 expect(charges).toHaveLength(2);expect(charges.map(r=>r.idempotency_key)).toContain(`compute:${c.job.id}:run:${c.job.run_id}`);
 await expect(d.worker('complete',{id:c.job.id,lease:resumed.job.lease,cost:1500,output:{summary:'duplicate'},runs:[]})).rejects.toMatchObject({code:'STALE_LEASE'});
 expect((await db.query("SELECT id FROM ledger_entries WHERE job_id=$1 AND category='compute'",[c.job.id])).rows).toHaveLength(2);
});
it('isolates an inconsistent abandoned receipt without releasing funds or blocking other Coins',async()=>{
 await db.query('UPDATE agents SET paused=true');
 const broken=await d.publicDispatch('agents/create',{input:input('BROKEN RECEIPT'),key:randomUUID()},owner);
 const c=await d.worker('claim',{worker:'broken'});expect(c.agent.id).toBe(broken.id);
 await d.worker('usage',{id:c.job.id,lease:c.job.lease,cost:2300,runs:[{kind:'model',provider:'test',name:'plan',cost:2300}]});
 await db.query("INSERT INTO ledger_entries(agent_id,direction,category,amount,idempotency_key,job_id) VALUES($1,'debit','compute',1500,$2,$3)",[broken.id,`compute:${c.job.id}:run:${c.job.run_id}`,c.job.id]);
 await db.query("UPDATE jobs SET heartbeat_at=now()-interval '2 minutes' WHERE id=$1",[c.job.id]);
 const healthy=await d.publicDispatch('agents/create',{input:input('HEALTHY RECEIPT'),key:randomUUID()},owner);
 const next=await d.worker('claim',{worker:'healthy'});expect(next.agent.id).toBe(healthy.id);
 const held=await one(db,'SELECT * FROM jobs WHERE id=$1',[c.job.id]);expect(held!.payload.recoveryBlocked).toBe(true);expect(held!.payload.reservedCost).toBeGreaterThan(0);expect(held!.lease).toBeNull();
 expect((await d.publicDispatch('agents/get',{id:broken.id})).agent.operational.state).toBe('ERROR');
 await run(next);await d.worker('claim',{worker:'still-healthy'});
 expect((await db.query("SELECT id FROM audit_logs WHERE agent_id=$1 AND action='recovery-accounting-blocked'",[broken.id])).rows).toHaveLength(1);
 await db.query('UPDATE agents SET paused=false WHERE id=$1',[buyer.id]);
});
