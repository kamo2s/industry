import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import bs58 from 'bs58';
import { agentSchema, policySchema, serviceSchema, requestSchema, idempotencySchema, ensure, AppError, micro, usd, retryDelay, type AgentInput } from '../core';
import { demoMode, hash, randomToken, verifySignature } from '../core/security';
import { EncryptedDevSigner, DevnetTokenLaunchProvider, verifyMint, rpcConnection, assertDevnet } from '../agent/solana';
import { storageConfigured, uploadIcon, downloadIcon } from '../agent/storage';
import { one, type Database, type Queryable, type Row } from './connection';
import { agentView, metrics } from './metrics';
import { event, ledger, purchase, settle, refund, compileSchema, chargeAttempt } from './economy';
const jid=z.string().uuid();
const slugify=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export class Domain {
  constructor(public db: Database) {}
  async session(tx: Queryable, token?: string) { return token ? one(tx,'SELECT p.* FROM sessions s JOIN profiles p ON p.id=s.profile_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hash(token)]) : undefined; }
  async owner(tx: Queryable, profile: Row, id: string) { const a=await one(tx,'SELECT * FROM agents WHERE id=$1 FOR UPDATE',[jid.parse(id)]); ensure(a && a.creator_profile_id===profile.id,'FORBIDDEN','Only this agent’s creator can perform this action',403); return a; }
  async idempotent(tx: Queryable, profile: Row, operation: string, key: string, body: any, action: ()=>Promise<any>) {
    idempotencySchema.parse(key); const scoped=hash(`${profile.id}:${operation}:${key}`); const fingerprint=hash(JSON.stringify(body));
    // Profile lock serializes concurrent same-owner creation and spending.
    await tx.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[profile.id]);
    const old=await one(tx,'SELECT * FROM idempotency_records WHERE key=$1',[scoped]);
    if (old) { ensure(old.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','This request key was used with different data',409); return old.result; }
    const result=await action();
    await tx.query('INSERT INTO idempotency_records(key,profile_id,operation,fingerprint,result) VALUES($1,$2,$3,$4,$5)',[scoped,profile.id,operation,fingerprint,JSON.stringify(result)]);
    return result;
  }
  async create(tx: Queryable, profile: Row, c: AgentInput) {
    let tokenId=null;
    if (c.tokenMode==='existing'||c.tokenMode==='devnet') {
      const token=await verifyMint(c.mint);
      tokenId=(await one(tx,`INSERT INTO solana_tokens(mint,network,name,symbol,decimals,metadata_uri,raw_metadata) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(mint,network) DO UPDATE SET verified_at=now() RETURNING id`,[token.mint,token.network,token.name,token.symbol,token.decimals,token.metadata_uri,JSON.stringify({controlClaim:false})]))!.id;
    }
    ensure(c.tokenMode!=='devnet'||process.env.ENABLE_DEVNET_TOKEN_LAUNCH==='true','DEVNET_DISABLED','Devnet token launch requires a configured and funded devnet signer',503);
    if (c.icon) ensure(await one(tx,'SELECT id FROM uploads WHERE id=$1 AND profile_id=$2',[c.icon,profile.id]),'INVALID_UPLOAD','Choose an image uploaded by this wallet');
    for (const service of c.services) { compileSchema(service.requestSchema); compileSchema(service.responseSchema); }
    const id=randomUUID(), slug=slugify(c.name)+'-'+id.slice(0,6);
    await tx.query(`INSERT INTO agents(id,slug,creator_profile_id,name,ticker,icon_url,description,mission,job_type,category,tags,token_id,config,next_run_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,slug,profile.id,c.name,c.ticker,c.icon?`/api/uploads/${c.icon}`:'',c.description,c.mission,c.jobType,c.category,JSON.stringify(c.tags),tokenId,JSON.stringify(c),c.schedule==='interval'?new Date(Date.now()+c.intervalMinutes*60000):null]);
    for (const tool of new Set(c.tools)) await tx.query('INSERT INTO agent_tools(agent_id,tool_key) VALUES($1,$2)',[id,tool]);
    const wallet=new EncryptedDevSigner().provision();
    await tx.query(`INSERT INTO wallet_accounts(agent_id,public_address,network,signer_provider,encrypted_key_reference) VALUES($1,$2,$3,'encrypted-dev',$4)`,[id,wallet.address,c.tokenMode==='devnet'?'devnet':'sandbox',wallet.encrypted]);
    for (const s of c.services) await this.addService(tx,id,s);
    if (c.initialBudget>0) {
      ensure(demoMode(),'TEST_FUNDING_DISABLED','Test funding is available only in explicit demo mode');
      const updated=await one(tx,'UPDATE profiles SET credits=credits-$1 WHERE id=$2 AND credits>=$1 RETURNING id',[micro(c.initialBudget),profile.id]);
      ensure(updated,'INSUFFICIENT_CREDITS','Not enough test credits for initial funding');
      await ledger(tx,id,'credit','funding',micro(c.initialBudget),`initial:${id}`);
    }
    await tx.query(`INSERT INTO jobs(agent_id,type,trigger_type,payload,idempotency_key) VALUES($1,'BOOT','creation',$2,$3)`,[id,JSON.stringify({input:{topic:c.scope||c.mission}}),`boot:${id}`]);
    await event(tx,id,'created','Agent created; first operational run queued');
    return {id,slug};
  }
  async addService(tx: Queryable, agentId: string, input: unknown) {
    const s=serviceSchema.parse(input);
    compileSchema(s.requestSchema);compileSchema(s.responseSchema);
    const id=randomUUID();
    await tx.query(`INSERT INTO agent_services(id,agent_id,slug,name,description,category,request_schema,response_schema,price_amount,max_seconds,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,agentId,`${slugify(s.name)}-${id.slice(0,6)}`,s.name,s.description,s.category,JSON.stringify(s.requestSchema),JSON.stringify(s.responseSchema),micro(s.price),s.maxSeconds,s.active]);
    return {id};
  }
  async dispatch(op: string, body: any={}, token?: string): Promise<any> {
    if(op==='launch/token/devnet') return this.launchToken(body,token);
    return this.db.transaction(async tx=>{
      const profile=await this.session(tx,token);
      if (op==='auth/session') return {profile: profile ? {id:profile.id,wallet:profile.primary_wallet,credits:usd(Number(profile.credits))} : null, demo:demoMode()};
      if (op==='auth/challenge') {
        const wallet=z.string().min(32).max(44).parse(body.wallet); ensure(bs58.decode(wallet).length===32,'INVALID_WALLET','Invalid public key');
        const nonce=randomToken(),id=randomUUID(),issued=new Date(),expires=new Date(Date.now()+300000);
        const site=new URL(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000');
        const message=`${site.host} wants you to sign in with your Solana account:\n${wallet}\n\nSign in to INDUSTRY. This does not authorize transactions.\n\nURI: ${site.origin}\nVersion: 1\nChain ID: solana:devnet\nNonce: ${nonce}\nIssued At: ${issued.toISOString()}\nExpiration Time: ${expires.toISOString()}`;
        await tx.query('DELETE FROM wallet_challenges WHERE expires_at<now()');
        await tx.query('INSERT INTO wallet_challenges(id,wallet,nonce_hash,message,expires_at) VALUES($1,$2,$3,$4,$5)',[id,wallet,hash(nonce),message,expires]);
        return {id,message,expiresAt:expires};
      }
      if (op==='auth/verify') {
        const input=z.object({id:jid,wallet:z.string().max(44),signature:z.string().max(128)}).strict().parse(body);
        const challenge=await one(tx,'SELECT * FROM wallet_challenges WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE',[input.id]);
        ensure(challenge && challenge.wallet===input.wallet && verifySignature(input.wallet,challenge.message,input.signature),'AUTH_FAILED','Signature is invalid, expired, or already used',401);
        await tx.query('UPDATE wallet_challenges SET consumed_at=now() WHERE id=$1',[input.id]);
        const user=(await one(tx,'INSERT INTO profiles(primary_wallet,credits) VALUES($1,$2) ON CONFLICT(primary_wallet) DO UPDATE SET primary_wallet=excluded.primary_wallet RETURNING *',[input.wallet,demoMode()?100_000_000:0]))!;
        const session=randomToken();
        await tx.query("INSERT INTO sessions(token_hash,profile_id,expires_at) VALUES($1,$2,now()+interval '24 hours')",[hash(session),user.id]);
        return {session,profile:{id:user.id,wallet:user.primary_wallet,credits:usd(Number(user.credits))}};
      }
      if(op==='auth/logout') { if(token) await tx.query('DELETE FROM sessions WHERE token_hash=$1',[hash(token)]); return {ok:true}; }
      if(op==='rate') {
        const row=(await one(tx,`INSERT INTO rate_limits(key,hits,reset_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.hits+1 END,reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+interval '1 minute' ELSE rate_limits.reset_at END RETURNING hits`,[body.key]))!;
        return {allowed:row.hits<=(body.limit||60)};
      }
      if(op==='agents/list') {
        const rows=(await tx.query("SELECT * FROM agents WHERE visibility='public' ORDER BY created_at ASC")).rows;
        return Promise.all(rows.map(a=>agentView(tx,a)));
      }
      if(op==='agents/get') {
        const a=await one(tx,"SELECT * FROM agents WHERE (slug=$1 OR id::text=$1) AND visibility='public'",[body.id]);
        ensure(a,'NOT_FOUND','Agent not found',404);
        const own=profile?.id===a.creator_profile_id;
        const jobs=(await tx.query('SELECT id,type,status,output,last_error,created_at,finished_at FROM jobs WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 15',[a.id])).rows.map(j=>({...j,output:own||a.config.publicOutput?j.output:null}));
        const memories=(await tx.query('SELECT memory_type,summary,data,created_at FROM agent_memories WHERE agent_id=$1 AND (public OR $2) ORDER BY created_at DESC LIMIT 30',[a.id,own])).rows;
        const entries=(await tx.query('SELECT direction,category,amount,external,created_at FROM ledger_entries WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 50',[a.id])).rows.map(l=>({...l,amount:usd(Number(l.amount))}));
        const relationships=(await tx.query(`SELECT r.*,b.name buyer_name,b.slug buyer_slug,s.name seller_name,s.slug seller_slug FROM agent_relationships r JOIN agents b ON b.id=r.buyer_agent_id JOIN agents s ON s.id=r.seller_agent_id WHERE buyer_agent_id=$1 OR seller_agent_id=$1`,[a.id])).rows.map(r=>({...r,total_paid:usd(Number(r.total_paid))}));
        return {agent:await agentView(tx,a),own,jobs,memories,entries,relationships};
      }
      if(op==='services/list' || op==='services/get') {
        const rows=(await tx.query(`SELECT s.*,a.name agent_name,a.slug agent_slug FROM agent_services s JOIN agents a ON a.id=s.agent_id WHERE s.active AND a.visibility='public' ${op==='services/get'?'AND s.id=$1':''} ORDER BY s.created_at ASC`,op==='services/get'?[jid.parse(body.id)]:[])).rows;
        const result=[];
        for (const s of rows) {
          const a=(await one(tx,'SELECT * FROM agents WHERE id=$1',[s.agent_id]))!;
          const stats=(await one(tx,`SELECT count(*) n,count(*) FILTER(WHERE r.status='succeeded') completed,count(*) FILTER(WHERE r.status='succeeded' AND r.completed_at>now()-interval '1 day') jobs24h,COALESCE(sum(p.amount) FILTER(WHERE p.status='settled' AND r.completed_at>now()-interval '1 day'),0) volume24h,COALESCE(sum(p.amount) FILTER(WHERE p.status='settled'),0) revenue,COALESCE(percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM r.completed_at-r.created_at)) FILTER(WHERE r.status='succeeded'),0) latency FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE service_id=$1`,[s.id]))!;
          result.push({...s,price:usd(Number(s.price_amount)),lifecycle:(await metrics(tx,a)).lifecycle,jobs:Number(stats.completed),jobs24h:Number(stats.jobs24h),volume24h:usd(Number(stats.volume24h)),latency:Number(stats.latency),success:Number(stats.n)?Number(stats.completed)/Number(stats.n)*100:0,revenue:usd(Number(stats.revenue))});
        }
        if(op==='services/get') {ensure(result[0],'NOT_FOUND','Service not found',404);return result[0];} return result;
      }
      if(op==='activity') {
        return (await tx.query(`SELECT e.id,e.agent_id,a.name agent_name,b.name related_name,e.job_id,e.action,e.amount,e.description,e.created_at FROM activity_events e LEFT JOIN agents a ON a.id=e.agent_id LEFT JOIN agents b ON b.id=e.related_agent_id WHERE e.public ${body.agentId?'AND (e.agent_id=$2 OR e.related_agent_id=$2)':''} ORDER BY e.created_at DESC,e.id DESC LIMIT $1`,body.agentId?[Math.min(100,Number(body.limit)||30),jid.parse(body.agentId)]:[Math.min(100,Number(body.limit)||30)])).rows.map(e=>({...e,amount:e.amount===null?null:usd(Number(e.amount))}));
      }
      if(op==='network/stats') {
        const agents=(await tx.query("SELECT * FROM agents WHERE visibility='public'")).rows;
        const stats=await Promise.all(agents.map(a=>metrics(tx,a)));
        const total=(await one(tx,"SELECT COALESCE(sum(amount),0) n FROM ledger_entries WHERE category='revenue' AND external"))!;
        const series=(await tx.query(`SELECT d::date::text AS "day", (SELECT COALESCE(sum(amount),0)::float8/1000000 FROM ledger_entries WHERE category='revenue' AND external AND created_at>=d AND created_at<d+interval '1 day') revenue, (SELECT count(*)::integer FROM jobs WHERE status='succeeded' AND finished_at<d+interval '1 day') jobs, (SELECT count(*)::integer FROM agents WHERE created_at<d+interval '1 day') agents FROM generate_series(date_trunc('day',now())-interval '6 days',date_trunc('day',now()),interval '1 day') d`)).rows;
        return {agentsOnline:stats.filter(s=>s.lifecycle!=='DORMANT').length,revenue24h:stats.reduce((s,m)=>s+m.revenue24h,0),totalRevenue:usd(Number(total.n)),jobsCompleted:stats.reduce((s,m)=>s+m.jobs,0),selfSustaining:stats.filter(s=>s.lifecycle==='SELF-SUSTAINING').length,series};
      }
      if(op==='jobs/get') {
        const j=await one(tx,'SELECT j.*,a.name agent_name,a.slug agent_slug,a.config,a.creator_profile_id FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE j.id=$1',[jid.parse(body.id)]);
        ensure(j,'NOT_FOUND','Job not found',404);
        const r=await one(tx,'SELECT r.requester_profile_id,p.reference,p.network,p.status,p.amount FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.job_id=$1',[j.id]);
        const authorized=profile && (profile.id===j.creator_profile_id || profile.id===r?.requester_profile_id);
        const output=authorized||j.config.publicOutput?j.output:null;
        return {id:j.id,agent_id:j.agent_id,agent_name:j.agent_name,agent_slug:j.agent_slug,type:j.type,status:j.status,attempts:j.attempts,output,last_error:j.last_error,created_at:j.created_at,finished_at:j.finished_at,private:!output&&!j.config.publicOutput,receipt:r?{...r,requester_profile_id:undefined,amount:usd(Number(r.amount))}:null,runs:(await tx.query('SELECT kind,provider,model_or_tool,cost_amount,status,safe_metadata FROM model_tool_runs WHERE job_id=$1',[j.id])).rows.map(v=>({...v,cost:usd(Number(v.cost_amount))}))};
      }
      if(op==='providers') return {demo:demoMode(),model:process.env.OPENROUTER_API_KEY?'OpenRouter':'MockLLMProvider',payments:'DevPaymentProvider',database:process.env.DATABASE_URL?'Supabase / Postgres':'Local Postgres (PGlite)',search:process.env.SEARCH_PROVIDER_API_KEY?'Brave Search':'Curated development corpus',solana:!!(process.env.SOLANA_RPC_URL||process.env.HELIUS_API_KEY),devnetLaunch:process.env.ENABLE_DEVNET_TOKEN_LAUNCH==='true',mainnet:false,x402:false};
      if(op==='health') {const h=await one(tx,'SELECT max(heartbeat_at) last_seen FROM worker_health'); return {database:'ok',worker:h?.last_seen&&Date.now()-new Date(h.last_seen).getTime()<20000?'online':'offline',lastSeen:h?.last_seen};}
      if(op==='debug') {
        ensure(demoMode()||profile,'UNAUTHORIZED','Authenticate to inspect your own runtime jobs',401);
        const scope=demoMode()?'':" AND a.creator_profile_id=$1",params=demoMode()?[]:[profile!.id];
        const jobs=(await tx.query(`SELECT j.id,a.name agent,j.type,j.status,j.attempts,j.max_attempts,j.last_error,j.created_at,j.finished_at FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE true ${scope} ORDER BY j.created_at DESC LIMIT 50`,params)).rows;
        const counts=(await tx.query(`SELECT j.status,count(*)::integer total FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE true ${scope} GROUP BY j.status`,params)).rows;
        return {scope:demoMode()?'development network':'your agents',jobs,counts};
      }
      if(op==='uploads/get') {const u=await one(tx,'SELECT content,mime,storage_path FROM uploads WHERE id=$1',[jid.parse(body.id)]);ensure(u,'NOT_FOUND','Image not found',404);const bytes=u.storage_path?await downloadIcon(u.storage_path):Buffer.from(u.content);return {content:bytes.toString('base64'),mime:u.mime};}
      ensure(profile,'UNAUTHORIZED','Connect and authenticate a wallet to continue',401);
      if(op==='dashboard') {
        const agents=await Promise.all((await tx.query('SELECT * FROM agents WHERE creator_profile_id=$1 ORDER BY created_at DESC',[profile.id])).rows.map(a=>agentView(tx,a)));
        const requests=(await tx.query('SELECT r.*,s.name service_name,a.name agent_name FROM service_requests r JOIN agent_services s ON s.id=r.service_id JOIN agents a ON a.id=r.provider_agent_id WHERE requester_profile_id=$1 ORDER BY r.created_at DESC LIMIT 50',[profile.id])).rows;
        return {agents,requests,credits:usd(Number(profile.credits))};
      }
      if(op==='agents/create') return this.idempotent(tx,profile,op,body.key,body.input,()=>this.create(tx,profile,agentSchema.parse(body.input)));
      if(op==='tokens/verify') return verifyMint(z.string().min(32).max(44).parse(body.mint));
      if(op==='services/request') {
        const input=requestSchema.parse(body.input);idempotencySchema.parse(body.key);
        await tx.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[profile.id]);
        return purchase(tx,profile,jid.parse(body.id),input.input,body.key,input.requesterAgentId);
      }
      if(op==='uploads/create') {
        const content=Buffer.from(body.content,'base64');ensure(content.length<=262144 && body.mime==='image/webp','INVALID_IMAGE','Image must be a validated WebP under 256 KB');
        if(storageConfigured()){const id=randomUUID(),path=`${profile.id}/${id}.webp`;await uploadIcon(path,content);await tx.query('INSERT INTO uploads(id,profile_id,storage_path,mime) VALUES($1,$2,$3,$4)',[id,profile.id,path,body.mime]);return {id};}
        return (await one(tx,'INSERT INTO uploads(profile_id,content,mime) VALUES($1,$2,$3) RETURNING id',[profile.id,content,body.mime]))!;
      }
      if(op.startsWith('agents/')) {
        const a=await this.owner(tx,profile,body.id);
        if(op==='agents/pause'||op==='agents/resume') {
          const pause=op.endsWith('pause');await tx.query('UPDATE agents SET paused=$1,updated_at=now() WHERE id=$2',[pause,a.id]);
          await event(tx,a.id,pause?'paused':'resumed',pause?'Paused by creator':'Resumed by creator');return {ok:true};
        }
        if(op==='agents/update') {
          const update=z.object({policy:policySchema,mission:z.string().min(10).max(4000)}).strict().parse(body.input);
          const c={...a.config,...update};await tx.query('UPDATE agents SET mission=$1,config=$2,updated_at=now() WHERE id=$3',[c.mission,JSON.stringify(c),a.id]);
          await event(tx,a.id,'updated','Mission and spending policy updated');return {ok:true};
        }
        if(op==='agents/service') return this.idempotent(tx,profile,`${op}:${a.id}`,body.key,body.input,()=>this.addService(tx,a.id,body.input));
        if(op==='agents/fund') return this.idempotent(tx,profile,`${op}:${a.id}`,body.key,body.input,async()=>{
          ensure(demoMode(),'TEST_FUNDING_DISABLED','Test funding is available only in demo mode');const amount=micro(z.object({amount:z.number().min(0.01).max(100)}).strict().parse(body.input).amount);
          ensure(await one(tx,'UPDATE profiles SET credits=credits-$1 WHERE id=$2 AND credits>=$1 RETURNING id',[amount,profile.id]),'INSUFFICIENT_CREDITS','Not enough test credits');
          await ledger(tx,a.id,'credit','funding',amount,`fund:${profile.id}:${a.id}:${body.key}`);await event(tx,a.id,'funded','Creator added test compute credits',{amount});return {ok:true};
        });
        if(op==='agents/run') return this.idempotent(tx,profile,`${op}:${a.id}`,body.key,{},async()=>{
          ensure(!a.paused,'PAUSED','Resume this agent before requesting a run');
          const j=(await one(tx,"INSERT INTO jobs(agent_id,type,trigger_type,payload,idempotency_key) VALUES($1,'RUN','manual',$2,$3) RETURNING id",[a.id,JSON.stringify({input:{topic:a.config.scope||a.mission}}),`run:${a.id}:${body.key}`]))!; return {jobId:j.id};
        });
      }
      throw new AppError('NOT_FOUND','Endpoint not found',404);
    });
  }
  async launchToken(body:any,token?:string){
    ensure(process.env.ENABLE_DEVNET_TOKEN_LAUNCH==='true','DEVNET_DISABLED','Devnet launch requires configured RPC and dedicated test funding',503);
    const input=z.object({name:z.string().min(2).max(40),symbol:z.string().regex(/^[A-Z0-9]{2,10}$/),prepareOnly:z.boolean().optional()}).strict().parse(body.input);
    const key=idempotencySchema.parse(body.key);
    const launch=await this.db.transaction(async tx=>{
      const profile=await this.session(tx,token);ensure(profile,'UNAUTHORIZED','Authenticate a wallet first',401);
      await tx.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[profile.id]);
      const scoped=hash(`${profile.id}:token:${key}`),fingerprint=hash(`${input.name}:${input.symbol}`);
      const old=await one(tx,'SELECT * FROM token_launches WHERE idempotency_key=$1',[scoped]);
      if(old){ensure(old.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','Token identity differs from the prepared request',409);return old;}
      const signer=new EncryptedDevSigner(),payer=signer.provision(),mint=signer.provision();
      return (await one(tx,'INSERT INTO token_launches(profile_id,idempotency_key,fingerprint,name,symbol,payer_address,payer_encrypted,mint_address,mint_encrypted) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[profile.id,scoped,fingerprint,input.name,input.symbol,payer.address,payer.encrypted,mint.address,mint.encrypted]))!;
    });
    // Preparation is durable before any chain transaction. Retries reuse the same mint.
    if(launch.status==='completed')return {status:'completed',mint:launch.mint_address,signature:launch.signature};
    const connection=rpcConnection();await assertDevnet(connection);
    const {PublicKey}=await import('@solana/web3.js');
    const balance=await connection.getBalance(new PublicKey(launch.payer_address));
    if(input.prepareOnly||balance<10_000_000)return {status:'needs-test-funding',payerAddress:launch.payer_address,balanceSol:balance/1e9,requiredSol:.01,message:'Fund this generated wallet with devnet SOL only, then retry the same request.'};
    const result=await new DevnetTokenLaunchProvider().create(input.name,input.symbol,launch.payer_encrypted,launch.mint_encrypted);
    await this.db.query("UPDATE token_launches SET status='completed',signature=$1 WHERE id=$2",[result.signature,launch.id]);
    return {status:'completed',...result};
  }
  async worker(op: string,b: any): Promise<any> {
    return this.db.transaction(async tx=>{
      if(op==='heartbeat') {await tx.query('INSERT INTO worker_health(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET heartbeat_at=now()',[b.worker]); if(b.id) await tx.query('UPDATE jobs SET heartbeat_at=now() WHERE id=$1 AND lease=$2 AND status=\'running\'',[b.id,b.lease]);return {ok:true};}
      if(op==='claim') {
        const abandoned=(await tx.query("SELECT * FROM jobs WHERE status='running' AND heartbeat_at<now()-interval '90 seconds' FOR UPDATE SKIP LOCKED")).rows;
        for(const j of abandoned){await chargeAttempt(tx,j,'failed');await tx.query("UPDATE jobs SET status='queued',locked_by=NULL,lease=NULL,payload=payload-'reservedCost'-'measuredCost'-'usageRuns',run_after=now() WHERE id=$1",[j.id]);}
        const exhausted=(await tx.query("SELECT * FROM jobs WHERE status='queued' AND attempts>=max_attempts FOR UPDATE")).rows;
        for(const j of exhausted) {await tx.query("UPDATE jobs SET status='failed',last_error='Retry limit reached',finished_at=now() WHERE id=$1",[j.id]);await refund(tx,j.id);}
        const scheduled=(await tx.query("SELECT * FROM agents WHERE NOT paused AND next_run_at<=now() AND config->>'schedule'='interval' FOR UPDATE SKIP LOCKED LIMIT 10")).rows;
        for(const a of scheduled) {
          await tx.query(`INSERT INTO jobs(agent_id,type,trigger_type,payload,idempotency_key) VALUES($1,'RUN','interval',$2,$3) ON CONFLICT(idempotency_key) DO NOTHING`,[a.id,JSON.stringify({input:{topic:a.config.scope||a.mission}}),`schedule:${a.id}:${new Date(a.next_run_at).toISOString()}`]);
          await tx.query("UPDATE agents SET next_run_at=now()+($1*interval '1 minute') WHERE id=$2",[a.config.intervalMinutes,a.id]);
        }
        const candidates=(await tx.query(`SELECT j.* FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE j.status='queued' AND j.run_after<=now() AND NOT a.paused AND j.attempts<j.max_attempts AND NOT EXISTS(SELECT 1 FROM jobs r WHERE r.agent_id=j.agent_id AND r.status='running') ORDER BY j.priority DESC,j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 10`)).rows;
        for (const j of candidates) {
          const a=(await one(tx,'SELECT * FROM agents WHERE id=$1 FOR UPDATE',[j.agent_id]))!;
          if((await metrics(tx,a)).balance<a.config.policy.maxRunCost) continue;
          const lease=randomUUID();
          await tx.query("UPDATE jobs SET status='running',attempts=attempts+1,locked_by=$1,lease=$2,locked_at=now(),heartbeat_at=now(),started_at=COALESCE(started_at,now()),payload=payload||$3::jsonb WHERE id=$4",[b.worker,lease,JSON.stringify({reservedCost:micro(a.config.policy.maxRunCost)}),j.id]);
          await event(tx,a.id,'working',`${j.type} job started`,{job:j.id});
          const service=j.payload.serviceId?await one(tx,'SELECT max_seconds FROM agent_services WHERE id=$1',[j.payload.serviceId]):undefined;
          return {job:{...j,lease,attempts:j.attempts+1,maxSeconds:service?.max_seconds||60},agent:await agentView(tx,a),memories:(await tx.query('SELECT summary,data,memory_type FROM agent_memories WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 10',[a.id])).rows};
        }
        return null;
      }
      const job=await one(tx,'SELECT * FROM jobs WHERE id=$1 AND lease=$2 AND status=\'running\' FOR UPDATE',[jid.parse(b.id),jid.parse(b.lease)]);
      ensure(job,'STALE_LEASE','Worker lease no longer owns this job',409);
      const agent=(await one(tx,'SELECT * FROM agents WHERE id=$1 FOR UPDATE',[job.agent_id]))!;
      if(op==='policy') {ensure(!agent.paused,'PAUSED','Agent has been paused');return {config:agent.config};}
      if(op==='usage') {
        const cost=z.number().int().min(0).max(Number(job.payload.reservedCost)).parse(b.cost);
        const runs=z.array(z.object({kind:z.enum(['model','tool']),provider:z.string().max(80),name:z.string().max(80),cost:z.number().int().nonnegative(),metadata:z.record(z.string(),z.unknown()).optional()})).max(13).parse(b.runs);
        ensure(runs.reduce((n,r)=>n+r.cost,0)===cost,'INVALID_USAGE','Usage records must balance');
        await tx.query("UPDATE jobs SET payload=payload||$1::jsonb WHERE id=$2",[JSON.stringify({measuredCost:cost,usageRuns:runs}),job.id]);return {ok:true};
      }
      if(op==='purchase') {
        ensure(job.type!=='SERVICE','RECURSION_DENIED','Paid service jobs cannot recursively buy services');
        const profile=(await one(tx,'SELECT * FROM profiles WHERE id=$1',[agent.creator_profile_id]))!;
        return purchase(tx,profile,jid.parse(b.serviceId),b.input,`agent:${job.id}:${b.serviceId}`,agent.id,job.id);
      }
      if(op==='complete') {
        ensure(!agent.paused,'PAUSED','Agent was paused before completion');
        const cost=z.number().int().min(0).max(Number(job.payload.reservedCost)).parse(b.cost);
        ensure(JSON.stringify(b.output).length<100000,'OUTPUT_TOO_LARGE','Output exceeds the allowed size');
        await settle(tx,job,b.output);
        await chargeAttempt(tx,{...job,payload:{...job.payload,measuredCost:cost,usageRuns:b.runs}},'succeeded');
        const dependency=await one(tx,'SELECT job_id,status FROM service_requests WHERE parent_job_id=$1 ORDER BY created_at DESC LIMIT 1',[job.id]);
        if(dependency&&b.output.delegation)b.output.delegation={...b.output.delegation,status:dependency.status,jobId:dependency.job_id};
        await tx.query("UPDATE jobs SET status='succeeded',output=$1,finished_at=now(),payload=payload-'reservedCost'-'measuredCost'-'usageRuns' WHERE id=$2",[JSON.stringify(b.output),job.id]);
        await tx.query('UPDATE agents SET last_run_at=now(),health=\'OK\' WHERE id=$1',[agent.id]);
        await tx.query(`INSERT INTO agent_memories(agent_id,memory_type,summary,data,source_job_id,public) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(agent_id,source_job_id) DO NOTHING`,[agent.id,agent.job_type,String(b.output.summary).slice(0,2000),JSON.stringify(b.memory||{}),job.id,agent.config.publicOutput]);
        const unchanged=agent.job_type==='Watcher'&&b.output.monitor&&!b.output.monitor.baseline&&!b.output.monitor.changed;
        await event(tx,agent.id,'completed',agent.config.publicOutput?String(b.output.summary).slice(0,180):'Private output completed',{job:job.id,public:!unchanged});
        const m=await metrics(tx,agent);
        await tx.query('INSERT INTO treasury_snapshots(agent_id,balance_usdc,revenue_24h,revenue_7d,cost_7d,net_7d) VALUES($1,$2,$3,$4,$5,$6)',[agent.id,m.balance,m.revenue24h,m.revenue7d,m.cost7d,m.net7d]);
        return {ok:true};
      }
      if(op==='fail') {
        const final=job.attempts>=job.max_attempts||b.permanent;
        const safe=z.string().max(180).parse(b.error);
        await chargeAttempt(tx,job,'failed');
        await tx.query("UPDATE jobs SET status=$1,last_error=$2,run_after=now()+($3*interval '1 second'),locked_by=NULL,lease=NULL,payload=payload-'reservedCost'-'measuredCost'-'usageRuns',finished_at=CASE WHEN $4 THEN now() ELSE NULL END WHERE id=$5",[final?'failed':'queued',safe,retryDelay(job.attempts),final,job.id]);
        await tx.query("UPDATE agents SET health='ERROR' WHERE id=$1",[agent.id]);
        if(final) await refund(tx,job.id);
        await event(tx,agent.id,final?'failed':'retrying',safe,{job:job.id});return {ok:true};
      }
      throw new AppError('NOT_FOUND','Unknown worker operation',404);
    });
  }
}
