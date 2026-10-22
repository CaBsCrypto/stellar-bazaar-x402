// Isolated local compilation and loopback Express checks. No cloud client,
// wallet, Redis credentials, dependency installation or scheduler operation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat,readdir,copyFile,cp} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,dirname,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {IncomingMessage,ServerResponse} from 'node:http';
import {Duplex} from 'node:stream';
import {sourceDigest} from './prepare-functional-preview-source.mjs';

const root=resolve(import.meta.dirname,'..'),build=resolve(root,'.vercel/on-demand-provider-build');
const manifestPath='docs/evidence/continuous-on-demand-provider-preview-source-2026-10-11.json';
const manifestHash='c49d70ba78636b0ca9dc65c3247bab76f65a599460b03ab2a398003caa561bf5';
const digest='9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=await readFile(resolve(root,manifestPath));assert.equal(sha(raw),manifestHash);
const manifest=JSON.parse(raw),source=resolve(root,manifest.sourceDirectory);
assert.equal(manifest.sourceDigest,digest);assert.equal(manifest.files.length,22);assert.deepEqual(manifest.cronSchedules,[]);assert.equal(sourceDigest(manifest.files),digest);
const tree=async(directory,prefix='')=>{const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){assert.equal(entry.isSymbolicLink(),false);const path=prefix+entry.name;if(entry.isDirectory())result.push(...await tree(resolve(directory,entry.name),path+'/'));else{assert.equal(entry.isFile(),true);result.push(path);}}return result.sort();};
assert.deepEqual(await tree(source),manifest.files.map(f=>f.path).sort());
const sourceBytes=new Map();
for(const file of manifest.files){const target=resolve(source,file.path);assert.ok(relative(source,target)&&!relative(source,target).startsWith('..'+sep));const bytes=await readFile(target);assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);sourceBytes.set(file.path,bytes);}

