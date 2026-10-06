import 'dotenv/config';
import { writeFile,mkdir } from 'node:fs/promises';
import { Connection } from '@solana/web3.js';
import { PUMP_PROGRAM_ID,PUMP_FEE_PROGRAM_ID,PUMP_AMM_PROGRAM_ID,MAYHEM_PROGRAM_ID } from '@pump-fun/pump-sdk';
const url=process.env.PUMP_RPC_URL||'https://api.devnet.solana.com';
const rpc=new Connection(url,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(12000)})});
const report:any={at:new Date().toISOString(),configuredRpc:!!process.env.PUMP_RPC_URL,transactionsSubmitted:0,equivalentTestDeploymentProven:false};
try{report.genesis=await rpc.getGenesisHash();const keys=[PUMP_PROGRAM_ID,PUMP_FEE_PROGRAM_ID,PUMP_AMM_PROGRAM_ID,MAYHEM_PROGRAM_ID],accounts=await rpc.getMultipleAccountsInfo(keys,'finalized');report.programs=keys.map((k,i)=>({program:k.toBase58(),exists:!!accounts[i],executable:accounts[i]?.executable||false}));}catch(e){report.error=(e as Error).message;}
await mkdir('qa/pump',{recursive:true});await writeFile('qa/pump/preflight.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
