import 'dotenv/config';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {approvedModels} from '../packages/core/model-registry';
import {routerCall,setRouterAcceptanceGuard} from '../packages/agent/openrouter-client';
import type {Brain} from '../packages/agent/catalog';
delete process.env.OPENAI_API_KEY;
const dir=process.env.INDUSTRY_QA_DIR||'qa/openrouter-migration',catalog=JSON.parse(await readFile(dir+'/catalog.json','utf8')).data;
const journalFile=dir+'/compatibility-budget.json';
let journal:Record<string,number>={};try{journal=JSON.parse(await readFile(journalFile,'utf8'));}catch{}
let runtimeReserved=0;try{runtimeReserved=JSON.parse(await readFile(dir+'/runtime-budget.json','utf8')).reserved||0;}catch{}
setRouterAcceptanceGuard(async(max,id)=>{assert(runtimeReserved+Object.values(journal).reduce((a,b)=>a+b,0)+max<=2000000,'Acceptance cap $2');journal[id]=max;await writeFile(journalFile,JSON.stringify(journal));});
const reports:any[]=[];const transport=globalThis.fetch;const hosts=new Set<string>();globalThis.fetch=async(input,init)=>{const url=new URL(String(input));hosts.add(url.hostname);assert.equal(url.hostname,'openrouter.ai');return transport(input,init);};
const requested=process.argv.slice(2);
for(const entry of approvedModels.filter(m=>!requested.length||requested.includes(m.id))){
 const calls:any[]=[];
 const m=catalog.find((m:any)=>m.id===entry.id),report:any={id:entry.id,passed:false};
 try{
 assert(m,'Model missing');assert(m.supported_parameters.includes('structured_outputs')&&m.supported_parameters.includes('tools'),'Required capabilities missing');
 const brain:Brain={...entry,name:entry.displayName,provider:entry.providerDisplayName,inputPrice:Number(m.pricing.prompt)*1e6,outputPrice:Number(m.pricing.completion)*1e6,reserveInputPrice:Math.max(...[m.pricing,...(m.pricing.overrides||[])].flatMap((p:any)=>[Number(p.prompt||0)*1e6,Number(p.input_cache_write||0)*1e6])),reserveOutputPrice:Math.max(...[m.pricing,...(m.pricing.overrides||[])].map((p:any)=>Number(p.completion||0)*1e6)),speed:entry.speedTier,development:false,context:m.context_length};
 const call=async(body:any)=>{const result=await routerCall({brain,body:{...body,...(m.supported_parameters.includes('reasoning')?{reasoning:{...(m.reasoning?.supported_efforts?.includes('low')?{effort:'low'}:{}),exclude:true}}:{})},budget:500000,timeout:45000,scope:{businessId:'compatibility',jobId:entry.id},checkpoint:async(cost,u)=>{if(u?.clientRequestId){if(u.status!=='pending')calls.push(u);journal[u.clientRequestId]=cost;await writeFile(journalFile,JSON.stringify(journal));}}});assert(result.usage.estimated===false,'Actual cost required');return result;};
 const tools=['search_public_sources','hire_coin_service'].map(name=>({type:'function',function:{name,description:name==='search_public_sources'?'Search public documentation (test stub)':'Request an allowed Coin service (test stub)',parameters:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}}}));
 const messages:any[]=[{role:'user',content:'Compatibility test using harmless stub tools. Call both search_public_sources and hire_coin_service, each with query PostgreSQL row security. Do not answer until both tools have been called.'}];
 const first=await call({messages,tools,tool_choice:'auto',max_tokens:500});const message=first.data.choices[0].message;
 const tc=message.tool_calls;assert(Array.isArray(tc)&&tc.length>=1,'Tool call missing');for(const t of tc){assert(tools.some(x=>x.function.name===t.function.name));assert(typeof JSON.parse(t.function.arguments).query==='string');}
 messages.push(message,...tc.map((t:any)=>({role:'tool',tool_call_id:t.id,content:JSON.stringify({summary:'Enabling row security with no policy applies default deny.',source:'https://www.postgresql.org/docs/current/ddl-rowsecurity.html'})})));
 const second=await call({messages:[...messages,{role:'user',content:'Summarize the supplied tool evidence. Return JSON with ok=true and a short summary. Do not call more tools.'}],max_tokens:1200,response_format:{type:'json_schema',json_schema:{name:'acceptance',strict:true,schema:{type:'object',properties:{ok:{type:'boolean'},summary:{type:'string'}},required:['ok','summary'],additionalProperties:false}}}});
 const parsed=JSON.parse(second.data.choices[0].message.content);assert.equal(parsed.ok,true);assert(typeof parsed.summary==='string'&&parsed.summary.length>10);
 const plain=await call({messages:[{role:'user',content:'Reply with the single word READY.'}],max_tokens:100});assert(/READY/i.test(plain.data.choices[0].message.content));
 Object.assign(report,{passed:true,toolCalls:tc.map((t:any)=>t.function.name),multipleTools:tc.length>1,usage:calls});
 }catch(e:any){report.error=e.code||e.message;report.usage=calls;}
 reports.push(report);await writeFile(dir+'/compatibility.json',JSON.stringify({openAIKeyAbsent:!process.env.OPENAI_API_KEY,hosts:[...hosts],reports},null,2));console.log(JSON.stringify({id:entry.id,passed:report.passed,error:report.error,multipleTools:report.multipleTools}));
}
console.log('Accounted USD '+Object.values(journal).reduce((a,b)=>a+b,0)/1e6);
