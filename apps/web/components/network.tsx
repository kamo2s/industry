'use client';
import Link from 'next/link';
import {useId,useState} from 'react';
import {ArrowDownLeft,ArrowRight,ArrowUpRight,Check,ChevronLeft,ChevronRight,Clock3,Network,Search,X} from 'lucide-react';
import {money} from '../../../packages/core';
import {networkFocus,type BusinessGraph} from '../../../packages/core/network-view';
import {CoinPortrait} from './coin-portrait';
import {useData,ErrorNotice,Loading} from './client';

type Node=BusinessGraph['nodes'][number];
type Edge=BusinessGraph['edges'][number];
const edgeKey=(edge:Edge)=>edge.source+':'+edge.target;
const amount=(value:number)=>money(value,value>0&&value<.001?6:3);
const jobLabel=(jobs:number)=>jobs.toLocaleString()+' '+(jobs===1?'job':'jobs');
const dateLabel=(date:string)=>date&&Number.isFinite(Date.parse(date))?new Date(date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Not recorded';

function ConnectionLane({edges,byId,side,kind,selected,onSelect,query}:{edges:Edge[];byId:Map<string,Node>;side:'customers'|'suppliers';kind:string;selected?:string;onSelect:(edge:Edge)=>void;query:string}){
 const [page,setPage]=useState(0),id=useId().replaceAll(':',''),pages=Math.ceil(edges.length/3),current=Math.min(page,Math.max(0,pages-1)),shown=edges.slice(current*3,current*3+3),incoming=side==='customers',title=incoming?'Customers':'Suppliers';
 return <div className={'cn-lane cn-'+side}>
  <div className="cn-lane-title"><span>{title}<b>{edges.length}</b></span><small>{incoming?'Coins that pay this Coin':'Coins this Coin pays'}</small></div>
  <div className="cn-lane-body" role="group" aria-label={title}>
   {shown.map(edge=>{const partner=byId.get(incoming?edge.source:edge.target)!;return <button key={edgeKey(edge)} className="cn-partner" aria-label={'Inspect '+(incoming?'customer ':'supplier ')+partner.name} aria-pressed={selected===edgeKey(edge)} onClick={()=>onSelect(edge)}>
    <CoinPortrait name={partner.name} ticker={partner.ticker} src={partner.image_url} size={42}/>
    <span className="cn-partner-name"><strong title={partner.name}>{partner.name}</strong><small>${partner.ticker}</small></span>
    <span className="cn-partner-value"><strong>{kind==='Payments'?amount(edge.volume):jobLabel(edge.jobs)}</strong><small>{kind==='Payments'?jobLabel(edge.jobs):amount(edge.volume)}</small></span>
   </button>;})}
   {!shown.length&&<div className="cn-lane-empty">{incoming?<ArrowDownLeft size={20}/>:<ArrowUpRight size={20}/>}<strong>{query?'No matching '+title.toLowerCase():incoming?'No customer payments':'No supplier payments'}</strong><span>{query?'Try another name or ticker.':'No settled work in this period.'}</span></div>}
  </div>
  <svg className="cn-connections" viewBox="0 0 56 240" preserveAspectRatio="none" aria-hidden="true"><defs><marker id={'connection-'+id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L8 4L0 8" fill="currentColor"/></marker></defs>{shown.map((edge,index)=>{const y=120+(index-(shown.length-1)/2)*84;return <path key={edgeKey(edge)} className={selected===edgeKey(edge)?'is-selected':''} d={incoming?'M0 '+y+' C30 '+y+',26 120,56 120':'M0 120 C30 120,26 '+y+',56 '+y} markerEnd={'url(#connection-'+id+')'}/>;})}</svg>
  <div className="cn-lane-pagination">{pages>1&&<><small>{current*3+1}–{Math.min((current+1)*3,edges.length)} of {edges.length}</small><button aria-label={'Previous '+title.toLowerCase()} disabled={current===0} onClick={()=>{setPage(current-1);onSelect(edges[(current-1)*3]);}}><ChevronLeft size={14}/></button><button aria-label={'Next '+title.toLowerCase()} disabled={current===pages-1} onClick={()=>{setPage(current+1);onSelect(edges[(current+1)*3]);}}><ChevronRight size={14}/></button></>}</div>
 </div>;
}

export function BusinessNetwork({agentId,development=false}:{agentId:string;development?:boolean}){
 const [days,setDays]=useState('7'),[kind,setKind]=useState('Payments'),[selected,setSelected]=useState<string|null>(null),[query,setQuery]=useState('');
 const data=useData<BusinessGraph>('network/graph?days='+days+'&agentId='+agentId,true);
 const graph=data.data||{nodes:[],edges:[],days:Number(days),limit:60},focus=networkFocus(graph,agentId,kind),{node,incoming,outgoing,byId}=focus;
 const matches=(edge:Edge)=>{const n=byId.get(edge.source===node?.id?edge.target:edge.source)!;return (n.name+' '+n.ticker).toLowerCase().includes(query.trim().toLowerCase());};
 const customers=incoming.filter(matches),suppliers=outgoing.filter(matches),relations=[...suppliers,...customers],edge=relations.find(e=>edgeKey(e)===selected)||relations[0],customer=edge?.target===node?.id,partner=edge?byId.get(customer?edge.source:edge.target):undefined;
 const connections=new Set([...incoming.map(e=>e.source),...outgoing.map(e=>e.target)]).size,jobs=[...incoming,...outgoing].reduce((total,e)=>total+e.jobs,0);
 return <section className="coin-network" aria-label="Coin business connections">
  <div className="cn-heading"><div><span className="eyebrow">COIN-TO-COIN ECONOMY</span><h2>Business connections</h2><p>See who this Coin earns from, and who it pays to get work done.</p></div><div className="cn-period" role="group" aria-label="Network period">{[['1','24h'],['7','7d'],['30','30d']].map(([value,label])=><button key={value} aria-pressed={days===value} onClick={()=>{setDays(value);setSelected(null);}}>{label}</button>)}</div></div>
  <ErrorNotice error={data.error}/>
  {data.loading?<Loading/>:!node?<div className="cn-unavailable"><Network size={24}/><h3>{data.error?'Connections are unavailable':'No connections to show'}</h3><p>{data.error?'The relationship data could not be loaded. Please try again.':'Recorded Coin-to-Coin work will appear here.'}</p>{data.error&&<button className="button" onClick={()=>void data.refresh()}>Retry connections</button>}</div>:<>
   <div className="cn-metrics"><div><small><Network size={13}/>Connected Coins</small><strong>{connections}</strong></div><div><small><ArrowDownLeft size={13}/>Received from customers</small><strong className="cn-earned">{amount(focus.received)}</strong></div><div><small><ArrowUpRight size={13}/>Paid to suppliers</small><strong>{amount(focus.paid)}</strong></div><div><small><Check size={13}/>Completed jobs</small><strong>{jobs.toLocaleString()}</strong></div></div>
   <div className="cn-workspace">
    <div className="cn-map">
     <div className="cn-map-toolbar"><div className="cn-sort" role="group" aria-label="Rank connections by"><span>Rank by</span>{['Payments','Jobs'].map(value=><button key={value} aria-pressed={kind===value} onClick={()=>{setKind(value);setSelected(null);}}>{value}</button>)}</div><label className="cn-search"><Search size={14}/><input aria-label="Search connected Coins" placeholder="Find a connection…" value={query} onChange={e=>{setQuery(e.target.value);setSelected(null);}} />{query&&<button aria-label="Clear connection search" onClick={()=>{setQuery('');setSelected(null);}}><X size={13}/></button>}</label></div>
     <div className="flow-scroll"><div className="business-graph cn-map-grid" role="group" aria-label={'Customers and suppliers of '+node.name}>
      <ConnectionLane key={'customers'+days+kind+query} edges={customers} byId={byId} side="customers" kind={kind} selected={edge&&edgeKey(edge)} onSelect={e=>setSelected(edgeKey(e))} query={query}/>
      <div className="cn-hub flow-focus"><span className="cn-hub-label">THIS COIN</span><div className="cn-hub-body"><div className="cn-hub-portrait"><CoinPortrait name={node.name} ticker={node.ticker} src={node.image_url} size={76} eager/></div><div className="cn-hub-name"><h3 title={node.name}>{node.name}</h3><span>${node.ticker}</span><small>{node.role}</small></div></div></div>
      <ConnectionLane key={'suppliers'+days+kind+query} edges={suppliers} byId={byId} side="suppliers" kind={kind} selected={edge&&edgeKey(edge)} onSelect={e=>setSelected(edgeKey(e))} query={query}/>
     </div></div>
     <div className="cn-map-foot"><span><span className="cn-line-key"/>Arrows show payment direction</span><span>Select a Coin to inspect its relationship</span></div>
    </div>
    <aside className="network-inspector cn-inspector" aria-label="Relationship details">
     <span className="eyebrow">RELATIONSHIP DETAILS</span>
     {partner&&edge?<>
      <div className="cn-identity"><CoinPortrait name={partner.name} ticker={partner.ticker} src={partner.image_url} size={46}/><div><h3>{partner.name}</h3><span>${partner.ticker} · {partner.role}</span></div></div>
      <span className={'cn-direction '+(customer?'is-customer':'')}>{customer?<ArrowDownLeft size={13}/>:<ArrowUpRight size={13}/>} {customer?'Customer':'Supplier'} of {node.name}</span>
      <p className="cn-relationship-copy">{customer?partner.name+' paid '+node.name+' for completed services.':node.name+' paid '+partner.name+' for completed services.'}</p>
      <dl className="cn-relationship-facts"><div><dt>{customer?'Payments received':'Payments sent'}</dt><dd>{amount(edge.volume)}</dd></div><div><dt>Completed jobs</dt><dd>{edge.jobs.toLocaleString()}</dd></div><div><dt>Last completed</dt><dd><time dateTime={edge.last_at||undefined}>{dateLabel(edge.last_at)}</time></dd></div></dl>
      <div className="cn-inspector-actions"><Link className="button" href={'/coins/'+partner.slug}>Open Coin<ArrowUpRight size={14}/></Link>{edge.last_job_id&&<Link className="cn-receipt" href={'/jobs/'+edge.last_job_id}>View latest receipt<ArrowRight size={13}/></Link>}</div>
     </>:<div className="cn-inspector-empty"><Network size={26}/><h3>{query?'No matching connections':'No settled connections in this period.'}</h3><p>{query?'Clear the search to see all recorded relationships.':'Try a longer period, or watch this Coin’s current work. Connections appear after paid work is completed.'}</p>{query?<button className="text-button" onClick={()=>setQuery('')}>Clear search</button>:<Link className="text-button" href={'/coins/'+node.slug+'?tab=live'}>Watch this Coin work<ArrowUpRight size={13}/></Link>}</div>}
    </aside>
   </div>
   <div className="cn-provenance"><span><Check size={12}/>Completed work · settled payments only</span><span><Clock3 size={12}/>{days==='1'?'Last 24 hours':'Last '+days+' days'}{development?' · Development credits':''}</span></div>
  </>}
 </section>;
}
