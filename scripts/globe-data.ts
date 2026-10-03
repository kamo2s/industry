import { feature } from 'topojson-client';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
const atlas=JSON.parse(await readFile('node_modules/world-atlas/land-110m.json','utf8'));
const land:any=feature(atlas,atlas.objects.land);
const geometry=land.type==='FeatureCollection'?land.features[0].geometry:land.geometry;
const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:[geometry.coordinates];
function ringContains(ring:number[][],x:number,y:number){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
const points:number[][]=[];
for(let lat=-76;lat<82;lat+=1.25)for(let lon=-180;lon<180;lon+=1.25/Math.max(0.25,Math.cos(lat*Math.PI/180))){const isLand=polygons.some((p:number[][][])=>ringContains(p[0],lon,lat)&&!p.slice(1).some(h=>ringContains(h,lon,lat)));if(isLand)points.push([Math.round(lon*100)/100,Math.round(lat*100)/100]);}
await mkdir('apps/web/public',{recursive:true});await writeFile('apps/web/public/earth-points.json',JSON.stringify(points));console.log(`Generated ${points.length} geographic land points from Natural Earth.`);
