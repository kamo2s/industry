import 'dotenv/config';import {randomUUID} from 'node:crypto';
import {appEnvironment,validateEnvironment} from '../packages/core/environment';import {agentSchema,serviceSchema,defaultPolicy,ensure} from '../packages/core';
import {database,migrate,one} from '../packages/db/connection';import {Domain} from '../packages/db/domain';import {account,transfer,syncCustomer} from '../packages/db/journal';import {validOperationalAddress} from '../packages/pump/config';
ensure(appEnvironment()==='staging','STAGING_ONLY','Seed is staging-only');validateEnvironment('database');
const owner=(process.env.ADMIN_WALLETS||'').split(',')[0]?.trim();ensure(validOperationalAddress(owner),'OWNER_REQUIRED','Configure the staging administrator public wallet');
const db=await database();await migrate(db);const d=new Domain(db);
try{await db.transaction(async tx=>{
 await tx.query('LOCK TABLE agents IN EXCLUSIVE MODE');if(await one(tx,"SELECT key FROM system_settings WHERE key='industry_staging_seed_v1'"))return;
 ensure(!await one(tx,'SELECT id FROM agents LIMIT 1'),'STAGING_NOT_EMPTY','Use an empty dedicated staging database');
 const profile=(await one(tx,'INSERT INTO profiles(primary_wallet,credits) VALUES($1,0) ON CONFLICT(primary_wallet) DO UPDATE SET primary_wallet=excluded.primary_wallet RETURNING *',[owner]))!;
 await transfer(tx,{key:'staging-seed-credits-v1',debit:await account(tx,'TREASURY_CLEARING'),credit:await account(tx,'CUSTOMER_CREDITS',{profileId:profile.id}),amount:2000000,type:'staging-issuance',reference:'staging-seed-v1',metadata:{staging:true,noChainReceipt:true}});await syncCustomer(tx,profile.id);
 const businesses=[];
 for(const [name,role] of [['PULSE','Researcher'],['RADAR','Scout'],['VERIFY','Verifier'],['INDEX','Indexer']]){
  const c=agentSchema.parse({name:name+' STAGING',ticker:name,description:'Staging business funded only by bounded test credits.',mission:'Research public PostgreSQL documentation, retain evidence and communicate uncertainty.',jobType:role,category:role==='Verifier'?'Verification':'Research',tags:['STAGING'],tools:name==='RADAR'?['web_search','marketplace']:['web_search'],brain:'openai/gpt-6-luna',schedule:'manual',intervalMinutes:30,tokenMode:'sandbox',initialBudget:.35,initialOperatingBudget:.05,policy:{...defaultPolicy,maxRunCost:.07,maxTools:1,autoHire:name==='RADAR',preferredCategories:['Verification']},services:[serviceSchema.parse({name:name+' evidence service',description:'Bounded staging service; no real USDC.',category:role==='Verifier'?'Verification':'Research',price:.01,maxSeconds:120})]});
  const a=await d.create(tx,profile,c);businesses.push(a.id);await tx.query('UPDATE agents SET paused=true WHERE id=$1',[a.id]);await tx.query("UPDATE jobs SET status='cancelled',phase='CANCELLED',finished_at=now(),last_error='Seeded paused for operator review' WHERE agent_id=$1",[a.id]);
 }
 await tx.query("INSERT INTO system_settings(key,value) VALUES('industry_staging_seed_v1',$1)",[JSON.stringify({businesses,testCredits:true,paused:true,reference:randomUUID()})]);
});console.log(JSON.stringify({seed:'READY',businesses:4,paused:true,testCredits:true}));}finally{await db.close();}
