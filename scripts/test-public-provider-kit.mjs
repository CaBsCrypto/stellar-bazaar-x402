import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,readdir} from 'node:fs/promises';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {dirname,resolve,relative,isAbsolute,join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {buildProviderKit,PROVIDER_KIT_MODULES,PROVIDER_KIT_DEPENDENCIES,PROVIDER_KIT_NAME} from './build-public-provider-kit.mjs';
import {createRedisWorkspaceStore,setWorkspaceStoreForTests,READ_WORKSPACE_LUA,COMMIT_WORKSPACE_LUA,READ_MARKET_PERMISSION_LUA} from '../lib/workspace-store.ts';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected=[...PROVIDER_KIT_MODULES.map(name=>'examples/'+name),'README.md','adapter-template.mjs','configure.mjs','self-check.mjs','LICENSE','package.json','package-lock.json','native-text-service-card.example.json','configuration.example.json','definition.example.json','MANIFEST.json'].sort();
const cleanEnv={...process.env};for(const name of Object.keys(cleanEnv))if(/^(BAZAAR|STELLAR_X402|UPSTASH|KV_REST|VERCEL|X402)_/.test(name))delete cleanEnv[name];
const previous={...process.env},originalFetch=globalThis.fetch;let externalRequests=0;
globalThis.fetch=async()=>{externalRequests++;throw Error('PUBLIC_KIT_TEST_NETWORK_DENIED');};
const temporary=await mkdtemp(join(tmpdir(),'bazaar-public-provider-kit-')),kit=join(temporary,PROVIDER_KIT_NAME);
const within=(root,path)=>{const part=relative(root,path);return part!==''&&!part.startsWith('..')&&!isAbsolute(part);};
function unpack(archive){
 const tar=gunzipSync(archive,{maxOutputLength:2*1048576}),entries=new Map();let offset=0;
 while(offset+512<=tar.length){const header=tar.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;const name=header.subarray(0,100).toString('utf8').replace(/\0.*$/s,''),type=header.subarray(156,157).toString();
  assert.equal(type,'0');assert.ok(name.startsWith(PROVIDER_KIT_NAME+'/'));assert.ok(!name.includes('..')&&!name.includes('\\'));
  const path=name.slice(PROVIDER_KIT_NAME.length+1);assert.ok(expected.includes(path));assert.ok(!entries.has(path));
  assert.equal(parseInt(header.subarray(100,108).toString(),8),0o644);assert.equal(parseInt(header.subarray(136,148).toString(),8),0);
  const checksum=parseInt(header.subarray(148,156).toString(),8),copy=Buffer.from(header);copy.fill(32,148,156);assert.equal(checksum,[...copy].reduce((sum,value)=>sum+value,0));
  const size=parseInt(header.subarray(124,136).toString(),8);assert.ok(Number.isSafeInteger(size)&&size>=0&&offset+512+size<=tar.length);entries.set(path,Buffer.from(tar.subarray(offset+512,offset+512+size)));offset+=512+Math.ceil(size/512)*512;
 }
 assert.deepEqual([...entries.keys()].sort(),expected);return entries;
}
try{
 const build=await buildProviderKit({write:false}),archive=await readFile(resolve(repo,'public/downloads/'+PROVIDER_KIT_NAME+'.tgz'));
 const publicManifest=JSON.parse(await readFile(resolve(repo,'public/downloads/'+PROVIDER_KIT_NAME+'.manifest.json'),'utf8'));
 assert.deepEqual(archive,build.archive,'Archive reproduces exactly from the explicit source allowlist');assert.equal(sha(archive),publicManifest.sha256);assert.equal(archive.length,publicManifest.bytes);
 const entries=unpack(archive),manifest=JSON.parse(entries.get('MANIFEST.json'));
 for(const entry of publicManifest.files){assert.equal(entries.get(entry.path).length,entry.bytes);assert.equal(sha(entries.get(entry.path)),entry.sha256);}
 assert.equal(manifest.credentialsIncluded,false);assert.equal(manifest.adapterReadyByDefault,false);
 const pkg=JSON.parse(entries.get('package.json')),lock=JSON.parse(entries.get('package-lock.json'));
 assert.deepEqual(pkg.dependencies,PROVIDER_KIT_DEPENDENCIES);assert.equal(pkg.engines.node,'24.x');assert.deepEqual(lock.packages[''].dependencies,pkg.dependencies);assert.equal(Object.keys(lock.packages).length-1,publicManifest.lockedDependencyPackages);
 for(const [path,record]of Object.entries(lock.packages)){if(!path)continue;assert.ok(record.resolved.startsWith('https://registry.npmjs.org/'));assert.ok(record.integrity.startsWith('sha'));assert.ok(!record.dev);assert.ok(!/(?:next|aws-sdk|upstash|x402|freighter|react|three)/.test(path));}
 const packageName=specifier=>specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0];
 const customImports=new Map([['examples/marketplace-seller-mcp.mjs','config.providerFetchModule'],['examples/seller-marketplace-supervisor.mjs','config.providerFetchModule'],['examples/seller-runtime.mjs','adapterPath'],['self-check.mjs','entry.path']]);
 let relativeImports=0;
 for(const [path,bytes]of entries){
  const source=bytes.toString('utf8');assert.ok(!/\bS[A-Z2-7]{55}\b/.test(source),'No Stellar secret seed in '+path);assert.ok(!/(?:\.vercel\/|r2-validation-secrets|hosted-seller-redis-validation|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/.test(source),'No private profile material');
  if(!path.endsWith('.mjs'))continue;
  const imports=[...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)];
  for(const [,specifier]of imports){if(specifier.startsWith('.')){const target=relative(kit,resolve(kit,dirname(path),specifier)).replaceAll('\\','/');assert.ok(entries.has(target),path+' missing '+specifier);assert.ok(!target.startsWith('../'));relativeImports++;}else if(!specifier.startsWith('node:'))assert.ok(Object.hasOwn(pkg.dependencies,packageName(specifier)),path+' undeclared package');}
  const custom=[...source.matchAll(/\bimport\((?!\s*['"])([^\n]+)\)/g)];if(custom.length){assert.ok(customImports.has(path),'Unexpected dynamic import');assert.ok(source.includes(customImports.get(path)));}
 }
 for(const name of ['configuration.example.json','definition.example.json','native-text-service-card.example.json']){const text=entries.get(name).toString();assert.ok(!/"(?:agentAccess|providerAccess|password|privateKey|secret|seed)"/.test(text));}
 await mkdir(kit);for(const [path,bytes]of entries){const target=resolve(kit,path);assert.ok(within(kit,target));await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
 const npmCli=resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),emptyConfig=join(temporary,'user-npmrc'),emptyGlobal=join(temporary,'global-npmrc');await writeFile(emptyConfig,'');await writeFile(emptyGlobal,'');
 const onlineInstall=process.argv.includes('--online-install'),npmEnvironment=Object.fromEntries(Object.entries(cleanEnv).filter(([name])=>/^(?:PATH|Path|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|ProgramFiles|ProgramFiles\(x86\))$/.test(name)));
 const installed=spawnSync(process.execPath,[npmCli,'ci',...(onlineInstall?['--registry=https://registry.npmjs.org/','--cache='+join(temporary,'npm-cache')]:['--offline']),'--ignore-scripts','--no-audit','--no-fund','--fetch-retries=0','--fetch-timeout=20000','--logs-max=0','--loglevel=error','--userconfig='+emptyConfig,'--globalconfig='+emptyGlobal],{cwd:kit,env:npmEnvironment,encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
 assert.equal(installed.status,0,'npm ci must validate the real pinned lock: '+installed.stderr);assert.ok(!installed.error);
 const checked=spawnSync(process.execPath,['self-check.mjs'],{cwd:kit,env:cleanEnv,encoding:'utf8',timeout:15000});assert.equal(checked.status,0,checked.stderr);const checkReport=JSON.parse(checked.stdout.trim().split('\n').at(-1));assert.equal(checkReport.status,'PASS');
 const cardPath=join(kit,'card.json'),cardBuilt=spawnSync(process.execPath,['examples/marketplace-seller-mcp.mjs','card','definition.example.json','card.json'],{cwd:kit,env:cleanEnv,encoding:'utf8',timeout:15000});assert.equal(cardBuilt.status,0,cardBuilt.stderr);
 const ownerId='ow_'+'a'.repeat(32),agentId='agent_'+'a'.repeat(32),configured=spawnSync(process.execPath,['configure.mjs',cardPath,ownerId,agentId,'configuration.json'],{cwd:kit,env:cleanEnv,encoding:'utf8',timeout:15000});assert.equal(configured.status,0,configured.stderr);assert.equal(JSON.parse(configured.stdout).secretsWritten,false);
 const password=randomBytes(24).toString('base64url'),agentAccess=randomBytes(32).toString('base64url'),providerAccess=randomBytes(32).toString('base64url'),stateDirectory=join(temporary,'synthetic-encrypted-store');
 const setup=spawnSync(process.execPath,['examples/marketplace-seller-mcp.mjs','setup',stateDirectory,'configuration.json','--secret-stdin'],{cwd:kit,env:cleanEnv,input:JSON.stringify({password,agentAccess,providerAccess}),encoding:'utf8',timeout:15000});assert.equal(setup.status,0,setup.stderr);
 for(const name of await readdir(stateDirectory)){const raw=await readFile(join(stateDirectory,name),'utf8');for(const secret of [password,agentAccess,providerAccess])assert.ok(!raw.includes(secret));}
 for(const name of Object.keys(process.env))if(/^(BAZAAR|STELLAR_X402|UPSTASH|KV_REST|VERCEL|X402)_/.test(name))delete process.env[name];
 const prefix='bazaar-workspace:pilot-'+randomBytes(16).toString('hex'),data=new Map();Object.assign(process.env,{BAZAAR_PUBLIC_DEMO:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_PREFIX:prefix,BAZAAR_WORKSPACE_ADMISSION:'open',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://bazaar.browns.studio'});
 const redis={async eval(script,keys,args){if(script===READ_WORKSPACE_LUA||script===READ_MARKET_PERMISSION_LUA)return keys.map(key=>data.get(key)??'');assert.equal(script,COMMIT_WORKSPACE_LUA);if(keys.some((key,i)=>(data.get(key)??'')!==args[i]))return 0;data.set(keys[0],args[3]);if(args[4])data.set(keys[1],args[4]);data.set(keys[2],'workspace-v1');return 1;}};
 const store=createRedisWorkspaceStore(redis,prefix,()=>({ownerIds:[],hashes:[]}));setWorkspaceStoreForTests(store);const created=await store.createWorkspace({creationId:randomUUID(),humanAccessHash:sha(randomBytes(32)),agentAccessHash:sha(agentAccess)},sha(randomBytes(32)));
 registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!extname(specifier))return next(specifier+'.ts',context);throw error;}}});
 const {createOnboardingMcpServer}=await import('../lib/mcp-onboarding-server.ts'),{withSellerMcp}=await import(pathToFileURL(join(kit,'examples/seller-mcp-transport.mjs')).href),{sellerTool}=await import(pathToFileURL(join(kit,'examples/seller-marketplace-worker.mjs')).href);
 let mcpRequests=0;const native=await withSellerMcp({agentAccess,maxRequests:10,fetcher:async(url,init)=>{mcpRequests++;const request=new Request(url,init);assert.equal(new URL(request.url).pathname,'/api/mcp');assert.equal(request.headers.get('authorization'),'Bearer '+agentAccess);if(request.method==='GET')return new Response(null,{status:405});const server=createOnboardingMcpServer(undefined,undefined,undefined,request),transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);try{return await transport.handleRequest(request);}finally{await server.close();}}},transport=>sellerTool(transport,'get_bazaar_identity'));
 assert.equal(native.ownerId,created.record.ownerId);assert.equal(native.agentId,created.record.agentId);assert.equal(native.network,'stellar:testnet');assert.equal(native.wallet,null);assert.equal(externalRequests,0);
 const report={status:'PASS',archive:publicManifest.archive,sha256:publicManifest.sha256,bytes:publicManifest.bytes,archiveEntries:entries.size,lockedDependencyPackages:publicManifest.lockedDependencyPackages,relativeImports,deterministicRebuild:true,cleanNpmCi:true,offlineNpmCi:!onlineInstall,dependencyRegistry:onlineInstall?'https://registry.npmjs.org/':null,npmLifecycleScriptsExecuted:false,npmAuditRequests:false,npmPrivateConfigurationRead:false,allPackagedModulesImported:true,publicCardCli:true,configurationCli:true,encryptedSetupSyntheticOnly:true,encryptedSetupNoPlaintext:true,nativeAccountMcpBootstrap:true,mcpRequests,bazaarProviderExternalRequests:0,payments:0,cloudChanges:0,hostedAcceptance:false};
 await writeFile(resolve(repo,'docs/evidence/public-provider-kit-local-2026-10-11.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{
 setWorkspaceStoreForTests(undefined);globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
 assert.ok(within(resolve(tmpdir()),temporary)&&temporary.startsWith(join(resolve(tmpdir()),'bazaar-public-provider-kit-')),'Verify exact isolated temporary deletion target');await rm(temporary,{recursive:true,force:true});
}
