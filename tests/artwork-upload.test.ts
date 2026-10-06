import {it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {optimizeArtwork} from '../packages/core/artwork-upload';
import {ARTWORK_MAX_BYTES} from '../packages/core/artwork-limits';

it('accepts detailed artwork above the former limit and preserves a larger rendition',async()=>{
  const source=await sharp(randomBytes(1200*800*3),{raw:{width:1200,height:800,channels:3}}).png().toBuffer();
  expect(source.length).toBeGreaterThan(262144);
  const result=await optimizeArtwork(source,'image/png'),meta=await sharp(result).metadata();
  expect(result.length).toBeLessThanOrEqual(262144);
  expect(meta.format).toBe('webp');expect(meta.width).toBeGreaterThan(128);
  expect(meta.width!/meta.height!).toBeCloseTo(1.5,2);expect(meta.exif).toBeUndefined();
});
it('preserves transparency and does not enlarge small images',async()=>{
  const source=await sharp({create:{width:80,height:40,channels:4,background:'#00000000'}}).png().toBuffer();
  expect(await sharp(await optimizeArtwork(source,'image/png')).metadata()).toMatchObject({width:80,height:40,hasAlpha:true});
});
it('rejects oversize files, corrupt images and disguised SVG',async()=>{
  await expect(optimizeArtwork(Buffer.alloc(ARTWORK_MAX_BYTES+1),'image/png')).rejects.toThrow('10 MB');
  await expect(optimizeArtwork(Buffer.from('broken'),'image/jpeg')).rejects.toThrow('could not be processed');
  await expect(optimizeArtwork(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>'),'image/png')).rejects.toThrow('could not be processed');
});
