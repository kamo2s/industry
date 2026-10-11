// Runs outside Railway so a platform outage cannot silence the health check.
const base=process.env.MONITOR_BASE_URL||'https://industrypad.fun';
const key=process.env.MONITOR_API_SECRET;
if(!key)throw new Error('Configure the read-only monitor credential');
let result;
for(let attempt=0;attempt<2;attempt++){
 try{
  const r=await fetch(base+'/api/ops/health',{headers:{Authorization:`Bearer ${key}`},signal:globalThis.AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('HTTP '+r.status);
  result=await r.json();
  if(result.healthy){const publicResponse=await fetch(base+'/api/search?q=industry-health-check',{signal:globalThis.AbortSignal.timeout(15000)});if(!publicResponse.ok)throw new Error('Public API unavailable');await publicResponse.arrayBuffer();break;}
 }catch{result={healthy:false,alerts:['SITE_OR_MONITOR_UNAVAILABLE']};}
 if(attempt===0)await new Promise(resolve=>setTimeout(resolve,15000));
}
console.log(JSON.stringify(result));
if(!result.healthy)process.exitCode=1;


