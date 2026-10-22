import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {createPrivateReadQueue} from '../lib/private-read-queue.ts';

// Actual component hooks with path-addressed synthetic replies. No browser, network,
// wallet SDK, provider, Redis, payment, signer or ledger is available to this harness.
const compiled=ts.transpileModule(readFileSync('components/MarketplaceWorkspace.tsx','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
}).outputText;
const ORIGIN='https://bazaar.invalid',CHANGE_ID='aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa';
const service=(name='Servicio A',status='activated')=>({submissionId:'service-submission',cardHash:'card-hash',status,
  card:{id:'guionista-text',name,description:'Generación algorítmica',payment:{asset:'USDC',amount:'0.01',destination:'SELLER_PUBLIC_ACCOUNT'},
    input:[{name:'tema',type:'string',required:true}]},control:{domain:'https://provider.invalid',verificationPath:'/.well-known/bazaar-marketplace-proof.txt',expectedRecord:'synthetic-control-record'}});
const order=(name='Guionista',phase='awaiting-payment',extra={})=>({operationId:'order-id',perspective:'purchase',card:service(name).card,
  cardHash:'card-hash',amount:'0.01',payer:'BUYER_PUBLIC_ACCOUNT',destination:'SELLER_PUBLIC_ACCOUNT',
  paymentProtocol:'x402-stellar-exact-v2',updatedAt:'2026-10-10T00:00:00Z',phase,...extra});
