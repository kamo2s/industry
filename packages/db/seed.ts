import { randomUUID } from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { agentSchema, defaultPolicy, micro } from '../core';
import { Domain } from './domain';
import { one, type Database } from './connection';
import { ledger, event } from './economy';
export const seedAgents=[
  {name:'PULSE',type:'Researcher',category:'Research',description:'Tracks and analyzes new AI model releases, research papers and industry news.',tags:['Research','AI','News'],revenue:84.71,cost:24.2,service:'AI release research',price:0.010},
  {name:'SEARCH',type:'Researcher',category:'Research',description:'Advanced web research agent that finds, organizes and delivers information.',tags:['Research','Data','Web'],revenue:52.18,cost:18.7,service:'Research a topic',price:0.004},
  {name:'VERIFY',type:'Verifier',category:'Verification',description:'Fact-checks information and verifies on-chain and off-chain data.',tags:['Verification','Data','Security'],revenue:37.42,cost:13.4,service:'Verify a claim',price:0.003},
  {name:'TREND',type:'Watcher',category:'Analysis',description:'Analyzes market trends across crypto, AI and tech.',tags:['Trading','Analysis','Markets'],revenue:61.03,cost:23.1,service:'Technology trend brief',price:0.006},
  {name:'INDEX',type:'Indexer',category:'Data',description:'Indexes and categorizes valuable information for other agents.',tags:['Data','Storage','Infrastructure'],revenue:29.11,cost:32.8,service:'Query knowledge index',price:0.002}
];
export async function seed(db: Database) {
  if(await one(db,"SELECT 1 FROM system_settings WHERE key='demo_seed_v1'")) {
    // Upgrade only the two initial development fixture identities. No known
    // signing seed is retained for seeded agents, and economic history stays intact.
    if(!await one(db,"SELECT 1 FROM system_settings WHERE key='random_fixture_identities_v1'"))await db.transaction(async tx=>{
      for(const name of ['Demo network curator','Demo customer'])await tx.query('UPDATE profiles SET primary_wallet=$1 WHERE display_name=$2',[bs58.encode(nacl.sign.keyPair().publicKey),name]);
      await tx.query("INSERT INTO system_settings(key,value) VALUES('random_fixture_identities_v1','true')");
    });
    return;
  }
  const domain=new Domain(db);
  await db.transaction(async tx=>{
    const owner=(await one(tx,'INSERT INTO profiles(primary_wallet,credits,display_name) VALUES($1,1000000000,\'Demo network curator\') RETURNING *',[bs58.encode(nacl.sign.keyPair().publicKey)]))!;
    const customer=(await one(tx,'INSERT INTO profiles(primary_wallet,credits,display_name) VALUES($1,1000000000,\'Demo customer\') RETURNING *',[bs58.encode(nacl.sign.keyPair().publicKey)]))!;
    const ids:string[]=[];
    for (const [i,s] of seedAgents.entries()) {
      const config=agentSchema.parse({name:s.name,ticker:s.name,description:s.description,mission:s.description+' Produce concise structured reports with evidence and uncertainty.',category:s.category,tags:s.tags,jobType:s.type,tools:['web_search','browser_fetch','marketplace'],tokenMode:'sandbox',initialBudget:50,policy:{...defaultPolicy,autoHire:true,maxRunCost:0.02},scope:i===0?'AI model releases':s.service,services:[{name:s.service,description:s.description,category:s.category,price:s.price}]});
      const a=await domain.create(tx,owner,config);ids.push(a.id);
      await tx.query("UPDATE agents SET slug=$1,created_at=now()-interval '7 days',last_run_at=now()-interval '2 minutes' WHERE id=$2",[s.name.toLowerCase(),a.id]);
      await tx.query("UPDATE jobs SET status='succeeded',output=$1,finished_at=now()-interval '7 days',created_at=now()-interval '7 days' WHERE agent_id=$2",[JSON.stringify({summary:'Development seed: initial run completed.',sources:[],demo:true}),a.id]);
      const service=(await one(tx,'SELECT id FROM agent_services WHERE agent_id=$1',[a.id]))!;
      for(let day=0;day<7;day++) {
        const time=new Date(Date.now()-day*86400000-90000);
        const amount=day===0?micro(s.revenue)-Math.floor(micro(s.revenue)/7)*6:Math.floor(micro(s.revenue)/7);
        const jobId=randomUUID(),paymentId=randomUUID(),requestId=randomUUID();
        const output={summary:`Development seed: ${s.service} completed with a sourced structured report.`,sources:[{title:'Solana documentation',url:'https://solana.com/docs',snippet:'Developer documentation and public reference material.'}],demo:true};
        await tx.query(`INSERT INTO jobs(id,agent_id,type,trigger_type,payload,output,status,idempotency_key,created_at,started_at,finished_at) VALUES($1,$2,'SERVICE','seed',$3,$4,'succeeded',$5,$6,$6,$6::timestamptz+interval '8 seconds')`,[jobId,a.id,JSON.stringify({input:{topic:'Historical demo batch'}}),JSON.stringify(output),`seed-job:${jobId}`,time]);
        await tx.query(`INSERT INTO payments(id,provider,network,payer_address,payee_address,amount,status,reference,idempotency_key,created_at,confirmed_at) VALUES($1,'dev','sandbox',$2,$3,$4,'settled',$5,$5,$6,$6)`,[paymentId,customer.primary_wallet,a.id,amount,`seed:${paymentId}`,time]);
        await tx.query(`INSERT INTO service_requests(id,service_id,requester_profile_id,provider_agent_id,input,output,status,payment_id,job_id,idempotency_key,created_at,completed_at) VALUES($1,$2,$3,$4,$5,$6,'succeeded',$7,$8,$9,$10,$10::timestamptz+interval '8 seconds')`,[requestId,service.id,customer.id,a.id,JSON.stringify({topic:'Historical demo batch'}),JSON.stringify(output),paymentId,jobId,`seed:${requestId}`,time]);
        await ledger(tx,a.id,'credit','revenue',amount,`seed-revenue:${requestId}`,{payment:paymentId,request:requestId,job:jobId,external:true});
        const cost=day===0?micro(s.cost)-Math.floor(micro(s.cost)/7)*6:Math.floor(micro(s.cost)/7);
        await ledger(tx,a.id,'debit','compute',cost,`seed-cost:${jobId}`,{job:jobId});
        await tx.query('UPDATE ledger_entries SET created_at=$1 WHERE job_id=$2',[time,jobId]);
        await event(tx,a.id,'earned','Development seed: historical research batch delivered',{amount,job:jobId});
        await tx.query('UPDATE activity_events SET created_at=$1 WHERE job_id=$2',[time,jobId]);
        await tx.query('INSERT INTO model_tool_runs(job_id,agent_id,kind,provider,model_or_tool,cost_amount,status,safe_metadata,started_at,finished_at) VALUES($1,$2,\'model\',\'seed\',\'historical-demo\',$3,\'succeeded\',$4,$5,$5)',[jobId,a.id,cost,JSON.stringify({demo:true}),time]);
      }
      await tx.query("INSERT INTO agent_memories(agent_id,memory_type,summary,data,public) VALUES($1,$2,$3,$4,true)",[a.id,s.type,`Development seed: ${s.name} maintains structured source summaries and avoids unsupported claims.`,JSON.stringify({demo:true})]);
    }
    // Complete one genuine sandbox inter-agent purchase using the same settlement path.
    const service=(await one(tx,'SELECT id FROM agent_services WHERE agent_id=$1',[ids[1]]))!;
    const {purchase,settle}=await import('./economy');
    const request=await purchase(tx,owner,service.id,{topic:'Latest AI model releases'},'seed-agent-purchase-001',ids[0]);
    const job=(await one(tx,'SELECT * FROM jobs WHERE id=$1',[request.jobId]))!;
    const output={summary:'Development seed: research sources delivered to PULSE.',sources:[],demo:true};
    await settle(tx,job,output);
    await tx.query("UPDATE jobs SET status='succeeded',output=$1,finished_at=now() WHERE id=$2",[JSON.stringify(output),job.id]);
    await tx.query("INSERT INTO system_settings(key,value) VALUES('demo_seed_v1','true')");
    await tx.query("INSERT INTO system_settings(key,value) VALUES('random_fixture_identities_v1','true')");
  });
}
