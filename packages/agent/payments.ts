import { createHash } from 'node:crypto';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { x402Client } from '@x402/core/client';
import { ExactSvmScheme as ServerScheme } from '@x402/svm/exact/server';
import { ExactSvmScheme as ClientScheme } from '@x402/svm/exact/client';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentSignatureHeader, encodePaymentResponseHeader } from '@x402/core/http';
import type { PaymentPayload, PaymentRequirements, SettleResponse } from '@x402/core/types';
import { ensure, AppError } from '../core';
import { decryptSecret, safetyConfig } from '../core/security';
import { assertDevnet, rpcConnection, rpcUrl } from './solana';

export const DEVNET_CAIP='solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as const;
export const DEVNET_USDC='4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const x402Configured=()=>!!process.env.X402_FACILITATOR_URL&&process.env.AUTONOMOUS_PAYMENTS_ENABLED!=='false';
export class DisabledX402Provider {
  readonly name='x402';readonly enabled=false;
  async verifyAndSettle():Promise<never>{throw new AppError('X402_DISABLED','x402 settlement is not configured',503);}
}
export function transactionHash(payload:PaymentPayload) {
  ensure(payload.x402Version===2&&typeof payload.payload?.transaction==='string','INVALID_PAYMENT','A V2 Solana transaction is required');
  const bytes=Buffer.from(payload.payload.transaction,'base64');
  ensure(bytes.length<=1232,'INVALID_PAYMENT','Solana transaction exceeds wire limit');
  const tx=VersionedTransaction.deserialize(bytes);
  return createHash('sha256').update(tx.message.serialize()).digest('hex');
}
export function decodePayment(header:string):PaymentPayload {
  ensure(header.length<16000,'INVALID_PAYMENT','Payment header is too large');
  try{const payload=decodePaymentSignatureHeader(header);transactionHash(payload);return payload;}
  catch{throw new AppError('INVALID_PAYMENT','Payment signature header is invalid');}
}
export class X402Provider {
  private ready?:Promise<x402ResourceServer>;
  async server() {
    if(!this.ready)this.ready=this.initialize().catch(error=>{this.ready=undefined;throw error;});
    return this.ready;
  }
  private async initialize(){
    safetyConfig();ensure(x402Configured(),'X402_DISABLED','Configure a Solana devnet x402 V2 facilitator',503);
    const url=new URL(process.env.X402_FACILITATOR_URL!);
    ensure(url.protocol==='https:'&&!url.username&&!url.password,'FACILITATOR_CONFIG','Facilitator must use HTTPS',503);
    const client=new HTTPFacilitatorClient({url:url.href,timeoutMs:20000,createAuthHeaders:async()=>{
      const headers:Record<string,string>=process.env.X402_FACILITATOR_TOKEN?{Authorization:`Bearer ${process.env.X402_FACILITATOR_TOKEN}`} : {};
      return {verify:headers,settle:headers,supported:headers};
    }});
    const supported=await client.getSupported();
    ensure(supported.kinds.some(k=>k.x402Version===2&&k.network===DEVNET_CAIP&&k.scheme==='exact'),'FACILITATOR_NETWORK','Facilitator does not support exact Solana devnet V2 payments',503);
    const server=new x402ResourceServer(client).register(DEVNET_CAIP,new ServerScheme());await server.initialize();return server;
  }
  async requirements(payTo:string,amount:number,memo:string):Promise<PaymentRequirements>{
    ensure(Number.isSafeInteger(amount)&&amount>0,'INVALID_AMOUNT','Invalid USDC amount');
    const result=await (await this.server()).buildPaymentRequirements({scheme:'exact',network:DEVNET_CAIP,payTo,price:{amount:String(amount),asset:DEVNET_USDC,extra:{decimals:6}},maxTimeoutSeconds:300,extra:{memo}});
    ensure(result.length===1,'INVALID_REQUIREMENTS','Expected one exact devnet payment requirement',503);return result[0];
  }
  async challenge(requirements:PaymentRequirements,url:string){
    const required=await (await this.server()).createPaymentRequiredResponse([requirements],{url,description:'INDUSTRY agent service',mimeType:'application/json'});
    return {required,header:encodePaymentRequiredHeader(required)};
  }
  async verify(payload:PaymentPayload,requirements:PaymentRequirements){
    const result=await (await this.server()).verifyPayment(payload,requirements);
    ensure(result.isValid&&result.payer,'PAYMENT_REJECTED','Facilitator rejected this payment',402);return result;
  }
  async settle(payload:PaymentPayload,requirements:PaymentRequirements){return (await this.server()).settlePayment(payload,requirements);}
  response(receipt:SettleResponse){return encodePaymentResponseHeader(receipt);}
  // A timed-out settle is indeterminate. Find the exact signed message on chain
  // before retrying; never change its blockhash or create a second payment.
  async recover(payload:PaymentPayload,requirements:PaymentRequirements,payer:string):Promise<SettleResponse|null>{
    const connection=rpcConnection();await assertDevnet(connection);
    const expected=transactionHash(payload),started=Date.now();
    const history=await connection.getSignaturesForAddress(new PublicKey(payer),{limit:50},'confirmed');
    for(const row of history){
      ensure(Date.now()-started<45000,'RECOVERY_PENDING','Chain reconciliation will continue on the next attempt',503);
      if(row.err)continue;
      const tx=await connection.getTransaction(row.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
      if(tx&&!tx.meta?.err&&createHash('sha256').update(tx.transaction.message.serialize()).digest('hex')===expected)
        return {success:true,network:DEVNET_CAIP,transaction:row.signature,payer,amount:requirements.amount};
    }
    return null;
  }
}
export async function devnetBalance(wallet:string){
  const connection=rpcConnection();await assertDevnet(connection);
  const ata=getAssociatedTokenAddressSync(new PublicKey(DEVNET_USDC),new PublicKey(wallet));
  if(!await connection.getAccountInfo(ata))return 0;
  return Number((await connection.getTokenAccountBalance(ata,'confirmed')).value.amount);
}
export interface ConstrainedPaymentSigner {
  sign(requirements:PaymentRequirements,url:string,authorize:()=>Promise<{encryptedKey:string;wallet:string}>):Promise<PaymentPayload>;
}
export class EncryptedPaymentSigner implements ConstrainedPaymentSigner {
  async sign(requirements:PaymentRequirements,url:string,authorize:()=>Promise<{encryptedKey:string;wallet:string}>){
    safetyConfig();ensure(requirements.network===DEVNET_CAIP&&requirements.asset===DEVNET_USDC&&requirements.scheme==='exact','NETWORK_DENIED','Signer permits exact devnet USDC only');
    const connection=rpcConnection();await assertDevnet(connection);
    // The callback owns a durable budget reservation and rechecks current policy.
    // Keys and general-purpose signing capabilities never reach the runtime.
    const authorized=await authorize();const bytes=decryptSecret(authorized.encryptedKey);
    try{
      const signer=await createKeyPairSignerFromBytes(bytes);ensure(signer.address===authorized.wallet,'SIGNER_MISMATCH','Treasury signer mismatch',503);
      const client=new x402Client().register(DEVNET_CAIP,new ClientScheme(signer,{rpcUrl:rpcUrl()}));
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{return await Promise.race([client.createPaymentPayload({x402Version:2,resource:{url,description:'INDUSTRY agent service',mimeType:'application/json'},accepts:[requirements]}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new AppError('SIGNING_TIMEOUT','Devnet signing timed out before submission',503)),20000);})]);}finally{clearTimeout(timer);}
    }finally{bytes.fill(0);}
  }
}
export { encodePaymentSignatureHeader };
