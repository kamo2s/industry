import 'dotenv/config';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import sharp from 'sharp';import {createClient} from '@supabase/supabase-js';
import {database,one} from '../packages/db/connection';import {storeBrowserCapture,readBrowserCapture,pruneBrowserCaptures} from '../packages/db/captures';import {captureStore,sweepCaptureObjects} from '../packages/agent/capture-storage';
if(process.argv.includes('--simulation'))Object.assign(process.env,JSON.parse(await readFile('.data/staging/environment.json','utf8')));
const db=await database(),checks:Record<string,boolean>={};
const bucket=process.env.CAPTURE_STORAGE_BUCKET||'browser-captures';
const storage=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}}).storage;
const ids:string[]=[];try{
 const a=(await one(db,"SELECT * FROM agents WHERE name='RADAR STAGING'"))!,j=(await one(db,"SELECT * FROM jobs WHERE agent_id=$1 AND status='succeeded' ORDER BY created_at DESC LIMIT 1",[a.id]))!;
 if(!a||!j)throw Error('Complete one staging RADAR job before storage acceptance');
 const bytes=await sharp({create:{width:320,height:180,channels:3,background:'#07100c'}}).webp().toBuffer();
 for(const visibility of ['PUBLIC','OWNER_ONLY','SYSTEM'] as const){
  const saved=await db.transaction(tx=>storeBrowserCapture(tx,a,j,{key:'storage-qa:'+randomUUID(),url:'https://www.postgresql.org/docs/current/ddl-rowsecurity.html',title:'STAGING synthetic storage ACL fixture — not a browser session',action:'EVIDENCE_CAPTURED',mode:'public-static-html',visibility,capturedAt:new Date().toISOString(),content:bytes.toString('base64')}));
  if(!saved.id)throw Error('Capture quota prevents test');ids.push(saved.id);
  for(const [viewer,p] of [['anonymous',undefined],['owner',{id:a.creator_profile_id}],['other',{id:randomUUID()}]] as const){let allowed=false;try{await db.transaction(tx=>readBrowserCapture(tx,saved.id!,p));allowed=true;}catch{}checks[`${visibility}:${viewer}`]=allowed===(visibility==='PUBLIC'||visibility==='OWNER_ONLY'&&viewer==='owner');}
  const direct=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${saved.id}.webp`);checks[`${visibility}:no-public-url`]=!direct.ok;
 }
 await db.query("UPDATE browser_captures SET expires_at=now()-interval '1 second' WHERE id=ANY($1::uuid[])",[ids]);
 try{await db.transaction(tx=>readBrowserCapture(tx,ids[1],{id:a.creator_profile_id}));checks.expiredDenied=false;}catch{checks.expiredDenied=true;}
 await db.transaction(tx=>pruneBrowserCaptures(tx));checks.metadataDeleted=!(await one(db,'SELECT id FROM browser_captures WHERE id=ANY($1::uuid[])',[ids]));
 for(const id of ids)checks['objectDeleted:'+id]=!!(await storage.from(bucket).download(id+'.webp')).error;
 const orphan=randomUUID();await captureStore.put(orphan,bytes);await captureStore.remove('supabase',orphan+'.webp');checks.orphanDeletion=!!(await storage.from(bucket).download(orphan+'.webp')).error;
 await sweepCaptureObjects();checks.sweepExecuted=true;
 const iconBucket=process.env.ICON_STORAGE_BUCKET||'agent-icons',icon='qa/'+randomUUID()+'.webp';const upload=await storage.from(iconBucket).upload(icon,bytes,{contentType:'image/webp'});checks.iconUpload=!upload.error;
 const publicIcon=await fetch(storage.from(iconBucket).getPublicUrl(icon).data.publicUrl);checks.httpsIcon=publicIcon.ok&&publicIcon.headers.get('content-type')?.includes('image/webp')===true;await storage.from(iconBucket).remove([icon]);
 const blocked=await storage.from(iconBucket).upload('qa/'+randomUUID()+'.svg',Buffer.from('<svg/>'),{contentType:'image/svg+xml'});checks.svgDenied=!!blocked.error;
 await mkdir('qa/staging',{recursive:true});await writeFile('qa/staging/storage.json',JSON.stringify({at:new Date().toISOString(),provider:'Existing Supabase / isolated INDUSTRY buckets',checks,syntheticPixels:true,liveObjectStore:true},null,2));console.log(JSON.stringify({checks,allPassed:Object.values(checks).every(Boolean)}));if(Object.values(checks).some(v=>!v))process.exitCode=1;
}finally{for(const id of ids)await captureStore.remove('supabase',id+'.webp').catch(()=>{});await db.query('DELETE FROM browser_captures WHERE id=ANY($1::uuid[])',[ids]).catch(()=>{});await db.close();}
