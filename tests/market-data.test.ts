import {beforeAll,afterAll,it,expect} from 'vitest';import {Keypair} from '@solana/web3.js';import {bondingCurvePda} from '@pump-fun/pump-sdk';
import {dexObservation,curveValuation,oraclePrice,exchangePrice} from '../packages/market/data';import {SOL_USD_FEED} from '../packages/pump/pricing';import {refreshMarkets} from '../packages/market/refresh';import {database,migrate,one,type Database} from '../packages/db/connection';import {seed} from '../packages/db/seed';import {Domain} from '../packages/db/domain';
const mint=Keypair.generate().publicKey,curve=bondingCurvePda(mint).toBase58(),pair={chainId:'solana',dexId:'pumpfun',pairAddress:curve,baseToken:{address:mint.toBase58()},priceUsd:'0.000003',marketCap:3000,volume:{h24:12},priceChange:{h24:-1}};
it('matches exact mint/chain/curve, deduplicates pools and never treats FDV or missing volume as market cap/zero',()=>{
 expect(dexObservation([pair,pair,{...pair,chainId:'ethereum'},{...pair,pairAddress:Keypair.generate().publicKey.toBase58()}],mint.toBase58())).toMatchObject({marketCap:3000,volume24h:12});
 expect(dexObservation([{...pair,marketCap:null,fdv:4000,volume:{}}],mint.toBase58())).toMatchObject({marketCap:null,volume24h:null});
 expect(dexObservation([{...pair,volume:{h24:0}}],mint.toBase58())?.volume24h).toBe(0);
 expect(dexObservation([{...pair,baseToken:{address:Keypair.generate().publicKey.toBase58()}}],mint.toBase58())).toBeNull();
});
it('sums distinct indexed pool volumes but does not sum market caps',()=>{expect(dexObservation([pair,{...pair,dexId:'pumpswap',pairAddress:Keypair.generate().publicKey.toBase58(),marketCap:3100,liquidity:{usd:500},volume:{h24:30}}],mint.toBase58())).toMatchObject({marketCap:3100,volume24h:42});});
it('computes SOL curve valuation with raw units and rejects stale/uncertain oracle data',()=>{
 const value=curveValuation(30_000_000_000n,1_000_000_000_000_000n,1_000_000_000_000_000n,6,100);expect(value.price).toBeCloseTo(.000003,12);expect(value.marketCap).toBeCloseTo(3000,6);
 const raw={parsed:[{id:SOL_USD_FEED,price:{price:'10000000000',conf:'1000000',expo:-8,publish_time:1000}}]};expect(oraclePrice(raw,1010)).toBe(100);expect(()=>oraclePrice(raw,1100)).toThrow();raw.parsed[0].price.conf='1000000000';expect(()=>oraclePrice(raw,1010)).toThrow();
});
let db:Database,id:string,agentId:string;
beforeAll(async()=>{process.env.APP_MODE='demo';db=await database(true);await migrate(db);await seed(db);const a=(await one(db,'SELECT * FROM agents LIMIT 1'))!;id=(await one(db,"INSERT INTO solana_tokens(mint,network,name,symbol,decimals,official) VALUES($1,'mainnet-beta','Market test','MKT',6,true) RETURNING id",[mint.toBase58()]))!.id;const b=(await one(db,"INSERT INTO businesses(creator_profile_id,mode,mandate) VALUES($1,'MAINNET_TOKEN','test') RETURNING id",[a.creator_profile_id]))!;agentId=(await one(db,"INSERT INTO agents(business_id,creator_profile_id,token_id,slug,name,description,mission,job_type,category,config) VALUES($1,$2,$3,'market-test','Market test','test','test','Researcher','Research',$4) RETURNING id",[b.id,a.creator_profile_id,id,JSON.stringify(a.config)]))!.id;});afterAll(()=>db.close());
it('refreshes only real tokens, prevents duplicate claims, preserves nulls and hides stale observations',async()=>{
 let calls=0;const read=async(address:string)=>{expect(address).toBe(mint.toBase58());calls++;return {...dexObservation([pair],address)!,volume24h:null};};
 await Promise.all([refreshMarkets(db,read),refreshMarkets(db,read)]);expect(calls).toBe(1);
 const domain=new Domain(db);expect((await domain.dispatch('agents/get',{id:agentId})).agent.market).toMatchObject({marketCap:3000,volume24h:null});
 await db.query("UPDATE market_snapshots SET observed_at=now()-interval '11 minutes' WHERE token_id=$1",[id]);expect((await domain.dispatch('agents/get',{id:agentId})).agent.market).toBeNull();
 await db.query("UPDATE market_refresh_state SET next_attempt_at=now()-interval '1 minute' WHERE token_id=$1",[id]);expect(await refreshMarkets(db,async()=>{throw Error('offline');})).toMatchObject({updated:0,unavailable:1});expect((await one(db,'SELECT status FROM market_refresh_state WHERE token_id=$1',[id]))!.status).toBe('unavailable');
});

it('rejects missing or stale exchange timestamps for display valuation',()=>{expect(exchangePrice({price:'100',time:'2026-10-07T00:00:00Z'},Date.parse('2026-10-07T00:00:10Z'))).toBe(100);expect(()=>exchangePrice({price:'100',time:'2026-10-07T00:00:00Z'},Date.parse('2026-10-07T00:02:00Z'))).toThrow();expect(()=>exchangePrice({price:'100'})).toThrow();});
