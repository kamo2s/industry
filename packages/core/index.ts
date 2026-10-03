import { z } from 'zod';

export const templates = ['Researcher', 'Watcher', 'Indexer', 'Verifier', 'Custom'] as const;
export const toolKeys = ['web_search', 'browser_fetch', 'helius', 'http', 'marketplace'] as const;
export const categories = ['Research', 'Verification', 'Data', 'Monitoring', 'On-chain', 'Analysis', 'Other'] as const;
export const usd = (micros: number) => micros / 1_000_000;
export const micro = (dollars: number) => Math.round(dollars * 1_000_000);
export const money = (dollars: number, precision = 2) => { const n=Number(dollars||0),rounded=Math.round(Math.abs(n)*10**precision)/10**precision;return (n<0&&rounded?'-':'')+'$'+rounded.toLocaleString('en-US',{minimumFractionDigits:precision,maximumFractionDigits:precision}); };
export const short = (value: string | null | undefined) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Sandbox identity';
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function ensure(condition: unknown, code: string, message: string, status = 400): asserts condition {
  if (!condition) throw new AppError(code, message, status);
}
const dollars = z.number().finite().min(0).max(10000).refine(n => Math.abs(micro(n) / 1e6 - n) < 1e-9, 'Use at most six decimal places');
export const policySchema = z.object({
  maxPurchase: dollars.default(0.05), dailySpend: dollars.default(1), maxRunCost: dollars.min(0.001).default(0.02),
  maxTools: z.number().int().min(1).max(12).default(4), autoHire: z.boolean().default(false),
  purchasesPerRun: z.number().int().min(0).max(5).default(1), purchasesPerDay: z.number().int().min(0).max(50).default(10),
  preferredCategories: z.array(z.enum(categories)).default([]), pauseLow: z.boolean().default(true)
}).strict();
export type Policy = z.infer<typeof policySchema>;
export const defaultPolicy = policySchema.parse({});
export const jsonSchema = z.record(z.string(), z.unknown()).refine(v => v.type === 'object', 'Schema must have type object');
export const serviceSchema = z.object({
  name: z.string().trim().min(3).max(80), description: z.string().trim().min(10).max(500),
  category: z.enum(categories).default('Research'), price: dollars.min(0.001),
  requestSchema: jsonSchema.default({ type: 'object', properties: { topic: { type: 'string', minLength: 3, maxLength: 2000 } }, required: ['topic'], additionalProperties: false }),
  responseSchema: jsonSchema.default({ type: 'object', properties: { summary: { type: 'string' }, sources: { type: 'array' } }, required: ['summary'], additionalProperties: true }),
  maxSeconds: z.number().int().min(10).max(120).default(60), active: z.boolean().default(true)
}).strict();
export const agentSchema = z.object({
  name: z.string().trim().min(2).max(40).regex(/^[\w .-]+$/), ticker: z.string().regex(/^[A-Z0-9]{2,10}$/),
  description: z.string().trim().min(10).max(240), mission: z.string().trim().min(10).max(4000),
  category: z.enum(categories), tags: z.array(z.string().trim().min(1).max(24)).max(6),
  jobType: z.enum(templates), tools: z.array(z.enum(toolKeys)).max(5),
  tokenMode: z.enum(['sandbox', 'existing', 'devnet']), mint: z.string().max(64).default(''),
  icon: z.string().max(150).default(''), scope: z.string().max(2000).default(''),
  domains: z.array(z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i)).max(20).default([]),
  schedule: z.enum(['manual', 'event', 'interval']).default('manual'), intervalMinutes: z.number().int().min(5).max(10080).default(60),
  publicOutput: z.boolean().default(true), outputFormat: z.enum(['report', 'json', 'brief']).default('report'),
  initialBudget: dollars.max(100).default(10), policy: policySchema, services: z.array(serviceSchema).min(1).max(5)
}).strict();
export type AgentInput = z.infer<typeof agentSchema>;
export const requestSchema = z.object({ input: z.record(z.string(), z.unknown()), requesterAgentId: z.string().uuid().optional() }).strict();
export const idempotencySchema = z.string().min(16).max(128).regex(/^[a-zA-Z0-9:_-]+$/);
export type Lifecycle = 'BOOTING' | 'ACTIVE' | 'SELF-SUSTAINING' | 'LOW COMPUTE' | 'DORMANT';
export function lifecycle(m: { paused: boolean; runs: number; balance: number; nextCost: number; revenue7d: number; cost7d: number; externalPaidJobs: number }): Lifecycle {
  if (m.paused || m.balance < m.nextCost) return 'DORMANT';
  if (m.runs === 0) return 'BOOTING';
  if (m.balance < m.nextCost * 3) return 'LOW COMPUTE';
  if (m.externalPaidJobs >= 3 && m.revenue7d >= m.cost7d) return 'SELF-SUSTAINING';
  return 'ACTIVE';
}
export function authorizePurchase(p: Policy, ctx: { amount: number; balance: number; spentToday: number; purchasesToday: number; purchasesRun: number; spentRun: number; category: string; network: string; emergency: boolean; paused: boolean }) {
  ensure(!ctx.emergency && !ctx.paused, 'PAUSED', 'Autonomous spending is paused');
  ensure(ctx.network === 'sandbox', 'NETWORK_DENIED', 'Only sandbox service payments are enabled');
  ensure(p.autoHire, 'HIRING_DISABLED', 'Automatic hiring is disabled for this agent');
  ensure(ctx.amount > 0 && ctx.amount <= micro(p.maxPurchase), 'PURCHASE_LIMIT', 'Purchase exceeds the per-transaction limit');
  ensure(ctx.spentToday + ctx.amount <= micro(p.dailySpend), 'DAILY_LIMIT', 'Daily spending limit reached');
  ensure(ctx.spentRun + ctx.amount <= micro(p.maxRunCost), 'RUN_LIMIT', 'Run spending limit reached');
  ensure(ctx.purchasesToday < p.purchasesPerDay && ctx.purchasesRun < p.purchasesPerRun, 'PURCHASE_COUNT', 'Purchase count limit reached');
  ensure(ctx.amount <= ctx.balance, 'INSUFFICIENT_BALANCE', 'Insufficient operating balance');
  ensure(!p.preferredCategories.length || p.preferredCategories.includes(ctx.category as typeof categories[number]), 'CATEGORY_DENIED', 'Service category is outside this agent’s policy');
}
export const retryDelay = (attempt: number) => Math.min(300, 2 ** Math.max(1, attempt));
export type Metrics = { balance: number; revenue24h: number; revenue7d: number; cost7d: number; net7d: number; jobs: number; customers: number; externalPaidJobs: number; ratio: number; lifecycle: Lifecycle };
export type Agent = { id: string; slug: string; name: string; ticker: string; description: string; mission: string; job_type: typeof templates[number]; category: string; tags: string[]; icon_url: string; creator_profile_id: string; creator_wallet: string; paused: boolean; health: string; last_run_at: string | null; next_run_at: string | null; created_at: string; config: AgentInput; token: { mint: string; network: string; name: string; symbol: string; verified_at: string } | null; tools: string[]; metrics: Metrics };
export type Service = { id: string; agent_id: string; name: string; description: string; category: string; price: number; active: boolean; request_schema: Record<string, unknown>; response_schema: Record<string, unknown>; max_seconds: number; agent_name: string; agent_slug: string; lifecycle: Lifecycle; jobs: number; latency: number; success: number; revenue: number; jobs24h: number; volume24h: number; created_at: string };
export type Activity = { id: string; agent_id: string; agent_name: string; related_name: string | null; job_id: string | null; action: string; amount: number | null; description: string; created_at: string };
export type Network = { agentsOnline: number; revenue24h: number; totalRevenue: number; jobsCompleted: number; selfSustaining: number; series: { day: string; revenue: number; jobs: number; agents: number }[] };
