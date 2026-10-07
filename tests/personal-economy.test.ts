import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {database,migrate,type Database} from '../packages/db/connection';
import {seed} from '../packages/db/seed';
import {Domain} from '../packages/db/domain';
import {hash} from '../packages/core/security';
import {ledger} from '../packages/db/economy';
let db:Database,domain:Domain,owner:string,other:string,empty:string,token:string,otherToken:string,emptyToken:string,owned:any[];
beforeAll(async()=>{
 process.env.APP_MODE='demo';db=await database(true);await migrate(db);await seed(db);domain=new Domain(db);
 const agents=(await db.query('SELECT * FROM agents ORDER BY id')).rows;owner=agents[0].creator_profile_id;
 const makeProfile=async()=> (await db.query('INSERT INTO profiles(primary_wallet) VALUES($1) RETURNING id',[randomUUID()])).rows[0].id;
 other=await makeProfile();empty=await makeProfile();
 const otherId=randomUUID();
 await db.query("INSERT INTO businesses(id,creator_profile_id,mode,mandate) VALUES($1,$2,'SANDBOX','Owner isolation fixture')",[otherId,other]);
 await db.query("INSERT INTO agents(id,business_id,creator_profile_id,slug,name,description,mission,job_type,category,config) VALUES($1,$1,$2,'other-owner','Other owner','fixture','fixture','Researcher','Research',$3)",[otherId,other,JSON.stringify(agents[0].config)]);
 await ledger(db,otherId,'credit','revenue',99000000,randomUUID());
 // Creator view includes their private businesses as well as public ones.
 await db.query("UPDATE agents SET visibility='private' WHERE id=$1",[agents[0].id]);
 owned=(await db.query('SELECT * FROM agents WHERE creator_profile_id=$1',[owner])).rows;
 const session=async(id:string)=>{const token=randomUUID();await db.query("INSERT INTO sessions(profile_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[id,hash(token)]);return token;};
 token=await session(owner);otherToken=await session(other);emptyToken=await session(empty);
});
afterAll(()=>db.close());
it('requires a current authenticated session and returns actual zeros for a creator without Coins',async()=>{
 await expect(domain.publicDispatch('economy/personal')).rejects.toThrow('Connect your wallet');
 await expect(domain.publicDispatch('economy/personal',{},'invalid')).rejects.toThrow('Connect your wallet');
 const r=await domain.publicDispatch('economy/personal',{},emptyToken);expect(r).toMatchObject({coins:0,totals:{revenue:0,a2a:0,jobs:0,net:0}});expect(r.series).toHaveLength(30);expect(r.series.every((p:any)=>p.revenue===0&&p.a2a===0&&p.jobs===0)).toBe(true);
});
it('isolates creator totals, includes private Coins, and counts each settled Coin order only once',async()=>{
 const r=await domain.publicDispatch('economy/personal',{profileId:other,wallet:other},token);
 const ids=new Set(owned.map(a=>a.id)),businesses=new Set(owned.map(a=>a.business_id));
 const entries=(await db.query('SELECT l.*,t.unit FROM ledger_entries l JOIN ledger_transactions t ON t.id=l.transaction_id')).rows.filter(l=>businesses.has(l.business_id)&&l.unit===r.unit);
 const revenue=entries.filter(l=>l.category==='revenue'&&l.direction==='credit').reduce((s,l)=>s+Number(l.amount),0)/1e6;
 const costs=entries.filter(l=>['compute','tool','service_purchase','refund'].includes(l.category)).reduce((s,l)=>s+Number(l.amount)*(l.category==='refund'?-1:1),0)/1e6;
 const orders=(await db.query("SELECT p.id,p.amount,r.requester_agent_id,r.provider_agent_id FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.status='succeeded' AND p.status='settled'")).rows.filter(r=>r.requester_agent_id&&(ids.has(r.requester_agent_id)||ids.has(r.provider_agent_id)));
 const jobs=(await db.query("SELECT agent_id FROM jobs WHERE status='succeeded'")).rows.filter(j=>ids.has(j.agent_id)).length;
 expect(r.coins).toBe(owned.length);expect(revenue).toBeGreaterThan(0);expect(r.totals.revenue).toBeCloseTo(revenue,6);expect(r.totals.net).toBeCloseTo(revenue-costs,6);expect(r.totals.jobs).toBe(jobs);expect(r.totals.a2a).toBeCloseTo(orders.reduce((s,r)=>s+Number(r.amount),0)/1e6,6);
 expect((await domain.publicDispatch('economy/personal',{profileId:owner},otherToken)).coins).toBe(1);
 const globalBefore=await domain.dispatch('economy');await domain.publicDispatch('economy/personal',{},token);expect((await domain.dispatch('economy')).totals).toEqual(globalBefore.totals);
});
it('excludes funding and other units while refunds restore net income',async()=>{
 const before=await domain.publicDispatch('economy/personal',{},token),id=owned[0].id;
 await ledger(db,id,'credit','funding',1000000,randomUUID());
 await ledger(db,id,'credit','revenue',2000000,randomUUID(),{network:'devnet'});
 expect((await domain.publicDispatch('economy/personal',{},token)).totals).toEqual(before.totals);
 await ledger(db,id,'credit','refund',10000,randomUUID());
 const after=await domain.publicDispatch('economy/personal',{},token);expect(after.totals.revenue).toBe(before.totals.revenue);expect(after.totals.net).toBeCloseTo(before.totals.net+.01,6);
});
