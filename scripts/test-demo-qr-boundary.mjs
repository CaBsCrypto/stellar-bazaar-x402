import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import ts from 'typescript';
import vm from 'node:vm';
import {pilotRoutePolicy,pilotRedirectPath} from '../lib/pilot-route-policy.ts';
// Next's server bootstrap normally installs this global before server imports.
globalThis.AsyncLocalStorage=AsyncLocalStorage;
const [{NextRequest},{default:nextTesting},{proxy,config},{marketHandlers}]=await Promise.all([
 import('next/server.js'),import('next/experimental/testing/server.js'),import('../proxy.ts'),import('../lib/marketplace-http.ts')]);
// The installed guide names the renamed proxy helper; this package still exports
// the native middleware matcher. Use that exact native implementation, not a mock.
const unstable_doesProxyMatch=nextTesting.unstable_doesProxyMatch??nextTesting.unstable_doesMiddlewareMatch;
assert.equal(typeof unstable_doesProxyMatch,'function');

// Native Next objects and actual handlers, synthetic credentials only. No sockets,
// Redis, provider, wallet, signer, facilitator or deployment are used.
Object.assign(process.env,{BAZAAR_PUBLIC_DEMO:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ROUTE_BOUNDARY:'true',
 BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://bazaar.invalid',
 BAZAAR_MARKET_FILES_ENABLED:'false',
 BAZAAR_WORKSPACE_PREFIX:'bazaar-workspace:qr-offline',BAZAAR_OPERATIONAL_METER:'false',BAZAAR_ACCEPTANCE_METER:'false',
 BAZAAR_MARKET_OPERATOR_HASH:createHash('sha256').update('o'.repeat(43)).digest('hex')});
