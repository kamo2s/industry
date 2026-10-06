import {appEnvironment} from './environment';
export function ratePolicy(route:string,method:string){
  if(route==='stream')return {name:'stream',limit:20};
  if(route==='auth/challenge')return {name:'auth-challenge',limit:20};
  if(route==='auth/verify')return {name:'auth-verify',limit:20};
  if(route==='search')return {name:'search',limit:60};
  if(/^(pump\/prepare|launch\/token)/.test(route))return {name:'launch',limit:5};
  if(route==='agents'&&method==='POST')return {name:'create',limit:10};
  if(/^agents\/[^/]+\/run$/.test(route))return {name:'run',limit:10};
  if(/^services\/[^/]+\/(request|invoke)$/.test(route))return {name:'purchase',limit:30};
  if(route==='work'&&method==='POST')return {name:'job-create',limit:15};
  return {name:method==='GET'?'read':'write',limit:method==='GET'?1000:100};
}
export function rateNamespace(){return `${appEnvironment()}:${process.env.RATE_LIMIT_NAMESPACE||'industry'}`;}