const prior=resolve(root,'.vercel/text-production-provider-source'),lock=sourceBytes.get('package-lock.json');
assert.equal(sha(await readFile(resolve(prior,'package-lock.json'))),sha(lock));
const expectedLock=JSON.parse(lock),installedLock=JSON.parse(await readFile(resolve(prior,'node_modules/.package-lock.json')));
let installedPackages=0;
for(const [path,record]of Object.entries(installedLock.packages)){if(!path)continue;const expected=expectedLock.packages[path];assert.ok(expected);assert.equal(record.version,expected.version);if(record.integrity)assert.equal(record.integrity,expected.integrity);if(record.resolved)assert.equal(record.resolved,expected.resolved);installedPackages++;}
for(const name of ['express','@types/express','@types/node','typescript','@modelcontextprotocol/sdk','@stellar/stellar-sdk']){const actual=JSON.parse(await readFile(resolve(prior,'node_modules',name,'package.json')));assert.equal(actual.version,expectedLock.packages['node_modules/'+name].version);}
// A prior interrupted copy is recoverable only if it contains exactly these
// same 22 verified inputs. Never overwrite an unknown prior build or source.
const previous=await lstat(build).catch(error=>{if(error.code==='ENOENT')return undefined;throw error;});
if(previous){assert.equal(previous.isDirectory(),true);assert.equal(previous.isSymbolicLink(),false);const allowed=new Set([...manifest.files.map(f=>f.path.split('/')[0]),'node_modules','dist']);for(const entry of await readdir(build))assert.ok(allowed.has(entry));for(const folder of ['src','seller'])assert.deepEqual(await tree(resolve(build,folder)),manifest.files.filter(f=>f.path.startsWith(folder+'/')).map(f=>f.path.slice(folder.length+1)).sort());}
else{await mkdir(build);for(const [path,bytes]of sourceBytes){const target=resolve(build,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});}}
for(const file of manifest.files)assert.equal(sha(await readFile(resolve(build,file.path))),file.sha256);
const copiedModules=await lstat(resolve(build,'node_modules')).catch(error=>{if(error.code==='ENOENT')return undefined;throw error;});
if(copiedModules){assert.equal(copiedModules.isDirectory(),true);assert.equal(copiedModules.isSymbolicLink(),false);assert.equal(sha(await readFile(resolve(build,'node_modules/.package-lock.json'))),sha(await readFile(resolve(prior,'node_modules/.package-lock.json'))));}
else await cp(resolve(prior,'node_modules'),resolve(build,'node_modules'),{recursive:true,errorOnExist:true,force:false});
const compiled=spawnSync(process.execPath,[resolve(prior,'node_modules/typescript/bin/tsc'),'-p',resolve(build,'tsconfig.json'),'--incremental','false'],{cwd:build,encoding:'utf8',timeout:120000});
if(compiled.status!==0){console.error(compiled.stdout||compiled.stderr||'LOCAL_PROVIDER_COMPILATION_FAILED');process.exitCode=1;throw Error('LOCAL_PROVIDER_COMPILATION_FAILED');}
// tsc does not emit .mjs dependencies. Copy the same verified public bytes to
// the disposable output tree, without changing any frozen input or package.
for(const [path]of sourceBytes)if(path.startsWith('seller/')){const target=resolve(build,'dist',path);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(build,path),target);}
const buildOutput=await tree(resolve(build,'dist'));
const emitted=await Promise.all(buildOutput.map(async path=>({path,sha256:sha(await readFile(resolve(build,'dist',path)))})));
const ownEnv=['VERCEL_URL','CRON_SECRET','BAZAAR_HOSTED_SELLER_ENABLED','BAZAAR_HOSTED_SELLER_CONFIG','BAZAAR_FREE_DEMO_ADMISSION_UNTIL','BAZAAR_SELLER_EXECUTION_MODE'];
const saved=new Map(ownEnv.map(name=>[name,process.env[name]]));
let inMemoryHttpRequests=0;
const checks=[];
try{
 process.env.VERCEL_URL='provider-local-validation.example';process.env.CRON_SECRET='q'.repeat(43);process.env.BAZAAR_HOSTED_SELLER_ENABLED='false';process.env.BAZAAR_SELLER_EXECUTION_MODE='on-demand';delete process.env.BAZAAR_HOSTED_SELLER_CONFIG;delete process.env.BAZAAR_FREE_DEMO_ADMISSION_UNTIL;
 const {app}=await import(pathToFileURL(resolve(build,'dist/server.js')).href);
 const request=async(name,path,init,status,expected)=>{
  inMemoryHttpRequests++;const output=[],socket=new Duplex({read(){},write(chunk,encoding,callback){output.push(Buffer.from(chunk));callback();}});
  const req=new IncomingMessage(socket);req.method=init.method??'GET';req.url=path;req.headers={host:'provider-local-validation.example',...init.headers};req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;req.complete=true;
  if(init.body!==undefined){const body=Buffer.from(init.body);req.headers['content-length']=String(body.length);req.push(body);}req.push(null);
  const res=new ServerResponse(req);res.assignSocket(socket);
  let timer;
  try{
   await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('IN_MEMORY_HTTP_TIMEOUT')),3000);res.once('finish',resolve);res.once('error',reject);app.handle(req,res,reject);});
   assert.equal(res.statusCode,status,name);const wire=Buffer.concat(output),at=wire.indexOf('\r\n\r\n');assert.ok(at>=0,name);const body=JSON.parse(wire.subarray(at+4).toString());for(const [key,value]of Object.entries(expected))assert.deepEqual(body[key],value,name);checks.push({name,status});return body;
  }finally{clearTimeout(timer);socket.destroy();}
 };
 const auth={authorization:'Bearer '+process.env.CRON_SECRET},json={...auth,'content-type':'application/json'};
 await request('cron GET reaches disabled worker','/api/bazaar/seller/tick',{headers:auth},200,{reason:'disabled',mcpRequests:0,providerRequests:0,executed:0});
 await request('manual recovery POST reaches same disabled worker','/api/bazaar/seller/tick',{method:'POST',headers:json,body:'{"recovery":true}'},200,{reason:'disabled',mcpRequests:0,providerRequests:0,executed:0});
 await request('unauthorized GET','/api/bazaar/seller/tick',{},401,{error:'UNAUTHORIZED'});
 await request('unauthorized POST','/api/bazaar/seller/tick',{method:'POST',headers:{...json,authorization:'Bearer '+'x'.repeat(43)},body:'{"recovery":true}'},401,{error:'UNAUTHORIZED'});
 await request('invalid method','/api/bazaar/seller/tick',{method:'PUT',headers:auth},400,{error:'INVALID_WORKER_REQUEST'});
 await request('query cannot request recovery','/api/bazaar/seller/tick?recovery=true',{headers:auth},400,{error:'INVALID_WORKER_REQUEST'});
 await request('oversized recovery body','/api/bazaar/seller/tick',{method:'POST',headers:json,body:'{"recovery":true}'+ ' '.repeat(64)},400,{error:'INVALID_WORKER_REQUEST'});
 await request('invalid recovery field','/api/bazaar/seller/tick',{method:'POST',headers:json,body:'{"recovery":false}'},400,{error:'INVALID_WORKER_REQUEST'});
 await request('recovery rejects public browser origin','/api/bazaar/seller/tick',{method:'POST',headers:{...json,origin:'https://browser.example'},body:'{"recovery":true}'},400,{error:'INVALID_WORKER_REQUEST'});
 await request('provider health mounted','/health',{},200,{status:'ok'});
 await request('on-demand readiness reaches disabled worker without config','/api/bazaar/seller/tick',{method:'POST',headers:json,body:'{"mode":"readiness"}'},200,{reason:'disabled',mcpRequests:0,providerRequests:0,executed:0});
 await request('on-demand targeted delivery reaches disabled worker','/api/bazaar/seller/tick',{method:'POST',headers:json,body:JSON.stringify({mode:'deliver',operationId:randomUUID(),wakeId:randomUUID()})},200,{reason:'disabled',mcpRequests:0,providerRequests:0,executed:0});
 await request('readiness cannot target an operation','/api/bazaar/seller/tick',{method:'POST',headers:json,body:JSON.stringify({mode:'readiness',operationId:randomUUID()})},400,{error:'INVALID_WORKER_REQUEST'});
 await request('delivery requires exact wake UUID','/api/bazaar/seller/tick',{method:'POST',headers:json,body:JSON.stringify({mode:'deliver',operationId:randomUUID(),wakeId:'invalid'})},400,{error:'INVALID_WORKER_REQUEST'});
 await request('on-demand oversized body','/api/bazaar/seller/tick',{method:'POST',headers:json,body:'{"mode":"readiness"}'+ ' '.repeat(257)},400,{error:'INVALID_WORKER_REQUEST'});
 await request('query cannot select on-demand mode','/api/bazaar/seller/tick?mode=readiness',{method:'POST',headers:json,body:'{"mode":"readiness"}'},400,{error:'INVALID_WORKER_REQUEST'});
 await request('recovery and on-demand cannot be mixed','/api/bazaar/seller/tick',{method:'POST',headers:json,body:'{"mode":"readiness","recovery":true}'},400,{error:'INVALID_WORKER_REQUEST'});
 await request('public browser origin cannot invoke readiness','/api/bazaar/seller/tick',{method:'POST',headers:{...json,origin:'https://browser.example'},body:'{"mode":"readiness"}'},400,{error:'INVALID_WORKER_REQUEST'});
}finally{
 for(const [name,value]of saved)if(value===undefined)delete process.env[name];else process.env[name]=value;
}
// Verify every frozen byte again after compilation and Express mounting.
assert.deepEqual(await tree(source),manifest.files.map(f=>f.path).sort());
for(const file of manifest.files){assert.equal(sha(await readFile(resolve(source,file.path))),file.sha256);assert.equal(sha(await readFile(resolve(build,file.path))),file.sha256);}
assert.equal(sha(await readFile(resolve(root,manifestPath))),manifestHash);
const evidence={schema:'bazaar.on-demand-provider-local-build/v1',evidenceNonce:randomUUID(),recordedAt:new Date().toISOString(),status:'PASS_LOCAL_COMPILE_AND_EXPRESS',sourceDigest:digest,manifest:manifestPath,manifestSha256:manifestHash,sourceFilesVerified:22,frozenSourceUntouched:true,buildDirectory:relative(root,build).replaceAll('\\','/'),dependencies:{installedPackagesVerified:installedPackages,packageLockSha256:sha(lock),existingModulesReused:true,reuseMethod:'isolated copy',packageInstallation:false,packageChanges:false,priorDirectory:relative(root,prior).replaceAll('\\','/')},compiler:{name:'typescript',version:expectedLock.packages['node_modules/typescript'].version,exitCode:compiled.status,emittedFiles:emitted.length},emitted,checks,inMemoryHttpRequests,loopbackRequests:0,externalRequests:0,redisRequests:0,mcpRequests:0,payments:0,cloudWrites:0,productionPublished:false,cronActivated:false,limitations:['runtime enabled was false; no provider lease or paid-order execution checked','actual compiled Express app with IncomingMessage/ServerResponse and Duplex in memory; sandbox blocked TCP loopback','local compilation and in-memory HTTP are not hosted Preview acceptance','actual protected Preview on-demand configuration and hosted acceptance are still required']};
await writeFile(resolve(root,'docs/evidence/on-demand-provider-build-2026-10-11.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
