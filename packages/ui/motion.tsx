'use client';
import { useEffect,useRef,useSyncExternalStore } from 'react';
import { animate } from 'framer-motion';
const motionQuery='(prefers-reduced-motion: reduce)';
const subscribeMotion=(notify:()=>void)=>{const query=matchMedia(motionQuery);query.addEventListener('change',notify);return()=>query.removeEventListener('change',notify);};
// Hydrate with the same preference as the server, then use the browser setting.
export const useMotionPreference=()=>useSyncExternalStore(subscribeMotion,()=>matchMedia(motionQuery).matches,()=>false);
export function AnimatedNumber({value,currency=false,decimals=0}:{value:number|undefined;currency?:boolean;decimals?:number}){
  const element=useRef<HTMLSpanElement>(null),previous=useRef(0),reduce=useMotionPreference();
  const format=(n:number)=>(currency?'$':'')+n.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
  useEffect(()=>{
    if(value===undefined||!element.current)return;const target=element.current;
    if(reduce){target.textContent=format(value);previous.current=value;target.dataset.animating='false';return;}
    target.dataset.animating='true';
    const animation=animate(previous.current,value,{duration:.7,ease:[.22,1,.36,1],onUpdate:n=>{target.textContent=format(n);previous.current=n;},onComplete:()=>{target.dataset.animating='false';}});
    return()=>animation.stop();
  },[value,currency,decimals,reduce]);
  return <span className="animated-number" aria-label={value===undefined?'Loading':format(value)}><span aria-hidden="true" ref={element}>{value===undefined?'—':format(value)}</span></span>;
}
