import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertMarketGuardianCronRequest,createMarketGuardianTickHandler} from '../lib/market-guardian.ts';
import {WorkspaceError} from '../lib/workspace-types.ts';
import {NextRequest} from 'next/server.js';
import {proxy} from '../proxy.ts';

const prior={...process.env},secret='c'.repeat(43),different='d'.repeat(43);
const environment={VERCEL:'1',VERCEL_ENV:'production',CRON_SECRET:secret,BAZAAR_MARKET_OPERATOR_HASH:createHash('sha256').update(secret).digest('hex'),BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://bazaar.example'};
const origin='https://stellar-bazaar-x402-synthetic-cabscryptocontacto-6028s-projects.vercel.app',path='/api/market/guardian/tick';
function request({url=origin+path,token=secret,browserOrigin,method='GET',headers={}}={}){return new Request(url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(browserOrigin!==undefined?{Origin:browserOrigin}:{}),...headers}});}
function denied(input,status,code,env=environment){assert.throws(()=>assertMarketGuardianCronRequest(input,env),e=>e instanceof WorkspaceError&&e.status===status&&e.code===code);}
try{
 for(const name of Object.keys(process.env))if(/^(BAZAAR_|VERCEL|CRON_SECRET|X402_)/.test(name))delete process.env[name];
 Object.assign(process.env,environment);
 assertMarketGuardianCronRequest(request(),environment);
 assertMarketGuardianCronRequest(request({url:'https://bazaar.example'+path}),environment);
 denied(request({token:null}),401,'UNAUTHORIZED');denied(request({token:different}),401,'UNAUTHORIZED');
 denied(request(),503,'GUARDIAN_CRON_NOT_CONFIGURED',{...environment,CRON_SECRET:undefined});
 denied(request(),503,'GUARDIAN_CRON_NOT_CONFIGURED',{...environment,CRON_SECRET:different});
 denied(request(),503,'GUARDIAN_CRON_NOT_CONFIGURED',{...environment,CRON_SECRET:secret+'\n'});
 denied(request({browserOrigin:'https://bazaar.example'}),403,'ORIGIN_FORBIDDEN');
 denied(request({browserOrigin:'https://attacker.invalid'}),403,'ORIGIN_FORBIDDEN');
 denied(request({url:origin+path+'?secret=forbidden'}),400,'INVALID_REQUEST');
 denied(request({url:origin+'/api/market/guardian'}),400,'INVALID_REQUEST');
 denied(request({url:'http://stellar-bazaar-x402-synthetic.vercel.app'+path}),400,'INVALID_REQUEST');
 denied(request({method:'POST'}),400,'INVALID_REQUEST');
 denied(request({headers:{'content-length':'1'}}),400,'INVALID_REQUEST');
 denied(request({headers:{'content-length':'invalid'}}),400,'INVALID_REQUEST');
 denied(request({headers:{'transfer-encoding':'chunked'}}),400,'INVALID_REQUEST');
 assertMarketGuardianCronRequest(request({headers:{'content-length':'0'}}),environment);
 assertMarketGuardianCronRequest(request({url:'http://127.0.0.1:3000'+path}),{...environment,VERCEL:undefined});
 let runs=0;
 const tick=createMarketGuardianTickHandler(async()=>{runs++;return {paymentResubmission:false,processedWorkspaceCount:0};});
 for(const input of [request({token:null}),request({token:different}),request({browserOrigin:'https://bazaar.example'})]){
  const response=await tick(input);assert.ok([401,403].includes(response.status));assert.equal(runs,0);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('vary'),'Authorization');
 }
 let response=await tick(request());assert.equal(response.status,200);assert.equal(runs,1);assert.equal((await response.json()).paymentResubmission,false);
 delete process.env.CRON_SECRET;response=await tick(request());assert.equal(response.status,503);assert.equal((await response.json()).error.code,'GUARDIAN_CRON_NOT_CONFIGURED');assert.equal(runs,1,'A missing scheduled credential cannot run maintenance');
 process.env.CRON_SECRET=secret;
 const unavailable=createMarketGuardianTickHandler(async()=>{throw Error('synthetic-secret-never-returned');});response=await unavailable(request());assert.equal(response.status,503);assert.equal((await response.json()).error.code,'WORKSPACE_UNAVAILABLE');
 // Exercise the actual Next proxy as well as the handler's machine proof. The
 // scheduler's immutable hostname must pass that earlier gate too, exclusively
 // for this GET route and the matching existing operator credential.
 Object.assign(process.env,{BAZAAR_ROUTE_BOUNDARY:'true',BAZAAR_PUBLIC_DEMO:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_ADMISSION:'open',BAZAAR_OPERATIONAL_METER:'false',BAZAAR_OPERATIONAL_BUDGET:'false',VERCEL_URL:new URL(origin).hostname});
 let proxyCases=0,networkRequests=0;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{networkRequests++;throw Error('Unexpected proxy network request');};
 async function checkProxy(input,status,code){
  const result=await proxy(new NextRequest(input.url,{method:input.method,headers:input.headers}));proxyCases++;
  assert.equal(result.status,status);
  if(status===200)assert.equal(result.headers.get('x-middleware-next'),'1');
  else{assert.equal((await result.json()).error.code,code);assert.equal(result.headers.get('x-middleware-next'),null);}
  assert.match(result.headers.get('cache-control'),/no-store/);
 }
 try{
  await checkProxy(request(),200);
  await checkProxy(request({url:'https://bazaar.example'+path}),200);
  await checkProxy(request({headers:{'content-length':'0'}}),200);
  for(const input of [request({token:null}),request({token:different}),request({token:'c'.repeat(42)}),request({token:'c'.repeat(44)})])await checkProxy(input,401,'UNAUTHORIZED');
  for(const browserOrigin of ['https://bazaar.example','https://attacker.invalid',''])await checkProxy(request({browserOrigin}),403,'ORIGIN_FORBIDDEN');
  for(const input of [request({url:origin+path+'?limit=1'}),request({url:'https://foreign.vercel.app'+path}),request({url:'https://stellar-bazaar-x402-other-cabscryptocontacto-6028s-projects.vercel.app'+path}),request({url:'http://'+new URL(origin).hostname+path}),request({headers:{'content-length':'1'}}),request({headers:{'content-length':'invalid'}}),request({headers:{'transfer-encoding':'chunked'}}),request({url:origin+'/api/market/guardian'}),request({url:origin+'/api/market/catalog'}),request({url:'https://foreign.vercel.app'+path,headers:{'x-forwarded-host':new URL(origin).hostname}})])await checkProxy(input,400,'INVALID_REQUEST');
  for(const method of ['POST','HEAD'])await checkProxy(request({method}),404,'PILOT_ROUTE_DISABLED');
  process.env.VERCEL_ENV='preview';await checkProxy(request(),400,'INVALID_REQUEST');process.env.VERCEL_ENV='production';
  delete process.env.VERCEL_URL;await checkProxy(request(),400,'INVALID_REQUEST');process.env.VERCEL_URL=new URL(origin).hostname;
  process.env.VERCEL_URL='foreign.vercel.app';await checkProxy(request({url:'https://foreign.vercel.app'+path}),400,'INVALID_REQUEST');process.env.VERCEL_URL=new URL(origin).hostname;
  delete process.env.CRON_SECRET;await checkProxy(request(),503,'GUARDIAN_CRON_NOT_CONFIGURED');process.env.CRON_SECRET=secret;
  process.env.CRON_SECRET=different;await checkProxy(request(),503,'GUARDIAN_CRON_NOT_CONFIGURED');process.env.CRON_SECRET=secret;
  assert.equal(networkRequests,0,'All proxy proofs and rejections precede Redis or maintenance');
 }finally{globalThis.fetch=originalFetch;}
 console.log(JSON.stringify({status:'PASS',networkRequests,payments:0,actualNextProxyCases:proxyCases,checks:['deployment hostname without browser Origin accepted','existing operator permission required','configured CRON_SECRET hashes to operator','anonymous and wrong credential rejected before maintenance','browser Origin rejected','GET-only path and HTTPS enforced','missing cron configuration fails closed','private no-store error and success responses','maintenance errors redacted','actual Next proxy accepts only canonical or trusted immutable production hostname','foreign hostname, forwarded host, preview stage and other routes cannot use the cron exception','proxy authentication, origin, query and body rejection require no Redis'],scheduledVercelExecutionValidated:false}));
}finally{for(const name of Object.keys(process.env))if(!(name in prior))delete process.env[name];Object.assign(process.env,prior);}
