// Operator-run offline import. Never pass a secret as a command-line argument.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const expected='5YqYKz8jrRgwXrbbozqC6N3hzMTe7nFzLqr2hetZPudW';
const folder=resolve(root,'.data','pump-collector-secrets');
const target=resolve(folder,'collector.json');
function hiddenInput(){
  return new Promise((accept,reject)=>{
    let value='';
    process.stdout.write('Paste the collector Solana private key (hidden), then Enter: ');
    process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.resume();
    const finish=()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.removeListener('data',onData);process.stdout.write('\n');};
    const onData=chunk=>{
      for(const ch of chunk){
        if(ch==='\u0003'){value='';finish();reject(new Error('Cancelled'));return;}
        if(ch==='\r'||ch==='\n'){finish();accept(value.trim());value='';return;}
        if(ch==='\u007f'||ch==='\b')value=value.slice(0,-1);
        else if(/[1-9A-HJ-NP-Za-km-z]/.test(ch))value+=ch;
        else {value='';finish();reject(new Error('Use the Solana private key, not a recovery phrase'));return;}
        if(value.length>100){value='';finish();reject(new Error('Invalid key length'));return;}
      }
    };
    process.stdin.on('data',onData);
  });
}
let bytes,signer;
try {
  if(process.platform!=='win32'||!process.stdin.isTTY)throw new Error('Run this helper in an interactive Windows terminal');
  if(existsSync(folder))throw new Error('Collector folder already exists; refusing to overwrite existing secrets');
  let input=await hiddenInput();
  try{bytes=bs58.decode(input);signer=Keypair.fromSecretKey(bytes);}catch{throw new Error('Invalid Solana private key');}finally{input='';}
  if(signer.publicKey.toBase58()!==expected)throw new Error('Wrong wallet: this key does not match the configured collector');
  const identity=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true});
  const sid=identity.match(/S-1-5-\d+(?:-\d+)+/)?.[0];
  if(!sid)throw new Error('Could not identify the current Windows account');
  mkdirSync(folder);
  // New folder: remove inherited access before writing any secret material.
  execFileSync('icacls',[folder,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`],{stdio:'pipe',windowsHide:true});
  writeFileSync(target,JSON.stringify(Array.from(bytes)),{flag:'wx',mode:0o600});
  const envPath=resolve(root,'.env');let env=readFileSync(envPath,'utf8');
  const line='PUMP_COLLECTOR_KEYPAIR_FILE="'+target.replaceAll('\\','/')+'"';
  env=/^PUMP_COLLECTOR_KEYPAIR_FILE=.*$/m.test(env)?env.replace(/^PUMP_COLLECTOR_KEYPAIR_FILE=.*$/m,line):env+'\n'+line+'\n';
  writeFileSync(envPath,env);
  console.log('Collector address verified. Protected keypair saved and .env path configured.');
  console.log('Collection and launch switches were not changed. Clear the copied key from clipboard/history.');
}catch(error){
  // Never print library errors or raw input: they may contain sensitive material.
  const safe=['Cancelled','Use the Solana private key, not a recovery phrase','Invalid key length','Invalid Solana private key','Wrong wallet: this key does not match the configured collector','Run this helper in an interactive Windows terminal','Collector folder already exists; refusing to overwrite existing secrets','Could not identify the current Windows account'];
  console.error(safe.includes(error.message)?error.message:'Import could not finish. No secret values were printed.');process.exitCode=1;
}finally{bytes?.fill(0);signer?._keypair?.secretKey?.fill(0);}
