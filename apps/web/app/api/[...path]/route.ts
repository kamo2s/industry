import { NextRequest,NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { rpc } from '../../../../../packages/db/client';
import { AppError } from '../../../../../packages/core';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const getRoutes:Record<string,string>={'auth/session':'auth/session','network/stats':'network/stats','activity':'activity','agents':'agents/list','services':'services/list','dashboard':'dashboard','providers':'providers','health':'health','debug':'debug'};
async function boundedBody(req:NextRequest,limit:number){
  if(Number(req.headers.get('content-length'))>limit)throw new AppError('TOO_LARGE','Request exceeds size limit',413);
  const reader=req.body?.getReader();if(!reader)return Buffer.alloc(0);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new AppError('TOO_LARGE','Request exceeds size limit',413);}chunks.push(value);}
  return Buffer.concat(chunks);
}
async function handler(req:NextRequest,{params}:{params:Promise<{path:string[]}>}) {
  const {path}=await params,route=path.join('/'),token=req.cookies.get('industry_session')?.value,requestId=randomUUID();
  try {
    if(req.method!=='GET') {
      const expected=new URL(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').origin;
      if(req.headers.get('origin')!==expected)throw new AppError('ORIGIN_DENIED','Request origin does not match this site',403);
      if(!req.headers.get('content-type')?.includes('application/json')&&route!=='uploads')throw new AppError('CONTENT_TYPE','JSON content type required',415);
    }
    if(route==='stream'&&req.method==='GET') {
      const encoder=new TextEncoder();let timer:ReturnType<typeof setInterval>;let closed=false;
      const stream=new ReadableStream({start(controller){const send=()=>{if(!closed)controller.enqueue(encoder.encode(`event: refresh\ndata: ${JSON.stringify({time:Date.now()})}\n\n`));};send();timer=setInterval(send,3000);req.signal.addEventListener('abort',()=>{closed=true;clearInterval(timer);try{controller.close();}catch{}});},cancel(){closed=true;clearInterval(timer);}});
      return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive'}});
    }
    const identity=token?await rpc('auth/session',{},token):null;
    const rate=await rpc('rate',{key:`${identity?.profile?.id||'anonymous'}:${req.method==='GET'?'read':route.startsWith('auth')?'auth':'write'}`,limit:req.method==='GET'?1000:route.startsWith('auth')?60:100});
    if(!rate.allowed)throw new AppError('RATE_LIMIT','Too many requests. Try again in a minute.',429);
    if(route==='uploads'&&req.method==='POST') {
      if(!identity?.profile)throw new AppError('UNAUTHORIZED','Authenticate your wallet first',401);
      const form=await new Response(await boundedBody(req,280000),{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData(),file=form.get('file');
      if(!(file instanceof File)||file.size>262144||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new AppError('INVALID_IMAGE','Upload a PNG, JPEG, or WebP image under 256 KB');
      const image=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:4_000_000}).resize(128,128,{fit:'cover'}).webp({quality:80}).toBuffer();
      return NextResponse.json(await rpc('uploads/create',{content:image.toString('base64'),mime:'image/webp'},token));
    }
    if(path[0]==='uploads'&&path[1]&&req.method==='GET') {
      const image=await rpc('uploads/get',{id:path[1]});return new Response(Buffer.from(image.content,'base64'),{headers:{'Content-Type':image.mime,'Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});
    }
    let op=getRoutes[route],body:any={};
    if(req.method==='GET') {
      if(!op&&['agents','services','jobs'].includes(path[0])&&path.length===2){op=`${path[0]}/get`;body.id=path[1];}
      if(route==='activity')body={limit:req.nextUrl.searchParams.get('limit')||30,agentId:req.nextUrl.searchParams.get('agentId')||undefined};
    }else{
      const raw=(await boundedBody(req,60000)).toString('utf8');let input:any;try{input=raw?JSON.parse(raw):{};}catch{throw new AppError('INVALID_JSON','Request body must be valid JSON');}
      const key=req.headers.get('idempotency-key');
      if(['auth/challenge','auth/verify','auth/logout','tokens/verify'].includes(route)){op=route;body=input;}
      else if(route==='launch/token/devnet'){op=route;body={input,key};}
      else if(route==='agents'){op='agents/create';body={input,key};}
      else if(path[0]==='agents'&&path[1]){op=`agents/${req.method==='PATCH'?'update':path[2]}`;body={id:path[1],input,key};}
      else if(path[0]==='services'&&path[2]==='request'){op='services/request';body={id:path[1],input,key};}
    }
    if(!op)throw new AppError('NOT_FOUND','Endpoint not found',404);
    const result=await rpc(op,body,token);
    const response=NextResponse.json(op==='auth/verify'?{profile:result.profile}:result);
    response.headers.set('X-Request-Id',requestId);response.headers.set('Cache-Control','no-store');
    if(op==='auth/verify')response.cookies.set('industry_session',result.session,{httpOnly:true,sameSite:'strict',secure:new URL(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').protocol==='https:',path:'/',maxAge:86400});
    if(op==='auth/logout')response.cookies.delete('industry_session');
    return response;
  }catch(error){const e=error instanceof AppError?error:new AppError('REQUEST_FAILED','Unable to process this request',500);return NextResponse.json({error:{code:e.code,message:e.message,requestId}},{status:e.status});}
}
export {handler as GET,handler as POST,handler as PATCH};
