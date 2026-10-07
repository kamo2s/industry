import {it,expect} from 'vitest';
import {Keypair} from '@solana/web3.js';
import {readFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {prepareCollectorKey} from '../packages/pump/key-file';
it('materializes only the configured operational signer and clears its environment value',async()=>{
 const key=Keypair.generate(),env={PUMP_COLLECTOR_KEYPAIR_JSON:JSON.stringify(Array.from(key.secretKey)),INDUSTRY_FEE_COLLECTOR:key.publicKey.toBase58()} as Record<string,string|undefined>;
 await prepareCollectorKey(env);
 try{expect(env.PUMP_COLLECTOR_KEYPAIR_JSON).toBeUndefined();expect(JSON.parse(await readFile(env.PUMP_COLLECTOR_KEYPAIR_FILE!,'utf8'))).toEqual(Array.from(key.secretKey));if(process.platform!=='win32')expect((await stat(env.PUMP_COLLECTOR_KEYPAIR_FILE!)).mode&0o777).toBe(0o600);}finally{await rm(path.dirname(env.PUMP_COLLECTOR_KEYPAIR_FILE!),{recursive:true,force:true});}
});
it('rejects malformed, mismatched and treasury keys without disclosing them',async()=>{
 const key=Keypair.generate();for(const raw of ['private-value','[1,2,3]',JSON.stringify(Array.from(key.secretKey))]){const env={PUMP_COLLECTOR_KEYPAIR_JSON:raw,INDUSTRY_FEE_COLLECTOR:Keypair.generate().publicKey.toBase58()};await expect(prepareCollectorKey(env)).rejects.toThrow('Collector key configuration is invalid');expect(env.PUMP_COLLECTOR_KEYPAIR_JSON).toBeUndefined();}
 const address=key.publicKey.toBase58();await expect(prepareCollectorKey({PUMP_COLLECTOR_KEYPAIR_JSON:JSON.stringify(Array.from(key.secretKey)),INDUSTRY_FEE_COLLECTOR:address,INDUSTRY_FEE_TREASURY:address})).rejects.toThrow('Collector key configuration is invalid');
});
it('preserves existing mounted-file configuration when no JSON secret exists',async()=>{const env={PUMP_COLLECTOR_KEYPAIR_FILE:'/run/secrets/collector.json'};await prepareCollectorKey(env);expect(env.PUMP_COLLECTOR_KEYPAIR_FILE).toBe('/run/secrets/collector.json');});
