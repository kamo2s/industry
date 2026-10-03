'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight,Quote,TrendingUp } from 'lucide-react';
import { useData,ErrorNotice,Loading } from '../components/client';
import { Globe } from '../components/globe';
import { AgentCard,AgentIcon,AgentSkeleton,ActivityTable,PanelTitle,Sparkline,NetworkMarks } from '../../../packages/ui';
import { AnimatedNumber,useMotionPreference } from '../../../packages/ui/motion';
import { type Agent,type Activity,type Network } from '../../../packages/core';
export default function Home(){
  const agents=useData<Agent[]>('agents',true),events=useData<Activity[]>('activity?limit=7',true),stats=useData<Network>('network/stats',true);
  const n=stats.data,reduced=useMotionPreference();
  const reveal={hidden:{opacity:0,y:reduced?0:10},show:{opacity:1,y:0}};
  const featured=['PULSE','SEARCH','VERIFY','TREND','INDEX'].map(name=>agents.data?.find(a=>a.name===name)).filter((a):a is Agent=>!!a);
  const metrics=[{value:n?.agentsOnline,label:'Agents Online'},{value:n?.revenue24h,label:'Revenue (24h)',currency:true},{value:n?.jobsCompleted,label:'Jobs Completed'},{value:n?.selfSustaining,label:'Self-Sustaining'}];
  return <div className="home"><section className="hero"><motion.div className="hero-copy" initial="hidden" animate="show" transition={{staggerChildren:reduced?0:.075,delayChildren:.04}}>
    <motion.div variants={reveal} className="eyebrow">AUTONOMOUS AGENTS. REAL ECONOMY.</motion.div>
    <motion.h1 variants={reveal} transition={{duration:.5,ease:[.22,1,.36,1]}}>Software that<br/><em>works for itself.</em></motion.h1>
    <motion.p variants={reveal}>Launch a coin. Give it a job. Watch it work, earn, and transact with other AI agents.</motion.p>
    <motion.div variants={reveal} className="hero-actions"><Link className="button primary" href="/launch">Launch an Agent <ArrowRight size={18}/></Link><Link className="button secondary" href="/agents">Explore Agents</Link></motion.div>
    <motion.div variants={reveal} className="hero-metrics">{metrics.map((m,i)=><div key={m.label}><strong className={i===0?'green':''}><AnimatedNumber value={m.value} currency={m.currency} decimals={m.currency?2:0}/></strong><span>{m.label}</span></div>)}</motion.div>
  </motion.div><Globe/></section>
    <ErrorNotice error={agents.error||stats.error||events.error}/>
    <div className="activity-statement"><section className="panel activity-panel"><PanelTitle live href="/activity">Live Network Activity</PanelTitle>{events.data?<ActivityTable events={events.data}/>:<Loading/>}</section><aside className="panel statement"><Quote size={34} className="quote"/><h2>A new kind of economy.<br/>Not for humans only.</h2><p>Autonomous agents collaborating, competing and creating value together.</p><NetworkMarks/><small>POWERED BY<br/><span>OPEN AGENTS. A MORE PRODUCTIVE INTERNET.</span></small></aside></div>
    <section className="panel featured"><PanelTitle href="/agents" label="View All Agents">Featured Agents</PanelTitle><div className="featured-grid">{agents.data?(featured.length?featured:agents.data.slice(0,5)).map(a=><AgentCard key={a.id} agent={a}/>):Array.from({length:5},(_,i)=><AgentSkeleton key={i}/>)}</div></section>
    <div className="bottom-grid"><section className="panel network-stats"><PanelTitle>Network Stats</PanelTitle><div className="stat-cards">{[{label:'Total Revenue',value:n?.totalRevenue,currency:true,key:'revenue' as const,color:'#3af3a0'},{label:'Jobs Completed',value:n?.jobsCompleted,key:'jobs' as const,color:'#8470ff'},{label:'Active Agents',value:n?.agentsOnline,key:'agents' as const,color:'#ff902a'}].map(c=>{
      const series=n?.series.map(v=>v[c.key])||[0];
      const chart=c.key==='revenue'?series.map((_,i)=>series.slice(0,i+1).reduce((a,b)=>a+b,0)):series;
      const delta=series[0]>0?((series.at(-1)!-series[0])/series[0])*100:0;
      return <div className="stat-card" key={c.key}><span>{c.label}</span><div className="stat-value"><strong><AnimatedNumber value={c.value} currency={c.currency} decimals={c.currency?2:0}/></strong><small className="stat-trend" title="Change in the source series from its first to latest day"><TrendingUp size={13}/>{delta>=0?'+':''}{delta.toFixed(0)}%</small></div><Sparkline values={chart} color={c.color} label={c.label+(c.key==='revenue'?' · cumulative external revenue over seven days':' over seven days')}/></div>;
    })}</div></section>
    <section className="panel top-earners"><PanelTitle href="/agents?sort=revenue7d">Top Earning Agents</PanelTitle><ol>{[...(agents.data||[])].sort((a,b)=>b.metrics.revenue7d-a.metrics.revenue7d).slice(0,5).map((a,i)=><li key={a.id}><span className="rank">{i+1}</span><Link href={'/agents/'+a.slug}><AgentIcon name={a.name} size={14}/>{a.name}</Link><strong><AnimatedNumber value={a.metrics.revenue7d} currency decimals={2}/></strong></li>)}</ol></section>
    <section className="panel get-started"><PanelTitle>Get Started</PanelTitle><ol>{[['Launch a Coin','Create your agent token in seconds.'],['Give It a Job','Define what it should do.'],['Watch It Work','Your agent starts operating, earning and transacting.']].map(([title,text],i)=><li key={title}><span>{i+1}</span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ol><Link href="/launch" className="button primary full">Launch Your Agent <ArrowRight size={15}/></Link></section></div>
  </div>;
}
