import 'dotenv/config';
import fs from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import nacl from 'tweetnacl';import bs58 from 'bs58';
import {database,migrate,one} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {agentSchema,defaultPolicy,serviceSchema} from '../packages/core';
await fs.mkdir('.data/staging',{recursive:true});
const password=(await fs.readFile('.data/staging/postgres-password','utf8')).trim();
const cluster=new pg.Client({host:'127.0.0.1',port:55432,user:'industry_test',password,database:'postgres'});await cluster.connect();
if(!(await cluster.query("SELECT 1 FROM pg_database WHERE datname='industry_staging'")).rowCount)await cluster.query('CREATE DATABASE industry_staging');await cluster.end();
const env:Record<string,string>={APP_ENV:'staging',APP_MODE:'live',PUBLIC_APP_URL:'http://localhost:3100',NEXT_PUBLIC_SITE_URL:'http://localhost:3100',STAGING_LOCAL_SIMULATION:'true',DATABASE_URL:`postgresql://industry_test:${password}@127.0.0.1:55432/industry_staging`,DB_PORT:'4418',PORT:'3100',INTERNAL_API_URL:'http://127.0.0.1:4418',STAGING_DETERMINISTIC_PROVIDER:'true',STAGING_PROVIDER_DAILY_CAP_USD:'2.00',SOLANA_NETWORK:'devnet',INTERNAL_LEDGER_ENABLED:'true',PUMP_LAUNCH_ENABLED:'false',PUMP_MAINNET_LAUNCH_ENABLED:'false',PUMP_FEE_COLLECTION_ENABLED:'false',PUMP_MAINNET_COLLECTION_ENABLED:'false',INDUSTRY_FEE_TREASURY:'',INDUSTRY_FEE_COLLECTOR:'',SEARCH_PROVIDER:'openrouter',OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY||'',BROWSER_PROVIDER:'fetch',RATE_LIMIT_NAMESPACE:'staging-simulation'};
try{Object.assign(env,JSON.parse(await fs.readFile('.data/staging/environment.json','utf8')));}catch{for(const k of ['INTERNAL_API_SECRET','WORKER_API_SECRET','PUMP_COLLECTOR_API_SECRET','SESSION_SECRET','WALLET_ENCRYPTION_KEY'])env[k]=randomBytes(32).toString('hex');}
delete env.OPENAI_API_KEY;env.SEARCH_PROVIDER='openrouter';env.OPENROUTER_API_KEY=process.env.OPENROUTER_API_KEY||env.OPENROUTER_API_KEY||'';
Object.assign(process.env,env);const db=await database();await migrate(db);const domain=new Domain(db);
try{
 if(!await one(db,"SELECT key FROM system_settings WHERE key='industry_staging_seed_v1'")){
  const identities:any[]=[];
  for(const [name,role] of [['PULSE','Researcher'],['VERIFY','Verifier'],['RADAR','Scout'],['INDEX','Indexer']]){
   const keys=nacl.sign.keyPair(),wallet=bs58.encode(keys.publicKey),challenge=await domain.dispatch('auth/challenge',{wallet});
   const auth=await domain.dispatch('auth/verify',{id:challenge.id,wallet,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.message),keys.secretKey))});
   await db.query('UPDATE profiles SET credits=500000 WHERE primary_wallet=$1',[wallet]);
   const live=name==='RADAR'||name==='VERIFY';
   const config=agentSchema.parse({name:`${name} STAGING`,ticker:name,description:'Isolated staging business. Test credits; no token or creator fees.',mission:role==='Verifier'?'Verify the supplied claim using official PostgreSQL documentation. Return a concise evidence-based answer with uncertainty.':'Explain PostgreSQL row-level security from official documentation. Discover sources, request the permitted verifier, and produce a concise sourced summary.',scope:'PostgreSQL row-level security official documentation',jobType:role,category:role==='Verifier'?'Verification':'Research',tags:['STAGING'],tools:name==='RADAR'?['web_search','marketplace']:['web_search'],brain:live?'openai/gpt-6-luna':'development/mock',schedule:name==='VERIFY'?'manual':'interval',intervalMinutes:15,tokenMode:'sandbox',initialBudget:.35,initialOperatingBudget:.05,policy:{...defaultPolicy,maxRunCost:live?.07:.02,hourlySpend:1,dailySpend:2,autoHire:name==='RADAR',preferredCategories:['Verification'],maxTools:1},services:[serviceSchema.parse({name:name==='VERIFY'?'Verify a claim':'Research public documentation',description:'Staging evidence service using explicit test credits.',category:role==='Verifier'?'Verification':'Research',price:.01,maxSeconds:120,requestSchema:{type:'object',properties:{claim:{type:'string',maxLength:2000}},required:['claim'],additionalProperties:false}})]});
   const agent=await domain.dispatch('agents/create',{input:config,key:randomUUID()},auth.session);
   await db.query("UPDATE jobs SET status='cancelled',phase='CANCELLED',finished_at=now(),last_error='Staging seed: first work is scheduled deliberately' WHERE agent_id=$1 AND type='BOOT'",[agent.id]);
   await db.query("UPDATE agents SET next_run_at=now()+interval '30 seconds' WHERE id=$1 AND config->>'schedule'='interval'",[agent.id]);
   identities.push({name,agent,session:auth.session,wallet});
  }
  env.ADMIN_WALLETS=identities[0].wallet;await fs.writeFile('.data/staging/identities.json',JSON.stringify(identities),{mode:0o600});
  await db.query("INSERT INTO system_settings(key,value) VALUES('industry_staging_seed_v1',$1)",[JSON.stringify({businesses:identities.map(i=>i.agent.id),testCredits:true})]);
 }
 await fs.writeFile('.data/staging/environment.json',JSON.stringify(env),{mode:0o600});
 console.log(JSON.stringify({database:'isolated PostgreSQL',migrations:(await db.query('SELECT name FROM schema_migrations')).rows.length,businesses:4,mainnet:false,credentials:'private local files only'}));
}finally{await db.close();}
