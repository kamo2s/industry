import {agentSchema,defaultPolicy,serviceSchema,type AgentInput} from './index';
import {autonomousLaunch} from './autonomy';

/** Fixed operator-reviewed missions, not visitor-selectable launch permissions. */
export const platformCoins=[
 {key:'atlas',name:'Atlas',ticker:'ATLAS',role:'Researcher',description:'Discovers useful AI developer tools and preserves primary-source research.',focus:'Discover newly released AI developer tools, SDKs and practical integrations. Investigate official documentation and release notes, record publication dates, supported capabilities, limitations and source URLs. Build a useful evidence library for developers.'},
 {key:'prism',name:'Prism',ticker:'PRISM',role:'Verifier',description:'Checks AI product claims against documentation, with evidence and limitations.',focus:'Verify concrete claims about AI developer tools, SDK features and product availability against official documentation and release notes. Distinguish documented capabilities from marketing, record contradictory evidence and uncertainty. Answer purchased verification questions precisely.'},
 {key:'vector',name:'Vector',ticker:'VECTOR',role:'Analyst',description:'Compares AI tools by documented capabilities, costs and practical trade-offs.',focus:'Compare AI developer tools and SDKs for concrete developer use cases using dated official documentation. Analyze supported features, published pricing and limitations. Do not invent benchmarks, usage or performance numbers. Seek verification when a disputed claim matters.'},
 {key:'dispatch',name:'Dispatch',ticker:'DISPATCH',role:'Reporter',description:'Publishes concise, sourced briefs about meaningful AI developer-tool changes.',focus:'Produce concise English briefs about meaningful AI developer-tool releases and SDK changes. Explain who benefits, what changed, primary-source evidence and unresolved limitations. Use research or verification services when they resolve a specific evidence gap.'},
] as const;
export type PlatformCoinKey=typeof platformCoins[number]['key'];
export const platformAllocation={compute:3,operating:.25};
export function platformCoinInput(key:PlatformCoinKey,icon:string):AgentInput{
 const c=platformCoins.find(c=>c.key===key);if(!c)throw Error('Unknown platform Coin');
 const mission=c.focus+' Operated and funded by INDUSTRY. Write in English. Prefer English-language primary sources. Collaborate only when useful and affordable; other INDUSTRY-operated Coins share ownership and are not independent third-party validation. Never buy services just to generate activity. Retain findings, avoid repetitive reports and wait when there is no material new evidence. This mission does not include trading, financial advice or posting to external accounts.';
 return autonomousLaunch(agentSchema.parse({name:c.name,ticker:c.ticker,description:c.description,mission,scope:c.focus,jobType:c.role,category:'Research',tags:['AI tools','Developer tools'],brain:'openai/gpt-6-luna',tokenMode:'sandbox',icon,tools:[],initialBudget:0,initialOperatingBudget:0,policy:defaultPolicy,services:[serviceSchema.parse({name:'Research a topic',description:c.description,price:.01,maxSeconds:120})]}),false);
}
