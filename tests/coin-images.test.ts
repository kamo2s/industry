import {describe,it,expect,vi} from 'vitest';
import sharp from 'sharp';
import {coinThumbnail} from '../packages/core/coin-thumbnail';
import {coinImageSources,safeCoinImageUrl,coinInitials,trustedCoinThumbnail} from '../packages/core/coin-images';
const upload='/api/uploads/12345678-1234-1234-1234-123456789abc';
describe('coin identity and thumbnail trust',()=>{
 it('gives directory cards upload priority without changing profile or network priority',()=>{
  const row={official:true,verified_at:'now',token_image:'https://assets.example.com/token.png',icon_url:upload};
  expect(coinImageSources(row,true)[0].url).toBe(upload);expect(coinImageSources(row)[0].url).toBe(row.token_image);
 });
 it('separates card resolution from graph thumbnails and never enlarges a small original',async()=>{
  const input=await sharp({create:{width:800,height:800,channels:4,background:'#46809a'}}).png().toBuffer(),read=vi.fn(async()=>input),sources=[{kind:'image' as const,url:'/api/uploads/12345678-1234-1234-1234-123456789111'}];
  expect(await sharp((await coinThumbnail(sources,read,512))!).metadata()).toMatchObject({width:512,height:512});
  expect(await sharp((await coinThumbnail(sources,read))!).metadata()).toMatchObject({width:128,height:128});expect(read).toHaveBeenCalledTimes(2);
  const small=await sharp(input).resize(64,64).png().toBuffer();
  const validSmall=await coinThumbnail([{kind:'image',url:'/api/uploads/12345678-1234-1234-1234-123456789112'}],async()=>small,512);expect(await sharp(validSmall!).metadata()).toMatchObject({width:64,height:64});
 });
 it('prioritizes official metadata, the verified token, then the same business upload',()=>{
  const sources=coinImageSources({official:true,verified_at:'now',token_image:'https://assets.example.com/radar.png',metadata_uri:'https://assets.example.com/radar.json',pump_icon:'87654321-1234-1234-1234-123456789abc',icon_url:upload});
  expect(sources.map(s=>s.url)).toEqual(['https://assets.example.com/radar.png','/api/uploads/87654321-1234-1234-1234-123456789abc','https://assets.example.com/radar.json',upload]);
  expect(coinImageSources({token_image:'https://assets.example.com/unverified.png',icon_url:upload})).toEqual([{kind:'image',url:upload}]);
 });
 it('rejects executable, local-network and credential-bearing URLs before rendering',()=>{
  for(const url of ['javascript:alert(1)','data:image/svg+xml,x','//example.com/a','http://example.com/a','https://localhost/a','https://10.0.0.1/a','https://[::1]/a','https://a.internal/x','https://a.local/x','https://user:pass@example.com/a','https://example.com:8000/a','/api/uploads/../../auth/session'])expect(safeCoinImageUrl(url),url).toBeNull();
  expect(safeCoinImageUrl('ipfs://bafy-test/image.png')).toBe('https://ipfs.io/ipfs/bafy-test/image.png');
  expect(trustedCoinThumbnail('https://assets.example.com/a.png')).toBeNull();expect(trustedCoinThumbnail(upload)).toBe(upload);
 });
 it('uses ticker initials and never a profession or another coin',()=>{
  expect(coinInitials('$RADAR')).toBe('RA');expect(coinInitials('💎')).toBe('IN');expect(coinImageSources({})).toEqual([]);
 });
 it('decodes local images into bounded WebP thumbnails, shares requests, and caches the result',async()=>{
  const input=await sharp({create:{width:512,height:256,channels:4,background:'#46b98a'}}).png().toBuffer(),read=vi.fn(async()=>input);
  const sources=[{kind:'image' as const,url:upload}];
  const [a,b]=await Promise.all([coinThumbnail(sources,read),coinThumbnail(sources,read)]);
  expect(a).toEqual(b);expect(read).toHaveBeenCalledTimes(1);expect(await sharp(a!).metadata()).toMatchObject({width:128,height:128,format:'webp'});
  await coinThumbnail(sources,read);expect(read).toHaveBeenCalledTimes(1);
 });
 it('does not decode executable or corrupted images',async()=>{
  const result=await coinThumbnail([{kind:'image',url:'/api/uploads/98765432-1234-1234-1234-123456789abc'}],async()=>Buffer.from('<svg onload="alert(1)"></svg>'));
  expect(result).toBeNull();
 });
});

