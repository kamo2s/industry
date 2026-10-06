// INDUSTRY's reviewed catalog. Pricing/capabilities are refreshed from OpenRouter.
// Price alone does not exclude an approved model. Runtime balance and cost checks still apply.
export type ApprovedModel={id:string;displayName:string;provider:string;providerDisplayName:string;tier:'primary'|'secondary';recommended:boolean;recommendedRank?:number;costTier:string;speedTier:string;intelligenceTier:string;description:string;capabilities:string[];enabled:boolean};
const rows:[string,string,string,string,string,string,string,boolean?][]=[
 ['openai/gpt-6-luna','GPT-6 Luna','OpenAI','$','Fast','Strong','Fast, economical everyday work.',true],
 ['openai/gpt-6-luna-pro','GPT-6 Luna Pro','OpenAI','$','Balanced','Strong','Economical work with deeper reasoning.'],
 ['openai/gpt-6.1-sol','GPT-6.1 Sol','OpenAI','$$$','Balanced','Frontier','Balanced intelligence for demanding tasks.',true],
 ['openai/gpt-6-astra','GPT-6 Astra','OpenAI','$$$$','Slower','Frontier','Frontier intelligence for the hardest tasks.'],
 ['anthropic/claude-haiku-4.5','Claude Haiku 4.5','Anthropic','$$','Fast','Strong','Fast, efficient Claude for everyday work.'],
 ['anthropic/claude-sonnet-5','Claude Sonnet 5','Anthropic','$$$','Balanced','Frontier','Strong autonomous research and execution.',true],
 ['anthropic/claude-opus-5','Claude Opus 5','Anthropic','$$$$','Slower','Frontier','Premium reasoning for complex problems.'],
 ['anthropic/claude-fable-5.1','Claude Fable 5.1','Anthropic','$$$$','Slower','Frontier','Long-running agentic and knowledge work.'],
 ['google/gemini-3.1-flash-lite','Gemini 3.1 Flash Lite','Google','$','Fast','Standard','Efficient, high-volume everyday tasks.'],
 ['google/gemini-3.7-flash','Gemini 3.7 Flash','Google','$$','Fast','Strong','Fast, balanced research and analysis.'],
 ['google/gemini-3.8-flash','Gemini 3.8 Flash','Google','$$','Fast','Strong','Fast multimodal and agentic intelligence.',true],
 ['~google/gemini-pro-latest','Gemini Pro Latest','Google','$$$','Balanced','Frontier','Current premium Google Pro model.'],
 ['x-ai/grok-4.7','Grok 4.7','xAI','$$$','Balanced','Frontier','An alternative for demanding analysis.'],
 ['deepseek/deepseek-v4.1-flash','DeepSeek V4.1 Flash','DeepSeek','$','Fast','Strong','Strong intelligence at an economical cost.'],
 ['qwen/qwen3.8-max-0902','Qwen3.8 Max','Qwen','$$$','Balanced','Frontier','High-end Qwen reasoning and execution.'],
 ['mistralai/mistral-small-2603','Mistral Small 4','Mistral','$','Fast','Standard','Efficient general and agentic work.'],
 ['moonshotai/kimi-k3','Kimi K3','Moonshot','$$$','Balanced','Strong','Long-context and long-horizon work.'],
 ['z-ai/glm-5.3','GLM 5.3','Z.ai','$$','Balanced','Strong','A capable agentic alternative.'],
 ['minimax/minimax-m3','MiniMax M3','MiniMax','$','Fast','Strong','Efficient autonomous execution.'],
 ['xiaomi/mimo-v2.6-pro','MiMo-V2.6-Pro','Xiaomi','$','Balanced','Strong','High-value general intelligence.'],
];
const acceptedIds=new Set(["openai/gpt-6-luna","openai/gpt-6-luna-pro","openai/gpt-6.1-sol","openai/gpt-6-astra","anthropic/claude-haiku-4.5","anthropic/claude-sonnet-5","anthropic/claude-opus-5","google/gemini-3.1-flash-lite","google/gemini-3.7-flash","google/gemini-3.8-flash","~google/gemini-pro-latest","deepseek/deepseek-v4.1-flash","mistralai/mistral-small-2603","moonshotai/kimi-k3","z-ai/glm-5.3","minimax/minimax-m3"]);
export const approvedModels:ApprovedModel[]=rows.map(([id,displayName,providerDisplayName,costTier,speedTier,intelligenceTier,description,recommended=false])=>({id,displayName,provider:id.split('/')[0].replace('~',''),providerDisplayName,costTier,speedTier,intelligenceTier,description,recommended,tier:['OpenAI','Anthropic','Google'].includes(providerDisplayName)?'primary':'secondary',recommendedRank:['openai/gpt-6-luna','anthropic/claude-sonnet-5','google/gemini-3.8-flash','openai/gpt-6.1-sol'].indexOf(id),capabilities:['Structured results','INDUSTRY tools'],enabled:acceptedIds.has(id)||['x-ai/grok-4.7','xiaomi/mimo-v2.6-pro','anthropic/claude-fable-5.1','qwen/qwen3.8-max-0902'].includes(id)}));
export const defaultModelId='openai/gpt-6-luna';
export const legacyModelIds:Record<string,string>={'openai:gpt-6-luna':defaultModelId,'openai:gpt-6-luna-pro':'openai/gpt-6-luna-pro','openai:gpt-6.1-sol':'openai/gpt-6.1-sol','openai:gpt-6-sol':'openai/gpt-6.1-sol','openai:gpt-6-astra':'openai/gpt-6-astra'};
export function canonicalModelId(id:string){return legacyModelIds[id]||id;}
export function modelDisplayName(id?:string){return approvedModels.find(m=>m.id===canonicalModelId(id||''))?.displayName|| (id==='development/mock'?'Development':id||'Not configured');}
