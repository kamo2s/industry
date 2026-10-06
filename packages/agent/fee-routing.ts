import { verifyMint } from './solana';
export interface RoutingEvidence{status:'FAILED';provider:string;checkedAt:string;checks:Record<string,boolean>;reason:string;onChainChecked:boolean;mint:string;}
export interface FeeRoutingAdapter{provider:string;verify(input:{mint:string;creator:string;treasury?:string;share?:number}):Promise<RoutingEvidence>;}
/** Provider-specific, read-only verification. Metadata authority is not a fee lock. */
export class Token2022FeeRouting implements FeeRoutingAdapter{
 provider='token-2022-metadata';
 async verify(input:{mint:string;creator:string;treasury?:string;share?:number}):Promise<RoutingEvidence>{
  let token:Awaited<ReturnType<typeof verifyMint>>|undefined;
  try{token=await verifyMint(input.mint);}catch{return {status:'FAILED',provider:this.provider,checkedAt:new Date().toISOString(),checks:{mint:false,creator:false,recipient:false,share:false,enforceable:false},reason:'FEE ROUTING VERIFICATION FAILED: mint could not be verified on the configured devnet RPC.',onChainChecked:false,mint:input.mint};}
  return {status:'FAILED',provider:this.provider,checkedAt:new Date().toISOString(),checks:{mint:token.mint===input.mint,creator:token.mintAuthority===input.creator,recipient:false,share:false,enforceable:false},reason:'FEE ROUTING VERIFICATION FAILED: the Token-2022 metadata launch adapter has no enforceable creator trading-fee routing mechanism. Mint authority and transfer fees are not proof of locked creator fee routing.',onChainChecked:true,mint:input.mint};
 }
}
