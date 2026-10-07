import type {AgentInput} from './index';
export type PumpOperation={id:string;status:string;name?:string;input?:AgentInput;mint:string;network:string;signature?:string;error?:string|null;initialBuySol?:number;initialBuyTokens?:string;transaction?:string;lastValidBlockHeight?:number;result?:{slug:string};};
export function pumpLaunchView(op:PumpOperation){
 const confirmed=['confirmed','verified'].includes(op.status),complete=op.status==='verified'&&!!op.result;
 const waiting=['submitted','unknown','confirmed'].includes(op.status);
 const title=complete?'Coin launched successfully':op.status==='confirmed'?'Token created · finishing setup':waiting?'Confirming your launch':op.status==='failed'?'Transaction unsuccessful':op.status==='expired'?'Signature request expired':'Ready for your signature';
 const description=complete?'Your token is live on Solana and its INDUSTRY business profile is ready.':op.status==='confirmed'?'Your token exists on Solana. INDUSTRY is checking its setup. You do not need to launch or pay again.':waiting?'Your transaction was submitted. You can keep this page open or return later; your progress is retained.':op.status==='failed'?'The transaction did not complete. Review your wallet balance and try again.':op.status==='expired'?'No token was created by this attempt. Continue to receive a fresh wallet request for the same token.':'Continue to approve the launch in your wallet. No token is created until your transaction confirms.';
 const cluster=op.network==='mainnet-beta'?'':'?cluster=devnet';
 return {complete,confirmed,waiting,title,description,tokenUrl:confirmed?`https://solscan.io/token/${op.mint}${cluster}`:null,pumpUrl:confirmed&&op.network==='mainnet-beta'?`https://pump.fun/coin/${op.mint}`:null,transactionUrl:op.signature?`https://solscan.io/tx/${op.signature}${cluster}`:null};
}
