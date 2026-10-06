import {it,expect,vi,afterEach} from 'vitest';
import {defaultPolicy} from '../packages/core';
const row=(id='google/gemini-3.8-flash',overrides={})=>({id,name:'Test model',architecture:{input_modalities:['text'],output_modalities:['text']},supported_parameters:['structured_outputs','tools'],pricing:{prompt:'0.0000003',completion:'0.0000012',request:'0'},context_length:128000,top_provider:{max_completion_tokens:8192},...overrides});
async function setup(){vi.resetModules();vi.stubEnv('APP_ENV','local');vi.stubEnv('APP_MODE','demo');vi.stubEnv('OPENAI_API_KEY','direct-fixture');vi.stubEnv('OPENAI_ALLOWED_MODELS','gpt-6-luna');vi.stubEnv('OPENAI_MODEL','gpt-6-luna');vi.stubEnv('OPENROUTER_API_KEY','router-fixture');vi.stubEnv('OPENROUTER_ALLOWED_MODELS','google/gemini-3.8-flash');vi.stubEnv('OPENROUTER_MODEL','');vi.stubEnv('MODEL_INPUT_PRICE_PER_MILLION','3');vi.stubEnv('MODEL_OUTPUT_PRICE_PER_MILLION','15');return import('../packages/agent/catalog');}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('never offers direct models without a router key or during a catalog outage',async()=>{
 const catalog=await setup(),fetch=vi.fn().mockRejectedValue(Error('outage'));vi.stubGlobal('fetch',fetch);vi.stubEnv('OPENROUTER_API_KEY','');let result=await catalog.modelCatalog();expect(result.models.map(m=>m.id)).toEqual(['development/mock']);expect(fetch).not.toHaveBeenCalled();
 vi.stubEnv('OPENROUTER_API_KEY','router-fixture');result=await catalog.modelCatalog();expect(result.openrouter.status).toBe('unavailable');expect(result.models[0].id).toBe('development/mock');await expect(catalog.validateBrain('google/gemini-3.8-flash')).rejects.toThrow('catalog');
});
it('filters capabilities, invalid prices, request fees, expiry and price ceilings; caches concurrent reads',async()=>{
 const catalog=await setup();vi.stubEnv('OPENROUTER_ALLOWED_MODELS','google/gemini-3.8-flash,bad-price,expensive,unstructured,image,request-fee,expired');
 const fetch=vi.fn().mockImplementation(()=>Promise.resolve(Response.json({data:[row(),row('bad-price',{pricing:{prompt:null,completion:'no'}}),row('expensive',{pricing:{prompt:'1',completion:'1'}}),row('unstructured',{supported_parameters:[]}),row('image',{architecture:{input_modalities:['text'],output_modalities:['image']}}),row('request-fee',{pricing:{prompt:'0',completion:'0',request:'.1'}}),row('expired',{expiration_date:'2020-01-01'})]})));vi.stubGlobal('fetch',fetch);
 const results=await Promise.all([catalog.modelCatalog(),catalog.modelCatalog()]);expect(fetch).toHaveBeenCalledTimes(1);expect(results[0].models.filter(m=>m.route==='OpenRouter')).toMatchObject([{id:'google/gemini-3.8-flash',provider:'Google',structured:true,inputPrice:.3,outputPrice:1.2}]);
 vi.stubEnv('MODEL_INPUT_PRICE_PER_MILLION','.1');expect((await catalog.modelCatalog()).openrouter.count).toBe(0);expect(fetch).toHaveBeenCalledTimes(2);
});
it('executes the chosen model with exact routing caps and records measured usage',async()=>{
 await setup();const fetch=vi.fn().mockImplementation((url,_init)=>Promise.resolve(String(url).endsWith('/models')?Response.json({data:[row()]}):Response.json({id:'generation-fixture',model:'google/gemini-3.8-flash',usage:{cost:.0002,prompt_tokens:50,completion_tokens:20},choices:[{message:{content:'{"summary":"Evidence"}'}}]})));vi.stubGlobal('fetch',fetch);
 const {OpenRouterModelProvider}=await import('../packages/agent/model'),checkpoints:any[]=[];
 const args={agent:{job_type:'Researcher',config:{brain:'google/gemini-3.8-flash'}} as any,system:'Review evidence',data:{input:'public fixture'},schema:{type:'object',properties:{summary:{type:'string'}},required:['summary'],additionalProperties:false},maxTokens:100,budget:10000,timeout:20000,checkpoint:async(cost:number,usage:any)=>{checkpoints.push({cost,usage});}};
 const result=await new OpenRouterModelProvider().generateStructured(args);expect(result.value.summary).toBe('Evidence');expect(result.cost).toBe(200);expect(result.usage.estimated).toBe(false);
 const request=JSON.parse(fetch.mock.calls.find(c=>String(c[0]).endsWith('/chat/completions'))![1].body);expect(request.model).toBe('google/gemini-3.8-flash');expect(request.provider).toMatchObject({require_parameters:true,data_collection:'deny',max_price:{prompt:.3,completion:1.2,request:0}});expect(request.models).toBeUndefined();expect(checkpoints[0].usage.status).toBe('pending');expect(checkpoints.at(-1).cost).toBe(200);
 await expect(new OpenRouterModelProvider().generateStructured({...args,budget:1})).rejects.toThrow('budget');expect(fetch.mock.calls.filter(c=>String(c[0]).endsWith('/chat/completions'))).toHaveLength(1);
});
it('preserves the reserved charge after transport failure and rejects provider errors without retrying',async()=>{
 await setup();let fail=true;const fetch=vi.fn().mockImplementation(url=>{if(String(url).endsWith('/models'))return Promise.resolve(Response.json({data:[row()]}));return fail?Promise.reject(Error('socket')):Promise.resolve(Response.json({error:{message:'private upstream detail'},usage:{cost:.0001}}));});vi.stubGlobal('fetch',fetch);
 const {OpenRouterModelProvider}=await import('../packages/agent/model'),charges:any[]=[];
 const args={agent:{job_type:'Researcher',config:{brain:'google/gemini-3.8-flash'}} as any,system:'Evidence',data:{},schema:{type:'object',properties:{summary:{type:'string'}},required:['summary']},maxTokens:100,budget:10000,timeout:20000,checkpoint:async(cost:number,usage:any)=>{charges.push({cost,usage});}};
 await expect(new OpenRouterModelProvider().generateStructured(args)).rejects.toMatchObject({code:'MODEL_TIMEOUT'});expect(charges).toHaveLength(1);expect(charges[0].usage.status).toBe('pending');fail=false;
 await expect(new OpenRouterModelProvider().generateStructured(args)).rejects.toMatchObject({code:'MODEL_FAILED'});expect(charges.at(-1).cost).toBe(100);expect(fetch.mock.calls.filter(c=>String(c[0]).endsWith('/chat/completions'))).toHaveLength(2);
});
it('never silently simulates a selected OpenRouter brain without credentials',async()=>{
 await setup();vi.stubEnv('OPENROUTER_API_KEY','');const {executeRun}=await import('../packages/agent/runtime');const bridge=vi.fn();
 await expect(executeRun({agent:{id:'a',job_type:'Researcher',tools:[],config:{brain:'google/gemini-3.8-flash',policy:defaultPolicy}},job:{id:'j',lease:'l',payload:{}},memories:[]} as any,bridge)).rejects.toMatchObject({code:'MODEL_UNCONFIGURED'});expect(bridge).not.toHaveBeenCalled();
});
it('allows environment configuration to narrow, never extend the approved registry',async()=>{
 await setup();const {configuredModels}=await import('../packages/agent/openrouter-config');vi.stubEnv('OPENROUTER_ALLOWED_MODELS','');expect(configuredModels()).toHaveLength(20);vi.stubEnv('OPENROUTER_ALLOWED_MODELS','google/gemini-3.8-flash,google/gemini-3.8-flash');expect(configuredModels()).toEqual(['google/gemini-3.8-flash']);
});
it('runs planning and delivery through the selected router brain with durable usage checkpoints',async()=>{
 await setup();let calls=0;const fetch=vi.fn().mockImplementation(url=>Promise.resolve(String(url).endsWith('/models')?Response.json({data:[row()]}):Response.json({usage:{cost:.0001,prompt_tokens:30,completion_tokens:10},choices:[{message:{content:++calls===1?'{"steps":[]}':'{"summary":"Completed the supplied task"}'}}]})));vi.stubGlobal('fetch',fetch);
 const {executeRun}=await import('../packages/agent/runtime'),charges:any[]=[];
 const config={brain:'google/gemini-3.8-flash',policy:{...defaultPolicy,autoHire:false,maxTools:1,maxRunCost:.1},scope:'Summarize supplied input',tools:[],publicOutput:true,outputFormat:'report'};
 const result=await executeRun({agent:{id:'a',job_type:'Researcher',mission:'Summarize supplied input',category:'Research',tools:[],config},job:{id:'j',type:'SERVICE',lease:'l',payload:{input:{topic:'Supplied public evidence'}},responseSchema:{type:'object',properties:{summary:{type:'string'}},required:['summary'],additionalProperties:false}},memories:[]} as any,async(op,b)=>{if(op==='usage')charges.push(b);return op==='policy'?{config,computeAvailableMicro:100000}:{};});
 expect(calls).toBe(2);expect(result.output.summary).toBe('Completed the supplied task');expect(result.cost).toBe(200);expect(result.runs.every((r:any)=>r.provider==='OpenRouter')).toBe(true);expect(charges.at(-1).cost).toBe(200);
});

