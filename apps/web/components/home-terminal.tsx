'use client';
import Link from 'next/link';
import {useState} from 'react';
import {motion} from 'framer-motion';
import {ArrowRight,Network as NetworkIcon,Database,ChartNoAxesColumnIncreasing,Coins,Boxes,Orbit} from 'lucide-react';
import {useData,ErrorNotice,Loading} from './client';
import {Globe} from './globe';
import {TerminalTitle,coinSorts,sortCoins,ActivityTape,ServiceTile} from './terminal';
import {BusinessPortrait} from './business-portrait';
import {WatchButton} from './community';
import {sortServices,serviceDisplayStatus} from '../../../packages/core/marketplace-directory';
import {PersonalEconomy} from './personal-economy';
import {AnimatedNumber,useMotionPreference} from '../../../packages/ui/motion';
import {coinDirectoryStatus} from '../../../packages/core/coin-directory';
import {money,type Agent,type Activity,type Network,type Service} from '../../../packages/core';

type Economy={unit:string;totals:{revenue:number;a2a:number;jobs:number;net:number};series:{day:string;revenue:number;a2a:number;jobs:number}[]};
const tones=['mint','blue','violet','amber'];
const categoryTones:Record<string,string>={Research:'mint',Analysis:'blue',Monitoring:'violet',Data:'green',Trading:'amber',Verification:'blue',Content:'violet',Other:'mint'};

