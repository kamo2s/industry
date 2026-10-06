import * as modelCatalogModule from '../packages/agent/catalog';
import { beforeAll,afterAll,afterEach,describe,it,expect,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Keypair,PublicKey,TransactionMessage,VersionedTransaction,TransactionInstruction } from '@solana/web3.js';
import type { PaymentPayload,PaymentRequirements,SettleResponse } from '@x402/core/types';
import { database,migrate,one,type Database } from '../packages/db/connection';
import { Domain } from '../packages/db/domain';
import { ServicePayments,bindPayment } from '../packages/db/x402';
import { X402Provider,DEVNET_CAIP,DEVNET_USDC,transactionHash } from '../packages/agent/payments';
import { agentSchema,defaultPolicy,authorizePurchase,serviceSchema,type Agent } from '../packages/core';
import { StructuredModelProvider } from '../packages/agent/model';
import { executeRun,OpenRouterProvider } from '../packages/agent/runtime';
import { refundDevnetPayment,type RefundProvider } from '../packages/db/refunds';
import { EncryptedDevSigner } from '../packages/agent/solana';
import { requireMainnetLaunchApproval } from '../packages/agent/production-token';

// Deterministic settlement harness: tests durability/security, NOT devnet proof.
class FacilitatorFixture extends X402Provider {
  payer=Keypair.generate().publicKey.toBase58();calls=0;loseReply=false;receipts=new Map<string,SettleResponse>();
  override async requirements(payTo:string,amount:number,memo:string):Promise<PaymentRequirements>{return {scheme:'exact',network:DEVNET_CAIP,asset:DEVNET_USDC,amount:String(amount),payTo,maxTimeoutSeconds:300,extra:{memo}};}
  override async verify(){return {isValid:true,payer:this.payer};}
  override async settle(payload:PaymentPayload,requirements:PaymentRequirements){this.calls++;const receipt={success:true,network:DEVNET_CAIP,transaction:bs58.encode(nacl.randomBytes(64)),payer:this.payer,amount:requirements.amount};this.receipts.set(transactionHash(payload),receipt);if(this.loseReply){this.loseReply=false;throw new Error('Fixture lost response');}return receipt;}
  override async recover(payload:PaymentPayload){return this.receipts.get(transactionHash(payload))||null;}
}
function signedFixture(q:any):PaymentPayload{
  const key=Keypair.generate();const tx=new VersionedTransaction(new TransactionMessage({payerKey:key.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58(),instructions:[new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[],data:Buffer.from(q.requirements.extra.memo)})]}).compileToV0Message());tx.sign([key]);
  return {x402Version:2,accepted:q.requirements,resource:{url:q.resource_url},payload:{transaction:Buffer.from(tx.serialize()).toString('base64')}};
}
let db:Database,domain:Domain,session:string,wallet:string,agent:any,service:any;
async function runAll(){for(let i=0;i<20;i++){const claim=await domain.worker('claim',{worker:'product-test'});if(!claim)return;const result=await executeRun(claim,(op,b)=>domain.worker(op,b));await domain.worker('complete',{id:claim.job.id,lease:claim.job.lease,...result});}}
beforeAll(async()=>{
  process.env.APP_MODE='demo';process.env.WALLET_ENCRYPTION_KEY='4'.repeat(64);delete process.env.OPENROUTER_API_KEY;delete process.env.SEARCH_PROVIDER_API_KEY;
  db=await database(true);await migrate(db);domain=new Domain(db);
  const keys=nacl.sign.keyPair();wallet=bs58.encode(keys.publicKey);const challenge=await domain.dispatch('auth/challenge',{wallet});session=(await domain.dispatch('auth/verify',{id:challenge.id,wallet,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.message),keys.secretKey))})).session;
  const input=agentSchema.parse({name:'PRODUCT WORKER',ticker:'PRD',description:'Public sourced evidence and persistent records.',mission:'Research public documentation and explain evidence.',jobType:'Researcher',category:'Research',tags:[],tools:['web_search'],tokenMode:'sandbox',initialBudget:10,policy:defaultPolicy,services:[serviceSchema.parse({name:'Product research',description:'Research public evidence and return structured sources.',price:.01})]});
  agent=await domain.dispatch('agents/create',{input,key:randomUUID()},session);service=(await domain.dispatch('services/list'))[0];await runAll();
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();delete process.env.OPENROUTER_API_KEY;delete process.env.ADMIN_WALLETS;delete process.env.AGENTS_ENABLED;delete process.env.AUTONOMOUS_PAYMENTS_ENABLED;});
afterAll(async()=>{await db.close();});

