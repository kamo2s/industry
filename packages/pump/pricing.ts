import { createHash } from 'node:crypto';
import { NATIVE_MINT } from '@solana/spl-token';
import { ensure } from '../core';
export const SOL_USD_FEED='ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
export type PriceProof={feedId:string;price:string;exponent:number;confidence:string;publishTime:number;source:string;retrievedAt:number;responseHash:string};
const sources=['https://pyth.dourolabs.app/hermes','https://hermes.pyth.network'];
export function validatePrice(p:PriceProof,receiptTime:number,now=Math.floor(Date.now()/1000)){
 ensure(p.feedId===SOL_USD_FEED&&sources.includes(p.source),'PRICE_SOURCE','Expected the trusted Pyth SOL/USD feed');
 ensure(/^\d{1,30}$/.test(p.price)&&/^\d{1,30}$/.test(p.confidence)&&BigInt(p.price)>0n&&Number.isInteger(p.exponent)&&p.exponent>=-18&&p.exponent<=6,'PRICE_INVALID','Invalid oracle price');
 ensure(Number.isInteger(receiptTime)&&Number.isInteger(p.publishTime)&&p.publishTime>=receiptTime&&p.publishTime-receiptTime<=60&&p.publishTime<=now+5,'PRICE_STALE','No oracle observation within 60 seconds of the receipt');
 ensure(BigInt(p.confidence)*100n<=BigInt(p.price),'PRICE_UNCERTAIN','Oracle confidence interval exceeds 1%');
 ensure(/^[a-f0-9]{64}$/.test(p.responseHash),'PRICE_EVIDENCE','Missing oracle response hash');return p;
}
export function usdMicros(raw:string,decimals:number,p:PriceProof){
 ensure(/^\d+$/.test(raw)&&Number.isInteger(decimals)&&decimals>=0&&decimals<=18,'PRICE_AMOUNT','Invalid raw asset amount');
 const shift=p.exponent+6-decimals,n=BigInt(raw)*BigInt(p.price),value=shift>=0?n*10n**BigInt(shift):n/10n**BigInt(-shift);
 ensure(value<=9223372036854775807n,'PRICE_AMOUNT','Valuation exceeds ledger capacity');return value;
}
// Read-only, receipt-time valuation. Historical retries use the same as-of time,
// never a later market price. This trusts the allowlisted HTTPS Hermes service;
// it does not claim that a price update has been verified by an on-chain program.
export async function receiptPrice(quoteMint:string,receiptTime:number,request:typeof fetch=fetch):Promise<PriceProof>{
 ensure(quoteMint===NATIVE_MINT.toBase58(),'PRICE_ASSET_UNSUPPORTED','This asset has no approved USD oracle; receipt remains pending');
 const source=process.env.PYTH_HERMES_URL||sources[0];ensure(sources.includes(source),'PRICE_SOURCE','Only reviewed Hermes HTTPS endpoints are supported');
 const url=new URL(`${source}/v2/updates/price/${receiptTime}`);url.searchParams.set('ids[]',SOL_USD_FEED);url.searchParams.set('parsed','true');
 const response=await request(url,{headers:process.env.PYTH_API_KEY?{Authorization:`Bearer ${process.env.PYTH_API_KEY}`}:{},redirect:'error',signal:AbortSignal.timeout(12000)});
 ensure(response.ok,'PRICE_UNAVAILABLE','Trusted oracle unavailable; retry pricing later',503);
 const raw=await response.text();ensure(raw.length<250000,'PRICE_INVALID','Oracle response exceeds limit');const data=JSON.parse(raw),row=data.parsed?.find((r:any)=>r.id?.replace(/^0x/,'')===SOL_USD_FEED);
 ensure(row?.price,'PRICE_UNAVAILABLE','Oracle did not return SOL/USD',503);
 return validatePrice({feedId:SOL_USD_FEED,price:row.price.price,exponent:row.price.expo,confidence:row.price.conf,publishTime:row.price.publish_time,source,retrievedAt:Math.floor(Date.now()/1000),responseHash:createHash('sha256').update(raw).digest('hex')},receiptTime);
}
