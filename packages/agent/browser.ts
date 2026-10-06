import Browserbase from '@browserbasehq/sdk';
import { chromium, type Browser } from 'playwright-core';
import { ensure } from '../core';
import { safeFetch } from './tools';
import sharp from 'sharp';
export type BrowserCapture={content:string;url:string;title:string;capturedAt:string;action:'PAGE_OPENED'|'EVIDENCE_CAPTURED';mode:'public-static-html'};

// The browser renders only content fetched through the pinned-DNS public HTTPS
// gateway. Every other browser request is denied, including redirects, frames,
// scripts, service workers and WebSockets. No remote page controls navigation.
export async function readPublicPage(url:string,domains:string[],timeout:number,onCapture?:(capture:BrowserCapture)=>Promise<void>){
  url=new URL(url).href;
  const started=Date.now(),html=await safeFetch(url,domains,Math.min(timeout,12000),true);
  let browser:Browser|undefined,remote:Browserbase|undefined,sessionId:string|undefined,closeTimer:ReturnType<typeof setTimeout>|undefined;
  const diagnostic=(stage:string)=>{if(process.env.INDUSTRY_BROWSER_DIAGNOSTICS==='1')console.info('[browser] '+stage);};diagnostic('public source fetched');
  const remaining=()=>Math.max(1,Math.min(12000,timeout-(Date.now()-started)));
  try{
    if(process.env.BROWSERBASE_API_KEY){
      ensure(process.env.BROWSERBASE_PROJECT_ID,'BROWSER_UNCONFIGURED','Browserbase project ID is required',503);
      remote=new Browserbase({apiKey:process.env.BROWSERBASE_API_KEY,timeout:remaining(),maxRetries:0});
      const session=await remote.sessions.create({projectId:process.env.BROWSERBASE_PROJECT_ID,api_timeout:60});sessionId=session.id;
      browser=await chromium.connectOverCDP(session.connectUrl,{timeout:remaining()});
    }else browser=await chromium.launch({headless:true,timeout:remaining(),...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
    closeTimer=setTimeout(()=>{void browser?.close().catch(()=>{});},Math.max(1,timeout-(Date.now()-started)));closeTimer.unref();
    const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false,viewport:{width:1280,height:800},deviceScaleFactor:1});context.setDefaultTimeout(remaining());diagnostic('isolated context ready');
    await context.route('**/*',async route=>{
      if(route.request().isNavigationRequest()&&route.request().url()===url)await route.fulfill({status:200,contentType:'text/html',body:html});
      else await route.abort();
    });
    const page=await context.newPage();await page.goto(url,{timeout:remaining(),waitUntil:'domcontentloaded'});diagnostic('page opened');
    await page.locator('script,style,noscript,iframe,object,embed').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
    const title=(await page.title()).slice(0,500),text=(await page.locator('body').innerText({timeout:remaining()})).replace(/\s+/g,' ').slice(0,24000);
    const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.slice(0,50).map(node=>({text:(node.textContent||'').slice(0,200),url:(node as HTMLAnchorElement).href})).filter(link=>link.url.startsWith('https://')));diagnostic('evidence extracted');
    // Fresh anonymous context only. Mask form controls and recognizable secrets
    // before pixels are captured; never record credential-bearing source URLs.
    await page.locator('input,textarea,select,[contenteditable]').evaluateAll(nodes=>nodes.forEach(n=>{n.replaceWith(document.createTextNode('[private field]'));}));
    await page.evaluate(()=>{const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode;n.textContent=n.textContent?.replace(/sk-[\w-]+|Bearer\s+\S+|(?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*\S+/gi,'[redacted]')||'';}});
    diagnostic('private fields masked');
    // A consistent reader surface for the actual isolated page. External CSS,
    // scripts and images remain blocked; no visitor-side third-party iframe.
    await page.evaluate(css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);},'html{background:#eef0ed;color:#202a25;font:18px/1.65 system-ui,sans-serif}body{max-width:1020px;margin:48px auto;padding:0 48px}h1{font-size:38px;line-height:1.2}h2{font-size:27px}a{color:#167450}img,video,canvas,svg{max-width:100%;height:auto}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}nav,footer{font-size:14px;opacity:.75}button,input{font:inherit}*{box-sizing:border-box}');
    diagnostic('reader surface ready');
    const capture=async(action:BrowserCapture['action'])=>{if(!onCapture||/[?&][^=]*(?:token|key|secret|signature|auth|session|password)[^=]*=/i.test(url)||timeout-(Date.now()-started)<1500)return;try{const image=await sharp(await page.screenshot({type:'jpeg',quality:65,timeout:remaining()})).webp({quality:65}).toBuffer();diagnostic('frame rendered');if(image.length<=262144)await onCapture({content:image.toString('base64'),url,title:(await page.title()).slice(0,500),capturedAt:new Date().toISOString(),action,mode:'public-static-html'});diagnostic('frame retained');}catch{/* Observability failure must not alter execution or settlement. */}};
    await capture('PAGE_OPENED');
    if(onCapture){await page.evaluate(()=>scrollTo(0,Math.min(650,document.body.scrollHeight-innerHeight)));await capture('EVIDENCE_CAPTURED');}
    return {url,title,text,links,provider:remote?'Browserbase':'local-playwright',mode:'public-static-html',untrusted:true};
  }finally{
    clearTimeout(closeTimer);
    await browser?.close().catch(()=>{});
    if(remote&&sessionId)await remote.sessions.update(sessionId,{projectId:process.env.BROWSERBASE_PROJECT_ID!,status:'REQUEST_RELEASE'}).catch(()=>{});
  }
}
