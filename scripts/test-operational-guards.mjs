import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,env={},deps={},extra={}) {
 const module={exports:{}};
 const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(source,{module,exports:module.exports,process:{env},Buffer,URL,Response,console:{log(){throw Error('unexpected log')},warn(){throw Error('unexpected log')}},require:name=>deps[name]??require(name),...extra});
 return module.exports;
}
const records=new Map(); let evals=0,fail=false;
class RedisDouble {
 async set(key,value){records.set(key,value)}
 async eval(script,keys){assert.match(script,/redis.call\('GET'/);assert.match(script,/redis.call\('DEL'/);evals++;if(fail)throw Error('offline');const result=records.get(keys[0]);records.delete(keys[0]);return result??null;}
}
const env={NODE_ENV:'production',ADMIN_ALLOWED_EMAILS:'test@example.invalid',UPSTASH_REDIS_REST_URL:'https://fixture.invalid',UPSTASH_REDIS_REST_TOKEN:'synthetic'};
const auth=load('lib/admin-guard.ts',env,{'@upstash/redis':{Redis:RedisDouble}});
assert.equal(auth.verifyAdminAccess('Bearer '+'a'.repeat(40)),false);
env.BAZAAR_ADMIN_KEY='a'.repeat(40);
assert.equal(auth.verifyAdminAccess('Bearer '+env.BAZAAR_ADMIN_KEY),true);
assert.equal(auth.verifyAdminAccess('Bearer '+'b'.repeat(40)),false);
delete env.BAZAAR_ADMIN_KEY;
assert.equal(auth.isAuthorizedAdminEmail('unknown@example.invalid'),false);
const token=await auth.createMagicLinkToken('test@example.invalid');
const concurrent=await Promise.all(Array.from({length:8},()=>auth.verifyAdminAccessAsync('Bearer '+token)));
assert.equal(concurrent.filter(Boolean).length,1);
assert.equal(records.size,0);assert.equal(evals,8);
for(const record of [null,'broken',{}, {email:'test@example.invalid',expiresAt:Date.now()-1},{email:'other@example.invalid',expiresAt:Date.now()+60000}]){
 records.set('bazaar:admin:magic:'+token,JSON.stringify(record));assert.equal(await auth.verifyAndConsumeMagicToken(token),false);assert.equal(records.size,0);
}
fail=true;assert.equal(await auth.verifyAndConsumeMagicToken(token),false);fail=false;
const noStore=load('lib/admin-guard.ts',{NODE_ENV:'production',ADMIN_ALLOWED_EMAILS:'test@example.invalid'},{'@upstash/redis':{Redis:RedisDouble}});
await assert.rejects(()=>noStore.createMagicLinkToken('test@example.invalid'),/ADMIN_STORAGE_NOT_CONFIGURED/);
// Exercise actual shared ingest validation with a storage double, not a successful-response stub.
let writes=0,exists=false;
const ingestEnv={BAZAAR_ENABLE_REGISTRY_MUTATIONS:'true',BAZAAR_PROVIDER_SECRET:'fixture-provider'};
const ingest=load('lib/service-ingest.ts',ingestEnv,{
 './dynamic-registry.ts':{storageMode:()=> 'upstash',isReservedServiceId:id=>id==='reserved',createDynamicServiceCard:async card=>{writes++;return exists?{exists:true}:{entry:{id:card.id,card,registeredAt:'synthetic'}}}},
 './service-card-schema.ts':{parseServiceCardShape:card=>card?.id?{ok:true,card}:{ok:false,issues:[]}},
 './discovery.ts':{validateServiceCard:card=>card.invalid?[{status:'fail',rule:'fixture',reason:'invalid'}]:[]}
});
const route=load('app/api/ingest/route.ts',{}, {'next/server':{NextResponse:Response},'@/lib/service-ingest':ingest});
const request=(key,card={id:'fixture'})=>({headers:new Headers(key?{authorization:'Bearer '+key}:{}),json:async()=>card});
delete ingestEnv.BAZAAR_ENABLE_REGISTRY_MUTATIONS;
assert.equal((await route.POST(request('fixture-provider'))).status,503);
ingestEnv.BAZAAR_ENABLE_REGISTRY_MUTATIONS='true';
assert.equal((await route.POST(request('wrong'))).status,401);
assert.equal((await route.POST(request('fixture-provider',{}))).status,422);
assert.equal((await route.POST(request('fixture-provider',{id:'reserved'}))).status,409);
assert.equal((await route.POST(request('fixture-provider',{id:'invalid',invalid:true}))).status,422);
assert.equal(writes,0);
assert.equal((await route.POST(request('fixture-provider'))).status,201);exists=true;
assert.equal((await route.POST(request('fixture-provider'))).status,409);assert.equal(writes,2);
// Legacy HTTP routes preserve unsigned discovery but cannot reach facilitator when disabled.
for(const name of ['ledger-brief','market-window','contract-safety']) for(const flag of [undefined,'false','TRUE']){
 let effects=0;
 const r=load(`app/api/x402/${name}/route.ts`,{X402_LEGACY_PAYMENTS_ENABLED:flag}, {
  'next/server':{NextResponse:Response},'@x402/core/http':{encodePaymentRequiredHeader:()=> 'fixture',decodePaymentSignatureHeader:()=>{effects++;throw Error('must not decode')}},'@x402/core/types':{},
  '@/lib/x402-facilitator':{getFacilitatorClient:()=>{effects++;throw Error('must not contact')}},
  '@/lib/x402-config':{requireServerX402Config:()=>({seller:'G'+'A'.repeat(55)}),X402_NETWORK:'stellar:testnet'},
  '@/lib/delivery-result':{},'@/lib/x402-requirements':{}
 });
 const req={nextUrl:new URL('http://127.0.0.1/api/x402/'+name),headers:new Headers({'payment-signature':'synthetic'})};
 assert.equal((await r.GET(req)).status,503);assert.equal(effects,0);
 req.headers=new Headers();assert.equal((await r.GET(req)).status,402);assert.equal(effects,0);
}
for(const runtime of [{NODE_ENV:'production'},{NODE_ENV:'development',VERCEL:'1'}]) {
 let signatures=0;
 const demo=load('app/api/x402/demo-pay/route.ts',{...runtime,X402_ENABLE_LOCAL_PAYER:'true'},{
  'next/server':{NextResponse:Response},'@x402/stellar':{createEd25519Signer:()=>{signatures++;throw Error('forbidden')}},
  '@x402/stellar/exact/client':{},'@x402/core/client':{},'@x402/fetch':{},'@/lib/x402-config':{},'@/lib/testnet-payer-safety':{}
 });
 assert.equal((await demo.POST()).status,403);assert.equal(signatures,0);
}
let minted=0,sent=0;
const mailEnv={};
const mail=load('app/api/admin/magic-link/route.ts',mailEnv,{'next/server':{NextResponse:Response},'@/lib/admin-guard':{isAuthorizedAdminEmail:()=>true,createMagicLinkToken:async()=>{minted++;return token}}},{fetch:async()=>{sent++;return {ok:true}}});
const mailReq={json:async()=>({email:'test@example.invalid'}),nextUrl:new URL('https://untrusted.invalid')};
assert.equal((await mail.POST(mailReq)).status,503);assert.equal(minted,0);
mailEnv.RESEND_API_KEY='synthetic';mailEnv.NEXT_PUBLIC_APP_URL='http://untrusted.invalid';
assert.equal((await mail.POST(mailReq)).status,503);assert.equal(minted,0);
mailEnv.NEXT_PUBLIC_APP_URL='https://bazaar.example.invalid';
const response=await mail.POST(mailReq);assert.equal(response.status,200);assert.equal(minted,1);assert.equal(sent,1);assert.equal(JSON.stringify(await response.json()).includes(token),false);
console.log('PASS operational guards: explicit auth/config, atomic OTP double concurrency, expired/corrupt/offline rejection, actual ingest validation, legacy payment block before decode/facilitator, no token response/log. No network or real credentials.');
