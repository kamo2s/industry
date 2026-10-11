import {describe,it,expect,vi,afterEach} from 'vitest';
import {monitorStatus} from '../packages/db/monitor';
import {GET} from '../apps/web/app/api/ops/health/route';
const state=vi.hoisted(()=>({alerts:[] as string[],processes:[] as {kind:string,heartbeat_at:string,state:string}[]}));
vi.mock('../packages/db/system-health',()=>({systemHealth:async()=>state}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();state.alerts=[];state.processes=[];});
describe('external read-only monitoring',()=>{
 it('detects per-business collection failure and delayed conversions even with a healthy process',async()=>{
  vi.stubEnv('MARKET_DATA_ENABLED','false');
  const r=await monitorStatus({query:async()=>({rows:[{collector_errors:1,pending_conversions:1,recent_failures:0}]})} as any);
  expect(r.healthy).toBe(false);expect(r.alerts).toContain('PUMP_BUSINESS_COLLECTION_ERROR');expect(r.alerts).toContain('PUMP_CONVERSION_DELAYED');
 });
 it('distinguishes historical failures from current faults',async()=>{
  vi.stubEnv('MARKET_DATA_ENABLED','false');state.alerts=['DEAD_LETTERS'];
  const r=await monitorStatus({query:async()=>({rows:[{collector_errors:0,pending_conversions:0,recent_failures:0}]})} as any);
  expect(r.healthy).toBe(true);expect(r.warnings).toContain('DEAD_LETTERS');
 });
 it('rejects an anonymous monitor request before contacting the database',async()=>{
  vi.stubEnv('MONITOR_API_SECRET','x'.repeat(40));const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  expect((await GET(new Request('https://industrypad.fun/api/ops/health'))).status).toBe(401);expect(fetch).not.toHaveBeenCalled();
 });
 it('reports backend failure without exposing internal errors or credentials',async()=>{
  const key='x'.repeat(40);vi.stubEnv('MONITOR_API_SECRET',key);vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('sensitive upstream error')));
  const r=await GET(new Request('https://industrypad.fun/api/ops/health',{headers:{authorization:'Bearer '+key}}));
  expect(r.status).toBe(503);expect(await r.json()).toEqual({healthy:false,alerts:['DATABASE_UNAVAILABLE']});
 });
});
