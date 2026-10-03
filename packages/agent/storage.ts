import { createClient } from '@supabase/supabase-js';
import { ensure } from '../core';
function storage(){ensure(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY,'STORAGE_UNCONFIGURED','Supabase Storage is unconfigured',503);return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('agent-icons');}
export const storageConfigured=()=>!!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
export async function uploadIcon(path:string,bytes:Buffer){const {error}=await storage().upload(path,bytes,{contentType:'image/webp',cacheControl:'86400',upsert:false});ensure(!error,'UPLOAD_FAILED','Supabase image upload failed',503);return path;}
export async function downloadIcon(path:string){const {data,error}=await storage().download(path);ensure(!error&&data,'IMAGE_UNAVAILABLE','Image is unavailable',503);return Buffer.from(await data.arrayBuffer());}
