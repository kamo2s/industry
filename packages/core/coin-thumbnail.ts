import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import sharp from 'sharp';
import {publicIP,safeFetch} from '../agent/tools';
import {safeCoinImageUrl,type CoinImageSource} from './coin-images';

async function remoteImage(value:string){
 const safe=safeCoinImageUrl(value);if(!safe||safe.startsWith('/'))throw new Error('Unsupported image URL');
 const url=new URL(safe);let timer:ReturnType<typeof setTimeout>|undefined;
 const addresses=await Promise.race([lookup(url.hostname,{all:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Image DNS timeout')),3000);})]).finally(()=>clearTimeout(timer));
 if(!addresses.length||addresses.some(a=>!publicIP(a.address)))throw new Error('Non-public image host');
 const pinned=addresses[0];
 return new Promise<Buffer>((resolve,reject)=>{
  const req=request(url,{signal:AbortSignal.timeout(5000),headers:{Accept:'image/webp,image/png,image/jpeg,image/gif','Accept-Encoding':'identity'},lookup:(_host,options,cb)=>{if(options.all)(cb as unknown as (err:null,records:typeof addresses)=>void)(null,[pinned]);else cb(null,pinned.address,pinned.family);}},res=>{
   if(res.statusCode!==200||!/^image\/(png|jpeg|webp|gif)(;|$)/i.test(String(res.headers['content-type']))){res.resume();reject(new Error('Unsupported image response'));return;}
   const chunks:Buffer[]=[];let length=0;
   res.on('data',chunk=>{length+=chunk.length;if(length>2*1024*1024)req.destroy(new Error('Image too large'));else chunks.push(chunk);});
   res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
  });req.on('error',reject);req.end();
 });
}
const cache=new Map<string,{until:number;value:Buffer|null}>(),pending=new Map<string,Promise<Buffer|null>>();
export async function coinThumbnail(sources:CoinImageSource[],local:(path:string)=>Promise<Buffer>,size:128|512=128):Promise<Buffer|null>{
 const key=JSON.stringify([sources,size]),old=cache.get(key);if(old&&old.until>Date.now())return old.value;
 if(pending.has(key))return pending.get(key)!;
 if(pending.size>=32)return null;
 const task=(async()=>{
  for(const source of sources){
   try {
    let url=source.url;
    if(source.kind==='metadata'){
     const metadata=JSON.parse(await safeFetch(url,[],4000,true));url=safeCoinImageUrl(metadata.image)||'';
     // A remote document cannot select a different business's local upload.
     if(url.startsWith('/'))continue;
    }
    if(!safeCoinImageUrl(url))continue;
    const input=url.startsWith('/api/uploads/')?await local(url):await remoteImage(url);
    const codec=sharp(input,{limitInputPixels:16_000_000,animated:false}),meta=await codec.metadata();
    if(!['png','jpeg','webp','gif'].includes(meta.format||''))continue;
    return await codec.resize(size,size,{fit:'cover',withoutEnlargement:true}).webp({quality:82}).toBuffer();
   }catch{/* Try this same business's next image source, never a different coin. */}
  }
  return null;
 })();
 pending.set(key,task);
 try{const value=await task;if(cache.size>=256)cache.delete(cache.keys().next().value!);cache.set(key,{value,until:Date.now()+(value?3600000:60000)});return value;}
 finally{pending.delete(key);}
}
