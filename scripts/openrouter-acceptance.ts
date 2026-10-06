import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrate,one,type Database,type Queryable} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {agentSchema,defaultPolicy,serviceSchema} from '../packages/core';
import {executeRun} from '../packages/agent/runtime';
import {autonomousModelPolicy} from '../packages/core/autonomy';
import {approvedModels} from '../packages/core/model-registry';
import {setRouterAcceptanceGuard} from '../packages/agent/openrouter-client';
Object.assign(process.env,{APP_ENV:'local',APP_MODE:'demo',NODE_ENV:'test',OPENROUTER_ALLOWED_MODELS:'',MODEL_INPUT_PRICE_PER_MILLION:'100',MODEL_OUTPUT_PRICE_PER_MILLION:'500'});delete process.env.OPENAI_API_KEY;process.env.WALLET_ENCRYPTION_KEY||='a'.repeat(64);
const dir=process.env.INDUSTRY_QA_DIR||'qa/openrouter-migration',path='.data/openrouter-acceptance-'+randomUUID();await mkdir(path,{recursive:true});
const pg=await PGlite.create(path),db:Database={query:(s,v)=>pg.query(s,v),transaction:fn=>pg.transaction(tx=>fn(tx as unknown as Queryable)),close:()=>pg.close()};await migrate(db);const d=new Domain(db);
const journal=JSON.parse(await readFile(dir+'/compatibility-budget.json','utf8')),budgetFile=dir+'/runtime-budget.json';let reserved=Object.values(journal).reduce<number>((a,b)=>a+Number(b),0);try{reserved=Math.max(reserved,JSON.parse(await readFile(budgetFile,'utf8')).reserved);}catch{}const calls:Record<string,number>={};
setRouterAcceptanceGuard(async(max,id)=>{assert(reserved+max<=2000000,'Combined acceptance maximum $2');reserved+=max;calls[id]=max;await writeFile(budgetFile,JSON.stringify({reserved,calls}));});
const originalFetch=globalThis.fetch,hosts=new Set<string>();globalThis.fetch=async(input,init)=>{const u=new URL(String(input));assert.notEqual(u.hostname,'api.openai.com');hosts.add(u.hostname);return originalFetch(input,init);};
const profile={id:randomUUID(),primary_wallet:'Acceptance-'+randomUUID(),display_name:'OpenRouter acceptance',credits:20000000};await db.query('INSERT INTO profiles(id,primary_wallet,display_name) VALUES($1,$2,$3)',[profile.id,profile.primary_wallet,profile.display_name]);
const reports:any[]=[];const requested=(process.argv.find(a=>a.startsWith('--models='))||'').slice(9).split(',').filter(Boolean);
// Candidate acceptance is isolated; does not enable a model in the product.
for(const m of approvedModels)if(requested.includes(m.id))m.enabled=true;
async function execute(claim:any){assert(claim,'Expected claimed job');const before=Number((await one(db,"SELECT balance FROM ledger_accounts WHERE business_id=$1 AND kind='BUSINESS_COMPUTE'",[claim.agent.id]))!.balance);
 try{const result=await executeRun(claim,async(op,b)=>{if(op==='services'){const rows=await d.worker(op,b);await writeFile(dir+'/supplier-eligibility.json',JSON.stringify(rows,null,2));return rows;}if(op==='dependency'){const supplier=await d.worker('claim',{worker:'router-supplier',serviceOnly:true});if(supplier)await execute(supplier);}return d.worker(op,b);});assert(!('deferred' in result),'Acceptance job should deliver');await d.worker('complete',{id:claim.job.id,lease:claim.job.lease,...result});const after=Number((await one(db,"SELECT balance FROM ledger_accounts WHERE business_id=$1 AND kind='BUSINESS_COMPUTE'",[claim.agent.id]))!.balance);assert.equal(before-after,result.cost);assert(result.runs.filter((r:any)=>r.kind==='model').every((r:any)=>['OpenRouter','OpenRouter Web Search'].includes(r.provider)&&r.metadata.model===claim.agent.config.brain));const live=await d.dispatch('agents/live',{id:claim.agent.id});
 reports.push({coinId:claim.agent.id,jobId:claim.job.id,model:claim.agent.config.brain,status:'succeeded',cost:result.cost,debited:before-after,output:result.output,runs:result.runs,live});console.log(JSON.stringify({model:claim.agent.config.brain,status:'succeeded',cost:result.cost}));return result;
 }catch(e:any){await d.worker('fail',{id:claim.job.id,lease:claim.job.lease,error:String(e.code||e.message),permanent:true}).catch(()=>{});reports.push({model:claim.agent.config.brain,status:'failed',error:e.code||e.message,detail:e.message});console.log(JSON.stringify(reports.at(-1)));return null;}}
