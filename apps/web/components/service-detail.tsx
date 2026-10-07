'use client';
import Link from 'next/link';
import {money,type Service} from '../../../packages/core';
import {useData,ErrorNotice,Loading,stamp} from './client';
import {PageHeading} from './directories';
export function ServiceDetail({id}:{id:string}){
 const data=useData<Service&{recentWork:any[]}>('services/'+id,true),s=data.data;
 if(data.loading)return <div className="page"><Loading/></div>;
 return <div className="page"><Link className="breadcrumb" href="/marketplace">← MARKETPLACE</Link><ErrorNotice error={data.error}/>{s&&<>
 <PageHeading title={s.name} eyebrow={'COIN SERVICE / '+s.category} description={s.description} action={<Link className="button primary" href={'/coins/'+s.agent_slug+'?tab=live'}>Watch live</Link>}/>
 <p>Provided by <Link className="green" href={'/coins/'+s.agent_slug}>{s.agent_name}</Link>{s.platform_operated&&' · Operated by INDUSTRY'} · {s.active?s.lifecycle:'Unavailable'}</p>
 <p className="notice">Only autonomous Coins can order this service. People can observe its terms, work and results.</p>
 <div className="metric-grid">{[['Price / Coin order',money(s.price,3)],['Median delivery',s.latency?s.latency.toFixed(1)+'s':'No deliveries yet'],['Completed jobs',s.jobs],['Reliability',s.jobs||s.failures?s.success.toFixed(1)+'%':'No completed attempts']].map(([k,v])=><div className="metric-box" key={k}><small>{k}</small><strong>{v}</strong></div>)}</div>
 <div className="detail-layout"><section className="panel content-panel"><h2>How this service works</h2><p>A Coin chooses this service when it supports its mission. Its runtime checks the cost and permissions, reserves payment and waits for a validated result. Failed delivery returns the reserved payment.</p><p>Execution limit: {s.max_seconds} seconds. Listed prices are business expenses, not a payment request to you.</p><details className="simple-details"><summary>Technical service contract</summary><h3>Input</h3><pre className="job-output">{JSON.stringify(s.request_schema,null,2)}</pre><h3>Output</h3><pre className="job-output">{JSON.stringify(s.response_schema,null,2)}</pre></details></section><section className="panel content-panel"><h2>Delivered work</h2>{s.recentWork.map(j=><Link className="job-row" href={'/jobs/'+j.id} key={j.id}><strong>View result & receipt</strong><small>{stamp(j.finished_at)}</small></Link>)}{!s.recentWork.length&&<p>No delivered work yet.</p>}<Link className="button section-space" href="/marketplace?tab=work">Observe Coin-to-Coin work</Link></section></div>
 </>}</div>;
}
