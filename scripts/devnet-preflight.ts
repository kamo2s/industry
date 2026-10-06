import 'dotenv/config';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { PublicKey } from '@solana/web3.js';
import { EncryptedDevSigner,rpcConnection,assertDevnet,verifyMint } from '../packages/agent/solana';
import { DEVNET_CAIP,DEVNET_USDC,X402Provider,EncryptedPaymentSigner,transactionHash } from '../packages/agent/payments';
import { bindPayment } from '../packages/db/x402';
import { AppError } from '../packages/core';
if(!process.env.WALLET_ENCRYPTION_KEY){const secrets=JSON.parse(await readFile('.data/local-secrets.json','utf8'));process.env.WALLET_ENCRYPTION_KEY=secrets.WALLET_ENCRYPTION_KEY;}
process.env.X402_FACILITATOR_URL||='https://x402.org/facilitator';
await mkdir('.data/acceptance',{recursive:true});await mkdir('qa/devnet',{recursive:true});
let wallet:{address:string;encrypted:string};
try{wallet=JSON.parse(await readFile('.data/acceptance/funding-wallet.json','utf8'));}catch{wallet=new EncryptedDevSigner().provision();await writeFile('.data/acceptance/funding-wallet.json',JSON.stringify(wallet),{mode:0o600});}
const evidence:Record<string,unknown>={checkedAt:new Date().toISOString(),network:'devnet',fundingAddress:wallet.address};
try{
  const rpc=rpcConnection();await assertDevnet(rpc);evidence.rpc='verified devnet genesis';
  let lamports=await rpc.getBalance(new PublicKey(wallet.address));
  if(process.argv.includes('--airdrop')&&lamports<50_000_000){
    try{const signature=await rpc.requestAirdrop(new PublicKey(wallet.address),1_000_000_000);evidence.airdropSignature=signature;await rpc.confirmTransaction(signature,'confirmed');lamports=await rpc.getBalance(new PublicKey(wallet.address));}
    catch{evidence.airdrop='Public RPC faucet declined or timed out; fund this address with devnet SOL.';}
  }
  evidence.balanceSol=lamports/1e9;
  const mint=await verifyMint(DEVNET_USDC);evidence.mintVerification={mint:mint.mint,network:mint.network,decimals:mint.decimals};
  const provider=new X402Provider();const requirements=await provider.requirements(wallet.address,1000,'industry:preflight');evidence.facilitator={network:requirements.network,scheme:requirements.scheme,asset:requirements.asset,v2:requirements.network===DEVNET_CAIP};
  // Construct/sign only; do not submit to the facilitator or broadcast.
  const payload=await new EncryptedPaymentSigner().sign(requirements,'http://localhost:3000/preflight',async()=>({encryptedKey:wallet.encrypted,wallet:wallet.address}));
  bindPayment(payload,{requirements});evidence.sdkSigning={validV2:true,memoBound:true,messageHash:transactionHash(payload),broadcast:false};
}catch(error){evidence.error=error instanceof AppError?error.code:'PROVIDER_UNAVAILABLE';}
await writeFile('qa/devnet/preflight.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
