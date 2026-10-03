// Small pure-JavaScript compatibility adapter. No native memory access.
// Solana's buffer-layout utility uses these four integer conversion functions.
function read(bytes,little){
  if(!Buffer.isBuffer(bytes)||bytes.length>4096)throw new RangeError('Expected a bounded Buffer');
  let result=0n;
  for(let i=0;i<bytes.length;i++){const index=little?bytes.length-1-i:i;result=(result<<8n)|BigInt(bytes[index]);}
  return result;
}
function write(value,width,little){
  if(typeof value!=='bigint'||value<0n||!Number.isInteger(width)||width<0||width>4096)throw new RangeError('Invalid unsigned integer or width');
  if(value>=(1n<<BigInt(width*8)))throw new RangeError('Integer does not fit the destination buffer');
  const result=Buffer.alloc(width);let remaining=value;
  for(let i=0;i<width;i++){result[little?i:width-1-i]=Number(remaining&255n);remaining>>=8n;}
  return result;
}
exports.toBigIntLE=bytes=>read(bytes,true);
exports.toBigIntBE=bytes=>read(bytes,false);
exports.toBufferLE=(value,width)=>write(value,width,true);
exports.toBufferBE=(value,width)=>write(value,width,false);
