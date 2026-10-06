import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Keypair,PublicKey,TransactionMessage,VersionedTransaction,type Connection } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { ensure } from '../core';
import { one,type Database,type Row } from '../db/connection';
import { ingestPumpReceipt,convertPumpReceipt,allocatePumpReceipt } from '../db/pump-accounting';
import { routingState,pendingFees,collectionInstructions,txSignature,type RoutingState } from './adapter';
import { pumpConfig,pumpConnection,assertPumpNetwork,collectionPolicy,requirePumpCollection } from './config';
import { parseFeeReceipts,parseRaw } from './receipts';
import { receiptPrice } from './pricing';
const reason=(e:unknown)=>e instanceof Error?e.message.slice(0,300):'Collector operation failed';
export function checkCollectionCost(pending:bigint,cost:bigint,balance:bigint,daily:bigint){const p=collectionPolicy();ensure(pending>=parseRaw(p.min,9),'PUMP_BELOW_MINIMUM','Pending SOL fees are below the configured collection minimum');ensure(cost>0n&&cost<=p.maxTxLamports&&daily+cost<=p.maxDailyLamports,'PUMP_FEE_CAP','Collector transaction/daily cost limit reached');ensure(cost*1000000n<=pending*BigInt(Math.floor(p.ratio*1000000)),'PUMP_COST_RATIO','Network cost exceeds the allowed receipt ratio');ensure(balance>=cost&&balance<=p.maxWalletLamports,'PUMP_COLLECTOR_BALANCE','Collector wallet is underfunded or exceeds its configured small-wallet ceiling');}
export class PumpCollector {
 private busy=false;
 constructor(private db:Database,private connection:()=>Connection=pumpConnection){}
 async tick(){
  if(this.busy)return {state:'busy'};this.busy=true;
  try{
   await this.db.query('UPDATE pump_launches SET mint_secret=NULL WHERE signer_expires_at<now() AND mint_secret IS NOT NULL');
   // Pricing is read-only and may continue while transaction collection is disabled.
   await this.retryPricing();
   if(process.env.PUMP_RECONCILIATION_ENABLED!=='true'&&!pumpConfig().collection)return {state:'disabled'};
   const rpc=this.connection();await assertPumpNetwork(rpc);const lease=randomUUID();
   const acquired=await this.db.transaction(async tx=>{await tx.query("INSERT INTO system_settings(key,value) VALUES('pump_collector_lease','{}') ON CONFLICT DO NOTHING");const old=(await one(tx,"SELECT value FROM system_settings WHERE key='pump_collector_lease' FOR UPDATE"))!.value;if(Number(old.until)>Date.now())return false;await tx.query("UPDATE system_settings SET value=$1 WHERE key='pump_collector_lease'",[JSON.stringify({lease,until:Date.now()+600000})]);return true;});
   if(!acquired)return {state:'leased'};
   try{
    const rows=(await this.db.query('SELECT * FROM pump_businesses WHERE network=$1 AND (collect_requested OR next_collection_at<=now()) ORDER BY collect_requested DESC,next_collection_at LIMIT $2',[pumpConfig().network,collectionPolicy().batch])).rows;
    for(const row of rows){try{await this.process(rpc,row,lease);}catch(e){await this.db.query("UPDATE pump_businesses SET collection_state='retry',collection_error=$2 WHERE business_id=$1",[row.business_id,reason(e)]);}finally{await this.db.query("UPDATE pump_businesses SET collect_requested=false,next_collection_at=now()+($2*interval '1 second') WHERE business_id=$1",[row.business_id,collectionPolicy().interval]);}}
    return {state:'ok',businesses:rows.length};
   }finally{await this.db.query("UPDATE system_settings SET value='{}' WHERE key='pump_collector_lease' AND value->>'lease'=$1",[lease]);}
  }finally{this.busy=false;}
 }
 async retryPricing(){
  const rows=(await this.db.query("SELECT * FROM pump_receipts WHERE allocation_status<>'ALLOCATED' AND (pricing_attempted_at IS NULL OR pricing_attempted_at<now()-interval '1 minute') ORDER BY slot,id LIMIT 25")).rows;
  for(const r of rows){try{if(r.price_proof)await this.db.transaction(tx=>allocatePumpReceipt(tx,r.id));else{const price=await receiptPrice(r.quote_mint,Math.floor(new Date(r.block_time).getTime()/1000));await this.db.transaction(tx=>convertPumpReceipt(tx,r.id,price));}}catch(e){await this.db.query("UPDATE pump_receipts SET conversion_error=$2,pricing_attempted_at=now() WHERE id=$1 AND allocation_status<>'ALLOCATED'",[r.id,reason(e)]);}}
 }
 private async ingest(rpc:Connection,row:Row,state:RoutingState,signature:string){
  const chain=await rpc.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});ensure(chain?.meta,'PUMP_HISTORY_UNAVAILABLE','Finalized transaction history is unavailable; keep reconciliation pending',503);
  if(!chain.meta.err){ensure(chain.slot>=Number(row.launch_slot),'PUMP_RECEIPT','Receipt predates business launch');const receipts=parseFeeReceipts(chain,signature,row.network,row.business_id,state);await this.db.transaction(async tx=>{for(const receipt of receipts)await ingestPumpReceipt(tx,receipt);});}
  return chain;
 }
 // Page signatures durably, including calls made by third parties. Never discard
 // a signature merely because getTransaction is temporarily unavailable.
 async reconcile(rpc:Connection,row:Row,state:RoutingState){
  const page=await rpc.getSignaturesForAddress(new PublicKey(row.sharing_config),{limit:100,minContextSlot:state.slot,...(row.scan_before?{before:row.scan_before}:{}),...(row.scan_stop||row.scan_head?{until:row.scan_stop||row.scan_head}:{})},'finalized');
  await this.db.transaction(async tx=>{
   for(const s of page)if(s.slot>=Number(row.launch_slot))await tx.query('INSERT INTO pump_scan_signatures(business_id,signature,slot) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[row.business_id,s.signature,s.slot]);
   const end=page.length<100||page.some(s=>s.slot<Number(row.launch_slot));const head=row.scan_next_head||page[0]?.signature||row.scan_head;
   if(end)await tx.query('UPDATE pump_businesses SET scan_head=$2,scan_before=NULL,scan_stop=NULL,scan_next_head=NULL WHERE business_id=$1',[row.business_id,head]);
   else await tx.query('UPDATE pump_businesses SET scan_before=$2,scan_stop=$3,scan_next_head=$4 WHERE business_id=$1',[row.business_id,page.at(-1)!.signature,row.scan_stop||row.scan_head,head]);
  });
  const pending=(await this.db.query('SELECT * FROM pump_scan_signatures WHERE business_id=$1 AND NOT processed ORDER BY slot,signature LIMIT 100',[row.business_id])).rows;
  for(const s of pending){try{await this.ingest(rpc,row,state,s.signature);await this.db.query('UPDATE pump_scan_signatures SET processed=true,error=NULL WHERE business_id=$1 AND signature=$2',[row.business_id,s.signature]);}catch(e){await this.db.query('UPDATE pump_scan_signatures SET error=$3 WHERE business_id=$1 AND signature=$2',[row.business_id,s.signature,reason(e)]);throw e;}}
 }
 private async process(rpc:Connection,row:Row,lease:string){
  let verified;try{verified=await routingState(rpc,row as any,Number(row.launch_slot));}catch(e){await this.db.transaction(async tx=>{await tx.query("UPDATE pump_businesses SET routing_status='FAILED' WHERE business_id=$1",[row.business_id]);await tx.query("UPDATE businesses SET routing_status='FAILED' WHERE id=$1",[row.business_id]);});throw e;}
  const {evidence:state,config}=verified;ensure(state.quoteMint===row.quote_mint&&state.quoteDecimals===row.quote_decimals,'PUMP_QUOTE_CHANGED','Quote identity changed');
  await this.db.transaction(async tx=>{await tx.query("UPDATE pump_businesses SET routing_status='VERIFIED',routing_evidence=$2,graduated=$3 WHERE business_id=$1",[row.business_id,JSON.stringify(state),state.graduated]);await tx.query("UPDATE businesses SET routing_status='VERIFIED',routing_evidence=$2 WHERE id=$1",[row.business_id,JSON.stringify(state)]);});
  await this.reconcile(rpc,row,state);
  const outstanding=(await this.db.query("SELECT * FROM pump_collection_attempts WHERE business_id=$1 AND state IN ('prepared','submitted','unknown') ORDER BY created_at",[row.business_id])).rows;
  for(const a of outstanding){const chain=await rpc.getTransaction(a.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});if(chain){await this.ingest(rpc,row,state,a.signature);await this.db.query('UPDATE pump_collection_attempts SET state=$2,completed_at=now() WHERE id=$1',[a.id,chain.meta?.err?'failed':'confirmed']);}else if(await rpc.getBlockHeight('finalized')>Number(a.last_valid_height)){await this.db.query("UPDATE pump_collection_attempts SET state='expired',completed_at=now() WHERE id=$1",[a.id]);}else{if(pumpConfig().collection){requirePumpCollection();ensure(process.env.EMERGENCY_PAUSE!=='true','PAUSED','Collection paused');await rpc.sendRawTransaction(Buffer.from(a.signed_transaction,'base64'),{skipPreflight:false,maxRetries:2}).catch(()=>undefined);}return;}}
  const pending=await pendingFees(rpc,state);await this.db.query("UPDATE pump_businesses SET pending_raw=$2,sweepable_raw=$3,observed_at=now(),collection_state='observed',collection_error=NULL WHERE business_id=$1",[row.business_id,pending.total.toString(),pending.amm.toString()]);
  if(!pumpConfig().collection)return;requirePumpCollection();ensure(process.env.EMERGENCY_PAUSE!=='true','PAUSED','Collection paused');
  // Other quote assets are preserved/reconciled, but require an approved oracle
  // and asset-specific economic collection policy before we spend gas for them.
  ensure(state.quoteMint===NATIVE_MINT.toBase58(),'PUMP_QUOTE_COLLECTION','Automatic spending supports SOL quotes only');
  if(pending.total<parseRaw(collectionPolicy().min,9))return;
  const keyFile=process.env.PUMP_COLLECTOR_KEYPAIR_FILE;ensure(keyFile,'PUMP_COLLECTOR_KEY','Configure the separate operational collector key file',503);
  const bytes=Uint8Array.from(JSON.parse(await readFile(keyFile,'utf8')));const signer=Keypair.fromSecretKey(Uint8Array.from(bytes));bytes.fill(0);
  try{
   ensure(signer.publicKey.toBase58()===process.env.INDUSTRY_FEE_COLLECTOR&&signer.publicKey.toBase58()!==state.treasury,'PUMP_COLLECTOR_KEY','Operational signer does not match the collector address');
   const instructions=await collectionInstructions(state,config,signer.publicKey,pending.amm>0n&&pending.ammExists);
   const tables=[];for(const a of (process.env.PUMP_LOOKUP_TABLES||'').split(',').filter(Boolean)){const t=await rpc.getAddressLookupTable(new PublicKey(a.trim()),{commitment:'finalized'});ensure(t.value?.isActive(),'PUMP_LOOKUP_TABLE','Missing active lookup table');tables.push(t.value!);}
   const latest=await rpc.getLatestBlockhash('finalized'),tx=new VersionedTransaction(new TransactionMessage({payerKey:signer.publicKey,recentBlockhash:latest.blockhash,instructions}).compileToV0Message(tables));ensure(tx.serialize().length<=1232,'PUMP_PACKET_SIZE','Collection transaction exceeds packet size');
   const balance=await rpc.getBalance(signer.publicKey,'finalized'),fee=await rpc.getFeeForMessage(tx.message,'finalized');ensure(fee.value&&Number.isSafeInteger(balance),'PUMP_FEE_ESTIMATE','Fee or balance unavailable');
   const sim=await rpc.simulateTransaction(tx,{sigVerify:false,commitment:'finalized',accounts:{encoding:'base64',addresses:[signer.publicKey.toBase58()]}});ensure(!sim.value.err&&sim.value.accounts?.[0],'PUMP_COLLECTION_SIMULATION','Collection simulation failed or payer balance unavailable');
   const cost=BigInt(fee.value)+BigInt(Math.max(0,balance-sim.value.accounts[0].lamports));
   const daily=BigInt((await one(this.db,"SELECT COALESCE(sum(estimated_fee),0)::text n FROM pump_collection_attempts WHERE network=$1 AND created_at>now()-interval '24 hours'",[row.network]))!.n);checkCollectionCost(pending.total,cost,BigInt(balance),daily);
   const lock=(await one(this.db,"SELECT value FROM system_settings WHERE key='pump_collector_lease'"))!.value;ensure(lock.lease===lease&&lock.until>Date.now(),'PUMP_LEASE','Collector lease expired');requirePumpCollection();ensure(process.env.EMERGENCY_PAUSE!=='true','PAUSED','Collection paused');
   tx.sign([signer]);const signature=txSignature(tx),serialized=Buffer.from(tx.serialize()).toString('base64');
   await this.db.query('INSERT INTO pump_collection_attempts(business_id,network,signature,signed_transaction,last_valid_height,estimated_fee) VALUES($1,$2,$3,$4,$5,$6)',[row.business_id,row.network,signature,serialized,latest.lastValidBlockHeight,cost.toString()]);
   try{await rpc.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2});await this.db.query("UPDATE pump_collection_attempts SET state='submitted' WHERE signature=$1",[signature]);}catch{await this.db.query("UPDATE pump_collection_attempts SET state='unknown' WHERE signature=$1",[signature]);}
   await this.db.query("UPDATE pump_businesses SET collection_state='confirming' WHERE business_id=$1",[row.business_id]);
  }finally{signer.secretKey.fill(0);}
 }
}
