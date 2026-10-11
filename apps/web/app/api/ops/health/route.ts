import {equalSecret} from '../../../../../../packages/core/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const key=process.env.MONITOR_API_SECRET;
 const headers={'Cache-Control':'no-store'};
 if(!key||key.length<32||!equalSecret(req.headers.get('authorization')||'',`Bearer ${key}`))return Response.json({error:'Unauthorized'},{status:401,headers});
 try{
  const base=process.env.INTERNAL_API_URL||`http://127.0.0.1:${process.env.DB_PORT||4318}`;
  const r=await fetch(base.replace(/\/$/,'')+'/monitor',{headers:{Authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('Unavailable');
  return Response.json(await r.json(),{headers});
 }catch{return Response.json({healthy:false,alerts:['DATABASE_UNAVAILABLE']},{status:503,headers});}
}
