'use client';
import {useState} from 'react';
import {coinInitials,trustedCoinThumbnail} from '../../../packages/core/coin-images';
export function CoinPortrait({name,ticker,src,size=48,eager=false}:{name:string;ticker:string;src?:string|null;size?:number;eager?:boolean}){
 const [failed,setFailed]=useState<string|null>(null),[loaded,setLoaded]=useState<string|null>(null),safe=trustedCoinThumbnail(src);
 return <span className="coin-portrait" aria-hidden="true" style={{width:size,height:size}}>{(!safe||failed===safe||loaded!==safe)&&<span aria-label={name+' · coin image placeholder'} className="coin-initials">{coinInitials(ticker)}</span>}{safe&&failed!==safe&&<img src={safe} alt={name+' coin'} width={size} height={size} loading={eager?'eager':'lazy'} decoding="async" style={{opacity:loaded===safe?1:0,position:'absolute',inset:0}} onError={()=>setFailed(safe)} onLoad={e=>{
  // Old test uploads can be completely transparent. Preserve real transparent
  // logos, but treat an image containing no visible pixels as a missing logo.
  try{const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const context=canvas.getContext('2d');if(context){context.drawImage(e.currentTarget,0,0,16,16);const pixels=context.getImageData(0,0,16,16).data;if(!pixels.some((v,i)=>i%4===3&&v>8)){setFailed(safe);return;}}}catch{}
  setLoaded(safe);
 }}/>}</span>;
}
