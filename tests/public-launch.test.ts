import {afterEach,it,expect,vi} from 'vitest';
import {Keypair} from '@solana/web3.js';
import {requirePumpLaunch} from '../packages/pump/config';
afterEach(()=>vi.unstubAllEnvs());
it('public access removes only the wallet allowlist, not mainnet approval or pause gates',()=>{
 const owner=Keypair.generate().publicKey.toBase58(),visitor=Keypair.generate().publicKey.toBase58();
 for(const [k,v] of Object.entries({PUMP_NETWORK:'mainnet-beta',APP_MODE:'live',PUMP_LAUNCH_ENABLED:'true',PUMP_MAINNET_LAUNCH_ENABLED:'true',PUMP_MAINNET_APPROVAL_REFERENCE:'owner-approved',INDUSTRY_FEE_TREASURY:Keypair.generate().publicKey.toBase58(),PUMP_LAUNCH_ALLOWLIST:owner,PUMP_PUBLIC_LAUNCH_ENABLED:'false'}))vi.stubEnv(k,v);
 expect(()=>requirePumpLaunch(owner)).not.toThrow();expect(()=>requirePumpLaunch(visitor)).toThrow('not approved');
 vi.stubEnv('PUMP_PUBLIC_LAUNCH_ENABLED','true');expect(()=>requirePumpLaunch(visitor)).not.toThrow();
 vi.stubEnv('PUMP_MAINNET_LAUNCH_ENABLED','false');expect(()=>requirePumpLaunch(visitor)).toThrow('approval');
 vi.stubEnv('PUMP_MAINNET_LAUNCH_ENABLED','true');vi.stubEnv('PUMP_LAUNCH_ENABLED','false');expect(()=>requirePumpLaunch(visitor)).toThrow('disabled');
});
