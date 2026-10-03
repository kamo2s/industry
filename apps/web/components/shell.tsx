'use client';
import Link from 'next/link';
import { usePathname,useRouter } from 'next/navigation';
import { createContext,useContext,useEffect,useState } from 'react';
import { getWallets } from '@wallet-standard/app';
import type { StandardConnectFeature } from '@wallet-standard/features';
import type { SolanaSignMessageFeature } from '@solana/wallet-standard-features';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Search,Settings2,Menu,X,ArrowRight,Wallet as WalletIcon,ShieldCheck } from 'lucide-react';
import { api,ErrorNotice } from './client';
import { short } from '../../../packages/core';
type Session={id:string;wallet:string;credits:number};
type Wallet=ReturnType<ReturnType<typeof getWallets>['get']>[number];
const Auth=createContext<{profile:Session|null;demo:boolean;connect:()=>void;refresh:()=>Promise<void>;logout:()=>Promise<void>}>({profile:null,demo:false,connect:()=>{},refresh:async()=>{},logout:async()=>{}});
export const useAuth=()=>useContext(Auth);
export function Shell({children}:{children:React.ReactNode}){
  const pathname=usePathname(),router=useRouter();
  const [profile,setProfile]=useState<Session|null>(null),[demo,setDemo]=useState(false),[modal,setModal]=useState(false),[drawer,setDrawer]=useState(false),[wallets,setWallets]=useState<readonly Wallet[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState('');
  const refresh=async()=>{try{const s=await api('auth/session');setProfile(s.profile);setDemo(s.demo);}catch{}};
  useEffect(()=>{void refresh();const registry=getWallets();setWallets(registry.get());const off=registry.on('register',()=>setWallets(registry.get()));return off;},[]);
  useEffect(()=>{setDrawer(false);},[pathname]);
  const logout=async()=>{await api('auth/logout',{});setProfile(null);};
  async function signIn(wallet?:Wallet){setBusy(true);setError('');try{
    let address:string,sign:(m:Uint8Array)=>Promise<Uint8Array>;
    if(wallet){const features=wallet.features as StandardConnectFeature & SolanaSignMessageFeature;const connected=await features['standard:connect'].connect();const account=connected.accounts.find(a=>a.features.includes('solana:signMessage'));if(!account)throw new Error('This wallet does not support message signing');address=account.address;sign=async m=>(await features['solana:signMessage'].signMessage({account,message:m}))[0].signature;}
    else {const key=nacl.sign.keyPair();address=bs58.encode(key.publicKey);sign=async m=>nacl.sign.detached(m,key.secretKey);}
    const challenge=await api('auth/challenge',{wallet:address});
    const signature=await sign(new TextEncoder().encode(challenge.message));
    const result=await api('auth/verify',{id:challenge.id,wallet:address,signature:bs58.encode(signature)});
    setProfile(result.profile);setModal(false);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const nav=[['Home','/'],['Agents','/agents'],['Launch','/launch'],['Marketplace','/marketplace'],['Docs','/docs']];
  return <Auth.Provider value={{profile,demo,connect:()=>{setError('');setModal(true);},refresh,logout}}>
    <a href="#main" className="skip">Skip to content</a>
    <header className="header"><Link className="wordmark" href="/">INDUSTRY</Link><nav aria-label="Primary navigation" className={drawer?'nav open':'nav'}>{nav.map(([label,href])=><Link key={href} className={pathname===href?'active':''} href={href}>{label}</Link>)}{profile&&<Link href="/dashboard">Dashboard</Link>}</nav>
      <form className="header-search" onSubmit={e=>{e.preventDefault();router.push('/agents?q='+encodeURIComponent(query));}}><Search size={14}/><input aria-label="Search agents, tokens, jobs" placeholder="Search agents, tokens, jobs..." value={query} onChange={e=>setQuery(e.target.value)}/></form>
      <button className="wallet-button" onClick={()=>profile?router.push('/dashboard'):setModal(true)}>{profile?short(profile.wallet):'Connect Wallet'}</button><Link className="icon-button settings-link" aria-label="Settings" href="/settings"><Settings2 size={18}/></Link><button className="icon-button menu-button" aria-label={drawer?'Close navigation':'Open navigation'} onClick={()=>setDrawer(!drawer)}>{drawer?<X/>:<Menu/>}</button></header>
    <main id="main">{children}</main>
    <footer className="footer"><Link href="/" className="wordmark">INDUSTRY</Link><nav>{['About','Docs','Blog','Terms','Privacy'].map(n=><Link key={n} href={'/docs'+(n==='Docs'?'':'#'+n.toLowerCase())}>{n}</Link>)}</nav><span className="footer-note">A MORE PRODUCTIVE INTERNET.</span></footer>
    {demo&&<div className="demo-ribbon"><span className="live-dot"/> DEVELOPMENT NETWORK <span>Test USDC · Seeded history · Mainnet off</span></div>}
    {modal&&<div className="modal-backdrop" onClick={()=>!busy&&setModal(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title" onClick={e=>e.stopPropagation()}><button className="icon-button modal-close" onClick={()=>setModal(false)} aria-label="Close wallet dialog"><X/></button><WalletIcon className="green" size={30}/><h2 id="wallet-title">Connect to INDUSTRY</h2><p>Sign a one-time message to authenticate your wallet. No transaction or spending permission is requested.</p><ErrorNotice error={error}/>{wallets.filter(w=>'solana:signMessage' in w.features).map(w=><button key={w.name} disabled={busy} className="button wallet-option" onClick={()=>void signIn(w)}>{w.name}<ArrowRight size={17}/></button>)}{!wallets.length&&<p className="muted">No compatible wallet detected in this browser.</p>}{demo&&<button disabled={busy} className="button primary full" onClick={()=>void signIn()}>{busy?'Verifying signature…':'Use a development wallet'}<ArrowRight size={17}/></button>}<small className="wallet-help"><ShieldCheck size={15}/> {demo?'Temporary test identity · 100 test USDC credits':'Your private keys remain in your wallet'}</small></section></div>}
  </Auth.Provider>;
}
