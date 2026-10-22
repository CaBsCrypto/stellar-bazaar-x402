import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {IncomingMessage,ServerResponse} from 'node:http';
import {registerHooks} from 'node:module';
import {resolve,dirname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CONTINUOUS_PROVIDER_RUNTIME_FILES,CONTINUOUS_PROVIDER_FROZEN_FILES} from './prepare-continuous-provider-preview.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),stage=resolve(repo,process.argv[2]??'.vercel/continuous-provider-preview-source-20261011'),manifestPath=resolve(repo,process.argv[3]??'docs/evidence/continuous-provider-source-2026-10-11.json'),frozen=resolve(repo,'.vercel/text-production-provider-source');
const contained=(root,path)=>{const part=relative(root,path);return part!==''&&!part.startsWith('..')&&!isAbsolute(part);},sha=v=>createHash('sha256').update(v).digest('hex');
assert.ok(contained(repo,stage)&&contained(repo,manifestPath));let checks=0,externalRequests=0;
const manifest=JSON.parse(await readFile(manifestPath,'utf8')),names=new Set([...CONTINUOUS_PROVIDER_FROZEN_FILES,...CONTINUOUS_PROVIDER_RUNTIME_FILES.map(name=>'seller/'+name)]);
assert.equal(manifest.status,'PREPARED_LOCAL_NO_CRON');assert.equal(manifest.sourceDirectory,relative(repo,stage).replaceAll('\\','/'));assert.equal(manifest.files.length,22);assert.equal(names.size,22);assert.equal(manifest.credentialsCopied,false);assert.equal(manifest.privateFilesRead,false);assert.equal(manifest.tickInvocations,0);assert.deepEqual(manifest.cronSchedules,[]);checks++;
assert.equal(manifest.sourceDigest,sha(JSON.stringify(manifest.files)));checks++;
for(const entry of manifest.files){assert.ok(names.has(entry.path));const path=resolve(stage,entry.path);assert.ok(contained(stage,path));const stat=await lstat(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink());const bytes=await readFile(path);assert.equal(sha(bytes),entry.sha256);assert.equal(bytes.length,entry.bytes);if(entry.path.startsWith('seller/')&&CONTINUOUS_PROVIDER_RUNTIME_FILES.includes(entry.path.slice(7)))assert.equal(sha(await readFile(join(repo,'examples',entry.path.slice(7)))),entry.sha256);checks++;}
async function inspect(directory,prefix=''){for(const entry of await readdir(directory,{withFileTypes:true})){assert.ok(!entry.isSymbolicLink());const path=prefix+entry.name;if(entry.isDirectory())await inspect(join(directory,entry.name),path+'/');else assert.ok(names.has(path),'Package contains an unreviewed file');}}
await inspect(stage);checks++;
const config=JSON.parse(await readFile(join(stage,'vercel.json'),'utf8'));assert.deepEqual(config.crons,[]);assert.equal(config.functions['server.ts'].maxDuration,60);assert.deepEqual(manifest.proposedProductionCron,{path:'/api/bazaar/seller/tick',schedule:'*/2 * * * *',activation:'NOT_APPLIED'});checks++;
const pkg=JSON.parse(await readFile(join(stage,'package.json'),'utf8')),lock=JSON.parse(await readFile(join(stage,'package-lock.json'),'utf8'));assert.equal(pkg.dependencies['@modelcontextprotocol/sdk'],'1.30.0');assert.equal(pkg.dependencies['@stellar/stellar-sdk'],'14.4.2');assert.deepEqual(pkg.dependencies,lock.packages[''].dependencies);checks++;

