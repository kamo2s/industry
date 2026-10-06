import {it,expect,beforeAll,afterAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {database,migrate,one,type Database} from '../packages/db/connection';
import {Domain} from '../packages/db/domain';
import {agentSchema,serviceSchema,defaultPolicy} from '../packages/core';
import {workspaceMode,timelineMilestones,screenSession} from '../packages/core/workspace';
import {storeBrowserCapture,readBrowserCapture,visibleCaptures,pruneBrowserCaptures,lastBrowserSession} from '../packages/db/captures';
import type {CaptureStore} from '../packages/agent/capture-storage';
let db:Database,d:Domain,a:any,j:any,owner:any,content:string;
const blobs=new Map<string,Buffer>(),storage:CaptureStore={put:async(id,bytes)=>{blobs.set(id,bytes);return {kind:'local',path:id};},get:async(_kind,id)=>blobs.get(id)!,remove:async(_kind,id)=>{blobs.delete(id);}};
const capture=(extra:any={})=>({key:randomUUID(),url:'https://example.com/',title:'Public page',action:'PAGE_OPENED',mode:'public-static-html',visibility:'PUBLIC',capturedAt:new Date().toISOString(),content,...extra});
const save=(c:any,job=j,agent=a)=>db.transaction(tx=>storeBrowserCapture(tx,agent,job,c,storage));
beforeAll(async()=>{process.env.APP_MODE='demo';db=await database(true);await migrate(db);d=new Domain(db);const k=nacl.sign.keyPair(),wallet=bs58.encode(k.publicKey),c=await d.dispatch('auth/challenge',{wallet}),auth=await d.dispatch('auth/verify',{wallet,id:c.id,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(c.message),k.secretKey))});owner=auth.profile;const agent=await d.dispatch('agents/create',{key:randomUUID(),input:agentSchema.parse({name:'Browser test',ticker:'BROW',description:'Bounded browser capture test.',mission:'Inspect permitted public documentation.',jobType:'Watcher',category:'Research',tags:[],tools:['browser_fetch'],brain:'development/mock',tokenMode:'sandbox',initialBudget:1,policy:{...defaultPolicy,maxRunCost:.01},services:[serviceSchema.parse({name:'Browser read',description:'Inspect a public source.',price:.01})]})},auth.session);a=await one(db,'SELECT * FROM agents WHERE id=$1',[agent.id]);j=(await d.worker('claim',{worker:'captures'})).job;content=(await sharp({create:{width:1280,height:800,channels:3,background:'white'}}).webp().toBuffer()).toString('base64');});
afterAll(async()=>{await db.close();});
it('selects actual tool modes and distinguishes idle from explicitly selected completion',()=>{
 const v=(stage:string,status='running')=>({operation:{stage,status}});expect(workspaceMode(v('COMPLETED','succeeded'))).toBe('IDLE');expect(workspaceMode(v('COMPLETED','succeeded'),true)).toBe('OUTPUT');expect(workspaceMode(v('COMPLETED','succeeded'),false,true)).toBe('OUTPUT');
 for(const [stage,mode] of [['SEARCH','SEARCH'],['BROWSER','BROWSER'],['SOURCE INSPECTION','FETCH'],['WAITING FOR SUPPLIER','SUPPLIER'],['SYNTHESIZING','SYNTHESIS'],['PLANNING','ANALYSIS']])expect(workspaceMode(v(stage))).toBe(mode);
 expect(workspaceMode(v('FAILED','failed'),true)).toBe('ERROR');expect(workspaceMode({operation:null})).toBe('IDLE');
});
it('groups repetitive observable events while retaining their expansion data',()=>{const events=['PLANNING_STARTED','MISSION_STARTED','SOURCE_FETCHED','SOURCE_FETCHED','EVIDENCE_FILTERED','DECISION_RECORDED'].map((type,i)=>({id:i,type,runId:'run',summary:'Recorded fact',data:{}})),rows=timelineMilestones(events);expect(rows).toHaveLength(4);expect(rows[1].count).toBe(2);expect(rows[1].children).toHaveLength(2);expect(rows[3].label).toBe('Supplier decision');});
it('labels only current browser execution live and isolates replay from other attempts and selected jobs',()=>{
 const current={id:'job',runId:'now',status:'running',browser:{state:'RUNNING'},captures:[{id:'old',runId:'old'},{id:'new',runId:'now'}]};
 expect(screenSession({operation:current})).toMatchObject({live:true,captures:[{id:'new'}]});
 expect(screenSession({operation:{...current,browser:{state:'COMPLETE'}}})?.live).toBe(false);
 expect(screenSession({operation:{...current,status:'succeeded'}})?.live).toBe(false);
 expect(screenSession({operation:{...current,privateEvidence:true,captures:[]}})?.live).toBe(false);
 const idle={operation:{status:'waiting',runId:'later',captures:[]},lastBrowserSession:{jobId:'past',captures:[{id:'recorded'}]}};
 expect(screenSession(idle)).toMatchObject({jobId:'past',live:false});expect(screenSession(idle,true)).toBeNull();
});
it('stores compressed captures outside rows and serves approved public captures',async()=>{const c=capture(),stored=await save(c),same=await save(c);expect(same.id).toBe(stored.id);const row=await one(db,'SELECT * FROM browser_captures WHERE id=$1',[stored.id]);expect(row!.content).toBeUndefined();expect(row!.bytes).toBeLessThanOrEqual(262144);expect(row!.business_id).toBe(a.business_id);expect(row!.run_id).toBe(j.run_id);expect((await readBrowserCapture(db,stored.id!,undefined,storage)).mime).toBe('image/webp');expect((await visibleCaptures(db,a,j))[0].image).toContain('/api/browser-captures/');});
it('keeps owner-only and system captures inaccessible to public and other owners',async()=>{const privateCapture=await save(capture({visibility:'OWNER_ONLY'})),system=await save(capture({visibility:'SYSTEM'}));await expect(readBrowserCapture(db,privateCapture.id!,undefined,storage)).rejects.toMatchObject({code:'NOT_FOUND'});await expect(readBrowserCapture(db,privateCapture.id!,{id:randomUUID()},storage)).rejects.toMatchObject({code:'NOT_FOUND'});expect((await readBrowserCapture(db,privateCapture.id!,owner,storage)).content).toBeTruthy();await expect(readBrowserCapture(db,system.id!,owner,storage)).rejects.toMatchObject({code:'NOT_FOUND'});expect((await visibleCaptures(db,a,j,owner)).some(r=>r.id===system.id)).toBe(false);});
it('forces service captures private even when public was requested',async()=>{const stored=await save(capture(),{...j,type:'SERVICE'});expect((await one(db,'SELECT visibility FROM browser_captures WHERE id=$1',[stored.id]))!.visibility).toBe('OWNER_ONLY');});
it('retains the latest allowed session across later jobs without exposing private or expired frames',async()=>{
 const publicFrame=await save(capture({capturedAt:new Date(Date.now()+1000).toISOString()}));
 const next=await one(db,"INSERT INTO jobs(agent_id,type,trigger_type,run_id,idempotency_key) VALUES($1,'RUN','continuous',$2,$3) RETURNING *",[a.id,randomUUID(),randomUUID()]);
 const privateFrame=await save(capture({visibility:'OWNER_ONLY',title:'Private source',capturedAt:new Date(Date.now()+2000).toISOString()}),next);
 expect((await lastBrowserSession(db,a))?.jobId).toBe(j.id);expect(JSON.stringify(await lastBrowserSession(db,a))).not.toContain('Private source');
 expect((await lastBrowserSession(db,a,owner))?.jobId).toBe(next!.id);
 expect(await lastBrowserSession(db,{...a,config:{...a.config,publicOutput:false}})).toBeNull();
 await db.query("UPDATE browser_captures SET expires_at=now()-interval '1 second' WHERE id=$1",[privateFrame.id]);
 expect((await lastBrowserSession(db,a,owner))?.jobId).toBe(j.id);expect((await lastBrowserSession(db,a))?.captures.some((c:any)=>c.id===publicFrame.id)).toBe(true);
 // Leave the final prune test's one expired object independent of this case.
 await db.query("UPDATE browser_captures SET expires_at=now()+interval '1 hour' WHERE id=$1",[privateFrame.id]);
});
it('revokes image access immediately when public output is disabled',async()=>{const stored=await save(capture());await db.query("UPDATE agents SET config=jsonb_set(config,'{publicOutput}','false') WHERE id=$1",[a.id]);await expect(readBrowserCapture(db,stored.id!,undefined,storage)).rejects.toMatchObject({code:'NOT_FOUND'});await db.query("UPDATE agents SET config=jsonb_set(config,'{publicOutput}','true') WHERE id=$1",[a.id]);});
it('rejects dangerous URL/format/size and stale worker capture submission',async()=>{await expect(save(capture({url:'https://example.com/?api_key=private'}))).rejects.toThrow();await expect(save(capture({content:'bm90YW5pbWFnZQ=='}))).rejects.toThrow();await expect(save(capture({content:'x'.repeat(350001)}))).rejects.toThrow();await expect(d.worker('browser/capture',{id:j.id,lease:randomUUID(),capture:capture()})).rejects.toMatchObject({code:'STALE_LEASE'});});
it('bounds per-run storage to twelve captures and rejects expired reads before pruning',async()=>{for(let i=0;i<15;i++)await save(capture());const count=await one(db,'SELECT count(*) n FROM browser_captures WHERE run_id=$1',[j.run_id]);expect(Number(count!.n)).toBe(12);expect((await save(capture())).stored).toBe(false);const old=await one(db,'SELECT id,storage_path FROM browser_captures LIMIT 1');await db.query("UPDATE browser_captures SET expires_at=now()-interval '1 second' WHERE id=$1",[old!.id]);await expect(readBrowserCapture(db,old!.id,owner,storage)).rejects.toMatchObject({code:'NOT_FOUND'});expect(await pruneBrowserCaptures(db,storage)).toBe(1);expect(blobs.has(old!.storage_path)).toBe(false);});
it('scopes public service reads to the requested Coin and retains visibility rules',async()=>{
 const rows=await d.dispatch('services/list',{agentId:a.id});expect(rows.length).toBeGreaterThan(0);expect(rows.every((s:any)=>s.agent_id===a.id)).toBe(true);expect(rows.length).toBeLessThanOrEqual(32);
 expect(await d.dispatch('services/list',{agentId:randomUUID()})).toEqual([]);await expect(d.dispatch('services/list',{agentId:'invalid'})).rejects.toThrow();
 await db.query("UPDATE agents SET visibility='private' WHERE id=$1",[a.id]);try{expect(await d.dispatch('services/list',{agentId:a.id})).toEqual([]);}finally{await db.query("UPDATE agents SET visibility='public' WHERE id=$1",[a.id]);}
});
