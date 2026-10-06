import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {database,migrate,one,type Database} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {newLaunchDraft} from '../packages/core/launch-defaults';
import {executeRun,MockLLMProvider} from '../packages/agent/runtime';
import {ledger} from '../packages/db/economy';
import {workspaceMode} from '../packages/core/workspace';
let db:Database,d:Domain,owner:string;
beforeAll(async()=>{vi.stubEnv('APP_MODE','demo');vi.stubEnv('OPENROUTER_API_KEY','');vi.stubEnv('WALLET_ENCRYPTION_KEY','4'.repeat(64));db=await database(true);await migrate(db);d=new Domain(db);const k=nacl.sign.keyPair(),wallet=bs58.encode(k.publicKey),c=await d.publicDispatch('auth/challenge',{wallet});owner=(await d.publicDispatch('auth/verify',{id:c.id,wallet,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(c.message),k.secretKey))})).session;});
afterEach(async()=>{vi.restoreAllMocks();await db.query('UPDATE agents SET paused=true');});
afterAll(async()=>{await db.close();vi.unstubAllEnvs();});
async function create(){const k=nacl.sign.keyPair(),wallet=bs58.encode(k.publicKey),challenge=await d.publicDispatch('auth/challenge',{wallet});owner=(await d.publicDispatch('auth/verify',{id:challenge.id,wallet,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.message),k.secretKey))})).session;const name='CONT '+randomUUID().slice(0,8);return d.publicDispatch('agents/create',{input:{...newLaunchDraft(),name,ticker:'CONT',description:'Continuous public evidence research',scope:'Investigate public documentation and changes.',brain:'development/mock'},key:randomUUID()},owner);}
async function finish(c:any){const result=await executeRun(c,(op,b)=>d.worker(op,b));await d.worker('deferred' in result?'defer':'complete',{id:c.job.id,lease:c.job.lease,...result});return result;}
const useful=()=>{let index=0;const objectives=['Compare persistence guarantees','Evaluate authentication options','Assess deployment requirements'];return vi.spyOn(MockLLMProvider.prototype,'plan').mockImplementation(async()=>({plan:{steps:[],serviceId:null,action:'work',objective:objectives[index++%objectives.length]},cost:500}));};
const claim=()=>d.worker('claim',{worker:'continuous-test'});

