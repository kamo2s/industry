import {readFile,writeFile} from 'node:fs/promises';
import {database} from '../packages/db/connection';
Object.assign(process.env,JSON.parse(await readFile('.data/staging/environment.json','utf8')));
const db=await database();
try{
 if(process.argv.includes('--sources')){const c=JSON.parse(await readFile('qa/staging/final-canary.json','utf8'));const j=(await db.query('SELECT output FROM jobs WHERE id=$1',[c.job])).rows[0];console.log(JSON.stringify(j.output.sources.map((s:any)=>({url:s.url,provider:s.provider,discovered:s.discovered_at,retrieved:s.retrieved_at,citations:s.citations?.length})),null,2));}
 const jobs=(await db.query("SELECT a.name,j.id,j.status,j.attempts,j.last_error,j.created_at,j.finished_at FROM jobs j JOIN agents a ON a.id=j.agent_id ORDER BY j.created_at DESC LIMIT 25")).rows;
 const budget=(await db.query('SELECT environment,sum(charged_micro) charged,sum(reserved_micro) reserved FROM provider_budget_reservations GROUP BY environment')).rows;
 console.log(JSON.stringify({jobs,budget},null,2));
 if(process.argv.includes('--mark-fix'))await writeFile('qa/staging/reliability-fix.json',JSON.stringify({at:new Date().toISOString(),issues:['development search gating','bounded planner cardinality','refunded supplier replacement'],priorFailedJobs:jobs.filter(j=>j.status==='failed').map(j=>j.id)},null,2));
}finally{await db.close();}
