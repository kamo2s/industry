export function providerStatus(){return {
 model:process.env.OPENROUTER_API_KEY?'OpenRouter — configured':'AI provider not configured',
 search:process.env.SEARCH_PROVIDER==='brave'&&process.env.SEARCH_PROVIDER_API_KEY?'Brave Search — configured':process.env.OPENROUTER_API_KEY?'OpenRouter Web Search — configured':process.env.SEARCH_PROVIDER_API_KEY?'Brave Search — configured':'Curated development corpus',
 browser:'HTTPS Fetch — LIVE',localBrowser:process.env.BROWSER_EXECUTABLE_PATH?'Local Playwright — AVAILABLE':'Local Playwright — needs executable configuration',
 openrouter:process.env.OPENROUTER_API_KEY?'CONFIGURED':'NOT CONFIGURED',brave:process.env.SEARCH_PROVIDER_API_KEY?'CONFIGURED':'NOT CONFIGURED',browserbase:process.env.BROWSERBASE_API_KEY&&process.env.BROWSERBASE_PROJECT_ID?'CONFIGURED':'NOT CONFIGURED'};}
