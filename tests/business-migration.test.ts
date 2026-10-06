import { it,expect } from 'vitest';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { database,migrate,one } from '../packages/db/connection';
import { agentSchema,defaultPolicy,serviceSchema } from '../packages/core';
it('upgrades populated legacy histories and open escrows without losing or double-debiting funds',async()=>{
 const db=await database(true);
 try{
  await db.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz DEFAULT now())');
  for(const name of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')&&n<'007').sort()){const sql=await readFile('supabase/migrations/'+name,'utf8');await db.transaction(async tx=>{await (tx as any).exec(sql);await tx.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);});}
  const profile=(await one(db,"INSERT INTO profiles(primary_wallet,credits) VALUES('migration-fixture',99000000) RETURNING *"))!;
  const config=agentSchema.parse({name:'Legacy business',ticker:'LEGACY',description:'Migration preserves business records.',mission:'Preserve historical financial attribution.',category:'Research',tags:[],jobType:'Researcher',tools:[],tokenMode:'sandbox',policy:defaultPolicy,services:[serviceSchema.parse({name:'Legacy service',description:'A service with a reserved legacy payment.',price:1})]});
  const a=(await one(db,"INSERT INTO agents(slug,creator_profile_id,name,ticker,description,mission,job_type,category,config) VALUES('legacy',$1,'Legacy business','LEGACY',$2,$3,'Researcher','Research',$4) RETURNING *",[profile.id,config.description,config.mission,JSON.stringify(config)]))!;
  await db.query("INSERT INTO ledger_entries(agent_id,direction,category,amount,idempotency_key) VALUES($1,'credit','funding',10000000,'legacy-funding'),($1,'debit','compute',1000,'legacy-compute')",[a.id]);
  const s=(await one(db,"INSERT INTO agent_services(agent_id,slug,name,description,category,request_schema,response_schema,price_amount) VALUES($1,'legacy-service','Legacy service','Existing request','Research','{}','{}',1000000) RETURNING *",[a.id]))!;
  const job=(await one(db,"INSERT INTO jobs(agent_id,type,trigger_type,idempotency_key) VALUES($1,'SERVICE','paid','legacy-job') RETURNING *",[a.id]))!;
  const payment=(await one(db,"INSERT INTO payments(provider,network,payer_address,payee_address,amount,status,reference,idempotency_key) VALUES('dev','sandbox','customer','legacy',1000000,'reserved','legacy-payment','legacy-payment') RETURNING *"))!;
  await db.query("INSERT INTO service_requests(service_id,requester_profile_id,provider_agent_id,input,payment_id,job_id,idempotency_key) VALUES($1,$2,$3,'{}',$4,$5,'legacy-request')",[s.id,profile.id,a.id,payment.id,job.id]);
  const work=randomUUID();await db.query("INSERT INTO work_offers(id,creator_profile_id,title,description,category,budget_amount,deadline_at) VALUES($1,$2,'Legacy open work','Preserve a held work reservation','Research',500000,now()+interval '1 hour')",[work,profile.id]);
  await migrate(db);
  expect(Number((await one(db,"SELECT balance FROM ledger_accounts WHERE business_id=$1 AND kind='BUSINESS_COMPUTE'",[a.id]))!.balance)).toBe(9999000);
  expect(Number((await one(db,"SELECT balance FROM ledger_accounts WHERE profile_id=$1",[profile.id]))!.balance)).toBe(99000000);
  expect(Number((await one(db,"SELECT sum(balance) n FROM ledger_accounts WHERE kind='SETTLEMENT_ESCROW'"))!.n)).toBe(1500000);
  expect((await one(db,'SELECT * FROM payments WHERE id=$1',[payment.id]))!.escrow_account).toBeTruthy();
  expect((await one(db,'SELECT * FROM work_offers WHERE id=$1',[work]))!.debit_account).toBeTruthy();
  expect((await one(db,'SELECT * FROM agents WHERE id=$1',[a.id]))!.business_id).toBe(a.id);
  expect(Number((await one(db,'SELECT count(*) n FROM ledger_entries'))!.n)).toBe(2);
  expect((await db.query('SELECT transaction_id FROM ledger_entries')).rows.every(r=>r.transaction_id)).toBe(true);
 }finally{await db.close();}
});
