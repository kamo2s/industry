import 'dotenv/config';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {database,one} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {autonomousLaunch} from '../packages/core/autonomy';
import {agentSchema,defaultPolicy,serviceSchema} from '../packages/core';
import {audit} from '../packages/db/controls';
import {providerBudget} from '../packages/db/provider-budget';

// Local acceptance fixture. Never open PGlite alongside its broker.
assert(process.env.APP_ENV!=='production'&&process.env.APP_MODE==='demo'&&!process.env.DATABASE_URL,'Local demo database only');
let broker=false;try{await fetch('http://127.0.0.1:4318/rpc',{signal:AbortSignal.timeout(1000)});broker=true;}catch{}
assert(!broker,'Stop the supervisor before using the offline pilot fixture');
const independent=process.argv.includes('--independent'),key=independent?'collaboration_independent_oct4':'collaboration_pilot_oct4';
const db=await database(),d=new Domain(db),file=independent?'.data/independent-pilot.json':'.data/collaboration-pilot.json',dir=independent?'qa/collaboration/independent':'qa/collaboration';
await mkdir(dir,{recursive:true});
try{
  if(process.argv.includes('--seed')){
    assert(process.env.OPENROUTER_API_KEY,'Existing OpenRouter credential required');
    assert(!await one(db,'SELECT value FROM system_settings WHERE key=$1',[key]),'Pilot already exists');
    const funding=independent?.18:.30,budget=await providerBudget(db);assert(!budget.paused&&budget.capMicro-budget.committedMicro>=funding*3e6,'Keep the existing global cap; enough existing capacity is required');
    if(independent){
      const prior=JSON.parse(await readFile('qa/collaboration/pilot-review.json','utf8'));
      assert(prior.agents.every((a:any)=>a.paused),'First cohort must be paused');
      assert(prior.runs.reduce((n:number,r:any)=>n+Number(r.cost_amount),0)+funding*3e6<=900000,'Both scenarios together must remain below $0.90 compute');
    }
    const state=await db.transaction(async tx=>{
      const owner=await one(tx,"SELECT * FROM profiles WHERE display_name='Demo network curator'");assert(owner,'Existing local fixture owner required');
      const common='Use public primary documentation. Publish one useful baseline and then wait 3600 seconds unless materially new evidence or a genuinely unanswered mission question exists. Never reword a report, manufacture tasks or buy work for activity. Other Coins are optional suppliers, never mandatory purchases. For paid service requests, address the exact question within this mission and state limitations. Do not claim that a payment proves truth.';
      const specs=independent?[
        {role:'Verifier',ticker:'IVRF',mission:'Independently check PostgreSQL row-security and privilege claims against official PostgreSQL documentation. Begin with a concise baseline explaining what enabling row-level security does and does not guarantee. For paid service requests, investigate the exact supplied claim, identify bypass exceptions and return a supported, contradicted or unresolved assessment with precise primary citations. Do not substitute the baseline for a customer question. '+common},
        {role:'Scout',ticker:'ISCO',mission:'Prepare one concise evidence-based decision brief for an early-stage SaaS team considering PostgreSQL row-level security for tenant isolation. Their proposal uses the table-owner role for application queries, enables RLS and creates a tenant policy, but does not FORCE RLS. Determine whether this proposal meets the isolation goal and what question needs further review. A security-sensitive conclusion needs an independent assessment before being called verified; your own first-pass discovery is not independent verification. You may use an affordable specialist if its actual work improves this brief; report unresolved limits honestly if no suitable service exists. This is informational engineering research, not certification. '+common},
        {role:'Analyst',ticker:'IANA',mission:'Assess a different PostgreSQL tenant-isolation proposal: the application uses a non-owner role carrying BYPASSRLS, while FORCE ROW LEVEL SECURITY is enabled on the table. Explain whether FORCE removes this bypass, compare the role choices and give a concise configuration decision with primary evidence. A consequential conclusion needs independent assessment before being called verified; do not pass off your own first-pass analysis as independent verification. Decide whether an affordable specialist can materially improve this result; no purchase is mandatory and uncertainty must remain explicit. This is informational engineering research, not certification. '+common},
      ]:[
        {role:'Scout',ticker:'CSCO',mission:'Find two open-source AI workflow frameworks suitable for a small team whose research jobs must survive process restarts. Start with LangGraph and Pydantic AI. Produce a concise shortlist with primary sources, distinguish in-memory checkpoints from durable storage, and identify any material gaps before recommending a framework. You specialize in discovery, not correctness certification. '+common},
        {role:'Analyst',ticker:'CANA',mission:'Assess a concrete engineering risk for a persistent AI research workflow: whether LangGraph checkpoint recovery and Pydantic AI durable execution can resume after process termination without repeating completed external side effects. Compare the documented guarantees and required storage/runtime configuration. Separate framework claims from backend-dependent guarantees. Do not turn search excerpts into an unqualified reliability recommendation. '+common},
        {role:'Verifier',ticker:'CVER',mission:'Independently evaluate public durability and recovery claims about LangGraph and Pydantic AI against primary documentation. For your first baseline, investigate the narrow claim that in-memory checkpoint storage alone survives process restart. For paid requests, investigate the exact supplied claim, gather independent supporting/conflicting evidence and report what is supported, contradicted or unresolved. '+common},
      ];
      const coins=[];
      for(const s of specs){
        const config=autonomousLaunch(agentSchema.parse({name:(independent?'REVIEW ':'COLLAB ')+s.role.toUpperCase(),ticker:s.ticker,description:'Bounded collaboration acceptance · real AI · development credits.',mission:s.mission,jobType:s.role,brain:'openai/gpt-6-luna',tokenMode:'sandbox',category:'Research',tags:['Acceptance'],tools:[],policy:defaultPolicy,services:[serviceSchema.parse({name:'Public evidence service',description:'Sourced evidence within the immutable mission.',price:.01})]}),false);
        config.initialBudget=funding;config.initialOperatingBudget=.04;
        const coin=await d.create(tx,owner,config);coins.push({...coin,role:s.role});
      }
      for(const coin of coins){
        await tx.query("UPDATE agents SET config=jsonb_set(config,'{policy,counterparties}',$2::jsonb) WHERE id=$1",[coin.id,JSON.stringify(coins.filter(c=>c.id!==coin.id).map(c=>c.id))]);
        await audit(tx,owner,'collaboration-pilot-created',coin.id,{compute:funding,operating:.04,restrictedCohort:true,model:'openai/gpt-6-luna',mainnet:false});
      }
      const value={startedAt:new Date().toISOString(),coins,computeBudget:funding*3,operatingBudget:.12,mainnet:false,scenario:independent?'Independent review':'Framework comparison'};
      await tx.query('INSERT INTO system_settings(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);return value;
    });
    await writeFile(file,JSON.stringify(state,null,2));console.log(JSON.stringify(state));
  }else{
    const state=JSON.parse(await readFile(file,'utf8')),ids=state.coins.map((c:any)=>c.id);
    if(process.argv.includes('--recheck'))await db.transaction(async tx=>{
      assert(!await one(tx,"SELECT id FROM jobs WHERE agent_id=ANY($1::uuid[]) AND status IN ('running','queued')",[ids]),'Wait for current pilot jobs before another decision');
      const owner=await one(tx,"SELECT * FROM profiles WHERE display_name='Demo network curator'");
      for(const id of ids){
        await tx.query("UPDATE agents SET next_run_at=now() WHERE id=$1 AND NOT paused AND terminated_at IS NULL",[id]);
        await audit(tx,owner!,'collaboration-pilot-recheck',id,{reason:'Re-evaluate supplier capabilities after runtime correction; balances, mission and policies unchanged'});
      }
    });
    if(process.argv.includes('--pause'))await db.transaction(async tx=>{
      assert(!await one(tx,"SELECT id FROM jobs WHERE agent_id=ANY($1::uuid[]) AND status='running'",[ids]),'Let active pilot work finish before pausing');
      const owner=await one(tx,"SELECT * FROM profiles WHERE display_name='Demo network curator'");
      for(const id of ids){await tx.query('UPDATE agents SET paused=true WHERE id=$1',[id]);await audit(tx,owner!,'collaboration-pilot-finished',id,{reason:'Bounded acceptance ended; all evidence and balances retained'});}
    });
    const agents=(await db.query('SELECT id,slug,name,paused,config,autonomy_state FROM agents WHERE id=ANY($1::uuid[])',[ids])).rows;
    const jobs=(await db.query('SELECT id,agent_id,type,status,phase,attempts,last_error,created_at,started_at,finished_at,payload,output FROM jobs WHERE agent_id=ANY($1::uuid[]) ORDER BY created_at',[ids])).rows;
    const requests=(await db.query('SELECT r.*,p.status payment_status,p.amount,p.transaction_signature FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.requester_agent_id=ANY($1::uuid[])',[ids])).rows;
    const runs=(await db.query('SELECT r.* FROM model_tool_runs r JOIN jobs j ON j.id=r.job_id WHERE j.agent_id=ANY($1::uuid[]) ORDER BY j.created_at,r.id',[ids])).rows;
    const events=(await db.query('SELECT e.* FROM operation_events e JOIN jobs j ON j.id=e.job_id WHERE j.agent_id=ANY($1::uuid[]) ORDER BY e.id',[ids])).rows;
    const ledgerErrors=(await db.query("SELECT t.id FROM ledger_transactions t LEFT JOIN ledger_postings p ON p.transaction_id=t.id GROUP BY t.id HAVING count(p.*)<>2 OR sum(CASE p.direction WHEN 'credit' THEN p.amount ELSE -p.amount END)<>0")).rows;
    const data={...state,reviewedAt:new Date().toISOString(),agents,jobs,requests,runs,events,ledgerErrors,providerBudget:await providerBudget(db)};
    await writeFile(dir+'/pilot-review.json',JSON.stringify(data,null,2));
    console.log(JSON.stringify({coins:agents.map(a=>({name:a.name,paused:a.paused})),jobs:jobs.map(j=>({id:j.id,coin:j.agent_id,type:j.type,status:j.status,error:j.last_error})),requests:requests.map(r=>({buyer:r.requester_agent_id,seller:r.provider_agent_id,status:r.status,payment:r.payment_status,amount:r.amount})),recordedCost:runs.reduce((n,r)=>n+Number(r.cost_amount),0)/1e6,ledgerErrors:ledgerErrors.length,providerBudget:data.providerBudget}));
  }
}finally{await db.close();}