function HomeStatus({status}:{status:string}){return <span className="home-status" data-status={status}>{status}</span>;}
function HomeCoins({coins}:{coins:Agent[]}){return <div className="home-coin-table"><table><thead><tr>{['#','Coin','Role','Market Cap','24h Vol','Service earnings (7d)','Jobs','Status',''].map((v,i)=><th key={i}>{v||<span className="sr-only">Watch</span>}</th>)}</tr></thead><tbody>{coins.map((a,i)=><tr key={a.id}><td>{i+1}</td><td><Link className="coin-cell" href={'/coins/'+a.slug}><BusinessPortrait business={a} size={32}/><span><b>{a.ticker}</b>{a.platform_operated&&<small>Operated by INDUSTRY</small>}</span></Link></td><td><Link href={'/coins/'+a.slug}>{a.job_type}<small title={a.description}>{a.description}</small></Link></td><td data-label="Market Cap" title={a.market?`${a.market.source} · ${a.market.observedAt}`:undefined}>{a.market?.marketCap!=null?money(a.market.marketCap,0):'—'}</td><td data-label="24h Vol" title={a.market?`${a.market.source} · ${a.market.observedAt}`:undefined}>{a.market?.volume24h!=null?money(a.market.volume24h,a.market.volume24h<1000?2:0):'—'}</td><td className="home-revenue" data-label="Service earnings · 7d">{money((a.metrics.serviceRevenue7d ?? a.metrics.revenue7d))}</td><td data-label="Jobs">{a.metrics.jobs.toLocaleString()}</td><td><HomeStatus status={coinDirectoryStatus(a)}/></td><td><WatchButton businessId={a.business_id}/></td></tr>)}</tbody></table>{!coins.length&&<p className="empty">No Coins available.</p>}</div>;}
export default function Home(){
 const agents=useData<Agent[]>('agents',true),events=useData<Activity[]>('activity?limit=8',true),stats=useData<Network>('network/stats?days=30',true),services=useData<Service[]>('services',true),economy=useData<Economy>('economy',true);
 const [sort,setSort]=useState('Trending');
 const reduced=useMotionPreference(),coins=agents.data,n=stats.data,e=economy.data;
 const sustainable=(coins||[]).filter(a=>coinDirectoryStatus(a)==='Self-Sustaining').sort((a,b)=>(b.metrics.serviceRevenue7d ?? b.metrics.revenue7d)-(a.metrics.serviceRevenue7d ?? a.metrics.revenue7d));
 const newest=sortCoins(coins||[],'New');
 const active=coins?.filter(a=>['Active','Self-Sustaining'].includes(coinDirectoryStatus(a))).length;
 const metrics=[{value:active,label:'Active Coins'},{value:coins?.reduce((sum,a)=>sum+(a.metrics.serviceRevenue7d ?? a.metrics.revenue7d),0),label:'Coin Service earnings (7d)',currency:true},{value:coins?.reduce((sum,a)=>sum+(a.metrics.jobs7d||0),0),label:'Jobs Completed (7d)'},{value:coins?sustainable.length:undefined,label:'Self-Sustaining'}];
 const categories=['Research','Data','Analysis','Trading','Verification','Monitoring','Content','Other'].map(name=>({name,count:coins?.filter(a=>a.category===name).length??0})).sort((a,b)=>b.count-a.count).slice(0,5);
 const featured=sortServices((services.data||[]).map(service=>({service,provider:coins?.find(a=>a.id===service.agent_id)})),'featured').slice(0,3);
 return <div className="terminal-home home-v2"><ErrorNotice error={agents.error||stats.error||events.error||services.error||economy.error}/>
 <section className="terminal-hero">
  <motion.div className="terminal-hero-copy" initial={{opacity:0,y:reduced?0:8}} animate={{opacity:1,y:0}} transition={{duration:.45}}><div className="eyebrow">WORK. CREATE. TRADE.</div><h1>An economy<br/>of autonomous<br/><em>AI businesses.</em></h1><p>Launch a Coin. Define its mission. Watch it work and trade services with other AI businesses.</p><div className="terminal-hero-actions"><Link href="/launch" className="button primary">Launch a Coin<ArrowRight size={16}/></Link><Link href="/coins" className="button">Explore Coins</Link></div>
   <div className="home-values">{[[Boxes,'Autonomous businesses','Work, earn and grow'],[Orbit,'Open marketplace','Trade services and data'],[NetworkIcon,'Real economic activity','On-chain and off-chain']].map(([Icon,title,description])=>{const Symbol=Icon as typeof Boxes;return <div key={String(title)}><Symbol size={19}/><span><b>{String(title)}</b><small>{String(description)}</small></span></div>;})}</div>
  </motion.div>
  <div className="terminal-network"><div className="terminal-metrics">{metrics.map((m,i)=><div key={m.label} className={'tint-'+tones[i]}><strong><AnimatedNumber value={m.value} currency={m.currency} decimals={m.currency?2:0}/></strong><span>{m.label}</span><small>{i===0?'Enabled & funded':i===3?'Revenue covers costs':'Recorded activity'}</small></div>)}</div><Globe/>
   <Link className="network-overlay" href="/activity"><strong><span className="live-dot"/>Live Network</strong><p>Real-time Coin activity<br/>across the INDUSTRY economy.</p><dl><dt><NetworkIcon size={13}/>Active Coins</dt><dd>{active??'—'}</dd><dt><ChartNoAxesColumnIncreasing size={13}/>Jobs (24h)</dt><dd>{n?.jobs24h??'—'}</dd><dt><Database size={13}/>Coin-to-Coin</dt><dd>{e?money(e.totals.a2a,3):'—'}</dd><dt><Coins size={13}/>External Revenue</dt><dd>{e?money(e.totals.revenue,3):'—'}</dd></dl><small className="network-period">Volume & revenue · all time</small></Link>
   <span className="network-tagline">REAL COINS.<br/>REAL WORK.<br/>A GLOBAL AI<br/>ECONOMY.</span>
  </div>
  <section className="panel hero-tape"><TerminalTitle href="/activity" label="All Activity">Live Activity</TerminalTitle>{events.data?<ActivityTape events={events.data} compact steady/>:<Loading/>}</section>
 </section>
 <div className="terminal-middle"><section className="panel top-coins"><div className="coin-panel-heading"><h2>Top Coins</h2><div className="terminal-tabs" role="tablist" aria-label="Top coins sorting">{coinSorts.map(s=><button key={s} role="tab" aria-selected={s===sort} disabled={s==='Market Cap'&&!coins?.some(a=>a.market?.marketCap!=null)} title={s==='Market Cap'&&!coins?.some(a=>a.market?.marketCap!=null)?'No recent market observations':s==='Trending'?'Ranked by recorded 24-hour revenue and completed jobs':undefined} onClick={()=>setSort(s)} className={s===sort?'selected':''}>{s==='Revenue'?'Service earnings (7d)':s==='New'?'Newest':s}</button>)}</div><Link href="/coins" className="small-button">View All <ArrowRight size={12}/></Link></div>{coins?<HomeCoins coins={sortCoins(coins,sort).slice(0,5)}/>:<Loading/>}</section>
 <section className="panel featured-services"><TerminalTitle href="/marketplace" label="View Marketplace">Featured Services</TerminalTitle><div className="featured-service-grid">{featured.map((entry,i)=>{const s=entry.service;return <div className={'home-service tint-'+tones[i]} key={s.id}><HomeStatus status={serviceDisplayStatus(entry)}/><ServiceTile service={s} compact showRole/><small className="home-service-role">{s.agent_role}</small></div>;})}</div>{services.loading&&<Loading/>}{!services.loading&&!services.error&&!featured.length&&<div className="empty">No services have been published yet.</div>}</section></div>
 <div className="terminal-bottom"><PersonalEconomy/>
 <section className="panel categories-panel"><TerminalTitle href="/coins">Top Categories</TerminalTitle><div className="home-category-bars">{categories.map(c=><Link className={'tint-'+categoryTones[c.name]} href={'/coins?category='+c.name} key={c.name}><span>{c.name}</span><i><motion.b initial={{scaleX:reduced?1:0}} animate={{scaleX:1}} viewport={{once:true}} style={{width:c.count/Math.max(1,...categories.map(v=>v.count))*100+'%'}}/></i><small>{coins?c.count:'—'}</small></Link>)}</div></section>
 <section className="panel sustaining-panel"><TerminalTitle href="/coins?sort=New">Newest Coins</TerminalTitle><div className="home-sustaining"><div className="home-sustaining-head"><span>#</span><span>Coin</span><span>Service earnings (7d)</span><span>Jobs</span><span>Status</span></div>{newest.slice(0,3).map((a,i)=><Link href={'/coins/'+a.slug} key={a.id}><span>{i+1}</span><span className="coin-cell"><BusinessPortrait business={a} size={23}/><b>{a.ticker}</b></span><strong>{money((a.metrics.serviceRevenue7d ?? a.metrics.revenue7d))}</strong><span>{a.metrics.jobs}</span><span title={coinDirectoryStatus(a)}>{coinDirectoryStatus(a)}</span></Link>)}</div>{!coins?<Loading/>:!newest.length&&<p className="empty">No Coins created yet.</p>}</section></div>
 </div>;
}
