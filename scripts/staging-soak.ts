import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {database,one} from '../packages/db/connection';
import {systemHealth} from '../packages/db/system-health';
Object.assign(process.env,JSON.parse(await readFile('.data/staging/environment.json','utf8')));
const db=await database(),dir='qa/staging';await mkdir(dir,{recursive:true});
const file=dir+'/soak.json';let report:any;
try{report=JSON.parse(await readFile(file,'utf8'));}catch{report={startedAt:new Date().toISOString(),targetMinutes:60,checkpoints:[],complete:false};}
const resumeAt=Date.now();report.observedMs??=Number(report.elapsedMinutes||0)*60000;
report.segments??=[{startedAt:report.startedAt,lastCheckpoint:report.checkpoints.at(-1)?.at,interrupted:true}];
report.segments.push({startedAt:new Date(resumeAt).toISOString(),priorObservedMinutes:report.observedMs/60000});
let previous=resumeAt,cancelled=false;
for(const s of ['SIGINT','SIGTERM'] as const)process.on(s,()=>{cancelled=true;});
try{while(!cancelled){
 const now=Date.now();report.observedMs+=Math.min(30000,now-previous);previous=now;try{
  const h=await db.transaction(tx=>systemHealth(tx));
  const jobs=(await db.query("SELECT a.name,j.id,j.status,j.phase,j.trigger_type,j.created_at,j.finished_at FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE j.trigger_type='interval' ORDER BY j.created_at")).rows;
  const duplicates=await one(db,'SELECT count(*) n FROM (SELECT idempotency_key FROM jobs GROUP BY idempotency_key HAVING count(*)>1) d');
  const notifications=await one(db,'SELECT count(*) n FROM (SELECT dedupe_key FROM notifications WHERE dedupe_key IS NOT NULL GROUP BY dedupe_key HAVING count(*)>1) d');
  report.checkpoints.push({at:new Date().toISOString(),worker:h.worker,processes:h.processes,queue:h.queue,budget:h.budget,invariantErrors:h.ledgerInvariantErrors,duplicateMissions:Number(duplicates?.n),duplicateNotifications:Number(notifications?.n),jobs});
 }catch{report.checkpoints.push({at:new Date().toISOString(),state:'DATABASE_UNAVAILABLE'});}
 report.elapsedMinutes=(now-Date.parse(report.startedAt))/60000;report.observedMinutes=report.observedMs/60000;report.complete=report.observedMs>=60*60000;
 await writeFile(file,JSON.stringify(report,null,2));
 if(report.complete||cancelled)break;await new Promise(r=>setTimeout(r,15000));
}
}finally{
 await db.query("UPDATE agents SET config=jsonb_set(config,'{schedule}','\"manual\"'),next_run_at=NULL WHERE id IN (SELECT jsonb_array_elements_text(value->'businesses')::uuid FROM system_settings WHERE key='industry_staging_seed_v1')").catch(()=>{});
 const drainUntil=Date.now()+150000;while(Date.now()<drainUntil){if(!await one(db,"SELECT id FROM jobs WHERE status IN ('running','queued') LIMIT 1"))break;await new Promise(r=>setTimeout(r,1500));}
 await db.query("UPDATE agents SET paused=true WHERE id IN (SELECT jsonb_array_elements_text(value->'businesses')::uuid FROM system_settings WHERE key='industry_staging_seed_v1')").catch(()=>{});await db.close();
}
console.log(JSON.stringify({complete:report.complete,elapsedMinutes:report.elapsedMinutes,observedMinutes:report.observedMinutes,checkpoints:report.checkpoints.length,stagingBusinessesPaused:true}));
