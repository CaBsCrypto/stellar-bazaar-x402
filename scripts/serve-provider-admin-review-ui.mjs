import nodeHttp from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// Clear all legacy credentials BEFORE importing modules with module-level clients.
for(const name of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','VERCEL'])delete process.env[name];
Object.assign(process.env,{NODE_ENV:'test',NEXT_PUBLIC_APP_URL:'http://localhost:3255',BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',BAZAAR_REVIEW_PREFIX:'bazaar-review:local-test',BAZAAR_REVIEW_RATE_SECRET:'synthetic-rate-secret-32-characters-long',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_ENABLE_PROVIDER_REVIEW_ADMIN:'true',BAZAAR_ENABLE_PROVIDER_ACTIVATION:'true',ADMIN_ALLOWED_EMAILS:'operator@example.test'});
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
let creates=0,reads=0,registryAckLost=process.argv.includes('--lose-activation-ack');const registryEntries=new Map();
const registry={configured:()=>true,async create(card){creates++;const entry={id:card.id,hash:review.canonicalCardHash(card),card:structuredClone(card)};registryEntries.set(card.id,entry);if(registryAckLost){registryAckLost=false;throw Error('Synthetic registry acknowledgement lost');}return {ok:true,entry};},async read(id){reads++;return registryEntries.get(id);}};
const actions=await route('../app/api/admin/provider-submissions/[id]/route.ts',{
 'node:crypto':require('node:crypto'),'../../../../../lib/provider-admin-session.ts':adminSession,'../../../../../lib/provider-self-listing.ts':review,'../../../../../lib/provider-review-audit.ts':audit,'../../../../../lib/provider-review-limits.ts':limits,
 '../../../../../lib/provider-review-operator.ts':{...operator,verifySubmissionHttp:async id=>operator.verifySubmissionHttp(id,{lookup:async()=>[{address:'8.8.8.8',family:4}],transport:async()=>({status:200,body:(await review.getSubmissionForOperator(id)).value.control.expectedRecord})}),verifySubmissionDns:async id=>operator.verifySubmissionDns(id,{resolveTxt:async()=>[[(await review.getSubmissionForOperator(id)).value.control.expectedRecord]]}),activateSubmission:id=>operator.activateSubmission(id,registry),recoverSubmissionActivation:id=>operator.recoverSubmissionActivation(id,registry)},
});

// Loopback-only acceptance launcher. Start the built Next UI separately on 3254.
// Production guards and browser cookie attributes are used unchanged.
const base='http://localhost:3255';
const uiPort=Number(process.argv.find(value=>value.startsWith('--ui-port='))?.slice(10)??3254);
const context=id=>({params:Promise.resolve({id})});
const fixtureCard={version:'bazaar.service-card/v0',id:'browser-review-fixture',name:'Synthetic browser provider',description:'Local browser acceptance fixture. No external calls or payments.',kind:'http',url:'https://api.provider.example.com',routeTemplate:'/v1/quote/{pair}',input:[{name:'pair',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.001',destination:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'},provider:{name:'Fixture'},tags:['fixture']};
const submissionId=randomUUID();
const receipt=randomBytes(32).toString('hex');
const seeded=await intake.POST(new Request(base+'/api/provider-self-listing',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+receipt},body:JSON.stringify({submissionId,card:fixtureCard,controlProof:{method:'dns-txt',domain:'api.provider.example.com'}})}));
if(seeded.status!==202)throw Error('Synthetic submission seed failed: '+await seeded.text());
async function handle(req,res){
 try {
  if(!['localhost:3255','127.0.0.1:3255'].includes(req.headers.host)){res.writeHead(403);res.end();return;}
  const url=new URL(req.url,base);
  if(!url.pathname.startsWith('/api/')){
   const proxy=nodeHttp.request({hostname:'127.0.0.1',port:uiPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${uiPort}`}},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});
   proxy.on('error',()=>{res.writeHead(502);res.end('Start the built Next UI on '+uiPort);});req.pipe(proxy);return;
  }
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const init={method:req.method,headers:req.headers};if(chunks.length)init.body=Buffer.concat(chunks);
  const request=new Request(url,init);let handler,ctx;
  if(url.pathname==='/api/admin/review-session')handler=sessionRoute[req.method];
  else if(url.pathname==='/api/admin/provider-submissions')handler=listRoute[req.method];
  else if(url.pathname.startsWith('/api/admin/provider-submissions/')){handler=actions[req.method];ctx=context(url.pathname.split('/').at(-1));}
  else if(url.pathname==='/api/provider-self-listing')handler=intake[req.method];
  else if(url.pathname.startsWith('/api/provider-self-listing/')){handler=status[req.method];ctx=context(url.pathname.split('/').at(-1));}
  // All other API endpoints, including email and payment paths, are forbidden in this fixture.
  if(!handler){res.writeHead(405,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:{code:'FIXTURE_ENDPOINT_DISABLED'}}));return;}
  const response=await handler(request,ctx);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error('Local fixture handler error:',error.message);res.writeHead(500);res.end('Synthetic handler failure');}
}
const server=nodeHttp.createServer((req,res)=>void handle(req,res));
await new Promise(resolve=>server.listen(3255,'127.0.0.1',resolve));
const token=await createMagicLinkToken('operator@example.test');
console.log(JSON.stringify({fixture:'synthetic-admin-review',url:base+'/admin#key='+token,submissionId,externalCalls,paymentExecutions:0,uiPort,cookieAttributesUnchanged:true}));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());

