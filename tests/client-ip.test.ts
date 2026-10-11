import {describe,it,expect} from 'vitest';
import {clientIp} from '../packages/core/client-ip';
describe('trusted ingress visitor identity',()=>{
 it('uses only the configured ingress header',()=>{
  const h=new Headers({'x-real-ip':'203.0.113.9','x-forwarded-for':'1.2.3.4','cf-connecting-ip':'5.6.7.8'});
  expect(clientIp(h,'x-real-ip')).toBe('203.0.113.9');
  expect(clientIp(new Headers({'x-real-ip':'203.0.113.10'}),'x-real-ip')).not.toBe(clientIp(h,'x-real-ip'));
 });
 it('fails closed on missing, malformed, or multiple addresses',()=>{
  for(const value of ['', 'unknown','127.0.0.1, 203.0.113.9','1.2.3.999','https://example.com'])expect(clientIp(new Headers({'x-real-ip':value}),'x-real-ip')).toBeNull();
  expect(clientIp(new Headers({'x-forwarded-for':'203.0.113.9'}),'x-real-ip')).toBeNull();
 });
 it('canonicalizes IPv6 identities',()=>{
  expect(clientIp(new Headers({'x-real-ip':'2001:0db8:0000:0000:0000:0000:0000:0001'}),'x-real-ip')).toBe('2001:db8::1');
 });
});
