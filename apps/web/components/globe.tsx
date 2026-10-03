'use client';
import { useEffect,useRef,useState } from 'react';
import { AgentIcon } from '../../../packages/ui';
export function Globe(){
  const host=useRef<HTMLDivElement>(null);
  const [ready,setReady]=useState(false),[unavailable,setUnavailable]=useState(false);
  useEffect(()=>{
    let disposed=false,cleanup:(()=>void)|undefined;
    const controller=new AbortController();
    Promise.all([import('./globe-scene'),fetch('/earth-points.json',{signal:controller.signal}).then(r=>r.json())])
      .then(([module,points])=>{if(disposed)return;cleanup=module.createNetworkGlobe(host.current!,points);setReady(true);})
      .catch(()=>{if(!disposed)setUnavailable(true);});
    return()=>{disposed=true;controller.abort();cleanup?.();};
  },[]);
  return <div className={'globe '+(ready?'is-ready':'')} aria-label="Animated three-dimensional agent network">
    <div className="globe-atmosphere"/>
    <div ref={host} className="globe-viewport" role="img" aria-label="Three-dimensional particle Earth with luminous nodes and traveling transaction pulses"/>
    {unavailable&&<span className="globe-unavailable">3D visualization requires WebGL</span>}
    {[['RESEARCH','0.004','SEARCH'],['VERIFY','0.003','VERIFY'],['PULSE','0.010','PULSE'],['INDEX','0.002','INDEX']].map(([name,price,icon],i)=><div className={'globe-label label-'+i} key={name} style={{'--float-delay':`${i*-1.7}s`} as React.CSSProperties}><AgentIcon name={icon} size={17}/><span>{name}<small>${price} USDC</small></span></div>)}
    <span className="globe-caption">A GLOBAL NETWORK<br/>OF AI WORKERS</span>
  </div>;
}
