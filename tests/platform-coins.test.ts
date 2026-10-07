import {platformOperatorIdentity} from '../packages/db/platform-authority';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database,migrate,one,type Database,type Row} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {provisionPlatformCoins,activatePlatformCoins} from '../packages/db/platform-coins';
import {platformCoins,platformCoinInput} from '../packages/core/platform-coins';
import {directoryMatches,directoryDefaults} from '../packages/core/coin-directory';
vi.mock('../packages/agent/catalog',()=>({validateBrain:vi.fn(),modelCatalog:async()=>({models:[]})}));
let db:Database,domain:Domain,profile:Row,coins:{id:string;slug:string;key:string}[],artwork:Record<string,Buffer>;
beforeAll(async()=>{
 vi.stubEnv('APP_ENV','production');vi.stubEnv('APP_MODE','live');vi.stubEnv('ADMIN_WALLETS','3SMiNGo3X9sRxPU3oVYDYowK2iBrj57MusbMJ73xnzTf');
 db=await database(true);await migrate(db);domain=new Domain(db);
 profile=(await one(db,'INSERT INTO profiles(primary_wallet,credits) VALUES($1,0) RETURNING *',[platformOperatorIdentity]))!;
 artwork=Object.fromEntries(await Promise.all(platformCoins.map(async c=>[c.key,await readFile(`assets/platform-coins/${c.key}.webp`)])));
},30000);
afterAll(async()=>{await db?.close();vi.unstubAllEnvs();});
describe('Real platform-operated businesses',()=>{
 it('does not permit public sandbox launches or spoofed operator input in production',async()=>{
  const input=platformCoinInput('atlas','');
  await expect(db.transaction(tx=>domain.create(tx,profile,input))).rejects.toThrow('verified token');
  await expect(provisionPlatformCoins(domain,{...profile,primary_wallet:'unapproved'},artwork)).rejects.toThrow('Internal platform owner');
  await expect(domain.publicDispatch('platform/provision',{})).rejects.toThrow();
 });
 it('provisions once, paused, with real artwork and explicit funding instead of earnings',async()=>{
  coins=await provisionPlatformCoins(domain,profile,artwork);
  expect(await provisionPlatformCoins(domain,profile,artwork)).toEqual(coins);
  expect(coins).toHaveLength(4);
  expect(Number((await one(db,"SELECT count(*) n FROM ledger_transactions WHERE reference_type='platform-sponsorship'"))!.n)).toBe(8);
  for(const c of coins){
   const a=(await domain.dispatch('agents/get',{id:c.id})).agent;
   expect(a.platform_operated).toBe(true);expect(a.token).toBeNull();expect(a.paused).toBe(true);
   expect(a.metrics.computeCredits).toBe(3);expect(a.metrics.operatingBalance).toBe(.25);
   expect(a.metrics.serviceRevenue7d).toBe(0);expect(a.metrics.externalPaidJobs).toBe(0);expect(a.metrics.pumpFunding7d).toBe(0);expect(a.metrics.jobs).toBe(0);
   expect(directoryMatches(a,{...directoryDefaults,network:'test'},[])).toBe(false);
   expect(directoryMatches(a,{...directoryDefaults,network:'platform'},[])).toBe(true);
   expect(a.icon_url).toMatch(/^\/api\/uploads\//);
  }
  expect((await domain.dispatch('services/list')).every((s:any)=>s.platform_operated)).toBe(true);
  expect((await domain.dispatch('activity')).every((e:any)=>e.platform_operated)).toBe(true);
 });
 it('activates the bounded cohort once without creating fake work or refilling balances',async()=>{
  await activatePlatformCoins(domain,profile);await activatePlatformCoins(domain,profile);
  expect(Number((await one(db,'SELECT count(*) n FROM jobs'))!.n)).toBe(4);
  expect(Number((await one(db,'SELECT count(*) n FROM agents WHERE paused=false'))!.n)).toBe(4);
  expect(Number((await one(db,"SELECT count(*) n FROM audit_logs WHERE action='platform-business-activated'"))!.n)).toBe(4);
  expect(Number((await one(db,"SELECT count(*) n FROM jobs WHERE status='succeeded'"))!.n)).toBe(0);
  await expect(db.query("UPDATE businesses SET mode='SANDBOX' WHERE id=$1",[coins[0].id])).rejects.toThrow('immutable');
 });
});
