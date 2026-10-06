import {readFile,writeFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import pg from 'pg';import nacl from 'tweetnacl';import bs58 from 'bs58';
import {database,migrate} from '../packages/db/connection';import {Domain} from '../packages/db/domain';import {agentSchema,serviceSchema,defaultPolicy} from '../packages/core';import {executeRun} from '../packages/agent/runtime';import {captureStore} from '../packages/agent/capture-storage';
const cfg=JSON.parse(await readFile('.data/staging/environment.json','utf8'));Object.assign(process.env,cfg,{OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',BROWSERBASE_API_KEY:'',BROWSER_PROVIDER:'local',BROWSER_EXECUTABLE_PATH:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const admin=new pg.Client({connectionString:cfg.DATABASE_URL});await admin.connect();if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname='industry_capture'")).rowCount)await admin.query('CREATE DATABASE industry_capture');await admin.end();const url=new URL(cfg.DATABASE_URL);url.pathname='/industry_capture';process.env.DATABASE_URL=url.href;
const db=await database();await migrate(db);const d=new Domain(db);
try{
 const keys=nacl.sign.keyPair(),wallet=bs58.encode(keys.publicKey),c=await d.dispatch('auth/challenge',{wallet}),auth=await d.dispatch('auth/verify',{wallet,id:c.id,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(c.message),keys.secretKey))});
 await db.query('UPDATE profiles SET credits=100000 WHERE id=$1',[auth.profile.id]);
 if((await db.query('SELECT id FROM agents LIMIT 1')).rows.length)throw Error('Preserve completed browser QA fixture');
 const a=await d.dispatch('agents/create',{key:randomUUID(),input:agentSchema.parse({name:'CAPTURE STAGING QA',ticker:'CAPTURE',description:'Real safe browser capture acceptance.',mission:'Read https://example.com/ and report the public page.',scope:'https://example.com/',jobType:'Watcher',category:'Research',tags:[],services:[serviceSchema.parse({name:'Public page QA',description:'Real safe public HTML rendering.',price:.01})],tools:['browser_fetch'],domains:['example.com'],brain:'development/mock',schedule:'manual',tokenMode:'sandbox',initialBudget:.05,policy:{...defaultPolicy,maxRunCost:.01,autoHire:false}})},auth.session);
 const claim=await d.worker('claim',{worker:'capture-acceptance'});const result=await executeRun(claim,(op,body)=>d.worker(op,body));await d.worker('complete',{id:claim.job.id,lease:claim.job.lease,...result});
 const rows=(await db.query('SELECT id,storage_kind,storage_path FROM browser_captures WHERE job_id=$1',[claim.job.id])).rows;
 if(rows.length<1||rows.some(r=>r.storage_kind!=='supabase'))throw Error('No hosted real browser captures');
 const image=await d.dispatch('browser-captures/get',{id:rows[0].id},auth.session);await writeFile('qa/staging/actual-browser.webp',Buffer.from(image.content,'base64'));
 const report={at:new Date().toISOString(),business:a.id,job:claim.job.id,provider:'local-playwright',source:'https://example.com/',storage:'Supabase private bucket',captures:rows.length,authenticatedRead:true,sourceRetrieved:!!result.output.sources[0]?.retrieved_at,jobSucceeded:true,paidProviderCost:0,scope:'Native PostgreSQL QA database; real public HTML safely rendered on this PC, real hosted private storage. Not a hosted worker test.'};
 for(const r of rows){await captureStore.remove(r.storage_kind,r.storage_path);await db.query('DELETE FROM browser_captures WHERE id=$1',[r.id]);}
 await writeFile('qa/staging/browser.json',JSON.stringify({...report,temporaryObjectsRemoved:true},null,2));console.log(JSON.stringify(report));
}finally{await db.close();}

