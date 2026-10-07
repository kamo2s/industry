import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Keypair} from '@solana/web3.js';

// Database service only. Never pass this secret to the web or AI worker.
export async function prepareCollectorKey(env:Record<string,string|undefined>=process.env){
 const raw=env.PUMP_COLLECTOR_KEYPAIR_JSON;
 delete env.PUMP_COLLECTOR_KEYPAIR_JSON;
 if(!raw)return;
 let bytes:Uint8Array|undefined,signer:Keypair|undefined,folder:string|undefined;
 try{
  const values=JSON.parse(raw);
  if(!Array.isArray(values)||values.length!==64||!values.every(v=>Number.isInteger(v)&&v>=0&&v<=255))throw Error();
  bytes=Uint8Array.from(values);values.fill(0);signer=Keypair.fromSecretKey(bytes);
  if(signer.publicKey.toBase58()!==env.INDUSTRY_FEE_COLLECTOR||signer.publicKey.toBase58()===env.INDUSTRY_FEE_TREASURY)throw Error();
  folder=await mkdtemp(path.join(tmpdir(),'industry-collector-'));
  const file=path.join(folder,'collector.json');
  await writeFile(file,JSON.stringify(Array.from(bytes)),{mode:0o600,flag:'wx'});
  env.PUMP_COLLECTOR_KEYPAIR_FILE=file;
 }catch{
  if(folder)await rm(folder,{recursive:true,force:true});
  throw new Error('Collector key configuration is invalid; expected the configured operational wallet');
 }finally{bytes?.fill(0);signer?.secretKey.fill(0);}
}
