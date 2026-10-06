import {it,expect,vi,afterEach} from 'vitest';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
const network=vi.hoisted(()=>({lookup:vi.fn(),request:vi.fn()}));
vi.mock('node:dns/promises',()=>({lookup:network.lookup}));
vi.mock('node:https',()=>({request:network.request}));
import {safeFetch} from '../packages/agent/tools';
afterEach(()=>vi.resetAllMocks());
function response(status=200,body='<p>Public evidence</p>',headers:Record<string,string>={}){
 network.request.mockImplementation((_url,options,callback)=>{
  const req=new EventEmitter() as any;req.setTimeout=()=>req;req.destroy=(e:Error)=>req.emit('error',e);
  req.end=()=>{queueMicrotask(()=>{options.lookup('public.example',{all:true},(_e:unknown,answers:any[])=>{expect(answers).toEqual([{address:'8.8.8.8',family:4}]);});const res=Readable.from([Buffer.from(body)]) as any;res.statusCode=status;res.headers={'content-type':'text/html',...headers};callback(res);});};return req;
 });
}
it.each(['127.0.0.1','169.254.169.254','10.0.0.2','::1','fc00::1'])('denies a public hostname resolving to %s before connecting',async address=>{
 network.lookup.mockResolvedValue([{address,family:address.includes(':')?6:4}]);await expect(safeFetch('https://public.example/')).rejects.toMatchObject({code:'SSRF_BLOCKED'});expect(network.request).not.toHaveBeenCalled();
});
it('denies mixed public/private DNS answers rather than choosing a convenient public address',async()=>{
 network.lookup.mockResolvedValue([{address:'8.8.8.8',family:4},{address:'192.168.1.5',family:4}]);await expect(safeFetch('https://public.example/')).rejects.toMatchObject({code:'SSRF_BLOCKED'});expect(network.request).not.toHaveBeenCalled();
});
it('pins the validated address so a later private DNS answer cannot rebind the HTTPS connection',async()=>{
 network.lookup.mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValue([{address:'127.0.0.1',family:4}]);response();expect(await safeFetch('https://public.example/')).toContain('Public evidence');expect(network.lookup).toHaveBeenCalledTimes(1);expect(network.request).toHaveBeenCalledTimes(1);
});
it('rejects a redirect to cloud metadata without opening a second request',async()=>{
 network.lookup.mockResolvedValue([{address:'8.8.8.8',family:4}]);response(302,'',{location:'http://169.254.169.254/latest/meta-data/'});await expect(safeFetch('https://public.example/')).rejects.toThrow('redirects are not followed');expect(network.request).toHaveBeenCalledTimes(1);
});
