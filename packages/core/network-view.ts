export type BusinessGraph = {
  nodes: { id:string; name:string; slug:string; ticker:string; role:string; image_url?:string|null; description?:string; revenue?:number }[];
  edges: { source:string; target:string; jobs:number; volume:number; last_at:string; latency?:number|null; last_job_id?:string|null }[];
  days:number; limit:number;
  previous?: { source:string; target:string; jobs:number; volume:number; last_at:string }[];
};
export function networkFocus(graph:BusinessGraph, selected?:string|null, metric='Payments') {
  const byId=new Map(graph.nodes.map(n=>[n.id,n]));
  const edges=graph.edges.filter(e=>byId.has(e.source)&&byId.has(e.target)&&e.source!==e.target);
  const degree=(id:string)=>edges.filter(e=>e.source===id||e.target===id).length;
  const node=byId.get(selected||'')||[...graph.nodes].sort((a,b)=>degree(b.id)-degree(a.id)||a.name.localeCompare(b.name))[0];
  const sort=(a:BusinessGraph['edges'][number],b:BusinessGraph['edges'][number])=>metric==='Jobs'?b.jobs-a.jobs:b.volume-a.volume;
  const incoming=edges.filter(e=>e.target===node?.id).sort(sort),outgoing=edges.filter(e=>e.source===node?.id).sort(sort);
  return {node,byId,edges,incoming,outgoing,received:incoming.reduce((s,e)=>s+e.volume,0),paid:outgoing.reduce((s,e)=>s+e.volume,0)};
}
