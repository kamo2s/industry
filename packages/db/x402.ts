import { randomUUID } from 'node:crypto';
import { VersionedTransaction } from '@solana/web3.js';
import type { PaymentPayload, SettleResponse } from '@x402/core/types';
import { z } from 'zod';
import { X402Provider, DEVNET_USDC, DEVNET_CAIP, EncryptedPaymentSigner, devnetBalance, decodePayment, transactionHash, encodePaymentSignatureHeader } from '../agent/payments';
import { authorizePurchase, ensure, idempotencySchema, micro, policySchema, AppError } from '../core';
import { hash } from '../core/security';
import { one, type Database, type Queryable, type Row } from './connection';
import { event, ledger, validateSchema } from './economy';
import { operatingSpend, requireEnabled } from './controls';
import { metrics } from './metrics';

const uuid=z.string().uuid();
function canonical(value:any):string {return JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
export function bindPayment(payload:PaymentPayload,quote:Row){
  ensure(payload.x402Version===2&&canonical(payload.accepted)===canonical(quote.requirements),'PAYMENT_MISMATCH','Payment does not match the stored quote',402);
  const tx=VersionedTransaction.deserialize(Buffer.from(String(payload.payload.transaction),'base64'));
  const memos=tx.message.compiledInstructions.filter(i=>tx.message.staticAccountKeys[i.programIdIndex]?.toBase58()==='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  ensure(memos.length===1&&Buffer.from(memos[0].data).toString('utf8')===quote.requirements.extra.memo,'PAYMENT_MISMATCH','Signed payment must bind the exact service request',402);
}
type BuyerContext={agentId:string;jobId:string;lease:string;profileId:string};
export class ServicePayments {
  constructor(private db:Database,private provider=new X402Provider()){}
  async quote(serviceId:string,input:unknown,key:string,buyer?:BuyerContext){
    uuid.parse(serviceId);idempotencySchema.parse(key);z.record(z.string(),z.unknown()).parse(input);
    ensure(JSON.stringify(input).length<=12000,'TOO_LARGE','Service input is too large',413);
    await requireEnabled(this.db,'payments');await requireEnabled(this.db,'agents');
    const scoped=hash(`x402:${buyer?.agentId||'public'}:${serviceId}:${key}`),fingerprint=hash(canonical(input));
    const old=await one(this.db,'SELECT * FROM payment_attempts WHERE idempotency_key=$1',[scoped]);
    if(old){ensure(old.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','Request key already belongs to different input',409);return old;}
    const seller=await one(this.db,`SELECT s.*,a.paused,a.terminated_at,w.public_address,w.network FROM agent_services s JOIN agents a ON a.id=s.agent_id JOIN wallet_accounts w ON w.agent_id=a.id WHERE s.id=$1 AND s.active AND a.visibility='public'`,[serviceId]);
    ensure(seller&&!seller.paused&&!seller.terminated_at&&seller.network==='devnet','SERVICE_UNAVAILABLE','This service is not available for devnet USDC',409);
    validateSchema(seller.request_schema,input);
    const agent=(await one(this.db,'SELECT * FROM agents WHERE id=$1',[seller.agent_id]))!;
    ensure((await metrics(this.db,agent)).balance>=agent.config.policy.maxRunCost,'PROVIDER_LOW_COMPUTE','Seller needs compute allocation before accepting payment',409);
    const id=randomUUID(),memo=`industry:${hash(`${id}:${scoped}:${fingerprint}`)}`;
    const requirements=await this.provider.requirements(seller.public_address,Number(seller.price_amount),memo);
    const url=`${(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'')}/api/services/${serviceId}/invoke`;
    const row=await one(this.db,`INSERT INTO payment_attempts(id,service_id,requester_profile_id,requester_agent_id,parent_job_id,idempotency_key,fingerprint,input,requirements,resource_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`,[id,serviceId,buyer?.profileId||null,buyer?.agentId||null,buyer?.jobId||null,scoped,fingerprint,JSON.stringify(input),JSON.stringify(requirements),url]);
    const result=row||(await one(this.db,'SELECT * FROM payment_attempts WHERE idempotency_key=$1',[scoped]))!;
    ensure(result.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','Request key conflicts with another invocation',409);return result;
  }
  async invoke(serviceId:string,input:unknown,key:string,header?:string){
    const quote=await this.quote(serviceId,input,key);
    if(!header){const challenge=await this.provider.challenge(quote.requirements,quote.resource_url);return {status:402,headers:{'PAYMENT-REQUIRED':challenge.header,'Cache-Control':'private, no-store'},body:{...challenge.required,requestId:quote.id}};}
    const result=await this.accept(quote.id,decodePayment(header));
    return {status:result.status==='succeeded'?200:202,headers:{'PAYMENT-RESPONSE':this.provider.response(result.receipt),'Cache-Control':'private, no-store'},body:result};
  }
  async accept(id:string,payload:PaymentPayload){
    const quote=await this.db.transaction(async tx=>{
      const q=await one(tx,'SELECT * FROM payment_attempts WHERE id=$1 FOR UPDATE',[id]);ensure(q,'NOT_FOUND','Payment quote not found',404);
      bindPayment(payload,q);const digest=transactionHash(payload);
      ensure(!q.transaction_hash||q.transaction_hash===digest,'PAYMENT_REPLAY','This quote already has a different signed transaction',409);
      if(q.request_id)return q;
      ensure(q.status!=='failed'&&q.status!=='expired','PAYMENT_CLOSED','This payment attempt is closed',409);
      ensure(q.payment_payload||new Date(q.expires_at).getTime()>Date.now(),'QUOTE_EXPIRED','Payment quote expired; request a new quote before signing',409);
      ensure(!q.lease_until||new Date(q.lease_until).getTime()<Date.now(),'PAYMENT_PENDING','Payment is being processed; retry the same request',409);
      // Persist message identity before any external settlement. The unique index
      // prevents cross-request replay, including altered signature slots.
      await tx.query("UPDATE payment_attempts SET payment_payload=$1,transaction_hash=$2,status=CASE WHEN status='settling' THEN status ELSE 'verifying' END,lease_until=now()+interval '120 seconds',updated_at=now() WHERE id=$3",[JSON.stringify(payload),digest,q.id]);
      return {...q,payment_payload:payload,transaction_hash:digest};
    });
    if(quote.request_id)return this.result(quote.id);
    try{
      let receipt:SettleResponse|undefined=quote.receipt;
      if(!receipt){
        if(quote.status==='settling'&&quote.payer)receipt=await this.provider.recover(payload,quote.requirements,quote.payer)||undefined;
        if(!receipt){
          if(quote.status!=='settling'){
            await requireEnabled(this.db,'payments');
            const verified=await this.provider.verify(payload,quote.requirements);
            if(quote.requester_agent_id){const wallet=await one(this.db,'SELECT public_address FROM wallet_accounts WHERE agent_id=$1',[quote.requester_agent_id]);ensure(verified.payer===wallet?.public_address,'PAYER_MISMATCH','Payment signer does not own the agent treasury',402);}
            await this.db.transaction(async tx=>{await this.guardBeforeSettlement(tx,quote);await tx.query("UPDATE payment_attempts SET payer=$1,status='settling',updated_at=now() WHERE id=$2",[verified.payer,quote.id]);});
          }
          receipt=await this.provider.settle(payload,quote.requirements);
          ensure(receipt.success&&receipt.transaction&&receipt.network===DEVNET_CAIP,'SETTLEMENT_PENDING','Settlement is unresolved; retry this signed payment for reconciliation',503);
        }
        await this.db.query("UPDATE payment_attempts SET receipt=$1,signature=$2,updated_at=now() WHERE id=$3",[JSON.stringify(receipt),receipt.transaction,quote.id]);
      }
      await this.finalize(quote.id,receipt);return this.result(quote.id);
    }catch(error){
      await this.db.query("UPDATE payment_attempts SET last_error=$1,status=CASE WHEN status='verifying' THEN 'failed' ELSE status END,lease_until=NULL,updated_at=now() WHERE id=$2",[error instanceof AppError?error.code:'PROVIDER_UNAVAILABLE',quote.id]);throw error;
    }
  }
  private async guardBeforeSettlement(tx:Queryable,q:Row){
    await requireEnabled(tx,'payments');await requireEnabled(tx,'agents');
    const service=await one(tx,'SELECT s.*,a.paused,a.terminated_at FROM agent_services s JOIN agents a ON a.id=s.agent_id WHERE s.id=$1 FOR UPDATE OF a',[q.service_id]);
    ensure(service&&service.active&&!service.paused&&!service.terminated_at,'SERVICE_UNAVAILABLE','Seller was paused before settlement',409);
    if(!q.requester_agent_id)return;
    const agent=(await one(tx,'SELECT * FROM agents WHERE id=$1 FOR UPDATE',[q.requester_agent_id]))!;
    const policy=policySchema.parse(agent.config.policy),amount=Number(q.requirements.amount),spend=await operatingSpend(tx,agent.id);
    const parent=await one(tx,"SELECT * FROM jobs WHERE id=$1 AND status='running'",[q.parent_job_id]);
    ensure(parent&&!agent.terminated_at,'STALE_LEASE','Buyer run is no longer active',409);
    const counts=(await one(tx,`SELECT count(*) FILTER(WHERE created_at>now()-interval '24 hours') AS "day",count(*) FILTER(WHERE parent_job_id=$2) run,COALESCE(sum((requirements->>'amount')::bigint) FILTER(WHERE parent_job_id=$2),0) run_spend FROM payment_attempts WHERE requester_agent_id=$1 AND status IN ('reserved','signed','verifying','settling','settled')`,[agent.id,parent.id]))!;
    authorizePurchase(policy,{amount,balance:amount,spentToday:Math.max(0,spend.day-amount),spentHour:Math.max(0,spend.hour-amount),purchasesToday:Math.max(0,Number(counts.day)-1),purchasesRun:Math.max(0,Number(counts.run)-1),spentRun:Math.max(0,Number(counts.run_spend)-amount)+Number(parent.payload.measuredCost||0),category:service.category,network:'devnet',asset:DEVNET_USDC,counterparty:service.agent_id,emergency:false,paused:agent.paused});
    ensure(agent.config.tools.includes('marketplace')&&amount<=micro(policy.maxPurchase),'TOOL_DENIED','Payment permissions were revoked');
  }
  private async finalize(id:string,receipt:SettleResponse){
    await this.db.transaction(async tx=>{
      const q=(await one(tx,'SELECT * FROM payment_attempts WHERE id=$1 FOR UPDATE',[id]))!;if(q.request_id)return;
      const s=(await one(tx,'SELECT s.*,a.creator_profile_id FROM agent_services s JOIN agents a ON a.id=s.agent_id WHERE s.id=$1',[q.service_id]))!;
      const profile=q.requester_profile_id?{id:q.requester_profile_id}:(await one(tx,'INSERT INTO profiles(primary_wallet,credits) VALUES($1,0) ON CONFLICT(primary_wallet) DO UPDATE SET primary_wallet=excluded.primary_wallet RETURNING id',[receipt.payer||q.payer]))!;
      const p=(await one(tx,`INSERT INTO payments(provider,network,payer_address,payee_address,amount,status,reference,idempotency_key,transaction_signature,asset,confirmed_at) VALUES('x402','devnet',$1,$2,$3,'settled',$4,$5,$4,$6,now()) RETURNING *`,[receipt.payer||q.payer,q.requirements.payTo,Number(q.requirements.amount),receipt.transaction,q.idempotency_key,DEVNET_USDC]))!;
      const job=(await one(tx,`INSERT INTO jobs(agent_id,type,trigger_type,payload,idempotency_key) VALUES($1,'SERVICE','paid',$2,$3) RETURNING id`,[s.agent_id,JSON.stringify({input:q.input,serviceId:s.id}),`x402:${q.id}`]))!;
      const request=(await one(tx,`INSERT INTO service_requests(service_id,requester_profile_id,requester_agent_id,provider_agent_id,parent_job_id,input,payment_id,job_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[s.id,profile.id,q.requester_agent_id,s.agent_id,q.parent_job_id,JSON.stringify(q.input),p.id,job.id,q.idempotency_key]))!;
      if(q.requester_agent_id)await ledger(tx,q.requester_agent_id,'debit','service_purchase',Number(p.amount),`purchase:${p.id}`,{network:'devnet',payment:p.id,request:request.id,counterparty:s.agent_id,job:q.parent_job_id});
      await tx.query("UPDATE payment_attempts SET status='settled',request_id=$1,requester_profile_id=$2,receipt=$3,signature=$4,lease_until=NULL,updated_at=now() WHERE id=$5",[request.id,profile.id,JSON.stringify(receipt),receipt.transaction,id]);
      await event(tx,q.requester_agent_id||s.agent_id,'purchased',`${s.name}: devnet USDC settled`,{related:q.requester_agent_id?s.agent_id:undefined,amount:Number(p.amount),job:job.id,request:request.id});
    });
  }
  private async result(id:string){
    const q=(await one(this.db,'SELECT p.receipt,r.id,r.job_id,r.status,r.output FROM payment_attempts p JOIN service_requests r ON r.id=p.request_id WHERE p.id=$1',[id]))!;
    return {id:q.id,jobId:q.job_id,status:q.status,output:q.output,receipt:q.receipt};
  }
  async agentPurchase(context:BuyerContext,serviceId:string,input:unknown){
    const q=await this.quote(serviceId,input,`agent:${context.jobId}:${serviceId}`,context);
    if(q.request_id)return this.result(q.id);
    let payload=q.payment_payload as PaymentPayload|undefined;
    if(!payload){
      const wallet=(await one(this.db,'SELECT public_address FROM wallet_accounts WHERE agent_id=$1',[context.agentId]))!;
      const balance=await devnetBalance(wallet.public_address);
      payload=await new EncryptedPaymentSigner().sign(q.requirements,q.resource_url,()=>this.db.transaction(tx=>this.reserve(tx,q,context,balance)));
      bindPayment(payload,q);
      await this.db.query("UPDATE payment_attempts SET payment_payload=$1,transaction_hash=$2,status='signed',updated_at=now() WHERE id=$3 AND status='reserved'",[JSON.stringify(payload),transactionHash(payload),q.id]);
    }
    return this.accept(q.id,payload);
  }
  private async reserve(tx:Queryable,q:Row,context:BuyerContext,balance:number){
    await requireEnabled(tx,'payments');await requireEnabled(tx,'agents');
    const job=await one(tx,"SELECT * FROM jobs WHERE id=$1 AND lease=$2 AND status='running' FOR UPDATE",[context.jobId,context.lease]);
    ensure(job&&job.agent_id===context.agentId&&job.type!=='SERVICE','STALE_LEASE','Only an active non-service job may purchase',409);
    const agent=(await one(tx,'SELECT * FROM agents WHERE id=$1 FOR UPDATE',[context.agentId]))!;
    ensure(agent.creator_profile_id===context.profileId&&!agent.terminated_at,'FORBIDDEN','Invalid buyer',403);
    ensure(agent.config.tools.includes('marketplace'),'TOOL_DENIED','Marketplace is disabled');
    const attempt=(await one(tx,'SELECT * FROM payment_attempts WHERE id=$1 FOR UPDATE',[q.id]))!;
    ensure(attempt.status==='quoted','PAYMENT_PENDING','This request already reserved spending; retry after recovery',409);
    const service=(await one(tx,'SELECT * FROM agent_services WHERE id=$1 AND active',[q.service_id]))!;
    ensure(service&&service.agent_id!==agent.id,'SERVICE_UNAVAILABLE','Seller unavailable or self-purchase');
    const spend=await operatingSpend(tx,agent.id);
    const count=(await one(tx,`SELECT count(*) FILTER(WHERE created_at>now()-interval '24 hours') AS "day",count(*) FILTER(WHERE parent_job_id=$2) run,COALESCE(sum((requirements->>'amount')::bigint) FILTER(WHERE parent_job_id=$2),0) run_spend FROM payment_attempts WHERE requester_agent_id=$1 AND status IN ('reserved','signed','verifying','settling','settled')`,[agent.id,job.id]))!;
    authorizePurchase(agent.config.policy,{amount:Number(q.requirements.amount),balance,spentToday:spend.day,spentHour:spend.hour,purchasesToday:Number(count.day),purchasesRun:Number(count.run),spentRun:Number(count.run_spend)+Number(job.payload.measuredCost||0),category:service.category,network:'devnet',asset:DEVNET_USDC,counterparty:service.agent_id,emergency:false,paused:agent.paused});
    await tx.query("UPDATE payment_attempts SET status='reserved',updated_at=now() WHERE id=$1",[q.id]);
    const key=(await one(tx,"SELECT public_address,encrypted_key_reference FROM wallet_accounts WHERE agent_id=$1 AND network='devnet'",[agent.id]))!;
    ensure(key,'SIGNER_UNAVAILABLE','A devnet treasury is required',503);return {encryptedKey:key.encrypted_key_reference,wallet:key.public_address};
  }
  async recoverPending(){
    const rows=(await this.db.query("SELECT * FROM payment_attempts WHERE status IN ('signed','verifying','settling') AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at LIMIT 1")).rows;
    for(const row of rows)try{await this.accept(row.id,row.payment_payload);}catch{/* Durable state retains the safe error code for the operator. */}
    // A crash before signing cannot have broadcast a payment.
    await this.db.query("UPDATE payment_attempts SET status='expired',last_error='UNSIGNED_RESERVATION_EXPIRED' WHERE status='reserved' AND updated_at<now()-interval '5 minutes' AND payment_payload IS NULL");
    return {checked:rows.length};
  }
}
export { encodePaymentSignatureHeader };
