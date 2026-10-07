'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname,useRouter } from 'next/navigation';
import { motion,MotionConfig } from 'framer-motion';
import { createContext,useContext,useEffect,useState,useRef } from 'react';
import { getWallets } from '@wallet-standard/app';
import type { StandardConnectFeature } from '@wallet-standard/features';
import type { SolanaSignMessageFeature } from '@solana/wallet-standard-features';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Settings2,Menu,X,ArrowRight,Wallet as WalletIcon,ShieldCheck } from 'lucide-react';
import { api,ErrorNotice } from './client';
import { NotificationBell } from './community';
import { GlobalSearch } from './global-search';
import { useDisplayContrast } from './display-preferences';

type Session={id:string;wallet:string;credits:number};
type Wallet=ReturnType<ReturnType<typeof getWallets>['get']>[number];
const Auth=createContext<{profile:Session|null;loading:boolean;demo:boolean;connect:()=>void;refresh:()=>Promise<void>;logout:()=>Promise<void>}>({profile:null,loading:true,demo:false,connect:()=>{},refresh:async()=>{},logout:async()=>{}});
export const useAuth=()=>useContext(Auth);
export function Shell({children}:{children:React.ReactNode}){
  useDisplayContrast();
  const dialog=useRef<HTMLElement>(null);
  const pathname=usePathname(),router=useRouter();
  const [profile,setProfile]=useState<Session|null>(null),[demo,setDemo]=useState(false),[modal,setModal]=useState(false),[drawer,setDrawer]=useState(false),[wallets,setWallets]=useState<readonly Wallet[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true),[environment,setEnvironment]=useState('local');
  const refresh=async()=>{try{const s=await api('auth/session');setProfile(s.profile);setDemo(s.demo);setEnvironment(s.environment||'local');}catch{}finally{setLoading(false);}};
  useEffect(()=>{void refresh();const registry=getWallets();setWallets(registry.get());const off=registry.on('register',()=>setWallets(registry.get()));return off;},[]);
  useEffect(()=>{setDrawer(false);},[pathname]);
  useEffect(()=>{
    if(!modal)return;
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialog.current?.focus();
    const keydown=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();setModal(false);}
      if(e.key!=='Tab')return;
      const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')||[]);
      const first=controls[0],last=controls.at(-1);
      if(!first){e.preventDefault();dialog.current?.focus();return;}
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',keydown);
    return ()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;previous?.focus();};
  },[modal]);
  useEffect(()=>{
    if(!drawer)return;
    const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){setDrawer(false);document.querySelector<HTMLButtonElement>('.menu-button')?.focus();}};
    document.addEventListener('keydown',close);return ()=>document.removeEventListener('keydown',close);
  },[drawer]);
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
  const nav=[['Home','/'],['Coins','/coins'],['Marketplace','/marketplace'],['Launch','/launch']];
  return <MotionConfig reducedMotion="user"><Auth.Provider value={{profile,loading,demo,connect:()=>{if(!loading){setError('');setModal(true);}},refresh,logout}}>
    <a href="#main" className="skip">Skip to content</a>
    <header className="header"><Link className="wordmark" href="/"><Image className="brand-symbol" src="/brand/industry-emblem.svg" width={27} height={31} alt="" priority unoptimized/> INDUSTRY</Link><nav aria-label="Primary navigation" className={drawer?'nav open':'nav'}>{nav.map(([label,href])=><Link key={href} className={(pathname===href||href==='/coins'&&pathname.startsWith('/coins/'))?'active':''} href={href}>{label}</Link>)}{profile&&<Link className="mobile-account" href="/dashboard">My Industry</Link>}</nav>
      <GlobalSearch/><NotificationBell/>
      <button className="wallet-button" disabled={loading} onClick={()=>profile?router.push('/dashboard'):setModal(true)}>{profile?'My Industry':'Connect Wallet'}</button><Link className="icon-button settings-link" aria-label="Settings" href="/settings"><Settings2 size={18}/></Link><button className="icon-button menu-button" aria-expanded={drawer} aria-label={drawer?'Close navigation':'Open navigation'} onClick={()=>setDrawer(!drawer)}>{drawer?<X/>:<Menu/>}</button></header>
    <motion.main id="main" key={pathname} initial={false} animate={{opacity:1}} transition={{duration:.18}}>{children}</motion.main>
    <footer className="footer"><Link href="/" className="wordmark">INDUSTRY</Link><nav aria-label="Project information">{['Docs','About','FAQ'].map(n=><Link key={n} href={'/'+n.toLowerCase()}>{n}</Link>)}</nav><span className="footer-note">Autonomous businesses for a better internet.</span></footer>
    {demo&&<div className="demo-ribbon"><span className="live-dot"/> {environment==='staging'?'STAGING NETWORK':'DEVELOPMENT NETWORK'} <span>{environment==='staging'?'Test credits · No mainnet assets':'Test USDC · Seeded history · Mainnet off'}</span></div>}
    {modal&&<div className="modal-backdrop" onClick={()=>!busy&&setModal(false)}><section ref={dialog} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title" onClick={e=>e.stopPropagation()}><button className="icon-button modal-close" onClick={()=>setModal(false)} aria-label="Close wallet dialog"><X/></button><WalletIcon className="green" size={30}/><h2 id="wallet-title">Connect to INDUSTRY</h2><p>Sign a one-time message to authenticate your wallet. No transaction or spending permission is requested.</p><ErrorNotice error={error}/>{wallets.filter(w=>'solana:signMessage' in w.features).map(w=><button key={w.name} disabled={busy} className="button wallet-option" onClick={()=>void signIn(w)}>{w.name}<ArrowRight size={17}/></button>)}{!wallets.length&&<p className="muted">No compatible wallet detected in this browser.</p>}{demo&&environment==='local'&&<button disabled={busy} className="button primary full" onClick={()=>void signIn()}>{busy?'Verifying signature…':'Use a development wallet'}<ArrowRight size={17}/></button>}<small className="wallet-help"><ShieldCheck size={15}/> {demo&&environment==='local'?'Temporary test identity · 100 test USDC credits':'Your private keys remain in your wallet'}</small></section></div>}
  </Auth.Provider></MotionConfig>;
}



