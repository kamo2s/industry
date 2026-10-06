import { Connection,Keypair,PublicKey,SystemProgram,Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,ExtensionType,getMintLen,getMint,getTokenMetadata,createInitializeMetadataPointerInstruction,createInitializeMintInstruction,TYPE_SIZE,LENGTH_SIZE } from '@solana/spl-token';
import { createInitializeInstruction,pack } from '@solana/spl-token-metadata';
import { ensure } from '../core';
import { decryptSecret } from '../core/security';
import { EncryptedDevSigner,type TokenLaunchProvider } from './solana';

export const MAINNET_GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export interface ApprovedLaunchSigner {
  publicKey:PublicKey;
  // Implement with approved custody/HSM signing. Never expose this to agent tools.
  sendAndConfirm(transaction:Transaction,mint:Keypair):Promise<string>;
}
export function requireMainnetLaunchApproval(){
  ensure(process.env.MAINNET_ENABLED==='true'&&process.env.ENABLE_MAINNET_TOKEN_LAUNCH==='true'&&!!process.env.MAINNET_LAUNCH_APPROVAL_REFERENCE,'MAINNET_DISABLED','A separately approved mainnet launch configuration is required',503);
}
// Isolated production adapter. The V1 web/worker composition never selects it.
// Deployment activation additionally requires replacing the devnet-only startup
// composition after human review; setting a flag cannot silently launch a token.
export class ProductionTokenLaunchProvider implements TokenLaunchProvider {
  constructor(private signer:ApprovedLaunchSigner){}
  private async connection(){requireMainnetLaunchApproval();const url=process.env.MAINNET_RPC_URL;ensure(url&&url.startsWith('https://'),'MAINNET_RPC_REQUIRED','Configure a dedicated mainnet RPC',503);const connection=new Connection(url,{commitment:'confirmed',fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(12000)})});ensure(await connection.getGenesisHash()===MAINNET_GENESIS,'NETWORK_DENIED','Mainnet RPC genesis mismatch');return connection;}
  prepareLaunch(){requireMainnetLaunchApproval();const signer=new EncryptedDevSigner();return {payer:{address:this.signer.publicKey.toBase58(),encrypted:''},mint:signer.provision()};}
  async createToken(input:{name:string;symbol:string;payerEncrypted:string;mintEncrypted:string;metadataUri:string}){
    const connection=await this.connection();ensure(input.metadataUri.startsWith('https://'),'METADATA_REQUIRED','Mainnet metadata must be hosted over HTTPS');
    const bytes=decryptSecret(input.mintEncrypted),mint=Keypair.fromSecretKey(bytes);bytes.fill(0);
    const existing=await connection.getAccountInfo(mint.publicKey);
    if(existing){await getMint(connection,mint.publicKey,'confirmed',TOKEN_2022_PROGRAM_ID);const receipts=await connection.getSignaturesForAddress(mint.publicKey,{limit:1},'confirmed');ensure(receipts[0]&&!receipts[0].err,'RECEIPT_PENDING','Existing mint receipt is not confirmed');return {mint:mint.publicKey.toBase58(),signature:receipts[0].signature};}
    const payer=this.signer.publicKey,metadata={updateAuthority:payer,mint:mint.publicKey,name:input.name,symbol:input.symbol,uri:input.metadataUri,additionalMetadata:[] as [string,string][]};
    const space=getMintLen([ExtensionType.MetadataPointer]),lamports=await connection.getMinimumBalanceForRentExemption(space+TYPE_SIZE+LENGTH_SIZE+pack(metadata).length);
    const transaction=new Transaction().add(SystemProgram.createAccount({fromPubkey:payer,newAccountPubkey:mint.publicKey,space,lamports,programId:TOKEN_2022_PROGRAM_ID}),createInitializeMetadataPointerInstruction(mint.publicKey,payer,mint.publicKey,TOKEN_2022_PROGRAM_ID),createInitializeMintInstruction(mint.publicKey,6,payer,null,TOKEN_2022_PROGRAM_ID),createInitializeInstruction({programId:TOKEN_2022_PROGRAM_ID,metadata:mint.publicKey,updateAuthority:payer,mint:mint.publicKey,mintAuthority:payer,name:input.name,symbol:input.symbol,uri:input.metadataUri}));
    requireMainnetLaunchApproval();const signature=await this.signer.sendAndConfirm(transaction,mint);
    const status=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];ensure(status&&!status.err&&['confirmed','finalized'].includes(status.confirmationStatus||''),'RECEIPT_PENDING','Launch signer did not return a confirmed transaction',503);
    return {mint:mint.publicKey.toBase58(),signature};
  }
  async verifyToken(mint:string){const connection=await this.connection(),address=new PublicKey(mint),account=await connection.getAccountInfo(address);ensure(account&&(account.owner.equals(TOKEN_PROGRAM_ID)||account.owner.equals(TOKEN_2022_PROGRAM_ID)),'INVALID_MINT','Unsupported mint');const token=await getMint(connection,address,'confirmed',account.owner),metadata=account.owner.equals(TOKEN_2022_PROGRAM_ID)?await getTokenMetadata(connection,address,'confirmed',TOKEN_2022_PROGRAM_ID):null;return {mint,network:'mainnet-beta',name:metadata?.name||'Verified token',symbol:metadata?.symbol||'TOKEN',decimals:token.decimals,metadata_uri:metadata?.uri||'',mintAuthority:token.mintAuthority?.toBase58()||null,controlClaim:false};}
  getToken(mint:string){return this.verifyToken(mint);}
  async getMarketMetadata(mint:string){await this.verifyToken(mint);return {mint,network:'mainnet-beta',price:null,marketCap:null,notice:'Mint identity does not imply a liquid market or verified valuation.'};}
}
