import { randomUUID } from 'node:crypto';
import { Keypair,PublicKey,type Connection } from '@solana/web3.js';
import { z } from 'zod';
import { agentSchema,ensure,idempotencySchema,type AgentInput } from '../core';
import { hash,encryptSecret,decryptSecret } from '../core/security';
import { one,type Database,type Row,type Queryable } from '../db/connection';
import { requireEnabled } from '../db/controls';
import { buildLaunch,routingState,verifySignedLaunch,txSignature,type RoutingState } from './adapter';
import { assertPumpNetwork,pumpConfig,pumpConnection,requirePumpLaunch } from './config';
import {quoteInitialBuy,metadataReference,metadataLaunchId} from './initial-buy';
type Activate=(tx:Queryable,profile:Row,input:AgentInput,pump:{id:string;evidence:RoutingState;signature:string;metadataUri:string;launchId:string;launchSlot:number})=>Promise<any>;
const keySchema=z.string().uuid();
export class PumpLaunchService {
 constructor(private db:Database,private activate:Activate,private connection:()=>Connection=pumpConnection){}
 private view(r:Row){return {id:r.id,status:r.status,mint:r.mint,network:r.network,treasury:r.treasury,creator:r.creator,shareBps:10000,name:r.config.name,input:r.config,initialBuySol:r.config.initialBuySol||0,initialBuyTokens:r.terms?.initialBuy?.tokenAmount,transaction:r.status==='prepared'?r.prepared_transaction:undefined,lastValidBlockHeight:r.last_valid_height,signature:r.signature,evidence:r.evidence,error:r.error,result:r.active_result};}
 private async owned(id:string,profile:Row){const r=await one(this.db,'SELECT * FROM pump_launches WHERE id=$1 AND profile_id=$2',[keySchema.parse(id),profile.id]);ensure(r,'NOT_FOUND','Pump launch not found',404);return r;}
 async resume(profile:Row,id:string){const r=await this.owned(id,profile);return this.prepare(profile,r.config,`resume-${id}`,id);}
 private async mintExists(rpc:Connection,mint:string){return rpc.getAccountInfo(new PublicKey(mint),{commitment:'finalized',minContextSlot:await rpc.getSlot('finalized')});}
 async cancel(profile:Row,id:string){await this.owned(id,profile);const rpc=this.connection();await assertPumpNetwork(rpc);await this.db.transaction(async tx=>{const r=(await one(tx,'SELECT * FROM pump_launches WHERE id=$1 FOR UPDATE',[id]))!;ensure(r.network===pumpConfig().network,'PUMP_WRONG_CHAIN','Recover on the original network');ensure(!r.active_result,'PUMP_ACTIVE','Verified businesses cannot be cancelled');const height=await rpc.getBlockHeight('finalized');ensure(!await one(tx,'SELECT id FROM pump_launch_attempts WHERE launch_id=$1 AND last_valid_height>=$2',[id,height]),'PUMP_CONFIRMATION_UNKNOWN','Wait for every signed transaction to expire before cancellation');ensure(!await this.mintExists(rpc,r.mint),'PUMP_RECOVERY_REQUIRED','Mint exists; recover its original launch');await tx.query("UPDATE pump_launches SET status='cancelled',mint_secret=NULL,error=NULL WHERE id=$1",[id]);});return this.view(await this.owned(id,profile));}
 async prepare(profile:Row,input:unknown,key:string,resumeId?:string){
  await this.db.query('UPDATE pump_launches SET mint_secret=NULL WHERE signer_expires_at<now() AND mint_secret IS NOT NULL');
  const c=requirePumpLaunch(profile.primary_wallet);await requireEnabled(this.db,'launches');
  const config=agentSchema.parse(input);ensure(config.tokenMode==='pump','PUMP_MODE','Choose Pump token mode');ensure(config.initialBudget===0&&config.initialOperatingBudget===0,'PUMP_TEST_FUNDS','Real Pump businesses cannot receive development credits');
  if(config.icon)ensure(await one(this.db,'SELECT id FROM uploads WHERE id=$1 AND profile_id=$2',[config.icon,profile.id]),'INVALID_UPLOAD','Please select your Coin image again for this wallet.',403);
  ensure(config.name.length<=32,'PUMP_METADATA','Pump business names must be at most 32 characters');
  idempotencySchema.parse(key);const scoped=hash(`${profile.id}:pump:${key}`),fingerprint=hash(JSON.stringify(config));
  let row=resumeId?await this.owned(resumeId,profile):await this.db.transaction(async tx=>{
   await tx.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[profile.id]);
   const old=await one(tx,'SELECT * FROM pump_launches WHERE idempotency_key=$1',[scoped]);if(old){ensure(old.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','Resume the saved launch with its original business settings',409);return old;}
   const pending=await one(tx,"SELECT id FROM pump_launches WHERE profile_id=$1 AND status NOT IN ('verified','cancelled') LIMIT 1",[profile.id]);ensure(!pending,'PUMP_PENDING_LAUNCH','Recover your existing Pump launch before preparing another token',409);
   const id=randomUUID(),businessId=randomUUID(),mint=Keypair.generate();
   const site=process.env.PUMP_METADATA_BASE_URL||process.env.NEXT_PUBLIC_SITE_URL||'';
   ensure(site.startsWith('https://')&&!/localhost|127\.0\.0\.1/.test(site),'PUMP_METADATA','Configure a public HTTPS metadata origin before Pump launch',503);
   const uri=`${site.replace(/\/$/,'')}/api/pump/metadata/${metadataReference(id)}`;ensure(Buffer.byteLength(uri)<=200,'PUMP_METADATA','Metadata URI exceeds Pump limit');
   const secret=encryptSecret(mint.secretKey);const address=mint.publicKey.toBase58();mint.secretKey.fill(0);
   return (await one(tx,'INSERT INTO pump_launches(id,business_id,profile_id,idempotency_key,fingerprint,config,network,mint,creator,treasury,metadata_uri,mint_secret) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[id,businessId,profile.id,scoped,fingerprint,JSON.stringify(config),c.network,address,profile.primary_wallet,c.treasury,uri,secret]))!;
  });
  if(row.active_result)return this.view(row);
  ensure(row.status!=='cancelled','PUMP_CANCELLED','This operation was cancelled. Use a new request key for a new launch');
  const rpc=this.connection();await assertPumpNetwork(rpc);
  if(row.signature||await rpc.getAccountInfo(new PublicKey(row.mint),'finalized')){const recovered=await this.recover(profile,row.id);if(recovered.status==='verified'||['submitted','unknown','confirmed'].includes(recovered.status))return recovered;}
  row=await this.db.transaction(async tx=>{
   const r=(await one(tx,'SELECT * FROM pump_launches WHERE id=$1 FOR UPDATE',[row.id]))!;
   if(r.active_result)return r;
   ensure(r.status!=='cancelled','PUMP_CANCELLED','Operation cancelled');
   ensure(r.network===c.network&&r.treasury===c.treasury,'PUMP_CONFIG_CHANGED','Network/treasury changed; do not replace a pending launch',409);
   const height=await rpc.getBlockHeight('finalized');
   if(r.prepared_transaction&&height<=Number(r.last_valid_height))return r;
   ensure(!await this.mintExists(rpc,r.mint),'PUMP_RECOVERY_REQUIRED','Mint already exists; recover and verify its original transaction',409);
   // Every stored attempt is expired before rebuilding the same mint. Never silently create a second token.
   const unexpired=await one(tx,'SELECT id FROM pump_launch_attempts WHERE launch_id=$1 AND last_valid_height>=$2',[r.id,height]);ensure(!unexpired,'PUMP_CONFIRMATION_UNKNOWN','Wait for the existing transaction to confirm or expire',409);
   ensure(r.mint_secret,'PUMP_SIGNER_EXPIRED','Ephemeral mint signer has expired; reconcile the existing mint before an operator cancels this operation',409);
   const tables=[];for(const address of (process.env.PUMP_LOOKUP_TABLES||'').split(',').filter(Boolean)){const result=await rpc.getAddressLookupTable(new PublicKey(address.trim()),{commitment:'finalized'});ensure(result.value?.isActive(),'PUMP_LOOKUP_TABLE','Configured lookup table is inactive or missing');tables.push(result.value!);}
   const terms={mint:r.mint,creator:r.creator,treasury:r.treasury,name:r.config.name,symbol:r.config.ticker,uri:r.metadata_uri,initialBuy:await quoteInitialBuy(rpc,r.config.initialBuySol||0)};
   const latest=await rpc.getLatestBlockhash('finalized'),transaction=await buildLaunch(terms,latest.blockhash,tables);
   const bytes=decryptSecret(r.mint_secret),mint=Keypair.fromSecretKey(Uint8Array.from(bytes));bytes.fill(0);transaction.sign([mint]);mint.secretKey.fill(0);
   const simulated=await rpc.simulateTransaction(transaction,{sigVerify:false,commitment:'finalized'});
   ensure(!simulated.value.err||!(simulated.value.logs?.some(line=>/insufficient (lamports|funds)/i.test(line))||JSON.stringify(simulated.value.err).includes('InsufficientFunds')),'PUMP_INSUFFICIENT_SOL','Your wallet needs more SOL for token creation, account rent, network fees and your optional initial buy.',409);
   ensure(!simulated.value.err,'PUMP_SIMULATION_FAILED',`Pump launch simulation failed: ${JSON.stringify(simulated.value.err).slice(0,180)}`,409);
   const serialized=Buffer.from(transaction.serialize()).toString('base64'),messageHash=hash(Buffer.from(transaction.message.serialize()).toString('base64'));
   await tx.query('INSERT INTO pump_launch_attempts(launch_id,message_hash,prepared_transaction,last_valid_height) VALUES($1,$2,$3,$4)',[r.id,messageHash,serialized,latest.lastValidBlockHeight]);
   return (await one(tx,"UPDATE pump_launches SET status='prepared',signature=NULL,signed_transaction=NULL,prepared_transaction=$2,blockhash=$3,last_valid_height=$4,terms=$5,error=NULL,updated_at=now() WHERE id=$1 RETURNING *",[r.id,serialized,latest.blockhash,latest.lastValidBlockHeight,JSON.stringify(terms)]))!;
  });return this.view(row);
 }
 async submit(profile:Row,id:string,signed:string){
  requirePumpLaunch(profile.primary_wallet);await requireEnabled(this.db,'launches');const row=await this.owned(id,profile);if(row.active_result)return this.view(row);ensure(row.status!=='cancelled','PUMP_CANCELLED','Operation cancelled');ensure(row.network===pumpConfig().network&&row.treasury===pumpConfig().treasury,'PUMP_CONFIG_CHANGED','Recover using the original network and treasury');
  ensure(typeof signed==='string'&&signed.length<3000&&row.prepared_transaction,'PUMP_TRANSACTION','No prepared launch transaction');
  const tx=verifySignedLaunch(Buffer.from(signed,'base64'),Buffer.from(row.prepared_transaction,'base64')),signature=txSignature(tx);
  const alreadyActive=await this.db.transaction(async db=>{const r=(await one(db,'SELECT * FROM pump_launches WHERE id=$1 FOR UPDATE',[id]))!;if(r.active_result)return true;ensure(r.status!=='cancelled'&&r.prepared_transaction===row.prepared_transaction,'PUMP_ATTEMPT_CHANGED','Prepared operation changed; recover it before signing',409);ensure(!r.signature||r.signature===signature||r.status==='failed'||r.status==='expired','PUMP_PENDING_LAUNCH','A different signature already belongs to this launch',409);await db.query("UPDATE pump_launches SET signature=$2,signed_transaction=$3,status='submitted',error=NULL,updated_at=now() WHERE id=$1",[id,signature,signed]);await db.query("UPDATE pump_launch_attempts SET signature=$2,signed_transaction=$3,status='submitted' WHERE launch_id=$1 AND prepared_transaction=$4",[id,signature,signed,row.prepared_transaction]);return false;});
  if(alreadyActive)return this.view(await this.owned(id,profile));
  const rpc=this.connection();await assertPumpNetwork(rpc);
  try{await rpc.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2});}catch{await this.db.query("UPDATE pump_launches SET status='unknown',error='Submission result unknown. Recover this launch; do not launch another mint.' WHERE id=$1 AND active_result IS NULL AND status<>'cancelled' AND prepared_transaction=$2",[id,row.prepared_transaction]);}
  return this.recover(profile,id);
 }
 async recover(profile:Row,id:string){
  const row=await this.owned(id,profile);if(row.active_result)return this.view(row);ensure(row.status!=='cancelled','PUMP_CANCELLED','Operation cancelled');
  ensure(row.network===pumpConfig().network,'PUMP_WRONG_CHAIN','Switch to the original launch network to recover');const rpc=this.connection();await assertPumpNetwork(rpc);
  const attempts=(await this.db.query('SELECT * FROM pump_launch_attempts WHERE launch_id=$1 ORDER BY created_at DESC',[id])).rows;
  const signatures=new Set<string>(attempts.filter(a=>a.signature).map(a=>a.signature));
  const mintExists=await rpc.getAccountInfo(new PublicKey(row.mint),'finalized');
  if(mintExists)for(const receipt of await rpc.getSignaturesForAddress(new PublicKey(row.mint),{limit:100},'finalized'))if(!receipt.err)signatures.add(receipt.signature);
  for(const signature of signatures){
   const chain=await rpc.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});if(!chain)continue;
   const messageHash=hash(Buffer.from(chain.transaction.message.serialize()).toString('base64')),attempt=attempts.find(a=>a.message_hash===messageHash);if(!attempt)continue;
   if(chain.meta?.err){await this.db.query("UPDATE pump_launch_attempts SET status='failed' WHERE id=$1",[attempt.id]);await this.db.query("UPDATE pump_launches SET status='failed',error='Launch transaction failed atomically. No partial fee setup was accepted.' WHERE id=$1 AND prepared_transaction=$2 AND active_result IS NULL AND status<>'cancelled'",[id,attempt.prepared_transaction]);continue;}
   ensure(chain.meta,'PUMP_RECEIPT','Finalized transaction metadata unavailable');
   try{
    const {evidence}=await routingState(rpc,row as any,chain.slot);
    const result=await this.db.transaction(async tx=>{const r=(await one(tx,'SELECT * FROM pump_launches WHERE id=$1 FOR UPDATE',[id]))!;if(r.active_result)return r.active_result;const result=await this.activate(tx,profile,agentSchema.parse({...r.config,mint:r.mint}),{id:r.business_id,evidence,signature,metadataUri:r.metadata_uri,launchId:r.id,launchSlot:chain.slot});await tx.query("UPDATE pump_launches SET status='verified',signature=$2,evidence=$3,active_result=$4,mint_secret=NULL,error=NULL,updated_at=now() WHERE id=$1",[id,signature,JSON.stringify(evidence),JSON.stringify(result)]);return result;});return {...this.view(await this.owned(id,profile)),result};
   }catch(error){await this.db.query("UPDATE pump_launches SET status='confirmed',signature=$2,error=$3,updated_at=now() WHERE id=$1 AND active_result IS NULL AND status<>'cancelled'",[id,signature,`${(error as any).code==='FEE_ROUTING_VERIFICATION_FAILED'?'FEE ROUTING VERIFICATION FAILED':'Confirmed launch; activation/reconciliation pending'}: ${(error as Error).message}`.slice(0,400)]);return this.view(await this.owned(id,profile));}
  }
  const height=await rpc.getBlockHeight('finalized');
  if(attempts.length&&attempts.every(a=>height>Number(a.last_valid_height))&&!await this.mintExists(rpc,row.mint)){await this.db.query("UPDATE pump_launches SET status='expired',error='Previous transaction expired with no finalized mint. Retry this same operation to reuse its mint.' WHERE id=$1 AND status NOT IN ('verified','cancelled') AND NOT EXISTS(SELECT 1 FROM pump_launch_attempts WHERE launch_id=$1 AND last_valid_height>=$2)",[id,height]);}
  return this.view(await this.owned(id,profile));
 }
 async status(profile:Row,id?:string){if(id)return this.view(await this.owned(id,profile));return (await this.db.query("SELECT * FROM pump_launches WHERE profile_id=$1 ORDER BY created_at DESC LIMIT 10",[profile.id])).rows.map(r=>this.view(r));}
 async metadata(id:string){const r=await one(this.db,'SELECT config,metadata_uri,mint FROM pump_launches WHERE id=$1',[keySchema.parse(metadataLaunchId(id))]);ensure(r,'NOT_FOUND','Metadata not found',404);return {name:r.config.name,symbol:r.config.ticker,description:r.config.description,...(r.config.icon?{image:`${new URL(r.metadata_uri).origin}/api/uploads/${r.config.icon}`}:{}) ,external_url:`${new URL(r.metadata_uri).origin}/coins/${r.mint}`,website:`${new URL(r.metadata_uri).origin}/coins/${r.mint}`,attributes:[{trait_type:'Profession',value:r.config.jobType}]};}
}
