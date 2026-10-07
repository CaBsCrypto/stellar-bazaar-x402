import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { submitProviderDraft, listProviderSubmissionsForOperator, getSubmissionStatus, setReviewStoreForTests } from '../lib/provider-self-listing.ts';
import { createRedisReviewStore, REVIEW_ENVELOPE_MAX_BYTES } from '../lib/provider-review-redis.ts';
import { getReviewRedis, getReviewPrefix, reviewSharedConfigured, setReviewRedisForTests } from '../lib/provider-review-runtime.ts';

const prefix='bazaar-review:local-test';
const key=prefix+':state';
const data=new Map(); let writes=0, loseAck=false;
function validate(s){assert.equal(s.version,1);assert.ok(Array.isArray(s.records));assert.ok(s.records.every(r=>typeof r.submission==='number'));}
const redis={async get(k){return data.get(k)??null;},async eval(script,keys,args){
  assert.ok(!/EXPIRE|PEXPIRE|SETEX/.test(script));
  const old=data.get(keys[0]);
  if(args[0]==='missing'?old!==undefined:old!==args[1])return 0;
  data.set(keys[0],args[2]);writes++;
  if(loseAck){loseAck=false;throw Error('lost acknowledgement');}return 1;
}};
const store=()=>createRedisReviewStore(redis,prefix,validate);
const add=(s,n)=>s.records.push({submission:n,tokenHash:'h',digest:'d'});
await store().transact(s=>add(s,0));
const written=writes;
assert.equal(await store().transact(s=>s.records.length),1);
assert.equal(writes,written,'unchanged read must not write');
let calls=0; let release; const ready=new Promise(resolve=>release=resolve);
let entered; const started=new Promise(resolve=>entered=resolve);
const stale=store().transact(async s=>{calls++;entered();await ready;add(s,1);});
await started;await store().transact(s=>add(s,2));release();
await assert.rejects(stale,/conflicted/);assert.equal(calls,1);
loseAck=true;calls=0;
await assert.rejects(store().transact(s=>{calls++;add(s,3);}),/lost acknowledgement/);
assert.equal(calls,1);assert.equal(await store().transact(s=>s.records.length),3);
const valid=data.get(key);
await assert.rejects(store().transact(s=>{add(s,4);throw Error('abort');}));assert.equal(data.get(key),valid);
for(const bad of ['{bad',JSON.stringify({version:1,revision:'bad',state:{version:1,records:[]}}),JSON.stringify({version:1,revision:'00000000-0000-4000-8000-000000000000',state:{version:2,records:[]}})]){
  data.set(key,bad);await assert.rejects(store().transact(()=>null));assert.equal(data.get(key),bad);
}data.set(key,valid);
const beforeCapacity=writes;
await assert.rejects(store().transact(s=>s.records.push({submission:9,tokenHash:'x'.repeat(REVIEW_ENVELOPE_MAX_BYTES),digest:'d'})),/capacity exhausted/);
assert.equal(writes,beforeCapacity);assert.equal(data.get(key),valid);
data.set(key,'x'.repeat(REVIEW_ENVELOPE_MAX_BYTES+1));await assert.rejects(store().transact(()=>null),/Invalid review envelope/);assert.equal(writes,beforeCapacity);data.set(key,valid);

