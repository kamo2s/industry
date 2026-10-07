import type {Agent} from './index';
export type DirectoryModel={id:string;name:string;provider:string;development:boolean};
export type DirectoryFilters={q:string;role:string;category:string;provider:string;model:string;status:string;network:string;sort:string;view:string;page:string};
export const directoryDefaults:DirectoryFilters={q:'',role:'',category:'',provider:'',model:'',status:'',network:'',sort:'Featured',view:'grid',page:'1'};
export const directoryRoles=['Researcher','Verifier','Watcher','Analyst','Scout','Indexer','Reporter','Auditor','Custom'];
export function coinDirectoryStatus(a:Agent){
 if(a.terminated_at)return 'Retired';
 if(a.paused)return 'Paused';
 if(a.operational?.active)return a.metrics.lifecycle==='SELF-SUSTAINING'?'Self-Sustaining':'Active';
 if(a.operational?.state==='RETRYING')return 'Retrying';
 if(a.operational?.state==='WAITING FOR SUPPLIER')return 'Awaiting supplier';
 if(a.operational?.state==='WAITING FOR BUDGET')return 'Budget cooldown';
 if(a.operational?.state==='WAITING FOR PROVIDER')return 'Provider waiting';
 if(a.health==='ERROR'||a.operational?.state==='ERROR')return 'Needs attention';
 if(a.metrics.lifecycle==='LOW COMPUTE')return 'Needs funding';
 if(a.metrics.lifecycle==='DORMANT')return 'Dormant';
 if(a.metrics.lifecycle==='BOOTING')return 'Starting';
 if(a.metrics.lifecycle==='SELF-SUSTAINING')return 'Self-Sustaining';
 return 'Active';
}
export function providerName(model:DirectoryModel){const value=model.provider.toLowerCase();return model.development?'Development':({openai:'OpenAI',anthropic:'Anthropic',google:'Google',xai:'xAI','x-ai':'xAI',deepseek:'DeepSeek',qwen:'Qwen',mistralai:'Mistral',mistral:'Mistral',moonshotai:'Moonshot',minimax:'MiniMax','z-ai':'Z.ai'} as Record<string,string>)[value]||model.provider;}
export function directoryMatches(a:Agent,f:DirectoryFilters,models:DirectoryModel[],except?:'role'|'provider'|'status'){
 const model=models.find(m=>m.id===a.config.brain),text=[a.name,a.ticker,a.job_type,a.token?.mint,a.treasury?.public_address].filter(Boolean).join(' ').toLowerCase();
 return text.includes(f.q.trim().toLowerCase())&&(!f.category||a.category===f.category)&&(!f.role||except==='role'||a.job_type===f.role)&&(!f.provider||except==='provider'||!!model&&providerName(model)===f.provider)&&(!f.model||except==='provider'||model?.id===f.model)&&(!f.status||except==='status'||coinDirectoryStatus(a).toUpperCase()===f.status.toUpperCase())&&(!f.network||(f.network==='live'?a.token?.network==='mainnet-beta':f.network==='devnet'?a.token?.network==='devnet':f.network==='platform'?!!a.platform_operated:!a.token&&!a.platform_operated));
}
export function sortDirectory(coins:Agent[],sort:string){
 return [...coins].sort((a,b)=>{
  const difference=sort==='New'?Date.parse(b.created_at)-Date.parse(a.created_at):sort==='Revenue'?(b.metrics.serviceRevenue7d ?? b.metrics.revenue7d)-(a.metrics.serviceRevenue7d ?? a.metrics.revenue7d):sort==='Most Productive'?(b.metrics.jobs7d||0)-(a.metrics.jobs7d||0):sort==='Market Cap'?(b.market?.marketCap??-1)-(a.market?.marketCap??-1):Number(coinDirectoryStatus(b)==='Self-Sustaining')-Number(coinDirectoryStatus(a)==='Self-Sustaining')||(b.metrics.serviceRevenue7d ?? b.metrics.revenue7d)-(a.metrics.serviceRevenue7d ?? a.metrics.revenue7d);
  return difference||a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
 });
}

