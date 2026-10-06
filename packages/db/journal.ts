import { ensure,AppError,usd } from '../core';
import { testEconomy as demoMode } from '../core/environment';
import { one,type Queryable,type Row } from './connection';

export type AccountKind='BUSINESS_OPERATING'|'BUSINESS_COMPUTE'|'CUSTOMER_CREDITS'|'PLATFORM_REVENUE'|'PLATFORM_COMPUTE_EXPENSE'|'TREASURY_CLEARING'|'SETTLEMENT_ESCROW'|'EXTERNAL_CUSTODY'|'BUSINESS_COMPUTE_DEBT';
export type Unit='TEST_USDC'|'USDC_CREDIT'|'DEVNET_USDC'|`PUMP:${string}:${string}`;
export const internalUnit=():Unit=>demoMode()?'TEST_USDC':'USDC_CREDIT';
export async function account(tx:Queryable,kind:AccountKind,owner?:{businessId?:string;profileId?:string;reference?:string},unit:Unit=internalUnit()){
 const key=owner?.businessId?`business:${owner.businessId}:${kind}:${unit}`:owner?.profileId?`customer:${owner.profileId}:${unit}`:owner?.reference?`escrow:${owner.reference}:${unit}`:`platform:${unit}:${kind}`;
 await tx.query('INSERT INTO ledger_accounts(account_key,kind,business_id,profile_id,unit) VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_key) DO NOTHING',[key,kind,owner?.businessId||null,owner?.profileId||null,unit]);
 return (await one(tx,'SELECT * FROM ledger_accounts WHERE account_key=$1',[key]))!;
}
export async function businessId(tx:Queryable,agentId:string){const a=await one(tx,'SELECT business_id FROM agents WHERE id=$1',[agentId]);ensure(a,'NOT_FOUND','Business operator not found',404);return a.business_id as string;}
export async function businessAccount(tx:Queryable,agentId:string,kind:AccountKind,unit:Unit=internalUnit()){return account(tx,kind,{businessId:await businessId(tx,agentId)},unit);}
export async function transfer(tx:Queryable,args:{key:string;debit:Row;credit:Row;amount:number|string;type:string;reference:string;businessId?:string;metadata?:Record<string,unknown>}){
 ensure(typeof args.amount==='number'?Number.isSafeInteger(args.amount)&&args.amount>0:/^[1-9]\d*$/.test(args.amount)&&BigInt(args.amount)<=9223372036854775807n,'INVALID_AMOUNT','Transfer amount must be a positive integer within ledger capacity');
 ensure(args.debit.unit===args.credit.unit,'UNIT_MISMATCH','Cannot transfer between different accounting units');
 try{return (await one(tx,'SELECT post_ledger_transfer($1,$2,$3,$4,$5,$6,$7,$8,$9) id',[args.key,args.debit.id,args.credit.id,args.amount,args.debit.unit,args.businessId||args.credit.business_id||args.debit.business_id||null,args.type,args.reference,JSON.stringify(args.metadata||{})]))!.id as string;}
 catch(error){if(error instanceof Error&&error.message.includes('Insufficient ledger'))throw new AppError('INSUFFICIENT_BALANCE','Insufficient available ledger balance');if(error instanceof Error&&error.message.includes('idempotency conflict'))throw new AppError('IDEMPOTENCY_CONFLICT','Ledger key belongs to a different transfer',409);throw error;}
}
export async function customerAccount(tx:Queryable,profile:Row){
 const a=await account(tx,'CUSTOMER_CREDITS',{profileId:profile.id});
 const opening=await one(tx,'SELECT id FROM ledger_transactions WHERE credit_account=$1 LIMIT 1',[a.id]);
 // The only automatic issuance is explicitly labelled development credit.
 if(!opening&&Number(profile.credits)>0){ensure(demoMode(),'CREDIT_ISSUANCE_DENIED','Live customer credit requires an operator-confirmed allocation');await transfer(tx,{key:`customer-opening:${profile.id}`,debit:await account(tx,'TREASURY_CLEARING'),credit:a,amount:Number(profile.credits),type:'development-issuance',reference:profile.id,metadata:{demo:true}});}
 return (await one(tx,'SELECT * FROM ledger_accounts WHERE id=$1',[a.id]))!;
}
export async function syncCustomer(tx:Queryable,profileId:string){
 const a=await account(tx,'CUSTOMER_CREDITS',{profileId});
 await tx.query('UPDATE profiles SET credits=$1 WHERE id=$2',[a.balance,profileId]);
}
export async function fundBusiness(tx:Queryable,profile:Row,agentId:string,amount:number,kind:'BUSINESS_COMPUTE'|'BUSINESS_OPERATING',key:string){
 const from=await customerAccount(tx,profile),to=await businessAccount(tx,agentId,kind);
 ensure(Number(from.balance)>=amount,'INSUFFICIENT_CREDITS','Not enough credits for this allocation');
 const id=await transfer(tx,{key,debit:from,credit:to,amount,type:'creator-funding',reference:agentId,metadata:{account:kind,creator:profile.id}});
 if(kind==='BUSINESS_COMPUTE'){
  const debt=await businessAccount(tx,agentId,'BUSINESS_COMPUTE_DEBT');
  const repay=Math.min(amount,Math.max(0,-Number(debt.balance)));
  if(repay)await transfer(tx,{key:key+':debt',debit:to,credit:debt,amount:repay,type:'compute-overage-repayment',reference:agentId});
 }
 await syncCustomer(tx,profile.id);return id;
}
export async function balances(tx:Queryable,id:string){
 const rows=(await tx.query('SELECT kind,unit,balance FROM ledger_accounts WHERE business_id=$1',[id])).rows;
 const value=(kind:string)=>Number(rows.find(r=>r.kind===kind&&r.unit===internalUnit())?.balance||0);
 return {operating:usd(value('BUSINESS_OPERATING')),compute:usd(value('BUSINESS_COMPUTE')),computeDebt:usd(Math.max(0,-value('BUSINESS_COMPUTE_DEBT'))),unit:internalUnit(),source:'INDUSTRY Treasury Ledger'};
}
