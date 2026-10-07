import {platformOperatorIdentity} from '../packages/db/platform-authority';
import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {database,one} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {provisionPlatformCoins,activatePlatformCoins} from '../packages/db/platform-coins';
import {platformCoins,platformAllocation} from '../packages/core/platform-coins';
import {ensure} from '../packages/core';
import {providerCap} from '../packages/core/environment';

const action=process.argv.find(a=>a.startsWith('--action='))?.slice(9)||'plan';
ensure(['plan','provision','activate'].includes(action),'ACTION','Use plan, provision or activate');
console.log(JSON.stringify({action,coins:platformCoins.map(c=>({name:c.name,role:c.role})),allocationPerCoin:platformAllocation,totalAllocation:13,dailyProviderCap:providerCap()/1e6,tokenLaunch:false,automaticRefills:false}));
if(action!=='plan'){
 const db=await database();
 try{
  const profile=(await one(db,'INSERT INTO profiles(primary_wallet,credits) VALUES($1,0) ON CONFLICT(primary_wallet) DO UPDATE SET primary_wallet=excluded.primary_wallet RETURNING *',[platformOperatorIdentity]))!;
  const domain=new Domain(db);
  if(action==='provision'){
   const artwork=Object.fromEntries(await Promise.all(platformCoins.map(async c=>[c.key,await readFile(`assets/platform-coins/${c.key}.webp`)])));
   console.log(JSON.stringify({coins:await provisionPlatformCoins(domain,profile,artwork),paused:true}));
  }else{await activatePlatformCoins(domain,profile);console.log(JSON.stringify({activated:true}));}
 }finally{await db.close();}
}
