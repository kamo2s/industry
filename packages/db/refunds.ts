import bs58 from 'bs58';
import { PublicKey,Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync,createTransferCheckedInstruction } from '@solana/spl-token';
import { ensure,AppError } from '../core';
import { DEVNET_USDC } from '../agent/payments';
import { assertDevnet,EncryptedDevSigner,rpcConnection } from '../agent/solana';
import { one,type Database,type Row } from './connection';
import { event,ledger } from './economy';

export interface RefundProvider {
  prepare(payment:Row,wallet:Row):Promise<{wire_transaction:string;signature:string;last_valid_block_height:number}>;
  status(signature:string):Promise<'missing'|'pending'|'confirmed'|'failed'>;
  finalizedHeight():Promise<number>;
  send(wire:string):Promise<void>;
}
class DevnetRefundProvider implements RefundProvider {
  private connection=rpcConnection();
  async prepare(payment:Row,wallet:Row){
    await assertDevnet(this.connection);
    const signer=new EncryptedDevSigner().open(wallet.encrypted_key_reference),mint=new PublicKey(DEVNET_USDC);
    ensure(wallet.public_address===payment.payee_address&&signer.publicKey.toBase58()===payment.payee_address,'REFUND_SIGNER_MISMATCH','Seller treasury does not match the original payment',409);
    ensure(await this.connection.getBalance(signer.publicKey)>=10000,'REFUND_SOL_REQUIRED',`Fund seller treasury ${wallet.public_address} with devnet SOL for refund fees`,409);
    const latest=await this.connection.getLatestBlockhash('confirmed');
    const transaction=new Transaction({feePayer:signer.publicKey,blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight}).add(createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint,signer.publicKey),mint,getAssociatedTokenAddressSync(mint,new PublicKey(payment.payer_address)),signer.publicKey,BigInt(payment.amount),6));
    transaction.sign(signer);
    return {wire_transaction:transaction.serialize().toString('base64'),signature:bs58.encode(transaction.signature!),last_valid_block_height:latest.lastValidBlockHeight};
  }
  async status(signature:string){
    await assertDevnet(this.connection);
    const status=(await this.connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
    if(!status)return 'missing';
    if(status.err)return status.confirmationStatus==='finalized'?'failed':'pending';
    return ['confirmed','finalized'].includes(status.confirmationStatus||'')?'confirmed':'pending';
  }
  finalizedHeight(){return this.connection.getBlockHeight('finalized');}
  async send(wire:string){await assertDevnet(this.connection);await this.connection.sendRawTransaction(Buffer.from(wire,'base64'),{skipPreflight:false,maxRetries:2});}
}

// Admin prepares a refund; recovery may only resend its identical authorization.
// Recipient, asset and amount are fixed by the original receipt, never form input.
export async function refundDevnetPayment(db:Database,paymentId:string,recovery=false,provider:RefundProvider=new DevnetRefundProvider()){
  const attempt=await db.transaction(async tx=>{
    const payment=await one(tx,"SELECT p.*,r.provider_agent_id,r.requester_agent_id,r.id request_id,r.job_id FROM payments p JOIN service_requests r ON r.payment_id=p.id WHERE p.id=$1 FOR UPDATE OF p",[paymentId]);
    ensure(payment&&payment.network==='devnet','PAYMENT_NOT_FOUND','Devnet payment not found',404);
    if(payment.status==='refunded')return {status:'confirmed',signature:payment.refund_signature};
    ensure(payment.status==='refund_required','REFUND_DENIED','Only failed, settled service payments can be refunded',409);
    const old=await one(tx,'SELECT * FROM refund_attempts WHERE payment_id=$1',[paymentId]);
    if(old&&old.status!=='failed')return old;
    ensure(!recovery,'REFUND_NOT_PREPARED','An administrator must authorize a new refund attempt',403);
    const wallet=(await one(tx,'SELECT * FROM wallet_accounts WHERE agent_id=$1',[payment.provider_agent_id]))!;
    const prepared=await provider.prepare(payment,wallet);
    if(old)return (await one(tx,"UPDATE refund_attempts SET prior_attempts=prior_attempts || jsonb_build_array(jsonb_build_object('signature',signature,'status',status,'last_error',last_error,'wire_transaction',wire_transaction)),wire_transaction=$1,signature=$2,last_valid_block_height=$3,status='prepared',last_error=NULL,updated_at=now() WHERE payment_id=$4 RETURNING *",[prepared.wire_transaction,prepared.signature,prepared.last_valid_block_height,paymentId]))!;
    return (await one(tx,'INSERT INTO refund_attempts(payment_id,wire_transaction,signature,last_valid_block_height) VALUES($1,$2,$3,$4) RETURNING *',[paymentId,prepared.wire_transaction,prepared.signature,prepared.last_valid_block_height]))!;
  });
  if(attempt.status==='confirmed')return {status:'refunded',signature:attempt.signature};
  try{
    let status=await provider.status(attempt.signature);
    // Only finalized chain failure or finalized expiry permits a NEW signature.
    if(status==='failed'||(status==='missing'&&await provider.finalizedHeight()>Number(attempt.last_valid_block_height))){
      await db.query("UPDATE refund_attempts SET status='failed',last_error=$1,updated_at=now() WHERE payment_id=$2 AND signature=$3 AND status='prepared'",[status==='failed'?'CHAIN_FAILED':'BLOCKHASH_EXPIRED',paymentId,attempt.signature]);
      throw new AppError('REFUND_FAILED','Refund did not land. An administrator can authorize a fresh attempt.',409);
    }
    if(status==='missing'){await provider.send(attempt.wire_transaction);status=await provider.status(attempt.signature);}
    ensure(status==='confirmed','REFUND_PENDING','Refund confirmation is pending; recovery will reuse the same transaction',503);
    await db.transaction(async tx=>{
      const payment=await one(tx,"SELECT p.*,r.provider_agent_id,r.requester_agent_id,r.id request_id,r.job_id,r.requester_profile_id FROM payments p JOIN service_requests r ON r.payment_id=p.id WHERE p.id=$1 FOR UPDATE OF p",[paymentId]);
      if(payment!.status==='refunded')return;
      await tx.query("UPDATE payments SET status='refunded',refund_signature=$1 WHERE id=$2",[attempt.signature,paymentId]);
      await tx.query("UPDATE refund_attempts SET status='confirmed',updated_at=now(),last_error=NULL WHERE payment_id=$1",[paymentId]);
      if(payment!.requester_agent_id)await ledger(tx,payment!.requester_agent_id,'credit','refund',Number(payment!.amount),`refund:${paymentId}`,{network:'devnet',payment:paymentId,request:payment!.request_id,counterparty:payment!.provider_agent_id});
      await event(tx,payment!.provider_agent_id,'refunded','Actual devnet USDC returned to original payer',{job:payment!.job_id,amount:Number(payment!.amount)});
      await tx.query('INSERT INTO notifications(profile_id,agent_id,message) VALUES($1,$2,$3)',[payment!.requester_profile_id,payment!.provider_agent_id,`Devnet refund confirmed: ${attempt.signature}`]);
    });return {status:'refunded',signature:attempt.signature};
  }catch(error){await db.query("UPDATE refund_attempts SET last_error=$1,updated_at=now() WHERE payment_id=$2 AND signature=$3 AND status='prepared'",[error instanceof AppError?error.code:'REFUND_PROVIDER_UNAVAILABLE',paymentId,attempt.signature]);throw error;}
}