let externalRequests=0;
globalThis.fetch=async()=>{externalRequests++;throw Error('NETWORK_FORBIDDEN');};
const checks=[];
async function check(name,run){await run();checks.push(name);}
const request=(path,method='GET',headers={},body)=>new NextRequest('https://bazaar.invalid'+path,{method,headers,...(body!==undefined?{body}:{})});
function privacy(response){assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('x-content-type-options'),'nosniff');}
await check('both printed QR root methods reach the native marketplace landing',async()=>{
 for(const method of ['GET','HEAD']){const r=await proxy(request('/',method));assert.equal(r.status,200);assert.equal(r.headers.get('x-middleware-next'),'1');assert.equal(r.headers.get('location'),null);privacy(r);}
 assert.equal(pilotRedirectPath(),'/demo');
});
await check('only four public illustrations pass; private, unknown and encoded paths stay closed',async()=>{
 const illustrations=['/demo-deliveries/afiche-orbita.png','/demo-deliveries/afiche-pulso.png','/demo-deliveries/clip-demostracion.mp4','/demo-deliveries/subtitulos.vtt'];
 for(const path of illustrations)for(const method of ['GET','HEAD']){const r=await proxy(request(path,method));assert.equal(r.status,200);assert.equal(r.headers.get('x-middleware-next'),'1');privacy(r);}
 for(const path of illustrations)for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal((await proxy(request(path,method))).status,404);
 for(const path of ['/demo-deliveries/unknown.png','/demo-deliveries/afiche-orbita.png/extra','/demo-deliveries/%61fiche-orbita.png','/demo-deliveries/../afiche-orbita.png','/demo-deliveries/%2e%2e/afiche-orbita.png','/deliverables/private.png','/api/deliveries/private-file','/api/discovery/resources','/api/discovery/search'])for(const method of ['GET','HEAD'])assert.equal((await proxy(request(path,method))).status,404);
});
await check('demo entry, exact QR assets, guides and human workspace pages pass boundary',async()=>{
 for(const path of ['/demo','/storage','/demo-qr.svg','/bazaar-qr.svg','/resources/synthetic-service','/resources/synthetic-service/qr.svg','/AGENT_CONNECTION.md','/DEMO_TESTNET.md','/open','/hub','/catalogo','/publish','/history'])for(const method of ['GET','HEAD']){
  assert(unstable_doesProxyMatch({config,url:'https://bazaar.invalid'+path}));const r=await proxy(request(path,method));assert.equal(r.status,200);assert.equal(r.headers.get('x-middleware-next'),'1');privacy(r);
 }
});
await check('framework static assets keep Next matcher behavior',()=>{
 assert.equal(unstable_doesProxyMatch({config,url:'https://bazaar.invalid/_next/static/chunks/demo.js'}),false);
 assert.equal(pilotRoutePolicy('/_next/static/chunks/demo.js','GET'),'allow');
});
await check('administrator, generic media, upload and payment simulation stay closed',async()=>{
 for(const path of ['/admin','/api/admin/magic-link','/api/buyer-execution/reference','/api/deliveries/uploads','/api/deliveries/confirm','/api/x402/demo-pay','/demo-deliveries/video.mp4','/cover.jpg']){
  const r=await proxy(request(path));assert.equal(r.status,404);privacy(r);
 }
 for(const path of ['/demo-qr.svg','/bazaar-qr.svg','/demo','/resources/synthetic-service/qr.svg'])assert.equal((await proxy(request(path,'POST'))).status,404);
 for(const path of ['/resources/synthetic-service/qrXsvg','/resources/synthetic-service/secret.svg','/resources/synthetic-service/qr.svg/admin'])assert.equal((await proxy(request(path))).status,404);
});
await check('private account and capacity APIs require bearer; capacity does not allow GET',async()=>{
 for(const path of ['/api/account/identity','/api/account/queries','/api/market/orders'])assert.equal((await proxy(request(path))).status,401);
 assert.equal((await proxy(request('/api/market/capacity','POST',{'content-type':'application/json'},'{}'))).status,401);
 assert.equal((await proxy(request('/api/market/capacity'))).status,404);
 const r=await proxy(request('/api/market/capacity','POST',{authorization:'Bearer '+'a'.repeat(43),'content-type':'application/json'},'{}'));
 assert.equal(r.headers.get('x-middleware-next'),'1','Format gate delegates actual agent authorization to its handler');
});
await check('foreign origins, malformed credentials and oversized bodies fail before I/O',async()=>{
 assert.equal((await proxy(request('/api/market/catalog','GET',{origin:'https://other.invalid'}))).status,400);
 assert.equal((await proxy(request('/api/market/orders','GET',{authorization:'Bearer short'}))).status,401);
 const r=await proxy(request('/api/workspaces','POST',{authorization:'Bearer '+'a'.repeat(43),'content-type':'application/json'},JSON.stringify({padding:'x'.repeat(2048)})));
 assert.equal(r.status,413);privacy(r);
});
await check('public MCP metadata and initialization remain reachable; private MCP calls require auth',async()=>{
 assert.equal((await proxy(request('/api/mcp'))).headers.get('x-middleware-next'),'1');
 assert.equal((await proxy(request('/api/mcp','POST',{'content-type':'application/json'},JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})))).headers.get('x-middleware-next'),'1');
 assert.equal((await proxy(request('/api/mcp','POST',{'content-type':'application/json'},JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'report_market_capacity',arguments:{}}})))).status,401);
});
await check('native operator handlers still reject absent and synthetic nonoperator credentials',async()=>{
 for(const action of ['control','review'])for(const authorization of [undefined,'Bearer '+'a'.repeat(43)]){
  const r=await marketHandlers[action](new Request('https://bazaar.invalid/api/market/'+action,{method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization}:{})},body:'{}'}));
  assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:{code:'UNAUTHORIZED'}});privacy(r);
 }
});
await check('server homepage keeps native landing and demo-only fallback without depending on proxy',()=>{
 const compiled=ts.transpileModule(readFileSync('app/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};const routes=[];
 vm.runInNewContext(compiled,{module,exports:module.exports,process,require(name){if(name==='next/navigation')return{redirect(path){routes.push(path);throw Error('NEXT_REDIRECT');}};if(name==='react/jsx-runtime')return{jsx(){},jsxs(){}};return{};}});
 process.env.BAZAAR_ROUTE_BOUNDARY='false';assert.doesNotThrow(()=>module.exports.default());assert.deepEqual(routes,[]);
 process.env.BAZAAR_ENABLE_MARKETPLACE='false';assert.throws(()=>module.exports.default(),/NEXT_REDIRECT/);assert.deepEqual(routes,['/demo']);
 process.env.BAZAAR_ENABLE_MARKETPLACE='true';process.env.BAZAAR_ROUTE_BOUNDARY='true';
});
await check('actual demo page uses its allowed QR and makes protected preview distinction explicit',()=>{
 const compiled=ts.transpileModule(readFileSync('app/demo/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 vm.runInNewContext(compiled,{module,exports:module.exports,require(name){
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name.includes('Navbar'))return{Navbar:()=>null};if(name.includes('Footer'))return{Footer:()=>null};
  if(name.includes('demo-configuration'))return{demoConfiguration:()=>({features:Object.fromEntries(['registration','catalogue','serviceSubmission','purchases','privateFiles'].map(key=>[key,{enabled:false,reason:'SYNTHETIC_DISABLED'}]))})};
  if(name.includes('mcp-tool-contract'))return{MCP_VERSION:'synthetic-local'};throw Error('Unexpected demo import');}});
 const tree=module.exports.default();
 function nodes(node){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);if(typeof node.type==='function')return nodes(node.type(node.props));return[node,...nodes(node.props?.children)];}
 function text(node){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(text).join('');if(typeof node!=='object')return String(node);return text(typeof node.type==='function'?node.type(node.props):node.props?.children);}
 assert.match(text(tree),/preview protegida/);assert.match(text(tree),/no a esa preview/);assert.match(text(tree),/Sin membresía/);
 const images=nodes(tree).filter(n=>n.type==='img');assert.equal(images.length,1);assert.equal(images[0].props.src,'/demo-qr.svg');
 for(const node of nodes(tree).filter(n=>n.type==='a'&&n.props.href?.startsWith('/')))assert.equal(pilotRoutePolicy(node.props.href,'GET'),'allow');
 assert(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/demo-qr.svg'&&n.props.download===true));
});
await check('nonpublic pilot redirect remains compatible',async()=>{
 process.env.BAZAAR_ENABLE_MARKETPLACE='false';
 for(const method of ['GET','HEAD']){const r=await proxy(request('/?access=synthetic-private-value',method));assert.equal(r.status,307);assert.equal(r.headers.get('location'),'https://bazaar.invalid/demo');privacy(r);}
 process.env.BAZAAR_PUBLIC_DEMO='false';process.env.BAZAAR_ENABLE_MARKETPLACE='false';
 assert.equal(pilotRedirectPath(),'/pilot');assert.equal((await proxy(request('/'))).headers.get('location'),'https://bazaar.invalid/pilot');
 process.env.BAZAAR_PUBLIC_DEMO='true';process.env.BAZAAR_ENABLE_MARKETPLACE='true';
});
assert.equal(externalRequests,0);
console.log(JSON.stringify({status:'PASS',checks:checks.length,nativeNextProxy:true,nativeOperatorAuthorization:true,externalRequests,realPayments:0,remoteProtectionChanged:false,limitations:['No hosted firewall or browser hydration acceptance']}));
