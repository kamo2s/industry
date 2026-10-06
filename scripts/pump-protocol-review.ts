import { Keypair } from '@solana/web3.js';
import { createHash } from 'node:crypto';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { launchInstructions,buildLaunch,PUMP_PROGRAM_ID,PUMP_FEE_PROGRAM_ID,PUMP_AMM_PROGRAM_ID } from '../packages/pump/adapter';
import { PUMP_DOCS_COMMIT } from '../packages/pump/config';
await mkdir('qa/pump',{recursive:true});
const idls=[];
for(const name of ['pump','pump_fees','pump_amm']){
 const published=JSON.parse(await readFile(`node_modules/@pump-fun/pump-sdk/src/idl/${name}.json`,'utf8'));
 const response=await fetch(`https://raw.githubusercontent.com/pump-fun/pump-public-docs/${PUMP_DOCS_COMMIT}/idl/${name}.json`);if(!response.ok)throw new Error('Official IDL unavailable');
 const official=await response.json();
 const relevant=['create_v2','create_fee_sharing_config','update_fee_shares_v2','distribute_creator_fees_v2','transfer_creator_fees_to_pump_v2'];
 for(const ix of published.instructions.filter((i:any)=>relevant.includes(i.name))){const expected=official.instructions.find((i:any)=>i.name===ix.name);if(JSON.stringify(ix)!==JSON.stringify(expected))throw new Error(`${name}.${ix.name}: SDK differs from pinned official IDL`);}
 idls.push({name,address:official.address,officialSha256:createHash('sha256').update(JSON.stringify(official)).digest('hex'),sdkSha256:createHash('sha256').update(JSON.stringify(published)).digest('hex'),reviewedInstructions:published.instructions.filter((i:any)=>relevant.includes(i.name)).map((i:any)=>i.name)});
}
const terms={mint:Keypair.generate().publicKey.toBase58(),creator:Keypair.generate().publicKey.toBase58(),treasury:Keypair.generate().publicKey.toBase58(),name:'INDUSTRY TEST',symbol:'ITEST',uri:'https://industry.example/api/pump/metadata/12345678-1234-4234-8234-123456789012'};
const instructions=await launchInstructions(terms);let packet:any;
try{const tx=await buildLaunch(terms,Keypair.generate().publicKey.toBase58());packet={atomic:true,bytes:tx.serialize().length,lookupTableRequired:false};}catch(e){packet={error:(e as Error).message,lookupTableRequired:true};}
const report={at:new Date().toISOString(),sdk:'@pump-fun/pump-sdk@2.0.0',officialCommit:PUMP_DOCS_COMMIT,programs:[PUMP_PROGRAM_ID,PUMP_FEE_PROGRAM_ID,PUMP_AMM_PROGRAM_ID].map(p=>p.toBase58()),idls,instructions:instructions.map(ix=>({program:ix.programId.toBase58(),accounts:ix.keys.length,dataBytes:ix.data.length})),packet,transactionsSubmitted:0};
await writeFile('qa/pump/protocol-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
