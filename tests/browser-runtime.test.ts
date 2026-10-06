import {it,expect,vi,afterEach} from 'vitest';
import {executeRun,LiveModelProvider} from '../packages/agent/runtime';
import {OpenRouterModelProvider} from '../packages/agent/model';
import {OpenRouterWebSearchProvider} from '../packages/agent/search';
import * as tools from '../packages/agent/tools';
import {defaultPolicy} from '../packages/core';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it.each([false,true])('renders a discovered source through the capture bridge; retention failure=%s does not fail work',async(retentionFails)=>{
 vi.stubEnv('APP_ENV','local');vi.stubEnv('APP_MODE','demo');vi.stubEnv('OPENROUTER_API_KEY','test-placeholder');vi.stubEnv('BROWSERBASE_API_KEY','');vi.stubEnv('BROWSER_PROVIDER','local');
 vi.spyOn(LiveModelProvider.prototype,'plan').mockResolvedValue({plan:{steps:[{tool:'web_search',query:'public source'}]},cost:500,estimated:false});
 vi.spyOn(OpenRouterWebSearchProvider.prototype,'search').mockResolvedValue({sources:[{url:'https://example.com/',title:'Example',snippet:'Discovery'}],cost:1000} as any);
 vi.spyOn(OpenRouterModelProvider.prototype,'generateStructured').mockResolvedValue({value:{summary:'Sourced result',sources:[],findings:[]},cost:500,usage:{estimated:false}} as any);
 const render=vi.spyOn(tools,'executeTool').mockImplementation(async(_key,_input,_config,_timeout,capture)=>{await capture?.({content:'bounded-pixels',url:'https://example.com/',title:'Example',action:'PAGE_OPENED',capturedAt:new Date().toISOString(),mode:'public-static-html'});return {title:'Example',url:'https://example.com/',text:'Actual public page text',provider:'local-playwright'};});
 const config={brain:'openai/gpt-6-luna',tools:['web_search','browser_fetch'],domains:[],publicOutput:true,scope:'Public evidence',policy:{...defaultPolicy,maxRunCost:.1,maxTools:2,autoHire:false},outputFormat:'report'},calls:any[]=[];
 const result=await executeRun({agent:{id:'coin',mission:'Public evidence',job_type:'Researcher',category:'Research',tools:config.tools,config},job:{id:'job',lease:'active-lease',type:'RUN',payload:{}},memories:[]} as any,async(op,body)=>{calls.push({op,body});if(op==='policy')return {config,computeAvailableMicro:100000};if(op==='browser/capture'&&retentionFails)throw new Error('Storage unavailable');return {};});
 expect(render).toHaveBeenCalledOnce();expect(render.mock.calls[0][0]).toBe('browser_fetch');expect(calls.find(c=>c.op==='browser/capture').body).toMatchObject({id:'job',lease:'active-lease',capture:{visibility:'PUBLIC'}});
 const events=calls.filter(c=>c.op==='operation').map(c=>c.body.event.type);expect(events).toEqual(expect.arrayContaining(['BROWSER_STARTED','BROWSER_COMPLETED']));expect(events.includes('CAPTURE_FAILED')).toBe(retentionFails);expect(result.runs.find(r=>r.name==='source-fetch:2').provider).toBe('local-playwright');expect(result.cost).toBe(2250);expect(result.output?.summary).toBe('Sourced result');
});
