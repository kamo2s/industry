import {requireStagingLauncher,stagingCredits} from './staging-launch';
import {tickerSchema} from '../core';
import {supplierAvailable} from './supplier-availability';
import {logEvent} from '../core/logging';
import {assertObserverOperation,autonomousLaunch} from '../core/autonomy';
import {autonomousWork} from './autonomous-work';
import {continueCoin,queueDueCoins,waitForEligibility} from './continuation';
import {systemHealth} from './system-health';
import {appEnvironment,publicAppUrl,testEconomy} from '../core/environment';
import {reserveProviderRun,requireProviderRun} from './provider-budget';
import { providerStatus } from '../agent/provider-config';
import {liveOperations,recordOperation} from './operations';
import {readBrowserCapture,storeBrowserCapture} from './captures';
import { notifyOwner } from './notifications';
import { economyOverview } from './macro';
import { feePolicy,feePolicySchema,allocateDevelopmentFee } from './fee-policy';
import { Token2022FeeRouting } from '../agent/fee-routing';
import { PumpLaunchService } from '../pump/launch';
import { PumpCollector } from '../pump/collector';
import { publicPumpConfig,pumpConfig,pumpConnection,requirePumpCollection,assertPumpNetwork } from '../pump/config';
import { routingState,type RoutingState } from '../pump/adapter';
import { pumpFinancials } from './pump-accounting';
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
import { audit, enabled, requireAdmin, requireEnabled, operatingSpend } from './controls';
import { ServicePayments } from './x402';
import { devnetBalance, x402Configured } from '../agent/payments';
import { refundDevnetPayment } from './refunds';
import { businessRead,observeBusiness } from './business';
import { modelCatalog,validateBrain } from '../agent/catalog';
import { listWork,createWork,acceptWork,cancelWork,expireWork } from './work-market';
import { customerAccount,fundBusiness,balances,businessAccount } from './journal';
const jid=z.string().uuid();
const slugify=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export class Domain {
  private payments:ServicePayments;
  private pump:PumpLaunchService;
  public collector:PumpCollector;
  constructor(public db: Database) {this.payments=new ServicePayments(db);this.pump=new PumpLaunchService(db,(tx,p,c,proof)=>this.create(tx,p,c,proof));this.collector=new PumpCollector(db);}
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
  async create(tx: Queryable, profile: Row, c: AgentInput,pump?:{id:string;evidence:RoutingState;signature:string;metadataUri:string;launchId:string;launchSlot:number}) {
    requireStagingLauncher(profile.primary_wallet,c.tokenMode);
    await requireEnabled(tx,'agents');
    if(c.autonomyVersion===1)c={...c,schedule:'continuous'};
    await validateBrain(c.brain);
    if(appEnvironment()==='staging'&&c.schedule==='interval')ensure(c.intervalMinutes>=15,'STAGING_INTERVAL','Staging schedules require at least 15 minutes');
    ensure(c.tokenMode!=='sandbox'||testEconomy(),'TOKEN_REQUIRED','Live agents require a verified token');
    let tokenId=null;
    ensure(c.tokenMode!=='pump'||pump,'PUMP_PROOF_REQUIRED','Pump businesses activate only after independent finalized routing verification');
    if(pump){ensure(c.tokenMode==='pump'&&pump.evidence.status==='VERIFIED'&&pump.evidence.creator===profile.primary_wallet&&pump.evidence.mint===c.mint,'PUMP_PROOF_REQUIRED','Launch identity mismatch');tokenId=(await one(tx,`INSERT INTO solana_tokens(mint,network,name,symbol,decimals,metadata_uri,raw_metadata,official,creator_wallet,transaction_signature,launched_at) VALUES($1,$2,$3,$4,6,$5,$6,true,$7,$8,now()) RETURNING id`,[c.mint,pumpConfig().network,c.name,c.ticker,pump.metadataUri,JSON.stringify(pump.evidence),profile.primary_wallet,pump.signature]))!.id;}
    if (c.tokenMode==='existing'||c.tokenMode==='devnet') {
      const token=await verifyMint(c.mint);
      tokenId=(await one(tx,`INSERT INTO solana_tokens(mint,network,name,symbol,decimals,metadata_uri,raw_metadata) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(mint,network) DO UPDATE SET verified_at=now() RETURNING id`,[token.mint,token.network,token.name,token.symbol,token.decimals,token.metadata_uri,JSON.stringify({controlClaim:false})]))!.id;
      ensure(!await one(tx,'SELECT id FROM agents WHERE token_id=$1',[tokenId]),'TOKEN_ATTACHED','This mint already identifies an INDUSTRY agent',409);
      const launch=await one(tx,"SELECT * FROM token_launches WHERE mint_address=$1 AND status='completed'",[c.mint]);
      if(c.tokenMode==='devnet')ensure(launch?.profile_id===profile.id,'TOKEN_OWNERSHIP','Complete this token launch with the authenticated creator wallet',403);
      if(c.tokenMode==='existing'&&!launch)ensure(token.mintAuthority===profile.primary_wallet,'TOKEN_OWNERSHIP','Existing token attachment requires its current mint authority to authenticate',403);
      if(launch){ensure(launch.profile_id===profile.id,'TOKEN_OWNERSHIP','This launch belongs to another wallet',403);await tx.query('UPDATE solana_tokens SET official=true,creator_wallet=$1,launched_at=$2,transaction_signature=$3,metadata_uri=$4 WHERE id=$5',[profile.primary_wallet,launch.completed_at||launch.created_at,launch.signature,launch.metadata_uri,tokenId]);}
    }
    ensure(c.tokenMode!=='devnet'||process.env.ENABLE_DEVNET_TOKEN_LAUNCH!=='false','DEVNET_DISABLED','Devnet token launch is disabled',503);
    if (c.icon) ensure(await one(tx,'SELECT id FROM uploads WHERE id=$1 AND profile_id=$2',[c.icon,profile.id]),'INVALID_UPLOAD','Choose an image uploaded by this wallet');
    for (const service of c.services) { compileSchema(service.requestSchema); compileSchema(service.responseSchema); }
    if(tokenId&&!pump){const routing=await new Token2022FeeRouting().verify({mint:c.mint,creator:profile.primary_wallet,treasury:process.env.INDUSTRY_FEE_TREASURY});ensure(routing.status!=='FAILED','FEE_ROUTING_VERIFICATION_FAILED',routing.reason,409);}
    const id=pump?.id||randomUUID(), slug=slugify(c.name)+'-'+id.slice(0,6);
    await tx.query('INSERT INTO businesses(id,creator_profile_id,token_id,mode,mandate,routing_status,token_mode,mint,creator_wallet,routing_provider,routing_evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,profile.id,tokenId,pump&&pumpConfig().network==='mainnet-beta'?'MAINNET_TOKEN':tokenId?'DEVNET_TOKEN':'SANDBOX',c.mission,pump?'VERIFIED':tokenId?'PENDING':'NOT_APPLICABLE',pump?'PUMP':null,pump?c.mint:null,pump?profile.primary_wallet:null,pump?'pump.fun':null,JSON.stringify(pump?.evidence||{})]);
    if(pump){const e=pump.evidence;await tx.query('INSERT INTO pump_businesses(business_id,launch_id,network,mint,creator,treasury,sharing_config,quote_mint,quote_decimals,quote_token_program,routing_status,routing_evidence,launch_slot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,pump.launchId,pumpConfig().network,e.mint,e.creator,e.treasury,e.sharingConfig,e.quoteMint,e.quoteDecimals,e.quoteTokenProgram,e.status,JSON.stringify(e),pump.launchSlot]);}
    await tx.query(`INSERT INTO agents(id,business_id,slug,creator_profile_id,name,ticker,icon_url,description,mission,job_type,category,tags,token_id,config,next_run_at) VALUES($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,slug,profile.id,c.name,c.ticker,c.icon?`/api/uploads/${c.icon}`:'',c.description,c.mission,c.jobType,c.category,JSON.stringify(c.tags),tokenId,JSON.stringify(c),c.schedule==='continuous'?new Date():c.schedule==='interval'?new Date(Date.now()+c.intervalMinutes*60000):null]);
    for (const tool of new Set(c.tools)) await tx.query('INSERT INTO agent_tools(agent_id,tool_key) VALUES($1,$2)',[id,tool]);
    // Internal settlement needs accounts, not per-agent signing wallets.
    if(c.tokenMode!=='sandbox'&&!pump){const wallet=new EncryptedDevSigner().provision();await tx.query(`INSERT INTO wallet_accounts(agent_id,public_address,network,signer_provider,encrypted_key_reference) VALUES($1,$2,'devnet','encrypted-dev',$3)`,[id,wallet.address,wallet.encrypted]);}
    await businessAccount(tx,id,'BUSINESS_COMPUTE');await businessAccount(tx,id,'BUSINESS_OPERATING');
    for (const s of c.services) await this.addService(tx,id,s);
    if (c.initialBudget>0) {
      ensure(testEconomy(),'TEST_FUNDING_DISABLED','Test funding is available only in explicit demo mode');
      const transaction=await fundBusiness(tx,profile,id,micro(c.initialBudget),'BUSINESS_COMPUTE',`initial:${id}`);
      await ledger(tx,id,'credit','funding',micro(c.initialBudget),`initial:${id}`,{transaction});
    }
    if(c.initialOperatingBudget>0){ensure(testEconomy(),'TEST_FUNDING_DISABLED','Initial test allocation requires demo mode');const transaction=await fundBusiness(tx,profile,id,micro(c.initialOperatingBudget),'BUSINESS_OPERATING',`initial-operating:${id}`);await ledger(tx,id,'credit','funding',micro(c.initialOperatingBudget),`initial-operating:${id}`,{transaction,account:'BUSINESS_OPERATING'});}
    await tx.query(`INSERT INTO jobs(agent_id,type,trigger_type,payload,idempotency_key) VALUES($1,'BOOT','creation',$2,$3)`,[id,JSON.stringify({input:{topic:c.scope||c.mission}}),`boot:${id}`]);
    await event(tx,id,'created','Agent created; first operational run queued');
    return {id,slug:pump?c.mint:slug,businessId:id};
  }
  async addService(tx: Queryable, agentId: string, input: unknown) {
    const s=serviceSchema.parse(input);
    compileSchema(s.requestSchema);compileSchema(s.responseSchema);
    const id=randomUUID();
    await tx.query(`INSERT INTO agent_services(id,agent_id,slug,name,description,category,request_schema,response_schema,price_amount,max_seconds,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,agentId,`${slugify(s.name)}-${id.slice(0,6)}`,s.name,s.description,s.category,JSON.stringify(s.requestSchema),JSON.stringify(s.responseSchema),micro(s.price),s.maxSeconds,s.active]);
    return {id};
  }
  // Only this entry point is exposed by the public web broker. dispatch remains
  // an internal implementation/recovery primitive; workers have separate leases.
  async publicDispatch(op:string,body:any={},token?:string):Promise<any>{
    assertObserverOperation(op);
    if(op==='agents/create'||op==='pump/prepare'){
      ensure(await this.session(this.db,token),'UNAUTHORIZED','Authenticate first',401);
      body={...body,input:autonomousLaunch(body.input,testEconomy())};
    }
    if(op==='pump/submit'||op==='pump/resume'){
      const profile=await this.session(this.db,token);ensure(profile,'UNAUTHORIZED','Authenticate first',401);
      const pending=await one(this.db,'SELECT config,active_result FROM pump_launches WHERE id=$1 AND profile_id=$2',[jid.parse(body.id),profile.id]);
      ensure(pending,'NOT_FOUND','Pump launch not found',404);
      ensure(pending.active_result||pending.config.autonomyVersion===1,'LAUNCH_REVIEW_REQUIRED','This older draft needs a new review with autonomous Coin rules before signing. Existing broadcast recovery remains available.',409);
    }
    return this.dispatch(op,body,token);
  }
  async dispatch(op: string, body: any={}, token?: string): Promise<any> {
    if(op==='pump/config'){const config=publicPumpConfig();return {...config,enabled:config.enabled&&await enabled(this.db,'launches')};}
    if(op==='pump/metadata')return this.pump.metadata(body.id);
    if(['pump/prepare','pump/submit','pump/recover','pump/resume','pump/cancel','pump/status'].includes(op)){const profile=await this.session(this.db,token);ensure(profile,'UNAUTHORIZED','Authenticate first',401);if(op==='pump/cancel')return this.pump.cancel(profile,body.id);if(op==='pump/resume')return this.pump.resume(profile,body.id);if(op==='pump/prepare')return this.pump.prepare(profile,body.input,body.key);if(op==='pump/submit')return this.pump.submit(profile,body.id,body.transaction);if(op==='pump/recover')return this.pump.recover(profile,body.id);return this.pump.status(profile,body.id);}
    if(op==='agents/routing-check'){
      const profile=await this.session(this.db,token);ensure(profile,'UNAUTHORIZED','Authenticate first',401);
      const a=await one(this.db,'SELECT a.*,t.mint FROM agents a LEFT JOIN solana_tokens t ON t.id=a.token_id WHERE a.id=$1',[jid.parse(body.id)]);
      ensure(a&&a.creator_profile_id===profile.id,'FORBIDDEN','Only the business creator can verify its routing',403);
      ensure(a.mint,'NOT_APPLICABLE','Sandbox businesses have no token fee route');
      const pumpBusiness=await one(this.db,'SELECT * FROM pump_businesses WHERE business_id=$1',[a.business_id]);
      let evidence:any;
      try{if(pumpBusiness){ensure(pumpBusiness.network===pumpConfig().network,'PUMP_WRONG_CHAIN','Wrong network for routing verification');await assertPumpNetwork(pumpConnection());}evidence=pumpBusiness?(await routingState(pumpConnection(),pumpBusiness as any,Number(pumpBusiness.launch_slot))).evidence:await new Token2022FeeRouting().verify({mint:a.mint,creator:profile.primary_wallet,treasury:process.env.INDUSTRY_FEE_TREASURY});}catch{evidence={status:'FAILED',provider:'pump.fun',reason:'FEE ROUTING VERIFICATION FAILED'};}
      if(pumpBusiness)await this.db.query('UPDATE pump_businesses SET routing_status=$2 WHERE business_id=$1',[a.business_id,evidence.status]);
      await this.db.transaction(async tx=>{await tx.query('UPDATE businesses SET routing_status=$1,routing_provider=$2,routing_evidence=$3 WHERE id=$4',[evidence.status,evidence.provider,JSON.stringify(evidence),a.business_id]);await audit(tx,profile,'fee-routing-check',a.id,evidence as unknown as Record<string,unknown>);});
      return evidence;
    }
    if(op==='tokens/routing'){const profile=await this.session(this.db,token);ensure(profile,'UNAUTHORIZED','Authenticate first',401);return new Token2022FeeRouting().verify({mint:z.string().min(32).max(44).parse(body.mint),creator:profile.primary_wallet,treasury:process.env.INDUSTRY_FEE_TREASURY});}
    if(op==='models')return modelCatalog();
    if(op==='launch/token/devnet') return this.launchToken(body,token);
    if(op==='admin/refund'){const profile=await this.session(this.db,token);requireAdmin(profile);const id=jid.parse(body.id);await audit(this.db,profile!,'devnet-refund-request',null,{paymentId:id});return refundDevnetPayment(this.db,id);}
    if(op==='services/invoke')return this.payments.invoke(jid.parse(body.id),body.input,idempotencySchema.parse(body.key),body.payment);
    if(op==='agents/treasury'){const agent=await one(this.db,"SELECT a.business_id,w.public_address,w.network FROM agents a LEFT JOIN wallet_accounts w ON w.agent_id=a.id WHERE a.id=$1 AND a.visibility='public'",[jid.parse(body.id)]);ensure(agent,'NOT_FOUND','Business not found',404);return {...await balances(this.db,agent.business_id),externalCustody:agent.network==='devnet'?{address:agent.public_address,network:'devnet',balance:usd(await devnetBalance(agent.public_address))}:null,externalMovementEnabled:false};}
    return this.db.transaction(async tx=>{
      const profile=await this.session(tx,token);
      if(op==='agents/live')return liveOperations(tx,body,profile);
      if(op==='browser-captures/get')return readBrowserCapture(tx,body.id,profile);
      if (op==='auth/session') return {profile: profile ? {id:profile.id,wallet:profile.primary_wallet,credits:usd(Number((await customerAccount(tx,profile)).balance))} : null, demo:testEconomy(),environment:appEnvironment()};
      if (op==='auth/challenge') {
        const wallet=z.string().min(32).max(44).parse(body.wallet); ensure(bs58.decode(wallet).length===32,'INVALID_WALLET','Invalid public key');
        const nonce=randomToken(),id=randomUUID(),issued=new Date(),expires=new Date(Date.now()+300000);
        const site=new URL(publicAppUrl());
        // Wallet ownership is network-independent; SIWS chainId is optional. Transaction gates remain separate.
        const message=`${site.host} wants you to sign in with your Solana account:\n${wallet}\n\nSign in to INDUSTRY. This does not authorize transactions.\n\nURI: ${site.origin}\nVersion: 1\nNonce: ${nonce}\nIssued At: ${issued.toISOString()}\nExpiration Time: ${expires.toISOString()}`;
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
        await stagingCredits(tx,user);
        await customerAccount(tx,user);
        const session=randomToken();
        await tx.query("INSERT INTO sessions(token_hash,profile_id,expires_at) VALUES($1,$2,now()+interval '24 hours')",[hash(session),user.id]);
        return {session,profile:{id:user.id,wallet:user.primary_wallet,credits:usd(Number((await customerAccount(tx,user)).balance))}};
      }
      if(op==='auth/logout') { if(token) await tx.query('DELETE FROM sessions WHERE token_hash=$1',[hash(token)]); return {ok:true}; }
      if(op==='rate') {
        const row=(await one(tx,`INSERT INTO rate_limits(key,hits,reset_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.hits+1 END,reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+interval '1 minute' ELSE rate_limits.reset_at END RETURNING hits`,[body.key]))!;
        return {allowed:row.hits<=(body.limit||60)};
      }
      if(op==='economy')return {...await economyOverview(tx),pumpFees:await pumpFinancials(tx)};
      if(op==='pump/financials'){const business=await one(tx,"SELECT business_id FROM agents WHERE id=$1 AND (visibility='public' OR creator_profile_id=$2)",[jid.parse(body.id),profile?.id||null]);ensure(business,'NOT_FOUND','Business not found',404);return (await pumpFinancials(tx,business.business_id))[0]||null;}
      if(op==='treasury/policy')return feePolicy(tx);
      if(op==='work/list')return listWork(tx,profile);
      if(op==='marketplace/work')return autonomousWork(tx);
      if(['search','network/graph','network/image','agents/record'].includes(op))return businessRead(tx,op,body,profile);
      if(op==='agents/list') {
        const rows=(await tx.query("SELECT * FROM agents WHERE visibility='public' ORDER BY created_at ASC")).rows;
        return Promise.all(rows.map(a=>agentView(tx,a)));
      }
      if(op==='agents/get') {
        const a=await one(tx,"SELECT a.* FROM agents a LEFT JOIN solana_tokens t ON t.id=a.token_id WHERE (a.slug=$1 OR a.id::text=$1 OR t.mint=$1) AND a.visibility='public'",[body.id]);
        ensure(a,'NOT_FOUND','Agent not found',404);
        const own=profile?.id===a.creator_profile_id;
        const jobs=(await tx.query('SELECT id,type,status,output,last_error,created_at,finished_at FROM jobs WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 15',[a.id])).rows.map(j=>({...j,output:own||a.config.publicOutput?j.output:null}));
        const memories=(await tx.query('SELECT memory_type,summary,data,created_at FROM agent_memories WHERE agent_id=$1 AND (public OR $2) ORDER BY created_at DESC LIMIT 30',[a.id,own])).rows;
        const entries=(await tx.query('SELECT direction,category,amount,external,network,created_at FROM ledger_entries WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 50',[a.id])).rows.map(l=>({...l,amount:usd(Number(l.amount))}));
        const relationships=(await tx.query(`SELECT r.*,b.name buyer_name,b.slug buyer_slug,s.name seller_name,s.slug seller_slug FROM agent_relationships r JOIN agents b ON b.id=r.buyer_agent_id JOIN agents s ON s.id=r.seller_agent_id WHERE buyer_agent_id=$1 OR seller_agent_id=$1`,[a.id])).rows.map(r=>({...r,total_paid:usd(Number(r.total_paid))}));
        return {agent:await agentView(tx,a),own,jobs,memories,entries,relationships,ownedServices:own?(await tx.query('SELECT id,name,price_amount,active FROM agent_services WHERE agent_id=$1',[a.id])).rows:[]};
      }
      if(op==='services/list' || op==='services/get') {
        const rows=(await tx.query(`SELECT s.*,a.name agent_name,a.slug agent_slug,a.job_type agent_role,a.mission agent_mission,a.ticker,CASE WHEN a.token_id IS NOT NULL OR NULLIF(trim(a.icon_url),'') IS NOT NULL THEN '/api/network/images/'||a.id::text END image_url,w.public_address treasury_address,w.network external_network,'sandbox' network,'internal' settlement FROM agent_services s JOIN agents a ON a.id=s.agent_id LEFT JOIN wallet_accounts w ON w.agent_id=a.id WHERE (s.active OR $${op==='services/get'?'2':'1'}::boolean) AND a.visibility='public' ${op==='services/get'?'AND s.id=$1':body.agentId?'AND s.agent_id=$2':''} ORDER BY s.created_at ASC,s.id ASC ${op==='services/list'&&body.agentId?'LIMIT 32':''}`,op==='services/get'?[jid.parse(body.id),true]:body.agentId?[false,jid.parse(body.agentId)]:[false])).rows;
        const result=[];
        for (const s of rows) {
          const a=(await one(tx,'SELECT * FROM agents WHERE id=$1',[s.agent_id]))!;
          const stats=(await one(tx,`SELECT count(*) FILTER(WHERE r.status IN ('succeeded','failed')) n,count(DISTINCT r.requester_profile_id) FILTER(WHERE r.status='succeeded') customers,count(*) FILTER(WHERE r.status='failed') failures,count(*) FILTER(WHERE r.status='succeeded') completed,count(*) FILTER(WHERE r.status='succeeded' AND r.completed_at>now()-interval '1 day') jobs24h,COALESCE(sum(p.amount) FILTER(WHERE p.status='settled' AND r.completed_at>now()-interval '1 day'),0) volume24h,COALESCE(sum(p.amount) FILTER(WHERE p.status='settled'),0) revenue,COALESCE(percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM r.completed_at-r.created_at)) FILTER(WHERE r.status='succeeded'),0) latency FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE service_id=$1`,[s.id]))!;
          result.push({...s,customers:Number(stats.customers),failures:Number(stats.failures),price:usd(Number(s.price_amount)),lifecycle:(await metrics(tx,a)).lifecycle,jobs:Number(stats.completed),jobs24h:Number(stats.jobs24h),volume24h:usd(Number(stats.volume24h)),latency:Number(stats.latency),success:Number(stats.n)?Number(stats.completed)/Number(stats.n)*100:0,revenue:usd(Number(stats.revenue))});
        }
        if(op==='services/get') {ensure(result[0],'NOT_FOUND','Service not found',404);return {...result[0],recentWork:(await tx.query("SELECT j.id,j.finished_at,j.type FROM service_requests r JOIN jobs j ON j.id=r.job_id WHERE r.service_id=$1 AND r.status='succeeded' ORDER BY j.finished_at DESC LIMIT 8",[body.id])).rows};} return result;
      }
      if(op==='activity') {
        return (await tx.query(`SELECT e.id,e.agent_id,a.slug agent_slug,a.name agent_name,a.ticker agent_ticker,CASE WHEN a.token_id IS NOT NULL OR NULLIF(trim(a.icon_url),'') IS NOT NULL THEN '/api/network/images/'||a.id::text END image_url,b.name related_name,e.job_id,CASE WHEN ej.agent_id=e.agent_id THEN e.job_id WHEN er.requester_agent_id=e.agent_id THEN er.parent_job_id END live_job_id,e.action,e.amount,e.description,e.created_at FROM activity_events e LEFT JOIN agents a ON a.id=e.agent_id LEFT JOIN agents b ON b.id=e.related_agent_id LEFT JOIN jobs ej ON ej.id=e.job_id LEFT JOIN service_requests er ON er.job_id=e.job_id WHERE e.public ${body.agentId?'AND (e.agent_id=$2 OR e.related_agent_id=$2)':''} ORDER BY e.created_at DESC,e.id DESC LIMIT $1`,body.agentId?[Math.min(100,Number(body.limit)||30),jid.parse(body.agentId)]:[Math.min(100,Number(body.limit)||30)])).rows.map(e=>({...e,amount:e.amount===null?null:usd(Number(e.amount))}));
      }
      if(op==='network/stats') {
        const agents=(await tx.query("SELECT * FROM agents WHERE visibility='public'")).rows;
        const stats=await Promise.all(agents.map(a=>metrics(tx,a)));
        const total=(await one(tx,"SELECT COALESCE(sum(amount),0) n FROM ledger_entries WHERE category='revenue' AND external"))!;
        const series=(await tx.query(`SELECT d::date::text AS "day", (SELECT COALESCE(sum(amount),0)::float8/1000000 FROM ledger_entries WHERE category='revenue' AND external AND created_at>=d AND created_at<d+interval '1 day') revenue, (SELECT count(*)::integer FROM jobs WHERE status='succeeded' AND finished_at<d+interval '1 day') jobs, (SELECT count(*)::integer FROM agents WHERE created_at<d+interval '1 day') agents FROM generate_series(date_trunc('day',now())-($1::integer*interval '1 day'),date_trunc('day',now()),interval '1 day') d`,[Number(body.days)===30?29:6])).rows;
        return {agentsOnline:stats.filter(s=>s.lifecycle!=='DORMANT').length,revenue24h:stats.reduce((s,m)=>s+m.revenue24h,0),totalRevenue:usd(Number(total.n)),jobsCompleted:stats.reduce((s,m)=>s+m.jobs,0),a2aVolume:stats.reduce((n,m)=>n+(m.a2aVolume||0),0),servicesPurchased:stats.reduce((n,m)=>n+(m.servicesPurchased||0),0),customersServed:Number((await one(tx,`SELECT count(DISTINCT requester_profile_id) n FROM service_requests WHERE status='succeeded'`))!.n),jobs24h:stats.reduce((n,m)=>n+(m.jobs24h||0),0),selfSustaining:stats.filter(s=>s.lifecycle==='SELF-SUSTAINING').length,series};
      }
      if(op==='jobs/get') {
        const j=await one(tx,'SELECT j.*,a.name agent_name,a.slug agent_slug,a.config,a.creator_profile_id FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE j.id=$1',[jid.parse(body.id)]);
        ensure(j,'NOT_FOUND','Job not found',404);
        const r=await one(tx,'SELECT r.requester_profile_id,p.reference,p.network,p.status,p.amount FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.job_id=$1',[j.id]);
        const authorized=profile && (profile.id===j.creator_profile_id || profile.id===r?.requester_profile_id);
        const output=authorized||j.config.publicOutput?j.output:null;
        return {id:j.id,agent_id:j.agent_id,agent_name:j.agent_name,agent_slug:j.agent_slug,type:j.type,status:j.status,phase:j.phase,traceId:j.trace_id,runId:j.run_id,attempts:j.attempts,output,last_error:j.last_error,created_at:j.created_at,finished_at:j.finished_at,private:!output&&!j.config.publicOutput,receipt:r?{...r,requester_profile_id:undefined,amount:usd(Number(r.amount))}:null,runs:(await tx.query('SELECT kind,provider,model_or_tool,cost_amount,status,safe_metadata FROM model_tool_runs WHERE job_id=$1',[j.id])).rows.map(v=>({...v,cost:usd(Number(v.cost_amount))}))};
      }
      if(op==='providers') return {demo:testEconomy(),environment:appEnvironment(),...providerStatus(),payments:x402Configured()?'x402 V2 / devnet USDC':'DevPaymentProvider',database:process.env.DATABASE_URL?'Supabase / Postgres':'Local Postgres (PGlite)',solana:true,devnetLaunch:process.env.ENABLE_DEVNET_TOKEN_LAUNCH!=='false'&&process.env.TOKEN_LAUNCH_ENABLED!=='false',mainnet:false,x402:x402Configured()};
      if(op==='health') {const h=await one(tx,'SELECT max(heartbeat_at) last_seen FROM worker_health'); return {database:'ok',worker:h?.last_seen&&Date.now()-new Date(h.last_seen).getTime()<20000?'online':'offline',lastSeen:h?.last_seen};}
      if(op==='debug') {
        ensure(demoMode()||profile,'UNAUTHORIZED','Authenticate to inspect your own runtime jobs',401);
        const scope=demoMode()?'':" AND a.creator_profile_id=$1",params=demoMode()?[]:[profile!.id];
        const jobs=(await tx.query(`SELECT j.id,a.name agent,j.type,j.status,j.attempts,j.max_attempts,j.last_error,j.created_at,j.finished_at FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE true ${scope} ORDER BY j.created_at DESC LIMIT 50`,params)).rows;
        const counts=(await tx.query(`SELECT j.status,count(*)::integer total FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE true ${scope} GROUP BY j.status`,params)).rows;
        return {scope:demoMode()?'development network':'your agents',jobs,counts};
      }
      if(op==='uploads/get') {const u=await one(tx,'SELECT content,mime,storage_path FROM uploads WHERE id=$1',[jid.parse(body.id)]);ensure(u,'NOT_FOUND','Image not found',404);const bytes=u.storage_path?await downloadIcon(u.storage_path):Buffer.from(u.content);return {content:bytes.toString('base64'),mime:u.mime};}
      if(op==='tokens/metadata'){const launch=await one(tx,'SELECT name,symbol,mint_address FROM token_launches WHERE id=$1',[jid.parse(body.id)]);ensure(launch,'NOT_FOUND','Token not found',404);return {name:launch.name,symbol:launch.symbol,description:'An autonomous agent identity created through INDUSTRY on Solana devnet.',external_url:process.env.NEXT_PUBLIC_SITE_URL,attributes:[{trait_type:'network',value:'devnet'},{trait_type:'mint',value:launch.mint_address}]};}
      ensure(profile,'UNAUTHORIZED','Connect and authenticate a wallet to continue',401);
      if(op==='work/create')return this.idempotent(tx,profile,op,body.key,body.input,()=>createWork(tx,profile,body.input));
      if(op==='work/accept')return this.idempotent(tx,profile,op+':'+body.id,body.key,body.input,()=>acceptWork(tx,profile,body.id,body.input));
      if(op==='work/cancel')return cancelWork(tx,profile,body.id);
      if(op==='watchlist'){const rows=(await tx.query("SELECT a.*,w.created_at watched_at FROM business_watchlist w JOIN agents a ON a.business_id=w.business_id WHERE w.profile_id=$1 AND a.visibility='public' ORDER BY w.created_at DESC",[profile.id])).rows;return Promise.all(rows.map(async a=>({...await agentView(tx,a),recentActivity:await one(tx,'SELECT action,description,created_at FROM activity_events WHERE agent_id=$1 AND public ORDER BY created_at DESC LIMIT 1',[a.id])})));}
      if(op==='watchlist/set'){const input=z.object({businessId:jid,watch:z.boolean()}).strict().parse(body);ensure(await one(tx,"SELECT id FROM agents WHERE business_id=$1 AND visibility='public'",[input.businessId]),'NOT_FOUND','Business not found',404);if(input.watch)await tx.query('INSERT INTO business_watchlist(profile_id,business_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[profile.id,input.businessId]);else await tx.query('DELETE FROM business_watchlist WHERE profile_id=$1 AND business_id=$2',[profile.id,input.businessId]);return {ok:true};}
      if(op==='notifications/read'){const input=z.object({id:jid.optional(),all:z.boolean().optional()}).strict().parse(body);ensure(input.id||input.all,'INVALID_INPUT','Choose a notification or mark all read');await tx.query('UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE profile_id=$1 AND ($2::uuid IS NULL OR id=$2)',[profile.id,input.all?null:input.id]);return {ok:true};}
      if(op==='notifications')return (await tx.query('SELECT * FROM notifications WHERE profile_id=$1 ORDER BY created_at DESC LIMIT 50',[profile.id])).rows;
      if(op==='abuse/report'){const input=z.object({agentId:jid,reason:z.string().trim().min(10).max(2000)}).strict().parse(body);await tx.query('INSERT INTO abuse_reports(reporter_profile_id,agent_id,reason) VALUES($1,$2,$3)',[profile.id,input.agentId,input.reason]);return {ok:true};}
      if(op.startsWith('admin/')){
        requireAdmin(profile);
        if(op==='admin/pump-fees')return {config:publicPumpConfig(),businesses:await pumpFinancials(tx)};
        if(op==='admin/pump-collect'){requirePumpCollection();const id=jid.parse(body.businessId);ensure(await one(tx,'SELECT business_id FROM pump_businesses WHERE business_id=$1',[id]),'NOT_FOUND','Pump business not found',404);await tx.query('UPDATE pump_businesses SET collect_requested=true,next_collection_at=now() WHERE business_id=$1',[id]);await audit(tx,profile,'pump-collect-request',null,{businessId:id});return {queued:true};}
        if(op==='admin/fee-policy'){const policy=feePolicySchema.parse(body);await tx.query("INSERT INTO system_settings(key,value) VALUES('fee_allocation_policy',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify(policy)]);await audit(tx,profile,'fee-policy',null,policy);return feePolicy(tx);}
        if(op==='admin/fee-receipt'){const input=z.object({businessId:jid,amount:z.number().positive().max(10000),reference:idempotencySchema}).strict().parse(body);const result=await allocateDevelopmentFee(tx,input.businessId,micro(input.amount),input.reference);await audit(tx,profile,'development-fee-allocation',null,{receiptId:result.id});return result;}
        if(op==='admin/status')return {health:await systemHealth(tx),settings:(await tx.query("SELECT key,value FROM system_settings WHERE key LIKE 'disable_%'")).rows,jobs:(await tx.query("SELECT id,agent_id,phase,status,last_error,attempts,trace_id,run_id FROM jobs WHERE status IN ('failed','running','queued') ORDER BY created_at DESC LIMIT 100")).rows,payments:(await tx.query("SELECT id,network,status,reference,transaction_signature,amount FROM payments WHERE status<>'refunded' ORDER BY created_at DESC LIMIT 100")).rows,attempts:(await tx.query('SELECT id,status,last_error,signature,created_at FROM payment_attempts ORDER BY created_at DESC LIMIT 100')).rows,reports:(await tx.query('SELECT * FROM abuse_reports ORDER BY created_at DESC LIMIT 100')).rows,audit:(await tx.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50')).rows};
        if(op==='admin/switch'){const input=z.object({kind:z.enum(['agents','payments','launches','providers']),disabled:z.boolean()}).strict().parse(body);await tx.query('INSERT INTO system_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[`disable_${input.kind}`,JSON.stringify(input.disabled)]);await audit(tx,profile,'global-switch',null,input);return {ok:true};}
        if(op==='admin/agent'){const input=z.object({id:jid,paused:z.boolean()}).strict().parse(body);await tx.query("UPDATE agents SET paused=$1,next_run_at=CASE WHEN NOT $1 AND config->>'schedule'='continuous' THEN now() ELSE next_run_at END WHERE id=$2 AND terminated_at IS NULL",[input.paused,input.id]);await audit(tx,profile,'admin-pause',input.id,input);return {ok:true};}
        if(op==='admin/service'){const input=z.object({id:jid,active:z.boolean()}).strict().parse(body);await tx.query('UPDATE agent_services SET active=$1 WHERE id=$2',[input.active,input.id]);await audit(tx,profile,'admin-service',null,input);return {ok:true};}
        if(op==='admin/report'){const input=z.object({id:jid,status:z.enum(['reviewed','dismissed'])}).strict().parse(body);await tx.query('UPDATE abuse_reports SET status=$1 WHERE id=$2',[input.status,input.id]);await audit(tx,profile,'report-review',null,input);return {ok:true};}
        if(op==='admin/compute'){const input=z.object({id:jid,amount:z.number().positive().max(100),key:idempotencySchema}).strict().parse(body);return this.idempotent(tx,profile,op,input.key,input,async()=>{await ledger(tx,input.id,'credit','funding',micro(input.amount),`operator:${input.key}:${profile.id}`);await audit(tx,profile,'compute-allocation',input.id,{amount:input.amount});return {ok:true};});}
        throw new AppError('NOT_FOUND','Unknown administrator operation',404);
      }
      if(op==='dashboard') {
        const agents=await Promise.all((await tx.query('SELECT * FROM agents WHERE creator_profile_id=$1 ORDER BY created_at DESC',[profile.id])).rows.map(a=>agentView(tx,a)));
        const requests=(await tx.query('SELECT r.*,s.name service_name,a.name agent_name FROM service_requests r JOIN agent_services s ON s.id=r.service_id JOIN agents a ON a.id=r.provider_agent_id WHERE requester_profile_id=$1 ORDER BY r.created_at DESC LIMIT 50',[profile.id])).rows;
        const jobs=(await tx.query('SELECT j.id,j.type,j.status,j.created_at,a.name agent_name FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE a.creator_profile_id=$1 ORDER BY j.created_at DESC LIMIT 100',[profile.id])).rows;
        const services=(await tx.query('SELECT s.id,s.name,s.active,s.price_amount::float8/1000000 price,a.name agent_name,a.slug agent_slug FROM agent_services s JOIN agents a ON a.id=s.agent_id WHERE a.creator_profile_id=$1 ORDER BY s.created_at DESC',[profile.id])).rows;
        const entries=(await tx.query('SELECT l.id,l.category,l.direction,l.amount::float8/1000000 amount,l.network,l.created_at,a.name agent_name FROM ledger_entries l JOIN agents a ON a.id=l.agent_id WHERE a.creator_profile_id=$1 ORDER BY l.created_at DESC LIMIT 100',[profile.id])).rows;
        const customers=Number((await one(tx,`SELECT count(DISTINCT r.requester_profile_id) n FROM service_requests r JOIN agents a ON a.id=r.provider_agent_id JOIN ledger_entries l ON l.service_request_id=r.id AND l.category='revenue' AND l.external WHERE a.creator_profile_id=$1 AND r.status='succeeded' AND r.completed_at>now()-interval '7 days'`,[profile.id]))!.n);
        return {agents,requests,credits:usd(Number((await customerAccount(tx,profile)).balance)),jobs,services,entries,customers};
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
        ensure(!a.terminated_at,'TERMINATED','This agent has been terminated',409);
        if(op==='agents/terminate'){
          await tx.query('UPDATE agents SET paused=true,terminated_at=now(),next_run_at=NULL WHERE id=$1',[a.id]);
          await tx.query('UPDATE agent_services SET active=false WHERE agent_id=$1',[a.id]);
          const jobs=(await tx.query("SELECT * FROM jobs WHERE agent_id=$1 AND status IN ('queued','running') FOR UPDATE",[a.id])).rows;
          for(const job of jobs){await chargeAttempt(tx,job,'failed');await refund(tx,job.id);await tx.query("UPDATE jobs SET status='cancelled',phase='CANCELLED',finished_at=now(),lease=NULL,payload=payload-'reservedCost'-'measuredCost'-'usageRuns' WHERE id=$1",[job.id]);}
          await audit(tx,profile,'terminated',a.id);await event(tx,a.id,'terminated','Agent terminated by creator; identity retained');return {ok:true};
        }
        if(op==='agents/pause'||op==='agents/resume') {
          const pause=op.endsWith('pause');if(!pause)ensure(!a.token_id||(await one(tx,'SELECT routing_status FROM businesses WHERE id=$1',[a.business_id]))?.routing_status==='VERIFIED','FEE_ROUTING_VERIFICATION_FAILED','FEE ROUTING VERIFICATION FAILED',409);await tx.query('UPDATE agents SET paused=$1,updated_at=now() WHERE id=$2',[pause,a.id]);
          if(pause)await notifyOwner(tx,a.id,'paused',a.name+' paused by creator','/coins/'+a.slug,'pause:'+a.id+':'+new Date().toISOString().slice(0,13));await event(tx,a.id,pause?'paused':'resumed',pause?'Paused by creator':'Resumed by creator');return {ok:true};
        }
        if(op==='agents/update') {
          const parsed=agentSchema.pick({policy:true,mission:true,schedule:true,intervalMinutes:true,brain:true,tools:true,jobType:true,scope:true,domains:true,outputFormat:true,publicOutput:true}).partial().strict().parse(body.input);
          const update=Object.fromEntries(Object.entries(parsed).filter(([key])=>Object.hasOwn(body.input,key)));
          const c=agentSchema.parse({...a.config,...update});await validateBrain(c.brain);if(appEnvironment()==='staging'&&c.schedule==='interval')ensure(c.intervalMinutes>=15,'STAGING_INTERVAL','Staging schedules require at least 15 minutes');await tx.query('INSERT INTO business_config_history(business_id,profile_id,previous,current) VALUES($1,$2,$3,$4)',[a.business_id,profile.id,JSON.stringify(a.config),JSON.stringify(c)]);await tx.query('UPDATE businesses SET mandate=$1 WHERE id=$2',[c.mission,a.business_id]);await tx.query('UPDATE agents SET mission=$1,config=$2,job_type=$4,updated_at=now() WHERE id=$3',[c.mission,JSON.stringify(c),a.id,c.jobType]);await tx.query('DELETE FROM agent_tools WHERE agent_id=$1',[a.id]);for(const tool of c.tools)await tx.query('INSERT INTO agent_tools(agent_id,tool_key) VALUES($1,$2)',[a.id,tool]);
          if(update.schedule||update.intervalMinutes)await tx.query('UPDATE agents SET next_run_at=$1 WHERE id=$2',[c.schedule==='interval'?new Date(Date.now()+c.intervalMinutes*60000):null,a.id]);
          await audit(tx,profile,'agent-settings',a.id,{schedule:c.schedule,policy:c.policy});
          await event(tx,a.id,'updated','Mission and spending policy updated');return {ok:true};
        }
        if(op==='agents/service') return this.idempotent(tx,profile,`${op}:${a.id}`,body.key,body.input,()=>this.addService(tx,a.id,body.input));
        if(op==='agents/service-update'){const input=z.object({serviceId:jid,price:z.number().min(.001).max(10000),active:z.boolean()}).strict().parse(body.input);const row=await one(tx,'UPDATE agent_services SET price_amount=$1,active=$2 WHERE id=$3 AND agent_id=$4 RETURNING id',[micro(input.price),input.active,input.serviceId,a.id]);ensure(row,'NOT_FOUND','Service not found',404);await audit(tx,profile,'service-settings',a.id,input);return {ok:true};}
        if(op==='agents/fund') return this.idempotent(tx,profile,`${op}:${a.id}`,body.key,body.input,async()=>{
          ensure(testEconomy(),'TEST_FUNDING_DISABLED','Test funding is available only in demo mode');const input=z.object({amount:z.number().min(0.01).max(100),account:z.enum(['compute','operating']).default('compute')}).strict().parse(body.input),amount=micro(input.amount),kind=input.account==='operating'?'BUSINESS_OPERATING':'BUSINESS_COMPUTE';
          const transaction=await fundBusiness(tx,profile,a.id,amount,kind,`fund:${profile.id}:${a.id}:${body.key}`);
          await ledger(tx,a.id,'credit','funding',amount,`fund:${profile.id}:${a.id}:${body.key}`,{transaction,account:kind});await event(tx,a.id,'funded',`Creator allocated ${input.account} credits within the INDUSTRY ledger`,{amount});return {ok:true};
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
    await requireEnabled(this.db,'launches');
    ensure(process.env.ENABLE_DEVNET_TOKEN_LAUNCH!=='false','DEVNET_DISABLED','Devnet token launch is disabled',503);
    const input=z.object({name:z.string().min(2).max(40),symbol:tickerSchema,prepareOnly:z.boolean().optional()}).strict().parse(body.input);
    const key=idempotencySchema.parse(body.key);
    const launch=await this.db.transaction(async tx=>{
      const profile=await this.session(tx,token);ensure(profile,'UNAUTHORIZED','Authenticate a wallet first',401);
      await tx.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[profile.id]);
      const scoped=hash(`${profile.id}:token:${key}`),fingerprint=hash(`${input.name}:${input.symbol}`);
      const old=await one(tx,'SELECT * FROM token_launches WHERE idempotency_key=$1',[scoped]);
      if(old){ensure(old.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','Token identity differs from the prepared request',409);return old;}
      const {payer,mint}=new DevnetTokenLaunchProvider().prepareLaunch();
      return (await one(tx,'INSERT INTO token_launches(profile_id,idempotency_key,fingerprint,name,symbol,payer_address,payer_encrypted,mint_address,mint_encrypted) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[profile.id,scoped,fingerprint,input.name,input.symbol,payer.address,payer.encrypted,mint.address,mint.encrypted]))!;
    });
    // Preparation is durable before any chain transaction. Retries reuse the same mint.
    if(launch.status==='completed')return {status:'completed',mint:launch.mint_address,signature:launch.signature};
    const metadataUri=`${(publicAppUrl()).replace(/\/$/,'')}/api/tokens/${launch.id}/metadata`;
    await this.db.query('UPDATE token_launches SET metadata_uri=$1 WHERE id=$2',[metadataUri,launch.id]);
    if(input.prepareOnly)return {status:'needs-test-funding',payerAddress:launch.payer_address,balanceSol:null,requiredSol:.01,message:'Fund this generated wallet with devnet SOL only, then retry the same request.'};
    const connection=rpcConnection();await assertDevnet(connection);
    const {PublicKey}=await import('@solana/web3.js');
    const balance=await connection.getBalance(new PublicKey(launch.payer_address));
    if(input.prepareOnly||balance<10_000_000)return {status:'needs-test-funding',payerAddress:launch.payer_address,balanceSol:balance/1e9,requiredSol:.01,message:'Fund this generated wallet with devnet SOL only, then retry the same request.'};
    const result=await new DevnetTokenLaunchProvider().createToken({name:input.name,symbol:input.symbol,payerEncrypted:launch.payer_encrypted,mintEncrypted:launch.mint_encrypted,metadataUri});
    await this.db.query("UPDATE token_launches SET status='completed',signature=$1,completed_at=now() WHERE id=$2",[result.signature,launch.id]);
    return {status:'completed',...result};
  }
  async worker(op: string,b: any): Promise<any> {
    if(op==='services'){
      const services=await this.dispatch('services/list'),available=new Map<string,boolean>();
      for(const s of services){if(!available.has(s.agent_id)){const a=await one(this.db,'SELECT * FROM agents WHERE id=$1',[s.agent_id]);available.set(s.agent_id,!!a&&await supplierAvailable(this.db,a));}}
      return services.filter((s:any)=>available.get(s.agent_id));
    }
    if(op==='health')return this.dispatch('health');
    if(op==='reconcile'){const result=await this.payments.recoverPending();const refunds=(await this.db.query("SELECT payment_id FROM refund_attempts WHERE status='prepared' ORDER BY updated_at LIMIT 5")).rows;for(const row of refunds)await refundDevnetPayment(this.db,row.payment_id,true).catch(()=>{});return {...result,refunds:refunds.length};}
    return this.db.transaction(async tx=>{
      if(op==='heartbeat') {await tx.query('INSERT INTO worker_health(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET heartbeat_at=now()',[b.worker]); if(b.id) await tx.query('UPDATE jobs SET heartbeat_at=now() WHERE id=$1 AND lease=$2 AND status=\'running\'',[b.id,b.lease]);return {ok:true};}
      if(op==='claim') {
        await tx.query("INSERT INTO process_health(id,kind,state) VALUES('scheduler','scheduler','ready') ON CONFLICT(id) DO UPDATE SET heartbeat_at=now(),state='ready'");
        await expireWork(tx);
        if(!await enabled(tx,'agents'))return null;
        const abandoned=(await tx.query("SELECT * FROM jobs WHERE status='running' AND heartbeat_at<now()-interval '90 seconds' AND NOT (payload ? 'recoveryBlocked') FOR UPDATE SKIP LOCKED")).rows;
        for(const j of abandoned){
          await tx.query('SAVEPOINT recover_job');
          try {
            await chargeAttempt(tx,j,'failed');
            await tx.query("UPDATE jobs SET status='queued',locked_by=NULL,lease=NULL,payload=payload-'reservedCost'-'measuredCost'-'usageRuns',run_after=now() WHERE id=$1",[j.id]);
          } catch(error) {
            await tx.query('ROLLBACK TO SAVEPOINT recover_job');
            if(!(error instanceof AppError)||error.code!=='IDEMPOTENCY_CONFLICT')throw error;
            // Keep reserved funds intact and fence this lease; other Coins can proceed.
            await tx.query("UPDATE jobs SET lease=NULL,locked_by=NULL,last_error='Accounting reconciliation required',payload=payload||'{\"recoveryBlocked\":true}'::jsonb WHERE id=$1",[j.id]);
            await tx.query("UPDATE agents SET health='ERROR' WHERE id=$1",[j.agent_id]);
            await tx.query("INSERT INTO audit_logs(agent_id,action,details) VALUES($1,'recovery-accounting-blocked',$2)",[j.agent_id,JSON.stringify({jobId:j.id,runId:j.run_id})]);
          }
          await tx.query('RELEASE SAVEPOINT recover_job');
        }
        const exhausted=(await tx.query("SELECT * FROM jobs WHERE status='queued' AND attempts>=max_attempts FOR UPDATE")).rows;
        for(const j of exhausted) {await tx.query("UPDATE jobs SET status='failed',phase='FAILED',dead_lettered_at=now(),last_error='Retry limit reached',finished_at=now() WHERE id=$1",[j.id]);await refund(tx,j.id);const a=await one(tx,'SELECT * FROM agents WHERE id=$1 FOR UPDATE',[j.agent_id]);if(a)await continueCoin(tx,a,j,'error');}
        if(!b.serviceOnly)await queueDueCoins(tx);
        const candidates=(await tx.query(`SELECT j.* FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE j.status='queued' AND j.run_after<=now() AND NOT a.paused AND a.terminated_at IS NULL AND COALESCE(a.config->'policy'->>'killSwitch','false')<>'true' AND (a.token_id IS NULL OR EXISTS(SELECT 1 FROM businesses b WHERE b.id=a.business_id AND b.routing_status='VERIFIED')) AND j.attempts<j.max_attempts AND ($1::boolean=false OR j.type='SERVICE') AND NOT EXISTS(SELECT 1 FROM jobs r WHERE r.agent_id=j.agent_id AND r.status='running' AND (r.type='SERVICE')=(j.type='SERVICE')) ORDER BY j.priority DESC,j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 10`,[b.serviceOnly===true])).rows;
        for (const j of candidates) {
          const a=(await one(tx,'SELECT * FROM agents WHERE id=$1 FOR UPDATE',[j.agent_id]))!;
          if(await one(tx,"SELECT id FROM jobs WHERE agent_id=$1 AND status='running' AND (type='SERVICE')=$2",[a.id,j.type==="SERVICE"]))continue;
          a.config.policy=policySchema.parse(a.config.policy);
          const spend=await operatingSpend(tx,a.id),reserve=micro(a.config.policy.maxRunCost);
          if(a.token_id&&(await one(tx,'SELECT routing_status FROM businesses WHERE id=$1',[a.business_id]))?.routing_status!=='VERIFIED')continue;
          if((await balances(tx,a.business_id)).computeDebt>0){await waitForEligibility(tx,a,j,'funds');continue;}
          if(a.terminated_at||a.config.policy.killSwitch)continue;
          if(spend.hour+reserve>micro(a.config.policy.hourlySpend)||spend.day+reserve>micro(a.config.policy.dailySpend)){await waitForEligibility(tx,a,j,'budget');continue;}
          if((await metrics(tx,a)).balance<a.config.policy.maxRunCost){await waitForEligibility(tx,a,j,'funds');await notifyOwner(tx,a.id,'compute-low',a.name+' needs Compute Credits before work can continue.','/coins/'+a.slug,'compute-low:'+a.id+':'+new Date().toISOString().slice(0,10));continue;}
          const lease=randomUUID(),runId=randomUUID();
          if(!await reserveProviderRun(tx,j,a,runId,reserve)){await waitForEligibility(tx,a,j,'provider');continue;}
          await tx.query("UPDATE jobs SET status='running',attempts=attempts+1,locked_by=$1,lease=$2,locked_at=now(),heartbeat_at=now(),started_at=COALESCE(started_at,now()),payload=payload||$3::jsonb WHERE id=$4",[b.worker,lease,JSON.stringify({reservedCost:micro(a.config.policy.maxRunCost)}),j.id]);
          await tx.query("UPDATE jobs SET phase='CLAIMED',run_id=$1 WHERE id=$2",[runId,j.id]);
          if(a.config.schedule==='continuous'&&j.type!=='SERVICE')await tx.query("UPDATE agents SET autonomy_state=autonomy_state||'{\"reason\":\"working\"}'::jsonb WHERE id=$1",[a.id]);
          await event(tx,a.id,'working',`${j.type} job started`,{job:j.id,public:a.job_type!=='Watcher'});
          const service=j.payload.serviceId?await one(tx,'SELECT max_seconds,response_schema FROM agent_services WHERE id=$1',[j.payload.serviceId]):undefined;
          const dependencies=(await tx.query("SELECT DISTINCT ON(r.service_id) r.job_id AS \"jobId\",r.status,r.output AS result,s.name AS service,jsonb_build_object('providerCoinId',r.provider_agent_id,'separateJob',true,'sameOwner',p.creator_profile_id=$2::uuid,'sameBrain',p.config->>'brain'=$3::text) execution FROM service_requests r JOIN agent_services s ON s.id=r.service_id JOIN agents p ON p.id=r.provider_agent_id WHERE r.parent_job_id=$1 ORDER BY r.service_id,r.created_at DESC,r.id DESC",[j.id,a.creator_profile_id,a.config.brain])).rows;
          return {job:{...j,dependencies,run_id:runId,lease,attempts:j.attempts+1,maxSeconds:service?.max_seconds||(a.config.schedule==='continuous'?300:90),responseSchema:service?.response_schema},agent:await agentView(tx,a),memories:(await tx.query('SELECT summary,data,memory_type,created_at FROM agent_memories WHERE agent_id=$1 AND (expires_at IS NULL OR expires_at>now()) ORDER BY importance DESC,created_at DESC LIMIT 10',[a.id])).rows};
        }
        return null;
      }
      const job=await one(tx,'SELECT * FROM jobs WHERE id=$1 AND lease=$2 AND status=\'running\' FOR UPDATE',[jid.parse(b.id),jid.parse(b.lease)]);
      ensure(job,'STALE_LEASE','Worker lease no longer owns this job',409);
      const agent=(await one(tx,'SELECT * FROM agents WHERE id=$1 FOR UPDATE',[job.agent_id]))!;
      if(op==='operation')return recordOperation(tx,agent,job,b.event);
      if(op==='browser/capture')return storeBrowserCapture(tx,agent,job,b.capture);
      if(op==='policy') {await requireEnabled(tx,'agents');await requireProviderRun(tx,job,agent);ensure(!agent.paused&&!agent.terminated_at&&!agent.config.policy.killSwitch,'PAUSED','Agent has been paused');const serviceSpend=await one(tx,"SELECT COALESCE(sum(p.amount),0) amount FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.parent_job_id=$1 AND p.status<>'refunded'",[job.id]);return {config:agent.config,serviceSpentMicro:Number(serviceSpend?.amount||0),computeAvailableMicro:micro((await metrics(tx,agent)).balance)+Number(job.payload.reservedCost||0),computeDebt:(await balances(tx,agent.business_id)).computeDebt};}
      if(op==='phase'){const phase=z.enum(['RUNNING','WAITING_TOOL','WAITING_PAYMENT']).parse(b.phase);await tx.query('UPDATE jobs SET phase=$1 WHERE id=$2',[phase,job.id]);if(process.env.NODE_ENV!=='test')logEvent('runtime','phase_changed',{trace_id:job.trace_id,run_id:job.run_id,job_id:job.id,agent_id:agent.id,business_id:agent.business_id,phase});return {ok:true};}
      if(op==='index/query'){const query=z.string().max(1000).parse(b.query||'');return (await tx.query("SELECT url,title,content,updated_at FROM indexed_records WHERE agent_id=$1 AND ($2='' OR to_tsvector('english',title||' '||content) @@ plainto_tsquery('english',$2)) ORDER BY updated_at DESC LIMIT 50",[agent.id,query])).rows;}
      if(op==='usage') {
        // Preserve reported provider overages as real cost; completion still
        // rejects an over-budget run. Do not erase incurred cost on failure.
        const cost=z.number().int().min(0).max(micro(10000)).parse(b.cost);
        const runs=z.array(z.object({kind:z.enum(['model','tool']),provider:z.string().max(80),name:z.string().max(80),cost:z.number().int().nonnegative(),metadata:z.record(z.string(),z.unknown()).optional()})).max(32).parse(b.runs);
        ensure(runs.reduce((n,r)=>n+r.cost,0)===cost,'INVALID_USAGE','Usage records must balance');
        await tx.query("UPDATE jobs SET payload=payload||$1::jsonb WHERE id=$2",[JSON.stringify({measuredCost:cost,usageRuns:runs}),job.id]);return {ok:true};
      }
      if(op==='dependency'){
        const row=await one(tx,`SELECT j.status,r.output,jsonb_build_object('jobId',j.id,'providerCoinId',j.agent_id,'separateJob',j.id<>$1,'sameOwner',a.creator_profile_id=$3::uuid,'sameBrain',a.config->>'brain'=$4::text,'startedAt',j.started_at,'finishedAt',j.finished_at) execution
          FROM service_requests r JOIN jobs j ON j.id=r.job_id JOIN agents a ON a.id=j.agent_id WHERE r.parent_job_id=$1 AND j.id=$2`,[job.id,jid.parse(b.jobId),agent.creator_profile_id,agent.config.brain]);
        ensure(row,'NOT_FOUND','Supplier job is not a dependency of this mission',404);return row;
      }
      if(op==='purchase') {
        ensure(job.type!=='SERVICE','RECURSION_DENIED','Paid service jobs cannot recursively buy services');
        const profile=(await one(tx,'SELECT * FROM profiles WHERE id=$1',[agent.creator_profile_id]))!;
        const serviceId=jid.parse(b.serviceId);
        const previous=await one(tx,'SELECT r.*,p.status payment_status FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.parent_job_id=$1 AND r.service_id=$2 ORDER BY r.created_at DESC,r.id DESC LIMIT 1',[job.id,serviceId]);
        // A retry resumes an existing pending/delivered dependency even if its
        // newly discovered evidence differs. A refunded failure can be replaced
        // once per parent attempt; it cannot strand the parent permanently.
        if(previous&&previous.status!=='failed')return {id:previous.id,jobId:previous.job_id};
        ensure(!previous||previous.payment_status==='refunded','SUPPLIER_REFUND_PENDING','Failed supplier payment requires reconciliation before retry',503);
        return purchase(tx,profile,serviceId,b.input,`agent:${job.id}:${serviceId}:attempt:${job.attempts}`,agent.id,job.id);
      }
      if(op==='await-supplier') {
        ensure(job.type!=='SERVICE','RECURSION_DENIED','A supplier cannot wait on another supplier');
        ensure(await one(tx,"SELECT id FROM service_requests WHERE parent_job_id=$1 AND status NOT IN ('succeeded','failed','cancelled') LIMIT 1",[job.id]),'DEPENDENCY_FINISHED','Supplier state changed; retry the operation',503);
        await chargeAttempt(tx,job,'succeeded');
        await tx.query("UPDATE jobs SET status='queued',phase='WAITING_SUPPLIER',last_error=NULL,run_after=now()+interval '60 seconds',attempts=GREATEST(0,attempts-1),lease=NULL,locked_by=NULL,payload=payload-'reservedCost'-'measuredCost'-'usageRuns' WHERE id=$1",[job.id]);
        return {ok:true};
      }
      if(op==='defer') {
    
    await requireEnabled(tx,'agents');
        ensure(agent.config.schedule==='continuous'&&job.type!=='SERVICE','INVALID_DEFER','Only a continuous mission can wait for new work');
        ensure(!agent.paused&&!agent.terminated_at&&!agent.config.policy.killSwitch,'PAUSED','Coin execution is paused');
        const decision=z.object({reason:z.enum(['no-useful-work','awaiting-data']),seconds:z.number().int().min(30).max(3600)}).parse(b.deferred);
        ensure(!await one(tx,"SELECT r.id FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.parent_job_id=$1 AND NOT (r.status='failed' AND p.status='refunded') LIMIT 1",[job.id]),'DEPENDENCY_EXISTS','A purchased job must finish before this mission can wait');
        ensure(Number(job.payload.measuredCost||0)<=Number(job.payload.reservedCost||0),'RUN_LIMIT','Planning cost exceeds the run reservation');
        await chargeAttempt(tx,job,'succeeded');
        await tx.query("UPDATE jobs SET status='waiting',phase='WAITING_INPUT',last_error=NULL,finished_at=now(),lease=NULL,locked_by=NULL,payload=(payload-'reservedCost'-'measuredCost'-'usageRuns')||$1::jsonb WHERE id=$2",[JSON.stringify({waitReason:decision.reason}),job.id]);
        await tx.query("UPDATE agents SET health='OK',last_run_at=now() WHERE id=$1",[agent.id]);
        await continueCoin(tx,agent,job,'waiting',decision.seconds);
        await event(tx,agent.id,'waiting','Waiting for new useful work; the next eligibility check is scheduled.',{job:job.id});
        return {ok:true};
      }
      if(op==='complete') {
    
    await requireEnabled(tx,'agents');ensure(!agent.paused&&!agent.terminated_at,'PAUSED','Agent was paused before completion');
        const cost=z.number().int().min(0).max(Number(job.payload.reservedCost)).parse(b.cost);
        if(agent.config.autonomyVersion===1||agent.config.schedule==='continuous'){
          const spent=await one(tx,"SELECT COALESCE(sum(p.amount),0) amount FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.parent_job_id=$1 AND p.status<>'refunded'",[job.id]);
          ensure(cost+Number(spent?.amount||0)<=micro(agent.config.policy.maxRunCost),'RUN_LIMIT','Combined compute and service cost exceeds the run limit');
        }
        ensure(JSON.stringify(b.output).length<100000,'OUTPUT_TOO_LARGE','Output exceeds the allowed size');
        ensure(!await one(tx,"SELECT id FROM (SELECT DISTINCT ON (service_id) id,status FROM service_requests WHERE parent_job_id=$1 ORDER BY service_id,created_at DESC,id DESC) latest WHERE status<>'succeeded' LIMIT 1",[job.id]),'SUPPLIER_INCOMPLETE','Supplier results must be delivered before completing the mission',503);
        await settle(tx,job,b.output);
        await chargeAttempt(tx,{...job,payload:{...job.payload,measuredCost:cost,usageRuns:b.runs}},'succeeded');
        const dependency=await one(tx,'SELECT job_id,status FROM service_requests WHERE parent_job_id=$1 ORDER BY created_at DESC LIMIT 1',[job.id]);
        if(dependency&&b.output.delegation)b.output.delegation={...b.output.delegation,status:dependency.status,jobId:dependency.job_id};
        await tx.query("UPDATE jobs SET status='succeeded',last_error=NULL,output=$1,finished_at=now(),payload=payload-'reservedCost'-'measuredCost'-'usageRuns' WHERE id=$2",[JSON.stringify(b.output),job.id]);
        await tx.query("UPDATE jobs SET phase='COMPLETED' WHERE id=$1",[job.id]);
        await tx.query('UPDATE agents SET last_run_at=now(),health=\'OK\' WHERE id=$1',[agent.id]);
        await tx.query(`INSERT INTO agent_memories(agent_id,memory_type,summary,data,source_job_id,public) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(agent_id,source_job_id) DO NOTHING`,[agent.id,agent.job_type,String(b.output.summary).slice(0,2000),JSON.stringify(b.memory||{}),job.id,agent.config.publicOutput]);
        if(agent.job_type==='Indexer')for(const entry of (b.memory?.entries||[]).slice(0,50)){
          const record=z.object({url:z.string().url().max(2000),title:z.string().max(500),evidence:z.string().max(24000)}).passthrough().parse(entry);
          await tx.query(`INSERT INTO indexed_records(agent_id,url,title,content,fingerprint,source_job_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(agent_id,url) DO UPDATE SET title=excluded.title,content=excluded.content,fingerprint=excluded.fingerprint,source_job_id=excluded.source_job_id,updated_at=now()`,[agent.id,record.url,record.title,record.evidence,hash(record.evidence),job.id]);
        }
        const unchanged=['Watcher','Reporter'].includes(agent.job_type)&&b.output.monitor&&!b.output.monitor.baseline&&!b.output.monitor.changed;
        await observeBusiness(tx,agent);
        await event(tx,agent.id,'completed',agent.config.publicOutput?String(b.output.summary).slice(0,180):'Private output completed',{job:job.id,public:!unchanged});
        if(!unchanged)await notifyOwner(tx,agent.id,job.type==='SERVICE'?'job-completed':'mission-completed',agent.name+(job.type==='SERVICE'?' delivered paid work.':' completed autonomous mission work.'),'/jobs/'+job.id,'complete:'+job.id);
        await continueCoin(tx,agent,job,'ready');
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
        await tx.query("UPDATE jobs SET phase=$1,dead_lettered_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$3",[final?'FAILED':'RETRYING',final,job.id]);
        if(final){await continueCoin(tx,agent,job,'error');await refund(tx,job.id);await notifyOwner(tx,agent.id,'job-failed',agent.name+': '+safe,'/jobs/'+job.id,'failed:'+job.id);}
        await event(tx,agent.id,final?'failed':'retrying',safe,{job:job.id});return {ok:true};
      }
      throw new AppError('NOT_FOUND','Unknown worker operation',404);
    });
  }
}
