import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE});
try {for(const width of [1440,390]) for(const id of ['swap-risk-quote','ai-video-scriptwriter']) {
 const page=await browser.newPage({viewport:{width,height:1000}});const api=[],errors=[];
 await page.route('**/api/**',route=>{api.push(route.request().url());return route.abort();});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:3214'}/resources/${id}`);
 await page.getByText('Ejemplo ilustrativo de Bazaar',{exact:true}).waitFor();
 assert.equal(await page.locator('details[open]').count(),0);
 if(id==='swap-risk-quote'){
  await page.getByRole('button',{name:/Impacto de precio/}).focus();await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:'Impacto de precio',exact:true}).waitFor();
  await page.getByRole('button',{name:/Banda de liquidez/}).click();
  await page.getByRole('heading',{name:'Banda de liquidez',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Configurar consulta'}).count(),0);
 }else{
  await page.getByRole('navigation',{name:'Escenas del guion'}).getByRole('button').nth(1).focus();await page.keyboard.press('Enter');
  await page.locator('.script-scene').getByText('La primera forma',{exact:true}).waitFor();
  assert.equal(await page.getByText('Disponible en tu biblioteca',{exact:true}).count(),0);
 }
 await page.getByText('Detalles técnicos e integración',{exact:true}).click();await page.getByRole('heading',{name:'Ruta declarada',exact:true}).waitFor();
 await page.getByText('Detalles técnicos e integración',{exact:true}).click();
 const connect=page.getByRole('button',{name:'Conectar mi agente',exact:true});await connect.click();
 await page.getByRole('dialog',{name:'Conectar tu agente'}).waitFor();await page.keyboard.press('Escape');assert.equal(await connect.evaluate(el=>document.activeElement===el),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:`docs/ui-evidence/portfolio-${id}-${width}.png`,fullPage:true});
 assert.deepEqual(api,[]);assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${id} ${width}: public sample, keyboard, technical details, connect, zero API calls`);
}}finally{await browser.close();}
