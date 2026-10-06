import {readFile,writeFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {database} from '../packages/db/connection';import {Domain} from '../packages/db/domain';
Object.assign(process.env,JSON.parse(await readFile('.data/staging/environment.json','utf8')));const db=await database(),d=new Domain(db),people=JSON.parse(await readFile('.data/staging/identities.json','utf8'));
try{
 const record:unknown[]=[];
 for(const p of people){
  const a=(await d.dispatch('agents/get',{id:p.agent.id})).agent;
  if(p.name==='RADAR'&&a.metrics.operatingBalance<.02)await d.dispatch('agents/fund',{id:a.id,key:'soak-resume-operating-v1',input:{amount:.05,account:'operating'}},p.session);
  await d.dispatch('agents/update',{id:a.id,input:{schedule:p.name==='VERIFY'?'manual':'interval',intervalMinutes:15}},p.session);
  if(a.paused)await d.dispatch('agents/resume',{id:a.id},p.session);
  record.push({name:p.name,id:a.id,schedule:p.name==='VERIFY'?'manual':'15 minutes'});
 }
 await writeFile('qa/staging/soak-resume.json',JSON.stringify({at:new Date().toISOString(),run:randomUUID(),reason:'Recorder stopped during controlled outage; resume excludes unmonitored time. No provider cap increase.',businesses:record},null,2));console.log('Bounded staging schedules resumed; provider cap unchanged.');
}finally{await db.close();}