const permission=(allowServiceSubmission=false,generation=1,revision=0)=>({permission:'market:submit',allowServiceSubmission,generation,revision});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};}
function harness({view='all',access='synthetic-owner-a'}={}){
  const slots=[],effects=[],requests=[],downloads=[],unexpected=[];
  let cursor=0,tree,locks=0,intentionSequence=0,props={view,access,onLock:()=>locks++};
  const serializedPrivateRead=createPrivateReadQueue();
  const hooks={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},
    useEffect(fn,deps){const i=cursor++,prior=slots[i];if(!prior||deps.some((v,j)=>v!==prior.deps[j]))effects.push(()=>{prior?.cleanup?.();slots[i]={deps,cleanup:fn()};});}
  };
  class LocalURL extends URL {static createObjectURL(){return'blob:synthetic-permission';}static revokeObjectURL(){}}
  const jsx=(type,props)=>({type,props}),module={exports:{}};
  vm.runInNewContext(compiled,{
    module,exports:module.exports,AbortController,AbortSignal,DOMException,URLSearchParams,URL:LocalURL,Blob,
    location:{origin:ORIGIN},window:{location:{origin:ORIGIN,search:''}},crypto:{randomUUID:()=>intentionSequence++===0?CHANGE_ID:CHANGE_ID.slice(0,-1)+'b'},
    setTimeout:()=>1,clearTimeout(){},
    document:{createElement(){return{click(){downloads.push({name:this.download,href:this.href});}};}},
    fetch(url,options){
      const parsed=new URL(url,ORIGIN),method=options.method??'GET';
      const collection=method==='GET'&&['/api/market/orders','/api/market/services','/api/market/agent-permissions'].includes(parsed.pathname);
      const permissionWrite=method==='POST'&&parsed.pathname==='/api/market/agent-permissions';
      const recovery=method==='POST'&&parsed.pathname==='/api/market/orders/order-id'&&options.body===JSON.stringify({action:'reconcile'});
      const withdrawal=method==='POST'&&parsed.pathname==='/api/market/services/service-submission'&&options.body===JSON.stringify({action:'withdraw'});
      if(parsed.origin!==ORIGIN||!(collection||permissionWrite||recovery||withdrawal)){
        unexpected.push({path:parsed.pathname,method});throw Error('UNEXPECTED_COMPONENT_ROUTE');
      }
      const waiting=deferred();
      requests.push({url:String(url),pathname:parsed.pathname,query:parsed.searchParams,options,method,
        access:options.headers.Authorization.slice('Bearer '.length),settled:false,...waiting});
      return waiting.promise;
    },
    require(name){
      if(name==='react')return hooks;
      if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
      if(name==='./MarketplaceWorkspace.module.css')return{default:{}};
      if(name==='./ServiceShare')return{ServiceShare:'ServiceShare'};
      if(name==='../lib/private-read-queue')return{serializedPrivateRead};
      throw Error('UNEXPECTED_COMPONENT_MODULE');
    }
  });
  function render(){cursor=0;tree=module.exports.default(props);while(effects.length)effects.shift()();return tree;}
  function nodes(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);if(typeof node.type==='function')return nodes(node.type(node.props));return[node,...nodes(node.props?.children)];}
  function text(node){if(arguments.length===0)node=tree;if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(text).join('');if(typeof node!=='object')return String(node);return text(typeof node.type==='function'?node.type(node.props):node.props?.children);}
  function button(label,scope){const found=nodes(scope??tree).find(v=>v.type==='button'&&text(v)===label);assert(found,'Missing button '+label);return found;}
  function pending(path,{method='GET',owner=props.access}={}){const found=requests.filter(r=>!r.settled&&r.pathname===path&&r.method===method&&r.access===owner);assert.equal(found.length,1,'Exactly one pending '+method+' '+path);return found[0];}
  async function answer(path,value,{ok=true,method='GET',owner=props.access}={}){
    const request=pending(path,{method,owner});request.settled=true;request.resolve({ok,json:async()=>value});await tick();render();return request;
  }
  function switchAccess(access='synthetic-owner-b'){props={...props,access};render();render();}
  function file(){const found=nodes().find(v=>v.type==='input'&&v.props.type==='file');assert(found,'Permission recovery file input');return found;}
  function nav(label){const found=nodes().find(v=>v.type==='nav'&&v.props['aria-label']===label);assert(found);return found;}
  function checkbox(){const found=nodes().find(v=>v.type==='input'&&v.props.type==='checkbox');assert(found);return found;}
  function verify(){
    assert.equal(unexpected.length,0);
    for(const r of requests){
      assert.equal(r.options.credentials,'same-origin');assert.equal(r.options.redirect,'error');assert.equal(r.options.cache,'no-store');
      assert.equal(r.options.headers.Authorization,'Bearer '+r.access);assert(!r.url.includes(r.access),'Credentials stay in Authorization');
      if(r.method==='POST')assert.equal(r.options.headers['Content-Type'],'application/json');
    }
  }
  return{requests,downloads,render,nodes,text,button,pending,answer,switchAccess,file,nav,checkbox,verify,
    access:()=>props.access,locks:()=>locks,clean(){verify();slots.forEach(v=>v?.cleanup?.());}};
}
const completed=[];
async function scenario(name,run){await run();completed.push(name);}
async function populated({mine=[service()],orders=[],grant=permission(),paused=false,view='all',nextCursor,mineNextCursor}={}){
  const h=harness({view});h.render();h.render();
  assert.equal(h.requests.length,1);assert.equal(h.pending('/api/market/orders').query.get('limit'),'10');
  await h.answer('/api/market/orders',{orders,nextCursor});
  if(view==='all'){
    assert.equal(h.requests.length,2,'Own services wait for the first private read');
    assert.equal(h.pending('/api/market/services').query.get('limit'),'10');
    await h.answer('/api/market/services',{mine,paused,mineNextCursor});
    assert.equal(h.requests.length,3,'Permission follows own services');
    await h.answer('/api/market/agent-permissions',{permission:grant});
  }
  return h;
}
function prepareAndConfirm(h,{allow=true}={}){
  h.button(allow?'Preparar autorización':'Preparar revocación').props.onClick();h.render();
  assert.equal(h.button('Confirmar permiso').props.disabled,true);
  h.button('Guardar intención del permiso').props.onClick();h.render();
  assert.equal(h.button('Confirmar permiso').props.disabled,true);
  h.checkbox().props.onChange({target:{checked:true}});h.render();assert.equal(h.button('Confirmar permiso').props.disabled,false);
  h.button('Confirmar permiso').props.onClick();h.render();
}

