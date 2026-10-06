import {randomUUID} from 'node:crypto';
import {AppError,ensure,micro} from '../core';
import type {Brain} from './catalog';
import type {ModelCheckpoint} from './model';
export type CallScope={businessId?:string;jobId?:string;runId?:string};
export type RouterCall={brain:Brain;body:Record<string,any>;budget:number;timeout:number;checkpoint?:ModelCheckpoint;scope?:CallScope;search?:boolean};
// Fixed origin prevents credentials being forwarded to a configurable endpoint.
export const routerBase='https://openrouter.ai/api/v1';
export const searchReserve=7000; // Exa auto, <= 10 results; reviewed 2026-10-05.
let guard:((maximum:number,id:string)=>Promise<void>)|undefined;
export function setRouterAcceptanceGuard(next?:typeof guard){guard=next;}
export function providerFailure(status:number){return ({401:['MODEL_AUTH','AI provider authentication failed'],402:['MODEL_CREDITS','AI provider credits are unavailable'],408:['MODEL_TIMEOUT','AI provider request timed out'],429:['MODEL_RATE_LIMIT','AI provider is temporarily rate limited'],404:['MODEL_UNAVAILABLE','Selected AI model is unavailable'],400:['MODEL_REQUEST','AI provider rejected the request or tool schema'],413:['MODEL_CONTEXT','AI context limit exceeded']} as Record<number,string[]>)[status]||['MODEL_FAILED','AI provider is temporarily unavailable'];}
export async function routerCall(args:RouterCall){
 ensure(process.env.OPENROUTER_API_KEY,'MODEL_UNCONFIGURED','AI provider is not configured',503);
 const {brain}=args,bytes=Buffer.byteLength(JSON.stringify(args.body),'utf8');
 ensure(bytes<=100000,'MODEL_INPUT_SIZE','AI input exceeds the bounded context limit');
 const inputBound=bytes+1024+(args.search?128000:0),maxTokens=Number(args.body.max_tokens);
 ensure(Number.isInteger(maxTokens)&&maxTokens>0&&(!brain.maxOutput||maxTokens<=brain.maxOutput),'MODEL_CONTEXT','Invalid output token limit');
 ensure(!brain.context||inputBound+maxTokens<=brain.context,'MODEL_CONTEXT','AI context limit exceeded');
 const tiers=brain.pricingTiers?.filter(t=>t.minInputTokens<=inputBound);
 const inputPrice=tiers?.length?Math.max(...tiers.map(t=>t.inputPrice)):brain.reserveInputPrice??brain.inputPrice!,outputPrice=tiers?.length?Math.max(...tiers.map(t=>t.outputPrice)):brain.reserveOutputPrice??brain.outputPrice!;
 const reserve=Math.ceil(inputBound*inputPrice+maxTokens*outputPrice)+(args.search?searchReserve:0);
 ensure(reserve<=args.budget,'RUN_LIMIT','Model request exceeds the remaining run budget');
 ensure(args.timeout>0,'MODEL_TIMEOUT','AI request time budget exhausted',503);
 const id=randomUUID(),startedAt=new Date().toISOString(),base={model:brain.id,attempt:1,inputTokens:0,outputTokens:0,scope:args.scope,startedAt,clientRequestId:id};
 await guard?.(reserve,id);
 await args.checkpoint?.(reserve,{...base,estimated:true,status:'pending',modelCost:reserve-(args.search?searchReserve:0),searchCost:args.search?searchReserve:0});
 const headers:Record<string,string>={Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json','X-Title':'INDUSTRY','X-Client-Request-Id':id};
 const site=process.env.PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL;
 if(site)try{const u=new URL(site);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)headers['HTTP-Referer']=u.origin;}catch{}
 let response:Response;
 try{response=await fetch(routerBase+'/chat/completions',{method:'POST',redirect:'error',headers,body:JSON.stringify({...args.body,model:brain.id,provider:{require_parameters:true,data_collection:'deny',max_price:{prompt:inputPrice,completion:outputPrice,request:0}}}),signal:AbortSignal.timeout(Math.max(1,Math.min(45000,args.timeout)))});}catch{throw new AppError('MODEL_TIMEOUT','AI request interrupted; reserved cost retained for reconciliation',503);}
 if(!response.ok){const [code,message]=providerFailure(response.status);throw new AppError(code,message,503);}
 const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();
 try{if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>500000){await reader.cancel();throw new AppError('MODEL_RESPONSE_SIZE','AI response exceeded its limit',503);}chunks.push(part.value);}}catch(error){if(error instanceof AppError)throw error;throw new AppError('MODEL_TIMEOUT','AI response interrupted; reserved cost retained for reconciliation',503);}
 let data:any;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AppError('MODEL_RESPONSE','AI response was unreadable; reserved cost retained',503);}
 const u=data.usage,reported=u?.cost,known=typeof reported==='number'&&Number.isFinite(reported)&&reported>=0,cost=known?micro(reported):reserve;
 const searchCost=args.search?Math.min(cost,searchReserve):0;
 const usage={...base,estimated:!known,status:data.error?'failed':'completed',requestId:response.headers.get('x-request-id')||data.id,responseId:data.id,servedModel:data.model,provider:data.provider,inputTokens:u?.prompt_tokens||0,outputTokens:u?.completion_tokens||0,cachedInputTokens:u?.prompt_tokens_details?.cached_tokens||0,reasoningTokens:u?.completion_tokens_details?.reasoning_tokens||0,cacheWriteTokens:u?.prompt_tokens_details?.cache_write_tokens||0,reservedCost:reserve,inputBound,inputPrice,outputPrice,providerCost:known?reported:null,modelCost:cost-searchCost,searchCost,searchChargeEstimated:!!args.search,completedAt:new Date().toISOString()};
 await args.checkpoint?.(cost,usage);
 ensure(cost<=reserve,'MODEL_PRICE_CEILING','AI cost exceeded reserved ceiling; actual cost recorded for reconciliation',503);
 if(data.error){const [code,message]=providerFailure(Number(data.error.code));throw new AppError(code,message,503);}
 return {data,cost,usage};
}
