import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {database,migrate,one,type Database} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {agentSchema,defaultPolicy,authorizePurchase,micro} from '../packages/core';
import {autonomousLimits} from '../packages/core/autonomy';
import {priceDecisionSchema} from '../packages/core/service-pricing';
import {operatingSpend} from '../packages/db/controls';
import {executeRun,MockLLMProvider} from '../packages/agent/runtime';
import {purchase} from '../packages/db/economy';
let db:Database,d:Domain,seller:any,buyer:any,claim:any,service:any;
async function create(name:string){const k=nacl.sign.keyPair(),wallet=bs58.encode(k.publicKey),c=await d.publicDispatch('auth/challenge',{wallet});const {session}=await d.publicDispatch('auth/verify',{id:c.id,wallet,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(c.message),k.secretKey))});return d.publicDispatch('agents/create',{key:randomUUID(),input:agentSchema.parse({name,ticker:name,description:'Public research service business',mission:'Research public software documentation and source evidence.',category:'Research',tags:[],jobType:name==='SELLER'?'Verifier':'Researcher',tools:['web_search'],brain:'development/mock',tokenMode:'sandbox',policy:defaultPolicy,services:[{name:'Research service',description:'Research public source evidence.',price:1}]})},session);}
beforeAll(async()=>{vi.stubEnv('APP_MODE','demo');vi.stubEnv('WALLET_ENCRYPTION_KEY','4'.repeat(64));vi.stubEnv('OPENROUTER_API_KEY','');db=await database(true);await migrate(db);d=new Domain(db);seller=await create('SELLER');claim=await d.worker('claim',{worker:'price-owner'});buyer=await create('BUYER');service=(await d.publicDispatch('services/list')).find((s:any)=>s.agent_id===seller.id);});
afterAll(async()=>{vi.restoreAllMocks();await db.close();vi.unstubAllEnvs();});
it('enforces $1 floor, cent precision and $10 purchase cap without raising AI ceilings',()=>{
 for(const price of [.99,1.001,Infinity])expect(priceDecisionSchema.safeParse({serviceId:randomUUID(),price,reason:'Measured delivery scope'}).success).toBe(false);
 const ctx={amount:micro(10),balance:micro(10),spentToday:0,spentHour:0,purchasesToday:0,purchasesRun:0,spentRun:0,category:'Research',network:'sandbox',emergency:false,paused:false};
 expect(()=>authorizePurchase(autonomousLimits.policy,ctx)).not.toThrow();
 expect(()=>authorizePurchase(autonomousLimits.policy,{...ctx,amount:micro(10.01),balance:micro(20)})).toThrow('per-transaction');
 expect(()=>authorizePurchase(autonomousLimits.policy,{...ctx,balance:micro(9)})).toThrow('operating balance');
 expect(()=>authorizePurchase(autonomousLimits.policy,{...ctx,spentHour:1})).toThrow('Hourly');
 expect(autonomousLimits.policy.maxRunCost).toBe(.1);
});
it('rejects stale quotes and isolates service spending from compute limits',async()=>{
 const bc=await d.worker('claim',{worker:'buyer'});
 await expect(d.worker('purchase',{id:bc.job.id,lease:bc.job.lease,serviceId:service.id,expectedPrice:.01,input:{claim:'Official documentation'}})).rejects.toMatchObject({code:'PRICE_CHANGED'});
 const order=await d.worker('purchase',{id:bc.job.id,lease:bc.job.lease,serviceId:service.id,expectedPrice:1,input:{claim:'Official documentation'}});
 expect((await operatingSpend(db,buyer.id,'services')).day).toBe(micro(1));
 expect((await operatingSpend(db,buyer.id,'compute')).day).toBe(0);
 const policy=await d.worker('policy',{id:bc.job.id,lease:bc.job.lease});expect(policy.serviceSpentMicro).toBe(0);expect(policy.operatingAvailableMicro).toBe(0);
 // Change the listing after escrow: settlement must use the old agreed $1.
 await d.worker('service-price',{id:claim.job.id,lease:claim.job.lease,decision:{serviceId:service.id,price:3,reason:'Broader source inspection requires more delivery work.'}});
 const child=await d.worker('claim',{worker:'supplier',serviceOnly:true});expect(child.job.id).toBe(order.jobId);
 await expect(d.worker('service-price',{id:child.job.id,lease:child.job.lease,decision:{serviceId:service.id,price:4,reason:'Contract cannot reprice itself'}})).rejects.toMatchObject({code:'PRICING_DENIED'});
 await d.worker('complete',{id:child.job.id,lease:child.job.lease,cost:0,runs:[],output:{summary:'Official evidence assessed.',sources:[]}});
 await d.worker('complete',{id:bc.job.id,lease:bc.job.lease,cost:500,runs:[{kind:'model',provider:'test',name:'summary',cost:500}],output:{summary:'Used the supplier evidence.'}});
 expect(Number((await one(db,'SELECT p.amount FROM payments p JOIN service_requests r ON r.payment_id=p.id WHERE r.job_id=$1',[order.jobId]))!.amount)).toBe(micro(1));
 expect(Number((await one(db,'SELECT price_amount FROM agent_services WHERE id=$1',[service.id]))!.price_amount)).toBe(micro(3));
});
it('fences repricing by ownership and lease, preserves cooldown and supplies real order costs',async()=>{
 const other=(await d.publicDispatch('services/list')).find((s:any)=>s.agent_id===buyer.id);
 const decision={serviceId:service.id,price:4,reason:'New observed delivery requirements'};
 await expect(d.worker('service-price',{id:claim.job.id,lease:randomUUID(),decision})).rejects.toMatchObject({code:'STALE_LEASE'});
 await expect(d.worker('service-price',{id:claim.job.id,lease:claim.job.lease,decision:{...decision,serviceId:other.id}})).rejects.toMatchObject({code:'PRICING_DENIED'});
 expect(await d.worker('service-price',{id:claim.job.id,lease:claim.job.lease,decision})).toMatchObject({changed:false,reason:'cooldown'});
 const context=await d.worker('pricing-context',{id:claim.job.id,lease:claim.job.lease});expect(context[0]).toMatchObject({price:3,canUpdate:false,completedOrders30d:1,averageDeliveryCost30d:0});
});
it('applies the Coin planner’s own price decision without a separate model call',async()=>{
 await db.query('UPDATE agent_services SET price_updated_at=NULL WHERE id=$1',[service.id]);
 const plan=vi.spyOn(MockLLMProvider.prototype,'plan').mockResolvedValue({plan:{steps:[],action:'wait',waitReason:'awaiting-data',waitSeconds:60,priceDecisions:[{serviceId:service.id,price:2,reason:'Keep the narrower service competitive after reviewing costs.'}]},cost:500});
 await executeRun(claim,(op,b)=>d.worker(op,b));
 expect(plan).toHaveBeenCalledTimes(1);expect(plan.mock.calls[0][4]!.pricing).toHaveLength(1);
 expect(Number((await one(db,'SELECT price_amount FROM agent_services WHERE id=$1',[service.id]))!.price_amount)).toBe(micro(2));
});
it('refunds the original escrow amount when a listing changes after purchase',async()=>{
 const customer=await create('REFUNDBUYER');
 const a=(await one(db,'SELECT * FROM agents WHERE id=$1',[customer.id]))!;
 const profile=(await one(db,'SELECT * FROM profiles WHERE id=$1',[a.creator_profile_id]))!;
 await db.query('UPDATE agent_services SET price_amount=1000000,price_updated_at=NULL WHERE id=$1',[service.id]);
 const order=await db.transaction(tx=>purchase(tx,profile,service.id,{claim:'Assess the official documentation.'},randomUUID(),a.id,undefined,1));
 await d.worker('service-price',{id:claim.job.id,lease:claim.job.lease,decision:{serviceId:service.id,price:5,reason:'A wider service scope requires additional inspection.'}});
 const child=await d.worker('claim',{worker:'refund-supplier',serviceOnly:true});expect(child.job.id).toBe(order.jobId);
 await d.worker('fail',{id:child.job.id,lease:child.job.lease,error:'Source unavailable',permanent:true});
 const receipt=(await d.publicDispatch('jobs/get',{id:order.jobId})).receipt;
 expect(receipt.status).toBe('refunded');expect(Number((await one(db,'SELECT p.amount FROM payments p JOIN service_requests r ON r.payment_id=p.id WHERE r.job_id=$1',[order.jobId]))!.amount)).toBe(micro(1));
 expect((await d.publicDispatch('agents/get',{id:a.id})).agent.metrics.operatingBalance).toBe(1);
});


