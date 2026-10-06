// Natural Earth coastline geometry from the existing world-atlas dependency.
import {feature} from 'topojson-client';import {readFile,writeFile} from 'node:fs/promises';
const atlas=JSON.parse(await readFile('node_modules/world-atlas/land-110m.json','utf8'));const data:any=feature(atlas,atlas.objects.land);const geometry=data.type==='FeatureCollection'?data.features[0].geometry:data.geometry;const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:[geometry.coordinates];
await writeFile('apps/web/public/earth-coasts.json',JSON.stringify(polygons.map((p:number[][][])=>p[0].map(([lon,lat])=>[Math.round(lon*100)/100,Math.round(lat*100)/100]))));
