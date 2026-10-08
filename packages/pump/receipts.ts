import { createHash } from 'node:crypto';
import { PublicKey,type VersionedTransactionResponse } from '@solana/web3.js';
import { NATIVE_MINT,getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';
import { PUMP_PROGRAM_ID,PUMP_EVENT_AUTHORITY_PDA,normalizeQuoteMint,bondingCurvePda } from '@pump-fun/pump-sdk';
import { ensure } from '../core';
import { pumpProgram,type RoutingState } from './adapter';
// Anchor event-CPI tag is derived, not an old Pump instruction layout.
// Anchor serializes its event-CPI u64 discriminator in little-endian order.
const eventTag=createHash('sha256').update('anchor:event').digest().subarray(0,8).reverse();
export type PumpReceipt={network:string;businessId:string;mint:string;sharingConfig:string;signature:string;instructionIndex:number;eventIndex:number;slot:number;blockTime:number;quoteMint:string;quoteDecimals:number;rawAmount:string;normalizedAmount:string;treasury:string;operation:string;confirmation:'finalized';key:string;evidence:Record<string,unknown>};
export function formatRaw(raw:bigint,decimals:number){const s=raw.toString().padStart(decimals+1,'0');return decimals?`${s.slice(0,-decimals)}.${s.slice(-decimals)}`:s;}
export function parseRaw(text:string,decimals:number){ensure(/^\d+(\.\d+)?$/.test(text),'PUMP_AMOUNT','Invalid nonnegative decimal amount');const [whole,part='']=text.split('.');ensure(part.length<=decimals,'PUMP_AMOUNT','Too many asset decimal places');return BigInt(whole)*10n**BigInt(decimals)+BigInt((part+'0'.repeat(decimals)).slice(0,decimals)||'0');}
export function receiptUnit(network:string,mint:string){return `PUMP:${network}:${mint}` as const;}
/** Accept only authenticated Pump event CPIs in a successful finalized transaction.
 * The RPC caller must request finalized; timestamps and balances are chain data.
 */
export function parseFeeReceipts(chain:VersionedTransactionResponse,signature:string,network:string,businessId:string,state:RoutingState):PumpReceipt[]{
 ensure(chain.meta&&!chain.meta.err&&chain.blockTime&&chain.transaction.signatures[0]===signature,'PUMP_RECEIPT','Missing successful finalized receipt');
 const meta=chain.meta,keys=chain.transaction.message.getAccountKeys({accountKeysFromLookups:meta.loadedAddresses});
 const receipts:PumpReceipt[]=[];const allTreasuryCredits=new Map<string,bigint>();
 for(const outer of meta.innerInstructions||[])for(const [index,ix] of outer.instructions.entries()){
  if(!keys.get(ix.programIdIndex)?.equals(PUMP_PROGRAM_ID))continue;
  const data=Buffer.from(bs58.decode(ix.data));
  if(data.length<16||!data.subarray(0,8).equals(eventTag)||ix.accounts.length!==1||!keys.get(ix.accounts[0])?.equals(PUMP_EVENT_AUTHORITY_PDA))continue;
  const event=pumpProgram.coder.events.decode(data.subarray(8).toString('base64'));if(!event||event.name!=='distributeCreatorFeesEvent')continue;
  const e=event.data as any;
  const quote=normalizeQuoteMint(e.quoteMint).toBase58(),raw=BigInt(e.distributed.toString());
  if(e.shareholders.length!==1||e.shareholders[0].address.toBase58()!==state.treasury||e.shareholders[0].shareBps!==10000)continue;
  allTreasuryCredits.set(quote,(allTreasuryCredits.get(quote)||0n)+raw);
  if(e.mint.toBase58()!==state.mint||e.sharingConfig.toBase58()!==state.sharingConfig)continue;
  ensure(quote===state.quoteMint&&e.admin.toBase58()===state.creator&&e.bondingCurve.equals(bondingCurvePda(new PublicKey(state.mint))),'PUMP_RECEIPT','Distribution asset/creator/curve differs from the verified business');
  if(raw===0n)continue;
  const key=`pump:${network}:${signature}:${outer.index}:${index}:${state.mint}:${state.treasury}`;
  receipts.push({network,businessId,mint:state.mint,sharingConfig:state.sharingConfig,signature,instructionIndex:outer.index,eventIndex:index,slot:chain.slot,blockTime:chain.blockTime!,quoteMint:quote,quoteDecimals:state.quoteDecimals,rawAmount:raw.toString(),normalizedAmount:formatRaw(raw,state.quoteDecimals),treasury:state.treasury,operation:'pump_creator_fee_distribution',confirmation:'finalized',key,evidence:{program:PUMP_PROGRAM_ID.toBase58(),eventAuthority:PUMP_EVENT_AUTHORITY_PDA.toBase58(),routingSlot:state.slot,eventTimestamp:e.timestamp.toString(),shareBps:10000}});
 }
 if(receipts.length){
  const total=allTreasuryCredits.get(state.quoteMint)!;let delta:bigint;
  if(state.quoteMint===NATIVE_MINT.toBase58()){
   let i=-1;for(let n=0;n<keys.length;n++)if(keys.get(n)?.toBase58()===state.treasury)i=n;
   ensure(i>=0&&Number.isSafeInteger(meta.preBalances[i])&&Number.isSafeInteger(meta.postBalances[i]),'PUMP_RECEIPT','Treasury SOL balance evidence unavailable or imprecise');
   delta=BigInt(meta.postBalances[i])-BigInt(meta.preBalances[i]);if(i===0)delta+=BigInt(meta.fee);
  }else{
   const ata=getAssociatedTokenAddressSync(new PublicKey(state.quoteMint),new PublicKey(state.treasury),true,new PublicKey(state.quoteTokenProgram));let i=-1;for(let n=0;n<keys.length;n++)if(keys.get(n)?.equals(ata))i=n;
   const after=meta.postTokenBalances?.find(b=>b.accountIndex===i&&b.mint===state.quoteMint&&b.owner===state.treasury),before=meta.preTokenBalances?.find(b=>b.accountIndex===i&&b.mint===state.quoteMint&&b.owner===state.treasury);
   ensure(after&&after.uiTokenAmount.decimals===state.quoteDecimals,'PUMP_RECEIPT','Treasury token balance evidence unavailable');delta=BigInt(after.uiTokenAmount.amount)-BigInt(before?.uiTokenAmount.amount||'0');
  }
  ensure(delta>=total,'PUMP_RECEIPT_BALANCE','Treasury balance increase does not substantiate the distribution events; reconcile instead of crediting');
 }
 return receipts;
}
