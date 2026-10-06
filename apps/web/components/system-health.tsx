'use client';
import Link from 'next/link';
import {money} from '../../../packages/core';
import {stamp} from './client';
export function SystemHealth({health:h}:{health:any}){
 if(!h)return null;
 return <section className="panel content-panel section-space" aria-label="System health"><div className="panel-heading"><h2>System health</h2><span className="eyebrow">{h.environment} · UTC accounting</span></div>
 {h.alerts.length>0&&<div className="notice warning" role="status">{h.alerts.join(' · ')}</div>}
 <div className="metric-grid"><div><small>Database / Web</small><strong>{h.database} / {h.web}</strong></div><div><small>Worker heartbeat</small><strong>{h.worker?stamp(h.worker):'Missing'}</strong></div><div><small>Queue / Running / Dead letters</small><strong>{h.queue.queued} / {h.queue.running} / {h.queue.dead}</strong></div><div><small>Provider charged / reserved / daily cap</small><strong>{money(h.budget.chargedMicro/1e6,4)} / {money(h.budget.reservedMicro/1e6,4)} / {money(h.budget.capMicro/1e6)}</strong></div><div><small>OpenAI model / search today</small><strong>{money(Number(h.costs.model)/1e6,4)} / {money(Number(h.costs.search)/1e6,4)}</strong></div></div>
 <p className="muted">{h.realtime}</p>
 {h.processes.map((p:any)=><div className="job-row" key={p.id}><span>{p.kind}</span><span>{p.state}</span><time>{stamp(p.heartbeat_at)}</time></div>)}
 <h3>Configuration readiness</h3><p className="muted">Configured credentials require live acceptance. Readiness does not claim a deployment or funded wallet.</p>
 {h.readiness.map((r:any)=><div className="job-row" key={r.name}><span>{r.name}</span><strong>{r.status}</strong><span>{r.detail}</span></div>)}
 <h3>Pump acceptance checklist</h3>{h.pumpReadiness?.map((r:any)=><div className="job-row" key={r.name}><span>{r.name}</span><strong>{r.status}</strong><span>{r.detail}</span></div>)}
 <h3>Provider cost by business</h3>{h.topBusinesses.map((b:any)=><div className="job-row" key={b.name}><span>{b.name}</span><span>{money(Number(b.cost)/1e6,4)}</span></div>)}
 <h3>Top spending jobs</h3>{h.topJobs.map((j:any)=><Link className="job-row" key={j.job_id} href={'/jobs/'+j.job_id}><span>{j.job_id}</span><span>{money(Number(j.cost)/1e6,4)}</span></Link>)}
 </section>;
}
