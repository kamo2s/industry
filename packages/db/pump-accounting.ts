import { ensure } from '../core';
import { splitFeeReceipt,feePhaseAt } from '../core/fee-policy';
import { one,type Queryable } from './connection';
import { account,transfer,type Unit } from './journal';
import { feePolicy,feePolicySchema } from './fee-policy';
import { notifyOwner } from './notifications';
import { formatRaw,receiptUnit,type PumpReceipt } from '../pump/receipts';
import { validatePrice,usdMicros,type PriceProof } from '../pump/pricing';
async function lockReceiptBusiness(tx:Queryable,id:string){
 const identity=await one(tx,'SELECT business_id FROM pump_receipts WHERE id=$1',[id]);ensure(identity,'NOT_FOUND','Receipt missing');
 // Serialize pricing and allocation for a business before acquiring its receipt lock.
 await tx.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[identity.business_id]);
}
export async function ingestPumpReceipt(tx:Queryable,r:PumpReceipt){
 const business=await one(tx,'SELECT * FROM pump_businesses WHERE business_id=$1 FOR UPDATE',[r.businessId]);
 ensure(business&&business.network===r.network&&business.mint===r.mint&&business.sharing_config===r.sharingConfig&&business.treasury===r.treasury&&business.quote_mint===r.quoteMint&&business.quote_decimals===r.quoteDecimals,'PUMP_RECEIPT_MAPPING','Receipt does not belong to this verified business');
 ensure(r.confirmation==='finalized'&&BigInt(r.rawAmount)>0n,'PUMP_RECEIPT','Only finalized positive receipts can be credited');
 const old=await one(tx,'SELECT * FROM pump_receipts WHERE reconciliation_key=$1',[r.key]);
 if(old){ensure(old.raw_amount.toString()===r.rawAmount&&old.business_id===r.businessId,'PUMP_RECEIPT_CONFLICT','Receipt identity differs from recorded amount or business');return old;}
 const row=(await one(tx,`INSERT INTO pump_receipts(business_id,network,mint,sharing_config,signature,instruction_index,event_index,slot,block_time,quote_mint,quote_decimals,raw_amount,normalized_amount,treasury,operation,confirmation,reconciliation_key,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9),$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,[r.businessId,r.network,r.mint,r.sharingConfig,r.signature,r.instructionIndex,r.eventIndex,r.slot,r.blockTime,r.quoteMint,r.quoteDecimals,r.rawAmount,r.normalizedAmount,r.treasury,r.operation,r.confirmation,r.key,JSON.stringify(r.evidence)]))!;
 const unit=receiptUnit(r.network,r.quoteMint) as Unit;
 await tx.query('INSERT INTO ledger_assets(unit,network,mint,decimals) VALUES($1,$2,$3,$4) ON CONFLICT(unit) DO NOTHING',[unit,r.network,r.quoteMint,r.quoteDecimals]);
 await transfer(tx,{key:r.key+':received',debit:await account(tx,'EXTERNAL_CUSTODY',undefined,unit),credit:await account(tx,'TREASURY_CLEARING',undefined,unit),amount:r.rawAmount,type:'pump-receipt',reference:row.id,businessId:r.businessId,metadata:{signature:r.signature,slot:r.slot,asset:r.quoteMint}});
 await tx.query('UPDATE pump_businesses SET last_collection=GREATEST(last_collection,to_timestamp($2)) WHERE business_id=$1',[r.businessId,r.blockTime]);
 const agent=await one(tx,'SELECT id,slug FROM agents WHERE business_id=$1',[r.businessId]);
 if(agent){await tx.query("INSERT INTO activity_events(agent_id,event_type,action,description,metadata) VALUES($1,'pump-fee','fees received',$2,$3)",[agent.id,`Pump creator fees received: ${r.normalizedAmount} ${r.quoteMint==='So11111111111111111111111111111111111111112'?'SOL':r.quoteMint}. Awaiting USD valuation.`,JSON.stringify({receiptId:row.id,unit,externalRevenue:false})]);await notifyOwner(tx,agent.id,'pump-fees',`Pump creator fees received. USD credits await trusted pricing and the fee policy.`,`/agents/${agent.slug}?tab=financials`,`pump-receipt:${row.id}`);}
 return row;
}
export async function convertPumpReceipt(tx:Queryable,id:string,proof:PriceProof){
 await lockReceiptBusiness(tx,id);
 const r=(await one(tx,'SELECT * FROM pump_receipts WHERE id=$1 FOR UPDATE',[id]))!;ensure(r,'NOT_FOUND','Receipt missing');
 if(!r.price_proof){validatePrice(proof,Math.floor(new Date(r.block_time).getTime()/1000));ensure(r.quote_mint==='So11111111111111111111111111111111111111112','PRICE_ASSET_UNSUPPORTED','No approved oracle for this asset');
  const value=usdMicros(String(r.raw_amount),r.quote_decimals,proof),unit=r.network==='mainnet-beta'?'USDC_CREDIT':'TEST_USDC';
  await tx.query("UPDATE pump_receipts SET price_proof=$2,usd_value=$3,usd_unit=$4,converted_at=clock_timestamp(),pricing_attempted_at=now(),conversion_error=NULL,allocation_status='AWAITING_POLICY' WHERE id=$1",[id,JSON.stringify(proof),value.toString(),unit]);
 }
 await allocatePumpReceipt(tx,id);
}
export async function allocatePumpReceipt(tx:Queryable,id:string){
 await lockReceiptBusiness(tx,id);
 const r=(await one(tx,'SELECT * FROM pump_receipts WHERE id=$1 FOR UPDATE',[id]))!;if(r.allocation_status==='ALLOCATED'||!r.price_proof)return;
 await tx.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[r.business_id]);
 const config=await feePolicy(tx);if(!config.configured)return;
 const policy=feePolicySchema.parse(config.policy),unit=r.usd_unit as Unit;
 // Valuation order is stable even when historical chain receipts arrive late.
 // Include priced receipts awaiting allocation, but never demo funding, sales, or unpriced SOL.
 const previous=BigInt((await one(tx,`SELECT COALESCE(sum(usd_value),0)::text n FROM pump_receipts
  WHERE business_id=$1 AND network=$2 AND usd_unit=$3 AND confirmation='finalized' AND price_proof IS NOT NULL
  AND (converted_at,id)<(SELECT converted_at,id FROM pump_receipts WHERE id=$4)`,[r.business_id,r.network,unit,id]))!.n);
 const raw=BigInt(r.usd_value),allocation=splitFeeReceipt(previous,raw,policy),{phase,compute,operating,platform}=allocation;
 // Separate balanced USD postings. Native assets stay pooled; this constructs no swap.
 for(const [kind,amount] of [['BUSINESS_COMPUTE',compute],['BUSINESS_OPERATING',operating],['PLATFORM_REVENUE',platform]] as const)if(BigInt(amount)>0n)await transfer(tx,{key:`pump-allocation:${id}:${kind}`,debit:await account(tx,'TREASURY_CLEARING',undefined,unit),credit:await account(tx,kind,kind==='PLATFORM_REVENUE'?undefined:{businessId:r.business_id},unit),amount,type:'pump-fee-allocation',reference:id,businessId:r.business_id,metadata:{phase,receipt:id,allocation,accountingConversion:true,physicalSwap:false,price:r.price_proof}});
 if(raw>0n)await tx.query("INSERT INTO treasury_fee_receipts(business_id,provider,network,reference,amount,unit,policy,phase,evidence) VALUES($1,'pump.fun',$2,$3,$4,$5,$6,$7,$8)",[r.business_id,r.network,`pump:${id}`,raw.toString(),unit,JSON.stringify(policy),phase,JSON.stringify({receiptId:id,rawAmount:String(r.raw_amount),quoteMint:r.quote_mint,price:r.price_proof,physicalSwap:false,allocation})]);
 await tx.query("UPDATE pump_receipts SET policy=$2,phase=$3,allocation_status='ALLOCATED',allocated_at=now() WHERE id=$1",[id,JSON.stringify(policy),phase]);
}
export async function pumpFinancials(tx:Queryable,businessId?:string){
 const {policy}=await feePolicy(tx);
 const rows=(await tx.query(`SELECT p.business_id,p.network,p.mint,p.treasury,p.routing_status,p.quote_mint,p.quote_decimals,p.pending_raw,p.sweepable_raw,p.observed_at,p.graduated,p.collection_state,p.collection_error,p.last_collection,a.name,a.slug FROM pump_businesses p JOIN agents a ON a.business_id=p.business_id ${businessId?'WHERE p.business_id=$1':''} ORDER BY a.name`,businessId?[businessId]:[])).rows;
 for(const p of rows){const totals=(await one(tx,"SELECT COALESCE(sum(raw_amount),0)::text earned,COALESCE(sum(usd_value) FILTER(WHERE allocation_status='ALLOCATED'),0)::text credited,count(*) FILTER(WHERE allocation_status='PENDING_CONVERSION')::integer pending_conversion,count(*) FILTER(WHERE allocation_status='AWAITING_POLICY')::integer awaiting_policy FROM pump_receipts WHERE business_id=$1",[p.business_id]))!;p.earned=formatRaw(BigInt(totals.earned),p.quote_decimals);p.creditedUsd=formatRaw(BigInt(totals.credited),6);p.pendingConversion=totals.pending_conversion;p.awaitingPolicy=totals.awaiting_policy;p.pending=p.pending_raw==null?null:formatRaw(BigInt(p.pending_raw),p.quote_decimals);p.asset=p.quote_mint==='So11111111111111111111111111111111111111112'?'SOL':p.quote_mint;p.usdUnit=p.network==='mainnet-beta'?'USDC_CREDIT':'TEST_USDC';}
 for(const p of rows){
  const total=(await one(tx,"SELECT COALESCE(sum(usd_value),0)::text n FROM pump_receipts WHERE business_id=$1 AND network=$2 AND confirmation='finalized' AND price_proof IS NOT NULL",[p.business_id,p.network]))!.n;
  p.cumulativeCreatorFeesUsd=formatRaw(BigInt(total),6);p.nextFeePhase=feePhaseAt(BigInt(total),policy);
  p.receipts=(await tx.query(`SELECT r.id,r.signature,r.slot,r.block_time,r.normalized_amount,r.quote_mint,r.allocation_status,r.price_proof,r.usd_value::text,r.usd_unit,r.conversion_error,r.phase,r.policy,t.evidence->'allocation' allocation
   FROM pump_receipts r LEFT JOIN treasury_fee_receipts t ON t.reference='pump:'||r.id::text
   WHERE r.business_id=$1 ORDER BY r.slot DESC LIMIT 20`,[p.business_id])).rows;
 }
 return rows;
}