it('continues useful work immediately, keeps memory, and never duplicates an in-flight mission',async()=>{
 const a=await create(),planner=useful(),first=await claim();expect(first.agent.id).toBe(a.id);expect(await claim()).toBeNull();await finish(first);
 d=new Domain(db);const second=await claim();expect(second.agent.id).toBe(a.id);expect(second.job.id).not.toBe(first.job.id);expect(second.job.trigger_type).toBe('continuous');expect(second.memories.length).toBeGreaterThan(0);expect(await claim()).toBeNull();await finish(second);
 const third=await claim();expect(third.agent.id).toBe(a.id);expect(third.job.id).not.toBe(second.job.id);await finish(third);expect(planner).toHaveBeenCalledTimes(3);
 expect((await d.publicDispatch('agents/get',{id:a.id})).agent.metrics.jobs).toBe(3);
 await expect(d.worker('complete',{id:first.job.id,lease:first.job.lease,cost:0,runs:[],output:{summary:'Duplicate'}})).rejects.toMatchObject({code:'STALE_LEASE'});
});
it('waits without fabricated results, charges planning once, and backs off repeated empty decisions',async()=>{
 const a=await create(),planner=vi.spyOn(MockLLMProvider.prototype,'plan').mockResolvedValue({plan:{steps:[],serviceId:null,action:'wait',waitSeconds:60,waitReason:'awaiting-data'},cost:500}),c=await claim();
 await finish(c);const view=await d.publicDispatch('agents/get',{id:a.id});expect(view.agent.metrics.jobs).toBe(0);expect(view.agent.metrics.computeCredits).toBeCloseTo(9.9995,6);
 expect(await claim()).toBeNull();expect(planner).toHaveBeenCalledTimes(1);expect(await one(db,'SELECT status,output FROM jobs WHERE id=$1',[c.job.id])).toMatchObject({status:'waiting',output:null});
 const live=await d.publicDispatch('agents/live',{id:a.id});expect(live.status.state).toBe('WAITING FOR DATA');expect(live.operation.error).toBeNull();expect(live.operation.output).toBeNull();expect(live.operation.events.at(-1).type).toBe('COIN_WAITING');expect(workspaceMode(live,true,true)).toBe('IDLE');
 await expect(d.worker('defer',{id:c.job.id,lease:c.job.lease,deferred:{reason:'awaiting-data',seconds:60}})).rejects.toMatchObject({code:'STALE_LEASE'});
 await db.query("UPDATE agents SET next_run_at=now()-interval '1 second' WHERE id=$1",[a.id]);await finish(await claim());const state=await one(db,'SELECT autonomy_state,extract(epoch FROM next_run_at-now()) delay FROM agents WHERE id=$1',[a.id]);expect(state!.autonomy_state.waitingCount).toBe(2);expect(Number(state!.delay)).toBeGreaterThan(115);
 expect((await d.publicDispatch('agents/get',{id:a.id})).agent.metrics.jobs).toBe(0);
});
it('stops before calls when funds run out and automatically resumes after funding is observed',async()=>{
 const a=await create(),planner=useful();await db.transaction(tx=>ledger(tx,a.id,'debit','compute',9_950_000,randomUUID()));await db.query("UPDATE ledger_entries SET created_at=now()-interval '2 days' WHERE agent_id=$1 AND direction='debit'",[a.id]);expect(await claim()).toBeNull();expect(planner).not.toHaveBeenCalled();expect((await d.publicDispatch('agents/live',{id:a.id})).status.state).toBe('LOW COMPUTE');
 await db.transaction(tx=>ledger(tx,a.id,'credit','funding',100_000,randomUUID()));await db.query("UPDATE jobs SET run_after=now()-interval '1 second' WHERE agent_id=$1",[a.id]);const next=await claim();expect(next.agent.id).toBe(a.id);await finish(next);expect(planner).toHaveBeenCalledOnce();
});
it('preserves rolling spend caps and resumes when the window has capacity',async()=>{
 const a=await create();await db.transaction(tx=>ledger(tx,a.id,'debit','compute',200_000,randomUUID()));expect(await claim()).toBeNull();expect((await d.publicDispatch('agents/live',{id:a.id})).status.state).toBe('WAITING FOR BUDGET');
 await db.query("UPDATE ledger_entries SET created_at=now()-interval '2 hours' WHERE agent_id=$1 AND direction='debit'",[a.id]);await db.query("UPDATE jobs SET run_after=now()-interval '1 second' WHERE agent_id=$1",[a.id]);expect((await claim()).agent.id).toBe(a.id);
});
it('honors provider containment without calling a model or consuming attempts',async()=>{
 const a=await create();await db.query("UPDATE agents SET config=jsonb_set(config,'{brain}','\"openai:gpt-6-luna\"') WHERE id=$1",[a.id]);vi.stubEnv('PROVIDER_EXECUTION_PAUSED','true');try{expect(await claim()).toBeNull();expect((await d.publicDispatch('agents/live',{id:a.id})).status.state).toBe('WAITING FOR PROVIDER');expect((await one(db,'SELECT attempts FROM jobs WHERE agent_id=$1',[a.id]))!.attempts).toBe(0);}finally{vi.stubEnv('PROVIDER_EXECUTION_PAUSED','false');}
});
it('durably backs off final failures and exhausted attempts without a hot retry loop',async()=>{
 const a=await create(),c=await claim();await d.worker('fail',{id:c.job.id,lease:c.job.lease,error:'Provider unavailable',permanent:true});expect(await claim()).toBeNull();d=new Domain(db);expect(await claim()).toBeNull();expect((await d.publicDispatch('agents/live',{id:a.id})).status.state).toBe('RETRYING');
 await db.query("UPDATE agents SET next_run_at=now()-interval '1 second' WHERE id=$1",[a.id]);const retry=await claim();expect(retry.job.id).not.toBe(c.job.id);await d.worker('fail',{id:retry.job.id,lease:retry.job.lease,error:'Still unavailable',permanent:true});const state=await one(db,'SELECT autonomy_state,extract(epoch FROM next_run_at-now()) delay FROM agents WHERE id=$1',[a.id]);expect(state!.autonomy_state.errorCount).toBe(2);expect(Number(state!.delay)).toBeGreaterThan(115);
 await db.query("UPDATE agents SET next_run_at=now()-interval '1 second' WHERE id=$1",[a.id]);const last=await claim();await db.query("UPDATE jobs SET status='queued',attempts=max_attempts WHERE id=$1",[last.job.id]);expect(await claim()).toBeNull();expect((await one(db,'SELECT status FROM jobs WHERE id=$1',[last.job.id]))!.status).toBe('failed');
});
it('does not let unfunded queue entries starve a funded Coin',async()=>{
 for(let i=0;i<11;i++){const a=await create();await db.transaction(tx=>ledger(tx,a.id,'debit','compute',10_000_000,randomUUID()));}const ready=await create();let c=await claim();if(!c)c=await claim();expect(c.agent.id).toBe(ready.id);
});
it('preserves operator pause/kill controls and resumes only after an authenticated operator action',async()=>{
 const a=await create(),profile=(await d.publicDispatch('auth/session',{},owner)).profile;vi.stubEnv('ADMIN_WALLETS',profile.wallet);
 try{await d.publicDispatch('admin/agent',{id:a.id,paused:true},owner);await db.query('UPDATE agents SET next_run_at=NULL WHERE id=$1',[a.id]);expect(await claim()).toBeNull();await d.publicDispatch('admin/agent',{id:a.id,paused:false},owner);useful();await finish(await claim());
 await db.query("UPDATE agents SET config=jsonb_set(config,'{policy,killSwitch}','true') WHERE id=$1",[a.id]);expect(await claim()).toBeNull();const other=await create();expect((await claim()).agent.id).toBe(other.id);
 }finally{vi.stubEnv('ADMIN_WALLETS','');}
});
it('migrates existing schedules without changing mission, policy, funds, or safety stops',async()=>{
 const a=await create(),before=await one(db,'SELECT * FROM agents WHERE id=$1',[a.id]);await db.query("UPDATE agents SET config=jsonb_set(config,'{schedule}','\"manual\"'),paused=true WHERE id=$1",[a.id]);
 // Execute only the migration's data conversion against a real legacy fixture.
 const sql=readFileSync('supabase/migrations/012_continuous_coins.sql','utf8').split('INSERT INTO business_config_history')[1];for(const statement of ('INSERT INTO business_config_history'+sql).split(';').filter(s=>s.trim()))await db.query(statement);
 const after=await one(db,'SELECT * FROM agents WHERE id=$1',[a.id]);expect(after!.config.schedule).toBe('continuous');expect(after!.paused).toBe(true);expect(after!.next_run_at).toBeNull();expect(after!.mission).toBe(before!.mission);expect(after!.config.policy).toEqual(before!.config.policy);expect((await d.publicDispatch('agents/get',{id:a.id})).agent.metrics.computeCredits).toBe(10);expect(await claim()).toBeNull();
});
it.each(['work','wait'] as const)('clears an old failure after a recovered %s decision',async action=>{
 const a=await create();vi.spyOn(MockLLMProvider.prototype,'plan').mockResolvedValue({plan:{steps:[],serviceId:null,action,objective:'Review supplied evidence',waitSeconds:60,waitReason:'awaiting-data'},cost:500});
 const first=await claim();await d.worker('fail',{id:first.job.id,lease:first.job.lease,error:'MODEL_TIMEOUT'});await db.query('UPDATE jobs SET run_after=now() WHERE id=$1',[first.job.id]);await finish(await claim());const row=await one(db,'SELECT status,last_error FROM jobs WHERE id=$1',[first.job.id]);expect(row?.last_error).toBeNull();expect(row?.status).toBe(action==='work'?'succeeded':'waiting');expect((await d.publicDispatch('agents/live',{id:a.id})).operation.error).toBeNull();
});
