import {describe,it,expect} from 'vitest';
import {agentSchema,tickerSchema,templates} from '../packages/core';
import {newLaunchDraft} from '../packages/core/launch-defaults';
import {launchIdentityErrors,launchWorkErrors,selectLaunchRole} from '../packages/core/launch-validation';
import {autonomousLaunch} from '../packages/core/autonomy';
const draft={...newLaunchDraft(),name:'Radar Labs',ticker:'radar',description:'Public business description.',scope:'Research official public sources.',mission:'Research official public sources.',brain:'development/mock'};
describe('three-step launch contract',()=>{
 it.each(['radar','RADAR','Radar','rAdAr'])('preserves %s through validation, defaults and serialized config',ticker=>{const parsed=agentSchema.parse({...draft,ticker});expect(parsed.ticker).toBe(ticker);expect(JSON.parse(JSON.stringify(autonomousLaunch(parsed,true))).ticker).toBe(ticker);expect(launchIdentityErrors(parsed)).toEqual({});});
 it('validates serialized symbol length without ASCII or uppercase restrictions',()=>{expect(tickerSchema.parse('a')).toBe('a');expect(tickerSchema.parse('a'.repeat(13))).toHaveLength(13);expect(tickerSchema.parse('猫')).toBe('猫');expect(tickerSchema.safeParse('a'.repeat(14)).success).toBe(false);expect(tickerSchema.safeParse('猫'.repeat(5)).success).toBe(false);expect(tickerSchema.safeParse('x\u0000').success).toBe(false);});
 it('keeps the creator mission across all actual role presets and applies managed defaults',()=>{for(const role of templates){const next=selectLaunchRole(draft,role);expect(next.scope).toBe(draft.scope);expect(next.mission).toBe(draft.mission);expect(next.schedule).toBe('continuous');expect(next.services).toHaveLength(1);expect(next.tools).toContain('marketplace');expect(next.policy.autoHire).toBe(true);}});
 it('requires separate identity, mission and an available catalog model',()=>{expect(launchIdentityErrors({...draft,name:'',ticker:'',description:''})).toMatchObject({name:expect.any(String),ticker:expect.any(String),description:expect.any(String)});expect(launchWorkErrors({...draft,scope:''},[{id:draft.brain}])).toHaveProperty('scope');expect(launchWorkErrors(draft,[])).toHaveProperty('brain');expect(launchWorkErrors(draft,[{id:draft.brain}])).toEqual({});});
});
