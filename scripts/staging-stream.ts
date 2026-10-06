import {readFile,writeFile} from 'node:fs/promises';
const people=JSON.parse(await readFile('.data/staging/identities.json','utf8'));
const base='http://localhost:3100',started=Date.now(),deadline=started+25*60000;
const report={startedAt:new Date(started).toISOString(),scope:'Local staging HTTPS-independent SSE transport; no Supabase direct subscription',frames:0,reconnections:0,unexpectedDisconnects:0,maxGapMs:0,complete:false,durationMinutes:0};
let lastFrame=0,finished=false;
const save=async()=>{report.durationMinutes=(Date.now()-started)/60000;await writeFile('qa/staging/stream.json',JSON.stringify(report,null,2));};
while(!finished&&Date.now()<deadline){
 const controller=new AbortController();
 const watchdog=setInterval(()=>{void readFile('qa/staging/soak.json','utf8').then(body=>{if(JSON.parse(body).complete||Date.now()>=deadline){finished=true;controller.abort();}}).catch(()=>{});},15000);
 const stale=setInterval(()=>{if(lastFrame&&Date.now()-lastFrame>15000)controller.abort();},5000);
 try{
  const response=await fetch(base+'/api/stream',{headers:{Cookie:'industry_session='+people[0].session},signal:controller.signal});
  if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('SSE unavailable');
  const reader=response.body!.getReader(),decoder=new TextDecoder();let pending='';
  while(!finished){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});const parts=pending.split('\n\n');pending=parts.pop()||'';for(const frame of parts)if(frame.includes('event: refresh')){const now=Date.now();if(lastFrame)report.maxGapMs=Math.max(report.maxGapMs,now-lastFrame);lastFrame=now;report.frames++;if(report.frames%10===0)await save();}}
  await reader.cancel().catch(()=>{});if(!finished)report.unexpectedDisconnects++;
 }catch{if(!finished)report.unexpectedDisconnects++;}
 finally{clearInterval(watchdog);clearInterval(stale);controller.abort();}
 if(!finished&&Date.now()<deadline){report.reconnections++;await save();await new Promise(r=>setTimeout(r,5000));}
}
report.complete=finished&&report.frames>0;await save();console.log(JSON.stringify(report));
if(!report.complete||report.unexpectedDisconnects||report.maxGapMs>15000)process.exitCode=1;
