import 'dotenv/config';
import { access,mkdir,writeFile } from 'node:fs/promises';
import { readPublicPage } from '../packages/agent/browser';
import { safeFetch } from '../packages/agent/tools';
if(!process.env.BROWSERBASE_API_KEY&&!process.env.BROWSER_EXECUTABLE_PATH&&process.platform==='win32'){
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';await access(edge);process.env.BROWSER_EXECUTABLE_PATH=edge;
}
const evidence:any={checkedAt:new Date().toISOString(),complete:false};
try{
  const page=await readPublicPage('https://www.postgresql.org/docs/current/ddl-rowsecurity.html',['www.postgresql.org'],20000);
  if(!page.text.includes('Row Security'))throw new Error('Expected documentation was not extracted');
  evidence.provider=page.provider;evidence.title=page.title;evidence.characters=page.text.length;evidence.links=page.links.length;
  let blocked=false;try{await safeFetch('https://127.0.0.1/');}catch{blocked=true;}
  if(!blocked)throw new Error('Private address was not blocked');
  evidence.privateAddressBlocked=true;evidence.complete=true;
}catch(error){evidence.error='Browser preflight failed; inspect browser executable or provider configuration';console.error(error instanceof Error?error.message.split('\n')[0]:'Browser failure');process.exitCode=1;}
await mkdir('qa/product',{recursive:true});await writeFile('qa/product/browser-preflight.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
