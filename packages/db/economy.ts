import { randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import { AppError, authorizePurchase, ensure, micro, usd, type Policy } from '../core';
import { hash } from '../core/security';
import { one, type Queryable, type Row } from './connection';
import { metrics } from './metrics';
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
export function compileSchema(schema:any) {
  const serialized=JSON.stringify(schema);
  ensure(serialized.length<12000 && !/"(?:\$ref|pattern|patternProperties)"\s*:/.test(serialized),'INVALID_SCHEMA','Schema references and regular expressions are not supported');
  try{return ajv.compile(schema);}catch{throw new AppError('INVALID_SCHEMA','Invalid JSON schema');}
}
export function validateSchema(schema: any, input: any) {
  const valid=compileSchema(schema)(input);
  ensure(valid,'SCHEMA_MISMATCH','Input or output does not match the service schema');
}
export async function event(tx: Queryable, agent: string, action: string, description: string, options: { related?: string; amount?: number; job?: string; public?: boolean; request?: string } = {}) {
  await tx.query('INSERT INTO activity_events(agent_id,related_agent_id,job_id,service_request_id,event_type,action,amount,description,public) VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8)',[agent,options.related||null,options.job||null,options.request||null,action,options.amount??null,description,options.public!==false]);
}
export async function ledger(tx: Queryable, agent: string, direction: string, category: string, amount: number, key: string, extra: { payment?: string; request?: string; counterparty?: string; job?: string; external?: boolean }={}) {
  await tx.query(`INSERT INTO ledger_entries(agent_id,direction,category,amount,idempotency_key,payment_id,service_request_id,counterparty_agent_id,job_id,external) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(idempotency_key) DO NOTHING`,[agent,direction,category,amount,key,extra.payment||null,extra.request||null,extra.counterparty||null,extra.job||null,extra.external||false]);
}
export async function chargeAttempt(tx:Queryable,job:Row,status:'succeeded'|'failed') {
  const cost=Number(job.payload.measuredCost||0),runs=job.payload.usageRuns||[];
  if(cost)await ledger(tx,job.agent_id,'debit','compute',cost,`compute:${job.id}:attempt:${job.attempts}`,{job:job.id});
  for(const run of runs)await tx.query(`INSERT INTO model_tool_runs(job_id,agent_id,kind,provider,model_or_tool,cost_amount,status,safe_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(job_id,model_or_tool) DO NOTHING`,[job.id,job.agent_id,run.kind,run.provider,`${job.attempts}:${run.name}`,run.cost,status,JSON.stringify(run.metadata||{})]);
}
export interface PaymentProvider { name: string; reserve(tx: Queryable, service: Row, profile: Row, buyer: Row | undefined, key: string): Promise<Row>; }
export class DevPaymentProvider implements PaymentProvider {
  name='dev';
  async reserve(tx: Queryable, service: Row, profile: Row, buyer: Row | undefined, key: string) {
    const amount = Number(service.price_amount);
    if (!buyer) {
      const debit=await one(tx,'UPDATE profiles SET credits=credits-$1 WHERE id=$2 AND credits>=$1 RETURNING id',[amount,profile.id]);
      ensure(debit,'INSUFFICIENT_CREDITS','Not enough test credits');
    }
    const payment=(await one(tx,`INSERT INTO payments(provider,network,payer_address,payee_address,amount,status,reference,idempotency_key) VALUES('dev','sandbox',$1,$2,$3,'reserved',$4,$5) RETURNING *`,[buyer?.id||profile.primary_wallet,service.agent_id,amount,`dev:${randomUUID()}`,key]))!;
    if (buyer) await ledger(tx,buyer.id,'debit','service_purchase',amount,`purchase:${payment.id}`,{payment:payment.id,counterparty:service.agent_id});
    return payment;
  }
}
export async function purchase(tx: Queryable, profile: Row, serviceId: string, input: any, key: string, buyerId?: string, parentJobId?: string) {
  const scopedKey=hash(`${profile.id}:request:${key}`);
  const previous=await one(tx,'SELECT * FROM service_requests WHERE idempotency_key=$1',[scopedKey]);
  if (previous) {
    ensure(previous.service_id===serviceId && JSON.stringify(previous.input)===JSON.stringify(input) && (previous.requester_agent_id||undefined)===buyerId,'IDEMPOTENCY_CONFLICT','This key was already used for a different request',409);
    return { id: previous.id, jobId: previous.job_id };
  }
  const s=await one(tx,'SELECT s.*,a.paused,a.creator_profile_id,a.config FROM agent_services s JOIN agents a ON a.id=s.agent_id WHERE s.id=$1 AND s.active AND a.visibility=\'public\' FOR UPDATE OF a',[serviceId]);
  ensure(s && !s.paused,'SERVICE_UNAVAILABLE','Service is unavailable',409);
  validateSchema(s.request_schema,input);
  const seller=await one(tx,'SELECT * FROM agents WHERE id=$1',[s.agent_id]);
  ensure((await metrics(tx,seller!)).balance>=seller!.config.policy.maxRunCost,'PROVIDER_LOW_COMPUTE','Provider requires more compute funding',409);
  let buyer: Row | undefined;
  if (buyerId) {
    buyer=await one(tx,'SELECT * FROM agents WHERE id=$1 FOR UPDATE',[buyerId]);
    ensure(buyer && buyer.creator_profile_id===profile.id,'FORBIDDEN','You do not own the requesting agent',403);
    ensure(buyer.id!==s.agent_id,'SELF_PURCHASE','An agent cannot hire itself');
    ensure(buyer.config.tools.includes('marketplace'),'TOOL_DENIED','Marketplace tool is disabled');
    const usage=(await one(tx,`SELECT COALESCE(sum(p.amount),0) spend,count(*) n FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.requester_agent_id=$1 AND r.created_at>date_trunc('day',now()) AND p.status<>'refunded'`,[buyerId]))!;
    const run=parentJobId ? await one(tx,`SELECT COALESCE(sum(p.amount),0) spend,count(*) n FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.parent_job_id=$1 AND p.status<>'refunded'`,[parentJobId]) : {spend:0,n:0};
    const parent=parentJobId?await one(tx,'SELECT payload FROM jobs WHERE id=$1',[parentJobId]):undefined;
    authorizePurchase(buyer.config.policy as Policy,{amount:Number(s.price_amount),balance:micro((await metrics(tx,buyer)).balance),spentToday:Number(usage.spend),purchasesToday:Number(usage.n),purchasesRun:Number(run!.n),spentRun:Number(run!.spend)+Number(parent?.payload.measuredCost||0),category:s.category,network:'sandbox',emergency:process.env.EMERGENCY_PAUSE==='true',paused:buyer.paused});
  }
  const payment=await new DevPaymentProvider().reserve(tx,s,profile,buyer,scopedKey);
  const job=(await one(tx,`INSERT INTO jobs(agent_id,type,trigger_type,payload,idempotency_key) VALUES($1,'SERVICE','paid',$2,$3) RETURNING id`,[s.agent_id,JSON.stringify({input,serviceId:s.id}),`request:${scopedKey}`]))!;
  const request=(await one(tx,`INSERT INTO service_requests(service_id,requester_profile_id,requester_agent_id,provider_agent_id,parent_job_id,input,payment_id,job_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[s.id,profile.id,buyerId||null,s.agent_id,parentJobId||null,JSON.stringify(input),payment.id,job.id,scopedKey]))!;
  await event(tx,buyerId||s.agent_id,'hired',`${s.name} requested`,{related:buyerId?s.agent_id:undefined,amount:Number(s.price_amount),job:job.id,request:request.id});
  return {id:request.id,jobId:job.id};
}
export async function settle(tx: Queryable, job: Row, output: any) {
  const r=await one(tx,'SELECT r.*,a.creator_profile_id FROM service_requests r JOIN agents a ON a.id=r.provider_agent_id WHERE job_id=$1 FOR UPDATE OF r',[job.id]);
  if (!r || r.status==='succeeded') return;
  const s=(await one(tx,'SELECT * FROM agent_services WHERE id=$1',[r.service_id]))!;
  validateSchema(s.response_schema,output);
  const p=(await one(tx,"UPDATE payments SET status='settled',confirmed_at=now() WHERE id=$1 AND status='reserved' RETURNING *",[r.payment_id]))!;
  ensure(p,'PAYMENT_STATE','Payment cannot be settled',409);
  await tx.query("UPDATE service_requests SET status='succeeded',output=$1,completed_at=now() WHERE id=$2",[JSON.stringify(output),r.id]);
  await ledger(tx,r.provider_agent_id,'credit','revenue',Number(p.amount),`revenue:${p.id}`,{payment:p.id,request:r.id,counterparty:r.requester_agent_id,job:job.id,external:r.requester_profile_id!==r.creator_profile_id});
  if (r.requester_agent_id) {
    await tx.query(`INSERT INTO agent_relationships(buyer_agent_id,seller_agent_id,jobs_count,total_paid) VALUES($1,$2,1,$3) ON CONFLICT(buyer_agent_id,seller_agent_id) DO UPDATE SET jobs_count=agent_relationships.jobs_count+1,total_paid=agent_relationships.total_paid+excluded.total_paid,last_activity_at=now()`,[r.requester_agent_id,r.provider_agent_id,p.amount]);
    await event(tx,r.requester_agent_id,'received','Purchased service result delivered',{related:r.provider_agent_id,job:job.id,request:r.id});
    // Provider results return to the caller as private task context, never as public free-form memory.
    await tx.query(`INSERT INTO agent_memories(agent_id,memory_type,summary,data,source_job_id,public) VALUES($1,'purchased-result',$2,$3,$4,false) ON CONFLICT(agent_id,source_job_id) DO NOTHING`,[r.requester_agent_id,`Purchased ${s.name}: ${String(output.summary).slice(0,1200)}`,JSON.stringify({providerJobId:job.id,result:output}),job.id]);
    if(r.parent_job_id) await tx.query(`UPDATE jobs SET output=jsonb_set(COALESCE(output,'{}'),'{delegation}',COALESCE(output->'delegation','{}')||$1::jsonb) WHERE id=$2 AND status='succeeded'`,[JSON.stringify({status:'succeeded',jobId:job.id,service:s.name}),r.parent_job_id]);
  }
  await event(tx,r.provider_agent_id,'earned',`${s.name} delivered`,{related:r.requester_agent_id,amount:Number(p.amount),job:job.id,request:r.id});
}
export async function refund(tx: Queryable, jobId: string) {
  const r=await one(tx,"SELECT r.*,p.amount,p.status payment_status FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.job_id=$1 FOR UPDATE OF r,p",[jobId]);
  if (!r || r.payment_status!=='reserved') return;
  await tx.query("UPDATE payments SET status='refunded' WHERE id=$1",[r.payment_id]);
  await tx.query("UPDATE service_requests SET status='failed',completed_at=now() WHERE id=$1",[r.id]);
  if(r.parent_job_id)await tx.query(`UPDATE jobs SET output=jsonb_set(COALESCE(output,'{}'),'{delegation}',COALESCE(output->'delegation','{}')||$1::jsonb) WHERE id=$2 AND status='succeeded'`,[JSON.stringify({status:'failed',jobId}),r.parent_job_id]);
  if (r.requester_agent_id) await ledger(tx,r.requester_agent_id,'credit','refund',Number(r.amount),`refund:${r.payment_id}`,{payment:r.payment_id,counterparty:r.provider_agent_id});
  else await tx.query('UPDATE profiles SET credits=credits+$1 WHERE id=$2',[r.amount,r.requester_profile_id]);
  await event(tx,r.provider_agent_id,'refunded',`Service failed; ${usd(Number(r.amount))} test USDC returned`,{job:jobId});
}
