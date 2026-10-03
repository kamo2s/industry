import { describe,it,expect } from 'vitest';
import { createRequire } from 'node:module';
import { assertDevnet,DEVNET_GENESIS } from '../packages/agent/solana';
import { compileSchema } from '../packages/db/economy';
import { DisabledX402Provider } from '../packages/agent/payments';
const bigint=createRequire(import.meta.url)('../packages/safe-bigint-buffer/index.cjs');
describe('provider guardrails',()=>{
  it('accepts only the exact full devnet genesis hash',async()=>{await expect(assertDevnet({getGenesisHash:async()=>DEVNET_GENESIS})).resolves.toBeUndefined();await expect(assertDevnet({getGenesisHash:async()=>DEVNET_GENESIS.slice(0,32)})).rejects.toThrow();await expect(assertDevnet({getGenesisHash:async()=>'mainnet'})).rejects.toThrow();});
  it('rejects x402 settlement while unconfigured',async()=>{await expect(new DisabledX402Provider().verifyAndSettle()).rejects.toThrow('not configured');});
  it('accepts custom object schemas without requiring a topic field',()=>{const validate=compileSchema({type:'object',properties:{claim:{type:'string'}},required:['claim'],additionalProperties:false});expect(validate({claim:'Some claim'})).toBe(true);expect(validate({topic:'wrong'})).toBe(false);});
  it('rejects untrusted regex and reference schemas',()=>{expect(()=>compileSchema({type:'object',properties:{x:{$ref:'https://example.com/schema'}}})).toThrow();expect(()=>compileSchema({type:'object',properties:{x:{type:'string',pattern:'(a+)+$'}}})).toThrow();});
  it.each([0n,1n,255n,65535n,18446744073709551615n])('round-trips Solana u64 %s without native bindings',n=>{expect(bigint.toBigIntLE(bigint.toBufferLE(n,8))).toBe(n);expect(bigint.toBigIntBE(bigint.toBufferBE(n,8))).toBe(n);});
  it('rejects integer buffer overflow and oversized allocations',()=>{expect(()=>bigint.toBufferLE(256n,1)).toThrow();expect(()=>bigint.toBufferBE(-1n,8)).toThrow();expect(()=>bigint.toBufferLE(0n,1000000)).toThrow();expect(()=>bigint.toBigIntLE(Buffer.alloc(5000))).toThrow();});
});
