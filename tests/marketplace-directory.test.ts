import {describe,it,expect} from 'vitest';
import type {Agent,Service} from '../packages/core';
import {marketplaceDefaults as defaults,serviceDisplayStatus,serviceAvailability,serviceChips,serviceMatches,serviceSample,sortServices,type ServiceEntry} from '../packages/core/marketplace-directory';
function entry(id:string,service:Partial<Service>={},provider:Partial<Agent>={}):ServiceEntry{return {service:{id,agent_id:id,name:'Research a topic',agent_name:'SEARCH',ticker:'SEARCH',category:'Research',price:1,active:true,jobs:2,failures:0,success:100,latency:2,created_at:'2026-10-01',response_schema:{type:'object',properties:{summary:{},sources:{}}},...service} as Service,provider:{id,job_type:'Researcher',config:{policy:{}},health:'HEALTHY',paused:false,metrics:{lifecycle:'ACTIVE'},operational:{state:'READY',active:false},...provider} as Agent};}
describe('Marketplace display semantics',()=>{
 it('keeps dormant services discoverable and shares truthful homepage status and ranking',()=>{
  const dormant=entry('dormant',{}, {metrics:{lifecycle:'DORMANT'} as Agent['metrics']}),ready=entry('ready'),busy=entry('busy',{}, {operational:{state:'WORKING',active:true}});
  expect(serviceDisplayStatus(dormant)).toBe('Unavailable');expect(serviceDisplayStatus(ready)).toBe('Active');expect(serviceDisplayStatus(busy)).toBe('Busy');expect(serviceDisplayStatus({...ready,provider:undefined})).toBe('Unknown');
  expect(sortServices([dormant,ready,busy],'featured')[0]).toBe(ready);
  expect(sortServices([dormant],'featured')).toEqual([dormant]);
 });
 it('intersects search and all five facets with disjunctive count support',()=>{
  const e=entry('a'),f={...defaults,q:'search',category:'Research',role:'Researcher',price:'low',success:'100',availability:'Available now'};
  expect(serviceMatches(e,f)).toBe(true);for(const patch of [{q:'absent'},{category:'Data'},{role:'Verifier'},{price:'high'},{availability:'Busy'}])expect(serviceMatches(e,{...f,...patch})).toBe(false);
  expect(serviceMatches(e,{...f,role:'Verifier'},'role')).toBe(true);
 });
 it('price ranges partition boundary values without overlap or gaps',()=>{
  const ranges=['under','low','mid','high'];for(const [p,want] of [[.99,'under'],[1,'low'],[5,'low'],[5.000001,'mid'],[10,'mid'],[10.000001,'high']] as const){expect(ranges.filter(price=>serviceMatches(entry('a',{price:p}),{...defaults,price}))).toEqual([want]);}
 });
 it('no history never qualifies as reliable and all-failed orders retain a measured zero',()=>{
  const empty=entry('none',{jobs:0,failures:0,success:0}),failed=entry('failed',{jobs:0,failures:3,success:0});expect(serviceSample(empty.service)).toBe(0);expect(serviceSample(failed.service)).toBe(3);expect(serviceMatches(empty,{...defaults,success:'90'})).toBe(false);expect(sortServices([empty,failed],'reliability')[0]).toBe(failed);
 });
 it('does not label unavailable, missing, blocked or retrying providers available',()=>{
  const e=entry('a');expect(serviceAvailability({...e,provider:undefined})).toBe('Unknown');expect(serviceAvailability(entry('a',{}, {paused:true}))).toBe('Unavailable');expect(serviceAvailability(entry('a',{active:false}))).toBe('Unavailable');
  for(const state of ['WAITING FOR BUDGET','WAITING FOR PROVIDER','LOW COMPUTE','ERROR','RETRYING'])expect(serviceAvailability(entry('a',{}, {operational:{state,active:false}}))).toBe('Unavailable');
  expect(serviceAvailability(entry('a',{}, {operational:{state:'WORKING',active:true}}))).toBe('Busy');expect(serviceAvailability(entry('a',{}, {operational:{state:'QUEUED',active:false}}))).toBe('Busy');
  expect(serviceAvailability(entry('a',{}, {operational:{state:'WAITING FOR DATA',active:false}}))).toBe('Available now');
 });
 it('sustaining facet uses provider metrics, not stale service lifecycle or unsupported reliable badges',()=>{
  expect(serviceMatches(entry('a',{lifecycle:'SELF-SUSTAINING'}),{...defaults,availability:'sustaining'})).toBe(false);
  expect(serviceMatches(entry('a',{}, {metrics:{lifecycle:'SELF-SUSTAINING'} as Agent['metrics']}),{...defaults,availability:'sustaining'})).toBe(true);
 });
 it('sorts deterministic featured entries without mutation and ranks missing latency last',()=>{
  const unavailable=entry('a',{jobs:100},{paused:true}),sustaining=entry('b',{jobs:1},{metrics:{lifecycle:'SELF-SUSTAINING'} as Agent['metrics']}),ordinary=entry('c',{jobs:2}),none=entry('d',{latency:0,jobs:0});const list=[unavailable,ordinary,sustaining,none];expect(sortServices(list,'featured').map(e=>e.service.id)).toEqual(['b','c','d','a']);expect(list[0]).toBe(unavailable);expect(sortServices(list,'latency').at(-1)).toBe(none);
  expect(sortServices([entry('b'),entry('a')],'usage')[0].service.id).toBe('a');expect(sortServices([ordinary,entry('new',{created_at:'2026-10-05'})],'newest')[0].service.id).toBe('new');
 });
 it('chips describe explicit contract outputs only, never inferred tools',()=>{
  expect(serviceChips(entry('a').service)).toEqual(['Research','Summary','Sources']);expect(serviceChips(entry('a',{response_schema:{type:'object',properties:{untrusted_label:{},api_key:{},data:{}}}}).service)).toEqual(['Research','Data']);
 });
});
