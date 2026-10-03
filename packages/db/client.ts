import { AppError } from '../core';
export async function rpc<T=any>(op:string,body:any={},session?:string,worker=false):Promise<T> {
  const response=await fetch(`http://127.0.0.1:${process.env.DB_PORT||4318}/${worker?'worker':'rpc'}`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.INTERNAL_API_SECRET||''}`},body:JSON.stringify({op,body,session}),signal:AbortSignal.timeout(60000),cache:'no-store'});
  const data=await response.json();if(!response.ok) throw new AppError(data.error?.code||'SERVICE_ERROR',data.error?.message||'Service unavailable',response.status);return data;
}
