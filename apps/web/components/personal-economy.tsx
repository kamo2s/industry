'use client';
import Link from 'next/link';
import {useState} from 'react';
import {ArrowRight} from 'lucide-react';
import {useAuth} from './shell';
import {useData,ErrorNotice} from './client';
import {Sparkline} from '../../../packages/ui';
import {AnimatedNumber} from '../../../packages/ui/motion';

type Economy={unit:string;coins:number;totals:{revenue:number;a2a:number;jobs:number;net:number};series:{day:string;revenue:number;a2a:number;jobs:number}[]};
const empty:Economy={unit:'',coins:0,totals:{revenue:0,a2a:0,jobs:0,net:0},series:[]};
export function PersonalEconomy(){
 const auth=useAuth();
 return auth.profile?<SignedEconomy key={auth.profile.id}/>:<EconomyPanel data={auth.loading?undefined:empty} signedIn={false} connect={auth.connect} loading={auth.loading}/>;
}
function SignedEconomy(){
 const result=useData<Economy>('economy/personal',true);
 return <EconomyPanel data={result.error?undefined:result.data||undefined} signedIn error={result.error} loading={result.loading}/>;
}
function EconomyPanel({data,signedIn,connect,error='',loading=false}:{data?:Economy;signedIn:boolean;connect?:()=>void;error?:string;loading?:boolean}){
 const [period,setPeriod]=useState('7');
 const metrics=[{label:'Service Earnings',field:'revenue',tone:'mint',color:'accent',currency:true},{label:'Coin-to-Coin Volume',field:'a2a',tone:'blue',color:'blue',currency:true},{label:'Jobs Completed',field:'jobs',tone:'violet',color:'purple',currency:false},{label:'Net Business Income',field:'net',tone:'green',color:'success',currency:true}] as const;
 return <section className="panel home-economy" aria-label="Your Coin Economy"><div className="terminal-title"><h2>Your Coin Economy</h2><div className="home-economy-actions"><select aria-label="Your economy chart period" title="Chart period; totals are all time" value={period} onChange={event=>setPeriod(event.target.value)}><option value="7">7D</option><option value="30">30D</option></select>{signedIn?<Link className="small-button" href="/dashboard">My Industry <ArrowRight size={11}/></Link>:<button className="small-button" onClick={connect} disabled={loading}>Connect Wallet <ArrowRight size={11}/></button>}</div></div><ErrorNotice error={error?'Your economy is temporarily unavailable.':''}/><div className="home-macro">{metrics.map(m=><div className={'tint-'+m.tone} key={m.field}><small>{m.label}</small><strong className={(data?.totals[m.field]??0)<0?'negative':''}><AnimatedNumber value={data?.totals[m.field]} currency={m.currency} decimals={m.currency?3:0}/></strong><span>All time</span>{m.field!=='net'&&data&&data.series.length>0&&<Sparkline values={data.series.slice(-Number(period)).map(p=>p[m.field as 'revenue'|'a2a'|'jobs'])} color={'var(--theme-'+m.color+')'} label={m.label+' for your Coins · daily recorded values, '+period+' days'}/>}</div>)}</div><p className="home-data-note">{loading?'Loading your Coin economy…':!signedIn?'Connect your wallet to view the Coins you created.':error?'No values are shown while your economy cannot be loaded.':`${data?.coins??0} Coins created by you · ${data?.unit||'Ledger'} · totals all time · charts ${period} days`}</p></section>;
}
