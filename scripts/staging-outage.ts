import {readFile,writeFile,open} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import path from 'node:path';
const cfg=JSON.parse(await readFile('.data/staging/environment.json','utf8')),base=cfg.PUBLIC_APP_URL;
const checks:Record<string,boolean>={},before=Date.now(),controller=new AbortController();let frames=0;
const response=await fetch(base+'/api/stream',{signal:controller.signal});const reader=response.body!.getReader();const reading=(async()=>{try{while(true){const part=await reader.read();if(part.done)break;frames+=(new TextDecoder().decode(part.value).match(/event: refresh/g)||[]).length;}}catch{}})();
const bin=path.resolve('.tools/postgresql/pgsql/bin/pg_ctl.exe');const log=await open('.data/staging/outage.log','a');
function ctl(args:string[]){const r=spawnSync(bin,['-D','.data/staging/pgdata',...args],{stdio:['ignore',log.fd,log.fd],windowsHide:true});if(r.status!==0)throw Error('Isolated pg_ctl command failed');}
try{
 ctl(['-m','fast','-w','stop']);
 const failed=await fetch(base+'/api/health');checks.webSafeFailure=failed.status===500&&!(await failed.text()).includes(cfg.DATABASE_URL);
 await new Promise(r=>setTimeout(r,26000));checks.workerDetectsOutage=!(await fetch('http://127.0.0.1:4419')).ok;
}finally{ctl(['-l','.data/staging/postgres.log','-o','-h 127.0.0.1 -p 55432 -c timezone=UTC','-w','start']);}
for(let i=0;i<30;i++){if((await fetch(base+'/api/health')).ok&&(await fetch('http://127.0.0.1:4419')).ok){checks.webRecovered=true;checks.workerRecovered=true;break;}await new Promise(r=>setTimeout(r,1000));}
checks.sseStayedOpen=frames>=5;controller.abort();await reading;
await writeFile('qa/staging/outage.json',JSON.stringify({at:new Date().toISOString(),durationSeconds:(Date.now()-before)/1000,sseFrames:frames,checks},null,2));console.log(JSON.stringify({checks}));await log.close();if(Object.values(checks).some(v=>!v))process.exitCode=1;
