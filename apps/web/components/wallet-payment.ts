'use client';
import { getWallets } from '@wallet-standard/app';
import type { SolanaSignTransactionFeature } from '@solana/wallet-standard-features';
import { address, getTransactionEncoder, getTransactionDecoder, type TransactionPartialSigner } from '@solana/kit';
import { x402Client } from '@x402/core/client';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import { DEVNET_CAIP, DEVNET_USDC } from '../../../packages/core/networks';
import { micro, type Service } from '../../../packages/core';
export type WalletPaymentAttempt={fingerprint:string;header?:string};
export async function payForService(service:Service,input:unknown,key:string,walletAddress:string,attempt:WalletPaymentAttempt,onSigned?:()=>void){
  const fingerprint=JSON.stringify(input);if(attempt.fingerprint!==fingerprint)throw new Error('Keep the signed request unchanged while its payment is pending.');
  const send=(payment?:string)=>fetch(`/api/services/${service.id}/invoke`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,...(payment?{'PAYMENT-SIGNATURE':payment}:{})},body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
  let response=await send(attempt.header);
  if(response.status===402&&!attempt.header){
    const header=response.headers.get('PAYMENT-REQUIRED');if(!header)throw new Error('Service returned no V2 payment requirement.');
    const required=decodePaymentRequiredHeader(header),terms=required.accepts[0];
    if(required.x402Version!==2||required.accepts.length!==1||terms.scheme!=='exact'||terms.network!==DEVNET_CAIP||terms.asset!==DEVNET_USDC||terms.amount!==String(micro(service.price))||terms.payTo!==service.treasury_address)throw new Error('Payment quote differs from this service’s displayed price, network, or treasury.');
    const wallet=getWallets().get().find(w=>w.accounts.some(a=>a.address===walletAddress)&&'solana:signTransaction' in w.features);
    const account=wallet?.accounts.find(a=>a.address===walletAddress);if(!wallet||!account)throw new Error('Reconnect a Solana wallet that supports devnet transaction signing. Temporary development identities cannot pay on-chain.');
    const features=wallet.features as SolanaSignTransactionFeature;
    const signer:TransactionPartialSigner={address:address(account.address),signTransactions:async transactions=>{
      const signed=await features['solana:signTransaction'].signTransaction(...transactions.map(transaction=>({account,chain:'solana:devnet' as const,transaction:new Uint8Array(getTransactionEncoder().encode(transaction))})));
      return signed.map(result=>{const signature=getTransactionDecoder().decode(result.signedTransaction).signatures[signer.address];if(!signature)throw new Error('Wallet returned no payment signature.');return {[signer.address]:signature};});
    }};
    const client=new x402Client().register(DEVNET_CAIP,new ExactSvmScheme(signer));
    attempt.header=encodePaymentSignatureHeader(await client.createPaymentPayload(required));
    onSigned?.();
    response=await send(attempt.header);
  }
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error?.message||'Payment is pending. Retry this same request; do not create another payment.'),{resetPayment:['PAYMENT_REJECTED','QUOTE_EXPIRED','PAYMENT_CLOSED'].includes(result.error?.code)});return result;
}
