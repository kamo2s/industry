import {it,expect,beforeAll,afterAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {database,migrate,one,type Database} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {agentSchema,serviceSchema,defaultPolicy} from '../packages/core';
import {executeRun} from '../packages/agent/runtime';
let db:Database,d:Domain,owner:string,customer:string;
async function login(){const k=nacl.sign.keyPair(),wallet=bs58.encode(k.publicKey),challenge=await d.dispatch('auth/challenge',{wallet});return(await d.dispatch('auth/verify',{wallet,id:challenge.id,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.message),k.secretKey))})).session;}
async function create(extra:any={},session=owner){const a=await d.dispatch('agents/create',{key:randomUUID(),input:agentSchema.parse({name:'OBS '+randomUUID().slice(0,6),ticker:'OBS',description:'Operations acceptance business.',mission:'Collect bounded public evidence.',jobType:'Researcher',category:'Research',tags:[],tools:[],brain:'development/mock',schedule:'manual',tokenMode:'sandbox',initialBudget:3,initialOperatingBudget:2,policy:{...defaultPolicy,maxRunCost:.1,autoHire:false,purchasesPerRun:3,maxPurchase:.03},services:[serviceSchema.parse({name:'Evidence service',description:'Deliver bounded source evidence.',price:.01})],...extra})},session);return a;}
async function claim(){return d.worker('claim',{worker:'operations-test'});}
async function emit(c:any,type:string,data:any={},visibility='PUBLIC',key:string=randomUUID()){return d.worker('operation',{id:c.job.id,lease:c.job.lease,event:{key,type,data,visibility}});}
async function complete(c:any,output:any={summary:'Observed public result',sources:[]}){await d.worker('complete',{id:c.job.id,lease:c.job.lease,cost:0,runs:[],output,memory:{}});}
async function live(a:any,session?:string){return d.dispatch('agents/live',{id:a.id},session);}
it('replaces only refunded supplier failures on a parent retry and preserves settled dependencies',async()=>{
 const seller=await create({},customer);await complete(await claim());
 const buyer=await create({tools:['marketplace'],policy:{...defaultPolicy,maxRunCost:.1,maxPurchase:.03,autoHire:true,purchasesPerRun:1}}),parent=await claim();
 const service=(await d.dispatch('services/list')).find((s:any)=>s.agent_id===seller.id);
 const request={id:parent.job.id,lease:parent.job.lease,serviceId:service.id,input:{topic:'Evidence'}};
 const first=await d.worker('purchase',request),failed=await d.worker('claim',{worker:'retry-supplier',serviceOnly:true});
 expect(failed.job.id).toBe(first.jobId);await d.worker('fail',{id:failed.job.id,lease:failed.job.lease,permanent:true,error:'Controlled provider failure'});
 await expect(complete(parent)).rejects.toMatchObject({code:'SUPPLIER_INCOMPLETE'});
 // Same attempt remains idempotent, never creates an unbounded repurchase loop.
 expect((await d.worker('purchase',request)).jobId).toBe(first.jobId);
 await d.worker('fail',{id:parent.job.id,lease:parent.job.lease,permanent:false,error:'Supplier failed'});
 await db.query('UPDATE jobs SET run_after=now() WHERE id=$1',[parent.job.id]);const retry=await claim();expect(retry.job.id).toBe(parent.job.id);
 const second=await d.worker('purchase',{...request,lease:retry.job.lease});expect(second.jobId).not.toBe(first.jobId);
 const supplier=await d.worker('claim',{worker:'retry-supplier',serviceOnly:true});await complete(supplier);
 expect((await d.worker('purchase',{...request,lease:retry.job.lease,input:{topic:'Rediscovered evidence'}})).jobId).toBe(second.jobId);
 await complete(retry);expect((await live(buyer)).status.state).toBe('IDLE');
 const receipts=(await db.query('SELECT p.status FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.parent_job_id=$1 ORDER BY r.created_at',[parent.job.id])).rows;
 expect(receipts.map(r=>r.status)).toEqual(['refunded','settled']);
});
beforeAll(async()=>{process.env.APP_MODE='demo';db=await database(true);await migrate(db);d=new Domain(db);owner=await login();customer=await login();});
afterAll(async()=>{await db.close();});
it('shows a real active autonomous operation, safe stages, deduplicated events and then Track Record',async()=>{
 const a=await create(),c=await claim();expect((await live(a)).status.state).toBe('WORKING');
 await emit(c,'PLANNING_STARTED');await emit(c,'SEARCH_STARTED',{query:'public sources',tool:'web_search',provider:'Test provider'},'PUBLIC','search');await emit(c,'SEARCH_STARTED',{query:'public sources',tool:'web_search',provider:'Test provider'},'PUBLIC','search');
 let view=await live(a);expect(view.operation.stage).toBe('SEARCH');expect(view.operation.events.filter((e:any)=>e.type==='SEARCH_STARTED')).toHaveLength(1);expect(view.operation.type).toBe('AUTONOMOUS MISSION');
 await emit(c,'SEARCH_COMPLETED',{count:1,sources:[{url:'https://example.com/',title:'Example',provider:'Test provider',discovered_at:new Date().toISOString(),citations:[{type:'url_citation',start_index:0,end_index:5}]}]});await emit(c,'FETCH_STARTED',{url:'https://example.com/',tool:'fetch'});await emit(c,'SOURCE_FETCHED',{url:'https://example.com/',title:'Example',tool:'fetch'});await emit(c,'EVIDENCE_FILTERED',{before:2,count:1});
 view=await live(a);expect(view.operation.sources[0]).toMatchObject({inspected:true,evidenceUsed:null});expect(view.operation.sources[0].citations).toHaveLength(1);expect(view.operation.browser).toBeNull();
 await emit(c,'SYNTHESIS_STARTED');await complete(c,{summary:'A completed report',sources:[{url:'https://example.com/',title:'Example'}],findings:[{finding:'Supported fact'}]});view=await live(a);expect(view.status.state).toBe('IDLE');expect(view.operation.output.summary).toBe('A completed report');expect(view.operation.sources[0].evidenceUsed).toBe(true);expect(view.operation.sources[0].citations).toHaveLength(1);expect(view.operation.events.at(-1).type).toBe('JOB_COMPLETED');expect((await d.dispatch('agents/record',{id:a.id})).jobs[0].id).toBe(c.job.id);
});
it('projects pending versus recorded compute/search cost without double counting completed usage',async()=>{
 const a=await create(),c=await claim();await d.worker('usage',{id:c.job.id,lease:c.job.lease,cost:12000,runs:[{kind:'model',provider:'OpenAI',name:'plan',cost:2000,metadata:{status:'completed',estimated:false}},{kind:'tool',provider:'OpenAI Web Search',name:'web_search:1',cost:10000,metadata:{status:'pending',estimated:true}}]});
 let v=await live(a);expect(v.operation.costs.compute).toBe(.002);expect(v.operation.costs.search).toBe(0);expect(v.operation.costs.pending).toBe(1);
 const runs=[{kind:'model',provider:'OpenAI',name:'plan',cost:2000,metadata:{status:'completed',estimated:false}},{kind:'tool',provider:'OpenAI Web Search',name:'web_search:1',cost:10000,metadata:{status:'completed',estimated:false}}];await d.worker('complete',{id:c.job.id,lease:c.job.lease,cost:12000,runs,output:{summary:'Done',sources:[]},memory:{}});v=await live(a);expect(v.operation.costs.total).toBe(.012);expect(v.operation.costs.pending).toBe(0);expect(v.funds.compute).toBe(2.988);
});
it('hides private evidence, arbitrary metadata, system events and customer input',async()=>{
 const a=await create({publicOutput:false}),c=await claim();await emit(c,'SEARCH_STARTED',{query:'PRIVATE CUSTOMER TOPIC'});await emit(c,'SOURCE_FETCHED',{url:'https://example.com/private',title:'PRIVATE TITLE'});await emit(c,'PLAN_READY',{steps:1},'OWNER_ONLY');await emit(c,'PLANNING_STARTED',{},'SYSTEM');
 expect(JSON.stringify(await live(a))).not.toContain('PRIVATE');const own=await live(a,owner);expect(JSON.stringify(own)).toContain('PRIVATE CUSTOMER TOPIC');expect(own.operation.events.some((e:any)=>e.visibility==='SYSTEM')).toBe(false);expect(own.operation.events.some((e:any)=>e.visibility==='OWNER_ONLY')).toBe(true);
 await expect(emit(c,'DECISION_RECORDED',{reason:'compatible-service',chain_of_thought:'DO NOT EXPOSE'})).rejects.toThrow();await expect(d.worker('operation',{id:c.job.id,lease:c.job.lease,event:{key:'bad',type:'DECISION_RECORDED',public_summary:'RAW SYSTEM PROMPT',data:{}}})).rejects.toThrow();
 await complete(c,{summary:'PRIVATE OUTPUT',sources:[]});expect((await live(a)).operation.output).toBeNull();expect((await live(a,owner)).operation.output.summary).toBe('PRIVATE OUTPUT');
});
it('shows customer and supplier lanes, purchases, waiting, results and internal settlement',async()=>{
 const seller=await create({},customer);await complete(await claim());const buyer=await create({tools:['marketplace'],policy:{...defaultPolicy,maxRunCost:.1,maxPurchase:.03,autoHire:true,purchasesPerRun:3}}),parent=await claim();const service=(await d.dispatch('services/list')).find((s:any)=>s.agent_id===seller.id);
 const paid=await d.worker('purchase',{id:parent.job.id,lease:parent.job.lease,serviceId:service.id,input:{topic:'PRIVATE CUSTOMER INPUT'}});await emit(parent,'WAITING',{supplierJobId:paid.jobId,serviceId:service.id});let view=await live(buyer);expect(view.status.state).toBe('WAITING FOR SUPPLIER');expect(view.operation.chain[0].paymentStatus).toBe('reserved');expect(view.operation.chain[0].request).toBeNull();expect(view.operation.costs.services).toBe(.01);
 const hire=(await d.dispatch('activity',{agentId:buyer.id})).find((e:any)=>e.action==='hired');expect(hire.live_job_id).toBe(parent.job.id);expect(view.radar.find((e:any)=>e.label==='Supplier service purchased').jobId).toBe(parent.job.id);
 const supplier=await d.worker('claim',{worker:'service',serviceOnly:true});expect((await live(seller)).operation.type).toBe('SUPPLIER SERVICE');expect(JSON.stringify(await live(seller))).not.toContain('PRIVATE CUSTOMER INPUT');expect((await live(seller,customer)).operation.request).toContain('PRIVATE CUSTOMER INPUT');
 await complete(supplier);view=await live(buyer);expect(view.operation.chain[0].status).toBe('succeeded');expect(view.operation.chain[0].paymentStatus).toBe('settled');expect(view.operation.events.some((e:any)=>e.type==='SUPPLIER_COMPLETED')).toBe(true);await complete(parent);
 const human=await d.dispatch('services/request',{id:service.id,key:randomUUID(),input:{input:{topic:'Human request'}}},owner);const humanClaim=await d.worker('claim',{worker:'human',serviceOnly:true});expect(humanClaim.job.id).toBe(human.jobId);expect((await live(seller)).operation.type).toBe('CUSTOMER JOB');await complete(humanClaim);
});
it('shows multiple real suppliers and failed/refunded purchases without counting refund as expense',async()=>{
 const sellers=[await create({},customer),await create({},customer)];await complete(await claim());await complete(await claim());const buyer=await create({tools:['marketplace'],policy:{...defaultPolicy,maxRunCost:.1,maxPurchase:.03,autoHire:true,purchasesPerRun:3}}),parent=await claim();const services=(await d.dispatch('services/list')).filter((s:any)=>sellers.some(a=>a.id===s.agent_id));
 for(const service of services)await d.worker('purchase',{id:parent.job.id,lease:parent.job.lease,serviceId:service.id,input:{topic:'Evidence'}});expect((await live(buyer)).operation.chain).toHaveLength(2);
 const failed=await d.worker('claim',{worker:'supplier-fail',serviceOnly:true});await d.worker('fail',{id:failed.job.id,lease:failed.job.lease,permanent:true,error:'SECRET raw provider response'});const other=await d.worker('claim',{worker:'supplier-ok',serviceOnly:true});await complete(other);
 const view=await live(buyer);expect(view.operation.chain.some((n:any)=>n.status==='failed'&&n.paymentStatus==='refunded')).toBe(true);expect(view.operation.costs.services).toBe(.01);expect(view.operation.costs.refunded).toBe(.01);expect(JSON.stringify(await live(sellers.find(a=>a.id===failed.agent.id)))).not.toContain('SECRET');await d.worker('fail',{id:parent.job.id,lease:parent.job.lease,permanent:true,error:'Supplier failed'});
});
it('reports idle, scheduled, low-compute, paused and safe retry/error states',async()=>{
 const a=await create();const c=await claim();await complete(c);expect((await live(a)).status.state).toBe('IDLE');await d.dispatch('agents/update',{id:a.id,input:{schedule:'interval',intervalMinutes:30}},owner);expect((await live(a)).status.state).toBe('SCHEDULED');await d.dispatch('agents/pause',{id:a.id},owner);expect((await live(a)).status.state).toBe('PAUSED');await d.dispatch('agents/resume',{id:a.id},owner);await d.dispatch('agents/run',{id:a.id,key:randomUUID()},owner);const retry=await claim();await d.worker('fail',{id:retry.job.id,lease:retry.job.lease,error:'API SECRET',permanent:false});const v=await live(a);expect(v.status.state).toBe('RETRYING');expect(v.operation.error.retry).toBe(true);expect(JSON.stringify(v)).not.toContain('API SECRET');await d.dispatch('agents/pause',{id:a.id},owner);
 const empty=await create({initialBudget:0});expect((await live(empty)).status.state).toBe('LOW COMPUTE');expect((await live(empty)).own).toBe(false);expect((await live(empty,owner)).own).toBe(true);
});
it('partial owner updates preserve brain, tools, output visibility and other schedule fields',async()=>{
 const a=await create({tools:['web_search'],brain:'development/mock',publicOutput:false,scope:'Keep this configured scope'});await complete(await claim());
 const before=(await d.dispatch('agents/get',{id:a.id},owner)).agent.config;
 await d.dispatch('agents/update',{id:a.id,input:{intervalMinutes:30}},owner);
 const after=(await d.dispatch('agents/get',{id:a.id},owner)).agent.config;
 for(const key of ['tools','brain','publicOutput','scope','schedule','policy'])expect(after[key]).toEqual(before[key]);expect(after.intervalMinutes).toBe(30);
});
it('distinguishes actual browser events from fetch/search, and excludes secrets from URLs',async()=>{
 const a=await create(),c=await claim();await emit(c,'BROWSER_STARTED',{url:'https://example.com/?api_key=secret&public=yes',tool:'browser'});await emit(c,'BROWSER_COMPLETED',{url:'https://example.com/',title:'Rendered public page',provider:'local-playwright',tool:'browser'});const v=await live(a);expect(v.operation.browser.state).toBe('COMPLETE');expect(v.operation.browser.title).toBe('Rendered public page');expect(JSON.stringify(v)).not.toContain('api_key');await complete(c);
});
it('records runtime search/filter/decision actions without storing prompts or hidden reasoning',async()=>{
 const a=await create({tools:['web_search','marketplace'],policy:{...defaultPolicy,maxRunCost:.1,autoHire:true,preferredCategories:['Trading']}}),c=await claim();const r=await executeRun(c,(op,b)=>d.worker(op,b));await d.worker('complete',{id:c.job.id,lease:c.job.lease,...r});const v=await live(a);expect(v.operation.events.map((e:any)=>e.type)).toEqual(expect.arrayContaining(['SEARCH_STARTED','SEARCH_COMPLETED','EVIDENCE_FILTERED','DECISION_RECORDED','OUTPUT_READY']));expect(v.operation.decisions[0].data.reason).toBe('no-compatible-service');expect(JSON.stringify(v)).not.toMatch(/system_prompt|chain_of_thought|scratchpad/);expect(v.development).toBe(true);
});
it('prevents selecting another business operation and rejects stale worker leases',async()=>{
 const _a=await create(),c=await claim(),b=await create();await expect(d.dispatch('agents/live',{id:b.id,job:c.job.id})).rejects.toMatchObject({code:'NOT_FOUND'});await expect(d.worker('operation',{id:c.job.id,lease:randomUUID(),event:{key:'bad',type:'PLAN_READY',data:{}}})).rejects.toMatchObject({code:'STALE_LEASE'});await complete(c);await complete(await claim());
});
it('calculates outcome windows from actual completed service observations',async()=>{
 const rows=(await db.query("SELECT agent_id FROM jobs WHERE type='SERVICE' AND status='succeeded' LIMIT 1")).rows;const record=await d.dispatch('agents/record',{id:rows[0].agent_id});expect(record.outcomes.length).toBeGreaterThan(0);expect(record.outcomes[0].purchases).toBeGreaterThan(0);expect(record.outcomes[0].observed_until).toBeTruthy();expect(await one(db,'SELECT count(*) n FROM operation_events')).toBeTruthy();
});
it('shows concurrent mission and customer work without replacing the standing mandate',async()=>{
 const a=await create(),mission=await claim(),service=(await d.dispatch('services/list')).find((s:any)=>s.agent_id===a.id);
 await d.dispatch('services/request',{id:service.id,key:randomUUID(),input:{input:{topic:'Separate private customer task'}}},customer);
 const paid=await d.worker('claim',{worker:'parallel-service',serviceOnly:true});expect(paid.agent.id).toBe(a.id);
 const view=await live(a);expect(view.active).toHaveLength(2);expect(view.active.map((j:any)=>j.type)).toEqual(expect.arrayContaining(['AUTONOMOUS MISSION','CUSTOMER JOB']));expect(view.mission.text).toBe('Collect bounded public evidence.');expect(JSON.stringify(view)).not.toContain('Separate private customer task');
 await emit(paid,'FETCH_STARTED',{tool:'fetch',url:'https://example.com/'});await emit(paid,'SOURCE_FAILED',{tool:'fetch',url:'https://example.com/'});expect((await live(a,owner)).operation.sources[0].status).toBe('Unavailable');await complete(paid);await complete(mission);
});
it('keeps completed provider calls complete when a later operation stage fails',async()=>{
 const a=await create(),c=await claim();await d.worker('usage',{id:c.job.id,lease:c.job.lease,cost:1000,runs:[{kind:'model',provider:'OpenAI',name:'plan',cost:1000,metadata:{status:'completed',estimated:false}}]});
 await d.worker('fail',{id:c.job.id,lease:c.job.lease,permanent:true,error:'Later stage failed'});const v=await live(a);expect(v.operation.status).toBe('failed');expect(v.operation.tools[0].status).toBe('COMPLETE');expect(v.operation.costs.total).toBe(.001);
});
