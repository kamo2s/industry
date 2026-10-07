import { OnlinePumpSdk,getBuyTokenAmountFromSolAmount } from '@pump-fun/pump-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import type { Connection } from '@solana/web3.js';
import { ensure } from '../core';
import type { InitialBuyTerms } from './adapter';

export async function quoteInitialBuy(rpc:Connection,sol=0):Promise<InitialBuyTerms|undefined>{
 ensure(Number.isFinite(sol)&&sol>=0&&sol<=100&&Math.abs(Math.round(sol*1e9)/1e9-sol)<1e-12,'PUMP_BUY_AMOUNT','Enter an initial buy between 0 and 100 SOL, with at most nine decimal places.');
 if(sol===0)return undefined;
 const sdk=new OnlinePumpSdk(rpc),[global,feeConfig]=await Promise.all([sdk.fetchGlobal(),sdk.fetchFeeConfig()]);
 const lamports=String(Math.round(sol*1e9));
 const amount=getBuyTokenAmountFromSolAmount({global,feeConfig,mintSupply:null,bondingCurve:null,amount:new BN(lamports),quoteMint:NATIVE_MINT});
 ensure(amount.gtn(0),'PUMP_BUY_AMOUNT','The initial buy is too small to receive tokens.');
 return {lamports,tokenAmount:amount.toString(),feeRecipient:global.feeRecipient.toBase58(),buybackFeeRecipient:global.buybackFeeRecipients[0].toBase58()};
}

/** Compact, reversible UUID metadata reference; existing UUID URLs still work. */
export function metadataReference(id:string){return Buffer.from(id.replaceAll('-',''),'hex').toString('base64url');}
export function metadataLaunchId(ref:string){
 if(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(ref))return ref;
 ensure(/^[A-Za-z0-9_-]{22}$/.test(ref),'NOT_FOUND','Metadata not found',404);
 const bytes=Buffer.from(ref,'base64url');ensure(bytes.length===16&&bytes.toString('base64url')===ref,'NOT_FOUND','Metadata not found',404);
 const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
