export type WorkspaceMode='IDLE'|'SEARCH'|'FETCH'|'BROWSER'|'ANALYSIS'|'SUPPLIER'|'SYNTHESIS'|'OUTPUT'|'ERROR';
export function screenSession(view:any,selected=false){
 const o=view.operation,frames=(o?.captures||[]).filter((c:any)=>c.runId===o.runId);
 if(frames.length||o?.browser?.state==='RUNNING')return {jobId:o.id,runId:o.runId,captures:frames,browser:o.browser,private:o.privateEvidence,live:!o.privateEvidence&&o.status==='running'&&o.browser?.state==='RUNNING'};
 if(selected)return null;
 return view.lastBrowserSession?{...view.lastBrowserSession,live:false,browser:null}:null;
}
export function workspaceMode(view:any,selected=false,justCompleted=false):WorkspaceMode{
 const o=view.operation;if(!o||o.status==='waiting')return 'IDLE';
 if(!['running','queued'].includes(o.status)){if(!selected&&!justCompleted)return 'IDLE';return o.status==='succeeded'?'OUTPUT':'ERROR';}
 if(o.status==='queued')return o.error?'ERROR':'IDLE';
 if(o.stage==='WAITING FOR SUPPLIER')return 'SUPPLIER';
 if(['SYNTHESIZING','OUTPUT READY'].includes(o.stage))return 'SYNTHESIS';
 if(o.stage==='BROWSER')return 'BROWSER';if(o.stage==='SOURCE INSPECTION')return 'FETCH';if(o.stage==='SEARCH')return 'SEARCH';return 'ANALYSIS';
}
const labels:Record<string,string>={COIN_WAITING:'Waiting for new work',MISSION_STARTED:'Mission started',SERVICE_STARTED:'Service started',SEARCH_COMPLETED:'Search complete',EVIDENCE_FILTERED:'Evidence organized',DECISION_RECORDED:'Supplier decision',SUPPLIER_HIRED:'Supplier hired',SUPPLIER_COMPLETED:'Supplier delivered',SUPPLIER_FAILED:'Supplier failed',SYNTHESIS_STARTED:'Final synthesis',JOB_COMPLETED:'Output ready',JOB_FAILED:'Operation failed',JOB_CANCELLED:'Operation cancelled',SOURCE_FETCHED:'Source inspected',SOURCE_FAILED:'Source unavailable',BROWSER_COMPLETED:'Browser inspection complete'};
export function timelineMilestones(events:any[]){const rows:any[]=[];for(const e of events){if(!labels[e.type])continue;const previous=rows.at(-1);if(previous&&['SOURCE_FETCHED','SOURCE_FAILED','SEARCH_COMPLETED'].includes(e.type)&&previous.type===e.type&&previous.runId===e.runId){previous.children.push(e);previous.count=previous.children.length;previous.summary=e.type==='SEARCH_COMPLETED'?previous.children.reduce((n:number,r:any)=>n+(r.data.count||0),0)+' source results across '+previous.count+' searches.':previous.count+' source inspections recorded.';continue;}rows.push({...e,summary:e.type==='EVIDENCE_FILTERED'?`${e.data.before??e.data.count} source candidates → ${e.data.count} unique sources.`:e.summary,label:labels[e.type],children:[e],count:1});}return rows;}
export function conciseMission(text:string,limit=135){if(text.length<=limit)return text;const first=text.split(/(?<=[.!?])\s+/)[0];return first.length<=limit?first:text.slice(0,limit).replace(/\s+\S*$/,'')+'…';}
