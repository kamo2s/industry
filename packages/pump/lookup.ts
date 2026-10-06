import { Keypair,PublicKey } from '@solana/web3.js';
import { launchInstructions } from './adapter';
// Intersect two independent launches: only stable program/global/treasury keys
// remain. Mint, creator and every mint-specific PDA stay out of this setup plan.
export async function launchLookupAddresses(treasury:PublicKey){const make=()=>({mint:Keypair.generate().publicKey.toBase58(),creator:Keypair.generate().publicKey.toBase58(),treasury:treasury.toBase58(),name:'Lookup plan',symbol:'PLAN',uri:'https://industry.example/metadata'});const keys=async()=>new Map((await launchInstructions(make())).flatMap(ix=>ix.keys.filter(k=>!k.isSigner).map(k=>[k.pubkey.toBase58(),k.pubkey] as const)));const a=await keys(),b=await keys();return [...a].filter(([key])=>b.has(key)).map(([,key])=>key);}
