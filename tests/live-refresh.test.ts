import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveRefresh} from '../apps/web/components/live-refresh';

describe('visible-tab live refresh lifecycle',()=>{
 let doc:EventTarget,win:EventTarget,visibility:string,streams:MockStream[];
 class MockStream extends EventTarget {
  closed=false;
  constructor(public url:string){super();streams.push(this);}
  close(){this.closed=true;}
  frame(){this.dispatchEvent(new Event('refresh'));}
 }
 beforeEach(()=>{
  visibility='visible';streams=[];doc=new EventTarget();win=new EventTarget();
  Object.defineProperty(doc,'visibilityState',{get:()=>visibility});
  vi.stubGlobal('document',doc);vi.stubGlobal('window',win);vi.stubGlobal('EventSource',MockStream);
 });
 afterEach(()=>vi.unstubAllGlobals());
 it('shares a single stream and skips the redundant initial refresh',async()=>{
  const subscribe=createLiveRefresh(),a=vi.fn(),b=vi.fn(),offA=subscribe(a),offB=subscribe(b);
  expect(streams).toHaveLength(1);streams[0].frame();expect(a).not.toHaveBeenCalled();
  streams[0].frame();expect(a).toHaveBeenCalledTimes(1);expect(b).toHaveBeenCalledTimes(1);
  offA();expect(streams[0].closed).toBe(false);offB();await Promise.resolve();expect(streams[0].closed).toBe(true);
 });
 it('reuses the connection across a same-commit route handoff',async()=>{
  const subscribe=createLiveRefresh(),off=subscribe(()=>{});off();const next=subscribe(()=>{});
  await Promise.resolve();expect(streams).toHaveLength(1);expect(streams[0].closed).toBe(false);next();await Promise.resolve();expect(streams[0].closed).toBe(true);
 });
 it('frees the connection while hidden and refreshes immediately on return',()=>{
  const callback=vi.fn(),off=createLiveRefresh()(callback);
  visibility='hidden';doc.dispatchEvent(new Event('visibilitychange'));expect(streams[0].closed).toBe(true);
  visibility='visible';doc.dispatchEvent(new Event('visibilitychange'));expect(streams).toHaveLength(2);expect(callback).toHaveBeenCalledTimes(1);
  streams[1].frame();expect(callback).toHaveBeenCalledTimes(1);streams[1].frame();expect(callback).toHaveBeenCalledTimes(2);off();
 });
 it('does not open a connection when mounted in a hidden tab',()=>{
  visibility='hidden';const off=createLiveRefresh()(()=>{});expect(streams).toHaveLength(0);
  visibility='visible';doc.dispatchEvent(new Event('visibilitychange'));expect(streams).toHaveLength(1);off();
 });
 it('closes on navigation and resumes after back-forward cache restoration',()=>{
  const callback=vi.fn(),off=createLiveRefresh()(callback);
  win.dispatchEvent(new Event('pagehide'));expect(streams[0].closed).toBe(true);
  win.dispatchEvent(new Event('pageshow'));expect(streams).toHaveLength(2);expect(callback).toHaveBeenCalledTimes(1);
  off();win.dispatchEvent(new Event('pageshow'));doc.dispatchEvent(new Event('visibilitychange'));expect(streams).toHaveLength(2);
 });
});
