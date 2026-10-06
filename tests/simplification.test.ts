import {describe,it,expect} from 'vitest';
import {agentSchema,defaultPolicy,templates} from '../packages/core';
import {newLaunchDraft,guidedTemplate,recommendedBrain,launchDefaults} from '../packages/core/launch-defaults';
import {networkFocus,type BusinessGraph} from '../packages/core/network-view';
import {searchReserve} from '../packages/agent/openrouter-client';
describe('guided creation',()=>{
 it('generates valid bounded launches for every existing role without changing existing policy defaults',()=>{
  for(const role of templates){const d=guidedTemplate(newLaunchDraft(),role);expect(()=>agentSchema.parse({...d,name:'Simple research',ticker:'SIMPLE',description:'Research public information',scope:'Review official public documentation.'})).not.toThrow();expect(d.policy.autoHire).toBe(true);expect(d.schedule).toBe('continuous');expect(d.policy.maxRunCost).toBe(.1);expect(d.services[0].price).toBe(.01);expect(d.services[0].price).toBeLessThanOrEqual(d.policy.maxPurchase);}
  expect(defaultPolicy.maxRunCost).toBe(.02);
 });
 it('leaves room for the current search reservation plus planning and synthesis',()=>{
  const p={cacheWrite:.25,output:.75};
  const search=searchReserve+(128000+3000)*p.cacheWrite+1800*p.output;
  expect(search+5000).toBeLessThan(launchDefaults.policy.maxRunCost*1e6);
 });
 it('selects a live search-capable model and handles an empty catalog',()=>{
  const models=[{id:'dev',development:true,inputPrice:null,outputPrice:null},{id:'live',development:false,inputPrice:.1,outputPrice:.5,webSearch:true},{id:'expensive',development:false,inputPrice:5,outputPrice:10}];
  expect(recommendedBrain(models)).toBe('live');expect(recommendedBrain([])).toBe('');expect(models[0].id).toBe('dev');
 });
});
const nodes=['buyer','business','supplier','isolated'].map(id=>({id,name:id,slug:id,ticker:id,role:'Researcher'}));
const graph:BusinessGraph={nodes,edges:[{source:'buyer',target:'business',volume:2,jobs:3,last_at:''},{source:'business',target:'supplier',volume:1,jobs:2,last_at:''},{source:'missing',target:'business',volume:99,jobs:100,last_at:''}],days:7,limit:60};
describe('readable business relationships',()=>{
 it('keeps payment direction and totals correct and ignores unknown nodes',()=>{const f=networkFocus(graph,'business');expect(f.incoming[0].source).toBe('buyer');expect(f.outgoing[0].target).toBe('supplier');expect(f.received).toBe(2);expect(f.paid).toBe(1);expect(f.edges).toHaveLength(2);});
 it('chooses a connected focus but preserves an explicitly selected isolated agent',()=>{expect(networkFocus(graph).node?.id).toBe('business');expect(networkFocus(graph,'isolated').incoming).toEqual([]);expect(networkFocus(graph,'gone').node?.id).toBe('business');});
 it('supports empty graphs without invented activity',()=>{const f=networkFocus({...graph,nodes:[],edges:[]});expect(f.node).toBeUndefined();expect(f.received).toBe(0);});
});
