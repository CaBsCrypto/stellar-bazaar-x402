// Offline compiler and real Express mounting checks. No cloud client or socket.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat,readdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {IncomingMessage,ServerResponse} from 'node:http';
import {Duplex} from 'node:stream';
import {verifyRecoveryExampleProvider,RECOVERY_PROVIDER_SOURCE,RECOVERY_PROVIDER_MANIFEST} from './prepare-recovery-example-provider.mjs';

const root=resolve(import.meta.dirname,'..'),source=resolve(root,RECOVERY_PROVIDER_SOURCE),build=resolve(root,'.vercel/recovery-example-provider-v2-build'),prior=resolve(root,'.vercel/text-production-provider-source');
const verified=await verifyRecoveryExampleProvider(root),raw=await readFile(resolve(root,RECOVERY_PROVIDER_MANIFEST)),manifest=JSON.parse(raw);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const lock=await readFile(resolve(source,'package-lock.json'));assert.equal(sha(lock),sha(await readFile(resolve(prior,'package-lock.json'))));
const expectedLock=JSON.parse(lock),installedLock=JSON.parse(await readFile(resolve(prior,'node_modules/.package-lock.json')));
let installedPackages=0;for(const [path,row]of Object.entries(installedLock.packages)){if(!path)continue;const expected=expectedLock.packages[path];assert.ok(expected);assert.equal(row.version,expected.version);if(row.integrity)assert.equal(row.integrity,expected.integrity);if(row.resolved)assert.equal(row.resolved,expected.resolved);installedPackages++;}
for(const name of ['express','@types/express','@types/node','typescript','@modelcontextprotocol/sdk','@stellar/stellar-sdk']){const installed=JSON.parse(await readFile(resolve(prior,'node_modules',name,'package.json')));assert.equal(installed.version,expectedLock.packages['node_modules/'+name].version);}
try{await lstat(build);throw Error('NEW_BUILD_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(build);for(const row of manifest.files){const target=resolve(build,row.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,await readFile(resolve(source,row.path)),{flag:'wx'});}
await cp(resolve(prior,'node_modules'),resolve(build,'node_modules'),{recursive:true,errorOnExist:true,force:false});
const compiled=spawnSync(process.execPath,[resolve(prior,'node_modules/typescript/bin/tsc'),'-p',resolve(build,'tsconfig.json'),'--incremental','false'],{cwd:build,encoding:'utf8',timeout:120000});
if(compiled.status!==0){console.error(compiled.stdout||compiled.stderr||'LOCAL_PROVIDER_COMPILATION_FAILED');throw Error('LOCAL_PROVIDER_COMPILATION_FAILED');}
for(const row of manifest.files)if(row.path.startsWith('seller/')){const target=resolve(build,'dist',row.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,await readFile(resolve(source,row.path)),{flag:'wx'});}
const saved=new Map();for(const name of ['VERCEL','VERCEL_ENV','VERCEL_URL','CRON_SECRET','BAZAAR_HOSTED_SELLER_ENABLED','BAZAAR_SELLER_EXECUTION_MODE','BAZAAR_HOSTED_SELLER_CONFIG','BAZAAR_EXAMPLE_CONTROL_RECORD'])saved.set(name,process.env[name]);
let requests=0;const checks=[];
try{
 process.env.VERCEL='1';process.env.VERCEL_ENV='preview';process.env.VERCEL_URL='example-local.invalid';process.env.CRON_SECRET='t'.repeat(43);process.env.BAZAAR_HOSTED_SELLER_ENABLED='false';process.env.BAZAAR_SELLER_EXECUTION_MODE='on-demand';delete process.env.BAZAAR_HOSTED_SELLER_CONFIG;
 process.env.BAZAAR_EXAMPLE_CONTROL_RECORD='stellar-bazaar-verification='+'n'.repeat(24);
 const {app}=await import(pathToFileURL(resolve(build,'dist/server.js')).href);
 async function request(name,path,init,expectedStatus,expectedBody){
  requests++;const output=[],socket=new Duplex({read(){},write(chunk,_encoding,callback){output.push(Buffer.from(chunk));callback();}}),req=new IncomingMessage(socket);
  req.method=init.method??'GET';req.url=path;req.headers={host:'example-local.invalid',...init.headers};req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;req.complete=true;
  if(init.body!==undefined){const body=Buffer.from(init.body);req.headers['content-length']=String(body.length);req.push(body);}req.push(null);
  const res=new ServerResponse(req);res.assignSocket(socket);let timer;
  try{
   await new Promise((done,reject)=>{timer=setTimeout(()=>reject(Error('IN_MEMORY_HTTP_TIMEOUT')),3000);res.once('finish',done);res.once('error',reject);app.handle(req,res,reject);});
   assert.equal(res.statusCode,expectedStatus,name);const wire=Buffer.concat(output),at=wire.indexOf('\r\n\r\n');assert.ok(at>=0);const bytes=wire.subarray(at+4).toString();
   assert.match(String(res.getHeader('Cache-Control')),/no-store/);assert.equal(res.getHeader('X-Content-Type-Options'),'nosniff');assert.equal(res.getHeader('Referrer-Policy'),'no-referrer');assert.equal(res.getHeader('X-Powered-By'),undefined);
   if(typeof expectedBody==='string')assert.equal(bytes,expectedBody);else if(expectedBody){const body=JSON.parse(bytes);for(const [key,value]of Object.entries(expectedBody))assert.deepEqual(body[key],value,name);}
   checks.push({name,status:res.statusCode});
  }finally{clearTimeout(timer);socket.destroy();}
 }
 const headers={authorization:'Bearer '+process.env.CRON_SECRET,'content-type':'application/json'};
 await request('disabled fixed readiness route','/api/bazaar/example/tick',{method:'POST',headers,body:'{"mode":"readiness"}'},200,{reason:'disabled',mcpRequests:0,providerRequests:0,executed:0});
 await request('disabled fixed delivery route','/api/bazaar/example/tick',{method:'POST',headers,body:'{"mode":"deliver","operationId":"10000000-0000-4000-8000-000000000001","wakeId":"20000000-0000-4000-8000-000000000001"}'},200,{reason:'disabled',executed:0});
 await request('unauthorized readiness rejected','/api/bazaar/example/tick',{method:'POST',headers:{'content-type':'application/json'},body:'{"mode":"readiness"}'},401,{error:'UNAUTHORIZED'});
 await request('GET cannot trigger periodic work','/api/bazaar/example/tick',{headers},400,{error:'INVALID_WORKER_REQUEST'});
 await request('query cannot select service','/api/bazaar/example/tick?service=other',{method:'POST',headers,body:'{"mode":"readiness"}'},400,{error:'INVALID_WORKER_REQUEST'});
 await request('body cannot select service','/api/bazaar/example/tick',{method:'POST',headers,body:'{"mode":"readiness","serviceId":"other"}'},400,{error:'INVALID_WORKER_REQUEST'});
 await request('body maximum enforced before parsers','/api/bazaar/example/tick',{method:'POST',headers,body:'{"mode":"readiness"}'+ ' '.repeat(257)},400,{error:'INVALID_WORKER_REQUEST'});
 await request('public browser origin cannot wake','/api/bazaar/example/tick',{method:'POST',headers:{...headers,origin:'https://browser.invalid'},body:'{"mode":"readiness"}'},400,{error:'INVALID_WORKER_REQUEST'});
 await request('full worker scan is unmounted','/api/bazaar/seller/tick',{headers},404,{error:'NOT_FOUND'});
 await request('old provider endpoint is unmounted','/v1/marketplace-text',{method:'POST',headers,body:'{}'},404,{error:'NOT_FOUND'});
 await request('unconfigured runtime fails closed','/v1/bazaar-recovery-example',{method:'POST',headers,body:'{}'},503,{error:'EXAMPLE_CONFIGURATION_UNAVAILABLE'});
 await request('unconfigured availability fails closed','/v1/bazaar-recovery-example/availability',{headers},503,{error:'EXAMPLE_CONFIGURATION_UNAVAILABLE'});
 await request('public native endpoint control proof','/.well-known/stellar-bazaar-provider.txt',{},200,process.env.BAZAAR_EXAMPLE_CONTROL_RECORD);
 await request('proof query rejected','/.well-known/stellar-bazaar-provider.txt?key=secret',{},400,'');
 delete process.env.BAZAAR_EXAMPLE_CONTROL_RECORD;await request('missing public proof disabled','/.well-known/stellar-bazaar-provider.txt',{},404,'');
 process.env.BAZAAR_EXAMPLE_CONTROL_RECORD='INVALID_PRIVATE_DATA';await request('unexpected proof data not exposed','/.well-known/stellar-bazaar-provider.txt',{},404,'');
 await request('public static health has no execution','/health',{},200,{status:'ok',service:'bazaar-recovery-example-text-v1',mode:'on-demand',paymentSubmissions:0});
 await request('health query cannot inject control','/health?mode=deliver',{},400,{error:'INVALID_REQUEST'});
}finally{for(const [name,value]of saved)if(value===undefined)delete process.env[name];else process.env[name]=value;}
const walk=async(directory,prefix='')=>{const result=[];for(const row of await readdir(directory,{withFileTypes:true})){assert.equal(row.isSymbolicLink(),false);const path=prefix+row.name;if(row.isDirectory())result.push(...await walk(resolve(directory,row.name),path+'/'));else result.push({path,sha256:sha(await readFile(resolve(directory,row.name)))});}return result.sort((a,b)=>a.path.localeCompare(b.path));};
const emitted=await walk(resolve(build,'dist'));await verifyRecoveryExampleProvider(root);
const evidence={schema:'bazaar.recovery-example-provider-build/v1',recordedAt:new Date().toISOString(),status:'PASS_LOCAL_COMPILE_AND_EXPRESS',sourceDigest:verified.sourceDigest,manifest:RECOVERY_PROVIDER_MANIFEST,manifestSha256:sha(raw),filesVerified:manifest.files.length,sourceUntouched:true,buildDirectory:relative(root,build).replaceAll('\\','/'),compiler:{name:'typescript',version:expectedLock.packages['node_modules/typescript'].version,exitCode:compiled.status},dependencies:{packageLockSha256:sha(lock),installedPackagesVerified:installedPackages,existingReviewedModulesCopied:true,packageInstallation:false},checks,emitted,inMemoryHttpRequests:requests,externalRequests:0,redisRequests:0,payments:0,cloudWrites:0,cronActivated:false,productionPublished:false,limitations:['Compiled Express routing was checked in memory with the worker disabled; no hosted invocation is claimed.','Encrypted paid execution is validated in the separate local provider contract and must be accepted in the isolated Preview without a real payment bypass.']};
await writeFile(resolve(root,'docs/evidence/recovery-example-provider-v2-build-2026-10-12.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:evidence.status,sourceDigest:evidence.sourceDigest,checks:checks.length,compilerExitCode:compiled.status,inMemoryHttpRequests:requests,externalRequests:0,payments:0}));
