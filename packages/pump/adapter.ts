import { Connection,PublicKey,VersionedTransaction,TransactionMessage,ComputeBudgetProgram,SystemProgram,type TransactionInstruction,type AddressLookupTableAccount,type AccountInfo } from '@solana/web3.js';
import { NATIVE_MINT,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,unpackMint,unpackAccount,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { PUMP_SDK,PUMP_PROGRAM_ID,PUMP_FEE_PROGRAM_ID,PUMP_AMM_PROGRAM_ID,getPumpProgram,getPumpFeeProgram,getPumpAmmProgram,feeSharingConfigPda,bondingCurvePda,creatorVaultPda,canonicalPumpPoolPdaWithQuote,normalizeQuoteMint,type SharingConfig } from '@pump-fun/pump-sdk';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { ensure } from '../core';
export { PUMP_SDK,PUMP_PROGRAM_ID,PUMP_FEE_PROGRAM_ID,PUMP_AMM_PROGRAM_ID,feeSharingConfigPda,bondingCurvePda,creatorVaultPda };
const offline=new Connection('http://127.0.0.1:8899');
export const pumpProgram=getPumpProgram(offline),feeProgram=getPumpFeeProgram(offline),ammProgram=getPumpAmmProgram(offline);
export type InitialBuyTerms={lamports:string;tokenAmount:string;feeRecipient:string;buybackFeeRecipient:string};
export type LaunchTerms={mint:string;creator:string;treasury:string;name:string;symbol:string;uri:string;initialBuy?:InitialBuyTerms};
export async function launchInstructions(t:LaunchTerms){
 const mint=new PublicKey(t.mint),creator=new PublicKey(t.creator),treasury=new PublicKey(t.treasury);
 ensure(t.name.length<=32&&t.symbol.length<=13&&Buffer.byteLength(t.uri)<=200&&t.uri.startsWith('https://'),'PUMP_METADATA','Pump requires bounded HTTPS metadata, name and symbol');
 const instructions=[
 await PUMP_SDK.createV2Instruction({mint,creator,user:creator,name:t.name,symbol:t.symbol,uri:t.uri,mayhemMode:false,cashback:false,holderReward:false,quoteMint:NATIVE_MINT}),
 await PUMP_SDK.createFeeSharingConfig({creator,mint,pool:null}),
 await PUMP_SDK.updateFeeSharesV2({authority:creator,mint,currentShareholders:[creator],newShareholders:[{address:treasury,shareBps:10000}],quoteMint:NATIVE_MINT,quoteTokenProgram:TOKEN_PROGRAM_ID})];
 if(!t.initialBuy)return [ComputeBudgetProgram.setComputeUnitLimit({units:600000}),...instructions];
 const buy=t.initialBuy;
 ensure(/^[1-9]\d*$/.test(buy.lamports)&&BigInt(buy.lamports)<=100000000000n&&/^[1-9]\d*$/.test(buy.tokenAmount),'PUMP_BUY_AMOUNT','Invalid initial purchase amount');
 // SOL's supported buy instruction is smaller than buy_v2. Buying AFTER
 // final routing sends this trade's creator fee to the locked sharing vault.
 instructions.push(createAssociatedTokenAccountIdempotentInstruction(creator,getAssociatedTokenAddressSync(mint,creator,false,TOKEN_2022_PROGRAM_ID),creator,mint,TOKEN_2022_PROGRAM_ID));
 instructions.push(await PUMP_SDK.getBuyInstructionRaw({user:creator,mint,creator:feeSharingConfigPda(mint),amount:new BN(buy.tokenAmount),solAmount:new BN(buy.lamports),feeRecipient:new PublicKey(buy.feeRecipient),buybackFeeRecipient:new PublicKey(buy.buybackFeeRecipient),tokenProgram:TOKEN_2022_PROGRAM_ID}));
 // Five non-budget instructions receive up to 1M CU by default. Omitting a
 // redundant budget instruction keeps the atomic transaction under 1232 bytes.
 return instructions;
}
function sameIx(a:TransactionInstruction,b:TransactionInstruction){return a.programId.equals(b.programId)&&a.data.equals(b.data)&&a.keys.length===b.keys.length&&a.keys.every((k,i)=>k.pubkey.equals(b.keys[i].pubkey)&&k.isSigner===b.keys[i].isSigner&&k.isWritable===b.keys[i].isWritable);}
export async function validateLaunchInstructions(ixs:TransactionInstruction[],t:LaunchTerms){const expected=await launchInstructions(t);ensure(ixs.length===expected.length&&ixs.every((ix,i)=>sameIx(ix,expected[i])),'PUMP_INSTRUCTION_MISMATCH','Launch instruction ordering, accounts or fee destination changed');}
export async function buildLaunch(t:LaunchTerms,blockhash:string,tables:AddressLookupTableAccount[]=[]){const instructions=await launchInstructions(t);await validateLaunchInstructions(instructions,t);const tx=new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(t.creator),recentBlockhash:blockhash,instructions}).compileToV0Message(tables));let size=Infinity;try{size=tx.serialize().length;}catch{}ensure(size<=1232,'PUMP_ATOMIC_SIZE','This launch exceeds the transaction size limit. Try a shorter Coin name or no initial buy; no token has been created.');return tx;}
export function verifySignedLaunch(signed:Uint8Array,prepared:Uint8Array){const tx=VersionedTransaction.deserialize(signed),expected=VersionedTransaction.deserialize(prepared);ensure(Buffer.from(tx.message.serialize()).equals(Buffer.from(expected.message.serialize())),'PUMP_TRANSACTION_ALTERED','Wallet transaction differs from the reviewed launch');ensure(tx.signatures.length===2&&tx.signatures.every((s,i)=>nacl.sign.detached.verify(tx.message.serialize(),s,tx.message.staticAccountKeys[i].toBytes())),'PUMP_SIGNATURE','Both the creator and ephemeral mint must sign the exact transaction');return tx;}
export type RoutingState={status:'VERIFIED';provider:'pump.fun';mint:string;creator:string;treasury:string;sharingConfig:string;version:number;shareBps:10000;adminRevoked:true;slot:number;quoteMint:string;quoteDecimals:number;quoteTokenProgram:string;graduated:boolean;checkedAt:string};
export function verifySharing(info:AccountInfo<Buffer>|null,address:PublicKey,t:Pick<LaunchTerms,'mint'|'creator'|'treasury'>){
 ensure(info&&info.owner.equals(PUMP_FEE_PROGRAM_ID)&&!info.executable,'FEE_ROUTING_VERIFICATION_FAILED','FEE ROUTING VERIFICATION FAILED: sharing account owner');
 const config=PUMP_SDK.decodeSharingConfig(info) as SharingConfig&{status:{active?:unknown};bump:number};
 ensure(address.equals(feeSharingConfigPda(new PublicKey(t.mint)))&&config.mint.toBase58()===t.mint&&config.version===2&&config.adminRevoked===true&&config.admin.toBase58()===t.creator&&Object.hasOwn(config.status,'active')&&config.shareholders.length===1&&config.shareholders[0].address.toBase58()===t.treasury&&config.shareholders[0].shareBps===10000,'FEE_ROUTING_VERIFICATION_FAILED','FEE ROUTING VERIFICATION FAILED: expected active V2 config, original creator, revoked admin and exactly 100% INDUSTRY treasury');return config;
}
export async function routingState(rpc:Connection,t:Pick<LaunchTerms,'mint'|'creator'|'treasury'>,minContextSlot=0):Promise<{evidence:RoutingState;config:SharingConfig;curve:ReturnType<typeof PUMP_SDK.decodeBondingCurve>}>{
 const mint=new PublicKey(t.mint),sharing=feeSharingConfigPda(mint),curveAddress=bondingCurvePda(mint);
 const result=await rpc.getMultipleAccountsInfoAndContext([mint,sharing,curveAddress],{commitment:'finalized',minContextSlot});const [mintInfo,configInfo,curveInfo]=result.value;
 ensure(mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)&&curveInfo?.owner.equals(PUMP_PROGRAM_ID),'FEE_ROUTING_VERIFICATION_FAILED','FEE ROUTING VERIFICATION FAILED: missing or foreign mint/curve');
 ensure(unpackMint(mint,mintInfo,TOKEN_2022_PROGRAM_ID).decimals===6,'FEE_ROUTING_VERIFICATION_FAILED','Unexpected Pump mint decimals');
 const config=verifySharing(configInfo,sharing,t),curve=PUMP_SDK.decodeBondingCurve(curveInfo!);
 ensure(curve.creator.equals(sharing)&&!curve.isMayhemMode&&!curve.isCashbackCoin&&!curve.isHolderReward,'FEE_ROUTING_VERIFICATION_FAILED','FEE ROUTING VERIFICATION FAILED: curve creator/mode mismatch');
 const quote=normalizeQuoteMint(curve.quoteMint),quoteInfo=quote.equals(NATIVE_MINT)?null:await rpc.getAccountInfo(quote,{commitment:'finalized',minContextSlot:result.context.slot});
 ensure(quote.equals(NATIVE_MINT)||quoteInfo?.owner.equals(TOKEN_PROGRAM_ID)||quoteInfo?.owner.equals(TOKEN_2022_PROGRAM_ID),'PUMP_QUOTE_UNSUPPORTED','Quote asset owner is not a supported token program');
 const quoteProgram=quoteInfo?.owner||TOKEN_PROGRAM_ID,decimals=quote.equals(NATIVE_MINT)?9:unpackMint(quote,quoteInfo!,quoteProgram).decimals;
 const poolInfo=await rpc.getAccountInfo(canonicalPumpPoolPdaWithQuote(mint,quote),{commitment:'finalized',minContextSlot:result.context.slot});
 if(poolInfo){ensure(poolInfo.owner.equals(PUMP_AMM_PROGRAM_ID),'FEE_ROUTING_VERIFICATION_FAILED','Unexpected canonical pool owner');const pool=ammProgram.coder.accounts.decode('pool',poolInfo.data);ensure(pool.baseMint.equals(mint)&&pool.quoteMint.equals(quote)&&pool.coinCreator.equals(sharing)&&!pool.isHolderReward,'FEE_ROUTING_VERIFICATION_FAILED','Canonical PumpSwap pool does not route to sharing config');}
 // Callers may pass a database row. Never spread it into public proof: its
 // pending status would overwrite VERIFIED and its private fields could leak.
 return {config,curve,evidence:{status:'VERIFIED',provider:'pump.fun',mint:t.mint,creator:t.creator,treasury:t.treasury,sharingConfig:sharing.toBase58(),version:2,shareBps:10000,adminRevoked:true,slot:result.context.slot,quoteMint:quote.toBase58(),quoteDecimals:decimals,quoteTokenProgram:quoteProgram.toBase58(),graduated:!!poolInfo,checkedAt:new Date().toISOString()}};
}
export const ammVaultAuthority=(sharing:PublicKey)=>PublicKey.findProgramAddressSync([Buffer.from('creator_vault'),sharing.toBuffer()],PUMP_AMM_PROGRAM_ID)[0];
export async function pendingFees(rpc:Connection,state:RoutingState){const sharing=new PublicKey(state.sharingConfig),quote=new PublicKey(state.quoteMint),program=new PublicKey(state.quoteTokenProgram),native=quote.equals(NATIVE_MINT),vault=creatorVaultPda(sharing),ata=getAssociatedTokenAddressSync(quote,vault,true,program),ammAta=getAssociatedTokenAddressSync(quote,ammVaultAuthority(sharing),true,program);const infos=await rpc.getMultipleAccountsInfoAndContext([native?vault:ata,ammAta],{commitment:'finalized',minContextSlot:state.slot});let bonding=0n,amm=0n;const [a,b]=infos.value;if(a){if(native){ensure(a.owner.equals(SystemProgram.programId)&&a.data.length===0,'PUMP_VAULT','Unexpected native creator vault');ensure(Number.isSafeInteger(a.lamports),'PUMP_AMOUNT','Unsafe RPC lamport precision');bonding=BigInt(Math.max(0,a.lamports-await rpc.getMinimumBalanceForRentExemption(a.data.length,'finalized')));}else {const account=unpackAccount(ata,a,program);ensure(account.owner.equals(vault)&&account.mint.equals(quote),'PUMP_VAULT','Unexpected bonding vault');bonding=account.amount;}}if(b){const account=unpackAccount(ammAta,b,program);ensure(account.owner.equals(ammVaultAuthority(sharing))&&account.mint.equals(quote),'PUMP_VAULT','Unexpected AMM vault');amm=account.amount;}return {bonding,amm,total:bonding+amm,ammExists:!!b,slot:infos.context.slot};}
export async function collectionInstructions(state:RoutingState,config:SharingConfig,payer:PublicKey,sweep:boolean){ensure(payer.toBase58()!==state.treasury,'PUMP_COLLECTOR_KEY','Collector must not be the treasury');ensure(config.version===2&&config.adminRevoked&&config.mint.toBase58()===state.mint&&config.admin.toBase58()===state.creator&&config.shareholders.length===1&&config.shareholders[0].address.toBase58()===state.treasury&&config.shareholders[0].shareBps===10000,'PUMP_COLLECTOR_ROUTING','Collector may only distribute the verified 100% treasury share');const mint=new PublicKey(state.mint),quoteMint=new PublicKey(state.quoteMint),quoteTokenProgram=new PublicKey(state.quoteTokenProgram);return [ComputeBudgetProgram.setComputeUnitLimit({units:400000}),...(sweep?[await PUMP_SDK.transferCreatorFeesToPumpV2({payer,mint,quoteMint,quoteTokenProgram})]:[]),await PUMP_SDK.distributeCreatorFeesV2({mint,sharingConfig:config,sharingConfigAddress:new PublicKey(state.sharingConfig),quoteMint,payer,shouldInitializeAta:true,quoteTokenProgram})];}
export function txSignature(tx:VersionedTransaction){return bs58.encode(tx.signatures[0]);}
