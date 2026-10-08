import {minimumServicePrice} from './service-pricing';
import {AppError,agentSchema,defaultPolicy,serviceSchema,type AgentInput} from './index';
import {approvedModels,canonicalModelId} from './model-registry';
import {applyTemplate,templatePresets} from './templates';

/** Public identities may launch and observe, never act as a running business. */
export function assertObserverOperation(operation:string){
  if (/^agents\/(update|pause|resume|terminate|run|fund|service|service-update|routing-check)$/.test(operation)
    || /^work\/(create|accept|cancel)$/.test(operation)
    || /^services\/(request|invoke)$/.test(operation)) {
    throw new AppError('AUTONOMOUS_ONLY','Coins operate autonomously after launch. Manual orders and creator controls are unavailable.',403);
  }
}

export const autonomousLimits={
  servicePrice:minimumServicePrice,computeCredits:10,operatingBalance:1,
  policy:{...defaultPolicy,separateServiceBudget:true,maxPurchase:10,maxRunCost:0.10,maxTools:3,autoHire:true,
    allowedNetworks:['sandbox'] as ('sandbox'|'devnet')[],purchasesPerRun:1,purchasesPerDay:4},
};

/** Model-aware platform ceilings; balance and global limits still apply. */
export function autonomousModelPolicy(brain?:string){
 const tier=approvedModels.find(m=>m.id===canonicalModelId(brain||''))?.costTier;
 const limits=tier==='$$$$'?{maxRunCost:1.9,hourlySpend:2,dailySpend:2}:tier==='$$$'?{maxRunCost:.5,hourlySpend:1,dailySpend:2}:tier==='$$'?{maxRunCost:.25,hourlySpend:.5,dailySpend:1}:{};
 return {...autonomousLimits.policy,...limits};
}

/** Launch identity/mission/model are creator input; financial authority is not. */
export function autonomousLaunch(input:unknown,testFunding:boolean):AgentInput{
  const draft=agentSchema.parse(input),preset=templatePresets[draft.jobType];
  if(!draft.brain)throw new AppError('MODEL_REQUIRED','Choose an available AI model before launch. It cannot be changed afterwards.');
  const templated=applyTemplate({...draft,services:[serviceSchema.parse({name:preset.service,description:preset.purpose,price:autonomousLimits.servicePrice,maxSeconds:120})]},draft.jobType);
  return agentSchema.parse({...templated,autonomyVersion:1,mission:draft.mission,scope:draft.scope,
    tools:[...new Set([...preset.tools,...(draft.jobType==='Custom'?['web_search' as const,'browser_fetch' as const]:[]),'marketplace' as const])],
    schedule:'continuous',publicOutput:true,
    policy:{...autonomousModelPolicy(draft.brain),preferredCategories:preset.hiringCategories},
    initialBudget:testFunding&&draft.tokenMode==='sandbox'?autonomousLimits.computeCredits:0,
    initialOperatingBudget:testFunding&&draft.tokenMode==='sandbox'?autonomousLimits.operatingBalance:0,
  });
}
