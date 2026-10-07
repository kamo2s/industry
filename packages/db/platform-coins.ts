import {platformOperatorIdentity,platformProvisionAuthority} from './platform-authority';
import {ensure,micro} from '../core';
import {platformCoins,platformAllocation,platformCoinInput} from '../core/platform-coins';
import {audit} from './controls';
import {account,businessAccount,transfer} from './journal';
import {ledger} from './economy';
import {one,type Row} from './connection';
import type {Domain} from './domain';

/** CLI-only provisioning. Never exposed through dispatch or public launch input. */
export async function provisionPlatformCoins(domain:Domain,profile:Row,artwork:Record<string,Buffer>){
 ensure(profile.primary_wallet===platformOperatorIdentity,'PLATFORM_AUTHORITY','Internal platform owner required',403);
 return domain.db.transaction(async tx=>{
  await tx.query("INSERT INTO system_settings(key,value) VALUES('platform_coins_v1','{}') ON CONFLICT DO NOTHING");
  const prior=await one(tx,"SELECT value FROM system_settings WHERE key='platform_coins_v1' FOR UPDATE");
  if(prior?.value.coins)return prior.value.coins as {id:string;slug:string;key:string}[];
  const coins=[];
  for(const c of platformCoins){
   const bytes=artwork[c.key];ensure(bytes?.length>0&&bytes.length<=262144,'ARTWORK_REQUIRED','Reviewed platform artwork required');
   const upload=(await one(tx,"INSERT INTO uploads(profile_id,content,mime) VALUES($1,$2,'image/webp') RETURNING id",[profile.id,bytes]))!;
   const created=await domain.create(tx,profile,platformCoinInput(c.key,upload.id),undefined,platformProvisionAuthority);
   await tx.query('UPDATE agents SET paused=true WHERE id=$1',[created.id]);
   for(const [kind,dollars] of [['BUSINESS_COMPUTE',platformAllocation.compute],['BUSINESS_OPERATING',platformAllocation.operating]] as const){
    const key=`platform-sponsorship-v1:${created.id}:${kind}`;
    const transaction=await transfer(tx,{key,debit:await account(tx,'TREASURY_CLEARING'),credit:await businessAccount(tx,created.id,kind),amount:micro(dollars),type:'platform-sponsorship',reference:created.id,metadata:{operator:'INDUSTRY',purpose:'Bounded operator-funded business allocation',noChainReceipt:true}});
    await ledger(tx,created.id,'credit','funding',micro(dollars),key,{transaction,account:kind});
   }
   await audit(tx,profile,'platform-business-provisioned',created.id,{compute:platformAllocation.compute,operating:platformAllocation.operating,paused:true});
   coins.push({...created,key:c.key});
  }
  await tx.query("UPDATE system_settings SET value=$1 WHERE key='platform_coins_v1'",[JSON.stringify({coins,operatorProfile:profile.id,allocation:platformAllocation})]);
  return coins;
 });
}

export async function activatePlatformCoins(domain:Domain,profile:Row){
 ensure(profile.primary_wallet===platformOperatorIdentity,'PLATFORM_AUTHORITY','Internal platform owner required',403);
 return domain.db.transaction(async tx=>{
  const record=await one(tx,"SELECT value FROM system_settings WHERE key='platform_coins_v1' FOR UPDATE");
  ensure(record?.value.coins&&record.value.operatorProfile===profile.id,'PLATFORM_MISSING','Provisioned operator cohort required');
  if(record.value.activated)return;
  for(const coin of record.value.coins){
   const a=await one(tx,"SELECT a.id FROM agents a JOIN businesses b ON b.id=a.business_id WHERE a.id=$1 AND b.mode='PLATFORM_OPERATED' AND a.creator_profile_id=$2 AND a.terminated_at IS NULL",[coin.id,profile.id]);
   ensure(a,'PLATFORM_IDENTITY','Platform identity mismatch');
   await tx.query('UPDATE agents SET paused=false,next_run_at=now() WHERE id=$1',[coin.id]);
   await audit(tx,profile,'platform-business-activated',coin.id,{bounded:true});
  }
  await tx.query("UPDATE system_settings SET value=jsonb_set(value,'{activated}','true') WHERE key='platform_coins_v1'");
 });
}
