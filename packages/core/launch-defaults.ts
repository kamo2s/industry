import { agentSchema, serviceSchema, type AgentInput } from './index';
import { applyTemplate, templatePresets } from './templates';

import {autonomousLimits,autonomousModelPolicy} from './autonomy';
export const launchDefaults = autonomousLimits;
export function newLaunchDraft(): AgentInput {
  const draft = agentSchema.parse({
    name: 'DRAFT', ticker: 'DRAFT', description: 'Draft business description',
    mission: templatePresets.Researcher.mission, category: 'Research', tags: [],
    jobType: 'Researcher', tools: ['web_search', 'browser_fetch'], tokenMode: 'sandbox',
    policy: launchDefaults.policy, initialBudget: launchDefaults.computeCredits,
    initialOperatingBudget: launchDefaults.operatingBalance,
    services: [serviceSchema.parse({ name: 'Research a topic', description: templatePresets.Researcher.purpose, price: launchDefaults.servicePrice })],
  });
  return { ...guidedTemplate(draft, 'Researcher'), name: '', ticker: '', description: '', brain: '' };
}
export function guidedTemplate(draft: AgentInput, role: AgentInput['jobType']): AgentInput {
  const next=applyTemplate({...draft,services:[serviceSchema.parse({name:templatePresets[role].service,description:templatePresets[role].purpose,price:launchDefaults.servicePrice})]}, role);
  return { ...next, autonomyVersion:1, publicOutput:true,
    initialBudget:draft.tokenMode==='sandbox'?launchDefaults.computeCredits:0,
    initialOperatingBudget:draft.tokenMode==='sandbox'?launchDefaults.operatingBalance:0,
    tools:[...new Set([...next.tools,'marketplace' as const,...(role==='Custom'?['web_search' as const,'browser_fetch' as const]:[])])],
    policy:{...autonomousModelPolicy(draft.brain),preferredCategories:templatePresets[role].hiringCategories as AgentInput['policy']['preferredCategories']}, schedule:'continuous' };
}
export function recommendedBrain(models: { id: string; development: boolean; inputPrice: number | null; outputPrice: number | null; webSearch?: boolean }[]) {
  if(models.some(m=>m.id==='openai/gpt-6-luna'))return 'openai/gpt-6-luna';
  return [...models].sort((a, b) => Number(a.development) - Number(b.development)
    || Number(!!b.webSearch) - Number(!!a.webSearch)
    || ((a.inputPrice ?? Infinity) + (a.outputPrice ?? Infinity)) - ((b.inputPrice ?? Infinity) + (b.outputPrice ?? Infinity)))[0]?.id || '';
}
