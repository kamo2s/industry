import {createClient} from '@supabase/supabase-js';
import {mkdir,readFile,writeFile,unlink,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {ensure} from '../core';
import {demoMode} from '../core/security';
import {storageConfigured} from './storage';
export interface CaptureStore {put:(id:string,bytes:Buffer)=>Promise<{kind:string;path:string}>;get:(kind:string,key:string)=>Promise<Buffer>;remove:(kind:string,key:string)=>Promise<void>}
const root=()=>path.resolve(process.env.INDUSTRY_ROOT||process.cwd(),'.data','browser-captures');
function localPath(key:string){ensure(/^[a-f0-9-]{36}\.webp$/.test(key),'INVALID_CAPTURE','Invalid capture key');return path.join(root(),key);}
function storage(){ensure(storageConfigured(),'STORAGE_UNCONFIGURED','Private capture storage is unavailable',503);return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}).storage;}
function bucket(){return storage().from(process.env.CAPTURE_STORAGE_BUCKET||'browser-captures');}
async function privateBucket(){const client=storage(),{data,error}=await client.getBucket(process.env.CAPTURE_STORAGE_BUCKET||'browser-captures');ensure(!error&&data?.public===false,'CAPTURE_STORAGE','Capture storage must be private',503);return client.from(process.env.CAPTURE_STORAGE_BUCKET||'browser-captures');}
export const captureStore:CaptureStore={
 async put(id,bytes){const key=id+'.webp';localPath(key);if(storageConfigured()){const {error}=await (await privateBucket()).upload(key,bytes,{contentType:'image/webp',upsert:false,cacheControl:'0'});ensure(!error,'CAPTURE_STORAGE','Capture could not be stored',503);return {kind:'supabase',path:key};}ensure(demoMode(),'STORAGE_UNCONFIGURED','Production browser captures require private object storage',503);await mkdir(root(),{recursive:true});await writeFile(localPath(key),bytes,{flag:'wx',mode:0o600});return {kind:'local',path:key};},
 async get(kind,key){localPath(key);if(kind==='local')return readFile(localPath(key));const {data,error}=await bucket().download(key);ensure(!error&&data,'NOT_FOUND','Capture unavailable',404);return Buffer.from(await data.arrayBuffer());},
 async remove(kind,key){localPath(key);if(kind==='local'){await unlink(localPath(key)).catch(e=>{if(e.code!=='ENOENT')throw e;});return;}const {error}=await bucket().remove([key]);ensure(!error,'CAPTURE_STORAGE','Capture cleanup will retry',503);}
};
// Also remove expired orphan objects after interrupted uploads/transactions.
export async function sweepCaptureObjects(){const cutoff=Date.now()-24*3600000;if(storageConfigured()){const {data,error}=await bucket().list('',{limit:1000,sortBy:{column:'created_at',order:'asc'}});ensure(!error,'CAPTURE_STORAGE','Capture cleanup will retry',503);for(const f of data||[])if(/^[a-f0-9-]{36}\.webp$/.test(f.name)&&Date.parse(f.created_at||'')<cutoff)await captureStore.remove('supabase',f.name);}else for(const name of (await readdir(root()).catch(()=>[])).slice(0,1100)){if(!/^[a-f0-9-]{36}\.webp$/.test(name))continue;if((await stat(localPath(name))).mtimeMs<cutoff)await captureStore.remove('local',name);}}

