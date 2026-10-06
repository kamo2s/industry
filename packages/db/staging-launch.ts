import {appEnvironment} from '../core/environment';
import {ensure} from '../core';
import {account,transfer,syncCustomer} from './journal';
import {one,type Queryable,type Row} from './connection';

export function stagingLaunchAllowed(wallet:string){
  return appEnvironment()==='staging'&&process.env.STAGING_TEST_LAUNCH_ENABLED==='true'
    &&(process.env.STAGING_TEST_WALLETS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(wallet);
}
export function requireStagingLauncher(wallet:string,mode:string){
  if(appEnvironment()!=='staging')return;
  ensure(mode==='sandbox','STAGING_ONLY','Hosted testing creates test Coins only; no blockchain launch.',403);
  ensure(stagingLaunchAllowed(wallet),'STAGING_ACCESS','Test launches are limited to approved testing wallets.',403);
}
export async function stagingCredits(tx:Queryable,profile:Row){
  if(!stagingLaunchAllowed(profile.primary_wallet))return;
  await tx.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[profile.id]);
  const key=`hosted-test-allocation-v1:${profile.id}`;
  if(await one(tx,'SELECT id FROM ledger_transactions WHERE idempotency_key=$1',[key]))return;
  await transfer(tx,{key,debit:await account(tx,'TREASURY_CLEARING'),credit:await account(tx,'CUSTOMER_CREDITS',{profileId:profile.id}),amount:33_000_000,type:'staging-issuance',reference:profile.id,metadata:{staging:true,noChainReceipt:true,purpose:'Three test Coins: 10 compute + 1 operating each'}});
  await syncCustomer(tx,profile.id);
}