// Independent Node processes share a loopback-only fake Redis REST endpoint.
const server=createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const c=JSON.parse(body);const result=c[0]==='GET'?await redis.get(c[1]):await redis.eval(c[1],[c[3]],c.slice(4));res.setHeader('content-type','application/json');res.end(JSON.stringify({result}));}catch{res.statusCode=500;res.end('{}');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const moduleUrl=new URL('../lib/provider-review-redis.ts',import.meta.url).href;
function child(n,read=false){return new Promise((resolve,reject)=>{
  const source=`import {createRedisReviewStore} from ${JSON.stringify(moduleUrl)}; const command=async c=>(await(await fetch(${JSON.stringify(url)},{method:'POST',body:JSON.stringify(c)})).json()).result;const redis={get:k=>command(['GET',k]),eval:(s,k,a)=>command(['EVAL',s,k.length,...k,...a])};const store=createRedisReviewStore(redis,${JSON.stringify(prefix)},s=>{if(s.version!==1)throw Error('corrupt')});try{const result=await store.transact(async s=>{${read?'return s.records.length':`await new Promise(r=>setTimeout(r,30));s.records.push({submission:${n},tokenHash:'h',digest:'d'});return 'ok'`}});console.log(result)}catch{console.log('conflict')}`;
  const p=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',source]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('exit',code=>code===0?resolve(out.trim()):reject(Error(err)));
});}
try{
 const answers=await Promise.all(Array.from({length:8},(_,i)=>child(i+10)));
 const winners=answers.filter(x=>x==='ok').length;
 assert.ok(winners>=1);assert.equal(await store().transact(s=>s.records.length),3+winners);
 assert.equal(Number(await child(0,true)),3+winners,'new process reads persistent state');
 process.env.BAZAAR_PROVIDER_REVIEW_BACKEND='redis';process.env.BAZAAR_REVIEW_PREFIX=prefix;
 delete process.env.BAZAAR_REVIEW_REDIS_REST_URL;delete process.env.BAZAAR_REVIEW_REDIS_REST_TOKEN;
 process.env.UPSTASH_REDIS_REST_URL='https://unrelated.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='unused';
 assert.equal(reviewSharedConfigured(),false);assert.throws(getReviewRedis,/REQUIRED/);
 setReviewRedisForTests(redis);assert.equal(getReviewRedis(),redis);assert.equal(reviewSharedConfigured(),true);
 process.env.BAZAAR_REVIEW_PREFIX='shared';assert.throws(getReviewPrefix,/NAMESPACE/);
 process.env.BAZAAR_REVIEW_PREFIX=prefix;process.env.BAZAAR_PROVIDER_REVIEW_BACKEND='typo';assert.throws(getReviewRedis,/BACKEND/);
 process.env.BAZAAR_PROVIDER_REVIEW_BACKEND='redis';process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE='true';
 await setReviewStoreForTests(undefined);data.clear();
 const card={version:'bazaar.service-card/v0',id:'redis-review-fixture',name:'Redis review',description:'Shared review storage fixture',kind:'http',url:'https://api.provider.example.com',routeTemplate:'/v1/quote/{pair}',input:[{name:'pair',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.001',destination:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'},provider:{name:'Fixture'},tags:['fixture']};
 const identity={submissionId:randomUUID(),submissionToken:randomBytes(32).toString('hex')};
 assert.equal((await submitProviderDraft(card,{method:'dns-txt',domain:'api.provider.example.com'},identity)).ok,true);
 const page=await listProviderSubmissionsForOperator(1,1);assert.equal(page.ok,true);assert.equal(page.value.total,1);assert.deepEqual(page.value.submissions[0].card,card);
 assert.equal(JSON.stringify(page).includes('tokenHash'),false);assert.equal(JSON.stringify(page).includes('digest'),false);assert.equal(JSON.stringify(page).includes(identity.submissionToken),false);
 assert.equal((await listProviderSubmissionsForOperator(2,1)).value.submissions.length,0);assert.equal((await listProviderSubmissionsForOperator(0,1)).ok,false);
 const afterSubmit=writes;assert.equal((await getSubmissionStatus(identity.submissionId,identity.submissionToken)).ok,true);assert.equal(writes,afterSubmit);
 console.log(JSON.stringify({ok:true,independentProcesses:8,winners,restart:true,unchangedReadsNoWrites:true,conflictNoRetry:true,lostAckNoRetry:true,corruptionFailsClosed:true,noCredentialAliases:true}));
}finally{setReviewRedisForTests(undefined);await new Promise(resolve=>server.close(resolve));}
