import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ExtensionType, getMintLen, getMint, getTokenMetadata, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, TYPE_SIZE, LENGTH_SIZE } from '@solana/spl-token';
import { createInitializeInstruction, pack } from '@solana/spl-token-metadata';
import { ensure } from '../core';
import { decryptSecret, encryptSecret, safetyConfig } from '../core/security';
export interface SignerProvider { provision(): { address: string; encrypted: string }; }
export class EncryptedDevSigner implements SignerProvider {
  provision() { const key=Keypair.generate(); return { address: key.publicKey.toBase58(), encrypted: encryptSecret(key.secretKey) }; }
  open(encrypted: string) { safetyConfig(); return Keypair.fromSecretKey(decryptSecret(encrypted)); }
}
export function rpcConnection(signal?:AbortSignal) {
  safetyConfig();
  const url=rpcUrl();
  return new Connection(url,{commitment:'confirmed',confirmTransactionInitialTimeout:30000,fetch:(input,init)=>fetch(input,{...init,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)})});
}
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export function rpcUrl(){return process.env.SOLANA_RPC_URL || (process.env.HELIUS_API_KEY ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 'https://api.devnet.solana.com');}
export async function assertDevnet(connection:Pick<Connection,'getGenesisHash'>){ensure(await connection.getGenesisHash()===DEVNET_GENESIS,'NETWORK_DENIED','RPC must be Solana devnet');}
export async function verifyMint(mint: string,timeout=12000) {
  let address: PublicKey; try { address=new PublicKey(mint); } catch { throw new Error('Invalid Solana mint'); }
  const signal=AbortSignal.timeout(Math.max(1,timeout));const connection=rpcConnection(signal);
  await assertDevnet(connection);
  const account=await connection.getAccountInfo(address);
  ensure(account && (account.owner.equals(TOKEN_PROGRAM_ID)||account.owner.equals(TOKEN_2022_PROGRAM_ID)),'INVALID_MINT','Address is not owned by a supported token program');
  const token=await getMint(connection,address,'confirmed',account.owner);
  let name='Verified devnet token',symbol='TOKEN',uri='';
  if(account.owner.equals(TOKEN_2022_PROGRAM_ID)){const metadata=await getTokenMetadata(connection,address,'confirmed',TOKEN_2022_PROGRAM_ID);if(metadata){name=metadata.name;symbol=metadata.symbol;uri=metadata.uri;}}
  if (process.env.HELIUS_API_KEY) {
    const response=await fetch(`https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'industry',method:'getAsset',params:{id:mint}}),signal});
    const data=await response.json();
    if (data.result?.content) { name=String(data.result.content.metadata?.name||name).slice(0,80); symbol=String(data.result.content.metadata?.symbol||symbol).slice(0,16);uri=String(data.result.content.json_uri||'').slice(0,500); }
  }
  return {mint,network:'devnet',name,symbol,decimals:token.decimals,metadata_uri:uri,mintAuthority:token.mintAuthority?.toBase58()||null,controlClaim:false};
}
export interface TokenLaunchProvider {
  prepareLaunch():{payer:{address:string;encrypted:string};mint:{address:string;encrypted:string}};
  createToken(input:{name:string;symbol:string;payerEncrypted:string;mintEncrypted:string;metadataUri:string}):Promise<{mint:string;signature:string}>;
  getToken(mint:string):ReturnType<typeof verifyMint>;
  verifyToken(mint:string):ReturnType<typeof verifyMint>;
  getMarketMetadata(mint:string):Promise<{mint:string;network:string;price:null;marketCap:null;notice:string}>;
}
export class DevnetTokenLaunchProvider implements TokenLaunchProvider {
  prepareLaunch(){const signer=new EncryptedDevSigner();return {payer:signer.provision(),mint:signer.provision()};}
  getToken(mint:string){return verifyMint(mint);}
  verifyToken(mint:string){return verifyMint(mint);}
  async getMarketMetadata(mint:string){await this.verifyToken(mint);return {mint,network:'devnet',price:null,marketCap:null,notice:'Devnet identity tokens have no production market valuation.'};}
  createToken(input:{name:string;symbol:string;payerEncrypted:string;mintEncrypted:string;metadataUri:string}){return this.create(input.name,input.symbol,input.payerEncrypted,input.mintEncrypted,input.metadataUri);}
  async create(name: string,symbol: string,encrypted: string,mintEncrypted: string,metadataUri='') {
    ensure(process.env.ENABLE_DEVNET_TOKEN_LAUNCH!=='false'&&process.env.TOKEN_LAUNCH_ENABLED!=='false','DEVNET_DISABLED','Devnet token creation is disabled',503);
    const connection=rpcConnection();
    await assertDevnet(connection);
    const signer=new EncryptedDevSigner(); const payer=signer.open(encrypted); const mint=signer.open(mintEncrypted);
    if (await connection.getAccountInfo(mint.publicKey)) {
      await getMint(connection,mint.publicKey,'confirmed',TOKEN_2022_PROGRAM_ID);
      const previous=await connection.getSignaturesForAddress(mint.publicKey,{limit:1},'confirmed');
      ensure(previous[0]?.signature,'RECEIPT_PENDING','Mint exists; retry to recover its confirmed receipt',503);
      return {mint:mint.publicKey.toBase58(),signature:previous[0].signature};
    }
    const metadata={updateAuthority:payer.publicKey,mint:mint.publicKey,name,symbol,uri:metadataUri,additionalMetadata:[] as [string,string][]};
    const mintLen=getMintLen([ExtensionType.MetadataPointer]);
    const lamports=await connection.getMinimumBalanceForRentExemption(mintLen+TYPE_SIZE+LENGTH_SIZE+pack(metadata).length);
    const transaction=new Transaction().add(
      SystemProgram.createAccount({fromPubkey:payer.publicKey,newAccountPubkey:mint.publicKey,space:mintLen,lamports,programId:TOKEN_2022_PROGRAM_ID}),
      createInitializeMetadataPointerInstruction(mint.publicKey,payer.publicKey,mint.publicKey,TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(mint.publicKey,6,payer.publicKey,null,TOKEN_2022_PROGRAM_ID),
      createInitializeInstruction({programId:TOKEN_2022_PROGRAM_ID,metadata:mint.publicKey,updateAuthority:payer.publicKey,mint:mint.publicKey,mintAuthority:payer.publicKey,name,symbol,uri:metadataUri})
    );
    const signature=await sendAndConfirmTransaction(connection,transaction,[payer,mint],{commitment:'confirmed',skipPreflight:false,maxRetries:2});
    return {mint:mint.publicKey.toBase58(),signature};
  }
}
