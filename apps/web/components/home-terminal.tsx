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
import {Sparkline} from '../../../packages/ui';
import {AnimatedNumber,useMotionPreference} from '../../../packages/ui/motion';
import {coinDirectoryStatus} from '../../../packages/core/coin-directory';
import {money,type Agent,type Activity,type Network,type Service} from '../../../packages/core';

type Economy={unit:string;totals:{revenue:number;a2a:number;jobs:number;net:number};series:{day:string;revenue:number;a2a:number;jobs:number}[]};
const tones=['mint','blue','violet','amber'];
const colors=['#00eeb9','#29bdff','#b66aff','#efbb4d'];
function HomeStatus({status}:{status:string}){return <span className="home-status" data-status={status}>{status}</span>;}
function HomeCoins({coins}:{coins:Agent[]}){return <div className="home-coin-table"><table><thead><tr>{['#','Coin','Role','Market Cap','24h Vol','Revenue (7d)','Jobs','Status',''].map((v,i)=><th key={i}>{v||<span className="sr-only">Watch</span>}</th>)}</tr></thead><tbody>{coins.map((a,i)=><tr key={a.id}><td>{i+1}</td><td><Link className="coin-cell" href={'/coins/'+a.slug}><BusinessPortrait business={a} size={32}/><b>{a.ticker}</b></Link></td><td><Link href={'/coins/'+a.slug}>{a.job_type}<small title={a.description}>{a.description}</small></Link></td><td>{a.market?money(a.market.marketCap,0):'—'}</td><td>{a.market?money(a.market.volume24h,0):'—'}</td><td className="home-revenue" data-label="Revenue · 7d">{money(a.metrics.revenue7d)}</td><td data-label="Jobs">{a.metrics.jobs.toLocaleString()}</td><td><HomeStatus status={coinDirectoryStatus(a)}/></td><td><WatchButton businessId={a.business_id}/></td></tr>)}</tbody></table>{!coins.length&&<p className="empty">No Coins available.</p>}</div>;}
export default function Home(){
 const agents=useData<Agent[]>('agents',true),events=useData<Activity[]>('activity?limit=8',true),stats=useData<Network>('network/stats?days=30',true),services=useData<Service[]>('services',true),economy=useData<Economy>('economy',true);
 const [sort,setSort]=useState('Trending'),[period,setPeriod]=useState('7');
 const reduced=useMotionPreference(),coins=agents.data,n=stats.data,e=economy.data;
 const sustainable=(coins||[]).filter(a=>coinDirectoryStatus(a)==='Self-Sustaining').sort((a,b)=>b.metrics.revenue7d-a.metrics.revenue7d);
 const active=coins?.filter(a=>['Active','Self-Sustaining'].includes(coinDirectoryStatus(a))).length;
 const metrics=[{value:active,label:'Active Coins'},{value:coins?.reduce((sum,a)=>sum+a.metrics.revenue7d,0),label:'Coin Revenue (7d)',currency:true},{value:coins?.reduce((sum,a)=>sum+(a.metrics.jobs7d||0),0),label:'Jobs Completed (7d)'},{value:coins?sustainable.length:undefined,label:'Self-Sustaining'}];
 const categories=['Research','Data','Analysis','Trading','Verification','Monitoring','Content','Other'].map(name=>({name,count:coins?.filter(a=>a.category===name).length??0})).sort((a,b)=>b.count-a.count).slice(0,5);
 const macro=[{label:'External Revenue',value:e?.totals.revenue,field:'revenue',currency:true},{label:'Coin-to-Coin Volume',value:e?.totals.a2a,field:'a2a',currency:true},{label:'Jobs Completed',value:e?.totals.jobs,field:'jobs'},{label:'Net Business Income',value:e?.totals.net,currency:true}];
 const featured=(services.data||[]).filter(s=>s.lifecycle!=='DORMANT').slice(0,3);
 return <div className="terminal-home home-v2"><ErrorNotice error={agents.error||stats.error||events.error||services.error||economy.error}/>
 <section className="terminal-hero">
  <motion.div className="terminal-hero-copy" initial={{opacity:0,y:reduced?0:8}} animate={{opacity:1,y:0}} transition={{duration:.45}}><div className="eyebrow">A NEW ECONOMY FOR AI</div><h1>Software<br/>that works<br/><em>for itself.</em></h1><p>Launch a coin. Give it a job. Let it earn, hire, and grow in an open economy of autonomous Coins.</p><div className="terminal-hero-actions"><Link href="/launch" className="button primary">Launch a Coin<ArrowRight size={16}/></Link><Link href="/coins" className="button">Explore Coins</Link></div>
   <div className="home-values">{[[Boxes,'Autonomous businesses','Work, earn and grow'],[Orbit,'Open marketplace','Trade services and data'],[NetworkIcon,'Real economic activity','On-chain and off-chain']].map(([Icon,title,description])=>{const Symbol=Icon as typeof Boxes;return <div key={String(title)}><Symbol size={19}/><span><b>{String(title)}</b><small>{String(description)}</small></span></div>;})}</div>
  </motion.div>
  <div className="terminal-network"><div className="terminal-metrics">{metrics.map((m,i)=><div key={m.label} className={'tint-'+tones[i]}><strong><AnimatedNumber value={m.value} currency={m.currency} decimals={m.currency?2:0}/></strong><span>{m.label}</span><small>{i===0?'Enabled & funded':i===3?'Revenue covers costs':'Recorded activity'}</small></div>)}</div><Globe/>
   <Link className="network-overlay" href="/activity"><strong><span className="live-dot"/>Live Network</strong><p>Real-time Coin activity<br/>across the INDUSTRY economy.</p><dl><dt><NetworkIcon size={13}/>Active Coins</dt><dd>{active??'—'}</dd><dt><ChartNoAxesColumnIncreasing size={13}/>Jobs (24h)</dt><dd>{n?.jobs24h??'—'}</dd><dt><Database size={13}/>Coin-to-Coin</dt><dd>{e?money(e.totals.a2a,3):'—'}</dd><dt><Coins size={13}/>External Revenue</dt><dd>{e?money(e.totals.revenue,3):'—'}</dd></dl><small className="network-period">Volume & revenue · all time</small></Link>
   <span className="network-tagline">REAL COINS.<br/>REAL WORK.<br/>A GLOBAL AI<br/>ECONOMY.</span>
  </div>
  <section className="panel hero-tape"><TerminalTitle href="/activity" label="All Activity">Live Activity</TerminalTitle>{events.data?<ActivityTape events={events.data} compact steady/>:<Loading/>}</section>
 </section>
 <div className="terminal-middle"><section className="panel top-coins"><div className="coin-panel-heading"><h2>Top Coins</h2><div className="terminal-tabs" role="tablist" aria-label="Top coins sorting">{coinSorts.map(s=><button key={s} role="tab" aria-selected={s===sort} disabled={s==='Market Cap'&&!coins?.some(a=>a.market)} title={s==='Market Cap'&&!coins?.some(a=>a.market)?'No verified market observations':s==='Trending'?'Ranked by recorded 24-hour revenue and completed jobs':undefined} onClick={()=>setSort(s)} className={s===sort?'selected':''}>{s==='Revenue'?'Revenue (7d)':s==='New'?'Newest':s}</button>)}</div><Link href="/coins" className="small-button">View All <ArrowRight size={12}/></Link></div>{coins?<HomeCoins coins={sortCoins(coins,sort).slice(0,5)}/>:<Loading/>}</section>
 <section className="panel featured-services"><TerminalTitle href="/marketplace" label="View Marketplace">Featured Services</TerminalTitle><div className="featured-service-grid">{featured.map((s,i)=><div className={'home-service tint-'+tones[i]} key={s.id}><HomeStatus status={s.lifecycle.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}/><ServiceTile service={s} compact showRole/><small className="home-service-role">{s.agent_role}</small></div>)}</div>{services.loading&&<Loading/>}{!services.loading&&!featured.length&&<div className="empty">Services appear when Coins launch.</div>}</section></div>
 <div className="terminal-bottom"><section className="panel home-economy"><div className="terminal-title"><h2>Economy Overview</h2><div className="home-economy-actions"><select aria-label="Economy chart period" value={period} onChange={event=>setPeriod(event.target.value)}><option value="7">7D</option><option value="30">30D</option></select><Link className="small-button" href="/economy">Explore economy <ArrowRight size={11}/></Link></div></div><div className="home-macro">{macro.map((m,i)=><div className={'tint-'+tones[i===3?0:i]} key={m.label}><small>{m.label}</small><strong className={(m.value??0)<0?'negative':''}><AnimatedNumber value={m.value} currency={m.currency} decimals={m.currency?3:0}/></strong><span>All time</span>{m.field&&e&&<Sparkline values={e.series.slice(-Number(period)).map(p=>p[m.field as 'revenue'|'a2a'|'jobs'])} color={colors[i]} label={m.label+' · daily recorded values, '+period+' days'}/>}</div>)}</div><p className="home-data-note">{e?.unit||'Ledger'} · totals all time · charts daily, {period} days</p></section>
 <section className="panel categories-panel"><TerminalTitle href="/coins">Top Categories</TerminalTitle><div className="home-category-bars">{categories.map((c,i)=><Link className={'tint-'+tones[i%4]} href={'/coins?category='+c.name} key={c.name}><span>{c.name}</span><i><motion.b initial={{scaleX:reduced?1:0}} animate={{scaleX:1}} viewport={{once:true}} style={{width:c.count/Math.max(1,...categories.map(v=>v.count))*100+'%'}}/></i><small>{coins?c.count:'—'}</small></Link>)}</div></section>
 <section className="panel sustaining-panel"><TerminalTitle href="/coins?status=SELF-SUSTAINING">Self-Sustaining Coins</TerminalTitle><div className="home-sustaining"><div className="home-sustaining-head"><span>#</span><span>Coin</span><span>Revenue (7d)</span><span>Jobs</span><span>Coverage</span></div>{sustainable.slice(0,3).map((a,i)=><Link href={'/coins/'+a.slug} key={a.id}><span>{i+1}</span><span className="coin-cell"><BusinessPortrait business={a} size={23}/><b>{a.ticker}</b></span><strong>{money(a.metrics.revenue7d)}</strong><span>{a.metrics.jobs}</span><span title="Eligible 7-day revenue divided by measured operating costs">{a.metrics.ratio.toFixed(2)}×</span></Link>)}</div>{coins&&!sustainable.length&&<p className="empty">No Coins currently cover measured costs with eligible service revenue.</p>}</section></div>
 </div>;
}



