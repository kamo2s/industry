// Fault-injection fixture, not a deployable worker. No provider request is made.
import {readFile,writeFile} from 'node:fs/promises';import {database} from '../packages/db/connection';import {Domain} from '../packages/db/domain';
Object.assign(process.env,JSON.parse(await readFile('.data/staging/environment.json','utf8')),{NODE_ENV:'test',OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',SEARCH_PROVIDER_API_KEY:''});const target=new URL(process.env.DATABASE_URL!);target.pathname='/industry_stress';process.env.DATABASE_URL=target.href;
const db=await database(),d=new Domain(db),claim=await d.worker('claim',{worker:'fault-injection-before-crash'});
if(!claim)throw Error('No queued crash fixture');await d.worker('usage',{id:claim.job.id,lease:claim.job.lease,cost:500,runs:[{kind:'model',provider:'Deterministic fault fixture',name:'bounded-plan',cost:500,metadata:{estimated:true}}]});
await writeFile('.data/staging/crash-claim.json',JSON.stringify({job:claim.job,agentId:claim.agent.id,claimedAt:new Date().toISOString()}));
await new Promise(r=>setTimeout(r,180000));await db.close();
