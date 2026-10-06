'use client';
import { feePhases,type FeePolicy,type FeeSegment } from '../../../packages/core/fee-policy';
import { useData,ErrorNotice } from './client';

function dollars(n:number){return '$'+n.toLocaleString('en-US',{maximumFractionDigits:6});}
function microDollars(value:string){const n=BigInt(value);return '$'+(n/1000000n).toLocaleString('en-US')+'.'+(n%1000000n).toString().padStart(6,'0');}
export function FeePolicyView(){
 const {data,error}=useData('treasury/policy'),policy:FeePolicy|undefined=data?.policy;
 return <div className="section-space" data-testid="fee-policy"><h3>Creator-fee allocation</h3><ErrorNotice error={error}/>{policy?<>
  <p className="data-note">{data.source==='v1-default'?'Approved V1 defaults':'Operator-configured policy'} · cumulative confirmed USD-valued Pump creator fees per business.</p>
  <div className="table-overflow"><table className="terminal-table"><thead><tr><th>Phase</th><th>Cumulative fees</th><th>Compute</th><th>Operating</th><th>INDUSTRY</th></tr></thead><tbody>{feePhases.map((name,i)=>{const p=policy.phases[name],next=feePhases[i+1];return <tr key={name}><td>{name}</td><td>{dollars(p.threshold)}{next?'–'+dollars(policy.phases[next].threshold):'+'}</td><td>{Number((p.compute_share*100).toFixed(10))}%</td><td>{Number((p.operating_share*100).toFixed(10))}%</td><td>{Number((p.platform_share*100).toFixed(10))}%</td></tr>;})}</tbody></table></div>
  {policy.phases.BOOTSTRAP.platform_share===0&&policy.phases.GROWTH.platform_share===0&&<p>INDUSTRY only begins earning a platform share once the business reaches Established.</p>}
  <p className="data-note">Each band applies only to the portion of a receipt within that band. The amount above a boundary uses the next phase. Historical allocations retain their recorded policy.</p>
  <p className="data-note">{data.notice}</p>
 </>:!error&&<p role="status">Loading fee policy…</p>}
 <p className="data-note">V1 service and job sales: 100% to seller Operating Balance. Marketplace commission and business-to-business transaction fees: 0%. Creator fees and platform allocations do not count toward external revenue or Self-Sustaining.</p></div>;
}
export function FeeAllocationDetails({allocation,phase}:{allocation?:{segments:FeeSegment[]};phase?:string}){
 if(!allocation)return <p className="data-note">{phase?'Recorded phase: '+phase+'. Historical allocation retained; no new split applied.':'Allocation is pending trusted pricing.'}</p>;
 return <div className="table-overflow"><table className="terminal-table"><caption>Recorded allocation · exact USD accounting values</caption><thead><tr><th>Phase / cumulative interval</th><th>Receipt portion</th><th>Compute</th><th>Operating</th><th>INDUSTRY</th></tr></thead><tbody>{allocation.segments.map(s=><tr key={s.phase}><td>{s.phase}<small>{microDollars(s.fromMicroUsd)} → {microDollars(s.toMicroUsd)}</small></td><td>{microDollars(s.amountMicroUsd)}</td><td>{microDollars(s.compute)}</td><td>{microDollars(s.operating)}</td><td>{microDollars(s.platform)}</td></tr>)}</tbody></table></div>;
}
