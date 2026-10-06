import { z } from 'zod';

const denominator = 1_000_000_000_000n;
const weight = (n:number) => BigInt(n.toFixed(12).replace('.', ''));
const usd = z.number().nonnegative().refine(n => n === Number(n.toFixed(6)) && Number.isSafeInteger(Math.round(n * 1e6)), 'Threshold must fit exact USD micro-units');
const ratio = z.number().min(0).max(1).refine(n => n === Number(n.toFixed(12)), 'Shares support up to 12 decimal places');
const phase = z.object({threshold:usd,compute_share:ratio,operating_share:ratio,platform_share:ratio}).strict()
 .refine(p => weight(p.compute_share) + weight(p.operating_share) + weight(p.platform_share) === denominator, 'Shares must sum to 1 exactly');
export const feePolicySchema = z.object({phases:z.object({BOOTSTRAP:phase,GROWTH:phase,ESTABLISHED:phase}).strict()}).strict()
 .refine(p => p.phases.BOOTSTRAP.threshold === 0 && p.phases.GROWTH.threshold > 0 && p.phases.ESTABLISHED.threshold > p.phases.GROWTH.threshold, 'Thresholds must increase from zero');
export type FeePolicy = z.infer<typeof feePolicySchema>;
export const feePhases = ['BOOTSTRAP','GROWTH','ESTABLISHED'] as const;
export type FeePhase = typeof feePhases[number];

// Authoritative approved V1 defaults. The audited system_settings override remains supported.
export const defaultFeePolicy:FeePolicy = {
 phases:{
  BOOTSTRAP:{threshold:0,compute_share:.60,operating_share:.40,platform_share:0},
  GROWTH:{threshold:20,compute_share:.40,operating_share:.60,platform_share:0},
  ESTABLISHED:{threshold:100,compute_share:.20,operating_share:.65,platform_share:.15},
 },
};
const microThreshold = (n:number) => BigInt(Math.round(n * 1e6));
export function feePhaseAt(total:bigint, policy:FeePolicy):FeePhase {
 // The next micro-dollar after a boundary uses the next phase.
 return total >= microThreshold(policy.phases.ESTABLISHED.threshold) ? 'ESTABLISHED' : total >= microThreshold(policy.phases.GROWTH.threshold) ? 'GROWTH' : 'BOOTSTRAP';
}
export type FeeSegment = {phase:FeePhase;fromMicroUsd:string;toMicroUsd:string;amountMicroUsd:string;compute:string;operating:string;platform:string};
export function splitFeeReceipt(previous:bigint, amount:bigint, input:FeePolicy) {
 const policy = feePolicySchema.parse(input);
 if(previous < 0n || amount < 0n) throw new Error('Fee values must be nonnegative micro-units');
 let cursor = previous, remaining = amount, compute = 0n, operating = 0n, platform = 0n;
 const segments:FeeSegment[] = [];
 while(remaining > 0n) {
  const name = feePhaseAt(cursor, policy), index = feePhases.indexOf(name), p = policy.phases[name];
  const room = index < 2 ? microThreshold(policy.phases[feePhases[index+1]].threshold) - cursor : remaining;
  const value = remaining < room ? remaining : room;
  let c = value * weight(p.compute_share) / denominator, o = value * weight(p.operating_share) / denominator;
  let f = value * weight(p.platform_share) / denominator;
  // Dust stays with the business, preferably Operating. A zero-share account never receives dust.
  const dust = value - c - o - f;
  if(p.operating_share > 0) o += dust; else if(p.compute_share > 0) c += dust; else f += dust;
  segments.push({phase:name,fromMicroUsd:cursor.toString(),toMicroUsd:(cursor+value).toString(),amountMicroUsd:value.toString(),compute:c.toString(),operating:o.toString(),platform:f.toString()});
  compute += c; operating += o; platform += f; cursor += value; remaining -= value;
 }
 return {phase:segments.length > 1 ? 'MIXED' : segments[0]?.phase || feePhaseAt(previous,policy),previousMicroUsd:previous.toString(),totalMicroUsd:cursor.toString(),segments,compute:compute.toString(),operating:operating.toString(),platform:platform.toString()};
}
