'use client';
import {CoinPortrait} from './coin-portrait';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {Search,X,ArrowUpRight} from 'lucide-react';
import {api,ErrorNotice} from './client';
type Result={image_url?:string;ticker?:string;id:string;kind:string;title:string;description:string;href:string};

export function GlobalSearch(){
 const [open,setOpen]=useState(false),[q,setQ]=useState(''),[results,setResults]=useState<Result[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null),root=useRef<HTMLDivElement>(null),pathname=usePathname();
 useEffect(()=>{setOpen(false);setQ('');setResults([]);},[pathname]);
 useEffect(()=>{
  function key(e:KeyboardEvent){if(document.querySelector('[aria-modal="true"],dialog[open]'))return;const target=e.target as HTMLElement;if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(target.tagName)&&!target.isContentEditable){e.preventDefault();input.current?.focus();setOpen(true);}}
  function outside(e:PointerEvent){if(!root.current?.contains(e.target as Node))setOpen(false);}
  document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};
 },[]);
 useEffect(()=>{
  let stale=false;const controller=new AbortController();setResults([]);setError('');setLoading(!!q.trim());
  const timer=setTimeout(()=>{if(!q.trim())return;void api<Result[]>('search?q='+encodeURIComponent(q.trim()),undefined,undefined,'GET',controller.signal).then(r=>{if(!stale)setResults(r);}).catch(e=>{if(!stale)setError(e.message);}).finally(()=>{if(!stale)setLoading(false);});},200);
  return()=>{stale=true;controller.abort();clearTimeout(timer);};
 },[q]);
 return <div ref={root} className="header-find" role="search" aria-label="Search INDUSTRY" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false);}} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();input.current?.focus();setOpen(false);}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){const links=Array.from(root.current?.querySelectorAll<HTMLAnchorElement>('.search-results a')||[]);if(!links.length)return;e.preventDefault();const index=links.indexOf(document.activeElement as HTMLAnchorElement),next=e.key==='ArrowDown'?index+1:index-1;if(next<0)input.current?.focus();else links[Math.min(next,links.length-1)]?.focus();}
 }}>
  <div className="header-find-field"><button type="button" aria-label="Global search" aria-expanded={open} aria-controls="header-search-results" onClick={()=>{input.current?.focus();setOpen(true);}}><Search size={16}/></button><input ref={input} type="search" aria-label="Search coins, services, work" aria-controls="header-search-results" placeholder="Search coins, services, work…" value={q} onFocus={()=>setOpen(true)} onClick={()=>setOpen(true)} onChange={e=>{setQ(e.target.value);setOpen(true);}} onKeyDown={e=>{if(e.key==='Enter'&&results[0]&&!loading){e.preventDefault();root.current?.querySelector<HTMLAnchorElement>('.search-results a')?.click();}}}/>{q?<button type="button" aria-label="Clear search" onClick={()=>{setQ('');input.current?.focus();}}><X size={14}/></button>:<kbd>/</kbd>}</div>
  {open&&<section id="header-search-results" className="header-find-results" aria-label="Search results"><ErrorNotice error={error}/><div className="search-results" aria-busy={loading}>{!loading&&results.map(r=><Link href={r.href} key={r.kind+r.id} onClick={()=>setOpen(false)}>{r.kind==='Coin'?<CoinPortrait name={r.title} ticker={r.ticker||r.title} src={r.image_url} size={34}/>:<span className="badge">{r.kind}</span>}<div><strong>{r.title}</strong><small>{r.description}</small></div><ArrowUpRight size={14}/></Link>)}</div><p className="header-find-status" role="status">{loading?'Searching…':error?'Search is unavailable. Try again.':!q.trim()?'Find a Coin, service or recorded order.':!results.length?'No matching records.':results.length+' results · ↑ ↓ to navigate · Esc to close'}</p></section>}
 </div>;
}