describe('V1 controls and durable payment boundary',()=>{
  it('enforces hourly, asset, network, counterparty and kill policies',()=>{
    const ctx={amount:1000,balance:100000,spentToday:0,spentHour:0,purchasesToday:0,purchasesRun:0,spentRun:0,category:'Research',network:'devnet',asset:DEVNET_USDC,counterparty:randomUUID(),emergency:false,paused:false};const p={...defaultPolicy,autoHire:true};
    expect(()=>authorizePurchase(p,ctx)).not.toThrow();
    expect(()=>authorizePurchase(p,{...ctx,spentHour:250000})).toThrow('Hourly');
    expect(()=>authorizePurchase(p,{...ctx,asset:'SOL'})).toThrow('asset');
    expect(()=>authorizePurchase(p,{...ctx,network:'mainnet'})).toThrow('network');
    expect(()=>authorizePurchase({...p,counterparties:[randomUUID()]},ctx)).toThrow('allowlist');
    expect(()=>authorizePurchase({...p,killSwitch:true},ctx)).toThrow('paused');
  });
  it('restricts administrator operations and records authorized switches',async()=>{
    await expect(domain.dispatch('admin/status',{},session)).rejects.toThrow('Administrator');process.env.ADMIN_WALLETS=wallet;
    await domain.dispatch('admin/switch',{kind:'agents',disabled:true},session);expect(await domain.worker('claim',{worker:'stopped'})).toBeNull();
    await domain.dispatch('admin/switch',{kind:'agents',disabled:false},session);expect((await domain.dispatch('admin/status',{},session)).audit.length).toBe(2);
  });
  it('supports owner schedule/service updates while denying mint replacement',async()=>{
    const a=(await domain.dispatch('agents/get',{id:agent.id})).agent;
    await domain.dispatch('agents/update',{id:a.id,input:{mission:a.mission,policy:a.config.policy,schedule:'interval',intervalMinutes:15}},session);
    expect((await domain.dispatch('agents/get',{id:a.id})).agent.next_run_at).toBeTruthy();
    await domain.dispatch('agents/service-update',{id:a.id,input:{serviceId:service.id,price:.015,active:true}},session);
    expect((await domain.dispatch('services/get',{id:service.id})).price).toBe(.015);
    await expect(domain.dispatch('agents/update',{id:a.id,input:{mission:a.mission,policy:a.config.policy,mint:'replace'}},session)).rejects.toThrow();
  });
  it('enforces immutable identity and unique token attachment in PostgreSQL',async()=>{
    const token=(await one(db,"INSERT INTO solana_tokens(mint,network,name,symbol,decimals) VALUES($1,'devnet','Identity','ID',6) RETURNING id",[Keypair.generate().publicKey.toBase58()]))!;
    const id=randomUUID();await db.query("INSERT INTO businesses(id,creator_profile_id,token_id,mode,mandate,routing_status) SELECT $1,creator_profile_id,$2,'DEVNET_TOKEN',mission,'PENDING' FROM agents WHERE id=$3",[id,token.id,agent.id]);await db.query("INSERT INTO agents(id,business_id,slug,creator_profile_id,name,ticker,description,mission,job_type,category,config,token_id) SELECT $1,$1,$2,creator_profile_id,name,ticker,description,mission,job_type,category,config,$3 FROM agents WHERE id=$4",[id,'identity-'+id,token.id,agent.id]);
    await expect(db.query('UPDATE agents SET token_id=NULL WHERE id=$1',[id])).rejects.toThrow('immutable');
    await expect(db.query('UPDATE solana_tokens SET mint=$1 WHERE id=$2',[Keypair.generate().publicKey.toBase58(),token.id])).rejects.toThrow('immutable');
    await expect(db.query("INSERT INTO agents(business_id,slug,creator_profile_id,name,ticker,description,mission,job_type,category,config,token_id) SELECT business_id,$1,creator_profile_id,name,ticker,description,mission,job_type,category,config,token_id FROM agents WHERE id=$2",['duplicate-'+id,id])).rejects.toThrow('unique constraint');
  });
  it('settles once after a lost response and keeps devnet money out of compute credit',async()=>{
    const signer=new EncryptedDevSigner().provision();await db.query("INSERT INTO wallet_accounts(agent_id,network,public_address,signer_provider,encrypted_key_reference) VALUES($1,'devnet',$2,'encrypted-dev',$3)",[agent.id,signer.address,signer.encrypted]);
    const provider=new FacilitatorFixture(),payments=new ServicePayments(db,provider),before=(await domain.dispatch('agents/get',{id:agent.id})).agent.metrics.balance;
    const q=await payments.quote(service.id,{topic:'Durable settlement test'},randomUUID());const payload=signedFixture(q);
    provider.loseReply=true;await expect(payments.accept(q.id,payload)).rejects.toThrow('lost response');
    expect((await one(db,'SELECT status FROM payment_attempts WHERE id=$1',[q.id]))!.status).toBe('settling');
    const paid=await payments.accept(q.id,payload);expect(provider.calls).toBe(1);expect((await payments.accept(q.id,payload)).jobId).toBe(paid.jobId);
    await runAll();const detail=await domain.dispatch('jobs/get',{id:paid.jobId});expect(detail.status).toBe('succeeded');expect(detail.receipt.network).toBe('devnet');
    const revenue=await one(db,"SELECT amount,network FROM ledger_entries WHERE job_id=$1 AND category='revenue'",[paid.jobId]);expect(revenue?.network).toBe('devnet');expect(Number(revenue?.amount)).toBe(15000);
    expect((await domain.dispatch('agents/get',{id:agent.id})).agent.metrics.balance).toBeLessThan(before);
  });
  it('binds the signed memo and canonical terms to one request',async()=>{
    const provider=new FacilitatorFixture(),payments=new ServicePayments(db,provider),key=randomUUID();
    const q=await payments.quote(service.id,{topic:'Original'},key),other=await payments.quote(service.id,{topic:'Other'},randomUUID());
    await expect(payments.quote(service.id,{topic:'Changed'},key)).rejects.toThrow('different input');
    const payload=signedFixture(q);expect(()=>bindPayment({...payload,accepted:other.requirements},other)).toThrow('exact service request');
    await expect(payments.accept(q.id,{...payload,x402Version:1})).rejects.toThrow('stored quote');
  });
  it('recovers a process crash during verification after its lease expires',async()=>{
    const provider=new FacilitatorFixture(),payments=new ServicePayments(db,provider),q=await payments.quote(service.id,{topic:'Crash before verification reply'},randomUUID()),payload=signedFixture(q);
    await db.query("UPDATE payment_attempts SET status='verifying',payment_payload=$1,transaction_hash=$2,lease_until=now()-interval '1 second' WHERE id=$3",[JSON.stringify(payload),transactionHash(payload),q.id]);
    await payments.recoverPending();expect(provider.calls).toBe(1);const row=(await one(db,'SELECT status,request_id FROM payment_attempts WHERE id=$1',[q.id]))!;expect(row.status).toBe('settled');expect(row.request_id).toBeTruthy();await runAll();
  });
  it('marks failed settled work refund-required without issuing fake credits',async()=>{
    const payments=new ServicePayments(db,new FacilitatorFixture()),q=await payments.quote(service.id,{topic:'Seller fails after settlement'},randomUUID());const paid=await payments.accept(q.id,signedFixture(q));
    const claim=await domain.worker('claim',{worker:'failure'});expect(claim.job.id).toBe(paid.jobId);
    await domain.worker('fail',{id:claim.job.id,lease:claim.job.lease,error:'Test seller failure',permanent:true});
    expect((await domain.dispatch('jobs/get',{id:paid.jobId})).receipt.status).toBe('refund_required');
    expect((await db.query("SELECT id FROM ledger_entries WHERE job_id=$1 AND category='refund'",[paid.jobId])).rows).toHaveLength(0);
  });
  it('recovers a lost refund reply without signing or crediting twice',async()=>{
    const p=(await one(db,"SELECT * FROM payments WHERE status='refund_required' LIMIT 1"))!;
    let signed=0,sent=0;let landed=false;
    const provider:RefundProvider={prepare:async payment=>{expect(payment.payer_address).toBe(p.payer_address);expect(Number(payment.amount)).toBe(Number(p.amount));signed++;return {wire_transaction:'fixture-refund',signature:'fixture-refund-receipt',last_valid_block_height:100};},status:async()=>landed?'confirmed':'missing',finalizedHeight:async()=>50,send:async()=>{sent++;landed=true;throw new Error('Lost refund response');}};
    await expect(domain.dispatch('admin/refund',{id:p.id},session)).rejects.toThrow('Administrator');
    await expect(refundDevnetPayment(db,p.id,true,provider)).rejects.toThrow('administrator');
    await expect(refundDevnetPayment(db,p.id,false,provider)).rejects.toThrow('Lost refund response');
    expect((await one(db,'SELECT status FROM payments WHERE id=$1',[p.id]))!.status).toBe('refund_required');
    await refundDevnetPayment(db,p.id,true,provider);await refundDevnetPayment(db,p.id,false,provider);
    expect(signed).toBe(1);expect(sent).toBe(1);expect((await one(db,'SELECT refund_signature FROM payments WHERE id=$1',[p.id]))!.refund_signature).toBe('fixture-refund-receipt');
    expect(Number((await one(db,"SELECT count(*) n FROM activity_events WHERE event_type='refunded' AND description='Actual devnet USDC returned to original payer'"))!.n)).toBe(1);
  });
  it('requires a fresh administrator action after finalized refund expiry',async()=>{
    const payments=new ServicePayments(db,new FacilitatorFixture()),q=await payments.quote(service.id,{topic:'Expiry recovery'},randomUUID()),paid=await payments.accept(q.id,signedFixture(q));
    const claim=await domain.worker('claim',{worker:'refund-expiry'});await domain.worker('fail',{id:claim.job.id,lease:claim.job.lease,error:'Test failure',permanent:true});
    const p=(await one(db,'SELECT payment_id FROM service_requests WHERE job_id=$1',[paid.jobId]))!;
    let signed=0;let landed=false;
    const provider:RefundProvider={prepare:async()=>{signed++;return {wire_transaction:'expiry-fixture',signature:`expiry-fixture-${signed}`,last_valid_block_height:signed===1?40:100};},status:async()=>landed?'confirmed':'missing',finalizedHeight:async()=>50,send:async()=>{landed=true;}};
    await expect(refundDevnetPayment(db,p.payment_id,false,provider)).rejects.toThrow('did not land');
    await expect(refundDevnetPayment(db,p.payment_id,true,provider)).rejects.toThrow('administrator');expect(signed).toBe(1);
    await refundDevnetPayment(db,p.payment_id,false,provider);expect(signed).toBe(2);
    const attempt=(await one(db,'SELECT * FROM refund_attempts WHERE payment_id=$1',[p.payment_id]))!;expect(attempt.prior_attempts[0].signature).toBe('expiry-fixture-1');expect(attempt.status).toBe('confirmed');
  });
  it('keeps production token launching locked without separate approval',()=>{
    const keys=['MAINNET_ENABLED','ENABLE_MAINNET_TOKEN_LAUNCH','MAINNET_LAUNCH_APPROVAL_REFERENCE'] as const;
    for(const key of keys)vi.stubEnv(key,'');
    expect(requireMainnetLaunchApproval).toThrow('separately approved');vi.stubEnv('ENABLE_MAINNET_TOKEN_LAUNCH','true');expect(requireMainnetLaunchApproval).toThrow();vi.unstubAllEnvs();
  });
  it('persists an index across jobs and suppresses unchanged watcher activity',async()=>{
    await db.query("UPDATE agents SET job_type='Indexer' WHERE id=$1",[agent.id]);await domain.dispatch('agents/run',{id:agent.id,key:randomUUID()},session);await runAll();
    expect((await db.query('SELECT url FROM indexed_records WHERE agent_id=$1',[agent.id])).rows.length).toBeGreaterThan(0);
    await db.query("UPDATE agents SET job_type='Watcher' WHERE id=$1",[agent.id]);await domain.dispatch('agents/run',{id:agent.id,key:randomUUID()},session);await runAll();
    const count=Number((await one(db,'SELECT count(*) n FROM activity_events WHERE agent_id=$1 AND public',[agent.id]))!.n);
    await domain.dispatch('agents/run',{id:agent.id,key:randomUUID()},session);await runAll();expect(Number((await one(db,'SELECT count(*) n FROM activity_events WHERE agent_id=$1 AND public',[agent.id]))!.n)).toBe(count);
  });
  it('terminates safely and retains the identity/history',async()=>{
    const request=await domain.dispatch('agents/run',{id:agent.id,key:randomUUID()},session);await domain.dispatch('agents/terminate',{id:agent.id},session);
    expect((await domain.dispatch('jobs/get',{id:request.jobId})).status).toBe('cancelled');expect((await domain.dispatch('agents/get',{id:agent.id})).agent.terminated_at).toBeTruthy();
    await expect(domain.dispatch('agents/resume',{id:agent.id},session)).rejects.toThrow('terminated');
  });
});

