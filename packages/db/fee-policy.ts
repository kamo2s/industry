import { ensure } from '../core';
import { defaultFeePolicy,feePolicySchema,splitFeeReceipt } from '../core/fee-policy';
export { feePolicySchema } from '../core/fee-policy';
import { demoMode } from '../core/security';
import { one,type Queryable } from './connection';
import { account,transfer,internalUnit } from './journal';
export async function feePolicy(tx:Queryable){const configured=await one(tx,"SELECT value FROM system_settings WHERE key='fee_allocation_policy'");return {configured:true,source:configured?'operator-override':'v1-default',policy:feePolicySchema.parse(configured?.value??defaultFeePolicy),treasury:process.env.INDUSTRY_FEE_TREASURY||null,provider:'pump.fun',enforceable:true,notice:'Confirmed Pump receipts use Pyth receipt-time USD valuation. Threshold-crossing receipts are split across phases. Physical SOL and PLATFORM_REVENUE remain in the pooled Treasury; there is no automatic swap or wallet withdrawal.'};}
// No live ingestion route accepts an asserted receipt. An enforceable provider
// must prove a treasury deposit before calling this allocator in live mode.
export async function allocateDevelopmentFee(tx:Queryable,business:string,amount:number,reference:string){
 ensure(demoMode(),'FEE_PROOF_REQUIRED','Live fee ingestion requires a provider-verified treasury receipt',503);
 await tx.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);const config=await feePolicy(tx);ensure(config.configured,'FEE_POLICY_UNCONFIGURED','Configure all fee phases before allocating receipts');
 const policy=feePolicySchema.parse(config.policy),old=await one(tx,'SELECT * FROM treasury_fee_receipts WHERE reference=$1',[reference]);
 if(old){ensure(old.business_id===business&&Number(old.amount)===amount,'IDEMPOTENCY_CONFLICT','Fee receipt differs from its original allocation',409);return old;}
 ensure(Number.isSafeInteger(amount)&&amount>0,'INVALID_AMOUNT','Fee amount must be positive micro-units');
 await tx.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);
 const cumulative=BigInt((await one(tx,"SELECT COALESCE(sum(amount),0)::text n FROM treasury_fee_receipts WHERE business_id=$1 AND provider='development-receipt' AND network='sandbox' AND unit=$2",[business,internalUnit()]))!.n);
 const allocation=splitFeeReceipt(cumulative,BigInt(amount),policy),{phase:name,compute,operating,platform}=allocation;
 const receipt=(await one(tx,"INSERT INTO treasury_fee_receipts(business_id,provider,network,reference,amount,unit,policy,phase,evidence) VALUES($1,'development-receipt','sandbox',$2,$3,$4,$5,$6,$7) RETURNING *",[business,reference,amount,internalUnit(),JSON.stringify(policy),name,JSON.stringify({demo:true,onChainVerified:false,allocation})]))!;
 for(const [kind,value] of [['BUSINESS_COMPUTE',compute],['BUSINESS_OPERATING',operating],['PLATFORM_REVENUE',platform]] as const)if(BigInt(value)>0n)await transfer(tx,{key:`fee:${receipt.id}:${kind}`,debit:await account(tx,'TREASURY_CLEARING'),credit:await account(tx,kind,kind==='PLATFORM_REVENUE'?undefined:{businessId:business}),amount:value,businessId:business,type:'fee-allocation',reference:receipt.id,metadata:{phase:name,development:true,allocation}});
 return receipt;
}
