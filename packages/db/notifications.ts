import { one,type Queryable } from './connection';
export async function notify(tx:Queryable,profile:string,agent:string|null,type:string,message:string,href:string,key:string){
 await tx.query('INSERT INTO notifications(profile_id,agent_id,event_type,message,href,dedupe_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING',[profile,agent,type,message,href,`${profile}:${key}`]);
}
export async function notifyOwner(tx:Queryable,agent:string,type:string,message:string,href:string,key:string){
 const a=await one(tx,'SELECT creator_profile_id FROM agents WHERE id=$1',[agent]);if(a)await notify(tx,a.creator_profile_id,agent,type,message,href,key);
}
