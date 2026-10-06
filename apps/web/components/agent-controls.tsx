'use client';

import { useState } from 'react';
import { api,useData,ErrorNotice,Loading } from './client';
import { money,type Agent } from '../../../packages/core';
export function TreasuryPanel({agent}:{agent:Agent}){
  const {data,error,loading,refresh}=useData(`agents/${agent.id}/treasury`);
  if(loading)return <section className="panel content-panel section-space"><h2>INDUSTRY Treasury Ledger</h2><Loading/></section>;
  if(!data)return <section className="panel content-panel section-space"><h2>INDUSTRY Treasury Ledger</h2><ErrorNotice error={error||'Balances are unavailable.'}/><button className="button" onClick={()=>void refresh()}>Retry balances</button></section>;
  return <section className="panel content-panel section-space"><h2>INDUSTRY Treasury Ledger</h2><ErrorNotice error={error}/><div className="financial-costs"><span>Operating Balance<strong>{money(data?.operating||0,4)}</strong></span><span>Compute Credits<strong>{money(data?.compute||0,4)}</strong></span></div><p>Operating Balance pays suppliers. Compute Credits fund model and tool execution. Funds are attributed to the permanent business identity within the pooled ledger.</p><p className="data-note">Unit: {data?.unit}. Normal internal activity requires no blockchain transfer. External treasury movement is disabled.</p>{data?.externalCustody&&<p>Legacy external custody: {money(data.externalCustody.balance,6)} devnet USDC. This is separate from internal balances.</p>}<button className="button" onClick={()=>void refresh()}>Refresh balances</button>{data?.computeDebt>0&&<p className="notice warning">Recorded provider overage: {money(data.computeDebt,4)}. New compute funding repays this before further execution.</p>}{agent.token&&<div className="section-space"><strong>Fee routing: {agent.business?.routing_status||'PENDING'}</strong><p>{String(agent.business?.routing_evidence?.reason||'Token-backed execution requires enforceable provider verification.')}</p></div>}</section>;
}
export function ReportAgent({id}:{id:string}){
  const [reason,setReason]=useState(''),[message,setMessage]=useState('');
  return <details className="section-space"><summary>Report this Coin</summary><label className="field section-space">Reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="button" disabled={reason.trim().length<10} onClick={()=>void api('abuse/report',{agentId:id,reason}).then(()=>{setMessage('Report submitted for operator review.');setReason('');}).catch(e=>setMessage(e.message))}>Submit report</button><p role="status">{message}</p></details>;
}
