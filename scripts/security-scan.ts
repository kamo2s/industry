import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const files=[...new Set(execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
let secrets:string[]=[];
try{secrets=Object.values(JSON.parse(await readFile('.data/local-secrets.json','utf8'))).filter((v):v is string=>typeof v==='string'&&v.length>=24);}catch{}
const findings:string[]=[];let scanned=0;
for(const file of files){
  if(/(^|\/)\.env($|\.)/.test(file)&&!file.endsWith('.env.example'))findings.push(`${file}: forbidden environment file`);
  if(!/\.(?:ts|tsx|js|cjs|mjs|json|yaml|yml|md|sql|ps1|example)$/.test(file))continue;
  const body=await readFile(file,'utf8');scanned++;
  if(secrets.some(secret=>body.includes(secret)))findings.push(`${file}: local secret present`);
  if(/sk-(?:or-v1|proj)-[A-Za-z0-9_-]{30,}/.test(body)||/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(body))findings.push(`${file}: credential-like material`);
}
console.log(JSON.stringify({scannedFiles:scanned,findings}));
if(findings.length)process.exitCode=1;
