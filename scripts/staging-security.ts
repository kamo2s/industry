import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import pg from 'pg';import nacl from 'tweetnacl';import bs58 from 'bs58';
import {database,migrate,one} from '../packages/db/connection';import {Domain} from '../packages/db/domain';import {agentSchema,defaultPolicy,serviceSchema} from '../packages/core';
const cfg=JSON.parse(await readFile('.data/staging/environment.json','utf8'));Object.assign(process.env,cfg,{OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',NODE_ENV:'test'});
const admin=new pg.Client({connectionString:cfg.DATABASE_URL});await admin.connect();for(const role of ['anon','authenticated','service_role'])if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await admin.query(`CREATE ROLE ${role} ${role==='service_role'?'BYPASSRLS':''}`);
if((await admin.query("SELECT 1 FROM pg_database WHERE datname='industry_security'")).rowCount)throw Error('Preserve existing security fixture');await admin.query('CREATE DATABASE industry_security');await admin.end();const url=new URL(cfg.DATABASE_URL);url.pathname='/industry_security';process.env.DATABASE_URL=url.href;
const db=await database(),checks:Record<string,boolean>={};
try{
 // Upgrade a populated schema at the exact pre-staging migration boundary.
 await db.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz DEFAULT now())');
 for(const name of (await readdir('supabase/migrations')).filter(n=>/^00|^010/.test(n)).sort()){await db.transaction(async tx=>{await tx.query(await readFile('supabase/migrations/'+name,'utf8'));await tx.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);});}
 await db.query("INSERT INTO profiles(primary_wallet,credits) VALUES('migration-preservation-fixture',0)");const previous=(await db.query('SELECT * FROM profiles')).rows;
 await migrate(db);checks.upgradePreserved=JSON.stringify((await db.query('SELECT * FROM profiles')).rows)===JSON.stringify(previous);checks.allMigrations=(await db.query('SELECT name FROM schema_migrations')).rows.length===11;
 const d=new Domain(db);async function login(){const key=nacl.sign.keyPair(),wallet=bs58.encode(key.publicKey),c=await d.dispatch('auth/challenge',{wallet}),input={wallet,id:c.id,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(c.message),key.secretKey))};const auth=await d.dispatch('auth/verify',input);try{await d.dispatch('auth/verify',input);checks.nonceReplay=false;}catch{checks.nonceReplay=true;}return {session:auth.session,wallet,id:auth.profile.id};}
 const owner=await login(),other=await login();await db.query('UPDATE profiles SET credits=1000000 WHERE id=$1',[owner.id]);
 const a=await d.dispatch('agents/create',{key:randomUUID(),input:agentSchema.parse({name:'SECURITY STAGING',ticker:'SECURITY',description:'Private staging security fixture.',mission:'Verify bounded authority and visibility.',jobType:'Researcher',category:'Research',tags:[],tools:[],brain:'development/mock',schedule:'manual',tokenMode:'sandbox',initialBudget:.1,policy:defaultPolicy,services:[serviceSchema.parse({name:'Security fixture',description:'Staging-only contract.',price:.01})]})},owner.session);
 for(const [name,op,body,session] of [['anonymousMutation','agents/pause',{id:a.id},undefined],['crossOwner','agents/pause',{id:a.id},other.session],['anonymousAdmin','admin/status',{},undefined],['otherAdmin','admin/status',{},other.session]] as const){try{await d.dispatch(op,body,session);checks[name]=false;}catch{checks[name]=true;}}
 process.env.ADMIN_WALLETS=owner.wallet;checks.adminAllowed=!!(await d.dispatch('admin/status',{},owner.session)).health;
 await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE profile_id=$1",[other.id]);checks.expiredSession=!(await d.dispatch('auth/session',{},other.session)).profile;
 for(const role of ['anon','authenticated']){
  for(const table of ['agents','agent_memories','jobs','operation_events','browser_captures','ledger_accounts','ledger_transactions','pump_businesses','system_settings','schema_migrations']){
   try{const rows=await db.transaction(async tx=>{await tx.query(`SET LOCAL ROLE ${role}`);return (await tx.query(`SELECT * FROM ${table}`)).rows;});checks[`${role}:${table}`]=rows.length===0;}catch{checks[`${role}:${table}`]=true;}
  }
  const writable=await db.transaction(async tx=>{await tx.query(`SET LOCAL ROLE ${role}`);return one(tx,"SELECT has_function_privilege(current_user,'post_ledger_transfer(text,uuid,uuid,bigint,text,uuid,text,text,jsonb,timestamptz)','EXECUTE') allowed");});checks[`${role}:noLedgerFunction`]=!writable?.allowed;
 }
 await db.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role');checks.serviceRole=await db.transaction(async tx=>{await tx.query('SET LOCAL ROLE service_role');return (await tx.query('SELECT id FROM agents')).rows.length===1;});
 await mkdir('qa/staging',{recursive:true});await writeFile('qa/staging/security.json',JSON.stringify({at:new Date().toISOString(),database:'Native PostgreSQL',checks,allPassed:Object.values(checks).every(Boolean),identityBoundary:'Wallet session in application; Supabase browser roles have no private access'},null,2));console.log(JSON.stringify({allPassed:Object.values(checks).every(Boolean),checks}));if(Object.values(checks).some(v=>!v))process.exitCode=1;
}finally{await db.close();}
