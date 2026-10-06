import 'dotenv/config';
import { writeFile,mkdir } from 'node:fs/promises';
import { NATIVE_MINT } from '@solana/spl-token';
import { receiptPrice } from '../packages/pump/pricing';
const report:any={at:new Date().toISOString(),purpose:'Read-only oracle connectivity probe; not a fee receipt',keyConfigured:!!process.env.PYTH_API_KEY,transactionsSubmitted:0};
try{report.price=await receiptPrice(NATIVE_MINT.toBase58(),Math.floor(Date.now()/1000)-30);report.status='available';}catch(e){report.status='unavailable';report.error=(e as Error).message;}
await mkdir('qa/pump',{recursive:true});await writeFile('qa/pump/oracle-preflight.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
