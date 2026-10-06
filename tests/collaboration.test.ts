import {it,expect,vi,afterEach} from 'vitest';
import {randomUUID} from 'node:crypto';
import {executeRun,LiveModelProvider} from '../packages/agent/runtime';
import {OpenRouterModelProvider} from '../packages/agent/model';
import {OpenRouterWebSearchProvider} from '../packages/agent/search';
import * as tools from '../packages/agent/tools';
import {compactMemories,compactEvidence,diverseSources,repeatedResult} from '../packages/agent/collaboration';
import {defaultPolicy} from '../packages/core';
import {operationDescription,operationEventInput} from '../packages/core/operations';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
const source={url:'https://example.com/spec',title:'Official capability specification',snippet:'This is an unverified search excerpt.'};
const output={title:'Result',summary:'Reviewed with independent evidence.',sources:[source],findings:[{finding:'Scope is limited.',sourceUrls:[source.url]}]};
const usage={estimated:false,inputTokens:100,outputTokens:100,model:'gpt-6-luna',attempt:1,status:'completed'};
function fixture(decision:Record<string,any>={}){
  vi.stubEnv('APP_ENV','local');vi.stubEnv('APP_MODE','demo');vi.stubEnv('OPENROUTER_API_KEY','fixture-only');vi.stubEnv('BROWSER_PROVIDER','');vi.stubEnv('BROWSERBASE_API_KEY','');
  const service={id:randomUUID(),agent_id:randomUUID(),active:true,lifecycle:'ACTIVE',name:'Independent verification',description:'Resolve concrete public claims.',agent_mission:'Evaluate developer framework claims.',category:'Verification',price:.01,max_seconds:60,success:100,jobs:2,request_schema:{required:['claim']}};
  const config={autonomyVersion:1,schedule:'continuous',brain:'openai/gpt-6-luna',tools:['web_search','browser_fetch','marketplace'],domains:[],publicOutput:true,scope:'Compare persistence semantics',policy:{...defaultPolicy,maxRunCost:.1,maxTools:3,autoHire:true},outputFormat:'report'};
  const calls:{op:string;body:any}[]=[];
  const claim:any={agent:{id:randomUUID(),mission:'Compare persistence semantics',job_type:'Scout',category:'Research',tools:config.tools,config},job:{id:randomUUID(),lease:randomUUID(),maxSeconds:120,type:'RUN',payload:{}},memories:[]};
  vi.spyOn(LiveModelProvider.prototype,'plan').mockResolvedValue({plan:{steps:[{tool:'web_search',query:'persistence semantics'}],serviceId:null,objective:'Compare persistence semantics'},cost:500,estimated:false});
  vi.spyOn(OpenRouterWebSearchProvider.prototype,'search').mockResolvedValue({sources:[{...source}],cost:1000} as any);
  const tool=vi.spyOn(tools,'executeTool').mockResolvedValue({text:'The primary source leaves restart recovery unresolved.',title:source.title,url:source.url});
  const generate=vi.spyOn(OpenRouterModelProvider.prototype,'generateStructured').mockImplementation(async(args)=>{
    const review=(args.schema as any).properties?.novelty;
    const value=review?{action:'continue',novelty:'baseline',delta:'A first comparison with an unresolved durability gap.',serviceId:service.id,request:'Determine whether checkpoints survive a process restart, not merely an in-process interrupt. Cite primary evidence at https://example.com/spec and describe any storage configuration required.',need:'independent-verification',...decision}:structuredClone(output);
    await args.checkpoint?.(500,usage);return {value,cost:500,usage};
  });
  const bridge=async(op:string,body:any)=>{
    calls.push({op,body});
    if(op==='policy')return {config,computeAvailableMicro:100000,serviceSpentMicro:calls.some(c=>c.op==='purchase')?10000:0};
    if(op==='services')return [service];
    if(op==='purchase')return {jobId:'delivered-job'};
    if(op==='dependency')return {status:'succeeded',output:{summary:'Restart recovery requires persistent storage; in-memory state alone does not survive restart.',sources:[source]}};
    return {};
  };
  return {claim,config,service,calls,generate,tool,bridge};
}
it('chooses a specific supplier request after seeing evidence and incorporates actual delivery',async()=>{
  const f=fixture(),result=await executeRun(f.claim,f.bridge);
  expect(f.calls.findIndex(c=>c.op==='purchase')).toBeGreaterThan(f.calls.findIndex(c=>c.op==='operation'&&c.body.event.type==='EVIDENCE_FILTERED'));
  expect(f.calls.find(c=>c.op==='purchase')?.body.input.claim).toContain('process restart');
  expect(f.generate.mock.calls[0][0].data).toMatchObject({evidence:[{inspected:true,evidence:'The primary source leaves restart recovery unresolved.'}]});
  const synthesis=f.generate.mock.calls[1][0];expect(JSON.stringify(synthesis.data)).toContain('Restart recovery requires persistent storage');
  expect(result.output.delegation).toMatchObject({status:'succeeded',need:'independent-verification',jobId:'delivered-job'});
  expect(result.cost).toBe(2750);expect(result.runs.map(r=>r.name)).toContain('evidence-review');
});
it('waits without buying or publishing when the evidence review finds repetitive work',async()=>{
  const f=fixture({action:'wait',novelty:'none',delta:'Already covered.',serviceId:null,request:null,need:'none'});
  f.claim.memories=[{summary:'Prior result',data:{findings:[{finding:'Restart requires persistent storage',sourceUrls:[source.url]}]}}];
  const result=await executeRun(f.claim,f.bridge);expect(result.deferred).toMatchObject({reason:'no-useful-work',seconds:3600});expect(result.output).toBeUndefined();expect(result.cost).toBe(2250);expect(f.generate).toHaveBeenCalledOnce();expect(f.calls.some(c=>c.op==='purchase')).toBe(false);
  const event=f.calls.find(c=>c.op==='operation'&&c.body.event.data.reason==='duplicate-work')!.body.event;
  expect(operationDescription(operationEventInput.parse(event)).summary).toContain('waits instead');
});
it.each([{serviceId:randomUUID()},{need:'none'},{request:null},{action:'wait',serviceId:null,request:null}])('cannot turn an invalid or declined proposal into a purchase: %j',async decision=>{
  const f=fixture(decision);await executeRun(f.claim,f.bridge);expect(f.calls.some(c=>c.op==='purchase')).toBe(false);
});
it('retains the buyer result when the Coin freely declines an available supplier',async()=>{
  const f=fixture({serviceId:null,request:null,need:'none'});const result=await executeRun(f.claim,f.bridge);expect(result.output.summary).toBe(output.summary);expect(result.output.delegation).toBeUndefined();
  expect(f.calls.some(c=>c.op==='operation'&&c.body.event.data.reason==='no-service-selected')).toBe(true);
});
it('distinguishes unavailable contract time from a voluntary choice not to purchase',async()=>{
  const f=fixture({serviceId:null,request:null,need:'none'});f.claim.job.maxSeconds=65;
  const result=await executeRun(f.claim,f.bridge);
  expect(f.generate.mock.calls[0][0].data).toMatchObject({availableServices:[]});
  expect(result.runs.find(r=>r.name==='evidence-review').metadata).toMatchObject({availableServiceIds:[],compatibleServiceCount:1});
  expect(f.calls.some(c=>c.op==='operation'&&c.body.event.data.reason==='no-compatible-service')).toBe(true);
});
it('lets a continuous Coin consider a supplier after a failed direct source rather than retrying the same paid plan',async()=>{
  const f=fixture();
  vi.mocked(LiveModelProvider.prototype.plan).mockResolvedValue({plan:{steps:[{tool:'browser_fetch',url:source.url}],objective:'Compare persistence semantics'},cost:500,estimated:false});
  f.tool.mockRejectedValue(new Error('Source redirected'));
  const result=await executeRun(f.claim,f.bridge);
  expect(f.generate.mock.calls[0][0].data).toMatchObject({unavailableSources:[source.url]});
  expect(result.output.delegation).toMatchObject({status:'succeeded'});expect(result.output.sources[0].url).toBe(source.url);
});
it('does not publish an empty baseline when all direct sources fail and no supplier is selected',async()=>{
  const f=fixture({serviceId:null,request:null,need:'none'});
  vi.mocked(LiveModelProvider.prototype.plan).mockResolvedValue({plan:{steps:[{tool:'browser_fetch',url:source.url}],objective:'Compare persistence semantics'},cost:500,estimated:false});
  f.tool.mockRejectedValue(new Error('Source redirected'));
  const result=await executeRun(f.claim,f.bridge);expect(result.output).toBeUndefined();expect(result.deferred).toMatchObject({reason:'awaiting-data'});expect(result.cost).toBe(1250);
});
it('tries a second discovered source after a failed fetch, within the tool limit',async()=>{
  const f=fixture({serviceId:null,request:null,need:'none'});
  vi.mocked(OpenRouterWebSearchProvider.prototype.search).mockResolvedValue({sources:[{...source},{...source,url:'https://example.com/alternative'}],cost:1000} as any);
  f.tool.mockRejectedValueOnce(new Error('Source exceeds 512 KB'));
  const result=await executeRun(f.claim,f.bridge);expect(f.tool).toHaveBeenCalledTimes(2);expect(result.cost).toBe(3000);expect(result.output.sources[0].url).toBe(source.url);
  expect(f.generate.mock.calls[0][0].data).toMatchObject({unavailableSources:[source.url],evidence:[{inspected:false},{inspected:true}]});
});
it('never performs a post-discovery fetch after fetch permission is revoked',async()=>{
  const f=fixture({serviceId:null,request:null,need:'none'});
  await executeRun(f.claim,async(op,b)=>{const r=await f.bridge(op,b);if(op==='policy'&&f.calls.some(c=>c.op==='operation'&&c.body.event.type==='SEARCH_COMPLETED'))return {...r,config:{...f.config,tools:['web_search','marketplace']}};return r;});
  expect(f.tool).not.toHaveBeenCalled();
});
it('bounds repeated discovery to one search and preserves evidence if a planned URL fails',async()=>{
  const f=fixture({serviceId:null,request:null,need:'none'});
  vi.mocked(LiveModelProvider.prototype.plan).mockResolvedValue({plan:{steps:[{tool:'web_search',query:'one'},{tool:'web_search',query:'duplicate discovery'},{tool:'http',url:source.url}],objective:'Compare persistence semantics'},cost:500,estimated:false});
  f.config.tools.push('http');f.tool.mockRejectedValueOnce(new Error('Source exceeds 512 KB'));
  const result=await executeRun(f.claim,f.bridge);
  expect(OpenRouterWebSearchProvider.prototype.search).toHaveBeenCalledOnce();expect(result.output.summary).toBe(output.summary);expect(result.runs[0].metadata.proposedSteps).toBe(3);expect(result.runs[0].metadata.steps).toBe(2);
});
it('does not label a search citation as direct inspection and preserves source diversity',()=>{
  const rows=[{...source,retrieved_at:'2026-10-04T00:00:00Z'}, {...source,url:'https://example.com/second'}, {...source,url:'https://another.example/docs'}];
  expect(compactEvidence(rows)[0].inspected).toBe(false);expect(diverseSources(rows,2).map(s=>s.url)).toEqual([source.url,rows[2].url]);
});
it('does not delegate a paid supplier job and gives synthesis the exact requested contract',async()=>{
  const f=fixture();f.claim.job.type='SERVICE';f.claim.job.payload.input={claim:'Verify storage durability specifically'};f.claim.job.responseSchema={type:'object',properties:{summary:{type:'string'}},required:['summary']};
  const result=await executeRun(f.claim,f.bridge);expect(f.calls.some(c=>c.op==='services'||c.op==='purchase')).toBe(false);expect(f.generate).toHaveBeenCalledOnce();expect(f.generate.mock.calls[0][0].data).toMatchObject({jobKind:'SERVICE',input:{claim:'Verify storage durability specifically'}});expect(result.deferred).toBeUndefined();
});
it('bounds memory context and includes concrete findings, including previously purchased evidence',()=>{
  const m=compactMemories([{summary:'s'.repeat(5000),memory_type:'purchased-result',data:{result:{summary:'Prior',findings:[{finding:'A concrete finding',sourceUrls:['https://example.com/']}],sources:[source]}}}]);
  expect(m[0].summary.length).toBe(700);expect(m[0].findings[0].finding).toBe('A concrete finding');expect(m[0].sourceUrls).toEqual([source.url]);
});
it('rejects repeated results only for the same task and evidence, preserving changed measurements',()=>{
  const summary='The framework persists checkpoints using a configured durable store. The in-memory example does not survive process restart. The benchmark observed 12 successful recoveries.',objective='Compare checkpoint recovery after restart';
  const memories=[{summary,data:{summary,objective,fingerprint:'same',jobType:'RUN'}}];
  expect(repeatedResult({summary},memories,'same',objective)).toBe(true);
  expect(repeatedResult({summary:summary.replace('12','13')},memories,'same',objective)).toBe(false);
  expect(repeatedResult({summary},memories,'different',objective)).toBe(false);
  expect(repeatedResult({summary},memories,'same','Compare authentication methods')).toBe(false);
  expect(repeatedResult({summary:summary.replace('does not survive','does survive')},memories,'same',objective)).toBe(false);
});
it('parks a pending dependency without model calls and resumes its delivered result without buying again',async()=>{
 const f=fixture();f.claim.job.dependencies=[{jobId:'existing',status:'queued',service:'Verification'}];
 const waiting=await executeRun(f.claim,f.bridge);expect(waiting).toMatchObject({blocked:true,cost:0});expect(f.generate).not.toHaveBeenCalled();expect(f.calls).toHaveLength(0);
 f.claim.job.dependencies=[{jobId:'existing',status:'succeeded',service:'Verification',result:{summary:'Verified retained assessment',sources:[source]},execution:{separateJob:true,sameOwner:true}}];
 const resumed=await executeRun(f.claim,f.bridge);expect(resumed.output.delegation.jobId).toBe('existing');expect(f.calls.some(c=>c.op==='purchase')).toBe(false);expect(f.generate).toHaveBeenCalledOnce();expect(JSON.stringify(f.generate.mock.calls[0][0].data)).toContain('Verified retained assessment');
});
