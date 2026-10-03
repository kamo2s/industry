import * as THREE from 'three';

// Every continent dot, node and connection is positioned in 3D. No map image or
// reference screenshot is used. One point draw call handles the land surface.
export function createNetworkGlobe(host:HTMLDivElement,land:number[][]){
  const constrained=host.clientWidth<500||navigator.hardwareConcurrency<6;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio,constrained?1.25:1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.1,20);
  const earth=new THREE.Group();earth.rotation.set(.08,-.43,-.18);scene.add(earth);
  const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[];
  const radians=Math.PI/180;
  function location(lon:number,lat:number,r=1){const p=lat*radians,l=lon*radians;return new THREE.Vector3(Math.cos(p)*Math.sin(l),Math.sin(p),Math.cos(p)*Math.cos(l)).multiplyScalar(r);}
  const uniforms={uTime:{value:0},uDpr:{value:renderer.getPixelRatio()},uReduced:{value:reduced.matches?1:0}};
  const pointMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float uTime; uniform float uDpr; uniform float uReduced;
      attribute float aSeed; attribute float aLand; varying float vAlpha; varying float vSeed;
      void main(){vec4 view=modelViewMatrix*vec4(position,1.0);vec3 normal=normalize(normalMatrix*position);
        float facing=dot(normal,normalize(-view.xyz));float front=smoothstep(-0.06,0.6,facing);
        float light=0.32+0.68*max(0.0,dot(normal,normalize(vec3(-0.4,0.65,1.0))));
        float shimmer=0.89+0.11*sin(aSeed*90.0+uTime*0.55*(1.0-uReduced));
        vAlpha=mix(0.055,0.7,aLand)*front*light*shimmer*(0.18+pow(aSeed,1.5)*1.15);vSeed=aSeed;
        gl_PointSize=uDpr*mix(1.2,1.8,aLand)*(0.7+aSeed*0.5)*clamp(2.5/-view.z,0.65,1.35);gl_Position=projectionMatrix*view;}`,
    fragmentShader:`varying float vAlpha; varying float vSeed;
      void main(){float distance=length(gl_PointCoord-0.5);float dotShape=1.0-smoothstep(0.19,0.5,distance);
        vec3 green=mix(vec3(0.06,0.53,0.39),vec3(0.37,0.86,0.65),vSeed);
        if(vSeed>0.97)green=mix(green,vec3(0.71,0.96,0.88),0.65);gl_FragColor=vec4(green,vAlpha*dotShape);}`
  });materials.push(pointMaterial);
  const positions:number[]=[],seeds:number[]=[],kinds:number[]=[];
  land.forEach(([lon,lat],i)=>{if(constrained&&i%2)return;const noise=Math.sin(i*127.1)*43758.5453,seed=noise-Math.floor(noise);positions.push(...location(lon+(seed-.5)*.34,lat+Math.sin(i*3.71)*.16,1.003).toArray());seeds.push(seed);kinds.push(1);});
  for(let lat=-80;lat<85;lat+=constrained?4.5:3)for(let lon=-180;lon<180;lon+=3/Math.max(.2,Math.cos(lat*radians))){positions.push(...location(lon,lat,1.001).toArray());seeds.push(.3);kinds.push(0);}
  const particles=new THREE.BufferGeometry();geometries.push(particles);
  particles.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));particles.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));particles.setAttribute('aLand',new THREE.Float32BufferAttribute(kinds,1));earth.add(new THREE.Points(particles,pointMaterial));
  const sphereGeometry=new THREE.SphereGeometry(.995,64,48);geometries.push(sphereGeometry);
  const bodyMaterial=new THREE.ShaderMaterial({
    vertexShader:'varying vec3 vNormal; varying vec3 vPosition; void main(){vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.0);vPosition=p.xyz;gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 vNormal;varying vec3 vPosition;void main(){float rim=pow(1.0-max(dot(vNormal,normalize(-vPosition)),0.0),3.0);float light=max(dot(vNormal,normalize(vec3(-.5,.6,1.))),0.);gl_FragColor=vec4(vec3(.009,.016,.015)+vec3(.005,.018,.015)*rim+vec3(.001,.004,.003)*light,1.0);}'
  });materials.push(bodyMaterial);earth.add(new THREE.Mesh(sphereGeometry,bodyMaterial));
  // Broad additive falloff blooms bright nodes without glowing every surface dot.
  const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;
  const ctx=glowCanvas.getContext('2d')!,gradient=ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(215,255,234,1)');gradient.addColorStop(.07,'rgba(148,255,212,.98)');gradient.addColorStop(.19,'rgba(54,250,160,.52)');gradient.addColorStop(.42,'rgba(30,213,126,.14)');gradient.addColorStop(1,'rgba(14,140,95,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);const glow=new THREE.CanvasTexture(glowCanvas);textures.push(glow);
  const coordinates=[[-14,8],[8,14],[36,15],[54,1],[3,5],[31,6],[101,3],[-49,-17],[-74,41]];
  const nodes=coordinates.map(([lon,lat],i)=>{const material=new THREE.SpriteMaterial({map:glow,color:0xb3ffe2,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true});materials.push(material);const sprite=new THREE.Sprite(material);sprite.position.copy(location(lon,lat,1.015));sprite.scale.setScalar(.17);earth.add(sprite);return {sprite,material,phase:i*.86};});
  const pairs=[[0,1],[0,4],[1,2],[1,4],[2,3],[2,5],[3,4],[3,6],[4,5],[4,7],[0,8],[5,6]];
  const routes=pairs.map(([a,b],i)=>{
    const start=nodes[a].sprite.position.clone().normalize(),end=nodes[b].sprite.position.clone().normalize(),angle=start.angleTo(end),path:THREE.Vector3[]=[];
    for(let j=0;j<=80;j++){const t=j/80,v=start.clone().multiplyScalar(Math.sin((1-t)*angle)).addScaledVector(end,Math.sin(t*angle)).divideScalar(Math.sin(angle));path.push(v.normalize().multiplyScalar(1.008+Math.sin(Math.PI*t)*Math.min(.16,angle*.13)));}
    const geometry=new THREE.BufferGeometry().setFromPoints(path);geometries.push(geometry);const material=new THREE.LineBasicMaterial({color:i%4===0?0x73d1b3:0x2f9e77,transparent:true,opacity:i%3===0?.23:.13,depthWrite:false});materials.push(material);earth.add(new THREE.Line(geometry,material));
    const pulseMaterial=new THREE.SpriteMaterial({map:glow,color:0xc5ffe5,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});materials.push(pulseMaterial);const pulse=new THREE.Sprite(pulseMaterial);pulse.scale.setScalar(.065);pulse.visible=false;earth.add(pulse);return {path,pulse,material:pulseMaterial,offset:i*2.13};
  });
  for(let ring=0;ring<2;ring++){const points=Array.from({length:181},(_,i)=>new THREE.Vector3(Math.cos(i*Math.PI/90)*1.18,0,Math.sin(i*Math.PI/90)*1.18));const geometry=new THREE.BufferGeometry().setFromPoints(points);geometries.push(geometry);const material=new THREE.LineBasicMaterial({color:0x1d7255,transparent:true,opacity:.075,depthWrite:false});materials.push(material);const line=new THREE.Line(geometry,material);line.rotation.set(ring?.5:-.42,0,ring?.25:-.15);earth.add(line);}
  let visible=true,dirty=true,elapsed=0,last=0,frameBudget=0,frames=0,windowStart=0,diagnosticTime=0;
  const world=new THREE.Vector3(),look=new THREE.Vector3(),normal=new THREE.Vector3();
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.set(0,0,w<500?3.9:3.05);camera.updateProjectionMatrix();dirty=true;};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;dirty=true;});intersection.observe(host);
  const preference=()=>{uniforms.uReduced.value=reduced.matches?1:0;dirty=true;};reduced.addEventListener('change',preference);
  host.dataset.renderer='three-webgl';host.dataset.particles=String(positions.length/3);
  renderer.setAnimationLoop((now:number)=>{
    const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(!visible||document.hidden)return;if(reduced.matches&&!dirty)return;
    // Keep the GPU near 60 FPS even on high-refresh monitors; motion uses elapsed time.
    if(!reduced.matches){elapsed+=dt;frameBudget+=dt;if(frameBudget<1/60&&!dirty)return;frameBudget%=1/60;}
    earth.rotation.y=-.43+elapsed*.006;uniforms.uTime.value=elapsed;earth.updateMatrixWorld(true);let pulses=0;
    nodes.forEach(({sprite,material,phase})=>{sprite.getWorldPosition(world);look.copy(camera.position).sub(world).normalize();const facing=normal.copy(world).normalize().dot(look);material.opacity=THREE.MathUtils.smoothstep(facing,.01,.32)*(.8+Math.sin(elapsed*.85+phase)*.12);sprite.scale.setScalar(.16+(reduced.matches?0:Math.sin(elapsed*.85+phase)*.012));});
    routes.forEach(route=>{const phase=(elapsed+route.offset)%19,progress=phase/2.6;route.pulse.visible=!reduced.matches&&progress<1;if(route.pulse.visible){const index=progress*80,low=Math.floor(index);route.pulse.position.copy(route.path[low]).lerp(route.path[Math.min(80,low+1)],index-low);route.material.opacity=Math.sin(progress*Math.PI)*.85;pulses++;}});
    renderer.render(scene,camera);dirty=false;frames++;
    if(now-diagnosticTime>1000){host.dataset.rotation=earth.rotation.y.toFixed(5);host.dataset.pulses=String(pulses);host.dataset.fps=String(Math.round(frames*1000/Math.max(1,now-windowStart)));frames=0;windowStart=now;diagnosticTime=now;}
  });
  return()=>{renderer.setAnimationLoop(null);observer.disconnect();intersection.disconnect();reduced.removeEventListener('change',preference);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
}
