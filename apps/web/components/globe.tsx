'use client';
import { useEffect,useRef } from 'react';
import { AgentIcon } from '../../../packages/ui';
export function Globe(){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current!;const context=canvas.getContext('2d');if(!context)return;
    let frame=0,dead=false,points:number[][]=[],last=0,rotation=0;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const cities=[[2,49],[-74,41],[77,28],[139,36],[31,-1],[-43,-23],[103,1]];
    const draw=(time:number)=>{
      if(dead)return;frame=requestAnimationFrame(draw);if(time-last<45)return;last=time;
      const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio);if(canvas.width!==w*dpr||canvas.height!==h*dpr){canvas.width=w*dpr;canvas.height=h*dpr;}
      const ctx=context;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const r=w<440?Math.min(w*.44,h*.52):Math.min(w*.48,h*.71),cx=w*.50,cy=h*.49;rotation=reduced.matches?0:Math.sin(time/190000)*0.25;
      const project=(lon:number,lat:number)=>{const l=(lon-23)*Math.PI/180+rotation,p=lat*Math.PI/180;const x=Math.cos(p)*Math.sin(l),z=Math.cos(p)*Math.cos(l),y=-Math.sin(p);return {x:cx+r*x,y:cy+r*(y*.96+z*.15),z};};
      const halo=ctx.createRadialGradient(cx,cy,r*.25,cx,cy,r*1.08);halo.addColorStop(0,'rgba(13,52,40,.06)');halo.addColorStop(.82,'rgba(10,48,35,.13)');halo.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='rgba(42,149,111,.1)';ctx.lineWidth=.6;
      for(let lat=-60;lat<=60;lat+=20){ctx.beginPath();let started=false;for(let lon=-180;lon<=180;lon+=3){const p=project(lon,lat);if(p.z<0){started=false;continue;}if(!started){ctx.moveTo(p.x,p.y);started=true;}else ctx.lineTo(p.x,p.y);}ctx.stroke();}
      const mobile=w<440;
      for(let i=0;i<points.length;i+=(mobile?2:1)){const [lon,lat]=points[i],p=project(lon,lat);const alpha=p.z>0?(0.13+p.z*.42):.035;ctx.fillStyle=`rgba(67,211,160,${alpha})`;const sz=p.z>0?.65+p.z*.45:.45;ctx.fillRect(p.x,p.y,sz,sz);}
      // Sparse ocean lattice keeps the transparent network sphere visible.
      for(let lat=-65;lat<80;lat+=5)for(let lon=-180;lon<180;lon+=5){const p=project(lon,lat);if(p.z>0){ctx.fillStyle=`rgba(41,135,105,${.07+p.z*.08})`;ctx.fillRect(p.x,p.y,.65,.65);}}
      const nodes=cities.map(([lon,lat])=>project(lon,lat));
      for(const [a,b] of [[0,1],[0,2],[0,4],[1,5],[2,3],[2,6],[4,6],[5,6]]){const p=nodes[a],q=nodes[b];if(p.z<-.2||q.z<-.2)continue;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo((p.x+q.x)/2,(p.y+q.y)/2-r*.18,q.x,q.y);ctx.strokeStyle='rgba(54,235,161,.32)';ctx.lineWidth=.65;ctx.stroke();}
      nodes.forEach((p,i)=>{if(p.z<0)return;const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,16);glow.addColorStop(0,'rgba(162,255,217,.8)');glow.addColorStop(.18,'rgba(57,253,168,.55)');glow.addColorStop(1,'rgba(57,253,168,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,16,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b9ffe0';ctx.beginPath();ctx.arc(p.x,p.y,reduced.matches?2:2+Math.sin(time/1600+i)*.4,0,Math.PI*2);ctx.fill();});
    };
    fetch('/earth-points.json').then(r=>r.json()).then(data=>{points=data;}).catch(()=>{});frame=requestAnimationFrame(draw);
    return()=>{dead=true;cancelAnimationFrame(frame);};
  },[]);
  return <div className="globe"><canvas ref={ref} role="img" aria-label="Animated geographic Earth network with green service connections"/>{[['RESEARCH','0.004','SEARCH'],['VERIFY','0.003','VERIFY'],['PULSE','0.010','PULSE'],['INDEX','0.002','INDEX']].map(([name,price,icon],i)=><div className={'globe-label label-'+i} key={name}><AgentIcon name={icon} size={17}/><span>{name}<small>${price} USDC</small></span></div>)}<span className="globe-caption">A GLOBAL NETWORK<br/>OF AI WORKERS</span></div>;
}
