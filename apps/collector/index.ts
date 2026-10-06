import {validateEnvironment} from '../../packages/core/environment';
import {logEvent} from '../../packages/core/logging';
validateEnvironment('collector');
// Dedicated scheduler. Signing and receipt verification run in the trusted DB
// service; the AI worker has neither this credential nor the operational key.
let stopped=false;for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>{stopped=true;});
while(!stopped){
 try{const secret=process.env.PUMP_COLLECTOR_API_SECRET;if(!secret||secret.length<32)throw new Error('Collector scheduler credential missing');const base=process.env.INTERNAL_API_URL||`http://127.0.0.1:${process.env.DB_PORT||4318}`;const r=await fetch(`${base}/collector`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({op:'tick'}),signal:AbortSignal.timeout(300000)});logEvent('pump-collector','tick',{status:r.ok?'disabled-or-reconciled':'retry'});}catch{logEvent('pump-collector','unavailable');}
 for(let n=0;n<30&&!stopped;n++)await new Promise(r=>setTimeout(r,1000));
}
export {};
