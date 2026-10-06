import 'dotenv/config';
import {readinessConfiguration} from '../packages/db/system-health';
import {validateEnvironment,appEnvironment} from '../packages/core/environment';
import {safetyConfig} from '../packages/core/security';
const role=(process.argv.find(a=>a.startsWith('--role='))?.split('=')[1]||'database') as 'database'|'web'|'worker'|'collector';
let valid=true;try{safetyConfig();validateEnvironment(role);}catch(e){valid=false;console.log(JSON.stringify({name:'SAFE CONFIGURATION',status:'BLOCKED',detail:(e as Error).message}));}
const items=readinessConfiguration();for(const item of items)console.log(JSON.stringify(item));
const financial=new Set(['PUMP','TREASURY','COLLECTOR','METADATA','ALT','PYTH']),production=appEnvironment()==='production'||process.argv.includes('--target=production');
const blockers=items.filter(i=>(i.status==='MISSING'||i.status==='BLOCKED'||production&&financial.has(i.name)&&i.status==='DISABLED')&&(production||!financial.has(i.name)&&i.name!=='CI'));
if(process.argv.includes('--strict')&&(!valid||blockers.length))process.exitCode=1;
if(process.argv.includes('--probe')){
 const origin=process.env.PUBLIC_APP_URL||'http://127.0.0.1:3000';
 try{const response=await fetch(new URL('/api/health',origin),{signal:AbortSignal.timeout(8000),redirect:'error'});if(!response.ok)throw new Error('HTTP '+response.status);const health=await response.json();const ready=health.worker==='online'&&health.database==='ok';console.log(JSON.stringify({name:'LIVE HEALTH PROBE',status:ready?'READY':'BLOCKED',detail:{database:health.database,worker:health.worker},scope:appEnvironment()==='local'?'local only':'configured host only'}));if(!ready&&process.argv.includes('--strict'))process.exitCode=1;}catch{console.log(JSON.stringify({name:'LIVE HEALTH PROBE',status:'BLOCKED',detail:'Health endpoint unavailable or requires authorized access'}));if(process.argv.includes('--strict'))process.exitCode=1;}
}
console.log(JSON.stringify({environment:appEnvironment(),scope:'Configuration readiness, not production or hosted acceptance',configurationValid:valid,liveServicesVerified:false,ownerGates:['hosted infrastructure authorization','controlled Pump acceptance','public launch approval']}));
