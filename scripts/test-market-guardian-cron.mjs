import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertMarketGuardianCronRequest,createMarketGuardianTickHandler} from '../lib/market-guardian.ts';
import {WorkspaceError} from '../lib/workspace-types.ts';

const prior={...process.env},secret='c'.repeat(43),different='d'.repeat(43);
const environment={VERCEL:'1',VERCEL_ENV:'production',CRON_SECRET:secret,BAZAAR_MARKET_OPERATOR_HASH:createHash('sha256').update(secret).digest('hex'),BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://bazaar.example'};
const origin='https://stellar-bazaar-x402-synthetic.vercel.app',path='/api/market/guardian/tick';
function request({url=origin+path,token=secret,browserOrigin,method='GET'}={}){return new Request(url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(browserOrigin!==undefined?{Origin:browserOrigin}:{})}});}
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
 console.log(JSON.stringify({status:'PASS',networkRequests:0,payments:0,checks:['deployment hostname without browser Origin accepted','existing operator permission required','configured CRON_SECRET hashes to operator','anonymous and wrong credential rejected before maintenance','browser Origin rejected','GET-only path and HTTPS enforced','missing cron configuration fails closed','private no-store error and success responses','maintenance errors redacted'],scheduledVercelExecutionValidated:false}));
}finally{for(const name of Object.keys(process.env))if(!(name in prior))delete process.env[name];Object.assign(process.env,prior);}
