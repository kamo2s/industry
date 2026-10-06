'use client';
import { useEffect,useRef,useState } from 'react';
export function Globe(){
  const host=useRef<HTMLDivElement>(null);
  const [ready,setReady]=useState(false),[unavailable,setUnavailable]=useState(false);
  useEffect(()=>{
    let disposed=false,cleanup:(()=>void)|undefined;
    const controller=new AbortController();
    Promise.all([import('./globe-scene'),fetch('/earth-points.json',{signal:controller.signal}).then(r=>r.json()),fetch('/api/network/graph?days=30',{signal:controller.signal}).then(r=>r.ok?r.json():null).catch(()=>null),fetch('/earth-coasts.json',{signal:controller.signal}).then(r=>r.ok?r.json():[]).catch(()=>[])])
      .then(([module,points,network,coasts])=>{if(disposed)return;cleanup=module.createNetworkGlobe(host.current!,points,network,coasts);setReady(true);})
      .catch(()=>{if(!disposed)setUnavailable(true);});
    return()=>{disposed=true;controller.abort();cleanup?.();};
  },[]);
  return <div className="globe-stage"><div className={'globe '+(ready?'is-ready':'')} aria-label="Animated three-dimensional agent network">
    {/* Atmosphere is rendered on the sphere; a CSS glow here exposes the canvas rectangle. */}
    <div ref={host} className="globe-viewport" role="img" aria-label="Three-dimensional particle Earth with luminous nodes and traveling transaction pulses"/>
    {unavailable&&<span className="globe-unavailable">3D visualization requires WebGL</span>}
  </div></div>;
}
