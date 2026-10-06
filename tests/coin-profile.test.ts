import {it,expect} from 'vitest';
import {profileAnchor,profileSeries,publicResultTitle} from '../packages/core/coin-profile';
it('keeps old profile URLs mapped to single-page destinations',()=>{expect(profileAnchor('financials')).toBe('performance');expect(profileAnchor('track-record')).toBe('outputs');expect(profileAnchor('network')).toBe('network');expect(profileAnchor('live')).toBe('live');expect(profileAnchor('unknown')).toBe('identity');});
it('preserves actual values without inventing historical points',()=>{const points=[{day:'2026-10-05',revenue:0,expenses:0.12}];expect(profileSeries(points,30)).toEqual(points);expect(profileSeries([],7)).toEqual([]);});
it('never exposes private input as a public output title',()=>{expect(publicResultTitle({type:'SERVICE',input:{query:'secret'},output:null})).toBe('Completed service');expect(publicResultTitle({type:'RUN',output:{summary:'Recorded report'}})).toBe('Recorded report');});
