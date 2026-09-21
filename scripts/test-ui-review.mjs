import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const base=process.env.BASE_URL ?? "http://localhost:3221";
const stage=process.env.UI_STAGE ?? "design";
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});
await mkdir("docs/ui-evidence",{recursive:true});
let writes=0; const errors=[];
try {
 for (const [name,width] of [["desktop",1440],["mobile",390]]) {
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route("**/api/**",async route=>{if(route.request().method()!=="GET"){writes++; await route.abort();}else await route.continue();});
  const page=await context.newPage(); page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base,{waitUntil:"networkidle"});
  await page.getByRole("heading",{level:1}).waitFor();
  assert.equal(await page.getByRole("link",{name:"Conectar mi agente",exact:true}).count(),1);
  await page.screenshot({path:`docs/ui-evidence/${stage}-${name}.png`,fullPage:true});
  if(width<700){
   const trigger=page.getByRole("button",{name:"Menú",exact:true}); await trigger.focus(); await trigger.press("Enter");
   assert.equal(await page.getByRole("dialog",{name:"Navegación"}).isVisible(),true);
   await page.keyboard.press("Escape"); assert.equal(await page.getByRole("dialog").isVisible(),false);
   assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  }
  await page.goto(`${base}/catalogo`,{waitUntil:"networkidle"});
  assert.equal(await page.locator(".ui-service-card").count(),2);
  await page.getByLabel("Buscar servicio",{exact:true}).fill("zzzinexistente");
  await page.getByRole("heading",{name:"No encontramos servicios"}).waitFor();
  await page.getByRole("button",{name:"Restablecer filtros"}).click();
  assert.equal(await page.locator(".ui-service-card").count(),2);
  await page.getByRole("button",{name:"Guiones de video",exact:true}).click();
  assert.equal(await page.locator(".ui-service-card").count(),1);
  await page.getByRole("link",{name:"Ver condiciones y detalle"}).click();
  await page.getByRole("heading",{level:1,name:"AI Video Scriptwriter & Creative Director"}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Configurar consulta"}).count(),0);
  if(stage==="hub"){
   await page.goto(`${base}/hub`,{waitUntil:"networkidle"});
   await page.getByRole("tab",{name:"MCP",exact:true}).click();
   await page.getByLabel("Configuración MCP",{exact:true}).waitFor();
   await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__qaCopied=text;}}}));
   await page.getByRole("button",{name:"Copiar configuración mcp",exact:true}).click();
   assert.match(await page.evaluate(()=>window.__qaCopied),/mcpServers/);
   await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw Error("denied");}}}));
   await page.getByRole("button",{name:"Copiar configuración mcp",exact:true}).click();
   await page.getByText("No se pudo copiar. Selecciona el texto y cópialo manualmente.",{exact:true}).waitFor();
   assert.ok(await page.getByLabel("Configuración MCP",{exact:true}).evaluate(el=>el.selectionEnd>el.selectionStart));
   await page.getByRole("tab",{name:"Publicar",exact:true}).click();
   await page.getByRole("tabpanel").getByRole("link",{name:"Publicar API",exact:false}).waitFor();
   await page.getByRole("tab",{name:"Publicar",exact:true}).press("ArrowLeft");
   assert.equal(await page.getByRole("tab",{name:"Comprar",exact:true}).getAttribute("aria-selected"),"true");
   await page.screenshot({path:`docs/ui-evidence/hub-page-${name}.png`,fullPage:true});
   await page.goto(`${base}/lab`,{waitUntil:"networkidle"});
   await page.getByRole("heading",{level:1,name:"Laboratorio"}).waitFor();
   await page.screenshot({path:`docs/ui-evidence/lab-${name}.png`,fullPage:true});
  }
  await page.goto(`${base}/publish`,{waitUntil:"networkidle"});
  await page.getByLabel("Precio / Price",{exact:true}).fill("-1");
  assert.equal(await page.getByRole("button",{name:/Solicitar revisión manual/}).isEnabled(),false);
  assert.equal(await page.locator(".staking-section").count(),0);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false,`${name}: horizontal overflow`);
  await context.close();
 }
 assert.equal(writes,0,"Unexpected API mutation attempted"); assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,stage,widths:[1440,390],filterReset:true,scriptwriterDetail:true,keyboardModal:true,writes,pageErrors:errors}));
}finally{await browser.close();}
