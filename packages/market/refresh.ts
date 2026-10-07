import {type Database} from '../db/connection';
import {readMarket,type MarketObservation} from './data';
export async function refreshMarkets(db:Database,read:typeof readMarket=readMarket){
 await db.query(`INSERT INTO market_refresh_state(token_id) SELECT DISTINCT t.id FROM solana_tokens t JOIN agents a ON a.token_id=t.id WHERE t.network='mainnet-beta' AND t.official AND a.visibility='public' ON CONFLICT DO NOTHING`);
 const rows=await db.transaction(async tx=>(await tx.query(`WITH due AS (SELECT token_id FROM market_refresh_state WHERE next_attempt_at<=now() AND lease_until<=now() ORDER BY next_attempt_at,token_id LIMIT 3 FOR UPDATE SKIP LOCKED) UPDATE market_refresh_state s SET lease_until=now()+interval '3 minutes' FROM due WHERE s.token_id=due.token_id RETURNING s.token_id`)).rows);
 let updated=0,unavailable=0;
 for(const row of rows){let observation:MarketObservation|null=null;try{
  const token=(await db.query(`SELECT t.mint,EXISTS(SELECT 1 FROM pump_businesses p WHERE p.mint=t.mint AND p.network='mainnet-beta') pump FROM solana_tokens t JOIN agents a ON a.token_id=t.id WHERE t.id=$1 AND t.network='mainnet-beta' AND t.official AND a.visibility='public' LIMIT 1`,[row.token_id])).rows[0];
  if(token)observation=await read(token.mint,token.pump);
 }catch{/* A source outage must not block runtime or turn missing values into zero. */}
 await db.transaction(async tx=>{
  if(observation){await tx.query('INSERT INTO market_snapshots(token_id,source,price,market_cap,volume_24h,change_24h,liquidity) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.token_id,observation.source,observation.price,observation.marketCap,observation.volume24h,observation.change24h,observation.liquidity]);updated++;}else unavailable++;
  await tx.query(`UPDATE market_refresh_state SET lease_until=now(),next_attempt_at=now()+interval '2 minutes',last_success_at=CASE WHEN $2 THEN now() ELSE last_success_at END,status=$3 WHERE token_id=$1`,[row.token_id,!!observation,observation?'ready':'unavailable']);
 });}
 await db.query("DELETE FROM market_snapshots WHERE observed_at<now()-interval '7 days'");
 await db.query("INSERT INTO process_health(id,kind,state) VALUES('market-data','market-data',$1) ON CONFLICT(id) DO UPDATE SET heartbeat_at=now(),state=excluded.state",[unavailable?'degraded':'ready']);
 return {updated,unavailable};
}
