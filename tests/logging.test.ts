import {it,expect,vi,afterEach} from 'vitest';
import {logEvent} from '../packages/core/logging';
import {logJobOutcome} from '../packages/db/outcome-log';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it('keeps credentials, URLs and provider payloads out of operational logs while retaining correlation IDs',()=>{
 vi.stubEnv('APP_ENV','staging');const write=vi.spyOn(console,'log').mockImplementation(()=>{});
 logEvent('worker','test',{trace_id:'trace',job_id:'job',run_id:'run',worker_instance:'worker',OPENAI_API_KEY:'secret-fixture',database_url:'private-fixture',payload:{secret:'hidden'},authorization:'hidden'});
 const row=JSON.parse(write.mock.calls[0][0]);expect(row).toMatchObject({environment:'staging',event:'test',trace_id:'trace',job_id:'job',run_id:'run',worker_instance:'worker'});expect(row.timestamp).toBeTruthy();expect(JSON.stringify(row)).not.toMatch(/secret-fixture|private-fixture|hidden/);
});
it('correlates committed job, service and journal identities without logging arbitrary row fields',async()=>{
 const write=vi.spyOn(console,'log').mockImplementation(()=>{}),query=vi.fn().mockResolvedValue({rows:[{job_id:'job',service_request_id:'request',ledger_transaction_id:'journal',status:'succeeded',private_input:'do-not-log'}]});
 await logJobOutcome({query},'job');expect(query.mock.calls[0][1]).toEqual(['job']);expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({event:'job_state_committed',job_id:'job',service_request_id:'request',ledger_transaction_id:'journal',status:'succeeded'});expect(write.mock.calls[0][0]).not.toContain('do-not-log');
});
