import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {z} from 'zod';
import {ensure} from '../core';
import {safeOperationalText,safeSourceUrl} from '../core/operations';
import {captureStore,type CaptureStore} from '../agent/capture-storage';
import {one,type Queryable,type Row} from './connection';
const input=z.object({key:z.string().max(80),url:z.string().url().max(2000),title:z.string().max(500),action:z.enum(['PAGE_OPENED','EVIDENCE_CAPTURED']),mode:z.literal('public-static-html'),visibility:z.enum(['PUBLIC','OWNER_ONLY','SYSTEM']).default('OWNER_ONLY'),capturedAt:z.string().datetime(),content:z.string().max(350000)}).strict();
export async function storeBrowserCapture(tx:Queryable,a:Row,j:Row,value:unknown,store:CaptureStore=captureStore){
 const b=input.parse(value),url=safeSourceUrl(b.url);ensure(url,'INVALID_CAPTURE','Capture needs a public HTTPS source');
 // Sensitive URL parameters cannot be safely removed from screenshot pixels.
 ensure(!/[?&][^=]*(?:token|key|secret|signature|auth|session|password)[^=]*=/i.test(b.url),'PRIVATE_CAPTURE','Sensitive URL cannot be captured');
 const existing=await one(tx,'SELECT id FROM browser_captures WHERE job_id=$1 AND run_id=$2 AND capture_key=$3',[j.id,j.run_id,b.key]);if(existing)return {id:existing.id,stored:true};
 await tx.query('LOCK TABLE browser_captures IN EXCLUSIVE MODE');
 const counts=await one(tx,'SELECT count(*) total,count(*) FILTER(WHERE job_id=$1) job,count(*) FILTER(WHERE job_id=$1 AND run_id=$2) run FROM browser_captures',[j.id,j.run_id]);
 if(Number(counts!.total)>=1000||Number(counts!.job)>=36||Number(counts!.run)>=12)return {stored:false,reason:'capture-limit'};
 const raw=Buffer.from(b.content,'base64');ensure(raw.length<=262144,'CAPTURE_SIZE','Capture exceeds byte limit');
 const codec=sharp(raw,{limitInputPixels:1280*900}),meta=await codec.metadata();ensure(meta.format==='webp'&&meta.width!<=1280&&meta.height!<=900&&(meta.pages||1)===1,'INVALID_CAPTURE','Expected a bounded WebP viewport');
 const bytes=await codec.webp({quality:70}).toBuffer();ensure(bytes.length<=262144,'CAPTURE_SIZE','Capture exceeds byte limit');
 const id=randomUUID(),object=await store.put(id,bytes),visibility=b.visibility==='PUBLIC'&&a.config.publicOutput&&j.type!=='SERVICE'&&a.visibility==='public'?'PUBLIC':b.visibility==='SYSTEM'?'SYSTEM':'OWNER_ONLY';
 try{await tx.query('INSERT INTO browser_captures(id,business_id,job_id,run_id,capture_key,storage_kind,storage_path,url,title,action,visibility,width,height,bytes,captured_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[id,a.business_id||a.id,j.id,j.run_id,b.key,object.kind,object.path,url,safeOperationalText(b.title),b.action,visibility,meta.width,meta.height,bytes.length,b.capturedAt]);}catch(e){await store.remove(object.kind,object.path);throw e;}
 return {id,stored:true};
}
export async function visibleCaptures(tx:Queryable,a:Row,j:Row,profile?:Row){
 const owner=profile?.id===a.creator_profile_id;
 const rows=(await tx.query('SELECT id,run_id,url,title,action,visibility,captured_at,width,height FROM browser_captures WHERE job_id=$1 AND expires_at>now() ORDER BY captured_at LIMIT 36',[j.id])).rows;
 return rows.filter(r=>r.visibility!=='SYSTEM'&&(owner||r.visibility==='PUBLIC'&&a.config.publicOutput&&a.visibility==='public'&&j.type!=='SERVICE')).map(r=>({id:r.id,runId:r.run_id,url:r.url,title:r.title,action:r.action,at:r.captured_at,width:r.width,height:r.height,image:'/api/browser-captures/'+r.id}));
}
// A retained session is always explicitly replay, never the current operation.
// Apply the image ACL before selecting it, so a private newer job cannot leak
// its URL/title or hide the last public session from observers.
export async function lastBrowserSession(tx:Queryable,a:Row,profile?:Row){
 const owner=profile?.id===a.creator_profile_id;
 const latest=await one(tx,`SELECT c.job_id,c.run_id,j.type FROM browser_captures c JOIN jobs j ON j.id=c.job_id
  WHERE j.agent_id=$1 AND c.expires_at>now() AND c.visibility<>'SYSTEM'
  AND ($2 OR (c.visibility='PUBLIC' AND $3 AND j.type<>'SERVICE'))
  ORDER BY c.captured_at DESC,c.id DESC LIMIT 1`,[a.id,owner,!!a.config.publicOutput&&a.visibility==='public']);
 if(!latest)return null;
 const captures=(await visibleCaptures(tx,a,{id:latest.job_id,type:latest.type},profile)).filter(c=>c.runId===latest.run_id);
 return captures.length?{jobId:latest.job_id,runId:latest.run_id,captures}:null;
}
export async function readBrowserCapture(tx:Queryable,id:string,profile?:Row,store:CaptureStore=captureStore){
 const r=await one(tx,'SELECT c.*,a.creator_profile_id,a.visibility business_visibility,a.config,j.type job_type FROM browser_captures c JOIN agents a ON a.business_id=c.business_id JOIN jobs j ON j.id=c.job_id WHERE c.id=$1 AND c.expires_at>now()',[z.string().uuid().parse(id)]);
 ensure(r&&r.visibility!=='SYSTEM'&&(profile?.id===r.creator_profile_id||r.visibility==='PUBLIC'&&r.config.publicOutput&&r.business_visibility==='public'&&r.job_type!=='SERVICE'),'NOT_FOUND','Capture unavailable',404);
 const bytes=await store.get(r.storage_kind,r.storage_path);return {content:bytes.toString('base64'),mime:'image/webp'};
}
export async function pruneBrowserCaptures(tx:Queryable,store:CaptureStore=captureStore){const rows=(await tx.query('SELECT id,storage_kind,storage_path FROM browser_captures WHERE expires_at<=now() ORDER BY expires_at LIMIT 100')).rows;for(const r of rows){await store.remove(r.storage_kind,r.storage_path);await tx.query('DELETE FROM browser_captures WHERE id=$1',[r.id]);}return rows.length;}