async function create(model:string,mission:string,tools:any[],role='Researcher',extra:any={}){const c=agentSchema.parse({name:'Router '+role,ticker:'QA'+Math.random().toString(36).slice(2,6),description:'Bounded live OpenRouter acceptance with TEST_USDC credits.',mission,scope:mission,brain:model,tags:[],jobType:role,category:role==='Verifier'?'Verification':'Research',tools,schedule:'manual',tokenMode:'sandbox',initialBudget:3,initialOperatingBudget:.1,publicOutput:true,policy:{...autonomousModelPolicy(model),maxTools:3,autoHire:false},services:[serviceSchema.parse({name:role==='Verifier'?'Check arithmetic':'Public evidence',category:role==='Verifier'?'Verification':'Research',description:'Independently check the supplied arithmetic using exact calculation. Return findings, uncertainty and sources only if used.',price:.01,maxSeconds:60})],...extra});return db.transaction(tx=>d.create(tx,profile,c));}
try{
 for(const model of process.argv.includes('--cross-only')?[]:requested.length?requested:['openai/gpt-6-luna','anthropic/claude-sonnet-5','google/gemini-3.8-flash','z-ai/glm-5.3','minimax/minimax-m3','mistralai/mistral-small-2603']){
 const mission=process.argv.includes('--browser')?'Read https://www.postgresql.org/docs/current/ddl-rowsecurity.html with browser_fetch exactly once and explain default-deny row security with source evidence.':model==='openai/gpt-6-luna'?'Use web search to find official PostgreSQL row security documentation. Give a concise sourced explanation of default deny. Only one search.':'Use only supplied numbers: requests increased from 100 to 120. Calculate growth and explain why costs are needed to assess profit. Do not use search or fetch.';
 const coin=await create(model,mission,process.argv.includes('--browser')?['browser_fetch']:model==='openai/gpt-6-luna'?['web_search','http']:[]);await execute(await d.worker('claim',{worker:'router-acceptance'}));await db.query('UPDATE agents SET paused=true WHERE id=$1',[coin.id]);await writeFile(dir+'/runtime.json',JSON.stringify({path,openAIKeyAbsent:!process.env.OPENAI_API_KEY,hosts:[...hosts],reports},null,2));
 }
 if(!process.argv.includes('--models-only')){
 const supplier=await create('anthropic/claude-sonnet-5','Independently verify supplied arithmetic. For baseline calculate growth from 100 to 120. For paid requests answer the exact arithmetic question; do not search or fetch. State limitations.',[],'Verifier');await execute(await d.worker('claim',{worker:'router-supplier-baseline'}));
 const buyer=await create('openai/gpt-6-luna','Prepare a decision brief from supplied data: requests increased from 100 to 120. The proposed report says this is 25% growth. The report needs a separate arithmetic assessment before publication; use the permitted specialist if suitable and affordable, then incorporate its findings. Never claim organizational independence. No web search or fetching; all input data is here.',['marketplace'],'Scout',{schedule:'continuous',policy:{...defaultPolicy,maxRunCost:.1,maxTools:3,autoHire:true,counterparties:[supplier.id],preferredCategories:[]}});
 await execute(await d.worker('claim',{worker:'router-buyer'}));await db.query('UPDATE agents SET paused=true WHERE id=ANY($1::uuid[])',[[buyer.id,supplier.id]]);
 const payments=(await db.query('SELECT p.status,p.amount,p.provider,r.requester_agent_id,r.provider_agent_id FROM payments p JOIN service_requests r ON r.payment_id=p.id')).rows;assert(payments.some(p=>p.status==='settled'&&p.requester_agent_id===buyer.id&&p.provider_agent_id===supplier.id),'Cross-Coin settlement required');
 if(process.argv.includes('--three-coins')){
 const brief=reports.find(r=>r.coinId===buyer.id&&r.status==='succeeded');assert(brief,'Buyer brief required');
 const analysisMission='Analyze the supplied completed GPT report and its separately executed Claude verification. Explain corrected growth, uncertainty, and why usage growth alone does not establish profit. Do not invent revenue or browse. This is supplied test data, not market performance.';
 const analyst=await create('google/gemini-3.8-flash',analysisMission,[],'Analyst');
 await db.query("UPDATE jobs SET payload=jsonb_set(payload,'{input}',$1::jsonb) WHERE agent_id=$2 AND type='BOOT'",[JSON.stringify({topic:analysisMission,sourceCoinId:buyer.id,sourceJobId:brief.jobId,report:brief.output}),analyst.id]);
 await execute(await d.worker('claim',{worker:'router-analyst'}));await db.query('UPDATE agents SET paused=true WHERE id=$1',[analyst.id]);assert(reports.some(r=>r.coinId===analyst.id&&r.status==='succeeded'),'Gemini analysis required');
 }
 const imbalance=(await db.query("SELECT transaction_id FROM ledger_postings GROUP BY transaction_id HAVING sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END)<>0")).rows;assert.equal(imbalance.length,0);
 await writeFile(dir+'/runtime.json',JSON.stringify({path,openAIKeyAbsent:!process.env.OPENAI_API_KEY,hosts:[...hosts],reports,payments,ledgerBalanced:true,crossCoinPassed:true},null,2));
}
}finally{await db.query('UPDATE agents SET paused=true,next_run_at=NULL');const evidence={path,openAIKeyAbsent:!process.env.OPENAI_API_KEY,hosts:[...hosts],reports};await writeFile(dir+'/last-runtime-attempt.json',JSON.stringify(evidence,null,2));await writeFile(dir+'/'+path.split('/').at(-1)+'.json',JSON.stringify(evidence,null,2));await db.close();}


