import { beforeAll,afterAll,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { defaultFeePolicy,feePolicySchema,splitFeeReceipt } from '../packages/core/fee-policy';
import { database,migrate,one,type Database } from '../packages/db/connection';
import { Domain } from '../packages/db/domain';
import { account,transfer } from '../packages/db/journal';
import { seed } from '../packages/db/seed';
import { feePolicy,allocateDevelopmentFee } from '../packages/db/fee-policy';
import { ingestPumpReceipt,convertPumpReceipt,allocatePumpReceipt,pumpFinancials } from '../packages/db/pump-accounting';
import { SOL_USD_FEED,type PriceProof } from '../packages/pump/pricing';
import { receiptUnit } from '../packages/pump/receipts';
const M=1000000n,sol='So11111111111111111111111111111111111111112';
const time=Math.floor(Date.now()/1000)-20;
const proof:PriceProof={feedId:SOL_USD_FEED,price:'100000000',exponent:-8,confidence:'1000',publishTime:time,source:'https://hermes.pyth.network',retrievedAt:time+15,responseHash:'a'.repeat(64)};
const cases=[
 ['Bootstrap $10',0,10,6,4,0,['BOOTSTRAP']],
 ['Growth $50',20,50,20,30,0,['GROWTH']],
 ['Established $20',100,20,4,13,3,['ESTABLISHED']],
 ['cross $20',15,10,5,5,0,['BOOTSTRAP','GROWTH']],
 ['cross $100',95,20,5,12.75,2.25,['GROWTH','ESTABLISHED']],
 ['cross both',0,150,54,88.5,7.5,['BOOTSTRAP','GROWTH','ESTABLISHED']],
] as const;
it.each(cases)('splits %s in exact micro-USD',(_name,previous,amount,compute,operating,platform,phases)=>{
 const a=splitFeeReceipt(BigInt(previous)*M,BigInt(amount)*M,defaultFeePolicy);
 expect([a.compute,a.operating,a.platform]).toEqual([compute,operating,platform].map(n=>String(Math.round(n*1e6))));
 expect(a.segments.map(s=>s.phase)).toEqual(phases);
 expect(BigInt(a.compute)+BigInt(a.operating)+BigInt(a.platform)).toBe(BigInt(amount)*M);
});
it('never gives pre-Established dust to platform and conserves every segment',()=>{
 for(const previous of [0n,20n*M-2n,20n*M,100n*M-2n,100n*M,9007199254740993n])for(let amount=1n;amount<121n;amount++){
  const a=splitFeeReceipt(previous,amount,defaultFeePolicy);
  expect(BigInt(a.compute)+BigInt(a.operating)+BigInt(a.platform)).toBe(amount);
  for(const s of a.segments){expect(BigInt(s.compute)+BigInt(s.operating)+BigInt(s.platform)).toBe(BigInt(s.amountMicroUsd));if(s.phase!=='ESTABLISHED')expect(s.platform).toBe('0');else expect(BigInt(s.platform)).toBe(BigInt(s.amountMicroUsd)*15n/100n);}
 }
 expect(splitFeeReceipt(0n,1n,defaultFeePolicy).operating).toBe('1');
});
it('validates exact configurable shares and micro-dollar thresholds',()=>{
 for(const changes of [{platform_share:.000000000001},{compute_share:.6000000000001},{threshold:.0000001}])expect(feePolicySchema.safeParse({phases:{...defaultFeePolicy.phases,BOOTSTRAP:{...defaultFeePolicy.phases.BOOTSTRAP,...changes}}}).success).toBe(false);
 const p=structuredClone(defaultFeePolicy);p.phases.BOOTSTRAP={threshold:0,compute_share:1,operating_share:0,platform_share:0};expect(splitFeeReceipt(0n,1n,p)).toMatchObject({compute:'1',operating:'0',platform:'0'});
});
let db:Database,businesses:string[],serial=0;
beforeAll(async()=>{
 process.env.APP_MODE='demo';process.env.WALLET_ENCRYPTION_KEY='a'.repeat(64);db=await database(true);await migrate(db);await seed(db);
 const original=(await one(db,'SELECT * FROM agents LIMIT 1'))!,owner=(await one(db,'SELECT * FROM profiles WHERE id=$1',[original.creator_profile_id]))!;
 for(let i=0;i<3;i++)await db.transaction(tx=>new Domain(db).create(tx,owner,{...original.config,name:'Fee fixture '+i,ticker:'FEE'+i,initialBudget:0,initialOperatingBudget:0}));
 const agents=(await db.query('SELECT * FROM agents ORDER BY id LIMIT 8')).rows;businesses=agents.map(a=>a.business_id);
 for(const a of agents){const launch=randomUUID();await db.query("INSERT INTO pump_launches(id,business_id,profile_id,idempotency_key,fingerprint,config,network,mint,creator,treasury,metadata_uri,status) VALUES($1,$2,$3,$4,'fixture','{}','devnet',$5,'fixture-creator','fixture-treasury','https://example.test/token','verified')",[launch,a.business_id,a.creator_profile_id,randomUUID(),a.business_id]);
 await db.query("INSERT INTO pump_businesses(business_id,launch_id,network,mint,creator,treasury,sharing_config,quote_mint,quote_decimals,quote_token_program,routing_status,routing_evidence,launch_slot) VALUES($1::uuid,$2,'devnet',$1::uuid::text,'fixture-creator','fixture-treasury',$1::uuid::text,$3,9,'fixture-token','VERIFIED','{}',100)",[a.business_id,launch,sol]);}
});
afterAll(async()=>{await db.close();});
async function receipt(business:string,amount:bigint){serial++;return db.transaction(tx=>ingestPumpReceipt(tx,{businessId:business,network:'devnet',mint:business,sharingConfig:business,signature:'economics-'+serial,instructionIndex:1,eventIndex:0,slot:100+serial,blockTime:time,quoteMint:sol,quoteDecimals:9,rawAmount:(amount*1000n).toString(),normalizedAmount:(Number(amount)/1e6).toFixed(9),treasury:'fixture-treasury',operation:'distribute_creator_fees_v2',confirmation:'finalized',key:randomUUID(),evidence:{fixture:true}}));}
it.each(cases)('posts balanced, idempotent Pump allocations: %s',async(name,previous,amount,compute,operating,platform,phases)=>{
 const business=businesses[cases.findIndex(c=>c[0]===name)];
 // Unrelated test funding must never advance the Pump phase, even in TEST_USDC.
 await db.transaction(tx=>allocateDevelopmentFee(tx,business,500e6,randomUUID()));
 if(previous){const prior=await receipt(business,BigInt(previous)*M);await db.transaction(tx=>convertPumpReceipt(tx,prior.id,proof));}
 const r=await receipt(business,BigInt(amount)*M);
 const custody=(await one(db,'SELECT balance FROM ledger_accounts WHERE unit=$1 AND kind=$2',[receiptUnit('devnet',sol),'TREASURY_CLEARING']))!.balance;
 await db.transaction(tx=>convertPumpReceipt(tx,r.id,proof));
 const snapshot=await one(db,'SELECT * FROM pump_receipts WHERE id=$1',[r.id]);
 const journal=(await db.query("SELECT * FROM ledger_transactions WHERE reference_type='pump-fee-allocation' AND reference_id=$1 ORDER BY id",[r.id])).rows;
 const posted=(await db.query("SELECT a.kind,t.amount::text FROM ledger_transactions t JOIN ledger_accounts a ON a.id=t.credit_account WHERE t.reference_type='pump-fee-allocation' AND t.reference_id=$1",[r.id])).rows;
 const amounts=Object.fromEntries(posted.map(p=>[p.kind,p.amount]));
 expect(['BUSINESS_COMPUTE','BUSINESS_OPERATING','PLATFORM_REVENUE'].map(k=>amounts[k]||'0')).toEqual([compute,operating,platform].map(n=>String(n*1e6)));
 const saved=(await one(db,'SELECT * FROM treasury_fee_receipts WHERE reference=$1',['pump:'+r.id]))!;
 expect(saved.evidence.allocation).toMatchObject({previousMicroUsd:String(previous*1e6),compute:String(compute*1e6),operating:String(operating*1e6),platform:String(platform*1e6)});
 expect(saved.evidence.allocation.segments.map((s:any)=>s.phase)).toEqual(phases);
 // A later policy change and duplicate receipt cannot rewrite history or price.
 await db.query("INSERT INTO system_settings(key,value) VALUES('fee_allocation_policy',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify({...defaultFeePolicy,phases:{...defaultFeePolicy.phases,ESTABLISHED:{threshold:100,compute_share:.1,operating_share:.8,platform_share:.1}}})]);
 await db.transaction(tx=>convertPumpReceipt(tx,r.id,{...proof,price:'200000000'}));
 expect(await one(db,'SELECT * FROM pump_receipts WHERE id=$1',[r.id])).toEqual(snapshot);
 expect(await one(db,'SELECT * FROM treasury_fee_receipts WHERE reference=$1',['pump:'+r.id])).toEqual(saved);
 expect((await db.query("SELECT * FROM ledger_transactions WHERE reference_type='pump-fee-allocation' AND reference_id=$1 ORDER BY id",[r.id])).rows).toEqual(journal);
 expect((await one(db,'SELECT balance FROM ledger_accounts WHERE unit=$1 AND kind=$2',[receiptUnit('devnet',sol),'TREASURY_CLEARING']))!.balance).toEqual(custody);
 await db.query("DELETE FROM system_settings WHERE key='fee_allocation_policy'");
 const financials=(await pumpFinancials(db,business))[0];expect(financials.cumulativeCreatorFeesUsd).toBe((previous+amount).toFixed(6));expect(financials.receipts[0].allocation).toEqual(saved.evidence.allocation);
 expect((await db.query("SELECT t.id FROM ledger_transactions t LEFT JOIN ledger_postings p ON p.transaction_id=t.id GROUP BY t.id HAVING count(p.*)<>2 OR sum(CASE p.direction WHEN 'credit' THEN p.amount ELSE -p.amount END)<>0")).rows).toEqual([]);
});
it('counts earlier confirmed priced receipts awaiting allocation, not unpriced native receipts',async()=>{
 const b=businesses[6],a=await receipt(b,95n*M),unpriced=await receipt(b,500n*M);
 await db.query("UPDATE pump_receipts SET price_proof=$2,usd_value=95000000,usd_unit='TEST_USDC',converted_at=clock_timestamp(),allocation_status='AWAITING_POLICY' WHERE id=$1",[a.id,JSON.stringify(proof)]);
 const next=await receipt(b,20n*M);await db.transaction(tx=>convertPumpReceipt(tx,next.id,proof));
 const details=(await one(db,'SELECT evidence FROM treasury_fee_receipts WHERE reference=$1',['pump:'+next.id]))!.evidence.allocation;
 expect(details).toMatchObject({previousMicroUsd:'95000000',platform:'2250000'});
 await db.transaction(tx=>allocatePumpReceipt(tx,a.id));
 expect((await one(db,'SELECT evidence FROM treasury_fee_receipts WHERE reference=$1',['pump:'+a.id]))!.evidence.allocation).toMatchObject({previousMicroUsd:'0',platform:'0'});
 expect((await one(db,'SELECT allocation_status FROM pump_receipts WHERE id=$1',[unpriced.id]))!.allocation_status).toBe('PENDING_CONVERSION');
 expect((await feePolicy(db)).source).toBe('v1-default');
});
it('preserves legacy allocated receipts without segment metadata under the new defaults',async()=>{
 const b=businesses[7],r=await receipt(b,10n*M),legacy=structuredClone(defaultFeePolicy);
 legacy.phases.BOOTSTRAP={threshold:0,compute_share:.5,operating_share:.4,platform_share:.1};
 await db.transaction(async tx=>{
  await tx.query("UPDATE pump_receipts SET price_proof=$2,usd_value=10000000,usd_unit='TEST_USDC',converted_at=now(),policy=$3,phase='BOOTSTRAP',allocation_status='ALLOCATED',allocated_at=now() WHERE id=$1",[r.id,JSON.stringify(proof),JSON.stringify(legacy)]);
  await tx.query("INSERT INTO treasury_fee_receipts(business_id,provider,network,reference,amount,unit,policy,phase,evidence) VALUES($1,'pump.fun','devnet',$2,10000000,'TEST_USDC',$3,'BOOTSTRAP',$4)",[b,'pump:'+r.id,JSON.stringify(legacy),JSON.stringify({receiptId:r.id,price:proof,physicalSwap:false})]);
  for(const [kind,amount] of [['BUSINESS_COMPUTE',5000000],['BUSINESS_OPERATING',4000000],['PLATFORM_REVENUE',1000000]] as const)await transfer(tx,{key:`pump-allocation:${r.id}:${kind}`,debit:await account(tx,'TREASURY_CLEARING'),credit:await account(tx,kind,kind==='PLATFORM_REVENUE'?undefined:{businessId:b}),amount,type:'pump-fee-allocation',reference:r.id,businessId:b,metadata:{phase:'BOOTSTRAP',receipt:r.id,accountingConversion:true,physicalSwap:false,price:proof}});
 });
 const snapshot=await one(db,'SELECT * FROM pump_receipts WHERE id=$1',[r.id]),legacyFee=await one(db,'SELECT * FROM treasury_fee_receipts WHERE reference=$1',['pump:'+r.id]);
 const journal=(await db.query('SELECT * FROM ledger_transactions WHERE reference_id=$1 ORDER BY id',[r.id])).rows;
 await db.transaction(tx=>convertPumpReceipt(tx,r.id,proof));await db.transaction(tx=>allocatePumpReceipt(tx,r.id));
 expect(await one(db,'SELECT * FROM pump_receipts WHERE id=$1',[r.id])).toEqual(snapshot);
 expect(await one(db,'SELECT * FROM treasury_fee_receipts WHERE reference=$1',['pump:'+r.id])).toEqual(legacyFee);
 expect((await db.query('SELECT * FROM ledger_transactions WHERE reference_id=$1 ORDER BY id',[r.id])).rows).toEqual(journal);
 expect((await pumpFinancials(db,b))[0].receipts[0]).toMatchObject({allocation:null,policy:legacy,phase:'BOOTSTRAP'});
});
