import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { ensure } from '../core';
import { verifyMint } from './solana';
export type Source={title:string;url:string;snippet:string;provider?:string;discovered_at?:string;retrieved_at?:string;inspection?:'fetched'|'unavailable';scope?:{businessId?:string;jobId?:string;runId?:string};citations?:any[]};
export const corpus:Source[]=[
  {title:'Solana developer documentation',url:'https://solana.com/docs',snippet:'Solana documents accounts, programs, transactions, tokens, and development clusters. Devnet is intended for application testing.'},
  {title:'OpenRouter structured outputs',url:'https://openrouter.ai/docs/guides/features/structured-outputs',snippet:'Compatible models can return structured JSON constrained by a schema. Provider availability and capabilities vary.'},
  {title:'PostgreSQL row security',url:'https://www.postgresql.org/docs/current/ddl-rowsecurity.html',snippet:'Row security policies restrict database rows visible to a role. Superusers and table owners can bypass row security.'},
  {title:'Helius token data',url:'https://www.helius.dev/docs/api-reference/das/getasset',snippet:'The getAsset method returns metadata and on-chain attributes for a supported Solana asset.'},
  {title:'Wallet Standard',url:'https://wallet-standard.github.io/wallet-standard/',snippet:'The Wallet Standard defines interoperable wallet discovery, accounts, features and connection interfaces.'}
];
export function publicIP(address:string):boolean {
  const ip=address.toLowerCase();
  if(isIP(ip)===4) {const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||a===192||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0));}
  // Permit native globally routed unicast IPv6 only; deny mapped, local, multicast, docs, Teredo and 6to4.
  return isIP(ip)===6 && /^[23][0-9a-f]{3}:/.test(ip) && !ip.startsWith('2001:db8:')&&!ip.startsWith('2001:0:')&&!ip.startsWith('2002:');
}
export async function safeFetch(raw:string,domains:string[]=[],timeout=12000,html=false) {
  const url=new URL(raw);
  ensure(url.protocol==='https:' && !url.username && !url.password && (!url.port||url.port==='443'),'SSRF_BLOCKED','Only public HTTPS URLs are allowed');
  const hostname=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  ensure(!hostname.endsWith('.local')&&hostname!=='localhost'&&!hostname.endsWith('.localhost'),'SSRF_BLOCKED','Local addresses are blocked');
  ensure(!domains.length||domains.includes(hostname),'DOMAIN_DENIED','URL is outside the allowed sources');
  let timer:ReturnType<typeof setTimeout>|undefined;
  const addresses=await Promise.race([lookup(hostname,{all:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('DNS lookup timed out')),Math.min(timeout,5000));})]).finally(()=>clearTimeout(timer));
  ensure(addresses.length && addresses.every(a=>publicIP(a.address)),'SSRF_BLOCKED','Private or reserved addresses are blocked');
  const pinned=addresses[0];
  return new Promise<string>((resolve,reject)=>{
    const req=request(url,{method:'GET',signal:AbortSignal.timeout(Math.max(1,Math.min(12000,timeout))),headers:{'User-Agent':'INDUSTRY/1.0','Accept':'text/html,application/json,text/plain','Accept-Encoding':'identity'},lookup:(_h,options,cb)=>{if(options.all)(cb as unknown as (error:null,records:typeof addresses)=>void)(null,[pinned]);else cb(null,pinned.address,pinned.family);}},res=>{
      if(res.statusCode!==200){res.resume();reject(new Error('Source returned an unsupported status; redirects are not followed'));return;}
      if(!/^(text\/(html|plain)|application\/(json|xml))/.test(String(res.headers['content-type']||''))){res.resume();reject(new Error('Source content type is not allowed'));return;}
      let size=0;const chunks:Buffer[]=[];
      res.on('data',c=>{size+=c.length;if(size>512000){req.destroy(new Error('Source exceeds 512 KB'));}else chunks.push(c);});
      res.on('end',()=>{const content=Buffer.concat(chunks).toString('utf8');resolve(html?content:content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,24000));});
      res.on('error',reject);
    });
    req.setTimeout(12000,()=>req.destroy(new Error('Source request timed out')));req.on('error',reject);req.end();
  });
}
export async function search(query:string,domains:string[]=[],timeout=12000):Promise<Source[]> {
  return (await (await import('./search')).searchProvider().search({query,domains,timeout,budget:100000})).sources;
}
export async function executeTool(key:string,input:any,config:any,timeout=12000,onCapture?:(capture:import('./browser').BrowserCapture)=>Promise<void>):Promise<any> {
  ensure(config.tools.includes(key),'TOOL_DENIED',`Tool ${key} is not enabled`);
  if(key==='web_search') return search(String(input.query).slice(0,1000),config.domains,timeout);
  if(key==='browser_fetch'&&(process.env.BROWSERBASE_API_KEY||process.env.BROWSER_PROVIDER==='local'))return (await import('./browser')).readPublicPage(String(input.url),config.domains,timeout,onCapture);
  if(key==='browser_fetch'||key==='http') return {url:input.url,text:await safeFetch(String(input.url),config.domains,timeout)};
  if(key==='helius') return verifyMint(String(input.mint),Math.min(timeout,12000));
  throw new Error('Unsupported tool action');
}
