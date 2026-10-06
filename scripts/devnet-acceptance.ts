import 'dotenv/config';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey,Transaction,SystemProgram,sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createTransferCheckedInstruction } from '@solana/spl-token';
import { decodePaymentRequiredHeader } from '@x402/core/http';
import { agentSchema,defaultPolicy,serviceSchema,ensure,AppError } from '../packages/core';
import { EncryptedDevSigner,rpcConnection,assertDevnet } from '../packages/agent/solana';
import { DEVNET_USDC,devnetBalance } from '../packages/agent/payments';
import { decryptSecret } from '../packages/core/security';

// Real-network acceptance only. Never substitutes the deterministic model,
// a fake mint, payment fixture, or test-credit purchase for an acceptance step.
const base=process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';
const privatePath='.data/acceptance/state.json';await mkdir('.data/acceptance',{recursive:true});await mkdir('qa/devnet',{recursive:true});
if(!process.env.WALLET_ENCRYPTION_KEY){const secrets=JSON.parse(await readFile('.data/local-secrets.json','utf8'));process.env.WALLET_ENCRYPTION_KEY=secrets.WALLET_ENCRYPTION_KEY;}
let state:any;try{state=JSON.parse(await readFile(privatePath,'utf8'));}catch{const signer=new EncryptedDevSigner();state={seller:{wallet:signer.provision(),tokenKey:randomUUID(),agentKey:randomUUID()},buyer:{wallet:signer.provision(),tokenKey:randomUUID(),agentKey:randomUUID()}};}
const save=()=>writeFile(privatePath,JSON.stringify(state,null,2),{mode:0o600});await save();
const evidence:any={startedAt:new Date().toISOString(),mode:'real-devnet',steps:[],transactions:[],complete:false};
async function request(path:string,body?:unknown,cookie?:string,key?:string){
  const response=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:new URL(base).origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
  const value=await response.json();ensure(response.ok,value.error?.code||'HTTP_ERROR',value.error?.message||'Acceptance request failed',response.status);return {value,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function login(identity:any){const challenge=(await request('auth/challenge',{wallet:identity.wallet.address})).value;const bytes=decryptSecret(identity.wallet.encrypted);try{const signature=bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.message),bytes));return (await request('auth/verify',{id:challenge.id,wallet:identity.wallet.address,signature})).cookie!;}finally{bytes.fill(0);}}
