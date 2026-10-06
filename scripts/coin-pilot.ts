import 'dotenv/config';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {database,one} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {autonomousLaunch} from '../packages/core/autonomy';
import {agentSchema,defaultPolicy,serviceSchema} from '../packages/core';
import {audit} from '../packages/db/controls';
import {providerBudget} from '../packages/db/provider-budget';

// Offline local pilot fixture/review only. Never opens a database owned by the broker.
assert(process.env.APP_ENV!=='production'&&process.env.APP_MODE==='demo'&&!process.env.DATABASE_URL,'Local demo database only');
let broker=false;try{await fetch('http://127.0.0.1:4318/rpc',{signal:AbortSignal.timeout(1000)});broker=true;}catch{}
assert(!broker,'Stop the project supervisor before using this offline fixture');
const db=await database(),d=new Domain(db),path='.data/coin-pilot.json',dir='qa/globe-pilot';await mkdir(dir,{recursive:true});
try{
 if(process.argv.includes('--seed')){
  assert(process.env.OPENROUTER_API_KEY,'Existing OpenRouter credential required');
  const old=await one(db,"SELECT value FROM system_settings WHERE key='live_coin_pilot_oct4'");assert(!old,'Pilot already exists; inspect its retained state instead of creating duplicates');
  const state=await db.transaction(async tx=>{
   const owner=await one(tx,"SELECT * FROM profiles WHERE display_name='Demo network curator'");assert(owner,'Existing local fixture owner required');
   const common='This is a bounded live pilot using public sources. Produce one useful baseline, then only work again if evidence changes materially; otherwise wait 3600 seconds. Do not manufacture new tasks, repeat the same report, or buy services merely to create activity. For paid service requests, answer the supplied request directly with primary evidence. Never claim unsupported recency, popularity or commercial success.';
   const specs=[
    {role:'Scout',ticker:'PSCO',mission:'Find and rank two open-source AI agent development projects with official documentation. Evaluate what developer problem each solves, public documentation quality and demonstrated capabilities. Begin with LangGraph and Pydantic AI as candidates, but verify actual evidence. Use web search for discovery and inspect a relevant official page. Buy independent verification only when useful before publishing. '+common},
    {role:'Analyst',ticker:'PANA',mission:'Compare LangGraph and Pydantic AI for a developer building a persistent research workflow. Explain differences in state/checkpoint persistence, structured outputs and integration, citing official documentation. Separate direct evidence from inference. Buy a claim-verification service when it improves the comparison. '+common},
    {role:'Verifier',ticker:'PVER',mission:'Verify public capability claims about AI agent developer frameworks. For the first baseline, examine the claim that LangGraph supports persistent execution through checkpoints and state. Seek supporting and conflicting primary evidence; state scope and limitations. Paid requests override this baseline topic and must address the exact supplied claim. '+common}
   ];
   const coins=[];
   for(const spec of specs){const c=autonomousLaunch(agentSchema.parse({name:'PILOT '+spec.role.toUpperCase(),ticker:spec.ticker,description:'Bounded pilot · real OpenAI and web search · development credits.',mission:spec.mission,jobType:spec.role,brain:'openai/gpt-6-luna',tokenMode:'sandbox',category:'Research',tags:['Pilot'],tools:[],policy:defaultPolicy,services:[serviceSchema.parse({name:'Pilot evidence service',description:'Public evidence for the bounded pilot.',price:.01})]}),false);c.initialBudget=.30;c.initialOperatingBudget=.04;
    const coin=await d.create(tx,owner,c);coins.push({...coin,role:spec.role});
   }
   // Restrict this test cohort to one another; the model still selects whether
   // any eligible service is useful. No service order or result is scripted.
   for(const coin of coins){const peers=coins.filter(c=>c.id!==coin.id).map(c=>c.id);await tx.query("UPDATE agents SET config=jsonb_set(config,'{policy,counterparties}',$2::jsonb) WHERE id=$1",[coin.id,JSON.stringify(peers)]);await audit(tx,owner,'live-pilot-created',coin.id,{compute:.30,operating:.04,model:'openai/gpt-6-luna',continuous:true,restrictedCohort:true});}
   const value={startedAt:new Date().toISOString(),coins,computeBudget:.90,operatingBudget:.12,mainnet:false};await tx.query("INSERT INTO system_settings(key,value) VALUES('live_coin_pilot_oct4',$1)",[JSON.stringify(value)]);return value;
  });await writeFile(path,JSON.stringify(state,null,2));console.log(JSON.stringify(state));
 }else{
  const state=JSON.parse(await readFile(path,'utf8')),ids=state.coins.map((c:any)=>c.id);
  if(process.argv.includes('--recheck'))await db.transaction(async tx=>{const owner=await one(tx,"SELECT * FROM profiles WHERE display_name='Demo network curator'");for(const id of ids){await tx.query('UPDATE agents SET next_run_at=now() WHERE id=$1 AND NOT paused',[id]);await audit(tx,owner!,'live-pilot-recheck',id,{reason:'Recheck autonomous next decision after bounded provider-response repair; mission and budgets unchanged'});}});
  if(process.argv.includes('--pause'))await db.transaction(async tx=>{const owner=await one(tx,"SELECT * FROM profiles WHERE display_name='Demo network curator'");for(const id of ids){await tx.query('UPDATE agents SET paused=true WHERE id=$1',[id]);await audit(tx,owner!,'live-pilot-finished',id,{reason:'Bounded owner-requested acceptance complete; retain all results'});}});
  const agents=(await db.query('SELECT id,slug,name,paused,config FROM agents WHERE id=ANY($1::uuid[])',[ids])).rows;
  const jobs=(await db.query('SELECT id,agent_id,type,status,phase,attempts,last_error,created_at,started_at,finished_at,payload FROM jobs WHERE agent_id=ANY($1::uuid[]) ORDER BY created_at',[ids])).rows;
  const outputs=(await db.query('SELECT id job_id,agent_id,output FROM jobs WHERE agent_id=ANY($1::uuid[]) AND output IS NOT NULL',[ids])).rows;
  const requests=(await db.query('SELECT r.*,p.status payment_status,p.amount,p.transaction_signature FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.requester_agent_id=ANY($1::uuid[])',[ids])).rows;
  const runs=(await db.query('SELECT r.* FROM model_tool_runs r JOIN jobs j ON j.id=r.job_id WHERE j.agent_id=ANY($1::uuid[])',[ids])).rows;
  const ledgerErrors=(await db.query("SELECT t.id FROM ledger_transactions t LEFT JOIN ledger_postings p ON p.transaction_id=t.id GROUP BY t.id HAVING count(p.*)<>2 OR sum(CASE p.direction WHEN 'credit' THEN p.amount ELSE -p.amount END)<>0")).rows;
  const services=(await d.dispatch('services/list')).filter((s:any)=>ids.includes(s.agent_id));
  const data={...state,reviewedAt:new Date().toISOString(),agents,jobs,outputs,requests,runs,services,ledgerErrors,providerBudget:await providerBudget(db)};
  await writeFile(dir+'/pilot-private-review.json',JSON.stringify(data,null,2));
  console.log(JSON.stringify({coins:agents.map(a=>({name:a.name,paused:a.paused})),jobs:jobs.map(j=>({id:j.id,coin:j.agent_id,type:j.type,status:j.status,error:j.last_error})),outputs:outputs.length,requests:requests.map(r=>({status:r.status,payment:r.payment_status,amount:r.amount})),services:services.map((s:any)=>({name:s.name,category:s.category,lifecycle:s.lifecycle,active:s.active,fields:s.request_schema.required})),providerCost:runs.reduce((n,r)=>n+Number(r.cost_amount),0)/1e6,ledgerErrors:ledgerErrors.length,providerBudget:data.providerBudget}));
 }
}finally{await db.close();}
