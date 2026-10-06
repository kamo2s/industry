import {ensure,usd} from '../core';
import {operationEventInput,operationDescription,operationLabel,safeOperationalText,safeSourceUrl,type OperationalStatus} from '../core/operations';
import {one,type Queryable,type Row} from './connection';
import {balances} from './journal';
import {visibleCaptures,lastBrowserSession} from './captures';

export async function recordOperation(tx:Queryable,agent:Row,job:Row,input:unknown){
 const e=operationEventInput.parse(input),description=operationDescription(e);
 const count=await one(tx,'SELECT count(*) n FROM operation_events WHERE job_id=$1 AND run_id=$2',[job.id,job.run_id]);
 ensure(Number(count!.n)<200,'EVENT_LIMIT','Operation event limit reached');
 const data={...e.data,query:e.data.query?safeOperationalText(e.data.query,1000):undefined,url:e.data.url?safeSourceUrl(e.data.url):undefined,title:e.data.title?safeOperationalText(e.data.title):undefined,
 sources:e.data.sources?.map(s=>({...s,url:safeSourceUrl(s.url),title:safeOperationalText(s.title)})).filter(s=>s.url)};
 await tx.query(`INSERT INTO operation_events(business_id,job_id,run_id,event_key,event_type,stage,status,public_summary,metadata,visibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(job_id,run_id,event_key) DO NOTHING`,[agent.business_id||agent.id,job.id,job.run_id,e.key,e.type,description.stage,description.status,description.summary,JSON.stringify(data),e.visibility]);
 return {ok:true};
}
export async function operationalStatus(tx:Queryable,a:Row):Promise<OperationalStatus>{
 const active=await one(tx,`SELECT j.*,r.requester_agent_id FROM jobs j LEFT JOIN service_requests r ON r.job_id=j.id WHERE j.agent_id=$1 AND j.status='running' ORDER BY j.started_at DESC LIMIT 1`,[a.id]);
 if(active?.payload.recoveryBlocked)return {state:'ERROR',active:false,jobId:active.id,stage:'Accounting reconciliation required'};
 if(a.terminated_at||a.paused||a.config.policy?.killSwitch)return {state:a.terminated_at?'TERMINATED':'PAUSED',active:!!active,jobId:active?.id};
 if(active){
  const latest=await one(tx,"SELECT stage FROM operation_events WHERE job_id=$1 AND run_id=$2 AND visibility='PUBLIC' ORDER BY id DESC LIMIT 1",[active.id,active.run_id]);
  const waiting=await one(tx,"SELECT 1 FROM service_requests WHERE parent_job_id=$1 AND status NOT IN ('succeeded','failed','cancelled') LIMIT 1",[active.id]);
  return {state:waiting?'WAITING FOR SUPPLIER':latest?.stage==='SYNTHESIZING'?'SYNTHESIZING':active.type==='SERVICE'?'SERVING CUSTOMER':'WORKING',active:true,jobId:active.id,type:operationLabel(active.type,active.requester_agent_id,active.trigger_type),startedAt:active.started_at,stage:latest?.stage||active.phase};
 }
 const funds=await balances(tx,a.business_id||a.id);
 if(funds.computeDebt>0||funds.compute<Number(a.config.policy?.maxRunCost||0))return {state:'LOW COMPUTE',active:false};
 const queued=await one(tx,"SELECT phase FROM jobs WHERE agent_id=$1 AND status='queued' ORDER BY created_at LIMIT 1",[a.id]);
 if(queued&&a.config.schedule==='continuous'&&['budget','provider'].includes(a.autonomy_state?.reason))return {state:a.autonomy_state.reason==='budget'?'WAITING FOR BUDGET':'WAITING FOR PROVIDER',active:false};
 if(queued?.phase==='WAITING_SUPPLIER')return {state:'WAITING FOR SUPPLIER',active:false};
 if(queued)return {state:queued.phase==='RETRYING'?'RETRYING':'QUEUED',active:false};
 if(a.config.schedule==='continuous')return {state:a.autonomy_state?.reason==='waiting'?'WAITING FOR DATA':a.autonomy_state?.reason==='error'?'RETRYING':'READY',active:false};
 if(a.health==='ERROR')return {state:'ERROR',active:false};
 return {state:a.config.schedule==='interval'&&a.next_run_at?'SCHEDULED':'IDLE',active:false};
}
function readEvent(e:Row,details:boolean,owner:boolean){
 if(e.visibility==='SYSTEM'||e.visibility==='OWNER_ONLY'&&!owner)return null;
 const m=e.metadata||{};
 // Explicit projection. Raw prompts, provider responses and arbitrary metadata
 // are never serialized by this API, even for the owner.
 return {id:'event:'+e.id,jobId:e.job_id,runId:e.run_id,type:e.event_type,stage:e.stage,status:e.status,at:e.created_at,summary:e.public_summary,visibility:e.visibility,
  data:{count:m.count,before:m.before,steps:m.steps,tool:m.tool,provider:m.provider,reason:m.reason,serviceId:m.serviceId,supplierJobId:m.supplierJobId,...(details?{query:m.query,url:m.url,title:m.title,sources:m.sources}:{} )}};
}
function nextAction(job:Row,stage:string,pending:number){
 if(job.status==='waiting')return 'No useful new work was selected. Planning cost is recorded; no completed output is claimed. The Coin will recheck automatically.';
 if(job.status==='succeeded')return 'Completed. Result, evidence and costs are available in Track Record.';
 if(job.status==='failed'||job.status==='cancelled')return 'No further work is scheduled for this operation.';
 if(job.phase==='RETRYING')return 'Queued for an automatic retry at '+new Date(job.run_after).toISOString()+'.';
 if(pending)return 'Wait for supplier delivery, then synthesize the final result.';
 if(stage==='SYNTHESIZING'||stage==='OUTPUT READY')return 'Validate the structured output, settle eligible work and save the result.';
 if(stage==='PLANNING')return 'Execute the permitted actions returned by the planner.';
 return 'Waiting for runtime decision.';
}
export async function liveOperations(tx:Queryable,body:any,profile?:Row){
 const a=await one(tx,"SELECT * FROM agents WHERE (id::text=$1 OR slug=$1) AND visibility='public'",[String(body.id)]);ensure(a,'NOT_FOUND','Business not found',404);
 const own=profile?.id===a.creator_profile_id,status=await operationalStatus(tx,a),funds=await balances(tx,a.business_id||a.id);
 const jobs=(await tx.query(`SELECT j.*,r.requester_profile_id,r.requester_agent_id,s.name service_name,s.max_seconds,p.amount revenue_amount,p.status payment_status FROM jobs j LEFT JOIN service_requests r ON r.job_id=j.id LEFT JOIN agent_services s ON s.id=r.service_id LEFT JOIN payments p ON p.id=r.payment_id WHERE j.agent_id=$1 ORDER BY CASE WHEN j.status='running' THEN 0 WHEN j.status='queued' THEN 1 ELSE 2 END,j.created_at DESC LIMIT 24`,[a.id])).rows;
 let selected=body.job?jobs.find(j=>j.id===body.job):jobs[0];
 if(body.job&&!selected)selected=await one(tx,'SELECT j.*,r.requester_profile_id,r.requester_agent_id,s.name service_name,s.max_seconds FROM jobs j LEFT JOIN service_requests r ON r.job_id=j.id LEFT JOIN agent_services s ON s.id=r.service_id WHERE j.id::text=$1 AND j.agent_id=$2',[String(body.job),a.id]);
 ensure(!body.job||selected,'NOT_FOUND','Operation does not belong to this business',404);
 const lane=(j:Row)=>({id:j.id,type:operationLabel(j.type,j.requester_agent_id,j.trigger_type),title:j.type==='SERVICE'?j.service_name||'Paid service':a.job_type+' mission',status:j.status,phase:j.phase,startedAt:j.started_at,createdAt:j.created_at,finishedAt:j.finished_at,retryAt:j.phase==='RETRYING'?j.run_after:null,revenue:j.revenue_amount?usd(Number(j.revenue_amount)):null,paymentStatus:j.payment_status});
 let operation:any=null;
 if(selected){
  const j=selected,authorized=own||profile?.id===j.requester_profile_id,details=authorized||(a.config.publicOutput&&j.type!=='SERVICE'),outputVisible=authorized||a.config.publicOutput;
  const persisted=(await tx.query('SELECT * FROM operation_events WHERE job_id=$1 ORDER BY id DESC LIMIT 200',[j.id])).rows.reverse();
  const events=persisted.map(e=>readEvent(e,details,own)).filter((e):e is NonNullable<typeof e>=>!!e);
  const nodes:any[]=[];let chainTruncated=false;
  async function chain(parent:string,depth:number,seen:Set<string>){
   if(depth>3||nodes.length>=20||seen.has(parent)){chainTruncated=true;return;}const nextSeen=new Set([...seen,parent]);
   const rows=(await tx.query(`SELECT r.*,s.name service_name,a.name provider_name,a.slug provider_slug,a.ticker provider_ticker,CASE WHEN a.token_id IS NOT NULL OR NULLIF(trim(a.icon_url),'') IS NOT NULL THEN '/api/network/images/'||a.id::text END provider_image,a.config provider_config,a.creator_profile_id supplier_owner,j.status job_status,j.phase,j.started_at,j.finished_at,p.amount,p.status payment_status,p.provider payment_provider FROM service_requests r JOIN agent_services s ON s.id=r.service_id JOIN agents a ON a.id=r.provider_agent_id JOIN jobs j ON j.id=r.job_id JOIN payments p ON p.id=r.payment_id WHERE r.parent_job_id=$1 AND a.visibility='public' ORDER BY r.created_at LIMIT 21`,[parent])).rows;
   for(const r of rows){if(nodes.length>=20){chainTruncated=true;break;}const inputAllowed=profile&&(profile.id===r.supplier_owner||profile.id===r.requester_profile_id);const resultAllowed=inputAllowed||(outputVisible&&r.provider_config.publicOutput);
    nodes.push({id:r.id,parentJobId:parent,depth,jobId:r.job_id,businessId:r.provider_agent_id,name:r.provider_name,slug:r.provider_slug,ticker:r.provider_ticker,image_url:r.provider_image,serviceId:r.service_id,service:r.service_name,price:usd(Number(r.amount)),status:r.job_status,phase:r.phase,paymentStatus:r.payment_status,paymentProvider:r.payment_provider,startedAt:r.started_at,createdAt:r.created_at,completedAt:r.finished_at,request:inputAllowed?safeOperationalText(JSON.stringify(r.input),1500):null,summary:resultAllowed&&r.job_status==='succeeded'?safeOperationalText(r.output?.summary,1500):null});
    await chain(r.job_id,depth+1,nextSeen);
   }
  }
  await chain(j.id,1,new Set());
  for(const n of nodes.filter(n=>n.depth===1)){
   events.push({id:'hire:'+n.id,jobId:j.id,runId:j.run_id,type:'SUPPLIER_HIRED',stage:'SUPPLIER',status:'COMPLETE',at:n.createdAt,summary:`Purchased ${n.service} from ${n.name}.`,visibility:'PUBLIC',data:{supplierJobId:n.jobId,serviceId:n.serviceId}} as any);
   if(n.startedAt)events.push({id:'supplier-start:'+n.id,jobId:j.id,type:'SUPPLIER_STARTED',stage:'SUPPLIER',status:'COMPLETE',at:n.startedAt,summary:`${n.name} started the supplier job.`,data:{supplierJobId:n.jobId}} as any);
   if(n.completedAt)events.push({id:'supplier-end:'+n.id,jobId:j.id,type:n.status==='succeeded'?'SUPPLIER_COMPLETED':'SUPPLIER_FAILED',stage:'SUPPLIER',status:n.status==='succeeded'?'COMPLETE':'FAILED',at:n.completedAt,summary:`${n.name}: ${n.status}. Payment: ${n.paymentStatus}.`,data:{supplierJobId:n.jobId}} as any);
  }
  if(j.started_at)events.push({id:'start:'+j.id,jobId:j.id,type:j.type==='SERVICE'?'SERVICE_STARTED':'MISSION_STARTED',stage:'STARTED',status:'COMPLETE',at:j.started_at,summary:operationLabel(j.type,j.requester_agent_id,j.trigger_type)+' started.',data:{}} as any);
  if(j.status==='waiting')events.push({id:'wait:'+j.id,jobId:j.id,type:'COIN_WAITING',stage:'WAITING FOR DATA',status:'WAITING',at:j.finished_at,summary:'No useful new work selected. Automatic recheck scheduled; no output claimed.',data:{}} as any);
  if(j.finished_at&&j.status!=='waiting')events.push({id:'end:'+j.id,jobId:j.id,type:j.status==='succeeded'?'JOB_COMPLETED':j.status==='cancelled'?'JOB_CANCELLED':'JOB_FAILED',stage:j.phase,status:j.status==='succeeded'?'COMPLETE':'FAILED',at:j.finished_at,summary:j.status==='succeeded'?'Output saved. Eligible payment settled. Track Record updated.':'Operation stopped. Open the safe receipt for recovery status.',data:{}} as any);
  const eventOrder=(e:{id:string})=>e.id.startsWith('start:')?-1:e.id.startsWith('end:')?1:0;
  events.sort((x,y)=>new Date(x.at).getTime()-new Date(y.at).getTime()||eventOrder(x)-eventOrder(y)||x.id.localeCompare(y.id,undefined,{numeric:true}));
  const usage=(await tx.query('SELECT kind,provider,model_or_tool name,cost_amount cost,safe_metadata metadata,status FROM model_tool_runs WHERE job_id=$1',[j.id])).rows;
  if(j.status==='running')usage.push(...(j.payload.usageRuns||[]));
  const costs={compute:0,search:0,externalTools:0,services:0,refunded:0,serviceReserved:0,pending:0,estimated:false,total:0};
  const tools=new Map<string,{name:string;calls:number;status:string}>();
  for(const r of usage){const isSearch=r.kind==='tool'&&/web_search/.test(r.name),category=r.kind==='model'?'compute':isSearch?'search':'externalTools';
   const pending=j.status==='running'&&['pending','timeout-or-transport'].includes(r.metadata?.status);if(pending)costs.pending++;else costs[category]+=usd(Number(r.cost));if(r.metadata?.estimated)costs.estimated=true;
   const name=r.kind==='model'?r.provider.replace(' Web Search',''):isSearch?'Web Search':r.provider==='local-playwright'||r.provider==='Browserbase'?'Browser':r.name.includes('helius')?'Solana Data':'HTTPS Fetch';
   const old=tools.get(name)||{name,calls:0,status:'COMPLETE'};old.calls+=r.kind==='model'?r.metadata?.attempts?.length||1:isSearch?r.metadata?.searchCalls??1:1;if(pending)old.status='RUNNING';else if((r.status==='failed'&&r.metadata?.status!=='completed')||(r.metadata?.status&&!['completed','pending'].includes(r.metadata.status)))old.status='FAILED';tools.set(name,old);
  }
  for(const n of nodes.filter(n=>n.depth===1)){if(n.paymentStatus==='refunded')costs.refunded+=n.price;else costs.services+=n.price;if(n.paymentStatus==='reserved'||n.paymentStatus==='refund_required')costs.serviceReserved+=n.price;}
  if(nodes.length)tools.set('Marketplace',{name:'Marketplace',calls:nodes.filter(n=>n.depth===1).length,status:nodes.some(n=>n.status==='running'||n.status==='queued')?'WAITING':nodes.some(n=>n.status==='failed')?'FAILED':'COMPLETE'});
  costs.total=costs.compute+costs.search+costs.externalTools+costs.services;
  const sourceMap=new Map<string,any>();
  for(const e of events){for(const s of (e.data as any)?.sources||[])sourceMap.set(s.url,{...s,status:'Discovered',inspected:false,evidenceUsed:null});const url=(e.data as any)?.url;if(url&&['SOURCE_FETCHED','BROWSER_COMPLETED','SOURCE_FAILED','FETCH_STARTED','BROWSER_STARTED'].includes(e.type)){const old=sourceMap.get(url)||{url,title:(e.data as any).title||new URL(url).hostname};sourceMap.set(url,{...old,provider:(e.data as any).provider||old.provider,status:e.type==='SOURCE_FAILED'?'Unavailable':e.status==='RUNNING'&&j.status==='running'?'Inspecting':e.status==='RUNNING'?'Not completed':'Inspected',inspected:['SOURCE_FETCHED','BROWSER_COMPLETED'].includes(e.type),retrieved_at:e.status==='COMPLETE'?e.at:old.retrieved_at,evidenceUsed:null});}}
  if(details&&j.status==='succeeded')for(const s of j.output?.sources||[]){const url=safeSourceUrl(s.url);if(url){const prior=sourceMap.get(url);sourceMap.set(url,{...prior,url,title:safeOperationalText(s.title),provider:s.provider||prior?.provider,discovered_at:s.discovered_at||prior?.discovered_at,retrieved_at:s.retrieved_at||prior?.retrieved_at,citations:s.citations||prior?.citations,status:'Cited in output',inspected:prior?.inspected||false,evidenceUsed:true});}}
  if(j.status==='succeeded')for(const s of sourceMap.values())if(s.evidenceUsed===null)s.evidenceUsed=false;
  const latest=persisted.filter(e=>e.visibility==='PUBLIC'&&e.run_id===j.run_id).at(-1),pending=nodes.filter(n=>['queued','running'].includes(n.status)).length;
  const stage=j.status==='running'?pending?'WAITING FOR SUPPLIER':latest?.stage||j.phase:j.phase;
  const browserEvents=events.filter(e=>e.type.startsWith('BROWSER_')||e.type==='SOURCE_FAILED'&&e.data.tool==='browser');
  const attemptStarted=persisted.find(e=>e.run_id===j.run_id&&e.event_type==='PLANNING_STARTED')?.created_at||j.started_at;
  operation={...lane(j),title:j.type==='SERVICE'?j.service_name||'Paid service':safeOperationalText(a.mission,500),runId:j.run_id,stage,next:nextAction(j,stage,pending),deadline:j.status==='running'&&attemptStarted?new Date(new Date(attemptStarted).getTime()+(j.max_seconds||(a.config.schedule==='continuous'?300:90))*1000).toISOString():null,
   captures:await visibleCaptures(tx,a,j,profile),request:authorized&&j.type==='SERVICE'?safeOperationalText(JSON.stringify(j.payload.input),1500):null,privateEvidence:!details,events,decisions:events.filter(e=>e.type==='DECISION_RECORDED'),sources:[...sourceMap.values()].slice(0,50),searches:events.filter(e=>e.type==='SEARCH_STARTED'||e.type==='SEARCH_COMPLETED'),tools:[...tools.values()],costs,chain:nodes,chainTruncated,
   browser:browserEvents.length?{state:browserEvents.at(-1)!.type==='SOURCE_FAILED'?'FAILED':browserEvents.at(-1)!.type==='BROWSER_COMPLETED'?'COMPLETE':j.status==='running'?'RUNNING':'CLOSED',url:(browserEvents.at(-1)!.data as any)?.url,title:(browserEvents.at(-1)!.data as any)?.title,startedAt:browserEvents[0].at,completedAt:['BROWSER_COMPLETED','SOURCE_FAILED'].includes(browserEvents.at(-1)!.type)?browserEvents.at(-1)!.at:null,lastAction:browserEvents.at(-1)!.summary}:null,
   output:j.status==='succeeded'&&outputVisible?{summary:safeOperationalText(j.output?.summary,2000),findings:j.output?.findings?.length??null,sources:j.output?.sources?.length??0}:null,
   error:j.status==='failed'||j.phase==='RETRYING'?{reason:'The operation could not complete its current stage. No private provider diagnostics are exposed here.',retry:j.phase==='RETRYING',retryAt:j.phase==='RETRYING'?j.run_after:null}:null};
 }
 const today=(await one(tx,`SELECT count(*) FILTER(WHERE status='succeeded') completed,count(*) FILTER(WHERE status='succeeded' AND type<>'SERVICE') autonomous,count(*) FILTER(WHERE status='succeeded' AND type='SERVICE') paid,count(*) FILTER(WHERE status='failed') failed,avg(extract(epoch FROM finished_at-started_at)) FILTER(WHERE status='succeeded') delivery FROM jobs WHERE agent_id=$1 AND created_at>=date_trunc('day',now())`,[a.id]))!;
 const outputs=(await tx.query("SELECT id,output FROM jobs WHERE agent_id=$1 AND status='succeeded' AND finished_at>=date_trunc('day',now())",[a.id])).rows;
 const financial=(await one(tx,`SELECT COALESCE(sum(amount) FILTER(WHERE category='revenue' AND external),0) revenue,COALESCE(sum(CASE WHEN category='refund' THEN -amount ELSE amount END) FILTER(WHERE category IN ('compute','tool','service_purchase','refund')),0) costs FROM ledger_entries WHERE business_id=$1 AND created_at>=date_trunc('day',now())`,[a.business_id||a.id]))!;
 const radar=(await tx.query("SELECT e.id,e.action,CASE WHEN j.agent_id=e.agent_id THEN e.job_id WHEN r.requester_agent_id=e.agent_id THEN r.parent_job_id END job_id,e.created_at FROM activity_events e LEFT JOIN jobs j ON j.id=e.job_id LEFT JOIN service_requests r ON r.job_id=e.job_id WHERE e.agent_id=$1 AND e.public AND e.action IN ('earned','hired','completed','failed','retrying','self-sustaining','funded') ORDER BY e.created_at DESC LIMIT 8",[a.id])).rows.map(r=>({id:'activity:'+r.id,at:r.created_at,jobId:r.job_id,label:({earned:'Service revenue recorded',hired:'Supplier service purchased',completed:'Work completed',failed:'Operation failed',retrying:'Operation queued for retry','self-sustaining':'Became Self-Sustaining',funded:'Business funding recorded'} as any)[r.action]}));
 if(status.state==='LOW COMPUTE')radar.unshift({id:'low-compute',at:null,jobId:null,label:'Compute funding is below the next run requirement or debt is outstanding.'});
 if(a.next_run_at&&Date.parse(a.next_run_at)<Date.now()&&!a.paused)radar.unshift({id:'schedule-due',at:a.next_run_at,jobId:null,label:'Scheduled mission is due; waiting for an eligible worker lane.'});
 const findings=own||a.config.publicOutput?outputs.reduce((n,j)=>n+(j.output?.findings?.length||0),0):null;
 const lastCompleted=jobs.find(j=>j.status==='succeeded')||await one(tx,"SELECT * FROM jobs WHERE agent_id=$1 AND status='succeeded' ORDER BY finished_at DESC LIMIT 1",[a.id]);
 return {businessId:a.id,name:a.name,slug:a.slug,own,development:a.config.tokenMode==='sandbox',observedAt:new Date().toISOString(),status,operation,lastBrowserSession:body.job?null:await lastBrowserSession(tx,a,profile),active:jobs.filter(j=>['running','queued'].includes(j.status)).map(lane),lastCompleted:lastCompleted?lane(lastCompleted):null,
  recent:jobs.slice(0,12).map(lane),mission:{text:safeOperationalText(a.mission,2000),template:a.job_type,brain:a.config.brain||'development/mock',schedule:a.config.schedule,intervalMinutes:a.config.intervalMinutes,nextRun:a.next_run_at,runsToday:Number(today.autonomous),findingsToday:findings,publishedToday:a.config.publicOutput?outputs.length:0},
  metrics:{jobsToday:Number(today.completed),customerJobs:Number(today.paid),averageDeliverySeconds:today.delivery===null?null:Number(today.delivery),successRate:Number(today.completed)+Number(today.failed)?Number(today.completed)/(Number(today.completed)+Number(today.failed))*100:null,revenueToday:usd(Number(financial.revenue)),costToday:usd(Number(financial.costs)),sourcesToday:own||a.config.publicOutput?outputs.reduce((n,j)=>n+(j.output?.sources?.length||0),0):null},
  funds,radar,services:Number((await one(tx,'SELECT count(*) n FROM agent_services WHERE agent_id=$1 AND active',[a.id]))!.n)};
}
