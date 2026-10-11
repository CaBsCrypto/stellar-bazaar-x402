import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {IncomingMessage,ServerResponse} from 'node:http';
import {registerHooks} from 'node:module';
import {dirname,resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runtimeFiles=['seller-hosted-handler.mjs','seller-hosted-tick.mjs','seller-redis-secret-store.mjs','seller-mcp-transport.mjs','seller-http-adapter.mjs','seller-service-card.mjs','seller-marketplace-worker.mjs','private-mcp-client.mjs','market-price.mjs'];
const sourceFiles=['marketplace-routes.ts','marketplace-text.ts','preview-app.ts','types.ts','engine/algorithmic-script-generator.ts','engine/wpm-calculator.ts'];
const allowedSources=new Set([...runtimeFiles.map(name=>'seller/'+name),...sourceFiles.map(name=>'src/'+name)]);
const publicPackageFiles=['server.ts','seller/seller-hosted-handler.d.mts','package.json','package-lock.json','tsconfig.json','vercel.json','.vercelignore'];
const allowedManifestFiles=new Set([...allowedSources,...publicPackageFiles]);
const dependencies={'@modelcontextprotocol/sdk':'1.30.0','@stellar/stellar-sdk':'14.4.2',cors:'^2.8.5',dotenv:'^16.4.7',express:'^4.21.2'};
const defaultStage=resolve(repo,'../provider-guionista-recovered/hosted-seller-preview-candidate');
const workspace=resolve(repo,'..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const contained=(base,path)=>{const part=relative(base,path);return part!==''&&!part.startsWith('..')&&!isAbsolute(part);};
const json=async path=>JSON.parse(await readFile(path,'utf8'));

/** One owned package, public source files only. No TCP listener, credential
 * profile, Redis command, payment, provider execution or cloud action occurs.
 * Run: node --experimental-strip-types scripts/test-hosted-seller-provider-package.mjs [stage]
 */
export async function testHostedSellerProviderPackage(stagePath=defaultStage){
 const stage=resolve(stagePath);let checks=0;
 assert.ok(contained(workspace,stage),'Stage must be inside the owned workspace');
 // Windows sandboxing can forbid realpath while allowing lstat. Check every
 // directory component from the workspace and reject symlinks/junctions before
 // reading any public package file instead of relying on realpath.
 async function assertRegularPath(path,isDirectory=false){
  assert.ok(path===workspace||contained(workspace,path),'Path outside the owned workspace');
  const parts=[];let current=path;
  while(current!==workspace){parts.push(current);current=dirname(current);}
  parts.push(workspace);parts.reverse();
  for(let index=0;index<parts.length;index++){
   const info=await lstat(parts[index]);
   assert.ok(!info.isSymbolicLink(),'Source symlinks and junctions are forbidden');
   const directory=index<parts.length-1||isDirectory;
   assert.ok(directory?info.isDirectory():info.isFile(),'Source must be a regular file or directory');
  }
 }
 await assertRegularPath(stage,true);await assertRegularPath(join(stage,'source-manifest.json'));checks++;
 const manifest=await json(join(stage,'source-manifest.json'));
 assert.ok(['PREPARED_LOCAL','PREPARED_AND_COMPILED_LOCAL'].includes(manifest.status));assert.equal(manifest.credentialsCopied,false);assert.equal(manifest.payments,0);assert.equal(manifest.productionPublished,false);assert.equal(manifest.runtimeFiles,runtimeFiles.length);checks++;
 assert.ok(Array.isArray(manifest.files));assert.equal(manifest.files.length,allowedManifestFiles.size);
 assert.equal(new Set(manifest.files.map(value=>value.path)).size,allowedManifestFiles.size);checks++;
 assert.equal(manifest.sourceDigest,digest(JSON.stringify(manifest.files)),'Manifest aggregate hash');checks++;
 const sourceTexts=new Map();
 for(const entry of manifest.files){
  assert.ok(allowedManifestFiles.has(entry.path),'Unapproved source path in manifest');
  const path=resolve(stage,entry.path);assert.ok(contained(stage,path));
  await assertRegularPath(path);
  const bytes=await readFile(path);assert.equal(bytes.length,entry.bytes,entry.path+' size');assert.equal(digest(bytes),entry.sha256,entry.path+' hash');if(allowedSources.has(entry.path)||entry.path==='server.ts')sourceTexts.set(entry.path,bytes.toString('utf8'));
  if(entry.path.startsWith('seller/')&&runtimeFiles.includes(entry.path.slice(7)))assert.equal(digest(await readFile(join(repo,'examples',entry.path.slice(7)))),entry.sha256,entry.path+' must match the reviewed runtime');
  checks++;
 }
 // Inspect directory entries without reading an unexpected file or profile.
 async function inspectDirectory(directory,prefix){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const path=prefix+'/'+entry.name;
   assert.ok(!entry.isSymbolicLink(),'Source symlinks are forbidden');
   if(entry.isDirectory())await inspectDirectory(join(directory,entry.name),path);
   else assert.ok(allowedManifestFiles.has(path),'Unapproved file in runtime source directory');
  }
 }
 await inspectDirectory(join(stage,'seller'),'seller');await inspectDirectory(join(stage,'src'),'src');checks++;
 const pkg=await json(join(stage,'package.json'));
 assert.equal(pkg.name,'ai-video-scriptwriter');assert.equal(pkg.private,true);assert.equal(pkg.type,'module');assert.equal(pkg.engines?.node,'24.x');assert.deepEqual(pkg.scripts,{build:'tsc'});assert.deepEqual(pkg.dependencies,dependencies);checks++;
 const vercel=await json(join(stage,'vercel.json'));
 assert.deepEqual(vercel.crons,[{path:'/api/bazaar/seller/tick',schedule:'*/5 * * * *'}]);assert.equal(vercel.functions?.['server.ts']?.maxDuration,60);assert.equal(manifest.cron.path,vercel.crons[0].path);assert.equal(manifest.cron.schedule,vercel.crons[0].schedule);assert.equal(manifest.cron.previewAutomatic,false);checks++;
 const ignore=await readFile(join(stage,'.vercelignore'),'utf8');
 for(const rule of ['**/.env','**/.env.*','**/.vercel','**/.git','**/tests','**/fixtures','**/*.key','**/*.pem','**/*.dpapi','**/*secrets*.json','**/*credentials*.json'])assert.ok(ignore.split(/\r?\n/).includes(rule),'Missing deployment exclusion');checks++;
 const server=await readFile(join(stage,'server.ts'),'utf8');sourceTexts.set('server.ts',server);
 assert.ok(server.includes('export default app'));assert.ok(!/\b(?:listen|connect)\s*\(/.test(server));checks++;
 const packageNames=new Set(Object.keys(dependencies));
 for(const [name,source]of sourceTexts){
  assert.ok(!/\bimport\s*\(/.test(source),name+' has an arbitrary dynamic import');
  const imports=[...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
  for(const specifier of imports){
   assert.ok(!/(?:test|fixture|simulator|payment-fixture|guionista-marketplace-worker|buyer-cli|portable-secret)/i.test(specifier),name+' imports a test or execution harness');
   if(specifier.startsWith('.')){
    assert.ok(!/[?#]/.test(specifier));let target=resolve(dirname(join(stage,name)),specifier);
    if(target.endsWith('.js'))target=target.slice(0,-3)+'.ts';
    const local=relative(stage,target).replaceAll('\\','/');assert.ok(allowedSources.has(local),'Relative import outside reviewed runtime');
   }else if(specifier.startsWith('node:'))assert.ok(['node:crypto'].includes(specifier),'Unexpected runtime system capability');
   else {const packageName=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0];assert.ok(packageNames.has(packageName),'Undeclared runtime package');}
  }
 }checks++;

 // Native Node24 strips TypeScript. Only relative .js imports from this stage
 // are mapped to their .ts sources; dependency resolution remains unchanged.
 const hook=registerHooks({resolve(specifier,context,nextResolve){
  if(specifier.startsWith('.')&&specifier.endsWith('.js')&&context.parentURL?.startsWith('file:')){
   const parent=fileURLToPath(context.parentURL);
   if(contained(stage,parent)){
    const candidate=resolve(dirname(parent),specifier.slice(0,-3)+'.ts');
    if(contained(stage,candidate)&&existsSync(candidate))return nextResolve(pathToFileURL(candidate).href,context);
   }
  }
  return nextResolve(specifier,context);
 }});
 let attemptedExternalRequests=0;const previousFetch=globalThis.fetch;
 globalThis.fetch=async()=>{attemptedExternalRequests++;throw Error('TEST_EXTERNAL_TRANSPORT_DENIED');};
 // The test runs in its own process. All endpoint effects are disabled before
 // importing source, regardless of variables inherited from the caller.
 process.env.CRON_SECRET='c'.repeat(43);
 process.env.BAZAAR_HOSTED_SELLER_ENABLED='false';
 process.env.BAZAAR_MARKETPLACE_TEXT_ENABLED='false';
 process.env.VERCEL='1';process.env.VERCEL_URL='synthetic-provider.vercel.app';
 try{
  const {app}=await import(pathToFileURL(join(stage,'server.ts')).href);
  async function invoke(method,path,headers={}){
   return await new Promise((done,reject)=>{
    // A socket-shaped EventEmitter has no network handle or TCP connection.
    const connection=new EventEmitter();connection.remoteAddress='127.0.0.1';connection.encrypted=false;
    const req=new IncomingMessage(connection);req.method=method;req.url=path;req.headers=headers;req.httpVersion='1.1';
    const res=new ServerResponse(req),timer=setTimeout(()=>reject(Error('EXPRESS_ROUTE_TIMEOUT')),3000);
    res.end=body=>{clearTimeout(timer);try{done({status:res.statusCode,headers:res.getHeaders(),body:body?JSON.parse(String(body)):undefined});}catch(error){reject(error);}return res;};
    app.handle(req,res,error=>{clearTimeout(timer);reject(error??Error('EXPRESS_ROUTE_MISSING'));});
   });
  }
  const auth={authorization:'Bearer '+process.env.CRON_SECRET};
  assert.equal((await invoke('GET','/api/bazaar/seller/tick')).status,401);checks++;
  const disabled=await invoke('GET','/api/bazaar/seller/tick',auth);assert.equal(disabled.status,200);assert.equal(disabled.body.reason,'disabled');assert.equal(disabled.body.mcpRequests,0);assert.equal(disabled.body.providerRequests,0);assert.equal(disabled.body.executed,0);assert.equal(disabled.headers['cache-control'],'no-store');assert.ok(!JSON.stringify(disabled.body).includes(process.env.CRON_SECRET));checks++;
  assert.equal((await invoke('GET','/api/bazaar/seller/tick?arbitrary=input',auth)).status,400);checks++;
  assert.equal((await invoke('GET','/api/bazaar/seller/tick',{...auth,origin:'https://example.test'})).status,400);checks++;
  assert.equal((await invoke('HEAD','/api/bazaar/seller/tick',auth)).status,400);checks++;
  assert.equal((await invoke('GET','/health')).status,200);checks++;
  assert.equal((await invoke('POST','/v1/marketplace-text')).status,503);checks++;
  assert.equal((await invoke('POST','/api/bazaar/seller/tick')).status,404);checks++;
  assert.equal(attemptedExternalRequests,0);
 }finally{globalThis.fetch=previousFetch;hook.deregister();}
 return {status:'PASS',checks,expressRouterChecks:8,manifestEntries:manifest.files.length,sourceDigest:manifest.sourceDigest,reviewedRuntimeFiles:runtimeFiles.length,typescriptSourceLoaded:true,socketsOpened:0,externalRequests:attemptedExternalRequests,redisWrites:0,providerExecutions:0,payments:0,productionPublished:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length>3)throw Error('Use: test-hosted-seller-provider-package.mjs [stage]');
 console.log(JSON.stringify(await testHostedSellerProviderPackage(process.argv[2])));
}