// Reuse the accepted provider's installed dependencies without copying them,
// changing the package, installing anything or contacting a registry.
const hook=registerHooks({resolve(specifier,context,nextResolve){
 const local=context.parentURL?.startsWith('file:')&&contained(stage,fileURLToPath(context.parentURL));
 if(local&&specifier.startsWith('.')&&specifier.endsWith('.js'))return nextResolve(pathToFileURL(resolve(dirname(fileURLToPath(context.parentURL)),specifier.slice(0,-3)+'.ts')).href,context);
 if(local&&!specifier.startsWith('.')&&!specifier.startsWith('node:'))return nextResolve(specifier,{...context,parentURL:pathToFileURL(join(frozen,'server.ts')).href});
 return nextResolve(specifier,context);
}});
const prior={...process.env},priorFetch=globalThis.fetch,secret='s'.repeat(43),worker='w'.repeat(43);
globalThis.fetch=async()=>{externalRequests++;throw Error('PACKAGE_NETWORK_FORBIDDEN');};
try{
 for(const name of Object.keys(process.env))if(/^(BAZAAR_|VERCEL|CRON_SECRET|X402_|STELLAR_)/.test(name))delete process.env[name];
 Object.assign(process.env,{VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:'synthetic-provider.vercel.app',CRON_SECRET:secret,BAZAAR_HOSTED_SELLER_ENABLED:'false',BAZAAR_MARKETPLACE_TEXT_ENABLED:'false'});
 const {app}=await import(pathToFileURL(join(stage,'server.ts')).href);
 async function invoke(method,path,headers={}){return new Promise((done,reject)=>{const socket=new EventEmitter();socket.remoteAddress='127.0.0.1';const req=new IncomingMessage(socket);req.method=method;req.url=path;req.headers=headers;req.httpVersion='1.1';const res=new ServerResponse(req),timer=setTimeout(()=>reject(Error('PACKAGE_ROUTE_TIMEOUT')),3000);res.end=body=>{clearTimeout(timer);try{done({status:res.statusCode,headers:res.getHeaders(),body:body?JSON.parse(String(body)):undefined});}catch(error){reject(error);}return res;};app.handle(req,res,error=>{clearTimeout(timer);reject(error??Error('PACKAGE_ROUTE_MISSING'));});});}
 const authorization={authorization:'Bearer '+secret};
 assert.equal((await invoke('GET','/api/bazaar/seller/tick')).status,401);checks++;
 const disabled=await invoke('GET','/api/bazaar/seller/tick',authorization);assert.equal(disabled.status,200);assert.equal(disabled.body.reason,'disabled');assert.equal(disabled.body.mcpRequests,0);assert.equal(disabled.body.providerRequests,0);assert.equal(disabled.body.executed,0);assert.ok(!JSON.stringify(disabled.body).includes(secret));checks++;
 assert.equal((await invoke('GET','/api/bazaar/seller/tick?input=forbidden',authorization)).status,400);assert.equal((await invoke('HEAD','/api/bazaar/seller/tick',authorization)).status,400);checks++;
 assert.equal((await invoke('GET','/v1/marketplace-text/availability')).status,503);checks++;
 process.env.BAZAAR_MARKETPLACE_TEXT_ENABLED='true';process.env.BAZAAR_MARKETPLACE_WORKER_TOKEN_SHA256=sha(worker);
 assert.equal((await invoke('GET','/v1/marketplace-text/availability')).status,401);checks++;
 const health=await invoke('GET','/v1/marketplace-text/availability',{authorization:'Bearer '+worker});assert.equal(health.status,200);assert.deepEqual(health.body,{ready:true,network:'stellar:testnet'});assert.match(health.headers['cache-control'],/no-store/);checks++;
 assert.equal((await invoke('GET','/v1/marketplace-text/availability?input=forbidden',{authorization:'Bearer '+worker})).status,400);assert.equal((await invoke('HEAD','/v1/marketplace-text/availability',{authorization:'Bearer '+worker})).status,405);checks++;
 assert.equal(externalRequests,0);checks++;
 console.log(JSON.stringify({status:'PASS',checks,sourceDigest:manifest.sourceDigest,publicFiles:22,currentRuntimeFiles:9,nativeExpress:true,redisRequests:0,externalRequests,payments:0,providerExecutions:0,cronActivated:false,productionPublished:false,coverage:['exact public allowlist and source hashes','current reviewed seller runtime','pinned package lock','empty Preview schedules','disabled seller has no effects','machine route authentication','native authenticated Testnet provider availability','no network or private profile loading']}));
}finally{hook.deregister();globalThis.fetch=priorFetch;for(const name of Object.keys(process.env))if(!(name in prior))delete process.env[name];Object.assign(process.env,prior);}
