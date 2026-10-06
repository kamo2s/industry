import * as THREE from 'three';

// Every continent dot, node and connection is positioned in 3D. No map image or
// reference screenshot is used. One point draw call handles the land surface.
export function createNetworkGlobe(host:HTMLDivElement,land:number[][],network?:{nodes:{id:string}[];edges:{source:string;target:string}[]}|null,coasts:number[][][]=[]){
  const constrained=host.clientWidth<500||navigator.hardwareConcurrency<6;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio,constrained?1.25:1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.1,20);
  const earth=new THREE.Group();earth.rotation.set(.08,-.43,-.18);scene.add(earth);
  const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[];
  const radians=Math.PI/180;
  function location(lon:number,lat:number,r=1){const p=lat*radians,l=lon*radians;return new THREE.Vector3(Math.cos(p)*Math.sin(l),Math.sin(p),Math.cos(p)*Math.cos(l)).multiplyScalar(r);}
  // Registered businesses are mapped onto display positions, not claimed as
  // physical geolocation. Connections correspond to settled economic edges.
  const displayPositions=[[-14,48],[8,34],[36,15],[54,1],[3,5],[31,6],[101,3],[-49,-17],[-74,41]];
  const mapped=network?.nodes.slice(0,24)||[];
  const coordinates=mapped.map((_,i)=>displayPositions[i]||[((i*137.5)%260)-130,55-(i%5)*24]);
  const highlighted=new Set([0,1,2,5]);
  const uniforms={uTime:{value:0},uDpr:{value:renderer.getPixelRatio()},uReduced:{value:reduced.matches?1:0},uNodes:{value:[0,1,2,5].map(i=>location(...(coordinates[i]||coordinates[0]||displayPositions[0]) as [number,number]))}};
  const pointMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float uTime; uniform float uDpr; uniform float uReduced; uniform vec3 uNodes[4];
      attribute float aSeed; attribute float aLand; varying float vAlpha; varying float vSeed; varying float vSide;
      void main(){vec4 view=modelViewMatrix*vec4(position,1.0);vec3 normal=normalize(normalMatrix*position);
        float facing=dot(normal,normalize(-view.xyz));
        float front=smoothstep(-0.02,0.28,facing)*(0.12+0.88*pow(max(facing,0.0),1.5));
        float light=0.25+0.75*max(0.0,dot(normal,normalize(vec3(-0.3,0.45,1.0))));
        float depth=0.56+0.44*(1.0-smoothstep(2.1,3.5,-view.z));
        float localLight=0.0;for(int i=0;i<4;i++){vec3 d=normalize(position)-uNodes[i];localLight+=exp(-dot(d,d)*95.0);}
        float shimmer=0.93+0.07*sin(aSeed*90.0+uTime*0.48*(1.0-uReduced));
        vAlpha=(mix(0.06,2.1,aLand)*light*depth*(0.16+pow(aSeed,1.35)*1.2)+localLight*0.65*aLand)*front*shimmer;vSeed=aSeed;vSide=normal.x;
        gl_PointSize=uDpr*mix(1.1,2.15,aLand)*(0.7+aSeed*0.5)*clamp(2.5/-view.z,0.65,1.35);gl_Position=projectionMatrix*view;}`,
    fragmentShader:`varying float vAlpha; varying float vSeed; varying float vSide;
      void main(){float distance=length(gl_PointCoord-0.5);float dotShape=1.0-smoothstep(0.19,0.5,distance);
        vec3 green=mix(vec3(0.0,0.65,0.49),vec3(0.04,0.95,0.83),vSeed); green=mix(green,vec3(.08,.22,1.0),smoothstep(-.1,.75,vSide)*.85);
        if(vSeed>0.95)green=mix(green,vec3(0.79,0.97,0.89),0.6);gl_FragColor=vec4(green,vAlpha*dotShape);}`
  });materials.push(pointMaterial);
  const positions:number[]=[],seeds:number[]=[],kinds:number[]=[];
  land.forEach(([lon,lat],i)=>{if(constrained&&i%2)return;const noise=Math.sin(i*127.1)*43758.5453,seed=noise-Math.floor(noise);positions.push(...location(lon+(seed-.5)*.34,lat+Math.sin(i*3.71)*.16,1.003).toArray());seeds.push(seed);kinds.push(1);});
  for(let lat=-80;lat<85;lat+=constrained?4.5:3)for(let lon=-180;lon<180;lon+=3/Math.max(.2,Math.cos(lat*radians))){positions.push(...location(lon,lat,1.001).toArray());seeds.push(.3);kinds.push(0);}
  const particles=new THREE.BufferGeometry();geometries.push(particles);
  particles.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));particles.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));particles.setAttribute('aLand',new THREE.Float32BufferAttribute(kinds,1));earth.add(new THREE.Points(particles,pointMaterial));
  // Geographic outlines are real 3D line segments, occluded by the sphere.
  // A single draw call adds the reference's luminous coast detail without a texture.
  const coastPositions:number[]=[];
  coasts.forEach(ring=>{for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];if(Math.abs(a[0]-b[0])>180)continue;coastPositions.push(...location(a[0],a[1],1.006).toArray(),...location(b[0],b[1],1.006).toArray());}});
  const coastGeometry=new THREE.BufferGeometry();coastGeometry.setAttribute('position',new THREE.Float32BufferAttribute(coastPositions,3));geometries.push(coastGeometry);
  const coastMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:'varying float vFacing;varying float vSide;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vec3 n=normalize(normalMatrix*position);vFacing=dot(n,normalize(-p.xyz));vSide=n.x;gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying float vFacing;varying float vSide;void main(){vec3 c=mix(vec3(.0,.94,.69),vec3(.06,.26,1.),smoothstep(-.1,.8,vSide));float alpha=smoothstep(.0,.22,vFacing)*(.18+.48*max(vFacing,0.));gl_FragColor=vec4(c,alpha);}'
  });materials.push(coastMaterial);earth.add(new THREE.LineSegments(coastGeometry,coastMaterial));
  const sphereGeometry=new THREE.SphereGeometry(.995,64,48);geometries.push(sphereGeometry);
  const bodyMaterial=new THREE.ShaderMaterial({uniforms,
    vertexShader:'varying vec3 vNormal; varying vec3 vPosition; varying vec3 vSurface; void main(){vSurface=normalize(position);vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.0);vPosition=p.xyz;gl_Position=projectionMatrix*p;}',
    fragmentShader:`uniform vec3 uNodes[4];varying vec3 vNormal;varying vec3 vPosition;varying vec3 vSurface;
      void main(){vec3 normal=normalize(vNormal);float facing=max(dot(normal,normalize(-vPosition)),0.0);float rim=pow(1.0-facing,2.7);
        float light=max(dot(normal,normalize(vec3(-.65,.35,1.))),0.);float spill=0.0;
        for(int i=0;i<4;i++){vec3 d=normalize(vSurface)-uNodes[i];spill+=exp(-dot(d,d)*65.0);}
        vec3 color=vec3(.01,.017,.019)+vec3(.005,.13,.17)*rim*light+vec3(.003,.018,.012)*spill;
        gl_FragColor=vec4(color,1.0);}`
  });materials.push(bodyMaterial);earth.add(new THREE.Mesh(sphereGeometry,bodyMaterial));
  // A geometric, directionally lit atmosphere follows the sphere, not the DOM.
  const atmosphereGeometry=new THREE.SphereGeometry(1.018,48,32);geometries.push(atmosphereGeometry);
  const atmosphereMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uStrength:{value:constrained?.17:.38}},
    vertexShader:'varying vec3 vNormal;varying vec3 vPosition;void main(){vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vPosition=p.xyz;gl_Position=projectionMatrix*p;}',
    fragmentShader:`uniform float uStrength;varying vec3 vNormal;varying vec3 vPosition;
      void main(){vec3 n=normalize(vNormal);float facing=abs(dot(n,normalize(-vPosition)));float rim=pow(1.0-facing,2.3)*smoothstep(0.0,.36,facing);
        float light=.22+.78*max(dot(n,normalize(vec3(-.8,.1,1.))),0.);gl_FragColor=vec4(.015,.75,.9,rim*light*uStrength);}`
  });materials.push(atmosphereMaterial);earth.add(new THREE.Mesh(atmosphereGeometry,atmosphereMaterial));
  // Broad additive falloff blooms bright nodes without glowing every surface dot.
  const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;
  const ctx=glowCanvas.getContext('2d')!,gradient=ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(246,255,251,1)');gradient.addColorStop(.04,'rgba(232,255,247,.94)');gradient.addColorStop(.12,'rgba(155,255,211,.68)');gradient.addColorStop(.27,'rgba(58,247,159,.24)');gradient.addColorStop(.52,'rgba(30,213,126,.06)');gradient.addColorStop(.76,'rgba(14,140,95,.012)');gradient.addColorStop(1,'rgba(14,140,95,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);const glow=new THREE.CanvasTexture(glowCanvas);textures.push(glow);
  const nodes=coordinates.map(([lon,lat],i)=>{
    const selected=highlighted.has(i),material=new THREE.SpriteMaterial({map:glow,color:i%4===3?0x36aaff:0x38ffca,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true});materials.push(material);
    const sprite=new THREE.Sprite(material);sprite.position.copy(location(lon,lat,1.014));earth.add(sprite);
    const haloMaterial=material.clone();materials.push(haloMaterial);const halo=new THREE.Sprite(haloMaterial);halo.position.copy(sprite.position);halo.scale.setScalar(selected?.29:.17);earth.add(halo);
    return {sprite,material,halo,haloMaterial,selected,phase:i*.86};
  });
  const pairs=network?network.edges.map(e=>[mapped.findIndex(n=>n.id===e.source),mapped.findIndex(n=>n.id===e.target)]).filter(([a,b])=>a>=0&&b>=0&&a!==b).slice(0,30):[];
  const routes=pairs.map(([a,b],i)=>{
    const start=nodes[a].sprite.position.clone().normalize(),end=nodes[b].sprite.position.clone().normalize(),angle=start.angleTo(end),path:THREE.Vector3[]=[];
    for(let j=0;j<=80;j++){const t=j/80,v=start.clone().multiplyScalar(Math.sin((1-t)*angle)).addScaledVector(end,Math.sin(t*angle)).divideScalar(Math.sin(angle));path.push(v.normalize().multiplyScalar(1.008+Math.sin(Math.PI*t)*Math.min(.065+(i%4)*.025,angle*.13)));}
    const geometry=new THREE.BufferGeometry().setFromPoints(path);geometries.push(geometry);const selected=[0,2,5,8].includes(i),material=new THREE.LineBasicMaterial({color:i%3===0?0x158fff:selected?0x18ead9:0x16bfa2,transparent:true,opacity:selected?.63:.24,depthWrite:false});materials.push(material);earth.add(new THREE.Line(geometry,material));
    const pulseMaterial=new THREE.SpriteMaterial({map:glow,color:0xe5fff0,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});materials.push(pulseMaterial);const pulse=new THREE.Sprite(pulseMaterial);pulse.scale.setScalar(.058);pulse.visible=false;earth.add(pulse);
    const trailMaterial=pulseMaterial.clone();materials.push(trailMaterial);const trail=new THREE.Sprite(trailMaterial);trail.scale.setScalar(.045);trail.visible=false;earth.add(trail);
    return {path,pulse,trail,trailMaterial,material:pulseMaterial,offset:i*2.85,enabled:selected||i===9};
  });
  for(let ring=0;ring<2;ring++){const points=Array.from({length:181},(_,i)=>new THREE.Vector3(Math.cos(i*Math.PI/90)*1.18,0,Math.sin(i*Math.PI/90)*1.18));const geometry=new THREE.BufferGeometry().setFromPoints(points);geometries.push(geometry);const material=new THREE.LineBasicMaterial({color:0x1d7255,transparent:true,opacity:.025,depthWrite:false});materials.push(material);const line=new THREE.Line(geometry,material);line.rotation.set(ring?.5:-.42,0,ring?.25:-.15);earth.add(line);}
  let visible=true,dirty=true,elapsed=0,last=0,frameBudget=0,frames=0,windowStart=0,diagnosticTime=0;
  const world=new THREE.Vector3(),look=new THREE.Vector3(),normal=new THREE.Vector3();
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.set(0,0,3.9);camera.updateProjectionMatrix();dirty=true;};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;dirty=true;});intersection.observe(host);
  const preference=()=>{uniforms.uReduced.value=reduced.matches?1:0;dirty=true;};reduced.addEventListener('change',preference);
  host.dataset.renderer='three-webgl';host.dataset.particles=String(positions.length/3);host.dataset.mappedAgents=String(mapped.length);host.dataset.economicEdges=String(pairs.length);
  renderer.setAnimationLoop((now:number)=>{
    const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(!visible||document.hidden)return;if(reduced.matches&&!dirty)return;
    // Keep the GPU near 60 FPS even on high-refresh monitors; motion uses elapsed time.
    if(!reduced.matches){elapsed+=dt;frameBudget+=dt;if(frameBudget<1/60&&!dirty)return;frameBudget%=1/60;}
    earth.rotation.y=-.43+elapsed*.006;uniforms.uTime.value=elapsed;earth.updateMatrixWorld(true);let pulses=0;
    nodes.forEach(({sprite,material,halo,haloMaterial,selected,phase})=>{sprite.getWorldPosition(world);look.copy(camera.position).sub(world).normalize();const facing=normal.copy(world).normalize().dot(look),breath=reduced.matches?0:Math.sin(elapsed*.72+phase),visibility=THREE.MathUtils.smoothstep(facing,.01,.4);material.opacity=visibility*(selected?.92:.38)*(1+breath*.12);sprite.scale.setScalar((selected?.135:.1)+breath*.007);haloMaterial.opacity=visibility*(selected?.16:.04)*(constrained?.65:1)*(1+breath*.18);halo.scale.setScalar((selected?.29:.17)+breath*.012);});
    routes.forEach(route=>{const phase=(elapsed+route.offset)%17.5,progress=phase/3.1;route.pulse.visible=!reduced.matches&&route.enabled&&progress<1;route.trail.visible=route.pulse.visible&&progress>.035;if(route.pulse.visible){const index=progress*80,low=Math.floor(index);route.pulse.position.copy(route.path[low]).lerp(route.path[Math.min(80,low+1)],index-low);route.material.opacity=Math.sin(progress*Math.PI)*.95;if(route.trail.visible){const tail=Math.max(0,index-2.3),t=Math.floor(tail);route.trail.position.copy(route.path[t]).lerp(route.path[Math.min(80,t+1)],tail-t);route.trailMaterial.opacity=route.material.opacity*.24;}route.pulse.getWorldPosition(world);look.copy(camera.position).sub(world).normalize();if(normal.copy(world).normalize().dot(look)>.1)pulses++;}});
    renderer.render(scene,camera);dirty=false;frames++;
    if(now-diagnosticTime>1000){host.dataset.rotation=earth.rotation.y.toFixed(5);host.dataset.pulses=String(pulses);host.dataset.nodeGlow=((nodes[1]||nodes[0])?.material.opacity||0).toFixed(3);host.dataset.fps=String(Math.round(frames*1000/Math.max(1,now-windowStart)));frames=0;windowStart=now;diagnosticTime=now;}
  });
  return()=>{renderer.setAnimationLoop(null);observer.disconnect();intersection.disconnect();reduced.removeEventListener('change',preference);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
}



