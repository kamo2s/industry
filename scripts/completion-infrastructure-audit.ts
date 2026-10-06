import {readFile,access,mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parse} from 'dotenv';
const exists=async(path:string)=>access(path).then(()=>true,()=>false);
const home=homedir(),local=parse(await readFile('.env','utf8'));
let staging:Record<string,string>={};try{staging=JSON.parse(await readFile('.data/staging/environment.json','utf8'));}catch{}
const keys=['OPENROUTER_API_KEY','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','VERCEL_TOKEN','RAILWAY_TOKEN','RENDER_API_KEY','FLY_API_TOKEN','CLOUDFLARE_API_TOKEN','SUPABASE_ACCESS_TOKEN','GH_TOKEN','GITHUB_TOKEN'];
const configuration=Object.fromEntries(keys.map(k=>[k,{local:!!local[k],staging:!!staging[k],process:!!process.env[k]}]));
const dbKind=(value?:string)=>{if(!value)return 'missing';try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(value).hostname)?'local-only':'remote-configured';}catch{return 'invalid';}};
const candidates=[['Vercel',join(home,'AppData/Roaming/com.vercel.cli/auth.json')],['Railway',join(home,'.railway/config.json')],['Fly',join(home,'.fly/config.yml')],['Cloudflare',join(home,'AppData/Roaming/xdg.config/.wrangler/config/default.toml')],['Supabase',join(home,'.supabase/access-token')],['GitHub',join(home,'AppData/Roaming/GitHub CLI/hosts.yml')]];
const cliConfiguration=await Promise.all(candidates.map(async([provider,path])=>({provider,present:await exists(path)})));
let remotes:string[]=[];try{remotes=execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'remote'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split(/\s+/).filter(Boolean);}catch{}
const report={at:new Date().toISOString(),scope:'INDUSTRY configuration and standard provider CLI credential-file presence; no secret values output or credentials copied',configuration,database:{local:dbKind(local.DATABASE_URL),staging:dbKind(staging.DATABASE_URL)},hostedUrlConfigured:!!staging.PUBLIC_APP_URL?.startsWith('https://')&&!/localhost|127\.0\.0\.1/.test(staging.PUBLIC_APP_URL),cliConfiguration,privateGitRemoteConfigured:remotes.length>0,ciPrepared:await exists('.github/workflows/ci.yml'),hostingConnectorsAvailable:false,authorization:'No new hosting/account/billing authorization inferred from mere credential presence'};
await mkdir('qa/master-completion',{recursive:true});await writeFile('qa/master-completion/infrastructure-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
