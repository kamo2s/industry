import {PublicKey} from '@solana/web3.js';
import {PUMP_SDK,PUMP_PROGRAM_ID,bondingCurvePda,normalizeQuoteMint} from '@pump-fun/pump-sdk';
import {NATIVE_MINT,unpackMint,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {pumpConnection,GENESIS} from '../pump/config';
import {SOL_USD_FEED} from '../pump/pricing';
export type MarketObservation={price:number|null;marketCap:number|null;volume24h:number|null;change24h:number|null;liquidity:number|null;source:string};
export const nonnegative=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
function price(v:unknown){return typeof v==='string'&&v.trim()?nonnegative(Number(v)):nonnegative(v);}
export function dexObservation(raw:unknown,mint:string):MarketObservation|null{
 if(!Array.isArray(raw))throw Error('Invalid market response');
 const curve=bondingCurvePda(new PublicKey(mint)).toBase58();
 const pairs=new Map<string,any>();
 for(const p of raw){if(p?.chainId!=='solana'||p.baseToken?.address!==mint||typeof p.pairAddress!=='string')continue;
  try{if(new PublicKey(p.pairAddress).toBase58()!==p.pairAddress)continue;}catch{continue;}
  if(p.dexId==='pumpfun'&&p.pairAddress!==curve)continue;
  if(!pairs.has(p.pairAddress))pairs.set(p.pairAddress,p);
 }
 const rows=[...pairs.values()].sort((a,b)=>(nonnegative(b.liquidity?.usd)||0)-(nonnegative(a.liquidity?.usd)||0)||(nonnegative(b.volume?.h24)||0)-(nonnegative(a.volume?.h24)||0)||a.pairAddress.localeCompare(b.pairAddress));
 if(!rows.length)return null;const p=rows[0],volumes=rows.map(r=>nonnegative(r.volume?.h24));
 return {price:price(p.priceUsd),marketCap:nonnegative(p.marketCap),volume24h:volumes.every(v=>v!==null)?volumes.reduce<number>((n,v)=>n+v!,0):null,change24h:typeof p.priceChange?.h24==='number'&&Number.isFinite(p.priceChange.h24)?p.priceChange.h24:null,liquidity:nonnegative(p.liquidity?.usd),source:`DEX Screener · ${p.dexId} · ${rows.length} indexed pool${rows.length===1?'':'s'}`};
}
async function json(url:string,headers?:Record<string,string>){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(8000),headers});if(!r.ok)throw Error('Market source unavailable');const text=await r.text();if(text.length>2000000)throw Error('Market response too large');return JSON.parse(text);}
export function oraclePrice(raw:any,now=Math.floor(Date.now()/1000)){
 const p=raw?.parsed?.find((r:any)=>r.id?.replace(/^0x/,'')===SOL_USD_FEED)?.price;
 if(!p||!/^\d+$/.test(p.price)||!/^\d+$/.test(p.conf)||!Number.isInteger(p.expo)||p.expo < -18||p.expo>6||!Number.isInteger(p.publish_time)||p.publish_time>now+5||now-p.publish_time>60||BigInt(p.price)<=0n||BigInt(p.conf)*100n>BigInt(p.price))throw Error('Untrusted or stale SOL price');
 return Number(p.price)*10**p.expo;
}
export function exchangePrice(raw:any,now=Date.now()){
 const value=price(raw?.price),at=Date.parse(raw?.time);if(value===null||value<=0||!Number.isFinite(at)||at>now+5000||now-at>60000)throw Error('Stale SOL ticker');return value;
}
// Display-only valuation. Fee receipt conversion continues to use its separate oracle policy.
export async function solPrice():Promise<{price:number;source:string}>{
 if(process.env.PYTH_API_KEY)try{const source=process.env.PYTH_HERMES_URL||'https://hermes.pyth.network';if(!['https://hermes.pyth.network','https://pyth.dourolabs.app/hermes'].includes(source))throw Error('Untrusted price endpoint');return {price:oraclePrice(await json(`${source}/v2/updates/price/latest?ids[]=${SOL_USD_FEED}`,{Authorization:`Bearer ${process.env.PYTH_API_KEY}`})),source:'Pyth SOL/USD'};}catch{}
 return {price:exchangePrice(await json('https://api.exchange.coinbase.com/products/SOL-USD/ticker')),source:'Coinbase SOL/USD'};
}
export function curveValuation(quote:bigint,tokens:bigint,supply:bigint,decimals:number,usd:number){
 if(quote<=0n||tokens<=0n||supply<=0n||decimals<0||decimals>18||!Number.isFinite(usd)||usd<=0)throw Error('Invalid curve valuation');
 const price=Number(quote)/Number(tokens)*10**decimals/1e9*usd,marketCap=price*Number(supply)/10**decimals;
 if(!Number.isFinite(marketCap)||!Number.isFinite(price))throw Error('Invalid valuation');return {price,marketCap};
}
export async function readMarket(mint:string,isPump:boolean):Promise<MarketObservation|null>{
 let observation:MarketObservation|null=null;try{observation=dexObservation(await json('https://api.dexscreener.com/token-pairs/v1/solana/'+new PublicKey(mint).toBase58()),mint);}catch{}
 if(isPump&&(observation?.marketCap==null||observation.price==null)&&process.env.PUMP_RPC_URL){try{
  const rpc=pumpConnection();if(await rpc.getGenesisHash()!==GENESIS['mainnet-beta'])throw Error('Wrong chain');
  const key=new PublicKey(mint),[curve,token]=await rpc.getMultipleAccountsInfo([bondingCurvePda(key),key],'finalized');
  if(!curve?.owner.equals(PUMP_PROGRAM_ID)||!token?.owner.equals(TOKEN_2022_PROGRAM_ID))throw Error('Wrong account owner');
  const c=PUMP_SDK.decodeBondingCurve(curve),m=unpackMint(key,token,TOKEN_2022_PROGRAM_ID);
  if(c.complete||!normalizeQuoteMint(c.quoteMint).equals(NATIVE_MINT))throw Error('Not an active SOL curve');
  const usd=await solPrice();const value=curveValuation(BigInt(c.virtualQuoteReserves.toString()),BigInt(c.virtualTokenReserves.toString()),m.supply,m.decimals,usd.price);
  observation={volume24h:null,change24h:null,liquidity:null,...observation,...value,source:`Pump bonding-curve valuation + ${usd.source}${observation?' · volume: '+observation.source:''}`};
 }catch{/* Preserve independently available indexed fields; never invent missing volume. */}}
 return observation&&[observation.price,observation.marketCap,observation.volume24h].some(v=>v!==null)?observation:null;
}

