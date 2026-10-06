import {it,expect,vi,afterEach} from 'vitest';
import {autonomousModelPolicy,autonomousLaunch} from '../packages/core/autonomy';
import {newLaunchDraft} from '../packages/core/launch-defaults';
import {routerCall} from '../packages/agent/openrouter-client';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('uses model-aware managed ceilings without accepting caller financial overrides',()=>{
 expect(autonomousModelPolicy('openai/gpt-6-astra')).toMatchObject({maxRunCost:1.9,hourlySpend:2,dailySpend:2});
 expect(autonomousModelPolicy('x-ai/grok-4.7').maxRunCost).toBe(.5);
 expect(autonomousModelPolicy('openai/gpt-6-luna').maxRunCost).toBe(.1);
 expect(autonomousModelPolicy('google/gemini-3.8-flash')).toMatchObject({maxRunCost:.25,hourlySpend:.5,dailySpend:1});
 const draft={...newLaunchDraft(),name:'Premium',ticker:'PREM',description:'Premium autonomous business',brain:'openai/gpt-6-astra'};
 const input={...draft,policy:{...draft.policy,maxRunCost:999,dailySpend:999}};
 expect(autonomousLaunch(input,true).policy).toEqual({...autonomousModelPolicy(input.brain),preferredCategories:autonomousLaunch(input,true).policy.preferredCategories});
});
it('reserves only reachable context pricing tiers and retains budget checks before traffic',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','fixture');const fetch=vi.fn().mockImplementation(async()=>Response.json({usage:{cost:.00001},choices:[{message:{content:'ok'}}]}));vi.stubGlobal('fetch',fetch);
 const brain={id:'openai/gpt-6-astra',name:'Astra',provider:'OpenAI',inputPrice:10,outputPrice:50,reserveInputPrice:100,reserveOutputPrice:500,pricingTiers:[{minInputTokens:0,inputPrice:10,outputPrice:50},{minInputTokens:10000,inputPrice:100,outputPrice:500}],context:1000000,costTier:'$$$$',speed:'Slower',development:false};
 const small=await routerCall({brain,body:{max_tokens:100,messages:[{role:'user',content:'test'}]},budget:30000,timeout:1000});expect(small.usage.inputPrice).toBe(10);
 await expect(routerCall({brain,body:{max_tokens:100,messages:[{role:'user',content:'x'.repeat(10000)}]},budget:30000,timeout:1000})).rejects.toMatchObject({code:'RUN_LIMIT'});expect(fetch).toHaveBeenCalledTimes(1);
 const large=await routerCall({brain,body:{max_tokens:100,messages:[{role:'user',content:'x'.repeat(10000)}]},budget:2000000,timeout:1000});expect(large.usage.inputPrice).toBe(100);
});
