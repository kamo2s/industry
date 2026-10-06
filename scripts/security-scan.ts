import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { readFile,readdir } from 'node:fs/promises';
const files=[...new Set(execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
let secrets:string[]=[];
try{secrets=Object.values(JSON.parse(await readFile('.data/local-secrets.json','utf8'))).filter((v):v is string=>typeof v==='string'&&v.length>=24);}catch{}
try{const config=JSON.parse(await readFile('.data/staging/environment.json','utf8'));for(const [k,v] of Object.entries(config))if(/SECRET|API_KEY|ENCRYPTION_KEY|DATABASE_URL|ACCESS_HASH/.test(k)&&typeof v==='string'&&v.length>=16)secrets.push(v);}catch{}
for(const key of ['SESSION_SECRET','INTERNAL_API_SECRET','WORKER_API_SECRET','WALLET_ENCRYPTION_KEY','OPENAI_API_KEY','OPENROUTER_API_KEY','SEARCH_PROVIDER_API_KEY','HELIUS_API_KEY','BROWSERBASE_API_KEY','SUPABASE_SERVICE_ROLE_KEY','X402_FACILITATOR_TOKEN']){const value=process.env[key];if(value&&value.length>=16)secrets.push(value);}
try{for(const name of await readdir('apps/web/.next/static',{recursive:true}))if(/\.(?:js|map|html)$/.test(name))files.push('apps/web/.next/static/'+name);}catch{}
const findings:string[]=[];let scanned=0;
for(const file of files){
  if(/(^|\/)\.env($|\.)/.test(file)&&!file.endsWith('.env.example'))findings.push(`${file}: forbidden environment file`);
  if(!/\.(?:ts|tsx|js|cjs|mjs|json|yaml|yml|md|sql|ps1|example|map|html)$/.test(file))continue;
  let body:string;try{body=await readFile(file,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}scanned++;
  if(secrets.some(secret=>body.includes(secret)))findings.push(`${file}: local secret present`);
  if(/sk-(?:or-v1|proj)-[A-Za-z0-9_-]{30,}/.test(body)||/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(body))findings.push(`${file}: credential-like material`);
}
console.log(JSON.stringify({scannedFiles:scanned,findings}));
if(findings.length)process.exitCode=1;