describe('live provider structured generation contract',()=>{
  const schema={type:'object',properties:{summary:{type:'string'}},required:['summary'],additionalProperties:false};
  async function args(){vi.spyOn(modelCatalogModule,'openRouterBrain').mockResolvedValue({id:'openai/gpt-6-luna',name:'Fixture',provider:'Fixture',inputPrice:1,outputPrice:2,context:128000,costTier:'Test',speed:'Test',development:false});const a=(await domain.dispatch('agents/get',{id:agent.id})).agent as Agent;process.env.OPENROUTER_API_KEY='fixture-only';process.env.OPENROUTER_MODEL='openai/gpt-6-luna';process.env.MODEL_INPUT_PRICE_PER_MILLION='1';process.env.MODEL_OUTPUT_PRICE_PER_MILLION='2';a.config={...a.config,brain:'openai/gpt-6-luna'};return {agent:a,system:'Evidence only',data:{topic:'Example'},schema,maxTokens:100,budget:20000,timeout:5000};}
  it('rejects a selected brain after it is removed from the configured allowlist',async()=>{
    const input=await args();input.agent.config.brain='disabled/model';const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    await expect(new StructuredModelProvider().generateStructured(input)).rejects.toThrow('not enabled');expect(fetchMock).not.toHaveBeenCalled();
  });
  it('retries malformed output once and records usage from both responses',async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({choices:[{message:{content:'invalid'}}],usage:{cost:.0001,prompt_tokens:10,completion_tokens:4}})).mockResolvedValueOnce(Response.json({choices:[{message:{content:'{"summary":"Valid evidence"}'}}],usage:{cost:.0002,prompt_tokens:20,completion_tokens:8}}));vi.stubGlobal('fetch',fetchMock);
    const checkpoints:number[]=[];const result=await new StructuredModelProvider().generateStructured({...await args(),checkpoint:async cost=>{checkpoints.push(cost);}});
    expect(fetchMock).toHaveBeenCalledTimes(2);expect(result.cost).toBe(300);expect(result.usage.inputTokens).toBe(30);expect(result.usage.outputTokens).toBe(12);expect(checkpoints.at(-1)).toBe(300);
  });
  it('compiles the actual Zod tool-plan schema and sends strict provider-compatible objects',async()=>{
    const fetchMock=vi.fn().mockImplementation(async(_url,init)=>{const body=JSON.parse(init.body);expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);return Response.json({choices:[{message:{content:'{"steps":[]}'}}],usage:{cost:.0001}});});vi.stubGlobal('fetch',fetchMock);
    const input=await args();const result=await new OpenRouterProvider().plan(input.agent,{topic:'Public documentation'});expect(result.plan.steps).toEqual([]);expect(result.cost).toBe(100);
  });
  it('fails after two invalid responses without accepting corrupt state',async()=>{
    const fetchMock=vi.fn().mockImplementation(async()=>Response.json({choices:[{message:{content:'{}'}}],usage:{cost:.0001}}));vi.stubGlobal('fetch',fetchMock);
    await expect(new StructuredModelProvider().generateStructured(await args())).rejects.toThrow('twice');expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('upgrades legacy untyped source arrays only for provider generation',async()=>{
    const original={type:'object',properties:{summary:{type:'string'},sources:{type:'array'}},required:['summary'],additionalProperties:true};
    vi.stubGlobal('fetch',vi.fn().mockImplementation(async(_url,init)=>{const schema=JSON.parse(init.body).response_format.json_schema.schema;expect(schema.properties.sources.items.properties.url.type).toBe('string');return Response.json({choices:[{message:{content:'{"summary":"Sourced result","sources":[]}'}}],usage:{cost:.0001}});}));
    await new StructuredModelProvider().generateStructured({...await args(),schema:original});expect(original.properties.sources).toEqual({type:'array'});
  });
});

