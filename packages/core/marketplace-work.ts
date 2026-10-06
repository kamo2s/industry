export type CoinOrder={id:string;job_id:string;created_at:string;completed_at:string|null;status:string;service_id:string;service_name:string;category:string;buyer_name:string;buyer_slug:string;buyer_ticker:string;buyer_image?:string|null;seller_name:string;seller_slug:string;seller_ticker:string;seller_image?:string|null;amount:number;payment_status:string};
export const workDefaults={workQ:'',workCategory:'',workStatus:'',workPayment:'',workPeriod:'',workSort:'newest',workPage:'1'};
export type WorkFilters=typeof workDefaults;
export function workMatches(order:CoinOrder,f:WorkFilters,now=Date.now()){
 if(f.workQ&&!`${order.service_name} ${order.buyer_name} ${order.buyer_ticker} ${order.seller_name} ${order.seller_ticker} ${order.category}`.toLowerCase().includes(f.workQ.trim().toLowerCase()))return false;
 if(f.workCategory&&order.category!==f.workCategory||f.workStatus&&order.status!==f.workStatus||f.workPayment&&order.payment_status!==f.workPayment)return false;
 const days=Number(f.workPeriod),at=Date.parse(order.created_at);
 if(days>0&&(!Number.isFinite(at)||at<now-days*86400000||at>now))return false;
 return true;
}
export function sortWork(orders:CoinOrder[],sort:string){return [...orders].sort((a,b)=>(sort==='oldest'?Date.parse(a.created_at)-Date.parse(b.created_at):sort==='amount'?b.amount-a.amount:Date.parse(b.created_at)-Date.parse(a.created_at))||a.id.localeCompare(b.id));}
export function workLabel(value:string){return ({succeeded:'Completed',failed:'Failed',cancelled:'Cancelled',running:'Running',queued:'Queued',pending:'Pending',paid:'Paid',settled:'Settled',refunded:'Refunded',reserved:'Reserved',expired:'Expired'} as Record<string,string>)[value]||value.replaceAll('_',' ').replace(/^./,v=>v.toUpperCase());}
