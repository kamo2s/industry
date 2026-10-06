import {settleProviderRun} from './provider-budget';
import {supplierAvailable} from './supplier-availability';
import {testEconomy} from '../core/environment';
import { notify,notifyOwner } from './notifications';
import { randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import { AppError, authorizePurchase, ensure, micro, usd, type Policy } from '../core';
import { hash } from '../core/security';
import { requireEnabled, operatingSpend } from './controls';
import { one, type Queryable, type Row } from './connection';
import { metrics } from './metrics';
import { account,businessAccount,businessId,customerAccount,syncCustomer,transfer,type AccountKind } from './journal';
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
export async function ledger(tx: Queryable, agent: string, direction: string, category: string, amount: number, key: string, extra: { payment?: string; request?: string; counterparty?: string; job?: string; external?: boolean; network?:string; transaction?:string; account?:AccountKind }={}) {
  const old=await one(tx,'SELECT * FROM ledger_entries WHERE idempotency_key=$1',[key]);
  if(old){ensure(old.agent_id===agent&&old.direction===direction&&old.category===category&&Number(old.amount)===amount,'IDEMPOTENCY_CONFLICT','Ledger key conflicts with an existing entry',409);return;}
  let transaction=extra.transaction;
  if(amount>0&&!transaction){
    const kind:AccountKind=extra.network==='devnet'?'EXTERNAL_CUSTODY':extra.account||(['compute','tool','funding'].includes(category)?'BUSINESS_COMPUTE':'BUSINESS_OPERATING');
    const own=await businessAccount(tx,agent,kind,extra.network==='devnet'?'DEVNET_USDC':undefined);
    const other=await account(tx,['compute','tool'].includes(category)?'PLATFORM_COMPUTE_EXPENSE':'TREASURY_CLEARING',undefined,own.unit);
    transaction=await transfer(tx,{key:'entry:'+key,debit:direction==='debit'?own:other,credit:direction==='credit'?own:other,amount,type:category,reference:extra.payment||extra.job||key,businessId:await businessId(tx,agent),metadata:{agentId:agent,jobId:extra.job||null,paymentId:extra.payment||null,requestId:extra.request||null,external:extra.external||false,legacySeed:key.startsWith('seed-')}});
  }
  await tx.query(`INSERT INTO ledger_entries(agent_id,direction,category,amount,idempotency_key,payment_id,service_request_id,counterparty_agent_id,job_id,external,network,transaction_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[agent,direction,category,amount,key,extra.payment||null,extra.request||null,extra.counterparty||null,extra.job||null,extra.external||false,extra.network||'sandbox',transaction||null]);
}
export async function chargeAttempt(tx:Queryable,job:Row,status:'succeeded'|'failed') {
  const cost=Number(job.payload.measuredCost||0),runs=job.payload.usageRuns||[];
  // Supplier waits reuse retry counts, but each execution has a unique run ID.
  const execution=job.run_id ? `run:${job.run_id}` : `attempt:${job.attempts}`;
  await settleProviderRun(tx,job);
  if(cost){const credit=await businessAccount(tx,job.agent_id,'BUSINESS_COMPUTE');const unpaid=Math.max(0,cost-Number(credit.balance));if(unpaid)await transfer(tx,{key:`overage:${job.id}:${execution}`,debit:await businessAccount(tx,job.agent_id,'BUSINESS_COMPUTE_DEBT'),credit,amount:unpaid,type:'compute-overage-liability',reference:job.id,metadata:{measured:true}});}
  if(cost)await ledger(tx,job.agent_id,'debit','compute',cost,`compute:${job.id}:${execution}`,{job:job.id});
  for(const run of runs)await tx.query(`INSERT INTO model_tool_runs(job_id,agent_id,kind,provider,model_or_tool,cost_amount,status,safe_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(job_id,model_or_tool) DO NOTHING`,[job.id,job.agent_id,run.kind,run.provider,`${execution}:${run.name}`,run.cost,status,JSON.stringify(run.metadata||{})]);
}
export interface PaymentProvider { name: string; reserve(tx: Queryable, service: Row, profile: Row, buyer: Row | undefined, key: string): Promise<Row>; }
export class DevPaymentProvider implements PaymentProvider {
  name='dev';
  async reserve(tx: Queryable, service: Row, profile: Row, buyer: Row | undefined, key: string) {
    const amount = Number(service.price_amount);
    const payment=(await one(tx,`INSERT INTO payments(provider,network,payer_address,payee_address,amount,status,reference,idempotency_key) VALUES('internal','sandbox',$1,$2,$3,'reserved',$4,$5) RETURNING *`,[buyer?.id||profile.primary_wallet,service.agent_id,amount,`internal:${randomUUID()}`,key]))!;
    const debit=buyer?await businessAccount(tx,buyer.id,'BUSINESS_OPERATING'):await customerAccount(tx,profile),escrow=await account(tx,'SETTLEMENT_ESCROW',{reference:payment.id});
    ensure(Number(debit.balance)>=amount,buyer?'INSUFFICIENT_BALANCE':'INSUFFICIENT_CREDITS',buyer?'Insufficient operating balance':'Not enough test credits');
    const posted=await transfer(tx,{key:'reserve:'+payment.id,debit,credit:escrow,amount,type:'service-reservation',reference:payment.id,metadata:{serviceId:service.id,buyerBusinessId:buyer?.business_id||null,sellerBusinessId:await businessId(tx,service.agent_id)}});
    await tx.query('UPDATE payments SET debit_account=$1,escrow_account=$2 WHERE id=$3',[debit.id,escrow.id,payment.id]);
    if(buyer)await ledger(tx,buyer.id,'debit','service_purchase',amount,`purchase:${payment.id}`,{payment:payment.id,counterparty:service.agent_id,transaction:posted});else await syncCustomer(tx,profile.id);
    return payment;
  }
}
export async function purchase(tx: Queryable, profile: Row, serviceId: string, input: any, key: string, buyerId?: string, parentJobId?: string) {
  ensure(testEconomy()||process.env.INTERNAL_LEDGER_ENABLED==='true','INTERNAL_PAYMENTS_DISABLED','Internal payments require an operator-enabled and funded ledger',503);
  await requireEnabled(tx,'payments');
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
  ensure(!seller!.terminated_at&&!seller!.config.policy.killSwitch,'SERVICE_UNAVAILABLE','Service is unavailable',409);ensure(!seller!.token_id||(await one(tx,'SELECT routing_status FROM businesses WHERE id=$1',[seller!.business_id]))?.routing_status==='VERIFIED','FEE_ROUTING_VERIFICATION_FAILED','FEE ROUTING VERIFICATION FAILED',409);
  ensure((await metrics(tx,seller!)).balance>=seller!.config.policy.maxRunCost,'PROVIDER_LOW_COMPUTE','Provider requires more compute funding',409);
  if(buyerId)ensure(await supplierAvailable(tx,seller!),'SERVICE_UNAVAILABLE','Provider cannot accept another order within current execution limits',409);
  let buyer: Row | undefined;
  if (buyerId) {
    buyer=await one(tx,'SELECT * FROM agents WHERE id=$1 FOR UPDATE',[buyerId]);
    ensure(buyer && buyer.creator_profile_id===profile.id,'FORBIDDEN','You do not own the requesting agent',403);
    ensure(buyer.id!==s.agent_id,'SELF_PURCHASE','An agent cannot hire itself');
    ensure(buyer.config.tools.includes('marketplace'),'TOOL_DENIED','Marketplace tool is disabled');
    const usage=(await one(tx,`SELECT COALESCE(sum(p.amount),0) spend,count(*) n FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.requester_agent_id=$1 AND r.created_at>date_trunc('day',now()) AND p.status<>'refunded'`,[buyerId]))!;
    const run=parentJobId ? await one(tx,`SELECT COALESCE(sum(p.amount),0) spend,count(*) n FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.parent_job_id=$1 AND p.status<>'refunded'`,[parentJobId]) : {spend:0,n:0};
    const parent=parentJobId?await one(tx,'SELECT payload FROM jobs WHERE id=$1',[parentJobId]):undefined;
    const spend=await operatingSpend(tx,buyer.id);
    authorizePurchase(buyer.config.policy as Policy,{amount:Number(s.price_amount),balance:micro((await metrics(tx,buyer)).operatingBalance),spentToday:spend.day,spentHour:spend.hour,purchasesToday:Number(usage.n),purchasesRun:Number(run!.n),spentRun:Number(run!.spend)+Number(parent?.payload.measuredCost||0),category:s.category,network:'sandbox',counterparty:s.agent_id,emergency:process.env.EMERGENCY_PAUSE==='true',paused:buyer.paused});
  }
  const payment=await new DevPaymentProvider().reserve(tx,s,profile,buyer,scopedKey);
  const job=(await one(tx,`INSERT INTO jobs(agent_id,type,trigger_type,payload,idempotency_key) VALUES($1,'SERVICE','paid',$2,$3) RETURNING id`,[s.agent_id,JSON.stringify({input,serviceId:s.id}),`request:${scopedKey}`]))!;
  const request=(await one(tx,`INSERT INTO service_requests(service_id,requester_profile_id,requester_agent_id,provider_agent_id,parent_job_id,input,payment_id,job_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[s.id,profile.id,buyerId||null,s.agent_id,parentJobId||null,JSON.stringify(input),payment.id,job.id,scopedKey]))!;
  if(buyerId)await tx.query('UPDATE ledger_entries SET service_request_id=$1,job_id=$2 WHERE payment_id=$3',[request.id,parentJobId||job.id,payment.id]);
  await event(tx,buyerId||s.agent_id,'hired',`${s.name} requested`,{related:buyerId?s.agent_id:undefined,amount:Number(s.price_amount),job:job.id,request:request.id});
  await notifyOwner(tx,s.agent_id,'business-hired',s.name+' was purchased.','/jobs/'+job.id,'hired:'+request.id);return {id:request.id,jobId:job.id};
}
export async function settle(tx: Queryable, job: Row, output: any) {
  const r=await one(tx,'SELECT r.*,a.creator_profile_id FROM service_requests r JOIN agents a ON a.id=r.provider_agent_id WHERE job_id=$1 FOR UPDATE OF r',[job.id]);
  if (!r || r.status==='succeeded') return;
  const s=(await one(tx,'SELECT * FROM agent_services WHERE id=$1',[r.service_id]))!;
  validateSchema(s.response_schema,output);
  const p=(await one(tx,"UPDATE payments SET status='settled',confirmed_at=COALESCE(confirmed_at,now()) WHERE id=$1 AND (status='reserved' OR (provider='x402' AND status='settled')) RETURNING *",[r.payment_id]))!;
  ensure(p,'PAYMENT_STATE','Payment cannot be settled',409);
  await tx.query("UPDATE service_requests SET status='succeeded',output=$1,completed_at=now() WHERE id=$2",[JSON.stringify(output),r.id]);
  let transaction:string|undefined;
  if(p.escrow_account){
    const escrow=(await one(tx,'SELECT * FROM ledger_accounts WHERE id=$1',[p.escrow_account]))!;
    transaction=await transfer(tx,{key:'settlement:'+p.id,debit:escrow,credit:await businessAccount(tx,r.provider_agent_id,'BUSINESS_OPERATING'),amount:Number(p.amount),type:'service-settlement',reference:p.id,metadata:{requestId:r.id,jobId:job.id,buyerBusinessId:r.requester_business_id,sellerBusinessId:r.provider_business_id,serviceId:r.service_id}});
    await tx.query('UPDATE payments SET settlement_transaction_id=$1 WHERE id=$2',[transaction,p.id]);
    await tx.query("INSERT INTO audit_logs(agent_id,action,details) VALUES($1,'internal-settlement',$2)",[r.provider_agent_id,JSON.stringify({transactionId:transaction,paymentId:p.id,buyerBusinessId:r.requester_business_id,sellerBusinessId:r.provider_business_id,amount:Number(p.amount),jobId:job.id})]);
  }
  await ledger(tx,r.provider_agent_id,'credit','revenue',Number(p.amount),`revenue:${p.id}`,{payment:p.id,request:r.id,counterparty:r.requester_agent_id,job:job.id,external:!!r.requester_profile_id&&r.requester_profile_id!==r.creator_profile_id,network:p.network,transaction});
  // A settled directed cycle is not evidence of independent customer demand.
  // Preserve every financial receipt; only remove circular sales from external
  // revenue eligibility, including earlier legs when a cycle closes.
  if(r.requester_business_id){
    const excluded=(await tx.query(`WITH RECURSIVE reach(buyer,seller) AS (
      SELECT requester_business_id,provider_business_id FROM service_requests WHERE status='succeeded' AND requester_business_id IS NOT NULL
      UNION SELECT reach.buyer,s.provider_business_id FROM reach JOIN service_requests s ON s.requester_business_id=reach.seller WHERE s.status='succeeded'
    ) UPDATE ledger_entries l SET external=false FROM service_requests s WHERE l.service_request_id=s.id AND l.category='revenue' AND l.external AND s.requester_business_id IS NOT NULL AND EXISTS(SELECT 1 FROM reach WHERE buyer=s.provider_business_id AND seller=s.requester_business_id) RETURNING l.id`)).rows;
    if(excluded.length)await tx.query("INSERT INTO audit_logs(agent_id,action,details) VALUES($1,'circular-revenue-excluded',$2)",[r.provider_agent_id,JSON.stringify({entries:excluded.map(e=>e.id)})]);
  }
  if (r.requester_agent_id) {
    await tx.query(`INSERT INTO agent_relationships(buyer_agent_id,seller_agent_id,jobs_count,total_paid) VALUES($1,$2,1,$3) ON CONFLICT(buyer_agent_id,seller_agent_id) DO UPDATE SET jobs_count=agent_relationships.jobs_count+1,total_paid=agent_relationships.total_paid+excluded.total_paid,last_activity_at=now()`,[r.requester_agent_id,r.provider_agent_id,p.amount]);
    await event(tx,r.requester_agent_id,'received','Purchased service result delivered',{related:r.provider_agent_id,job:job.id,request:r.id});
    // Provider results return to the caller as private task context, never as public free-form memory.
    await tx.query(`INSERT INTO agent_memories(agent_id,memory_type,summary,data,source_job_id,public) VALUES($1,'purchased-result',$2,$3,$4,false) ON CONFLICT(agent_id,source_job_id) DO NOTHING`,[r.requester_agent_id,`Purchased ${s.name}: ${String(output.summary).slice(0,1200)}`,JSON.stringify({providerJobId:job.id,result:output}),job.id]);
    if(r.parent_job_id) await tx.query(`UPDATE jobs SET output=jsonb_set(COALESCE(output,'{}'),'{delegation}',COALESCE(output->'delegation','{}')||$1::jsonb) WHERE id=$2 AND status='succeeded'`,[JSON.stringify({status:'succeeded',jobId:job.id,service:s.name}),r.parent_job_id]);
  }
  await tx.query("UPDATE work_offers SET status='completed',updated_at=now() WHERE job_id=$1 AND status='in_progress'",[job.id]);
  await notifyOwner(tx,r.provider_agent_id,'revenue-earned',s.name+' earned '+usd(Number(p.amount))+' '+(p.network==='devnet'?'devnet USDC':'internal credits'),'/jobs/'+job.id,'revenue:'+p.id);await notify(tx,r.requester_profile_id,r.provider_agent_id,'purchase-delivered',s.name+' delivered your result.','/jobs/'+job.id,'delivered:'+r.id);
  await event(tx,r.provider_agent_id,'earned',`${s.name} delivered`,{related:r.requester_agent_id,amount:Number(p.amount),job:job.id,request:r.id});
}
export async function refund(tx: Queryable, jobId: string) {
  await tx.query("UPDATE work_offers SET status='failed',updated_at=now() WHERE job_id=$1 AND status='in_progress'",[jobId]);
  const r=await one(tx,"SELECT r.*,p.amount,p.network,p.debit_account,p.escrow_account,p.status payment_status FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.job_id=$1 FOR UPDATE OF r,p",[jobId]);
  if(r?.network==='devnet'&&r.payment_status==='settled'){
    await tx.query("UPDATE payments SET status='refund_required' WHERE id=$1",[r.payment_id]);
    await tx.query("UPDATE service_requests SET status='failed',completed_at=now() WHERE id=$1",[r.id]);
    await tx.query('INSERT INTO notifications(profile_id,agent_id,message) VALUES($1,$2,$3)',[r.requester_profile_id,r.provider_agent_id,'Paid service failed. A devnet USDC refund is required; payment remains visible for operator reconciliation.']);
    await event(tx,r.provider_agent_id,'refund-required','Service failed after on-chain settlement; refund pending',{job:jobId});return;
  }
  if (!r || r.payment_status!=='reserved') return;
  await tx.query("UPDATE payments SET status='refunded' WHERE id=$1",[r.payment_id]);
  await tx.query("UPDATE service_requests SET status='failed',completed_at=now() WHERE id=$1",[r.id]);
  if(r.parent_job_id)await tx.query(`UPDATE jobs SET output=jsonb_set(COALESCE(output,'{}'),'{delegation}',COALESCE(output->'delegation','{}')||$1::jsonb) WHERE id=$2 AND status='succeeded'`,[JSON.stringify({status:'failed',jobId}),r.parent_job_id]);
  let transaction:string|undefined;
  if(r.escrow_account){transaction=await transfer(tx,{key:'refund:'+r.payment_id,debit:(await one(tx,'SELECT * FROM ledger_accounts WHERE id=$1',[r.escrow_account]))!,credit:(await one(tx,'SELECT * FROM ledger_accounts WHERE id=$1',[r.debit_account]))!,amount:Number(r.amount),type:'service-refund',reference:r.payment_id,metadata:{jobId,requestId:r.id}});}
  if (r.requester_agent_id) await ledger(tx,r.requester_agent_id,'credit','refund',Number(r.amount),`refund:${r.payment_id}`,{payment:r.payment_id,counterparty:r.provider_agent_id,transaction});
  else {if(!transaction)await transfer(tx,{key:'legacy-refund:'+r.payment_id,debit:await account(tx,'TREASURY_CLEARING'),credit:await account(tx,'CUSTOMER_CREDITS',{profileId:r.requester_profile_id}),amount:Number(r.amount),type:'legacy-refund',reference:r.payment_id});await syncCustomer(tx,r.requester_profile_id);}
  await event(tx,r.provider_agent_id,'refunded',`Service failed; ${usd(Number(r.amount))} test USDC returned`,{job:jobId});
}
