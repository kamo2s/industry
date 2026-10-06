import {readFile,writeFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {database,one} from '../packages/db/connection';import {Domain} from '../packages/db/domain';
Object.assign(process.env,JSON.parse(await readFile('.data/staging/environment.json','utf8')));const people=JSON.parse(await readFile('.data/staging/identities.json','utf8')),db=await database(),d=new Domain(db);
try{
 if(process.argv.includes('--verify-existing')){
  const original=JSON.parse(await readFile('qa/staging/final-canary.json','utf8')),job=(await one(db,'SELECT output FROM jobs WHERE id=$1',[original.job]))!;
  original.checks.provenancePreserved=job.output.sources.every((s:any)=>!!s.provider&&!!(s.discovered_at||s.retrieved_at));
  original.allPassed=Object.values(original.checks).every(Boolean);original.reviewedAt=new Date().toISOString();original.note='This canary chose direct HTTPS retrieval. Its provenance is the recorded fetch provider/time. The scheduled flow separately verifies OpenAI search annotations; no missing search is fabricated.';
  await writeFile('qa/staging/final-canary.json',JSON.stringify(original,null,2));console.log(JSON.stringify({checks:original.checks,allPassed:original.allPassed}));if(!original.allPassed)process.exitCode=1;
 }else{
 // Stop future schedules before the timed soak's final pause, allowing the last
 // controlled operation to drain instead of interrupting a newly due supplier.
 for(const p of people)await d.dispatch('agents/update',{id:p.agent.id,input:{schedule:'manual'}},p.session);
 const radar=people.find((p:any)=>p.name==='RADAR'),agent=(await d.dispatch('agents/get',{id:radar.agent.id})).agent;
 await d.dispatch('agents/update',{id:agent.id,input:{tools:['web_search','browser_fetch','marketplace'],policy:{...agent.config.policy,maxTools:2}}},radar.session);
 const run=await d.dispatch('agents/run',{id:agent.id,key:randomUUID()},radar.session);const started=Date.now();let job;
 do{await new Promise(r=>setTimeout(r,1500));job=await one(db,'SELECT status,output FROM jobs WHERE id=$1',[run.jobId]);}while(!['succeeded','failed'].includes(job!.status)&&Date.now()-started<180000);
 const events=(await db.query('SELECT event_type,metadata FROM operation_events WHERE job_id=$1',[run.jobId])).rows;
 const checks={succeeded:job?.status==='succeeded',provenancePreserved:job?.output?.sources?.some((s:any)=>s.provider&&(s.discovered_at||s.retrieved_at))===true,safeHttpsFetched:events.some(e=>e.event_type==='SOURCE_FETCHED'),supplierDelivered:events.some(e=>e.event_type==='SUPPLIER_RECEIVED')};
 await writeFile('qa/staging/final-canary.json',JSON.stringify({at:new Date().toISOString(),job:run.jobId,checks,allPassed:Object.values(checks).every(Boolean),schedules:'manual; timed soak will pause all four businesses'},null,2));console.log(JSON.stringify({checks}));if(Object.values(checks).some(v=>!v))process.exitCode=1;
 }
}finally{await db.close();}
