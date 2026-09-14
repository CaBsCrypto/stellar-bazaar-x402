import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{})});
try {for(const width of [1280,390]) for(const delivery of ['pending-recovery','pending-storage']) {
 const page=await browser.newPage({viewport:{width,height:900}});let writes=0;
 page.on('request',r=>{if(r.method()!=='GET')writes++;});
 const at='2026-09-14T12:00:00.000Z';
 const event={eventId:'qa-event',taskId:'qa-task',operationId:'qa-operation',mode:'mock',kind:'request-started',title:'Prueba aislada de recuperación',recordedAt:at,evidence:'agent-reported',result:{recoveryStatus:{payment:delivery==='pending-storage'?'verified-by-agent':'pending',delivery}}};
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());const view=url.searchParams.get('view');
  const body=url.pathname==='/api/operations'?{version:'1',records:[]}: {version:'2',items:view==='tasks'?[{id:'qa-task',title:'Tarea de prueba aislada',mode:'mock',updatedAt:at,status:'active',steps:1,purchases:0}]:view==='events'?[event]:[],nextCursor:null};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:3214/history');
 const enter=async()=>{await page.locator('#history-access-token').fill('local-browser-test-only');await page.getByRole('button',{name:'Consultar historial',exact:true}).click();await page.getByRole('button').filter({hasText:'Tarea de prueba aislada'}).click();};
 await enter();const panel=page.getByRole('region',{name:'Estado del pago y la entrega'});await panel.waitFor();
 await panel.getByText(delivery==='pending-storage'?'Pendiente de guardar':'Pendiente de recuperación',{exact:true}).waitFor();
 await panel.getByText(delivery==='pending-storage'?'Verificado por el agente':'Pendiente de confirmar',{exact:true}).waitFor();
 assert.equal(await panel.locator('time').getAttribute('datetime'),at);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'Bloquear y borrar vista',exact:true}).focus();await page.keyboard.press('Enter');await panel.waitFor({state:'detached'});await enter();await panel.waitFor();assert.equal(writes,0);
 await page.close();console.log('PASS browser '+width+' '+delivery+': separate truthful states, received timestamp, keyboard lock/reopen, no writes. Synthetic responses only.');
 }}finally{await browser.close();}
