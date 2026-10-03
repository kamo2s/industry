'use client';
import { useCallback,useEffect,useState } from 'react';
export async function api<T=any>(path:string,body?:unknown,key?:string,method='POST'):Promise<T>{
  const res=await fetch('/api/'+path,{method:body===undefined?'GET':method,headers:body===undefined?{}:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json();if(!res.ok)throw new Error(data.error?.message||'Request failed');return data;
}
const watchers=new Set<()=>void>();let stream:EventSource|undefined;
function subscribe(fn:()=>void){watchers.add(fn);if(!stream){stream=new EventSource('/api/stream');stream.addEventListener('refresh',()=>watchers.forEach(w=>w()));}return()=>{watchers.delete(fn);if(!watchers.size){stream?.close();stream=undefined;}};}
export function useData<T=any>(path:string,live=false){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{try{setData(await api<T>(path));setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[path]);
  useEffect(()=>{void refresh();if(live)return subscribe(()=>void refresh());},[refresh,live]);
  return {data,error,loading,refresh};
}
export function ErrorNotice({error}:{error:string}) {return error?<div className="notice error" role="alert">{error}</div>:null;}
export function Loading(){return <div className="loading skeleton-layout" role="status" aria-label="Loading data"><span className="skeleton"/><span className="skeleton"/><span className="skeleton short"/></div>;}
export const stamp=(value:string|null)=>value?new Date(value).toLocaleString():'Not yet';
