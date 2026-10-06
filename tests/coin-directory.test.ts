import {describe,it,expect} from 'vitest';
import type {Agent} from '../packages/core';
import {coinDirectoryStatus,directoryDefaults,directoryMatches,providerName,sortDirectory,type DirectoryModel} from '../packages/core/coin-directory';
const models:DirectoryModel[]=[{id:'openai:gpt-6-luna',name:'GPT-6 Luna',provider:'openai',development:false},{id:'development/mock',name:'Development',provider:'mock',development:true}];
function coin(id:string,overrides:Partial<Agent>={}):Agent{return {id,name:id,slug:id,ticker:id,job_type:'Researcher',config:{brain:models[0].id},token:null,created_at:'2026-10-01',metrics:{lifecycle:'ACTIVE',revenue7d:10,jobs7d:2},...overrides} as Agent;}
describe('Coin directory data semantics',()=>{
 it('shows current execution and recovery instead of an old health error',()=>{
  const a=coin('recovering',{health:'ERROR'});
  expect(coinDirectoryStatus({...a,operational:{active:true,state:'WAITING FOR SUPPLIER'}} as Agent)).toBe('Active');
  expect(coinDirectoryStatus({...a,operational:{active:false,state:'RETRYING'}} as Agent)).toBe('Retrying');
  expect(coinDirectoryStatus({...a,operational:{active:false,state:'WAITING FOR BUDGET'}} as Agent)).toBe('Budget cooldown');
  expect(coinDirectoryStatus({...a,operational:{active:false,state:'WAITING FOR PROVIDER'}} as Agent)).toBe('Provider waiting');
 });
 it('intersects search, role, provider, model, status and network without losing address matches',()=>{
  const a=coin('alpha',{token:{mint:'uniqueMint',network:'mainnet-beta'} as Agent['token']});
  const f={...directoryDefaults,q:'uniquemint',role:'Researcher',provider:'OpenAI',model:models[0].id,status:'ACTIVE',network:'live'};
  expect(directoryMatches(a,f,models)).toBe(true);expect(directoryMatches(a,{...f,role:'Verifier'},models)).toBe(false);
  expect(directoryMatches(a,{...f,provider:'Development'},models)).toBe(false);expect(directoryMatches(a,{...f,network:'test'},models)).toBe(false);
  expect(directoryMatches(a,{...f,q:'RESEARCHER'},models)).toBe(true);
  expect(directoryMatches(coin('b',{treasury:{public_address:'treasury-address'} as Agent['treasury']}),{...directoryDefaults,q:'treasury-address'},models)).toBe(true);
 });
 it('computes disjunctive facet totals against all remaining filters',()=>{
  const a=coin('a'),b=coin('b',{job_type:'Verifier'}),c=coin('c',{job_type:'Verifier',config:{brain:'development/mock'} as Agent['config']}),f={...directoryDefaults,role:'Researcher',provider:'OpenAI'};
  expect([a,b,c].filter(v=>directoryMatches(v,f,models,'role'))).toEqual([a,b]);
  expect([a,b,c].filter(v=>directoryMatches(v,f,models,'provider'))).toEqual([a]);
 });
 it('preserves homepage category deep links alongside role filters',()=>{
  expect(directoryMatches(coin('a',{category:'Research'}),{...directoryDefaults,category:'Research',role:'Researcher'},models)).toBe(true);
  expect(directoryMatches(coin('a',{category:'Data'}),{...directoryDefaults,category:'Research'},models)).toBe(false);
 });
 it('never labels paused, failed, depleted or retired Coins active',()=>{
  expect(coinDirectoryStatus(coin('paused',{paused:true}))).toBe('Paused');expect(coinDirectoryStatus(coin('error',{health:'ERROR'}))).toBe('Needs attention');
  expect(coinDirectoryStatus(coin('empty',{metrics:{lifecycle:'LOW COMPUTE'} as Agent['metrics']}))).toBe('Needs funding');
  expect(coinDirectoryStatus(coin('retired',{terminated_at:'now'}))).toBe('Retired');
 });
 it('uses real revenue/jobs/market observations and stable ties without mutating source order',()=>{
  const a=coin('a'),b=coin('b',{metrics:{revenue7d:20,jobs7d:1} as Agent['metrics']}),c=coin('c',{market:{marketCap:100} as Agent['market']}),source=[a,b,c];
  expect(sortDirectory(source,'Revenue').map(a=>a.id)).toEqual(['b','a','c']);expect(sortDirectory(source,'Most Productive')[0]).toBe(a);expect(sortDirectory(source,'Market Cap')[0]).toBe(c);expect(source).toEqual([a,b,c]);
  expect(sortDirectory([a,coin('s',{metrics:{lifecycle:'SELF-SUSTAINING',revenue7d:1} as Agent['metrics']})],'Featured')[0].id).toBe('s');
 });
 it('uses only reviewed provider mappings; unmatched models do not join a provider facet',()=>{
  expect(models.map(providerName)).toEqual(['OpenAI','Development']);expect(directoryMatches(coin('unknown',{config:{brain:'unreviewed/model'} as Agent['config']}),{...directoryDefaults,provider:'OpenAI'},models)).toBe(false);
 });
});
