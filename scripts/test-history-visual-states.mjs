import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE});
try {for(const width of [1280,390]) for(const state of ['empty','error']) {
 const page=await browser.newPage({viewport:{width,height:900}});
 let release; const gate=new Promise(resolve=>release=resolve); let writes=0;
 await page.route('**/api/**',async route=>{if(route.request().method()!=='GET')writes++;
 await gate; const url=new URL(route.request().url());
 await route.fulfill({status:state==='error'?500:200,contentType:'application/json',body:JSON.stringify(url.pathname==='/api/operations'?{version:'1',records:[]}:{version:'2',items:[],nextCursor:null})});});
 await page.goto((process.env.BASE_URL??'http://127.0.0.1:3214')+'/history');
 await page.locator('#history-access-token').fill('synthetic-only');
 await page.getByRole('button',{name:/Consultar historial/}).click();
 await page.getByText('Consultando tus operaciones…',{exact:true}).waitFor();
 release();
 await page.getByText(state==='empty'?'Aún no hay operaciones registradas para este acceso. No se reconstruyen compras a partir de transferencias antiguas.':'No pudimos consultar el historial. Inténtalo nuevamente.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:`docs/ui-evidence/history-${state}-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:/Bloquear y borrar vista/}).click();
 assert.equal(await page.locator('#history-access-token').inputValue(),'');
 assert.equal(writes,0);await page.close(); console.log(`PASS synthetic history ${state} ${width}: loading, final state, lock, no writes`);
}}finally{await browser.close();}
