import {ensure} from '../core';
import {approvedModels,defaultModelId} from '../core/model-registry';

export function configuredModels(){const narrowed=(process.env.OPENROUTER_ALLOWED_MODELS||'').split(',').map(s=>s.trim()).filter(Boolean);return approvedModels.filter(m=>m.enabled&&(!narrowed.length||narrowed.includes(m.id))).map(m=>m.id);}
export {defaultModelId};
export function openRouterCeilings(){
 const input=Number(process.env.MODEL_INPUT_PRICE_PER_MILLION?.trim()||100),output=Number(process.env.MODEL_OUTPUT_PRICE_PER_MILLION?.trim()||500);
 ensure(Number.isFinite(input)&&Number.isFinite(output)&&input>=0&&output>0,'MODEL_PRICE_REQUIRED','Configure finite model input/output price ceilings',503);
 return {input,output};
}
export function modelAuthor(id:string){const slug=id.split('/')[0];return ({openai:'OpenAI',google:'Google',anthropic:'Anthropic',deepseek:'DeepSeek','x-ai':'xAI',qwen:'Qwen',mistralai:'Mistral','meta-llama':'Meta'} as Record<string,string>)[slug]||slug;}
