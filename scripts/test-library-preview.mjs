import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{})});
try {for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:900}});
 await page.goto('http://127.0.0.1:3214/history/review');
 await page.getByText('Espacio de revisión · cuatro ejemplos ficticios · ningún pago realizado',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('WebMCP Status',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Siguiente →',exact:true}).click();
 await page.getByRole('heading',{name:'La primera forma',exact:true}).waitFor();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}},configurable:true}));
 await page.getByRole('button',{name:'Copiar escena',exact:true}).click();assert.ok((await page.evaluate(()=>window.__copied)).length>20);
 await page.getByRole('button').filter({hasText:'Movimiento, color y una idea'}).click();
 const video=page.locator('video');await video.waitFor();await video.evaluate(el=>{el.muted=true;return el.play();});await page.waitForFunction(()=>document.querySelector('video')?.currentTime>0.2);assert.equal(await video.locator('track').count(),1);
 await page.getByRole('button').filter({hasText:'Órbita / Pulso'}).click();
 for(const checkbox of await page.getByRole('checkbox',{name:'Comparar',exact:true}).all()) await checkbox.check();
 await page.getByRole('region',{name:'Comparación de variantes'}).waitFor();
 await page.getByRole('button',{name:/Ampliar/}).first().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar',exact:true}).first().click();assert.ok((await download).suggestedFilename());
 await page.getByRole('button').filter({hasText:'De la idea a la campaña'}).click();
 await page.getByRole('tab',{name:'Actividad del agente',exact:true}).click();
 await page.getByRole('tab',{name:'Pago y comprobante',exact:true}).click();
 await page.getByRole('tab',{name:'Resultado',exact:true}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('PASS demo '+width+': scene navigation/copy, video/subtitles, image comparison/zoom/download, tabs; no technical overlay or horizontal overflow');await page.close();
}} finally {await browser.close();}
