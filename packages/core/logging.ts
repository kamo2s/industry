import {appEnvironment} from './environment';
const permitted=new Set(['trace_id','business_id','agent_id','job_id','run_id','service_request_id','ledger_transaction_id','worker_instance','code','status','cost_micro','phase','kind']);
export function logEvent(service:string,event:string,fields:Record<string,unknown>={}){console.log(JSON.stringify({timestamp:new Date().toISOString(),environment:appEnvironment(),service,event,...Object.fromEntries(Object.entries(fields).filter(([k,v])=>permitted.has(k)&&['string','number','boolean'].includes(typeof v)))}));}
