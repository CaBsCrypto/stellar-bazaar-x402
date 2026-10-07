// Real browser against local Next; every API is synthetic and external traffic is blocked.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3297';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Loopback only');
const browser = await chromium.launch({headless: true, ...(process.env.BROWSER_EXE ? {executablePath: process.env.BROWSER_EXE} : {})});
const evidence=process.env.UI_SCREENSHOT_DIR;
if(evidence)await mkdir(evidence,{recursive:true});
const uuid = i => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const card = i => ({version: 'bazaar.service-card/v0', id: `synthetic-service-${i}`, name: `Servicio sintético ${i}`, description: 'Ficha sintética para verificar la interfaz local. No es un proveedor disponible.', kind: 'http', url: 'https://provider.invalid/text', routeTemplate: '/text', input: [{name:'text',type:'string',required:true}], network: 'stellar:testnet', payment: {scheme:'exact',asset:'USDC',amount:'0.01',destination:'G'+'A'.repeat(55),identity:USDC_TESTNET_PAYMENT_IDENTITY,marketplace:{protocol:'x402-stellar-exact-v2',resource:'/api/market/orders/{operationId}/x402'}}, provider:{name:'Proveedor sintético'}, tags:['texto']});
const entries = Array.from({length: 23}, (_, i) => ({submissionId:uuid(i),card:card(i),cardHash:'a'.repeat(64),status:'activated',purchase:{protocol:'x402-stellar-exact-v2'}}));
const orders = Array.from({length: 23}, (_, i) => ({operationId:uuid(100+i),card:card(i),cardHash:'a'.repeat(64),phase:i===0?'payment-uncertain':'delivered',perspective:'purchase',amount:'0.01',payer:'G'+'B'.repeat(55),destination:'G'+'A'.repeat(55),updatedAt:'2026-10-07T12:00:00Z',paymentProtocol:'x402-stellar-exact-v2',...(i ? {delivery:{reference:`synthetic-${i}`,text:'Entrega sintética local'}}:{})}));
const pageBody = (url, items, cursorKey='cursor') => {const limit=Number(url.searchParams.get('limit')??10),offset=Number(url.searchParams.get(cursorKey)?.replace('opaque-', '')??0);return {items:items.slice(offset,offset+limit),...(offset+limit<items.length?{nextCursor:`opaque-${offset+limit}`}:{})};};
const json = (route, value, status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
let checks=0;
try {
  for (const width of [1440,390]) {
    const context = await browser.newContext({viewport:{width,height:900},acceptDownloads:true}), page = await context.newPage();
    const errors=[],requests=[],creates=[],changes=[],unexpected=[],external=[];
    let permission={permission:'market:submit',revision:0,generation:1,allowServiceSubmission:false},firstCreate=true,firstGrant=true,paused=false,catalogFail=false,catalogEmpty=false,grantReadOnly=false;
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if(message.type()==='error'&&/hydration|hydrated|server rendered|Minified React error/i.test(message.text()))errors.push(message.text()); });
    await context.route('**/*', async route => {
      const request=route.request(),url=new URL(request.url());
      if (url.origin!==base) {external.push(url.origin);return route.abort();}
      if (!url.pathname.startsWith('/api/')) return route.continue();
      requests.push({path:url.pathname+url.search,method:request.method(),authorization:request.headers().authorization});
      if(url.pathname==='/api/market/catalog') {
        assert.equal(request.headers().authorization,undefined);
        if(catalogFail)return json(route,{error:{code:'MARKET_UNAVAILABLE'}},503);
        const p=pageBody(url,catalogEmpty?[]:entries);return json(route,{services:p.items,nextCursor:p.nextCursor,paused});
      }
      if(url.pathname==='/api/workspaces'&&request.method()==='POST') {
        creates.push(JSON.parse(request.postData()));
        if(firstCreate){firstCreate=false;return route.abort();}
        return json(route,{version:'1',record:{creationId:creates[0].creationId,workspaceId:uuid(500),generation:1,revoked:false}},201);
      }
      if(url.pathname==='/api/market/orders'&&request.method()==='GET'){const p=pageBody(url,orders);return json(route,{orders:p.items,nextCursor:p.nextCursor});}
      if(url.pathname==='/api/market/services'&&request.method()==='GET'){const p=pageBody(url,entries,'mineCursor');return json(route,{services:[],mine:p.items,mineNextCursor:p.nextCursor,paused});}
      if(url.pathname==='/api/market/agent-permissions') {
        if(request.method()==='GET') return grantReadOnly?json(route,{error:{code:'FORBIDDEN'}},403):json(route,{permission});
        const body=JSON.parse(request.postData());changes.push(body);
        if(firstGrant){firstGrant=false;permission={...permission,revision:1,allowServiceSubmission:body.allowServiceSubmission};return route.abort();}
        if(body.changeId!==changes[0].changeId)return json(route,{error:{code:'PERMISSION_CONFLICT'}},409);
        return json(route,{permission,created:false});
      }
      if(url.pathname.startsWith('/api/market/orders/')&&request.method()==='POST') {assert.deepEqual(JSON.parse(request.postData()),{action:'reconcile'});return json(route,{order:orders[0]});}
      unexpected.push({path:url.pathname,method:request.method()});return json(route,{error:{code:'SYNTHETIC_ROUTE_DISABLED'}},403);
    });
    await page.goto(base+'/open');
    await page.getByRole('heading',{level:1,name:'Un espacio para tu agente.'}).waitFor();
    // Screenshot capture changes caret styles. Wait for hydration before it touches inputs.
    await page.waitForFunction(expected=>Array.from(document.querySelectorAll('textarea')).some(el=>el.value===expected),base+'/api/mcp');
    if(evidence)await page.screenshot({path:join(evidence,`open-market-access-${width}.png`),fullPage:true});
    assert.equal(await page.getByRole('button',{name:'Descargar configuración MCP pública',exact:true}).count(),1);
    const publicDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar configuración MCP pública',exact:true}).click();
    const publicConfig=JSON.parse(await readFile(await (await publicDownload).path(),'utf8'));
    assert.deepEqual(publicConfig,{mcpServers:{bazaar:{type:'http',url:base+'/api/mcp'}}});
    assert.equal(creates.length,0);
    await page.getByRole('button',{name:'Preparar mi acceso privado',exact:true}).click();
    const create=page.getByRole('button',{name:'Crear mi espacio',exact:true});assert.equal(await create.isEnabled(),false);
    assert.equal(await page.getByRole('checkbox').isEnabled(),false);
    const rootDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar archivo de recuperación',exact:true}).click();
    const rootFile=await readFile(await (await rootDownload).path(),'utf8'),packet=JSON.parse(rootFile);
    assert.notEqual(packet.human,packet.agent);assert.equal(creates.length,0);
    await page.getByRole('checkbox').check();await create.click();
    await page.getByRole('button',{name:'Recuperar el mismo intento',exact:true}).waitFor();
    assert.equal(creates.length,1);assert.equal(await create.isEnabled(),false);
    await page.getByRole('button',{name:'Bloquear y retirar este acceso',exact:true}).click();
    await page.getByLabel('Ya tengo mi archivo de recuperación').setInputFiles({name:'synthetic-root.json',mimeType:'application/json',buffer:Buffer.from(rootFile)});
    await page.getByRole('button',{name:'Recuperar el mismo intento',exact:true}).click();
    await page.getByRole('button',{name:'Descargar configuración privada del agente',exact:true}).waitFor();
    assert.equal(creates.length,2);assert.deepEqual(creates[0],creates[1]);assert.equal(creates[0].creationId,packet.creationId);
    assert.equal(creates[0].humanAccessHash,createHash('sha256').update(packet.human).digest('hex'));
    const agentDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar configuración privada del agente',exact:true}).click();
    const agentConfig=JSON.parse(await readFile(await (await agentDownload).path(),'utf8'));
    assert.deepEqual(agentConfig,{mcpServers:{bazaar:{type:'http',url:base+'/api/mcp',headers:{Authorization:'Bearer '+packet.agent}}}});
    assert.equal(JSON.stringify(agentConfig).includes(packet.human),false);assert.equal(JSON.stringify(agentConfig).includes(packet.bootstrap),false);
    checks+=6;

    await page.goto(base+'/history');await page.getByRole('heading',{level:1,name:'Abre tu espacio privado'}).waitFor();
    await page.getByText('Tengo mi archivo o acceso privado',{exact:true}).click();
    await page.getByLabel('Restaurar mi archivo de recuperación',{exact:true}).setInputFiles({name:'synthetic-root.json',mimeType:'application/json',buffer:Buffer.from(rootFile)});
    await page.getByRole('heading',{name:'Historial privado de compras y ventas'}).waitFor();
    await page.getByRole('navigation',{name:'Páginas de pedidos'}).getByRole('button',{name:'Siguiente',exact:true}).waitFor({state:'visible'});
    const historyPager=page.getByRole('navigation',{name:'Páginas de pedidos'});
    await historyPager.getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByRole('heading',{name:'Compra · Servicio sintético 10',exact:true}).waitFor();
    await historyPager.getByRole('button',{name:'Anterior',exact:true}).click();await page.getByRole('heading',{name:'Compra · Servicio sintético 0',exact:true}).waitFor();
    await historyPager.getByRole('combobox').selectOption('20');await page.getByRole('heading',{name:'Compra · Servicio sintético 19',exact:true}).waitFor();
    assert.ok(requests.some(r=>r.path==='/api/market/orders?limit=10&cursor=opaque-10'));
    assert.ok(requests.some(r=>r.path==='/api/market/orders?limit=20'));
    assert.equal(await page.getByRole('button',{name:/Freighter|Firmar y pagar|Crear pedido/}).count(),0);
    await page.getByRole('button',{name:'Conciliar sin volver a pagar',exact:true}).click();
    await page.getByRole('button',{name:'Mis servicios y permiso de publicación',exact:true}).click();
    await page.getByRole('button',{name:'Preparar autorización',exact:true}).waitFor();
    const minePager=page.getByRole('navigation',{name:'Páginas de mis servicios'});
    await minePager.getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByRole('heading',{name:'Servicio sintético 10',exact:true}).waitFor();
    assert.ok(requests.some(r=>r.path==='/api/market/services?limit=10&mineCursor=opaque-10'));
    await page.getByRole('button',{name:'Preparar autorización',exact:true}).click();
    const confirm=page.getByRole('button',{name:'Confirmar permiso',exact:true});assert.equal(await confirm.isEnabled(),false);assert.equal(changes.length,0);
    const grantDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Guardar intención del permiso',exact:true}).click();
    const grantFile=await readFile(await (await grantDownload).path(),'utf8'),grant=JSON.parse(grantFile);
    assert.equal(grant.expectedRevision,0);assert.equal(grant.generation,1);assert.equal(grant.allowServiceSubmission,true);assert.equal(grant.origin,base);
    await page.getByRole('checkbox').check();await confirm.click();
    const recover=page.getByRole('button',{name:'Recuperar el mismo cambio',exact:true});await recover.waitFor();
    assert.equal(changes.length,1);
    await recover.click();await page.getByRole('button',{name:'Preparar revocación',exact:true}).waitFor();
    assert.deepEqual(changes[0],changes[1]);assert.equal(changes[0].changeId,grant.changeId);
    assert.deepEqual(Object.keys(changes[0]).sort(),['allowServiceSubmission','changeId','expectedRevision']);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}: private history overflow`);
    await page.getByRole('button',{name:'Bloquear espacio',exact:true}).click();await page.getByRole('heading',{name:'Abre tu espacio privado',exact:true}).waitFor();
    assert.equal(await page.getByText('Entrega sintética local',{exact:true}).count(),0);
    checks+=8;

    grantReadOnly=true;await page.goto(base+'/history#token='+packet.agent);
    await page.getByRole('heading',{name:'Historial privado de compras y ventas'}).waitFor();
    await page.getByRole('button',{name:'Mis servicios y permiso de publicación',exact:true}).click();
    await page.getByText('Este acceso puede consultar el espacio. Abre el acceso humano de tu archivo de recuperación para administrar el permiso.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Preparar autorización',exact:true}).count(),0);
    assert.equal(new URL(page.url()).hash,'');
    await page.getByRole('button',{name:'Bloquear espacio',exact:true}).click();checks+=2;

    await page.goto(base+'/catalogo');await page.getByRole('heading',{level:1,name:'Servicios para tu agente'}).waitFor();
    await page.getByRole('heading',{name:'Servicio sintético 9',exact:true}).waitFor();
    assert.equal(await page.locator('article').count(),10);
    if(evidence)await page.screenshot({path:join(evidence,`open-market-catalog-${width}.png`)});
    const catalogPager=page.getByRole('navigation',{name:'Páginas del catálogo'});
    await catalogPager.getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByRole('heading',{name:'Servicio sintético 10',exact:true}).waitFor();
    await catalogPager.getByRole('button',{name:'Anterior',exact:true}).click();await page.getByRole('heading',{name:'Servicio sintético 0',exact:true}).waitFor();
    await catalogPager.getByRole('combobox').selectOption('20');await page.getByRole('heading',{name:'Servicio sintético 19',exact:true}).waitFor();
    assert.equal(await page.locator('article').count(),20);
    paused=true;await page.getByRole('button',{name:'Actualizar esta página',exact:true}).click();await page.getByText('Nuevas publicaciones y compras pausadas. Puedes consultar servicios y recuperar tu historial.',{exact:true}).waitFor();
    catalogFail=true;await page.getByRole('button',{name:'Actualizar esta página',exact:true}).click();await page.getByRole('alert').filter({hasText:'No pudimos comprobar esta página'}).waitFor();
    assert.equal(await page.locator('article').count(),0,'Unavailable catalog must remove stale availability');
    catalogFail=false;catalogEmpty=true;await page.getByRole('button',{name:'Actualizar esta página',exact:true}).click();await page.getByRole('heading',{name:'Aún no hay servicios activos en esta página',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}: catalog overflow`);
    checks+=4;

    await page.goto(base+'/hub');const firstTab=page.getByRole('tab',{name:'Comprar',exact:true});await firstTab.focus();await firstTab.press('End');
    assert.equal(await page.getByRole('tab',{name:'MCP',exact:true}).getAttribute('aria-selected'),'true');
    assert.equal(await page.getByRole('tab',{name:'MCP',exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.getByLabel('Configuración MCP pública',{exact:true}).waitFor();await page.getByRole('tab',{name:'MCP',exact:true}).press('Home');
    assert.equal(await firstTab.getAttribute('aria-selected'),'true');await firstTab.press('ArrowRight');
    assert.equal(await page.getByRole('tab',{name:'Publicar',exact:true}).getAttribute('aria-selected'),'true');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}: hub overflow`);
    if(width===390){const menu=page.getByRole('button',{name:'Menú',exact:true});await menu.focus();await menu.press('Enter');await page.getByRole('dialog',{name:'Navegación',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await menu.evaluate(el=>el===document.activeElement),true);}
    await page.goto(base+'/publish');await page.getByRole('heading',{level:1,name:'Ofrece un servicio con tu agente'}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}: publish overflow`);
    await page.goto(base+'/open');await page.getByRole('heading',{level:1,name:'Un espacio para tu agente.'}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}: open overflow`);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(unexpected,[]);
    checks+=5;await context.close();
  }
  console.log(JSON.stringify({ok:true,checks,widths:[1440,390],recoveryFileBeforeSignup:true,sameUuidLostAckReplay:true,privateAgentOnlyConfig:true,humanGrantLostAckReplay:true,catalogMineHistoryPaging:true,keyboardTabsAndMobileMenu:true,noHumanWalletFlow:true,hostedRequests:0,actualPayments:0,limitation:'Synthetic APIs; native browser zoom and backend/store acceptance are separate checks.'}));
} finally {await browser.close();}