async function waitJob(id:string,cookie:string,timeout=150000){const start=Date.now();while(Date.now()-start<timeout){const job=(await request('jobs/'+id,undefined,cookie)).value;if(job.status==='succeeded')return job;ensure(!['failed','cancelled'].includes(job.status),'JOB_FAILED',job.last_error||'Acceptance job failed');await new Promise(resolve=>setTimeout(resolve,2500));}throw new AppError('WORKER_TIMEOUT','Worker did not complete the acceptance job; inspect its compute allocation and providers',503);}
try{
  const rpc=rpcConnection();await assertDevnet(rpc);const providers=(await request('providers')).value;
  for(const role of ['seller','buyer']){
    const identity=state[role];identity.cookie=await login(identity);
    identity.prepared=(await request('launch/token/devnet',{name:role==='seller'?'Acceptance Research':'Acceptance Verify',symbol:role==='seller'?'ACR':'ACV',prepareOnly:true},identity.cookie,identity.tokenKey)).value;await save();
  }
  evidence.steps.push('Two fresh wallets authenticated by single-use signatures; token preparations are durable.');
  evidence.requiredFunding=Object.fromEntries(['seller','buyer'].map(role=>[role,state[role].prepared.payerAddress||state[role].prepared.mint]));
  if(process.argv.includes('--prepare')){evidence.blocked='Prepared only. Run without --prepare after funding and configuring live model/search.';}
  else{
    ensure(providers.model==='OpenRouter','LIVE_MODEL_REQUIRED','Configure OPENROUTER_API_KEY, model and pricing in the running services before real acceptance',503);
    ensure(providers.search==='Brave Search','LIVE_SEARCH_REQUIRED','Configure SEARCH_PROVIDER_API_KEY before real research acceptance',503);
    ensure(providers.x402,'X402_REQUIRED','Configure the verified devnet V2 facilitator in the running services',503);
    const funding=JSON.parse(await readFile('.data/acceptance/funding-wallet.json','utf8')),payer=new EncryptedDevSigner().open(funding.encrypted);
    for(const role of ['seller','buyer']){
      const identity=state[role];
      if(identity.prepared.status!=='completed'){
        const destination=new PublicKey(identity.prepared.payerAddress),balance=await rpc.getBalance(destination);
        if(balance<20_000_000){ensure(await rpc.getBalance(payer.publicKey)>50_000_000,'DEVNET_SOL_REQUIRED',`Fund the acceptance wallet ${funding.address} with devnet SOL`,503);const sig=await sendAndConfirmTransaction(rpc,new Transaction().add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:destination,lamports:20_000_000-balance})),[payer],{commitment:'confirmed'});evidence.transactions.push({kind:'launch-funding',signature:sig});}
        identity.prepared=(await request('launch/token/devnet',{name:role==='seller'?'Acceptance Research':'Acceptance Verify',symbol:role==='seller'?'ACR':'ACV'},identity.cookie,identity.tokenKey)).value;await save();
      }
      ensure(identity.prepared.status==='completed','MINT_PENDING','Token launch is not confirmed',503);evidence.transactions.push({kind:'token-'+role,mint:identity.prepared.mint,signature:identity.prepared.signature});
      if(!identity.agent){
        const input=agentSchema.parse({name:role==='seller'?'ACCEPT RESEARCH':'ACCEPT VERIFY',ticker:role==='seller'?'ACR':'ACV',description:'Real devnet acceptance agent for sourced public research.',mission:'Research the official Solana account model. Retrieve https://solana.com/docs/core/accounts and explain owner, lamports and data with citations.',scope:'Solana account model official documentation',jobType:role==='seller'?'Researcher':'Verifier',category:role==='seller'?'Research':'Verification',tags:['Acceptance'],tools:['web_search','browser_fetch','marketplace'],domains:['solana.com'],tokenMode:'devnet',mint:identity.prepared.mint,initialBudget:providers.demo?10:0,policy:{...defaultPolicy,maxRunCost:.1,maxPurchase:.02,hourlySpend:1,dailySpend:2},schedule:role==='seller'?'interval':'manual',intervalMinutes:5,services:[serviceSchema.parse({name:role==='seller'?'Acceptance sourced research':'Acceptance evidence review',description:'Produce a real structured report from public primary sources.',category:role==='seller'?'Research':'Verification',price:.01,maxSeconds:120})]});
        identity.agent=(await request('agents',input,identity.cookie,identity.agentKey)).value;await save();
      }
    }
    evidence.steps.push('Both real devnet token mints permanently attached to authenticated creators.');
    for(const role of ['seller','buyer']){const detail=(await request('agents/'+state[role].agent.id,undefined,state[role].cookie)).value;ensure(detail.agent.metrics.balance>=.1,'COMPUTE_ALLOCATION_REQUIRED','An authenticated administrator must allocate compute credit to the acceptance agents',503);const initial=detail.jobs.find((j:any)=>j.type==='BOOT');const job=await waitJob(initial.id,state[role].cookie);ensure(job.output&&!job.output.demo&&job.output.sources?.length,'LIVE_RESEARCH_REQUIRED','Research did not return live sourced output');}
    evidence.steps.push('Dedicated worker completed real model + web research with persisted output.');
    const seller=(await request('agents/'+state.seller.agent.id,undefined,state.seller.cookie)).value.agent;
    const buyer=(await request('agents/'+state.buyer.agent.id,undefined,state.buyer.cookie)).value.agent;
    const sellerService=(await request('services')).value.find((s:any)=>s.agent_id===seller.id);
    const unpaid=await fetch(base+`/api/services/${sellerService.id}/invoke`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({topic:'Explain Solana account ownership from official documentation.'})});
    ensure(unpaid.status===402&&unpaid.headers.get('PAYMENT-REQUIRED'),'X402_CHALLENGE_REQUIRED','The public endpoint did not issue a V2 challenge');
    const challenge=decodePaymentRequiredHeader(unpaid.headers.get('PAYMENT-REQUIRED')!);ensure(challenge.x402Version===2,'VERSION_MISMATCH','Expected x402 V2');evidence.steps.push('Public paid endpoint returned HTTP 402 with SDK-encoded PAYMENT-REQUIRED V2.');
    const mint=new PublicKey(DEVNET_USDC),source=getAssociatedTokenAddressSync(mint,payer.publicKey),buyerATA=getAssociatedTokenAddressSync(mint,new PublicKey(buyer.treasury.public_address));
    const balance=await devnetBalance(buyer.treasury.public_address);
    if(balance<50000){ensure(await devnetBalance(funding.address)>=50000-balance,'DEVNET_USDC_REQUIRED',`Fund the acceptance wallet ${funding.address} with devnet USDC mint ${DEVNET_USDC}`,503);const transaction=new Transaction().add(...[buyer,seller].map(a=>createAssociatedTokenAccountIdempotentInstruction(payer.publicKey,getAssociatedTokenAddressSync(mint,new PublicKey(a.treasury.public_address)),new PublicKey(a.treasury.public_address),mint)),createTransferCheckedInstruction(source,mint,buyerATA,payer.publicKey,50000-balance,6));evidence.transactions.push({kind:'buyer-funding',signature:await sendAndConfirmTransaction(rpc,transaction,[payer],{commitment:'confirmed'})});}
    const update={mission:buyer.mission,policy:{...buyer.config.policy,autoHire:true,counterparties:[seller.id],preferredCategories:['Research']}};
    const res=await fetch(base+`/api/agents/${buyer.id}`,{method:'PATCH',headers:{Origin:new URL(base).origin,'Content-Type':'application/json',Cookie:state.buyer.cookie},body:JSON.stringify(update)});ensure(res.ok,'POLICY_UPDATE','Buyer policy update failed');
    state.purchaseKey||=randomUUID();await save();const run=(await request(`agents/${buyer.id}/run`,{},state.buyer.cookie,state.purchaseKey)).value;
    const buyerRun=await waitJob(run.jobId,state.buyer.cookie);ensure(buyerRun.output.delegation?.jobId,'NO_AGENT_PAYMENT','Buyer did not initiate an allowed service purchase');
    const paid=await waitJob(buyerRun.output.delegation.jobId,state.buyer.cookie);ensure(paid.receipt?.network==='devnet'&&paid.receipt.status==='settled','NOT_SETTLED','Devnet settlement did not complete');
    evidence.transactions.push({kind:'x402-agent-purchase',signature:paid.receipt.reference});
    for(const [role,category] of [['seller','revenue'],['buyer','service_purchase']]){const detail=(await request('agents/'+state[role].agent.id,undefined,state[role].cookie)).value;ensure(detail.entries.some((e:any)=>e.network==='devnet'&&e.category===category&&e.amount===.01),'LEDGER_MISSING',`Missing ${role} on-chain ledger entry`);}
    const due=Date.parse(seller.next_run_at);const deadline=Math.max(Date.now()+30000,due+120000);let scheduled:any;
    while(Date.now()<deadline){const detail=(await request('agents/'+seller.id,undefined,state.seller.cookie)).value;scheduled=detail.jobs.find((j:any)=>j.type==='RUN'&&j.status==='succeeded');if(scheduled)break;await new Promise(resolve=>setTimeout(resolve,5000));}
    ensure(scheduled,'SCHEDULER_REQUIRED','Interval scheduler has not yet completed its real research job',503);
    evidence.steps.push('Interval scheduler ran; buyer paid seller on devnet; seller delivered; both ledgers and profiles reflect the purchase.');
    evidence.complete=true;
  }
}catch(error){evidence.blocked=error instanceof AppError?`${error.code}: ${error.message}`:'Acceptance provider failed; inspect provider configuration and private local run state.';process.exitCode=2;}
await writeFile('qa/devnet/acceptance.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
