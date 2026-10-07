// Local draft only. Public storage still requires an authenticated wallet.
export type DraftArtwork={file:Blob;upload?:{wallet:string;id:string}};
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('industry-launch-artwork',1);request.onupgradeneeded=()=>request.result.createObjectStore('draft');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function draftArtwork(value?:DraftArtwork|null):Promise<DraftArtwork|null>{
 const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('draft',value===undefined?'readonly':'readwrite'),store=tx.objectStore('draft');const request=value===undefined?store.get('current'):value===null?store.delete('current'):store.put(value,'current');let result:DraftArtwork|null=null;request.onsuccess=()=>{result=value===undefined?request.result||null:value;};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});}finally{db.close();}
}
