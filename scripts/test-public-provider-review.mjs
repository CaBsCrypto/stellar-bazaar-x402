import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// Clear all legacy credentials BEFORE importing modules with module-level clients.
for(const name of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','VERCEL'])delete process.env[name];
Object.assign(process.env,{NODE_ENV:'test',NEXT_PUBLIC_APP_URL:'http://127.0.0.1',BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',BAZAAR_REVIEW_PREFIX:'bazaar-review:local-test',BAZAAR_REVIEW_RATE_SECRET:'synthetic-rate-secret-32-characters-long',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_ENABLE_PROVIDER_REVIEW_ADMIN:'true',BAZAAR_ENABLE_PROVIDER_ACTIVATION:'true',ADMIN_ALLOWED_EMAILS:'operator@example.test'});
let externalCalls=0;
globalThis.fetch=async()=>{externalCalls++;throw Error('External network forbidden');};
const runtime=await import('../lib/provider-review-runtime.ts');
const review=await import('../lib/provider-self-listing.ts');
const limits=await import('../lib/provider-review-limits.ts');
const http=await import('../lib/provider-submission-http.ts');
const operator=await import('../lib/provider-review-operator.ts');
const adminSession=await import('../lib/provider-admin-session.ts');
const audit=await import('../lib/provider-review-audit.ts');
const {createMagicLinkToken}=await import('../lib/admin-guard.ts');
const sessionRoute=await import('../app/api/admin/review-session/route.ts');
const listRoute=await import('../app/api/admin/provider-submissions/route.ts');
const data=new Map();let loseStateAck=false;
const redis={async get(k){return data.get(k)??null;},async eval(script,keys,args){
 if(script.includes('bazaar-review-limits-v1')){
  const maximum=JSON.parse(args[0]);if(keys.length>maximum.length&&data.has(keys.at(-1)))return [1,0];
  for(let i=0;i<maximum.length;i++)if(Number(data.get(keys[i])??0)>=maximum[i])return [0,60];
  for(let i=0;i<maximum.length;i++)data.set(keys[i],String(Number(data.get(keys[i])??0)+1));
  if(keys.length>maximum.length)data.set(keys.at(-1),'1');return [1,0];
 }
 if(script.includes("ARGV[1]=='missing'")){
  const old=data.get(keys[0]);if(args[0]==='missing'?old!==undefined:old!==args[1])return 0;
  data.set(keys[0],args[2]);if(loseStateAck){loseStateAck=false;throw Error('Synthetic lost acknowledgement');}return 1;
 }
 if(script.includes("redis.call('SET', KEYS[1]")){data.set(keys[0],args[0]);return 'OK';}
 if(script.includes("redis.call('DEL', KEYS[1]"))return data.delete(keys[0])?1:0;
 throw Error('Unexpected Redis script');
}};
runtime.setReviewRedisForTests(redis);await review.setReviewStoreForTests(undefined);
const require=createRequire(import.meta.url);
async function route(path,mapping){const filename=new URL(path,import.meta.url);const source=ts.transpileModule(await readFile(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};vm.runInNewContext(source,{exports,require:name=>{if(name in mapping)return mapping[name];throw Error('Unmapped import: '+name);},process,Request,Response,URL,Buffer,console},{filename:filename.pathname});return exports;}
const publicMapping={'next/server':{NextResponse:Response},'@/lib/provider-self-listing':review,'@/lib/provider-submission-http':http,'@/lib/provider-review-runtime':runtime,'@/lib/provider-review-limits':limits};
const intake=await route('../app/api/provider-self-listing/route.ts',publicMapping);
const status=await route('../app/api/provider-self-listing/[id]/route.ts',publicMapping);
let creates=0,reads=0,registryAckLost=false;const registryEntries=new Map();
const registry={configured:()=>true,async create(card){creates++;const entry={id:card.id,hash:review.canonicalCardHash(card),card:structuredClone(card)};registryEntries.set(card.id,entry);if(registryAckLost){registryAckLost=false;throw Error('Synthetic registry acknowledgement lost');}return {ok:true,entry};},async read(id){reads++;return registryEntries.get(id);}};
const actions=await route('../app/api/admin/provider-submissions/[id]/route.ts',{
 'node:crypto':require('node:crypto'),'../../../../../lib/provider-admin-session.ts':adminSession,'../../../../../lib/provider-self-listing.ts':review,'../../../../../lib/provider-review-audit.ts':audit,'../../../../../lib/provider-review-limits.ts':limits,
 '../../../../../lib/provider-review-operator.ts':{...operator,verifySubmissionDns:async id=>operator.verifySubmissionDns(id,{resolveTxt:async()=>[[(await review.getSubmissionForOperator(id)).value.control.expectedRecord]]}),activateSubmission:id=>operator.activateSubmission(id,registry),recoverSubmissionActivation:id=>operator.recoverSubmissionActivation(id,registry)},
});
const base='http://127.0.0.1';let cookie='',csrf='';
const context=id=>({params:Promise.resolve({id})});
function request(path,method='GET',body,headers={}){return new Request(base+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});}
function adminRequest(path,body,extra={}){return request(path,'POST',body,{cookie,origin:base,'x-csrf-token':csrf,...extra});}
const card=id=>({version:'bazaar.service-card/v0',id,name:'Synthetic provider',description:'Synthetic route integration fixture.',kind:'http',url:'https://api.provider.example.com',routeTemplate:'/v1/quote/{pair}',input:[{name:'pair',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.001',destination:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'},provider:{name:'Fixture'},tags:['fixture']});
function identity(serviceId){return {id:randomUUID(),token:randomBytes(32).toString('hex'),card:card(serviceId)};}
const postSubmission=s=>intake.POST(request('/api/provider-self-listing','POST',{submissionId:s.id,card:s.card,controlProof:{method:'dns-txt',domain:'api.provider.example.com'}},{authorization:'Bearer '+s.token}));
const getStatus=(s,token=s.token)=>status.GET(request('/api/provider-self-listing/'+s.id,'GET',undefined,{authorization:'Bearer '+token}),context(s.id));
const act=(s,body,extra)=>actions.POST(adminRequest('/api/admin/provider-submissions/'+s.id,body,extra),context(s.id));
try{
 const rejected=identity('synthetic-correctable');assert.equal((await postSubmission(rejected)).status,202);
 assert.equal((await intake.GET()).status,405);assert.equal((await getStatus(rejected,'wrong')).status,401);
 assert.equal((await getStatus(rejected)).status,200);assert.equal((await postSubmission(rejected)).status,202,'same receipt recovers');
 assert.equal((await listRoute.GET(request('/api/admin/provider-submissions'))).status,401);
 const token=await createMagicLinkToken('operator@example.test');const exchange=await sessionRoute.POST(request('/api/admin/review-session','POST',{token},{origin:base}));assert.equal(exchange.status,200);
 cookie=exchange.headers.get('set-cookie').split(';')[0];csrf=(await exchange.json()).csrfToken;
 assert.equal((await sessionRoute.POST(request('/api/admin/review-session','POST',{token},{origin:base}))).status,401);
 assert.equal((await sessionRoute.GET(request('/api/admin/review-session','GET',undefined,{cookie}))).status,200);
 const listing=await listRoute.GET(request('/api/admin/provider-submissions','GET',undefined,{cookie}));assert.equal(listing.status,200);const listed=await listing.json();assert.deepEqual(listed.value.submissions[0].card,rejected.card);assert.ok(!JSON.stringify(listed).includes('tokenHash'));
 assert.equal((await act(rejected,{action:'review',decision:'approve',reasons:['Synthetic approval']},{'x-csrf-token':''})).status,403);
 assert.equal((await act(rejected,{action:'review',decision:'approve',reasons:['Synthetic approval']})).status,409,'proof is mandatory');
 assert.equal((await act(rejected,{action:'verify-dns'})).status,200);
 assert.equal((await act(rejected,{action:'review',decision:'reject',reasons:['Correct the service description']})).status,200);
 const corrected=identity(rejected.card.id);corrected.card.description='Corrected synthetic service description';assert.equal((await postSubmission(corrected)).status,202);
 for(const body of [{action:'verify-dns'},{action:'review',decision:'approve',reasons:['Synthetic proof and card reviewed']},{action:'stage'}])assert.equal((await act(corrected,body)).status,200);
 registryAckLost=true;assert.equal((await act(corrected,{action:'activate'})).status,503);assert.equal(creates,1);
 assert.equal((await getStatus(corrected)).status,200);assert.equal((await act(corrected,{action:'recover'})).status,200);
 assert.equal((await act(corrected,{action:'recover'})).status,200);assert.equal(creates,1);assert.equal((await (await getStatus(corrected)).json()).submission.status,'activated');
 const pending=identity('lost-submission-ack');loseStateAck=true;assert.equal((await postSubmission(pending)).status,503);assert.equal((await postSubmission(pending)).status,202);
 const stateKey='bazaar-review:local-test:state';const saved=data.get(stateKey);data.set(stateKey,'{corrupt');assert.equal((await getStatus(pending)).status,503);assert.equal((await listRoute.GET(request('/api/admin/provider-submissions','GET',undefined,{cookie}))).status,503);assert.equal(data.get(stateKey),'{corrupt');data.set(stateKey,saved);
 const events=[...data.entries()].filter(([k])=>k.includes(':audit:')).map(([,v])=>JSON.parse(v));assert.ok(events.length>0);for(const event of events.filter(e=>e.outcome==='started'))assert.ok(events.some(e=>e.requestId===event.requestId&&e.outcome!=='started'));
 assert.ok(events.some(e=>e.action==='activate'&&e.outcome==='failed'));assert.ok(events.some(e=>e.action==='recover'&&e.outcome==='succeeded'));
 assert.equal((await sessionRoute.DELETE(request('/api/admin/review-session','DELETE',undefined,{cookie,origin:base,'x-csrf-token':csrf}))).status,200);assert.equal((await listRoute.GET(request('/api/admin/provider-submissions','GET',undefined,{cookie}))).status,401);
 assert.equal(externalCalls,0);console.log(JSON.stringify({ok:true,transport:'Request/Response handler integration; no HTTP listener',sharedReviewStore:true,sessionExchangeAndRevoke:true,csrf:true,rejectionCorrection:true,proofBeforeReview:true,activationRecoveryNoDuplicate:true,creates,reads,auditEvents:events.length,corruptionFailsClosed:true,lostAcknowledgementRecovery:true,externalCalls,paymentExecutions:0}));
}finally{runtime.setReviewRedisForTests(undefined);}
