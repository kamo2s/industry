import {one,type Queryable,type Row} from './connection';
import {metrics} from './metrics';
import {notifyOwner} from './notifications';

// This state is durable. Completing a job and scheduling its next decision share
// the same transaction, so restart/retry never loses or duplicates continuation.
export async function continueCoin(tx:Queryable,agent:Row,job:Row,outcome:'ready'|'waiting'|'error',requestedSeconds=60){
 if(agent.config.schedule!=='continuous')return;
 if(job.type==='SERVICE'){
  if(outcome==='ready'&&agent.autonomy_state?.reason==='waiting')await tx.query("UPDATE agents SET next_run_at=CASE WHEN paused OR terminated_at IS NOT NULL THEN NULL ELSE now() END,autonomy_state=autonomy_state||'{\"reason\":\"ready\",\"waitingCount\":0}'::jsonb WHERE id=$1",[agent.id]);
  return;
 }
 const previous=agent.autonomy_state||{},count=outcome==='ready'?0:Math.min(8,Number(previous[outcome+'Count']||0)+1);
 const delay=outcome==='ready'?0:Math.min(3600,Math.max(outcome==='error'?60:30,requestedSeconds)*2**Math.min(count-1,5));
 const state={...previous,reason:outcome,waitingCount:outcome==='waiting'?count:0,errorCount:outcome==='error'?count:0,lastJob:job.id};
 await tx.query("UPDATE agents SET autonomy_state=$1,next_run_at=CASE WHEN paused OR terminated_at IS NOT NULL THEN NULL ELSE now()+($2*interval '1 second') END WHERE id=$3",[JSON.stringify(state),delay,agent.id]);
}

export async function queueDueCoins(tx:Queryable){
 const scheduled=(await tx.query(`SELECT * FROM agents WHERE NOT paused AND terminated_at IS NULL AND COALESCE(config->'policy'->>'killSwitch','false')<>'true'
  AND (token_id IS NULL OR EXISTS(SELECT 1 FROM businesses b WHERE b.id=agents.business_id AND b.routing_status='VERIFIED'))
  AND next_run_at<=now() AND config->>'schedule' IN ('interval','continuous')
  ORDER BY next_run_at,id FOR UPDATE SKIP LOCKED LIMIT 20`)).rows;
 for(const a of scheduled){
  if(a.config.policy.killSwitch||await one(tx,"SELECT id FROM jobs WHERE agent_id=$1 AND type<>'SERVICE' AND status IN ('queued','running')",[a.id]))continue;
  if((await metrics(tx,a)).balance<a.config.policy.maxRunCost){await tx.query("UPDATE agents SET next_run_at=now()+interval '15 seconds' WHERE id=$1",[a.id]);await notifyOwner(tx,a.id,'compute-low',a.name+' needs Compute Credits before work can continue.','/coins/'+a.slug,'compute-low:'+a.id+':'+new Date().toISOString().slice(0,10));continue;}
  const continuous=a.config.schedule==='continuous',cycle=Number(a.autonomy_state?.cycle||0);
  await tx.query(`INSERT INTO jobs(agent_id,type,trigger_type,payload,idempotency_key) VALUES($1,'RUN',$2,$3,$4) ON CONFLICT(idempotency_key) DO NOTHING`,[a.id,continuous?'continuous':'interval',JSON.stringify({input:{topic:a.config.scope||a.mission}}),continuous?`continuous:${a.id}:${cycle}`:`schedule:${a.id}:${new Date(a.next_run_at).toISOString()}`]);
  if(continuous)await tx.query("UPDATE agents SET next_run_at=NULL,autonomy_state=autonomy_state||$1::jsonb WHERE id=$2",[JSON.stringify({cycle:cycle+1,reason:'queued'}),a.id]);
  else await tx.query("UPDATE agents SET next_run_at=now()+($1*interval '1 minute') WHERE id=$2",[a.config.intervalMinutes,a.id]);
 }
}

// Blocked coins must not occupy the first queue page forever. This is a cheap
// eligibility recheck, never a model call; funding resumes work automatically.
export async function waitForEligibility(tx:Queryable,agent:Row,job:Row,reason:'budget'|'provider'|'funds'){
 await tx.query("UPDATE jobs SET run_after=now()+interval '15 seconds' WHERE id=$1",[job.id]);
 if(agent.config.schedule==='continuous'&&job.type!=='SERVICE')await tx.query("UPDATE agents SET autonomy_state=autonomy_state||$1::jsonb WHERE id=$2",[JSON.stringify({reason}),agent.id]);
}
