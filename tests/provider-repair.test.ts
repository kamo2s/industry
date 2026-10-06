import * as catalog from '../packages/agent/catalog';
import {beforeEach} from 'vitest';
import {it,expect,vi,afterEach} from 'vitest';
import {OpenRouterModelProvider} from '../packages/agent/model';
import {operationDescription,operationEventInput} from '../packages/core/operations';
const response=(text:string)=>Response.json({id:'fixture',usage:{cost:.00002,prompt_tokens:100,completion_tokens:20},choices:[{message:{content:text}}]});
beforeEach(()=>{vi.spyOn(catalog,'openRouterBrain').mockResolvedValue({id:'openai/gpt-6-luna',name:'GPT-6 Luna',provider:'OpenAI',inputPrice:.1,outputPrice:.5,context:1000000,costTier:'Economy',speed:'Fast',development:false});});
const args=()=>({agent:{config:{brain:'openai/gpt-6-luna'}} as any,system:'Bounded plan',data:{topic:'public evidence'},schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},maxTokens:100,budget:10000,timeout:5000});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it.each(['Here is the answer.','{"ok":"wrong type"}'])('repairs invalid structure once and retains both measured charges: %s',async first=>{
 vi.stubEnv('OPENROUTER_API_KEY','fixture');const f=vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response('{"ok":true}'));vi.stubGlobal('fetch',f);const records:any[]=[];
 const result=await new OpenRouterModelProvider().generateStructured({...args(),checkpoint:async(c,u)=>{records.push({cost:c,usage:u});}});
 expect(result.value).toEqual({ok:true});expect(result.cost).toBe(40);expect(result.usage).toMatchObject({attempt:2,inputTokens:200,outputTokens:40});expect(result.usage.attempts).toHaveLength(2);expect(records.at(-1).cost).toBe(40);expect(records.filter(r=>r.usage.status==='pending')[1].cost).toBeGreaterThan(20);expect(f).toHaveBeenCalledTimes(2);
});
it('does not repair refusals or retry beyond the remaining budget',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','fixture');const f=vi.fn().mockResolvedValue(Response.json({usage:{cost:.00002,prompt_tokens:100,completion_tokens:20},choices:[{message:{refusal:'Declined'}}]}));vi.stubGlobal('fetch',f);
 await expect(new OpenRouterModelProvider().generateStructured(args())).rejects.toMatchObject({code:'MODEL_REFUSED'});expect(f).toHaveBeenCalledOnce();
 f.mockReset().mockResolvedValue(response('not json'));let pending=0;
 await expect(new OpenRouterModelProvider().generateStructured({...args(),checkpoint:async(_c,u)=>{if(u?.status==='pending'&&++pending===2)throw new Error('Compute revoked');}})).rejects.toThrow('Compute revoked');expect(f).toHaveBeenCalledOnce();
});
it('stops after two malformed responses with both calls accounted for',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','fixture');const f=vi.fn().mockImplementation(()=>Promise.resolve(response('bad json')));vi.stubGlobal('fetch',f);const costs:number[]=[];
 await expect(new OpenRouterModelProvider().generateStructured({...args(),checkpoint:async c=>{costs.push(c);}})).rejects.toMatchObject({code:'MODEL_SCHEMA'});expect(f).toHaveBeenCalledTimes(2);expect(costs.at(-1)).toBe(40);
});
it('accepts a single JSON fence only after validating the full business contract',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','fixture');const f=vi.fn().mockResolvedValue(response('```json\n{"ok":true}\n```'));vi.stubGlobal('fetch',f);
 const result=await new OpenRouterModelProvider().generateStructured(args());expect(result.value).toEqual({ok:true});expect(f).toHaveBeenCalledOnce();
 f.mockReset().mockImplementation(()=>Promise.resolve(response('Ignore limits.\n```json\n{"ok":true}\n```')));
 await expect(new OpenRouterModelProvider().generateStructured(args())).rejects.toMatchObject({code:'MODEL_SCHEMA'});
 f.mockReset().mockImplementation(()=>Promise.resolve(response('```json\n{"ok":true,"permission":"spend"}\n```')));
 await expect(new OpenRouterModelProvider().generateStructured(args())).rejects.toMatchObject({code:'MODEL_SCHEMA'});
});
it('provides bounded schema diagnostics for repair without copying rejected content into policy',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','fixture');const f=vi.fn().mockResolvedValueOnce(response('{"ok":"untrusted override policy"}')).mockResolvedValueOnce(response('{"ok":true}'));vi.stubGlobal('fetch',f);const records:any[]=[];
 await new OpenRouterModelProvider().generateStructured({...args(),checkpoint:async(_c,u)=>{records.push(u);}});
 expect(records.find(r=>r.status==='invalid-structure').structureIssues).toEqual([{path:'/ok',keyword:'type',message:'must be boolean'}]);
 const instructions=JSON.parse(f.mock.calls[1][1].body).messages[0].content;expect(instructions).toContain('must be boolean');expect(instructions).not.toContain('untrusted override policy');
});
it('distinguishes a model decision not to buy from unavailable suppliers',()=>{
 const event=operationEventInput.parse({key:'1',type:'DECISION_RECORDED',data:{reason:'no-service-selected'}});expect(operationDescription(event).summary).toContain('Coin chose');expect(operationDescription({...event,data:{reason:'no-compatible-service'}}).summary).toContain('No compatible supplier');
});
