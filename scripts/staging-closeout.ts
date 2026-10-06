import {readFile,writeFile} from 'node:fs/promises';
import {database,one} from '../packages/db/connection';
import {systemHealth} from '../packages/db/system-health';
Object.assign(process.env,JSON.parse(await readFile('.data/staging/environment.json','utf8')));
const soak=JSON.parse(await readFile('qa/staging/soak.json','utf8')),fix=JSON.parse(await readFile('qa/staging/reliability-fix.json','utf8'));
if(!soak.complete||soak.observedMinutes<60)throw Error('Wait for the bounded monitored soak to finish before closeout');
const db=await database();
try{
 const h=await db.transaction(tx=>systemHealth(tx));
 const agents=(await db.query("SELECT name,paused,config->>'schedule' schedule,next_run_at FROM agents WHERE id IN (SELECT jsonb_array_elements_text(value->'businesses')::uuid FROM system_settings WHERE key='industry_staging_seed_v1') ORDER BY name")).rows;
 const jobs=(await db.query('SELECT status,count(*) n FROM jobs GROUP BY status')).rows;
 const failures=(await db.query("SELECT id,last_error,created_at FROM jobs WHERE status='failed' ORDER BY created_at")).rows;
 const afterFix=failures.filter(j=>new Date(j.created_at).getTime()>Date.parse(fix.at));
 const imbalance=await one(db,"SELECT count(*) n FROM (SELECT transaction_id FROM ledger_postings GROUP BY transaction_id HAVING sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END)<>0) unbalanced");
 const negative=await one(db,"SELECT count(*) n FROM ledger_accounts WHERE kind IN ('BUSINESS_COMPUTE','BUSINESS_OPERATING','CUSTOMER_CREDITS','SETTLEMENT_ESCROW') AND balance<0");
 const duplicate=await one(db,'SELECT count(*) n FROM (SELECT idempotency_key FROM ledger_transactions GROUP BY idempotency_key HAVING count(*)>1) duplicates');
 const escrow=await one(db,"SELECT count(*) n FROM ledger_accounts WHERE kind='SETTLEMENT_ESCROW' AND balance<>0");
 const checkpoints=soak.checkpoints.filter((c:any)=>c.worker);
 const checks={sixtyMonitoredMinutes:soak.observedMinutes>=60,seedPaused:agents.length===4&&agents.every(a=>a.paused&&a.schedule==='manual'&&!a.next_run_at),queueDrained:Number(h.queue.queued)===0&&Number(h.queue.running)===0,noPostFixFailures:afterFix.length===0,balanced:h.ledgerInvariantErrors===0&&Number(imbalance?.n)===0,nonnegative:Number(negative?.n)===0,noDuplicateSettlement:Number(duplicate?.n)===0,escrowsDrained:Number(escrow?.n)===0,noDuplicateMissions:checkpoints.every((c:any)=>c.duplicateMissions===0),noDuplicateNotifications:checkpoints.every((c:any)=>c.duplicateNotifications===0),noCheckpointInvariantErrors:checkpoints.every((c:any)=>c.invariantErrors===0),noActiveProviderReservations:h.budget.reservedMicro===0,underProviderCap:h.budget.chargedMicro<h.budget.capMicro,workerHealthy:Date.now()-new Date(h.worker).getTime()<30000,schedulerHealthy:!h.alerts.includes('SCHEDULER_STALE'),pumpDisabled:!h.pump.enabled&&!h.pump.collectionEnabled&&!h.pump.treasuryConfigured&&!h.pump.collectorConfigured};
 const report={at:new Date().toISOString(),scope:'Native local PostgreSQL staging; real remote providers/storage; external application hosting blocked',checks,allPassed:Object.values(checks).every(Boolean),soak:{startedAt:soak.startedAt,monitoredMinutes:soak.observedMinutes,wallMinutes:soak.elapsedMinutes,checkpoints:soak.checkpoints.length,segments:soak.segments,maxObservedWorkerAgeSeconds:Math.max(...checkpoints.map((c:any)=>(Date.parse(c.at)-Date.parse(c.worker))/1000))},agents,jobs,historicalFailures:failures,postFixFailures:afterFix,budget:h.budget,alerts:h.alerts};
 await writeFile('qa/staging/closeout.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.allPassed)process.exitCode=1;
}finally{await db.close();}
