import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { rpc } from '../../packages/db/client';
import { executeRun } from '../../packages/agent/runtime';
import { AppError } from '../../packages/core';
import {validateEnvironment} from '../../packages/core/environment';
import {logEvent} from '../../packages/core/logging';
import {createServer} from 'node:http';
validateEnvironment('worker');
const worker=`worker-${randomUUID()}`;let running=true;
process.on('SIGINT',()=>{running=false;});process.on('SIGTERM',()=>{running=false;});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let lastHeartbeat=0;
const beat=async()=>{await rpc('heartbeat',{worker},undefined,true);lastHeartbeat=Date.now();};
const healthServer=createServer((_req,res)=>{const ready=running&&Date.now()-lastHeartbeat<20000;res.writeHead(ready?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({ready,worker,scheduler:'queue-dispatcher',heartbeat:lastHeartbeat?new Date(lastHeartbeat).toISOString():null}));});
healthServer.listen(Number(process.env.WORKER_HEALTH_PORT||4419),process.env.WORKER_HEALTH_HOST||'127.0.0.1');
logEvent('worker','starting',{worker_instance:worker});
const health=setInterval(()=>{void beat().catch(()=>{});},5000);
let reconciling=false;
const recovery=setInterval(()=>{if(!reconciling){reconciling=true;void rpc('reconcile',{},undefined,true).catch(()=>{}).finally(()=>{reconciling=false;});}},30000);
await beat().catch(()=>{logEvent('worker','database_unavailable',{worker_instance:worker});});
// A reserved service lane prevents autonomous callers from starving their suppliers.
async function loop(serviceOnly=false){while(running){let claim:any;
  try {
    claim=await rpc('claim',{worker,serviceOnly},undefined,true);
    if(!claim){await sleep(1500);continue;}
    const heartbeat=setInterval(()=>{void rpc('heartbeat',{worker,id:claim.job.id,lease:claim.job.lease},undefined,true).catch(()=>{});},10000);
    try {
      const result=await executeRun(claim,(op,body)=>rpc(op,body,undefined,true));
      const waiting='deferred' in result||'blocked' in result;
      await rpc('blocked' in result?'await-supplier':'deferred' in result?'defer':'complete',{id:claim.job.id,lease:claim.job.lease,...result},undefined,true);
      logEvent('worker',waiting?'coin_waiting':'job_completed',{trace_id:claim.job.trace_id,run_id:claim.job.run_id,agent_id:claim.agent.id,business_id:claim.agent.business_id,job_id:claim.job.id,worker_instance:worker,status:waiting?'waiting':'succeeded',cost_micro:result.cost});
    }finally{clearInterval(heartbeat);}
  }catch(error){
    const safe=error instanceof AppError?error.message:'Provider or execution failed; see provider configuration';
    logEvent('worker','job_error',{job_id:claim?.job.id,run_id:claim?.job.run_id,worker_instance:worker,code:error instanceof AppError?error.code:'EXECUTION_FAILED'});
    if(claim)await rpc('fail',{id:claim.job.id,lease:claim.job.lease,error:safe,permanent:error instanceof AppError&&error.status<500},undefined,true).catch(()=>{});
    await sleep(2000);
  }
}}
await Promise.all([loop(),loop(),loop(true)]);clearInterval(health);clearInterval(recovery);healthServer.close();logEvent('worker','stopped',{worker_instance:worker});
