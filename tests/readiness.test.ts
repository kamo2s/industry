import {it,expect,vi,afterEach} from 'vitest';
import {readinessConfiguration} from '../packages/db/system-health';
afterEach(()=>vi.unstubAllEnvs());
it('covers every release subsystem without exposing secrets or calling configuration live proof',()=>{
 vi.stubEnv('APP_ENV','local');vi.stubEnv('OPENAI_API_KEY','never-print-this-fixture-value');vi.stubEnv('WORKER_API_SECRET','');vi.stubEnv('PUMP_LAUNCH_ENABLED','false');vi.stubEnv('PUMP_FEE_COLLECTION_ENABLED','false');
 const items=readinessConfiguration(),names=items.map(i=>i.name);
 for(const n of ['WEB','DATABASE','WORKER','SCHEDULER','OPENROUTER','SEARCH','STORAGE','PUMP','TREASURY','COLLECTOR','METADATA','ALT','RECEIPT PRICING','ADMIN','BACKUPS','RATE LIMITS','PROVIDER CAP','CI'])expect(names).toContain(n);
 expect(JSON.stringify(items)).not.toContain('never-print-this-fixture-value');
 expect(items.find(i=>i.name==='PUMP')?.status).toBe('DISABLED');expect(items.find(i=>i.name==='RECEIPT PRICING')?.status).toBe('READY');
 expect(items.find(i=>i.name==='SCHEDULER')?.status).not.toBe('READY');
});

