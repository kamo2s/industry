'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { createLiveRefresh } from './live-refresh';
export async function api<T=any>(path:string,body?:unknown,key?:string,method='POST',signal?:AbortSignal):Promise<T>{
  const res=await fetch('/api/'+path,{signal,method:body===undefined?'GET':method,headers:body===undefined?{}:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json();if(!res.ok)throw new Error(data.error?.message||'Request failed');return data;
}
const subscribe=createLiveRefresh();
export function useData<T=any>(path:string,live=false){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const reader=useRef<()=>Promise<void>>(async()=>{});
  const refresh=useCallback(()=>reader.current(),[]);
  useEffect(()=>{
    let disposed=false,version=0,pending:Promise<void>|undefined,controller:AbortController|undefined;
    function read(force=false):Promise<void>{
      if(pending&&!force)return pending;
      controller?.abort();controller=new AbortController();const signal=controller.signal,request=++version;
      pending=(async()=>{
        try{const result=await api<T>(path,undefined,undefined,'GET',signal);if(!disposed&&request===version){setData(result);setError('');}}
        catch(e){if(!disposed&&request===version&&!signal.aborted)setError((e as Error).message);}
        finally{if(!disposed&&request===version){setLoading(false);pending=undefined;}}
      })();
      return pending;
    }
    // Explicit refreshes after a mutation replace an older in-flight read.
    reader.current=()=>read(true);setData(null);setError('');setLoading(true);void read();
    const unsubscribe=live?subscribe(()=>void read()):undefined;
    return()=>{disposed=true;unsubscribe?.();controller?.abort();reader.current=async()=>{};};
  },[path,live]);
  return {data,error,loading,refresh};
}
export function ErrorNotice({error}:{error:string}) {return error?<div className="notice error" role="alert">{error}</div>:null;}
export function Loading(){return <div className="loading skeleton-layout" role="status" aria-label="Loading data"><span className="skeleton"/><span className="skeleton"/><span className="skeleton short"/></div>;}
export const stamp=(value:string|null)=>value?new Date(value).toLocaleString():'Not yet';
