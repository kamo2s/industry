import {it,expect,vi} from 'vitest';
import {createWatchlistCache} from '../apps/web/components/watchlist-cache';
it('coalesces concurrent directory stars, refreshes after mutation and isolates accounts',async()=>{
 const read=vi.fn(async()=>['business-1']),cache=createWatchlistCache(read);
 await Promise.all(Array.from({length:25},()=>cache.get('owner-a')));expect(read).toHaveBeenCalledTimes(1);
 await cache.get('owner-b');expect(read).toHaveBeenCalledTimes(2);
 cache.invalidate('owner-a');await cache.get('owner-a');expect(read).toHaveBeenCalledTimes(3);
 cache.invalidate();await cache.get('owner-b');expect(read).toHaveBeenCalledTimes(4);
});
it('does not preserve a failed watchlist read',async()=>{
 const read=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]),cache=createWatchlistCache(read);
 await expect(cache.get('a')).rejects.toThrow('offline');await expect(cache.get('a')).resolves.toEqual([]);expect(read).toHaveBeenCalledTimes(2);
});
