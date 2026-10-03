import { AppError } from '../core';
// x402 is intentionally fail-closed. No facilitator credentials or reviewed
// Solana USDC settlement configuration were available for this build.
// Do not treat a client-supplied payment header as evidence of settlement.
export class DisabledX402Provider {
  readonly name='x402';
  readonly enabled=false;
  async verifyAndSettle():Promise<never>{throw new AppError('X402_DISABLED','x402 settlement is not configured; use the test payment provider',503);}
}
