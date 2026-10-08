import type {Agent,Service} from './index';
import {coinDirectoryStatus} from './coin-directory';

// Display-only selectors. Execution eligibility and purchasing stay in the runtime.
export const marketplaceDefaults={q:'',category:'',role:'',price:'',success:'',availability:'',sort:'featured',page:'1',tab:'services'};
export type MarketplaceFilters=typeof marketplaceDefaults;
export type ServiceEntry={service:Service;provider?:Agent};
export function serviceAvailability({service:s,provider:a}:ServiceEntry){
 if(!s.active)return 'Unavailable';
 if(!a?.operational)return 'Unknown';
 if(a.paused||a.terminated_at||a.config.policy?.killSwitch||a.health==='ERROR'||['DORMANT','LOW COMPUTE'].includes(a.metrics.lifecycle))return 'Unavailable';
 if(['PAUSED','TERMINATED','LOW COMPUTE','ERROR','WAITING FOR BUDGET','WAITING FOR PROVIDER','RETRYING'].includes(a.operational.state))return 'Unavailable';
 if(a.operational.active||a.operational.state==='QUEUED')return 'Busy';
 return ['IDLE','READY','SCHEDULED','WAITING FOR DATA'].includes(a.operational.state)?'Available now':'Unknown';
}
export function sustainingProvider(e:ServiceEntry){return !!e.provider&&coinDirectoryStatus(e.provider)==='Self-Sustaining';}
export function serviceDisplayStatus(e:ServiceEntry){
 const availability=serviceAvailability(e);
 return availability==='Unavailable'||availability==='Busy'||availability==='Unknown'?availability:sustainingProvider(e)?'Self-Sustaining':'Active';
}
export function serviceSample(s:Service){return s.jobs+(s.failures||0);}
export function serviceMatches(e:ServiceEntry,f:MarketplaceFilters,skip?:keyof MarketplaceFilters){
 const s=e.service,has=(k:keyof MarketplaceFilters)=>k!==skip&&!!f[k];
 if(has('q')&&!`${s.name} ${s.agent_name} ${s.ticker||''} ${s.description} ${s.category} ${e.provider?.job_type||s.agent_role||''}`.toLowerCase().includes(f.q.trim().toLowerCase()))return false;
 if(has('category')&&s.category!==f.category)return false;
 if(has('role')&&(e.provider?.job_type||s.agent_role)!==f.role)return false;
 if(has('price')){const p=s.price;if(f.price==='under'&&p>=1||f.price==='low'&&(p<1||p>5)||f.price==='mid'&&(p<=5||p>10)||f.price==='high'&&p<=10)return false;}
 if(has('success')&&(!serviceSample(s)||s.success<Number(f.success)))return false;
 if(has('availability')&&(f.availability==='sustaining'?!sustainingProvider(e):serviceAvailability(e)!==f.availability))return false;
 return true;
}
export function sortServices(entries:ServiceEntry[],sort:string){
 const reliability=(s:Service)=>serviceSample(s)?s.success:-1;
 const latency=(s:Service)=>s.jobs>0&&s.latency>0?s.latency:Infinity;
 return [...entries].sort((a,b)=>{
  const x=a.service,y=b.service;
  let result:number;
  if(sort==='price')result=x.price-y.price;
  else if(sort==='latency')result=latency(x)-latency(y);
  else if(sort==='reliability')result=reliability(y)-reliability(x)||serviceSample(y)-serviceSample(x);
  else if(sort==='newest')result=Date.parse(y.created_at)-Date.parse(x.created_at);
  else if(sort==='usage')result=y.jobs-x.jobs;
  else result=Number(serviceAvailability(b)==='Available now')-Number(serviceAvailability(a)==='Available now')||Number(sustainingProvider(b))-Number(sustainingProvider(a))||y.jobs-x.jobs||reliability(y)-reliability(x);
  return result||x.id.localeCompare(y.id);
 });
}
export function serviceChips(s:Service){
 // Only explicit contract outputs are labelled; never infer tools from a role.
 const labels:Record<string,string>={sources:'Sources',summary:'Summary',findings:'Findings',data:'Data',report:'Report',verdict:'Verdict',confidence:'Confidence',analysis:'Analysis',citations:'Citations',evidence:'Evidence',claims:'Claims',items:'Items'};
 const properties=s.response_schema?.properties;
 return [...new Set([s.category,...Object.keys(properties&&typeof properties==='object'?properties:{}).filter(k=>labels[k]).map(k=>labels[k])])].slice(0,4);
}
export function serviceTone(category:string){return ({Research:'mint',Verification:'cyan',Analysis:'violet',Monitoring:'blue',Data:'blue','On-chain':'cyan',Trading:'amber',Content:'violet'} as Record<string,string>)[category]||'cyan';}

