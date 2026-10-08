import { createHash } from 'node:crypto';
import { NATIVE_MINT } from '@solana/spl-token';
import { ensure } from '../core';
export const SOL_USD_FEED='ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
export const COINBASE_CANDLES='https://api.exchange.coinbase.com/products/SOL-USD/candles';
type Candle={start:number;end:number;open:string;high:string;low:string;close:string;volume:number};
export type PriceProof={feedId:string;price:string;exponent:number;confidence?:string;publishTime:number;source:string;retrievedAt:number;responseHash:string;method?:'coinbase-1m-close';candle?:Candle};
const sources=['https://pyth.dourolabs.app/hermes','https://hermes.pyth.network'];
const integer=(s:unknown):s is string=>typeof s==='string'&&/^\d{1,30}$/.test(s);
export function validatePrice(p:PriceProof,receiptTime:number,now=Math.floor(Date.now()/1000)){
 ensure(integer(p.price)&&BigInt(p.price)>0n&&Number.isInteger(p.exponent)&&p.exponent>=-18&&p.exponent<=6,'PRICE_INVALID','Invalid USD price');
 ensure(Number.isSafeInteger(receiptTime)&&receiptTime>0&&Number.isSafeInteger(p.retrievedAt)&&p.retrievedAt<=now+5,'PRICE_STALE','Invalid pricing time');
 ensure(/^[a-f0-9]{64}$/.test(p.responseHash),'PRICE_EVIDENCE','Missing price response hash');
 if(p.source===COINBASE_CANDLES){
  const c=p.candle;
  ensure(p.feedId==='SOL-USD'&&p.method==='coinbase-1m-close'&&p.exponent===-8&&c,'PRICE_SOURCE','Expected Coinbase SOL/USD one-minute candle');
  ensure(c.start===Math.floor(receiptTime/60)*60&&c.end===c.start+60&&p.publishTime===c.end&&c.end<=p.retrievedAt&&c.end<=now,'PRICE_STALE','Receipt candle is missing or not closed');
  ensure([c.open,c.high,c.low,c.close].every(integer)&&[c.open,c.high,c.low,c.close].every(x=>BigInt(x)>0n)&&Number.isFinite(c.volume)&&c.volume>0,'PRICE_INVALID','Invalid candle values');
  const low=BigInt(c.low),high=BigInt(c.high);
  ensure(low<=BigInt(c.open)&&low<=BigInt(c.close)&&high>=BigInt(c.open)&&high>=BigInt(c.close)&&c.close===p.price,'PRICE_INVALID','Inconsistent candle values');
  ensure((high-low)*100n<=low*5n,'PRICE_UNCERTAIN','Receipt minute price range exceeds 5%; valuation remains pending');
 }else{
  // Retain validation of already stored Pyth evidence; new receipts use Coinbase.
  ensure(p.feedId===SOL_USD_FEED&&sources.includes(p.source),'PRICE_SOURCE','Expected an approved SOL/USD source');
  ensure(integer(p.confidence),'PRICE_INVALID','Invalid oracle confidence');
  ensure(Number.isInteger(p.publishTime)&&p.publishTime>=receiptTime&&p.publishTime-receiptTime<=60&&p.publishTime<=now+5,'PRICE_STALE','No oracle observation within 60 seconds of the receipt');
  ensure(BigInt(p.confidence)*100n<=BigInt(p.price),'PRICE_UNCERTAIN','Oracle confidence interval exceeds 1%');
 }
 return p;
}
export function usdMicros(raw:string,decimals:number,p:PriceProof){
 ensure(/^\d+$/.test(raw)&&Number.isInteger(decimals)&&decimals>=0&&decimals<=18,'PRICE_AMOUNT','Invalid raw asset amount');
 const shift=p.exponent+6-decimals,n=BigInt(raw)*BigInt(p.price),value=shift>=0?n*10n**BigInt(shift):n/10n**BigInt(-shift);
 ensure(value<=9223372036854775807n,'PRICE_AMOUNT','Valuation exceeds ledger capacity');return value;
}
function priceUnits(n:unknown){
 ensure(typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=10000000,'PRICE_INVALID','Invalid candle price');
 return BigInt(n.toFixed(8).replace('.','')).toString();
}
// Free public exchange data, not an oracle or execution quote. Use the CLOSE of
// the finalized one-minute candle containing the receipt, never today's price.
// Persist the full candle, method, retrieval time and response hash for audit.
export async function receiptPrice(quoteMint:string,receiptTime:number,request:typeof fetch=fetch):Promise<PriceProof>{
 ensure(quoteMint===NATIVE_MINT.toBase58(),'PRICE_ASSET_UNSUPPORTED','This asset has no approved USD price source; receipt remains pending');
 const now=Math.floor(Date.now()/1000),start=Math.floor(receiptTime/60)*60,end=start+60;
 ensure(Number.isSafeInteger(receiptTime)&&receiptTime>0&&end<=now,'PRICE_STALE','Receipt candle is not closed; retry pricing later');
 const url=new URL(COINBASE_CANDLES);url.searchParams.set('granularity','60');url.searchParams.set('start',new Date(start*1000).toISOString());url.searchParams.set('end',new Date(end*1000).toISOString());
 const response=await request(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
 ensure(response.ok,'PRICE_UNAVAILABLE','Historical SOL/USD pricing unavailable; retry later',503);
 const raw=await response.text();ensure(raw.length<250000,'PRICE_INVALID','Price response exceeds limit');const data=JSON.parse(raw);
 ensure(Array.isArray(data),'PRICE_INVALID','Invalid candle response');const matches=data.filter((r:unknown)=>Array.isArray(r)&&r[0]===start);
 ensure(matches.length===1,'PRICE_UNAVAILABLE','Receipt minute candle unavailable; retry later',503);
 const row=matches[0];ensure(row.length===6,'PRICE_INVALID','Invalid candle shape');
 const candle={start,end,low:priceUnits(row[1]),high:priceUnits(row[2]),open:priceUnits(row[3]),close:priceUnits(row[4]),volume:row[5]};
 return validatePrice({feedId:'SOL-USD',price:candle.close,exponent:-8,publishTime:end,source:COINBASE_CANDLES,retrievedAt:Math.floor(Date.now()/1000),responseHash:createHash('sha256').update(raw).digest('hex'),method:'coinbase-1m-close',candle},receiptTime);
}
