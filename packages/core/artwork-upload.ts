import sharp from 'sharp';
import {AppError} from './index';
import {ARTWORK_MAX_BYTES,ARTWORK_TYPES,ARTWORK_UPLOAD_HELP} from './artwork-limits';

/** Accept large source artwork; retain a safe, metadata-free web rendition. */
export async function optimizeArtwork(input:Buffer,mime:string):Promise<Buffer>{
  if(!input.length||input.length>ARTWORK_MAX_BYTES||!ARTWORK_TYPES.includes(mime))
    throw new AppError('INVALID_IMAGE',ARTWORK_UPLOAD_HELP,400);
  try{
    const codec=sharp(input,{limitInputPixels:40_000_000,animated:false,failOn:'warning'});
    const meta=await codec.metadata();
    if(!['png','jpeg','webp'].includes(meta.format||''))throw new Error('Unsupported image');
    // Honor camera orientation, preserve aspect ratio and transparency; strip EXIF.
    const pixels=await codec.rotate().resize(1024,1024,{fit:'inside',withoutEnlargement:true}).toBuffer();
    for(const quality of [90,82,72,60]){
      const result=await sharp(pixels).webp({quality}).toBuffer();
      if(result.length<=262144)return result;
    }
    const result=await sharp(pixels).resize(512,512,{fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer();
    if(result.length>262144)throw new Error('Image could not be optimized');
    return result;
  }catch{
    throw new AppError('INVALID_IMAGE','This image could not be processed. Use a valid PNG, JPG or WebP up to 10 MB and 40 megapixels.',400);
  }
}
