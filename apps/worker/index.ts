import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { rpc } from '../../packages/db/client';
import { executeRun } from '../../packages/agent/runtime';
import { AppError } from '../../packages/core';
const worker=`worker-${randomUUID()}`;let running=true;
process.on('SIGINT',()=>{running=false;});process.on('SIGTERM',()=>{running=false;});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
console.log(JSON.stringify({service:'worker',status:'ready'}));
const health=setInterval(()=>{void rpc('heartbeat',{worker},undefined,true).catch(()=>{});},5000);
await rpc('heartbeat',{worker},undefined,true);
// Two slots allow a purchased provider job to run independently from its caller.
async function loop(){while(running){let claim:any;
  try {
    claim=await rpc('claim',{worker},undefined,true);
    if(!claim){await sleep(1500);continue;}
    const heartbeat=setInterval(()=>{void rpc('heartbeat',{worker,id:claim.job.id,lease:claim.job.lease},undefined,true).catch(()=>{});},10000);
    try {
      const result=await executeRun(claim,(op,body)=>op==='services'?rpc('services/list'):rpc(op,body,undefined,true));
      await rpc('complete',{id:claim.job.id,lease:claim.job.lease,...result},undefined,true);
      console.log(JSON.stringify({service:'worker',jobId:claim.job.id,status:'succeeded'}));
    }finally{clearInterval(heartbeat);}
  }catch(error){
    const safe=error instanceof AppError?error.message:'Provider or execution failed; see provider configuration';
    console.error(JSON.stringify({service:'worker',jobId:claim?.job.id,code:error instanceof AppError?error.code:'EXECUTION_FAILED'}));
    if(claim)await rpc('fail',{id:claim.job.id,lease:claim.job.lease,error:safe,permanent:error instanceof AppError&&error.status<500},undefined,true).catch(()=>{});
    await sleep(2000);
  }
}}
await Promise.all([loop(),loop()]);clearInterval(health);
