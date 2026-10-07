'use client';
import {useEffect,useRef,useState} from 'react';
import {getWallets} from '@wallet-standard/app';
import type {SolanaSignTransactionFeature} from '@solana/wallet-standard-features';
import {VersionedTransaction} from '@solana/web3.js';
import {Check,CheckCircle2,Copy,ExternalLink,LoaderCircle,ShieldCheck} from 'lucide-react';
import {type AgentInput,short} from '../../../packages/core';
import {pumpLaunchView,type PumpOperation} from '../../../packages/core/pump-launch-view';
import {api,useData,ErrorNotice} from './client';
import {useAuth} from './shell';

export function PumpReceipt({operation,onNew}:{operation:PumpOperation;onNew?:()=>void}){
 const view=pumpLaunchView(operation),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState('');
 async function copy(){try{await navigator.clipboard.writeText(operation.mint);setCopied(true);}catch{setCopyError('Select and copy the mint address below.');}}
 return <section className={'pl-receipt'+(view.complete?' complete':'')} aria-label="Launch receipt">
  <div className="pl-receipt-heading">{view.complete?<CheckCircle2 size={34}/>:<LoaderCircle size={30} className="pl-spin"/>}<div><span className="eyebrow">{view.complete?'LAUNCH COMPLETE':'ON-CHAIN CONFIRMATION'}</span><h3>{view.title}</h3></div></div>
  <p>{view.description}</p>
  <div className="pl-mint"><span>Token mint address</span><code>{operation.mint}</code><button className="button" onClick={()=>void copy()} aria-label="Copy mint address">{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copied':'Copy'}</button></div><ErrorNotice error={copyError}/>
  <div className="pl-links">{view.complete&&<a className="button primary" href={'/coins/'+operation.mint}>Open Coin <ExternalLink size={15}/></a>}{view.pumpUrl&&<a className="button" href={view.pumpUrl} target="_blank" rel="noopener noreferrer">View on Pump.fun <ExternalLink size={14}/></a>}{view.tokenUrl&&<a className="button" href={view.tokenUrl} target="_blank" rel="noopener noreferrer">Solscan <ExternalLink size={14}/></a>}{view.transactionUrl&&<a className="button" href={view.transactionUrl} target="_blank" rel="noopener noreferrer">Transaction <ExternalLink size={14}/></a>}</div>
  {(operation.initialBuySol||0)>0&&<p className="pl-buy-receipt">Initial buy confirmed · maximum {operation.initialBuySol} SOL{operation.initialBuyTokens&&<> · {(Number(operation.initialBuyTokens)/1e6).toLocaleString('en-US',{maximumFractionDigits:6})} tokens to your wallet</>}</p>}
  {view.complete&&<div className="pl-funding"><ShieldCheck size={18}/><p>Creator-fee routing is verified. Your Coin begins work when it has AI credits; buying tokens does not directly add Compute or Operating credits.</p></div>}
  {view.complete&&onNew&&<button className="pl-text-button" onClick={onNew}>Launch another Coin →</button>}
 </section>;
}

export function PumpLaunch({beforePrepare,draft,requestKey,blocked,operation,onOperation,onBusy,onBuyChange}:{beforePrepare?:()=>Promise<AgentInput>;draft:AgentInput;requestKey:string;blocked?:string;operation:PumpOperation|null;onOperation:(op:PumpOperation|null)=>void;onBusy:(value:boolean)=>void;onBuyChange:(value:number)=>void}){
 const auth=useAuth(),settings=useData('pump/config'),[busy,setBusy]=useState(false),[phase,setPhase]=useState(''),[error,setError]=useState(''),[buyText,setBuyText]=useState(String(draft.initialBuySol||0));
 const callbacks=useRef({onOperation,onBusy});callbacks.current={onOperation,onBusy};
 const view=operation?pumpLaunchView(operation):null;
 const amount=buyText.trim()===''?0:Number(buyText),buyInvalid=!/^(?:\d+(?:\.\d{0,9})?|\.\d{1,9})$/.test(buyText||'0')||!Number.isFinite(amount)||amount<0||amount>100;
 function accept(r:PumpOperation){callbacks.current.onOperation(r);localStorage.setItem('industry-pump-launch',r.id);}
 useEffect(()=>{if(!operation||!view?.waiting)return;let disposed=false,timer:ReturnType<typeof setTimeout>;
  async function check(){try{const r=await api('pump/recover',{id:operation!.id});if(!disposed){accept(r);setError('');}}catch{if(!disposed)setError('Status check interrupted. Your transaction is retained; we will check again.');}finally{if(!disposed)timer=setTimeout(()=>void check(),7000);}}
  timer=setTimeout(()=>void check(),3000);return()=>{disposed=true;clearTimeout(timer);};
 },[operation?.id,operation?.status]);
 async function action(kind:'launch'|'recover'|'cancel'){
  if(!auth.profile){auth.connect();return;}if(busy)return;setBusy(true);callbacks.current.onBusy(true);setError('');
  try{
   if(kind==='cancel'){await api('pump/cancel',{id:operation!.id});callbacks.current.onOperation(null);localStorage.removeItem('industry-pump-launch');return;}
   if(kind==='recover'){setPhase('Checking confirmation…');accept(await api('pump/recover',{id:operation!.id}));return;}
   if(!operation&&(blocked||buyInvalid))throw new Error(blocked||'Enter a valid SOL amount between 0 and 100, with up to nine decimal places.');
   setPhase('Preparing your launch…');
   const preparedDraft=!operation&&beforePrepare?await beforePrepare():draft;
   const r:PumpOperation=await (operation?api('pump/resume',{id:operation.id}):api('pump/prepare',{...preparedDraft,initialBuySol:amount,tokenMode:'pump',initialBudget:0,initialOperatingBudget:0},requestKey));accept(r);if(r.status!=='prepared')return;
   const wallet=getWallets().get().find(w=>w.accounts.some(a=>a.address===auth.profile!.wallet)&&'solana:signTransaction' in w.features),account=wallet?.accounts.find(a=>a.address===auth.profile!.wallet);
   if(!wallet||!account)throw new Error('Reconnect your Solana wallet to approve this launch.');
   const bytes=Uint8Array.from(atob(r.transaction!),c=>c.charCodeAt(0)),prepared=VersionedTransaction.deserialize(bytes);
   if(prepared.message.staticAccountKeys[0].toBase58()!==account.address)throw new Error('Connect the wallet you used to begin this launch.');
   setPhase('Approve in your wallet…');
   const [signed]=await (wallet.features as SolanaSignTransactionFeature)['solana:signTransaction'].signTransaction({account,chain:r.network==='mainnet-beta'?'solana:mainnet':'solana:devnet',transaction:bytes});
   const returned=VersionedTransaction.deserialize(signed.signedTransaction);if(Array.from(returned.message.serialize()).join()!==Array.from(prepared.message.serialize()).join())throw new Error('The wallet changed the transaction. Nothing was submitted.');
   setPhase('Submitting your launch…');accept(await api('pump/submit',{id:r.id,transaction:btoa(String.fromCharCode(...signed.signedTransaction))}));
  }catch(e){const message=(e as Error).message;setError(/reject|declin|cancelled by user/i.test(message)?'You declined the wallet request. You can continue whenever you are ready.':message);
   // Preparation may persist the token identity before a simulation or HTTP
   // failure. Restore it so a retry cannot accidentally create another mint.
   if(kind==='launch')try{const rows:PumpOperation[]=await api('pump/status'),pending=rows.find(r=>!['verified','cancelled'].includes(r.status));if(pending)accept(pending);}catch{}
  }finally{setBusy(false);callbacks.current.onBusy(false);setPhase('');}
 }
 if(view?.complete)return <PumpReceipt operation={operation!}/>;
 return <div className="pl-launch">
  {!operation&&<div className="pl-buy"><div><h3>Initial buy <span>Optional</span></h3><p>Buy your Coin with SOL from your connected wallet at launch.</p></div><label className="field">Amount in SOL<div className="pl-sol-input"><input aria-label="Initial buy in SOL" inputMode="decimal" value={buyText} aria-invalid={buyInvalid} disabled={busy} onChange={e=>{setBuyText(e.target.value);const n=Number(e.target.value);if(Number.isFinite(n)&&n>=0)onBuyChange(n);}}/><span>SOL</span></div></label><div className="pl-buy-options">{[0,.01,.05,.1].map(n=><button key={n} type="button" className={amount===n?'selected':''} disabled={busy} onClick={()=>{setBuyText(String(n));onBuyChange(n);}}>{n===0?'No buy':n+' SOL'}</button>)}</div><small>{buyInvalid?'Use 0–100 SOL, with up to nine decimal places.':'0 means no purchase. Network fees and account-creation costs are additional.'}</small>{amount>0&&!buyInvalid&&<p className="pl-buy-limit">Maximum purchase: <strong>{amount} SOL</strong> · tokens go to your wallet. Launch and buy complete together in one transaction.</p>}</div>}
  {!view?.confirmed&&<div className="pl-routing"><ShieldCheck size={20}/><div><strong>Pump.fun · {settings.data?.network==='mainnet-beta'?'Solana mainnet':'Solana devnet'}</strong><p>Creator fees are permanently routed to INDUSTRY Treasury to fund this Coin.</p><details><summary>Fee routing details</summary><p>100% Treasury share · {short(settings.data?.treasury)}. AI and Operating balances start at zero. Only collected, priced fees add credits.</p></details></div></div>}
  {operation&&view?.confirmed?<PumpReceipt operation={operation}/>:operation&&<div className="pl-status" role="status"><div>{view?.waiting?<LoaderCircle size={21} className="pl-spin"/>:<ShieldCheck size={21}/>}<h3>{view?.title}</h3></div><p>{view?.description}</p>{view?.transactionUrl&&<a href={view.transactionUrl} target="_blank" rel="noopener noreferrer">View transaction <ExternalLink size={13}/></a>}</div>}
  <ErrorNotice error={error||settings.error}/>
  {operation&&!view?.confirmed&&(operation.initialBuySol||0)>0&&<p className="pl-buy-limit">Initial buy: <strong>{operation.initialBuySol} SOL maximum</strong> · included in your wallet request.</p>}
  {operation?.error&&<details className="pl-diagnostics"><summary>Technical details</summary><p>{operation.error}</p></details>}
  {busy&&<p role="status" className="pl-phase"><LoaderCircle className="pl-spin" size={16}/>{phase}</p>}
  {view?.waiting?<button className="button full" disabled={busy} onClick={()=>void action('recover')}>Check status</button>:<button className="button primary full" disabled={busy||!settings.data?.enabled||!operation&&(!!blocked||buyInvalid)} onClick={()=>void action('launch')}>{busy?phase:!auth.profile?'Connect wallet':operation?'Continue launch':amount>0?'Launch & buy Coin':'Launch Coin'}</button>}
  {!operation&&<p className="pl-wallet-note">Review the transaction in your wallet before approving.</p>}
  {operation&&!view?.waiting&&<details className="pl-diagnostics"><summary>Edit launch details</summary><p>Return to your draft once any outstanding wallet request has expired. This does not cancel a confirmed token.</p><button className="button" disabled={busy} onClick={()=>void action('cancel')}>Return to draft</button></details>}
 </div>;
}
