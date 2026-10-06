import {ensure} from '../core';
import {approvedModels} from '../core/model-registry';
import {developmentProviderAllowed as demoMode} from '../core/environment';
import {configuredModels,openRouterCeilings} from './openrouter-config';
export {configuredModels} from './openrouter-config';
export type Brain={reasoningEffort?:'low';pricingTiers?:{minInputTokens:number;inputPrice:number;outputPrice:number}[];id:string;name:string;provider:string;inputPrice:number|null;outputPrice:number|null;context:number|null;costTier:string;speed:string;development:boolean;capabilities?:string[];structured?:boolean;webSearch?:boolean;status?:string;cachedInputPrice?:number;route?:string;maxOutput?:number|null;reserveInputPrice?:number;reserveOutputPrice?:number;parameters?:string[];recommended?:boolean;recommendedRank?:number;tier?:string;description?:string;intelligenceTier?:string;speedTier?:string};
let cache:{key:string;at:number;models:Brain[]}|undefined;
let pending:{key:string;promise:Promise<Brain[]>}|undefined;
const feeRouting={available:false,description:'Pump fees use independently verified routing and a separate collector. USD fee allocation uses the approved V1 policy.'};

async function routerModels():Promise<Brain[]>{
 const allowed=configuredModels(),ceiling=openRouterCeilings(),key=JSON.stringify([allowed,ceiling]);
 if(cache?.key===key&&Date.now()-cache.at<300000)return cache.models;
 if(pending?.key===key)return pending.promise;
 const promise=(async()=>{
  const response=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(10000),redirect:'error'});
  ensure(response.ok,'CATALOG_UNAVAILABLE','OpenRouter catalog is temporarily unavailable',503);
  const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>6000000){await reader.cancel();throw Error('Catalog response too large');}chunks.push(value);}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));ensure(Array.isArray(data.data),'CATALOG_INVALID','OpenRouter catalog is invalid',503);
  const models:Brain[]=[];
  for(const id of allowed){
   const m=data.data.find((entry:any)=>entry.id===id);if(!m)continue;
   const input=m.pricing?.prompt,output=m.pricing?.completion;
   if(input===undefined||input===null||input===''||output===undefined||output===null||output==='')continue;
   const inputPrice=Number((Number(input)*1e6).toPrecision(12)),outputPrice=Number((Number(output)*1e6).toPrecision(12));
   if(!Number.isFinite(inputPrice)||!Number.isFinite(outputPrice)||inputPrice<0||outputPrice<0||inputPrice>ceiling.input||outputPrice>ceiling.output)continue;
   if(!m.supported_parameters?.includes('tools')||!m.supported_parameters?.includes('structured_outputs')||!m.architecture?.output_modalities?.includes('text')||!m.architecture?.input_modalities?.includes('text'))continue;
   if(Number(m.pricing?.request||0)!==0||m.expiration_date&&Date.parse(m.expiration_date)<=Date.now())continue;
   const entry=approvedModels.find(m=>m.id===id)!;
   const prices=[m.pricing,...(m.pricing.overrides||[])];
   const pricingTiers=prices.map((p:any,i:number)=>({minInputTokens:i?Math.max(0,Number(p.min_prompt_tokens)||0):0,inputPrice:Math.max(Number(p.prompt||0),Number(p.input_cache_write||0))*1e6,outputPrice:Number(p.completion||0)*1e6}));
   const reserveInputPrice=Math.max(...prices.flatMap((p:any)=>[Number(p.prompt||0)*1e6,Number(p.input_cache_write||0)*1e6]));
   const reserveOutputPrice=Math.max(...prices.map((p:any)=>Number(p.completion||0)*1e6));
   models.push({...entry,id,name:entry.displayName,provider:entry.providerDisplayName,route:'OpenRouter',inputPrice,outputPrice,pricingTiers,reserveInputPrice,reserveOutputPrice,parameters:m.supported_parameters,reasoningEffort:m.reasoning?.supported_efforts?.includes('low')?'low':undefined,context:Number(m.context_length)||null,maxOutput:Number(m.top_provider?.max_completion_tokens)||null,speed:entry.speedTier,development:false,structured:true,status:'Reviewed'});
  }
  cache={key,at:Date.now(),models};return models;
 })();
 pending={key,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=undefined;}
}
export async function modelCatalog(){
 const development:Brain[]=demoMode()?[{id:'development/mock',name:'Deterministic development worker',provider:'INDUSTRY development',inputPrice:null,outputPrice:null,context:null,costTier:'Test credits',speed:'Local',development:true}]:[];

 let routed:Brain[]=[],status='not-configured',notice='OpenRouter is not configured. Live AI requires a configured credential.';
 if(process.env.OPENROUTER_API_KEY){try{routed=await routerModels();status=routed.length?'available':'no-compatible-models';notice=routed.length?'OpenRouter models are filtered for structured results and current price limits. Search uses INDUSTRY’s configured tools.':'No configured OpenRouter models meet the current capability and price limits.';}catch{status='unavailable';notice='OpenRouter model discovery is temporarily unavailable. Please retry to refresh the approved catalog.';}}
 return {models:[...routed,...development],notice,openrouter:{status,count:routed.length},feeRouting};
}
export async function validateBrain(id?:string){if(!id)return;ensure((await modelCatalog()).models.some(m=>m.id===id),'MODEL_UNAVAILABLE','Select a brain from the currently configured catalog');}
export async function openRouterBrain(id:string){
 ensure(process.env.OPENROUTER_API_KEY,'MODEL_UNCONFIGURED','Selected OpenRouter brain requires OPENROUTER_API_KEY',503);
 ensure(configuredModels().includes(id),'MODEL_UNAVAILABLE','Selected brain is no longer enabled');
 const model=(await routerModels()).find(m=>m.id===id);ensure(model,'MODEL_UNAVAILABLE','Selected OpenRouter model is unavailable or outside capability/price limits',503);return model!;
}


