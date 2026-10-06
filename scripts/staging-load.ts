import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';import pg from 'pg';import nacl from 'tweetnacl';import bs58 from 'bs58';
import {database,migrate,one} from '../packages/db/connection';import {Domain} from '../packages/db/domain';
import {agentSchema,defaultPolicy,serviceSchema} from '../packages/core';import {executeRun} from '../packages/agent/runtime';import {systemHealth} from '../packages/db/system-health';
const env=JSON.parse(await readFile('.data/staging/environment.json','utf8'));Object.assign(process.env,env,{OPENAI_API_KEY:'',WORKER_OPENAI_CONFIGURED:'false',OPENROUTER_API_KEY:'',SEARCH_PROVIDER_API_KEY:''});
const target=new URL(env.DATABASE_URL);target.pathname='/industry_stress';const admin=new pg.Client({connectionString:env.DATABASE_URL});await admin.connect();
if((await admin.query("SELECT 1 FROM pg_database WHERE datname='industry_stress'")).rowCount)throw new Error('Stress target already exists; preserve evidence and choose a fresh target');
await admin.query('CREATE DATABASE industry_stress');await admin.end();process.env.DATABASE_URL=target.href;
const db=await database();await migrate(db);const d=new Domain(db),people:any[]=[];const started=Date.now(),events:any[]=[];
try{
 for(let i=0;i<20;i++){
  const key=nacl.sign.keyPair(),wallet=bs58.encode(key.publicKey),c=await d.dispatch('auth/challenge',{wallet});const session=(await d.dispatch('auth/verify',{wallet,id:c.id,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(c.message),key.secretKey))})).session;
  await db.query('UPDATE profiles SET credits=2000000 WHERE primary_wallet=$1',[wallet]);
  const input=agentSchema.parse({name:'LOAD '+i,ticker:'LOAD'+i,description:'Deterministic isolated load fixture.',mission:'Summarize public documentation safely.',jobType:'Researcher',category:'Research',tags:['STAGING'],tools:['web_search','marketplace'],brain:'development/mock',schedule:'manual',tokenMode:'sandbox',initialBudget:1,initialOperatingBudget:.5,policy:{...defaultPolicy,maxRunCost:.1,hourlySpend:10,dailySpend:10,autoHire:false},services:[serviceSchema.parse({name:'Load service '+i,description:'Deterministic load-test evidence service.',price:.01})]});
  const agent=await d.dispatch('agents/create',{input,key:randomUUID()},session);people.push({session,agent});
  for(let n=0;n<3;n++)await db.query("INSERT INTO jobs(agent_id,type,trigger_type,payload,idempotency_key) VALUES($1,'RUN','load',$2,$3)",[agent.id,JSON.stringify({input:{topic:'PostgreSQL official documentation'}}),`load:${i}:${n}`]);
 }
 const services=await d.dispatch('services/list');
 await Promise.all(people.map(async(p,i)=>{const seller=services.find((s:any)=>s.agent_id===people[(i+1)%20].agent.id);const key=randomUUID(),args={id:seller.id,input:{input:{topic:'Load test '+i}},key};const result=await d.dispatch('services/request',args,p.session);const again=await d.dispatch('services/request',args,p.session);if(again.jobId!==result.jobId)throw Error('Duplicate purchase');}));
 let processed=0,retries=0;
 async function lane(serviceOnly:boolean){for(let n=0;n<300;n++){
  let claim:any;try{claim=await d.worker('claim',{worker:'load-'+serviceOnly,serviceOnly});if(!claim){if(!(await one(db,"SELECT id FROM jobs WHERE status IN ('queued','running')")))break;await new Promise(r=>setTimeout(r,40));continue;}
   if(claim.job.type==='SERVICE'&&processed%7===0){await d.worker('fail',{id:claim.job.id,lease:claim.job.lease,error:'Controlled permanent failure',permanent:true});}
   else{const result=await executeRun(claim,(op,b)=>d.worker(op,b));await d.worker('complete',{id:claim.job.id,lease:claim.job.lease,...result});}
   processed++;
  }catch(e){retries++;events.push({code:(e as any).code||'unknown',jobId:claim?.job.id});if(claim)await d.worker('fail',{id:claim.job.id,lease:claim.job.lease,error:'Controlled infrastructure recovery',permanent:false}).catch(()=>{});await new Promise(r=>setTimeout(r,100));}
 }}
 await Promise.all([lane(false),lane(false),lane(true)]);
 const timings:any={};for(const op of ['network/stats','agents/list','services/list','economy','activity','network/graph']){const values=[];for(let i=0;i<5;i++){const t=performance.now();await d.dispatch(op);values.push(performance.now()-t);}timings[op]={medianMs:values.sort((a,b)=>a-b)[2],maxMs:Math.max(...values)};}
 const h=await db.transaction(tx=>systemHealth(tx)),counts=(await db.query('SELECT status,count(*) n FROM jobs GROUP BY status')).rows;
 const bad=await one(db,"SELECT count(*) n FROM ledger_accounts WHERE kind IN ('BUSINESS_COMPUTE','BUSINESS_OPERATING','CUSTOMER_CREDITS','SETTLEMENT_ESCROW') AND balance<0");
 const duplicates=await one(db,"SELECT count(*) n FROM (SELECT idempotency_key FROM ledger_transactions GROUP BY idempotency_key HAVING count(*)>1) t");
 const checks={jobs:counts.reduce((n,r)=>n+Number(r.n),0)===100,queueDrained:Number(h.queue.queued)===0&&Number(h.queue.running)===0,balanced:h.ledgerInvariantErrors===0,nonnegative:Number(bad?.n)===0,uniqueSettlement:Number(duplicates?.n)===0,noProviderSpend:h.budget.chargedMicro===0};
 await mkdir('qa/staging',{recursive:true});await writeFile('qa/staging/load.json',JSON.stringify({at:new Date().toISOString(),database:'PostgreSQL 17 / isolated stress database',businesses:20,processed,retries,events,counts,checks,timings,elapsedSeconds:(Date.now()-started)/1000},null,2));console.log(JSON.stringify({checks,counts,retries,timings}));if(Object.values(checks).some(v=>!v))process.exitCode=1;
}finally{await db.close();}
