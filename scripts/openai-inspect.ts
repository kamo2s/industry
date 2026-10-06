import {readFile,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {Domain} from '../packages/db/domain';
import type {Database,Queryable} from '../packages/db/connection';
const report=JSON.parse(await readFile('qa/openai-live/acceptance.json','utf8'));
const db=await PGlite.create(report.databasePath);
try{
 const adapter:Database={query:(s,v)=>db.query(s,v),transaction:fn=>db.transaction(tx=>fn(tx as unknown as Queryable)),close:()=>db.close()},d=new Domain(adapter);
 const ids=[report.candidateVerification.jobId,report.candidateVerification.supplierJobId,report.customContract.jobId];
 const jobs=await Promise.all(ids.map(id=>d.dispatch('jobs/get',{id})));
 const scout=jobs[0],supplier=jobs[1];assert(jobs.every(j=>j.status==='succeeded'&&j.output));
 const payment=(await db.query<any>('SELECT p.id,p.provider,p.status,p.amount,p.transaction_signature FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.parent_job_id=$1',[scout.id])).rows[0];assert.equal(payment.status,'settled');assert.equal(payment.provider,'internal');assert.equal(payment.transaction_signature,null);
 const record=await d.dispatch('agents/record',{id:scout.agent_id});assert(record.jobs.some((j:any)=>j.id===scout.id&&j.compute_cost>0&&j.hiring_cost>0));
 const graph=await d.dispatch('network/graph');assert(graph.edges.some((e:any)=>e.source===scout.agent_id&&e.target===supplier.agent_id));
 const activity=await d.dispatch('activity',{limit:100});assert(activity.some((e:any)=>e.action==='hired'&&e.agent_id===scout.agent_id));
 const imbalance=(await db.query<any>("SELECT count(*) n FROM (SELECT transaction_id FROM ledger_postings GROUP BY transaction_id HAVING sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END)<>0) t")).rows[0];assert.equal(Number(imbalance.n),0);
 const counts=(await db.query<any>("SELECT count(*) n FROM jobs WHERE status='succeeded'")).rows[0];
 Object.assign(report,{auditedAt:new Date().toISOString(),actualCompletedJobs:Number(counts.n),scoutVerifier:{passed:true,jobId:scout.id,supplierJobId:supplier.id,paymentId:payment.id,amount:Number(payment.amount)/1e6,chainTransaction:null},ledgerBalanced:true,finalFlowAudit:{trackRecord:true,network:true,activity:true,computeCosts:true,supplierExpense:true},refinements:['Provider schema normalization','Preserved cited excerpts under source limit','Verifier scope aligned to paid request','Explicit mock search isolation']});
 await writeFile('qa/openai-live/ui-results.json',JSON.stringify({source:'Read-only export from isolated live acceptance database',jobs},null,2));
 await writeFile('qa/openai-live/acceptance.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({jobs:report.actualCompletedJobs,flow:report.scoutVerifier,balanced:true}));
}finally{await db.close();}