await scenario('sequential empty private reads and current UI',async()=>{
  const h=await populated({mine:[]});
  assert.match(h.text(),/Aún no tienes pedidos en esta página/);assert.match(h.text(),/No hay servicios propios/);
  assert.match(h.text(),/historial privado dura siete días/);
  assert(h.nodes().some(n=>n.type==='a'&&n.props.href==='/hub'));assert(h.nodes().some(n=>n.type==='a'&&n.props.href==='/catalogo'));
  assert(!h.nodes().some(n=>n.type==='button'&&/Firmar|pagar.*Freighter|Conectar Freighter/.test(h.text(n))));h.clean();
});
await scenario('immutable order details, verified receipt and uncertain execution',async()=>{
  const h=await populated({orders:[order('Guionista pendiente'),order('Guionista entregado','delivered',{operationId:'delivered-id',
    transactionHash:'a'.repeat(64),paymentVerifiedAt:'2026-10-10T00:00:01Z',delivery:{text:'Resultado sintético',reference:'bazaar-order:delivered-id'}}),
    order('Guionista incierto','execution-uncertain',{operationId:'uncertain-id'})]});
  for(const pattern of [/Compra · Guionista pendiente/,/0\.01 USDC/,/BUYER_PUBLIC_ACCOUNT/,/SELLER_PUBLIC_ACCOUNT/,/card-hash/,
    /x402-stellar-exact-v2/,/Verificada por Bazaar/,/Resultado sintético/,/ejecución incierta/,/no se ejecuta de nuevo automáticamente/])assert.match(h.text(),pattern);
  assert(h.nodes().some(n=>n.type==='a'&&n.props.href==='https://stellar.expert/explorer/testnet/tx/'+'a'.repeat(64)));h.clean();
});
await scenario('history view does not eagerly read service permissions',async()=>{
  const h=await populated({view:'history',orders:[order()]});assert.equal(h.requests.length,1);assert(!h.text().includes('Preparar autorización'));
  h.button('Mis servicios y permiso de publicación').props.onClick();h.render();
  await h.answer('/api/market/services',{mine:[],paused:false});await h.answer('/api/market/agent-permissions',{permission:permission()});
  assert.match(h.text(),/Permiso de publicación del agente/);h.clean();
});
await scenario('late old owner response cannot start another private read',async()=>{
  const h=harness();h.render();const old=h.pending('/api/market/orders');h.switchAccess();assert.equal(old.options.signal.aborted,true);
  await h.answer('/api/market/orders',{orders:[order('Viejo dueño')]},{owner:'synthetic-owner-a'});assert.equal(h.requests.length,2);
  await h.answer('/api/market/orders',{orders:[order('Nuevo dueño')]});
  await h.answer('/api/market/services',{mine:[service('Servicio nuevo dueño')],paused:false});
  await h.answer('/api/market/agent-permissions',{permission:permission(false,2)});
  assert(h.text().includes('Nuevo dueño'));assert(!h.text().includes('Viejo dueño'));
  assert(h.requests.slice(2).every(r=>r.access==='synthetic-owner-b'));h.clean();
});
await scenario('switching owner immediately clears loaded private content',async()=>{
  const h=await populated({orders:[order('Compra anterior')],mine:[service('Servicio anterior')]});h.switchAccess();
  assert(!h.text().includes('Compra anterior'));assert(!h.text().includes('Servicio anterior'));
  await h.answer('/api/market/orders',{orders:[]});await h.answer('/api/market/services',{mine:[],paused:false});
  await h.answer('/api/market/agent-permissions',{permission:permission(false,2)});h.clean();
});
await scenario('locking cancels a refresh and discards its late error',async()=>{
  const h=await populated({orders:[order('Compra privada')]});h.button('Actualizar esta página de pedidos').props.onClick();h.render();
  const request=h.pending('/api/market/orders');h.button('Bloquear espacio').props.onClick();h.render();assert.equal(request.options.signal.aborted,true);
  await h.answer('/api/market/orders',{error:{code:'OLD_OWNER_ERROR'}},{ok:false});
  assert.equal(h.locks(),1);assert(!h.text().includes('Compra privada'));assert(!h.text().includes('OLD_OWNER_ERROR'));
  assert(!h.nodes().some(n=>n.props?.role==='alert'));assert.equal(h.requests.length,4);h.clean();
});
await scenario('forbidden publication permission becomes read only',async()=>{
  const h=harness();h.render();await h.answer('/api/market/orders',{orders:[order()]});await h.answer('/api/market/services',{mine:[service()],paused:false});
  await h.answer('/api/market/agent-permissions',{error:{code:'FORBIDDEN'}},{ok:false});
  assert.match(h.text(),/Este acceso puede consultar el espacio/);assert(!h.text().includes('Preparar autorización'));
  assert(!h.nodes().some(n=>n.props?.role==='alert'));h.clean();
});
await scenario('human grant and revoke require saved explicit intention',async()=>{
  const h=await populated();assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
  prepareAndConfirm(h);const grant=h.pending('/api/market/agent-permissions',{method:'POST'});
  assert.deepEqual(JSON.parse(grant.options.body),{changeId:CHANGE_ID,expectedRevision:0,allowServiceSubmission:true});
  assert.equal(h.downloads[0].name,'bazaar-publication-permission.json');
  await h.answer('/api/market/agent-permissions',{permission:permission(true,1,1)},{method:'POST'});
  assert.match(h.text(),/La rotación o revocación del acceso lo invalida/);
  prepareAndConfirm(h,{allow:false});const revoke=h.pending('/api/market/agent-permissions',{method:'POST'});
  assert.deepEqual(JSON.parse(revoke.options.body),{changeId:CHANGE_ID.slice(0,-1)+'b',expectedRevision:1,allowServiceSubmission:false});
  assert.notEqual(JSON.parse(revoke.options.body).changeId,JSON.parse(grant.options.body).changeId);
  await h.answer('/api/market/agent-permissions',{permission:permission(false,1,2)},{method:'POST'});h.clean();
});
await scenario('uncertain permission response preserves exact explicit recovery',async()=>{
  const h=await populated();prepareAndConfirm(h);const original=h.pending('/api/market/agent-permissions',{method:'POST'}).options.body;
  await h.answer('/api/market/agent-permissions',{error:{code:'WORKSPACE_UNAVAILABLE'}},{ok:false,method:'POST'});
  assert.match(h.text(),/El resultado requiere comprobación/);assert.equal(h.requests.length,4,'No automatic write retry');
  h.button('Recuperar el mismo cambio').props.onClick();h.render();
  assert.equal(h.pending('/api/market/agent-permissions',{method:'POST'}).options.body,original);
  await h.answer('/api/market/agent-permissions',{permission:permission(true,1,1)},{method:'POST'});h.clean();
});
await scenario('late permission file is ignored after lock',async()=>{
  const h=await populated(),waiting=deferred();h.file().props.onChange({target:{files:[{size:200,text:()=>waiting.promise}],value:'file'}});
  h.button('Bloquear espacio').props.onClick();h.render();waiting.resolve('malformed stale private file');await tick();h.render();
  assert.equal(h.locks(),1);assert(!h.nodes().some(n=>n.props?.role==='alert'));assert(!h.text().includes('Intención restaurada'));h.clean();
});
await scenario('late file error cannot leak across owner switch',async()=>{
  const h=await populated(),waiting=deferred();h.file().props.onChange({target:{files:[{size:200,text:()=>waiting.promise}],value:'file'}});
  h.switchAccess();waiting.resolve('malformed old owner file');await tick();h.render();assert(!h.nodes().some(n=>n.props?.role==='alert'));
  await h.answer('/api/market/orders',{orders:[]});await h.answer('/api/market/services',{mine:[],paused:false});
  await h.answer('/api/market/agent-permissions',{permission:permission(false,2)});h.clean();
});
await scenario('restored intention rejects wrong generation or origin before POST',async()=>{
  const h=await populated({grant:permission(false,2,3)});
  for(const bad of [{origin:ORIGIN,generation:1},{origin:'https://foreign.invalid',generation:2}]){
    const value={version:1,...bad,changeId:CHANGE_ID,expectedRevision:3,allowServiceSubmission:true};
    h.file().props.onChange({target:{files:[{size:200,text:async()=>JSON.stringify(value)}],value:'file'}});await tick();h.render();
    assert.match(h.text(),/no corresponde a este origen y generación/);
  }
  assert.equal(h.requests.filter(r=>r.method==='POST').length,0);h.clean();
});
await scenario('credential rotation clears old intent and ignores late POST outcome',async()=>{
  const h=await populated();prepareAndConfirm(h);const old=h.pending('/api/market/agent-permissions',{method:'POST'});
  h.switchAccess('synthetic-owner-a-rotated');assert.equal(old.options.signal.aborted,true);assert(!h.text().includes('Confirmar permiso'));
  await h.answer('/api/market/agent-permissions',{permission:permission(true,1,1)},{method:'POST',owner:'synthetic-owner-a'});
  await h.answer('/api/market/orders',{orders:[]});await h.answer('/api/market/services',{mine:[],paused:false});
  await h.answer('/api/market/agent-permissions',{permission:permission(false,2,0)});
  assert.match(h.text(),/generación 2, revisión 0/);assert(!h.text().includes('Permiso confirmado'));h.clean();
});
await scenario('revoked private read reports denial without automatic retry',async()=>{
  const h=await populated();h.button('Actualizar esta página de pedidos').props.onClick();h.render();
  await h.answer('/api/market/orders',{error:{code:'UNAUTHORIZED'}},{ok:false});assert.match(h.text(),/UNAUTHORIZED/);
  assert.equal(h.requests.length,4);h.button('Bloquear espacio').props.onClick();h.render();
  assert(!h.text().includes('Servicio A'));assert(!h.nodes().some(n=>n.props?.role==='alert'));h.clean();
});
await scenario('existing uncertain payment reconciles without a payment route',async()=>{
  const h=await populated({orders:[order('Compra incierta','payment-uncertain'),order('Venta incierta','payment-uncertain',{operationId:'sale-id',perspective:'sale'})]});
  assert.equal(h.nodes().filter(n=>n.type==='button'&&h.text(n)==='Conciliar sin volver a pagar').length,1);
  h.button('Conciliar sin volver a pagar').props.onClick();h.render();
  assert.equal(h.pending('/api/market/orders/order-id',{method:'POST'}).options.body,JSON.stringify({action:'reconcile'}));
  await h.answer('/api/market/orders/order-id',{order:{phase:'paid'}},{method:'POST'});
  await h.answer('/api/market/orders',{orders:[order('Compra conciliada','paid')]});
  assert.match(h.text(),/Pago verificado · pendiente de agente/);assert(!h.text().includes('Conciliar sin volver a pagar'));h.clean();
});
await scenario('withdrawal refreshes own services while retaining existing orders',async()=>{
  const h=await populated({grant:permission(true,1,1),orders:[order('Compra conservada','paid')],paused:true});
  assert.match(h.text(),/lectura y recuperación del historial siguen disponibles/);assert.match(h.text(),/synthetic-control-record/);
  h.button('Retirar de nuevas compras').props.onClick();h.render();
  await h.answer('/api/market/services/service-submission',{status:'withdrawn'},{method:'POST'});
  await h.answer('/api/market/services',{mine:[service('Servicio A','withdrawn')],paused:true});
  assert.equal(h.button('Retirar de nuevas compras').props.disabled,true);assert.match(h.text(),/Compra conservada/);h.clean();
});
await scenario('public sharing is shown only for approved current own services',async()=>{
  const h=await populated({mine:[service('Approved','activated'),service('Review pending','submitted'),service('Withdrawn','withdrawn')]});
  const shares=h.nodes().filter(n=>n.type==='ServiceShare');assert.equal(shares.length,1);
  assert.deepEqual(Object.keys(shares[0].props).sort(),['serviceId','serviceName']);
  assert.equal(shares[0].props.serviceId,'guionista-text');assert.equal(shares[0].props.serviceName,'Approved');
  assert(!JSON.stringify(shares[0].props).includes(h.access()),'Sharing never receives the private credential');
  h.switchAccess();assert.equal(h.nodes().filter(n=>n.type==='ServiceShare').length,0,'Old owner share is cleared with private state');
  await h.answer('/api/market/orders',{orders:[]});await h.answer('/api/market/services',{mine:[],paused:false});
  await h.answer('/api/market/agent-permissions',{permission:permission(false,2)});h.clean();
});
await scenario('pagination uses opaque cursor and owner change clears it',async()=>{
  const h=await populated({orders:[order()],nextCursor:'synthetic-opaque-cursor'});
  h.button('Siguiente',h.nav('Páginas de pedidos')).props.onClick();h.render();
  assert.equal(h.pending('/api/market/orders').query.get('cursor'),'synthetic-opaque-cursor');
  await h.answer('/api/market/orders',{orders:[]});assert.match(h.text(),/Página 2/);h.switchAccess();
  assert.equal(h.pending('/api/market/orders').query.has('cursor'),false);
  await h.answer('/api/market/orders',{orders:[]});await h.answer('/api/market/services',{mine:[],paused:false});
  await h.answer('/api/market/agent-permissions',{permission:permission(false,2)});h.clean();
});
console.log(JSON.stringify({status:'PASS',scenarios:completed.length,checks:completed,component:'components/MarketplaceWorkspace.tsx',
  pathAddressedMocks:true,realPrivateReadQueue:true,externalRequests:0,realPayments:0,walletOrSigningCalls:0,redisCalls:0,browserUsed:false}));
