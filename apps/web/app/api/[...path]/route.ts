import {publicAppUrl,validateEnvironment} from '../../../../../packages/core/environment';
import {ratePolicy,rateNamespace} from '../../../../../packages/core/rate-policy';
import { NextRequest,NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {optimizeArtwork} from '../../../../../packages/core/artwork-upload';
import {ARTWORK_MAX_BYTES,ARTWORK_UPLOAD_HELP} from '../../../../../packages/core/artwork-limits';
import { rpc } from '../../../../../packages/db/client';
import { AppError } from '../../../../../packages/core';
import { hash } from '../../../../../packages/core/security';
import { coinThumbnail } from '../../../../../packages/core/coin-thumbnail';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const getRoutes:Record<string,string>={'marketplace/work':'marketplace/work','economy':'economy','treasury/policy':'treasury/policy','watchlist':'watchlist','search':'search','network/graph':'network/graph','models':'models','work':'work/list','auth/session':'auth/session','network/stats':'network/stats','activity':'activity','agents':'agents/list','services':'services/list','dashboard':'dashboard','providers':'providers','health':'health','debug':'debug','admin/status':'admin/status','notifications':'notifications'};
async function boundedBody(req:NextRequest,limit:number){
  if(Number(req.headers.get('content-length'))>limit)throw new AppError('TOO_LARGE','Request exceeds size limit',413);
  const reader=req.body?.getReader();if(!reader)return Buffer.alloc(0);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new AppError('TOO_LARGE','Request exceeds size limit',413);}chunks.push(value);}
  return Buffer.concat(chunks);
}
async function handler(req:NextRequest,{params}:{params:Promise<{path:string[]}>}) {
  const rawPath=(await params).path,path=rawPath[0]==='coins'?['agents',...rawPath.slice(1)]:rawPath,route=path.join('/'),token=req.cookies.get('industry_session')?.value,requestId=randomUUID();
  try {
    validateEnvironment('web');
    const paidInvocation=path[0]==='services'&&path[2]==='invoke'&&path.length===3&&req.method==='POST';
    if(req.method!=='GET') {
      const expected=new URL(publicAppUrl()).origin;
      if(!paidInvocation&&req.headers.get('origin')!==expected)throw new AppError('ORIGIN_DENIED','Request origin does not match this site',403);
      if(!req.headers.get('content-type')?.includes('application/json')&&route!=='uploads')throw new AppError('CONTENT_TYPE','JSON content type required',415);
    }
    const identity=token&&!paidInvocation?await rpc('auth/session',{},token):null;
    // This header is trusted only when an operator-controlled reverse proxy
    // overwrites it. Never trust arbitrary client X-Forwarded-For by default.
    const ip=process.env.TRUST_PROXY_IP_HEADER?req.headers.get(process.env.TRUST_PROXY_IP_HEADER)?.split(',')[0]?.trim()||'unknown':'local';
    const {name:rateClass,limit}=ratePolicy(route,req.method);
    const keys=[`ip:${hash(`${process.env.SESSION_SECRET}:${ip}`)}:${rateClass}`,...(identity?.profile?[`wallet:${identity.profile.id}:${rateClass}`]:[])];
    for(const key of keys)if(!(await rpc('rate',{key:rateNamespace()+':'+key,limit})).allowed)throw new AppError('RATE_LIMIT','Too many requests. Try again in a minute.',429);
    if(route==='stream'&&req.method==='GET') {
      const encoder=new TextEncoder();let timer:ReturnType<typeof setInterval>,lease:ReturnType<typeof setTimeout>;let closed=false;
      // Periodically release HTTP/1 slots, including clients still running an
      // older build. EventSource reconnects; queued images and scripts get a turn.
      const stream=new ReadableStream({start(controller){const close=()=>{closed=true;clearInterval(timer);clearTimeout(lease);try{controller.close();}catch{}};const send=()=>{if(!closed)controller.enqueue(encoder.encode(`event: refresh\ndata: ${JSON.stringify({time:Date.now()})}\n\n`));};send();timer=setInterval(send,3000);lease=setTimeout(close,45000);req.signal.addEventListener('abort',close,{once:true});},cancel(){closed=true;clearInterval(timer);clearTimeout(lease);}});
      return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive'}});
    }
    if(route==='uploads'&&req.method==='POST') {
      if(!identity?.profile)throw new AppError('UNAUTHORIZED','Authenticate your wallet first',401);
      const form=await new Response(await boundedBody(req,ARTWORK_MAX_BYTES+65536),{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData(),file=form.get('file');
      if(!(file instanceof File))throw new AppError('INVALID_IMAGE',ARTWORK_UPLOAD_HELP,400);
      const image=await optimizeArtwork(Buffer.from(await file.arrayBuffer()),file.type);
      return NextResponse.json(await rpc('uploads/create',{content:image.toString('base64'),mime:'image/webp'},token));
    }
    if(path[0]==='network'&&path[1]==='images'&&path.length===3&&req.method==='GET'){
      const directory=req.nextUrl.searchParams.get('variant')==='card';
      const sources=await rpc('network/image',{id:path[2],directory});
      const image=await coinThumbnail(sources,async url=>{const upload=await rpc('uploads/get',{id:url.split('/').at(-1)});return Buffer.from(upload.content,'base64');},directory?512:128);
      if(!image)return new Response(null,{status:404,headers:{'Cache-Control':'public,max-age=60'}});
      return new Response(new Uint8Array(image),{headers:{'Content-Type':'image/webp','Cache-Control':'public,max-age=3600','X-Content-Type-Options':'nosniff'}});
    }
    if(path[0]==='uploads'&&path[1]&&req.method==='GET') {
      const image=await rpc('uploads/get',{id:path[1]});return new Response(Buffer.from(image.content,'base64'),{headers:{'Content-Type':image.mime,'Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});
    }
    if(path[0]==='browser-captures'&&path.length===2&&req.method==='GET'){
      const capture=await rpc('browser-captures/get',{id:path[1]},token);
      return new Response(Buffer.from(capture.content,'base64'),{headers:{'Content-Type':'image/webp','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Cross-Origin-Resource-Policy':'same-origin'}});
    }
    let op=getRoutes[route],body:any={};
    if(req.method==='GET') {
      if(['pump/config','pump/status','admin/pump-fees'].includes(route)){op=route;body.id=req.nextUrl.searchParams.get('id')||undefined;}
      if(path[0]==='pump'&&path[1]==='metadata'&&path.length===3){op='pump/metadata';body.id=path[2];}
      if(path[0]==='agents'&&path[2]==='pump-fees'){op='pump/financials';body.id=path[1];}
      if(route==='network/stats')body={days:req.nextUrl.searchParams.get('days')};
      if(route==='services'&&req.nextUrl.searchParams.has('agentId'))body.agentId=req.nextUrl.searchParams.get('agentId');
      if(route==='search')body={q:req.nextUrl.searchParams.get('q')||''};
      if(route==='network/graph')body={days:req.nextUrl.searchParams.get('days'),agentId:req.nextUrl.searchParams.get('agentId')||undefined};
      if(path[0]==='agents'&&path[2]==='record'){op='agents/record';body.id=path[1];}
      if(path[0]==='agents'&&path[2]==='live'){op='agents/live';body={id:path[1],job:req.nextUrl.searchParams.get('job')||undefined};}
      if(path[0]==='tokens'&&path[2]==='metadata'){op='tokens/metadata';body.id=path[1];}
      if(path[0]==='agents'&&path[2]==='treasury'){op='agents/treasury';body.id=path[1];}
      if(!op&&['agents','services','jobs'].includes(path[0])&&path.length===2){op=`${path[0]}/get`;body.id=path[1];}
      if(route==='activity')body={limit:req.nextUrl.searchParams.get('limit')||30,agentId:req.nextUrl.searchParams.get('agentId')||undefined};
    }else{
      const raw=(await boundedBody(req,60000)).toString('utf8');let input:any;try{input=raw?JSON.parse(raw):{};}catch{throw new AppError('INVALID_JSON','Request body must be valid JSON');}
      const key=req.headers.get('idempotency-key');
      if(['pump/prepare','pump/submit','pump/recover','pump/resume','pump/cancel'].includes(route)){op=route;body=route==='pump/prepare'?{input,key}:input;}
      if(paidInvocation){const result=await rpc('services/invoke',{id:path[1],input,key,payment:req.headers.get('PAYMENT-SIGNATURE')||undefined});return NextResponse.json(result.body,{status:result.status,headers:result.headers});}
      else if(['auth/challenge','auth/verify','auth/logout','tokens/verify','tokens/routing','watchlist/set','notifications/read'].includes(route)){op=route;body=input;}
      else if(route.startsWith('admin/')||route==='abuse/report'){op=route;body=input;}
      else if(route==='launch/token/devnet'){op=route;body={input,key};}
      else if(route==='work'){op='work/create';body={input,key};}
      else if(path[0]==='work'&&['accept','cancel'].includes(path[2])){op='work/'+path[2];body={id:path[1],input,key};}
      else if(route==='agents'){op='agents/create';body={input,key};}
      else if(path[0]==='agents'&&path[1]){op=`agents/${req.method==='PATCH'?'update':path[2]}`;body={id:path[1],input,key};}
      else if(path[0]==='services'&&path[2]==='request'){op='services/request';body={id:path[1],input,key};}
    }
    if(!op)throw new AppError('NOT_FOUND','Endpoint not found',404);
    const result=await rpc(op,body,token);
    const response=NextResponse.json(op==='auth/verify'?{profile:result.profile}:result);
    response.headers.set('X-Request-Id',requestId);response.headers.set('Cache-Control','no-store');
    if(op==='auth/verify')response.cookies.set('industry_session',result.session,{httpOnly:true,sameSite:'strict',secure:new URL(publicAppUrl()).protocol==='https:',path:'/',maxAge:86400});
    if(op==='auth/logout')response.cookies.delete('industry_session');
    return response;
  }catch(error){const e=error instanceof AppError?error:new AppError('REQUEST_FAILED','Unable to process this request',500);return NextResponse.json({error:{code:e.code,message:e.message,requestId}},{status:e.status});}
}
export {handler as GET,handler as POST,handler as PATCH};
