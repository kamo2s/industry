export type CoinImageSource={kind:'image'|'metadata';url:string};
const upload=/^\/api\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function safeCoinImageUrl(value:unknown):string|null {
 if(typeof value!=='string'||value.length>2048)return null;
 if(upload.test(value))return value;
 try {
  const raw=value.startsWith('ipfs://')?'https://ipfs.io/ipfs/'+value.slice(7).replace(/^ipfs\//,''):value;
  const u=new URL(raw),host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!host.includes('.')||!/[a-z]/i.test(host)||host.includes(':')||/^(localhost|0x[\da-f]+)$/.test(host)||/\.(local|localhost|internal|test|invalid)$/.test(host))return null;
  u.hash='';return u.href;
 }catch{return null;}
}
// Only metadata attached to this exact verified token can outrank its upload.
export function coinImageSources(row:{official?:boolean;verified_at?:unknown;token_image?:unknown;metadata_uri?:unknown;pump_icon?:unknown;icon_url?:unknown},directory=false):CoinImageSource[]{
 const candidates:CoinImageSource[]=[];
 const add=(kind:CoinImageSource['kind'],value:unknown)=>{const url=safeCoinImageUrl(value);if(url&&!candidates.some(c=>c.url===url))candidates.push({kind,url});};
 if(directory&&typeof row.icon_url==='string'&&upload.test(row.icon_url))add('image',row.icon_url);
 if(row.official){add('image',row.token_image);if(row.pump_icon)add('image','/api/uploads/'+row.pump_icon);}
 if(row.verified_at){add('image',row.token_image);add('metadata',row.metadata_uri);}
 add('image',row.icon_url);return candidates;
}
export function coinInitials(ticker:string){return ticker.replace(/[^a-z0-9]/gi,'').slice(0,2).toUpperCase()||'IN';}
export function trustedCoinThumbnail(value:unknown){return typeof value==='string'&&(upload.test(value)||/^\/api\/network\/images\/[0-9a-f-]{36}$/.test(value))?value:null;}
