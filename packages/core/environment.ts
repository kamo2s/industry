import {ensure,micro} from './index';
export type AppEnvironment='local'|'staging'|'production';
export function appEnvironment():AppEnvironment {
  const value=(process.env.APP_ENV||'local').toLowerCase();
  ensure(['local','staging','production'].includes(value),'ENVIRONMENT_INVALID','APP_ENV must be local, staging or production',503);
  return value as AppEnvironment;
}
export function publicAppUrl(){return process.env.PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';}
export function testEconomy(){return appEnvironment()==='staging'||(appEnvironment()==='local'&&process.env.APP_MODE==='demo');}
export function developmentProviderAllowed(){return appEnvironment()==='local'&&process.env.APP_MODE==='demo'||appEnvironment()==='staging'&&process.env.STAGING_DETERMINISTIC_PROVIDER==='true';}
export function providerCap(){const dollars=Number(process.env.STAGING_PROVIDER_DAILY_CAP_USD||(appEnvironment()==='staging'?'2':process.env.PROVIDER_DAILY_CAP_USD||'2'));ensure(Number.isFinite(dollars)&&dollars>=0&&dollars<=10000,'PROVIDER_CAP_INVALID','Configure a finite provider daily cap',503);return micro(dollars);}
export function validateEnvironment(role:'web'|'database'|'worker'|'collector'){
  const env=appEnvironment(),hosted=env!=='local',simulation=process.env.STAGING_LOCAL_SIMULATION==='true';
  ensure(!simulation||env==='staging','ENVIRONMENT_INVALID','Local simulation is only a staging test mode',503);
  if(hosted){
    ensure(process.env.APP_ENV&&process.env.PUBLIC_APP_URL,'ENVIRONMENT_MISSING','Explicit APP_ENV and PUBLIC_APP_URL are required',503);
    const url=new URL(publicAppUrl());ensure(!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash,'PUBLIC_URL_INVALID','PUBLIC_APP_URL must be a clean origin',503);
    ensure(url.protocol==='https:'||(simulation&&['localhost','127.0.0.1'].includes(url.hostname)),'HTTPS_REQUIRED','Hosted application URL must use HTTPS',503);
    ensure(process.env.APP_MODE!=='demo','DEMO_HOSTED_DENIED','Hosted staging must not enable local demo shortcuts',503);
    if(role==='database'){
      ensure(process.env.DATABASE_URL,'DATABASE_REQUIRED','Hosted persistence requires PostgreSQL',503);
      ensure(process.env.WORKER_API_SECRET&&process.env.WORKER_API_SECRET.length>=32&&process.env.WORKER_API_SECRET!==process.env.INTERNAL_API_SECRET,'SERVICE_SECRET_REQUIRED','Configure a distinct WORKER_API_SECRET',503);
    }
    if(role==='web')ensure(process.env.SESSION_SECRET&&process.env.SESSION_SECRET.length>=32,'SESSION_SECRET_REQUIRED','Configure a private session secret',503);
    const key=role==='worker'?'WORKER_API_SECRET':role==='collector'?'PUMP_COLLECTOR_API_SECRET':'INTERNAL_API_SECRET';
    ensure(process.env[key]&&process.env[key]!.length>=32,'SERVICE_SECRET_REQUIRED',`Configure ${key}`,503);
    if(env==='staging')ensure(!['PUMP_LAUNCH_ENABLED','PUMP_MAINNET_LAUNCH_ENABLED','PUMP_FEE_COLLECTION_ENABLED','PUMP_MAINNET_COLLECTION_ENABLED'].some(k=>process.env[k]==='true'),'STAGING_BROADCAST_DENIED','Staging Pump broadcasting must remain disabled',503);
  }
  providerCap();return {environment:env,url:publicAppUrl(),simulation};
}
