'use client';
import {useEffect,useState} from 'react';

const key='industry-contrast',event='industry-display-change';
function readContrast(){try{return localStorage.getItem(key)==='high';}catch{return false;}}
export function useDisplayContrast(){
  const [contrast,setContrast]=useState(false);
  useEffect(()=>{
    const sync=()=>{const enabled=readContrast();setContrast(enabled);document.body.classList.toggle('high-contrast',enabled);};
    sync();window.addEventListener('storage',sync);window.addEventListener(event,sync);
    return ()=>{window.removeEventListener('storage',sync);window.removeEventListener(event,sync);};
  },[]);
  const update=(enabled:boolean)=>{
    setContrast(enabled);document.body.classList.toggle('high-contrast',enabled);
    try{localStorage.setItem(key,enabled?'high':'default');window.dispatchEvent(new Event(event));}catch{/* Keep this session usable when browser storage is blocked. */}
  };
  return [contrast,update] as const;
}
