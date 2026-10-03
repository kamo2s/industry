import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('qa',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1200},reducedMotion:'reduce'});
page.on('pageerror',e=>console.error('PAGE ERROR:',e.message));
for(const [name,width,height] of [['desktop',1440,1200],['reference',1216,1296],['tablet',768,1024],['mobile',390,844]] as const){
  await page.setViewportSize({width,height});await page.goto('http://localhost:3000',{waitUntil:'networkidle'});await page.waitForTimeout(1500);await page.screenshot({path:`qa/${name}-${process.argv[2]||'pass1'}.png`,fullPage:true});console.log(`${name}: ${await page.title()} overflow=${await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)}`);
}
await browser.close();
