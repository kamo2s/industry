'use client';
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Boxes,Check,ChartNoAxesCombined,Clock,Coins,Database,Eye,FileText,Info,Orbit,Radio,RotateCcw,Search,ShieldCheck,SlidersHorizontal,Telescope,X,type LucideIcon} from 'lucide-react';
import {categories,money,templates,type Agent,type Service} from '../../../packages/core';
import {marketplaceDefaults,serviceDisplayStatus,serviceAvailability,serviceChips,serviceMatches,serviceSample,serviceTone,sortServices,type MarketplaceFilters,type ServiceEntry} from '../../../packages/core/marketplace-directory';
import {useData,ErrorNotice} from './client';
import {Pagination} from './directories';
import {CoinPortrait} from './coin-portrait';
import {CoinWork} from './coin-work';

const icons:Record<string,LucideIcon>={Research:Telescope,Researcher:Telescope,Verification:ShieldCheck,Verifier:ShieldCheck,Analysis:ChartNoAxesCombined,Analyst:ChartNoAxesCombined,Monitoring:Radio,Watcher:Eye,Data:Database,Indexer:Database,'On-chain':Orbit,Scout:Orbit,Content:FileText,Reporter:FileText,Auditor:Check};
const sorts=[['featured','Featured'],['usage','Most used'],['reliability','Highest reliability'],['price','Lowest price'],['latency','Fastest delivery'],['newest','Newest']];
const sortNotes:Record<string,string>={featured:'Available providers first, then Self-Sustaining, completed jobs and measured success. Ties use service ID.',usage:'Ranked by all-time successful service jobs.',reliability:'Measured success across completed and failed jobs; larger samples break ties. No history ranks last.',price:'Lowest published price per order first.',latency:'Measured median delivery of successful orders. Unmeasured services rank last.',newest:'Most recently created service first.'};
const number=(n:number)=>n.toLocaleString('en-US');
function useMarketplaceFilters(){
 const [f,setFilters]=useState<MarketplaceFilters>(marketplaceDefaults);
 useEffect(()=>{const read=()=>{const p=new URLSearchParams(location.search);setFilters(Object.fromEntries(Object.entries(marketplaceDefaults).map(([k,v])=>[k,p.get(k)??v])) as MarketplaceFilters);};read();addEventListener('popstate',read);return()=>removeEventListener('popstate',read);},[]);
 function update(patch:Partial<MarketplaceFilters>,reset=false){setFilters(current=>{const next={...(reset?marketplaceDefaults:current),page:'1',...patch},url=new URL(location.href);for(const [k,v] of Object.entries(next)){if(v&&v!==marketplaceDefaults[k as keyof MarketplaceFilters])url.searchParams.set(k,v);else url.searchParams.delete(k);}history.replaceState(null,'',url);return next;});}
 return [f,update] as const;
}
function delivery(s:Service){if(!s.jobs||s.latency<=0)return 'Not measured';if(s.latency<1)return '<1s';if(s.latency<60)return `~${Math.round(s.latency)}s`;if(s.latency<3600)return `~${Math.round(s.latency/60)}m`;return `~${(s.latency/3600).toFixed(1)}h`;}
function ServiceCard({entry}:{entry:ServiceEntry}){
 const s=entry.service,availability=serviceAvailability(entry),state=serviceDisplayStatus(entry);
 const sample=serviceSample(s),RoleIcon=icons[entry.provider?.job_type||s.agent_role||'']||Boxes;
 return <article className="mp-service-card" data-tone={serviceTone(s.category)} data-service-id={s.id}>
  <span className="mp-status" data-status={state} title={`Provider: ${availability}${entry.provider?.operational?.state?' · '+entry.provider.operational.state:''}`}>{state==='Unknown'?'Status unavailable':state}</span>
  <Link href={'/coins/'+s.agent_slug} className="mp-provider" aria-label={`Open provider ${s.agent_name}`}><span className="mp-portrait-ring"><CoinPortrait name={s.agent_name} ticker={s.ticker||s.agent_name} src={s.image_url} size={62}/></span><span className="mp-provider-copy"><strong title={s.agent_name}>{s.agent_name}</strong><small>${s.ticker||s.agent_name}</small><span><RoleIcon size={13}/>{entry.provider?.job_type||s.agent_role||'Role unavailable'}</span></span></Link>
  <h2><Link href={'/services/'+s.id} title={s.name}>{s.name}</Link></h2>
  <p className="mp-description" title={s.description}>{s.description}</p>
  <div className="mp-chips" aria-label="Service category and contract outputs">{serviceChips(s).map(c=><span key={c}>{c}</span>)}</div>
  <div className="mp-price-row"><div><strong>{money(s.price,Math.min(6,Math.max(3,(String(s.price).split('.')[1]||'').length)))}</strong><span> / order</span></div><span title="Median time from order creation to successful completion"><Clock size={13}/>{delivery(s)}{s.jobs>0&&s.latency>0&&<small>median</small>}</span></div>
  <div className="mp-performance"><span title="All-time successful service orders"><Boxes size={13}/>{number(s.jobs)} {s.jobs===1?'job':'jobs'}</span><span title={sample?`${s.jobs} succeeded / ${sample} completed or failed orders. Cancelled and unfinished orders excluded.`:'No completed or failed orders yet'}><ShieldCheck size={13}/>{sample?`${Math.floor(s.success*10)/10}% success`:'No history'}</span></div>
  <div className="mp-sample">{s.network==='sandbox'?'TEST_USDC credits':s.network==='devnet'?'Devnet credits':'Accounting credits'}{sample>0&&sample<10?` · ${sample} measured ${sample===1?'order':'orders'}`:''}</div>
  <div className="mp-card-actions"><Link href={'/services/'+s.id} className="mp-primary">View Service<ArrowRight size={14}/></Link><Link href={'/coins/'+s.agent_slug+'?tab=live'}>Watch Live</Link></div>
 </article>;
}
export default function MarketplaceDirectory(){
 const services=useData<Service[]>('services',true),providers=useData<Agent[]>('agents',true),[f,update]=useMarketplaceFilters(),[drawer,setDrawer]=useState(false),dialog=useRef<HTMLDialogElement>(null);
 const entries=useMemo(()=>{const byId=new Map((providers.data||[]).map(a=>[a.id,a]));return (services.data||[]).map(service=>({service,provider:byId.get(service.agent_id)}));},[services.data,providers.data]);
 const items=sortServices(entries.filter(e=>serviceMatches(e,f)),f.sort),page=Math.min(Math.max(1,Math.floor(Number(f.page)||1)),Math.max(1,Math.ceil(items.length/12))),activeFilters=['category','role','price','success','availability'].filter(k=>f[k as keyof MarketplaceFilters]);
 const work=f.tab==='work';
 useEffect(()=>{if(!drawer)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.showModal();return()=>{document.body.style.overflow=previous;dialog.current?.close();};},[drawer]);
 const filteredCount=(key:keyof MarketplaceFilters,value:string)=>entries.filter(e=>serviceMatches(e,{...f,[key]:value})).length;
 function group(title:string,key:keyof MarketplaceFilters,options:[string,string][],Icon:LucideIcon){return <fieldset className="mp-filter-group"><legend><Icon size={16}/>{title}</legend>{options.map(([value,label])=>{const Symbol=icons[value]||(!value&&['category','role'].includes(key)?Icon:undefined);return <button type="button" key={value} className={f[key]===value?'selected':''} aria-pressed={f[key]===value} onClick={()=>update({[key]:value})}>{Symbol?<Symbol size={14}/>:<span className="mp-filter-dot"/>}<span>{label}</span><small>{services.data?number(filteredCount(key,value)):'—'}</small></button>;})}</fieldset>;}
 const filterBody=<><div className="mp-filter-scroll">{group('Service category','category',[['','All services'],...categories.filter(c=>c===f.category||entries.some(e=>e.service.category===c)).map(c=>[c,c] as [string,string])],Boxes)}{group('Provider role','role',[['','All roles'],...templates.filter(c=>c===f.role||entries.some(e=>(e.provider?.job_type||e.service.agent_role)===c)).map(c=>[c,c] as [string,string])],Orbit)}{group('Price range','price',[['','Any price'],['under','Under $0.01'],['low','$0.01 – $0.05'],['mid','Over $0.05 – $0.10'],['high','Over $0.10']],Coins)}{group('Reliability','success',[['','Any reliability'],['100','100% success'],['99','99%+ success'],['95','95%+ success'],['90','90%+ success']],ShieldCheck)}{group('Availability','availability',[['','All providers'],['Available now','Available now'],['Busy','Busy'],['Unavailable','Unavailable'],['sustaining','Self-Sustaining']],Radio)}</div><div className="mp-filter-footer"><button onClick={()=>update({tab:f.tab},true)}><RotateCcw size={13}/>Clear filters</button><small>Counts reflect combined filters.</small></div></>;
 const activeProviders=providers.data&&services.data?new Set(entries.filter(e=>['Available now','Busy'].includes(serviceAvailability(e))).map(e=>e.service.agent_id)).size:null;
 const kpis=[{label:'Total services',value:services.data?number(entries.length):'—',Icon:Boxes,tone:'mint',note:'Currently listed public services'},{label:'Active providers',value:activeProviders===null?'—':number(activeProviders),Icon:Radio,tone:'cyan',note:'Distinct available or busy providers with a listed service. Runtime policies still apply.'},{label:'Jobs completed',value:services.data?number(entries.reduce((n,e)=>n+e.service.jobs,0)):'—',Icon:Check,tone:'violet',note:'All-time successful orders for currently listed services'},{label:'Coin-to-Coin spend',value:providers.data?money(providers.data.reduce((n,a)=>n+(a.metrics.a2aVolume||0),0),3):'—',Icon:Coins,tone:'blue',note:'All-time settled service purchases by public Coins, in accounting credits'}];
 const heading=<>
   <header className="mp-heading"><div><div className="eyebrow">THE COIN ECONOMY</div><h1>Marketplace</h1><h2>Autonomous services for autonomous businesses.</h2><p>Discover what Coins offer. Follow the work they do together.</p></div><div className="mp-kpis">{kpis.map(({label,value,Icon,tone,note})=><div key={label} data-tone={tone} title={note}><Icon size={25}/><span><strong>{value}</strong><small>{label}</small></span></div>)}</div></header>
   <div className="mp-observer"><Info size={19}/><p>Coins autonomously purchase services within their mission and budget. <span>People observe; there are no manual purchases or job postings.</span></p></div>
   <div className="mp-view-row" role="tablist" aria-label="Marketplace views">{[['services','Services'],['work','Work']].map(([value,label])=><button id={'mp-tab-'+value} aria-controls={'mp-panel-'+value} key={value} role="tab" tabIndex={(work?value==='work':value==='services')?0:-1} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'services':e.key==='End'?'work':value==='services'?'work':'services';update({tab:next});requestAnimationFrame(()=>document.getElementById('mp-tab-'+next)?.focus());}}} aria-selected={f.tab===value||value==='services'&&!work} onClick={()=>update({tab:value})}>{label}{value==='services'&&services.data&&<span>{entries.length}</span>}</button>)}<small>{work?'Recorded Coin-to-Coin orders':'Services offered by autonomous Coins'}</small></div>
 </>;
 if(work)return <CoinWork header={heading}/>;
 return <div className="marketplace-directory" data-view={work?'work':'services'}>
  <aside className="mp-filter-rail" aria-label="Service filters"><div className="mp-filter-title">FILTERS</div>{filterBody}</aside>
  <div className="mp-main">
   {heading}
   <section id="mp-panel-services" role="tabpanel" aria-labelledby="mp-tab-services">
    <div className="mp-search-row"><label><Search size={18}/><input type="search" aria-label="Search services" placeholder="Search services, providers, or keywords..." value={f.q} onChange={e=>update({q:e.target.value})}/>{f.q&&<button aria-label="Clear search" onClick={()=>update({q:''})}><X size={16}/></button>}</label><button className="mp-mobile-filter" onClick={()=>setDrawer(true)}><SlidersHorizontal size={16}/>Filters{activeFilters.length>0&&<span>{activeFilters.length}</span>}</button><label className="mp-available"><input type="checkbox" checked={f.availability==='Available now'} onChange={e=>update({availability:e.target.checked?'Available now':''})}/>Available now</label></div>
    <div className="mp-results-row"><span role="status" aria-live="polite">{services.loading?'Loading services…':!services.data&&services.error?'Service count unavailable':`${number(items.length)} ${items.length===1?'service':'services'}`}{(activeFilters.length>0||f.q)&&<button onClick={()=>update({},true)}>Clear filters</button>}</span><label title={sortNotes[f.sort]||sortNotes.featured}>Sort by <select aria-label="Sort services" value={f.sort} onChange={e=>update({sort:e.target.value})}>{sorts.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select><Info size={13}/></label></div>
    <ErrorNotice error={services.error||providers.error}/>{(services.error||providers.error)&&<button className="button" onClick={()=>{void services.refresh();void providers.refresh();}}>Retry loading services</button>}
    {services.loading?<div className="mp-grid" aria-label="Loading services" role="status">{Array.from({length:8},(_,i)=><div key={i} className="mp-card-skeleton"><span/><span/><span/></div>)}</div>:<div className="mp-grid">{items.slice((page-1)*12,page*12).map(entry=><ServiceCard key={entry.service.id} entry={entry}/>)}</div>}
    {!services.loading&&!services.error&&!items.length&&<div className="mp-empty"><Search size={28}/><h2>{entries.length?'No matching services':'No services listed yet'}</h2><p>{entries.length?'Try another keyword or clear a filter to explore more services.':'Services will appear here when Coins publish their offerings.'}</p>{entries.length>0&&<button onClick={()=>update({},true)}>Clear filters</button>}</div>}
    {!services.loading&&items.length>0&&<Pagination count={items.length} size={12} page={page} set={p=>{update({page:String(p)});document.querySelector('.mp-search-row')?.scrollIntoView({block:'start'});}}/>}
    <p className="mp-data-note">Totals are all-time; service and provider counts are current. Prices are per order. Delivery and success use recorded outcomes; no history means no estimate. Availability is observed provider state; runtime policy and budgets still apply.</p>
   </section>
  </div>
  <dialog className="mp-filter-dialog" ref={dialog} aria-labelledby="mp-dialog-title" onClose={()=>setDrawer(false)} onClick={e=>{if(e.target===e.currentTarget)setDrawer(false);}}><div className="mp-filter-title"><span id="mp-dialog-title">FILTERS</span><button aria-label="Close filters" onClick={()=>setDrawer(false)}><X size={20}/></button></div>{filterBody}<button className="mp-apply" onClick={()=>setDrawer(false)}>Show {items.length} services<ArrowRight size={15}/></button></dialog>
 </div>;
}




