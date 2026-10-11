import {type Queryable,one} from './connection';
import {systemHealth} from './system-health';
/** Secret-free, read-only health summary for the external monitor. */
export async function monitorStatus(db:Queryable){
 const h=await systemHealth(db);
 const warnings=h.alerts.filter(a=>['DEAD_LETTERS','PROVIDER_CAP_REACHED','PROVIDERS_PAUSED'].includes(a));
 const alerts=h.alerts.filter(a=>!warnings.includes(a));
 const checks=await one(db,`SELECT
 (SELECT count(*)::int FROM pump_businesses WHERE collection_error IS NOT NULL) collector_errors,
 (SELECT count(*)::int FROM pump_receipts WHERE allocation_status='PENDING_CONVERSION' AND created_at<now()-interval '15 minutes') pending_conversions,
 (SELECT count(*)::int FROM jobs WHERE dead_lettered_at>now()-interval '15 minutes') recent_failures`);
 if(checks?.collector_errors)alerts.push('PUMP_BUSINESS_COLLECTION_ERROR');
 if(checks?.pending_conversions)alerts.push('PUMP_CONVERSION_DELAYED');
 if(checks?.recent_failures)alerts.push('RECENT_FAILED_JOBS');
 if(process.env.MARKET_DATA_ENABLED!=='false'){
  const market=h.processes.find(p=>p.kind==='market-data');
  if(!market||Date.now()-new Date(market.heartbeat_at).getTime()>180000||market.state==='error')alerts.push('MARKET_DATA_STALE');
 }
 return {at:new Date().toISOString(),healthy:alerts.length===0,alerts:[...new Set(alerts)],warnings,counts:checks};
}
