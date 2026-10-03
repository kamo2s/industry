import { describe,it,expect } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { lifecycle,authorizePurchase,defaultPolicy,retryDelay,agentSchema,micro,usd } from '../packages/core';
import { encryptSecret,decryptSecret,verifySignature } from '../packages/core/security';
import { publicIP,safeFetch,executeTool } from '../packages/agent/tools';
const metrics={paused:false,runs:1,balance:100000,nextCost:1000,revenue7d:20,cost7d:10,externalPaidJobs:3};
describe('economic lifecycle',()=>{
  it('requires three external completed paid jobs',()=>{expect(lifecycle(metrics)).toBe('SELF-SUSTAINING');expect(lifecycle({...metrics,externalPaidJobs:2})).toBe('ACTIVE');});
  it('owner funding alone cannot become revenue',()=>expect(lifecycle({...metrics,balance:100000000,revenue7d:0,externalPaidJobs:0})).toBe('ACTIVE'));
  it('prioritizes pause, insolvency, boot and low compute',()=>{expect(lifecycle({...metrics,paused:true})).toBe('DORMANT');expect(lifecycle({...metrics,balance:999})).toBe('DORMANT');expect(lifecycle({...metrics,runs:0})).toBe('BOOTING');expect(lifecycle({...metrics,balance:2500})).toBe('LOW COMPUTE');});
  it('uses integer micro-USDC arithmetic',()=>expect(micro(.004)+micro(.003)).toBe(micro(usd(7000))));
});
describe('server spending policy',()=>{
  const policy={...defaultPolicy,autoHire:true};
  const context={amount:4000,balance:100000,spentToday:0,purchasesToday:0,purchasesRun:0,spentRun:0,category:'Research',network:'sandbox',emergency:false,paused:false};
  it('accepts an in-policy purchase',()=>expect(()=>authorizePurchase(policy,context)).not.toThrow());
  it.each([{network:'mainnet'},{emergency:true},{paused:true},{amount:500001},{balance:1},{spentToday:1000000},{purchasesToday:10},{purchasesRun:1},{spentRun:20000}])('rejects out-of-policy purchase %j',change=>expect(()=>authorizePurchase(policy,{...context,...change})).toThrow());
  it('rejects disallowed categories and disabled hiring',()=>{expect(()=>authorizePurchase({...policy,preferredCategories:['Data']},context)).toThrow();expect(()=>authorizePurchase({...policy,autoHire:false},context)).toThrow();});
  it('bounds exponential backoff',()=>{expect(retryDelay(1)).toBe(2);expect(retryDelay(3)).toBe(8);expect(retryDelay(20)).toBe(300);});
});
describe('security boundaries',()=>{
  it.each(['127.0.0.1','10.2.3.4','169.254.169.254','172.31.1.1','192.168.1.1','100.64.0.1','0.0.0.0','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1','2002:7f00:1::'])('blocks private/special address %s',ip=>expect(publicIP(ip)).toBe(false));
  it('permits public addresses',()=>{expect(publicIP('8.8.8.8')).toBe(true);expect(publicIP('2606:4700:4700::1111')).toBe(true);});
  it('blocks dangerous URL schemes before making requests',async()=>{await expect(safeFetch('file:///etc/passwd')).rejects.toThrow();await expect(safeFetch('https://localhost')).rejects.toThrow();await expect(safeFetch('https://user:secret@example.com')).rejects.toThrow();});
  it('enforces tool allowlists independently of content',async()=>{await expect(executeTool('http',{url:'https://example.com'},{tools:[]})).rejects.toThrow('not enabled');});
  it('verifies message signatures and rejects mutation',()=>{const key=nacl.sign.keyPair(),message='domain nonce expires';const signature=bs58.encode(nacl.sign.detached(new TextEncoder().encode(message),key.secretKey));expect(verifySignature(bs58.encode(key.publicKey),message,signature)).toBe(true);expect(verifySignature(bs58.encode(key.publicKey),message+'!',signature)).toBe(false);});
  it('encrypts signer material with authenticated encryption',()=>{process.env.WALLET_ENCRYPTION_KEY='4'.repeat(64);const input=new Uint8Array([1,2,3]);const encrypted=encryptSecret(input);expect([...decryptSecret(encrypted)]).toEqual([...input]);expect(encrypted).not.toContain('1,2,3');expect(()=>decryptSecret(encrypted.slice(0,-3)+'abc')).toThrow();});
  it('rejects missing identity and unsafe unknown fields',()=>{expect(agentSchema.safeParse({name:'x',privateKey:'do-not-accept'}).success).toBe(false);});
});
