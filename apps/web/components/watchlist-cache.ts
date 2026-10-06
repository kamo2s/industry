// One read per signed-in page, not one identical read for every star button.
// Cache keys are account IDs; clearing on sign-out prevents cross-account reuse.
export function createWatchlistCache<T>(read:()=>Promise<T>,ttl=10000){
 const cache=new Map<string,{until:number;promise:Promise<T>}>();
 return {get(account:string){const old=cache.get(account);if(old&&old.until>Date.now())return old.promise;const promise=read().catch(e=>{if(cache.get(account)?.promise===promise)cache.delete(account);throw e;});cache.set(account,{until:Date.now()+ttl,promise});return promise;},invalidate(account?:string){if(account)cache.delete(account);else cache.clear();}};
}
