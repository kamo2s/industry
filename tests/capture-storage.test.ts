import {it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({getBucket:vi.fn(),upload:vi.fn(),from:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({storage:{getBucket:mocks.getBucket,from:mocks.from}})}));
vi.mock('../packages/agent/storage',()=>({storageConfigured:()=>true}));
import {captureStore} from '../packages/agent/capture-storage';
afterEach(()=>{vi.clearAllMocks();});
it('refuses capture uploads when a configured bucket is public or cannot be verified',async()=>{
 mocks.getBucket.mockResolvedValueOnce({data:{public:true},error:null}).mockResolvedValueOnce({data:null,error:{message:'Unavailable'}});
 for(let i=0;i<2;i++)await expect(captureStore.put('12345678-1234-1234-1234-123456789012',Buffer.from('pixels'))).rejects.toMatchObject({code:'CAPTURE_STORAGE'});
 expect(mocks.from).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
});
it('uploads captures only to a verified private bucket with non-public cache settings',async()=>{
 mocks.getBucket.mockResolvedValue({data:{public:false},error:null});mocks.from.mockReturnValue({upload:mocks.upload});mocks.upload.mockResolvedValue({error:null});
 const stored=await captureStore.put('12345678-1234-1234-1234-123456789012',Buffer.from('pixels'));
 expect(mocks.getBucket).toHaveBeenCalledWith('browser-captures');expect(mocks.from).toHaveBeenCalledWith('browser-captures');
 expect(mocks.upload).toHaveBeenCalledWith(stored.path,expect.any(Buffer),{contentType:'image/webp',upsert:false,cacheControl:'0'});expect(stored.kind).toBe('supabase');
});
