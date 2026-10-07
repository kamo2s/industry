import {it,expect} from 'vitest';
import {agentSchema} from '../packages/core';
import {newLaunchDraft} from '../packages/core/launch-defaults';
import {pumpLaunchView} from '../packages/core/pump-launch-view';
import {metadataReference,metadataLaunchId,quoteInitialBuy} from '../packages/pump/initial-buy';
const op={id:'id',mint:'mint',network:'mainnet-beta',signature:'sig'};
it('only reports success after verified activation and exposes receipts for chain-confirmed tokens',()=>{
 for(const status of ['created','prepared','submitted','unknown','failed','expired','confirmed'])expect(pumpLaunchView({...op,status}).complete).toBe(false);
 const confirmed=pumpLaunchView({...op,status:'confirmed'});expect(confirmed.title).toContain('finishing setup');expect(confirmed.waiting).toBe(true);expect(confirmed.pumpUrl).toBe('https://pump.fun/coin/mint');
 const verified=pumpLaunchView({...op,status:'verified',result:{slug:'signal'}});expect(verified.complete).toBe(true);expect(verified.transactionUrl).toBe('https://solscan.io/tx/sig');expect(verified.waiting).toBe(false);
 expect(pumpLaunchView({...op,status:'prepared'}).pumpUrl).toBeNull();expect(pumpLaunchView({...op,network:'devnet',status:'confirmed'}).pumpUrl).toBeNull();
});
it('round trips compact metadata IDs, keeps existing URLs and rejects noncanonical encodings',()=>{
 const id='99412704-3ddf-427d-b902-19534ccdd825';expect(metadataReference(id)).toHaveLength(22);expect(metadataLaunchId(metadataReference(id))).toBe(id);expect(metadataLaunchId(id)).toBe(id);
 for(const ref of ['../secrets','a'.repeat(22),'x','%00'])expect(()=>metadataLaunchId(ref)).toThrow();
});
it('rejects invalid purchase amounts before any provider request and zero skips quoting',async()=>{
 const draft={...newLaunchDraft(),name:'Test',ticker:'TEST',description:'Valid description',mission:'Valid mission'};
 for(const amount of [-1,NaN,Infinity,101,.0000000001]){await expect(quoteInitialBuy({} as any,amount)).rejects.toThrow();expect(agentSchema.safeParse({...draft,initialBuySol:amount}).success).toBe(false);}
 expect(await quoteInitialBuy({} as any,0)).toBeUndefined();
});
