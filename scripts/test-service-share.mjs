import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createMarketServiceQrHandler} from '../lib/market-service-share-http.ts';
import {publicServicePath,publicServiceUrl} from '../lib/market-service-share.ts';
import {pilotRoutePolicy} from '../lib/pilot-route-policy.ts';
import {workspacePublicOrigin} from '../lib/workspace-public-origin.ts';
import {WorkspaceError} from '../lib/workspace-types.ts';
import {toPaidService} from '../lib/service-card.ts';
import {syncDeliveryContract,deliveryStorage} from '../lib/delivery-contract.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY,isCanonicalUsdcTestnet} from '../lib/payment-assets.ts';
import {paymentLabel} from '../lib/payment-options.ts';
import ts from 'typescript';
import vm from 'node:vm';

// Synthetic snapshots only. Native origin checks, QR encoder, errors and route policy;
// no Redis, provider, wallet, deployment, transaction or general upload access.
Object.assign(process.env,{BAZAAR_PUBLIC_DEMO:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',
 BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_PREFIX:'bazaar-workspace:share-offline',
 BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://bazaar.invalid',BAZAAR_OPERATIONAL_METER:'false',BAZAAR_ACCEPTANCE_METER:'false'});
delete process.env.VERCEL;
const id='guionista-synthetic-share';
let ingress=0,reads=0,network=0;
globalThis.fetch=async()=>{network++;throw Error('NETWORK_FORBIDDEN');};
let records=[{active:true,service:{withdrawn:false,card:{id}}}];
let failure;
const handler=createMarketServiceQrHandler({ingress:async()=>{ingress++;if(failure)throw failure;},snapshot:async()=>{reads++;return {records,paused:false};}});
const request=(origin='https://bazaar.invalid',method='GET',suffix='')=>new Request(`${origin}/resources/${id}/qr.svg${suffix}`,{method});
const checks=[];
async function check(name,run){await run();checks.push(name);}
let svg;
const svgEntries=[];
await check('public links contain only service and same-environment origin',()=>{
 assert.equal(publicServicePath(id),`/resources/${id}`);
 assert.equal(publicServiceUrl('https://bazaar.invalid',id),`https://bazaar.invalid/resources/${id}`);
 for(const invalid of ['https://user:secret@bazaar.invalid','https://bazaar.invalid?token=private','https://bazaar.invalid/#secret','https://bazaar.invalid/path','javascript:alert(1)','http://remote.invalid'])assert.throws(()=>publicServiceUrl(invalid,id));
 for(const invalid of ['../private','service?token=secret','service#private','UPPER','-slug','slug--bad','a'.repeat(101)])assert.throws(()=>publicServicePath(invalid));
});
await check('native encoder returns bounded SVG for an active reviewed service',async()=>{
 const result=await handler(request(),id);assert.equal(result.status,200);svg=await result.text();
 assert.match(svg,/^<svg /);assert(svg.length<20000);assert.equal(result.headers.get('content-type'),'image/svg+xml; charset=utf-8');
 assert.equal(result.headers.get('cache-control'),'public, no-store');assert.match(result.headers.get('content-disposition'),/attachment; filename="bazaar-guionista-synthetic-share.svg"/);
 assert.equal(result.headers.get('referrer-policy'),'no-referrer');assert(!svg.includes('token='));assert(!svg.includes('operationId'));
 svgEntries.push({svg,url:publicServiceUrl('https://bazaar.invalid',id)});
});
await check('HEAD shares authorization and returns no SVG body',async()=>{
 const result=await handler(request(undefined,'HEAD'),id);assert.equal(result.status,200);assert.equal(await result.text(),'');assert.equal(result.headers.get('content-type'),'image/svg+xml; charset=utf-8');
});
await check('withdrawn, pending, inactive and missing services return 404',async()=>{
 for(const record of [{active:false,service:{withdrawn:false,card:{id}}},{active:true,service:{withdrawn:true,card:{id}}},{active:true,service:{withdrawn:false,card:{id:'another-service'}}}]){
  records=[record];assert.equal((await handler(request(),id)).status,404);
 }
 records=[];assert.equal((await handler(request(),id)).status,404);
 records=[{active:true,service:{withdrawn:false,card:{id}}}];
});
await check('origin and query validation fail before quota/storage access',async()=>{
 const before=[ingress,reads];assert.equal((await handler(request('https://attacker.invalid'),id)).status,400);
 assert.equal((await handler(request(undefined,'GET','?target=https://attacker.invalid'),id)).status,400);
 assert.equal((await handler(request(undefined,'POST'),id)).status,404);
 assert.equal((await handler(request(),'../private')).status,404);assert.deepEqual([ingress,reads],before);
 delete process.env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN;
 assert.equal((await handler(request(),id)).status,503,'A public QR cannot infer its origin from an unconfigured remote request');
 assert.deepEqual([ingress,reads],before);process.env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN='https://bazaar.invalid';
});
await check('quota failures return 429 and retry; unavailable storage returns 503',async()=>{
 failure=new WorkspaceError('RATE_LIMIT',429,37);const limited=await handler(request(),id);assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'37');
 failure=Error('SYNTHETIC_STORAGE_DOWN');assert.equal((await handler(request(),id)).status,503);failure=undefined;
 const down=createMarketServiceQrHandler({ingress:async()=>{},snapshot:async()=>{throw Error('STORE_DOWN');}});assert.equal((await down(request(),id)).status,503);
});
await check('Preview target resolves only the configured platform hostname',async()=>{
 const preview='stellar-bazaar-x402-synthetic-test.vercel.app';
 const saved={...process.env},family='0123456789abcdef0123456789abcdef';
 Object.assign(process.env,{VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:preview,BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'vercel-preview',
  BAZAAR_WORKSPACE_PREFIX:`bazaar-workspace:pilot-${family}`,BAZAAR_MARKET_PREFIX:`bazaar-market:pilot-${family}`,BAZAAR_REVIEW_PREFIX:`bazaar-review:pilot-${family}`,
  BAZAAR_WORKSPACE_REDIS_REST_URL:'https://redis.invalid',BAZAAR_WORKSPACE_REDIS_REST_TOKEN:'synthetic-test-only',BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',
  BAZAAR_DEMO_NAMESPACE_ENV:'preview',BAZAAR_MARKET_FILE_PREFIX:`market-deliveries/v1/preview/${family}`});
 assert.equal(publicServiceUrl(workspacePublicOrigin(),id),`https://${preview}/resources/${id}`);
 const result=await handler(request(`https://${preview}`),id);assert.equal(result.status,200);svgEntries.push({svg:await result.text(),url:`https://${preview}/resources/${id}`});
 assert.equal((await handler(request(),id)).status,400,'Protected Preview cannot create a production URL');
 process.env.VERCEL_URL='attacker.invalid';assert.throws(workspacePublicOrigin);
 for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);
});
await check('route boundary and prepared WAF allow exactly per-service QR GET/HEAD',()=>{
 const proposal=JSON.parse(readFileSync('docs/TEXT_DEMO_PUBLIC_WAF_PROPOSAL.json','utf8'));
 const qrPath=`/resources/${id}/qr.svg`;
 for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy(qrPath,method),'allow');
 for(const path of [`/resources/${id}/qr.svg/admin`,`/resources/${id}/secret.svg`,`/resources/${id}/qrXsvg`])assert.equal(pilotRoutePolicy(path,'GET'),'deny');
 for(const method of ['POST','PUT','DELETE'])assert.equal(pilotRoutePolicy(qrPath,method),'deny');
 const patterns=[];function walk(value){if(!value||typeof value!=='object')return;if(value.type==='path'&&value.op==='re'&&value.value.includes('/resources/'))patterns.push(new RegExp(value.value));for(const child of Object.values(value))walk(child);}walk(proposal);
 assert(patterns.length>=3);for(const pattern of patterns){assert(pattern.test(qrPath));assert(!pattern.test(`/resources/${id}/secret.svg`));assert(!pattern.test('/api/market/review'));}
});
const jsx=(type,props)=>({type,props});
function nodes(node){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);return[node,...nodes(node.props?.children)];}
function text(node){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(text).join('');if(typeof node!=='object')return String(node);return text(node.props?.children);}
const ServiceShare=()=>null,ServicePurchaseEntry=()=>null;
let detailSnapshot;
function loadDetail(){
 const module={exports:{}};
 const compiled=ts.transpileModule(readFileSync('app/resources/[id]/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(compiled,{module,exports:module.exports,process,require(name){
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/navigation')return{notFound(){throw Error('NEXT_NOT_FOUND');}};
  if(name.endsWith('/payment-options'))return{paymentLabel};if(name.endsWith('/service-card'))return{toPaidService};
  if(name.endsWith('/payment-assets'))return{isCanonicalUsdcTestnet};if(name.endsWith('/delivery-contract'))return{deliveryStorage};
  if(name.endsWith('/marketplace'))return{assertMarketEnabled(){},marketServiceSnapshot:async()=>detailSnapshot};
  if(name.endsWith('/acceptance-meter'))return{measuredRead:async run=>run()};
  if(name.endsWith('/catalog'))return{services:[],getService:()=>undefined};if(name.endsWith('/service-portfolio'))return{getServicePortfolio:()=>undefined};
  if(name.endsWith('/ServiceShare'))return{ServiceShare};if(name.endsWith('/ServicePurchaseEntry'))return{ServicePurchaseEntry};
  if(name.includes('/components/'))return new Proxy({},{get:()=>()=>null});if(name.endsWith('.css'))return{};
  if(name.endsWith('/market-text-seller-runtime'))return{isOnDemandTextService:()=>false};
  if(name.endsWith('/dynamic-registry')||name.endsWith('/service-card-schema')||name.endsWith('/demo-configuration'))return{};
  throw Error('Unexpected public detail import: '+name);
 }});return module.exports.default;
}
const ResourcePage=loadDetail();
const card={version:'bazaar.service-card/v0',id,name:'Synthetic script',description:'Public synthetic service',kind:'http',url:'https://provider.invalid',routeTemplate:'/work',input:[],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.01',destination:USDC_TESTNET_PAYMENT_IDENTITY.issuer,identity:USDC_TESTNET_PAYMENT_IDENTITY,marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Public synthetic provider'},tags:['text'],delivery:{...syncDeliveryContract(),storage:{mode:'text'},result:{...syncDeliveryContract().result,contentType:'text/plain'}}};
const record={active:true,service:{card,cardHash:'a'.repeat(64),ownerId:'PRIVATE_OWNER',withdrawn:false},review:{control:{value:'PRIVATE_CONTROL_SECRET'}},availability:{ready:true,leaseExpiresAt:new Date(Date.now()+60000).toISOString()}};
Object.assign(process.env,{BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_X402_MARKETPLACE_ENABLED:'true'});
await check('public detail renders real declared delivery and only public context',async()=>{
 detailSnapshot={records:[record],paused:false};
 const tree=await ResourcePage({params:Promise.resolve({id})});
 assert.match(text(tree),/Public synthetic provider/);assert.match(text(tree),/Texto en tu historial privado/);assert.match(text(tree),/Stellar Testnet/);
 const share=nodes(tree).find(n=>n.type===ServiceShare),entry=nodes(tree).find(n=>n.type===ServicePurchaseEntry);
 assert.equal(share.props.serviceId,id);assert.equal(entry.props.serviceId,id);assert.equal(entry.props.available,true);
 const serialized=JSON.stringify(tree);assert(!serialized.includes('PRIVATE_OWNER'));assert(!serialized.includes('PRIVATE_CONTROL_SECRET'));assert(!serialized.includes('operationId'));
 for(const mode of ['external','bazaar']){detailSnapshot={records:[{...record,service:{...record.service,card:{...card,delivery:{...card.delivery,storage:{mode},result:{...card.delivery.result,contentType:'video/mp4'}}}}}],paused:false};const rendered=text(await ResourcePage({params:Promise.resolve({id})}));assert.match(rendered,/video\/mp4/);assert(!rendered.includes('Texto en tu historial privado'));}
});
await check('public detail keeps unavailable service consultable and rejects inactive records',async()=>{
 for(const snapshot of [{records:[record],paused:true},{records:[{...record,availability:{ready:false,reason:'SELLER_CAPACITY_EXHAUSTED'}}],paused:false}]){
  detailSnapshot=snapshot;const tree=await ResourcePage({params:Promise.resolve({id})});const entry=nodes(tree).find(n=>n.type===ServicePurchaseEntry);assert.equal(entry.props.available,false);assert(nodes(tree).some(n=>n.type===ServiceShare));
 }
 for(const entries of [[],[{...record,active:false}],[{...record,service:{...record.service,withdrawn:true}}]]){detailSnapshot={records:entries,paused:false};await assert.rejects(ResourcePage({params:Promise.resolve({id})}),/NEXT_NOT_FOUND/);}
});
await check('lease expiry removes purchase advertising while preserving agent consultation',()=>{
 let now=Date.now();const module={exports:{}};
 const compiled=ts.transpileModule(readFileSync('components/ServicePurchaseEntry.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(compiled,{module,exports:module.exports,Date,require(name){if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='react')return{useEffect(){},useState(){return[now,()=>{}];}};throw Error('Unexpected purchase entry import');}});
 const properties={serviceId:id,available:true,leaseExpiresAt:new Date(now+60000).toISOString(),unavailableReason:'Vendedor disponible'};
 assert.match(text(module.exports.ServicePurchaseEntry(properties)),/Comprar con mi agente/);now+=60001;
 const expired=module.exports.ServicePurchaseEntry(properties);assert(!text(expired).includes('Comprar con mi agente'));assert.match(text(expired),/Conectar para consultar este servicio/);
 assert(nodes(expired).some(n=>n.props.href===`/hub?service=${id}`));assert(nodes(expired).some(n=>n.props.href===`/history?service=${id}`));
 const demand=module.exports.ServicePurchaseEntry({...properties,onDemand:true});assert.match(text(demand),/Disponibilidad por comprobar al preparar el pedido/);assert.match(text(demand),/Comprar con mi agente/);
});
let decoded=0;
if(process.argv.includes('--decode'))await check('independent OpenCV decoder reads actual SVG in both public environments',()=>{
 const python=`import sys,json,re,xml.etree.ElementTree as ET\nimport cv2,numpy as np\nfor entry in json.load(sys.stdin):\n root=ET.fromstring(entry['svg']); n=int(root.attrib['viewBox'].split()[2]); scale=12; pixels=np.full((n*scale,n*scale),255,dtype=np.uint8)\n for path in root:\n  if path.attrib.get('stroke')!='#000000': continue\n  parts=re.findall(r'([Mmh])([^Mmh]+)',path.attrib['d']); x=y=0\n  for command,values in parts:\n   nums=[float(v) for v in re.findall(r'-?\\d+(?:\\.\\d+)?',values)]\n   if command=='M': x,y=nums\n   elif command=='m': x+=nums[0]; y+=nums[1]\n   else:\n    end=x+nums[0]; pixels[round((y-.5)*scale):round((y+.5)*scale),round(x*scale):round(end*scale)]=0; x=end\n data,points,_=cv2.QRCodeDetector().detectAndDecode(pixels)\n assert data==entry['url'],repr(data)\nprint('decoded')`;
 const result=spawnSync('python',['-c',python],{input:JSON.stringify(svgEntries),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'decoded');decoded=svgEntries.length;
});
assert.equal(network,0);
console.log(JSON.stringify({status:'PASS',checks:checks.length,nativeQrEncoder:true,independentSvgDecodes:decoded,networkRequests:network,realPayments:0,remoteChanges:false}));
