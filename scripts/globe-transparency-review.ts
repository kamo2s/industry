import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';

const mode=process.argv[2]||'layout',dir='qa/globe-transparency';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});
const errors:string[]=[],checks:unknown[]=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://localhost:3000');
  await expect(page.locator('.globe.is-ready')).toBeVisible();
  await expect(page.locator('.globe-viewport')).toHaveCSS('opacity','1');
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('.terminal-hero-copy')).toHaveCSS('opacity','1');
  await expect(page.locator('.globe-atmosphere')).toHaveCount(0);
  if(mode==='layout'){
    await page.locator('.terminal-hero').screenshot({path:dir+'/pass-1-desktop.png'});
    const before=await page.screenshot();
    const hidden=await page.addStyleTag({content:'.globe-stage{visibility:hidden!important}'});
    const background=await page.screenshot();
    await hidden.evaluate(el=>(el as HTMLElement).remove());
    const network=await page.locator('.terminal-network').boundingBox();
    const canvas=await page.locator('.globe-viewport').boundingBox();
    // Empty space outside the spherical scene previously received the CSS tint.
    const rect={left:Math.ceil(network!.x+30),top:Math.ceil(canvas!.y+20),width:35,height:45};
    const a=await sharp(before).extract(rect).removeAlpha().raw().toBuffer();
    const b=await sharp(background).extract(rect).removeAlpha().raw().toBuffer();
    const maxDifference=Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
    expect(maxDifference).toBe(0);
    checks.push({outsideSphereMatchesPageExactly:true,maxDifference,rect,network,canvas});
  }else if(mode==='responsive'){
    for(const width of [1920,1440,390]){
      await page.setViewportSize({width,height:width===1920?1080:width===1440?1000:844});
      await page.locator('.terminal-hero').screenshot({path:dir+'/pass-2-'+width+'.png'});
      const check=await page.evaluate(()=>({width:innerWidth,zoom:visualViewport?.scale,overflow:document.documentElement.scrollWidth>innerWidth,filter:getComputedStyle(document.querySelector('.globe-viewport')!).filter,renderer:(document.querySelector('.globe-viewport') as HTMLElement).dataset.renderer}));
      expect(check.zoom).toBe(1);expect(check.overflow).toBe(false);expect(check.filter).toBe('none');
      checks.push(check);
    }
  }else if(mode==='motion'){
    await page.setViewportSize({width:1440,height:1000});
    await page.emulateMedia({reducedMotion:'no-preference'});
    const samples:Record<string,string|undefined>[]=[];
    for(let i=0;i<7;i++){
      await page.waitForTimeout(5000);
      samples.push(await page.locator('.globe-viewport').evaluate(el=>({...((el as HTMLElement).dataset)})));
      if([0,3,6].includes(i))await page.locator('.terminal-hero').screenshot({path:dir+'/pass-3-motion-'+i+'.png'});
    }
    expect(samples[0].rotation).not.toBe(samples.at(-1)!.rotation);
    expect(new Set(samples.map(s=>s.nodeGlow)).size).toBeGreaterThan(1);
    expect(samples.some(s=>Number(s.pulses)>0)).toBe(true);
    checks.push({motionSamples:samples});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForTimeout(1500);
    const rotation=await page.locator('.globe-viewport').getAttribute('data-rotation');
    await page.waitForTimeout(1500);
    expect(await page.locator('.globe-viewport').getAttribute('data-rotation')).toBe(rotation);
    checks.push({reducedMotionStopsRotation:true});
  }else throw new Error('Unknown review mode');
  expect(errors).toEqual([]);
  await writeFile(dir+'/'+mode+'-checks.json',JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({mode,checks,errors}));
}finally{await browser.close();}
