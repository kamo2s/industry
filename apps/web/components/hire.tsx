'use client';
import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { X,ArrowRight,ShieldCheck } from 'lucide-react';
import { type Service,type Agent,money } from '../../../packages/core';
import { useAuth } from './shell';
import { api,ErrorNotice } from './client';
export function HireModal({service,onClose}:{service:Service;onClose:()=>void}){
  const auth=useAuth(),router=useRouter();
  const [topic,setTopic]=useState(''),[advanced,setAdvanced]=useState(false),[json,setJson]=useState('{"topic":""}'),[agents,setAgents]=useState<Agent[]>([]),[buyer,setBuyer]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [key]=useState(()=>crypto.randomUUID());
  useEffect(()=>{if(auth.profile)void api('dashboard').then(d=>setAgents(d.agents)).catch(()=>{});},[auth.profile]);
  async function submit(){if(!auth.profile){auth.connect();return;}setBusy(true);setError('');try{const input=advanced?JSON.parse(json):{topic};const r=await api(`services/${service.id}/request`,{input,...(buyer?{requesterAgentId:buyer}:{})},key);await auth.refresh();router.push('/jobs/'+r.jobId);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className="modal-backdrop" onClick={()=>!busy&&onClose()}><section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="hire-title" onClick={e=>e.stopPropagation()}><button className="icon-button modal-close" onClick={onClose} aria-label="Close service request"><X/></button><div className="eyebrow">{service.agent_name} / SERVICE REQUEST</div><h2 id="hire-title">{service.name}</h2><p>{service.description}</p><ErrorNotice error={error}/><label className="field">{advanced?'Request JSON':'What should the agent work on?'}<textarea value={advanced?json:topic} onChange={e=>advanced?setJson(e.target.value):setTopic(e.target.value)} placeholder="Enter a topic, claim, or research question…"/></label><label className="checkbox-row"><input type="checkbox" checked={advanced} onChange={e=>{setAdvanced(e.target.checked);setJson(JSON.stringify({topic},null,2));}}/>Use machine-readable JSON input</label>{advanced&&<details><summary className="muted">Request schema</summary><pre className="job-output">{JSON.stringify(service.request_schema,null,2)}</pre></details>}
    {agents.length>0&&<label className="field section-space">Pay as<select value={buyer} onChange={e=>setBuyer(e.target.value)}><option value="">My wallet · test credits</option>{agents.filter(a=>a.id!==service.agent_id).map(a=><option key={a.id} value={a.id}>{a.name} · {money(a.metrics.balance)} available</option>)}</select><small>Agent purchases must satisfy its tool permissions and spending policy.</small></label>}
    <div className="notice section-space"><ShieldCheck size={14}/> {money(service.price,3)} test USDC is reserved now and credited to the provider after successful completion. Failed requests are refunded.</div><button className="button primary full" disabled={busy||(!advanced&&topic.trim().length<3)} onClick={()=>void submit()}>{busy?'Submitting request…':auth.profile?`Request service · ${money(service.price,3)} USDC`:'Connect wallet to request'}<ArrowRight size={16}/></button></section></div>;
}
