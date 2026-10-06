import type {Queryable} from './connection';
import {logEvent} from '../core/logging';

// Call only after Domain's transaction resolves. These IDs refer to committed
// state; neither provider payloads nor financial metadata are sent to stdout.
export async function logJobOutcome(db:Queryable,jobId:string){
 const {rows}=await db.query(`SELECT j.trace_id,j.id job_id,j.run_id,j.agent_id,a.business_id,
 j.locked_by worker_instance,j.status,j.phase,r.id service_request_id,
 l.transaction_id ledger_transaction_id,l.category kind
 FROM jobs j JOIN agents a ON a.id=j.agent_id
 LEFT JOIN service_requests r ON r.job_id=j.id
 LEFT JOIN ledger_entries l ON l.job_id=j.id
 WHERE j.id=$1 ORDER BY l.created_at DESC LIMIT 32`,[jobId]);
 for(const row of rows)logEvent('database','job_state_committed',row);
}
