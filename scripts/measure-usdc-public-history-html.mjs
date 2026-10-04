import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {request} from 'node:http';
import {readFile,writeFile,readdir,stat,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,dirname,basename,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const sourceSha='a741937b6d389edbd333ff51bac95b68e654d40e',root=process.cwd();
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
async function files(path){const out=[];for(const entry of await readdir(path,{withFileTypes:true})){const full=join(path,entry.name);if(entry.isDirectory())out.push(...await files(full));else if(entry.isFile())out.push(full);}return out.sort();}
async function inventory(path){const rows=[];for(const file of await files(path)){const value=await readFile(file);rows.push({path:relative(root,file).replaceAll('\\','/'),bytes:value.length,sha256:hash(value)});}return {files:rows,fileCount:rows.length,totalBytes:rows.reduce((sum,value)=>sum+value.bytes,0),inventorySha256:hash(JSON.stringify(rows))};}
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),sourceSha);
assert.equal(execFileSync('git',['diff','--name-only','HEAD','--','app','lib','components','proxy.ts','package.json','package-lock.json'],{encoding:'utf8',windowsHide:true}).trim(),'','APPLICATION_SOURCE_CHANGED');
const manifest=await json('docs/evidence/sprint-marketplace/usdc-sale-manifest.json');assert.equal(manifest.sourceSha,sourceSha);
const buildId=(await readFile('.next/BUILD_ID','utf8')).trim();assert.equal(buildId,manifest.preflight.buildId);
const staticAssets=await inventory('.next/static'),publicAssets=await inventory('public');
assert.equal(staticAssets.fileCount,108);assert.equal(staticAssets.totalBytes,2033076);
const faviconFiles=publicAssets.files.filter(value=>/(^|\/)favicon[^/]*$/i.test(value.path));
for(const file of await files('app'))if(/(^|[\\/])(favicon|icon|apple-icon)\.[^.]+$/i.test(file)){const contents=await readFile(file);faviconFiles.push({path:relative(root,file).replaceAll('\\','/'),bytes:contents.length,sha256:hash(contents)});}
const notFound=await readFile('.next/server/app/_not-found.html');
const temporary=await mkdtemp(join(tmpdir(),'bazaar-usdc-public-html-'));let child;
try{
 const adapter=join(temporary,'offline-guard.mjs'),serverPath=join(temporary,'server.mjs');
 await writeFile(adapter,`import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';import dns from 'node:dns';import dnsPromises from 'node:dns/promises';import{syncBuiltinESMExports}from'node:module';
globalThis.__publicHtmlStats={blockedOutboundAttempts:0,dotenvReadsPrevented:0,incomingRequests:0};
const block=()=>{globalThis.__publicHtmlStats.blockedOutboundAttempts++;throw Error('OUTBOUND_NETWORK_DISABLED');};
globalThis.fetch=block;http.request=block;http.get=block;https.request=block;https.get=block;net.connect=block;net.createConnection=block;net.Socket.prototype.connect=block;tls.connect=block;
const originalLookup=dns.lookup;dns.lookup=(hostname,...args)=>hostname==='127.0.0.1'?originalLookup(hostname,...args):block();dnsPromises.lookup=block;for(const key of Object.keys(dns))if(key.startsWith('resolve'))dns[key]=block;for(const key of Object.keys(dnsPromises))if(key.startsWith('resolve'))dnsPromises[key]=block;
const envNames=new Set(['.env','.env.local','.env.production','.env.production.local']);for(const key of ['statSync','readFileSync']){const original=fs[key];fs[key]=(file,...args)=>{if(typeof file==='string'&&envNames.has(path.basename(file))){globalThis.__publicHtmlStats.dotenvReadsPrevented++;throw Object.assign(Error('ENV_FILE_DISABLED'),{code:'ENOENT'});}return original(file,...args);};}syncBuiltinESMExports();
`);
 await writeFile(serverPath,`import next from ${JSON.stringify(pathToFileURL(resolve('node_modules/next/dist/server/next.js')).href)};import{createServer}from'node:http';const app=next({dev:false,dir:${JSON.stringify(root)},hostname:'127.0.0.1'});await app.prepare();const handle=app.getRequestHandler();const server=createServer((req,res)=>{globalThis.__publicHtmlStats.incomingRequests++;if(req.method!=='GET'||req.url!=='/history'||globalThis.__publicHtmlStats.incomingRequests!==1){res.writeHead(404);res.end();return;}res.once('finish',()=>console.log(JSON.stringify({event:'PUBLIC_HTML_FINISHED',...globalThis.__publicHtmlStats})));void handle(req,res);});server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({event:'PUBLIC_HTML_READY',port:server.address().port})));`);
 const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','COMSPEC','PATHEXT'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
 for(const directory of ['app','lib','components'])for(const file of await files(directory))if(/\.(ts|tsx|js|mjs)$/.test(file)){
  const source=await readFile(file,'utf8');for(const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g))if(!['NODE_ENV','VERCEL','VERCEL_ENV','VERCEL_URL'].includes(match[1]))env[match[1]]='';
 }
 for(const key of Object.keys(env))if(/^(BAZAAR_ENABLE_|BAZAAR_ACCEPTANCE_(METER|SALE)$|X402_.*(?:ENABLED|ENABLE_)|NEXT_PUBLIC_(BAZAAR_MARKETPLACE|X402_XLM_PILOT)$)/.test(key))env[key]='false';
 Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:'--import='+pathToFileURL(adapter).href,BAZAAR_ENABLE_OPEN_WORKSPACES:'false',BAZAAR_ENABLE_MARKETPLACE:'false',BAZAAR_ENABLE_MARKET_PURCHASES:'false',BAZAAR_WORKSPACE_CREATION_PAUSED:'true',BAZAAR_WORKSPACE_ADMISSION:'invite-only',BAZAAR_WORKSPACE_BACKEND:'',BAZAAR_PROVIDER_REVIEW_BACKEND:'',UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:'',KV_REST_API_URL:'',KV_REST_API_TOKEN:'',X402_ENABLE_LOCAL_PAYER:'false',X402_PILOT_PAYMENTS_ENABLED:'false',X402_LEGACY_PAYMENTS_ENABLED:'false'});
 let port,stats,logTail='',stderrBytes=0;child=spawn(process.execPath,[serverPath],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>{logTail+=chunk;const lines=logTail.split('\n');logTail=lines.pop();for(const line of lines)try{const value=JSON.parse(line);if(value.event==='PUBLIC_HTML_READY')port=value.port;if(value.event==='PUBLIC_HTML_FINISHED')stats=value;}catch{}});child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;});
 const deadline=Date.now()+20000;while(!port){assert.ok(child.exitCode===null&&child.signalCode===null&&Date.now()<deadline,'NATIVE_NEXT_NOT_READY');await new Promise(done=>setTimeout(done,50));}
 const result=await new Promise((done,reject)=>{
  const call=request({hostname:'127.0.0.1',port,path:'/history',method:'GET',headers:{accept:'text/html','accept-encoding':'identity',connection:'close'}},response=>{
   if(response.statusCode>=300&&response.statusCode<400){response.destroy();reject(Error('REDIRECT_NOT_ALLOWED'));return;}
   const chunks=[];let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576){response.destroy();reject(Error('PUBLIC_HTML_OVER_1MIB'));}else chunks.push(chunk);});response.on('error',reject);response.on('end',()=>done({status:response.statusCode,body:Buffer.concat(chunks),headerBytes:response.rawHeaders.reduce((sum,value)=>sum+Buffer.byteLength(value),0)+response.rawHeaders.length/2*4}));
  });call.on('error',reject);call.setTimeout(12000,()=>call.destroy(Error('PUBLIC_HTML_TIMEOUT')));call.end();
 });
 assert.equal(result.status,200);assert.ok(result.body.toString('utf8').includes('Comprobando acceso'),'PUBLIC_CHECKING_HTML_REQUIRED');
 const endDeadline=Date.now()+1000;while(!stats&&Date.now()<endDeadline)await new Promise(done=>setTimeout(done,20));
 assert.ok(stats,'NATIVE_REQUEST_STATS_REQUIRED');assert.equal(stats.incomingRequests,1);assert.equal(stats.blockedOutboundAttempts,0);
 const htmlPerNavigation=Math.max(result.body.length*8,65536);
 const projections={navigations:4,privateApiResponses:20,privateApiResponseCap:1048576,privateApiInboundUpperBound:20*1048576,staticSets:4,staticBodyInboundUpperBound:4*staticAssets.totalBytes,htmlMultiplier:8,htmlPerNavigationUpperBound:htmlPerNavigation,htmlInboundUpperBound:4*htmlPerNavigation,faviconBodyFiles:faviconFiles.length,faviconBodyBytes:faviconFiles.reduce((sum,value)=>sum+value.bytes,0),notFoundLocalArtifactBytes:notFound.length,notFoundArtifactSha256:hash(notFound)};
 projections.htmlStaticAndApiBodyUpperBound=projections.privateApiInboundUpperBound+projections.staticBodyInboundUpperBound+projections.htmlInboundUpperBound;
 const report={version:1,status:'PASS_LOCAL_PUBLIC_HTML_MEASUREMENT',sourceSha,buildId,runtime:process.version,measuredAt:new Date().toISOString(),nativeNext:true,method:'GET',path:'/history',requests:1,statusCode:result.status,bodyBytes:result.body.length,bodySha256:hash(result.body),responseHeaderBytes:result.headerBytes,acceptEncoding:'identity',checkingMarkup:true,flags:{openWorkspaces:false,marketplace:false,purchases:false,backendsDisabled:true,privateEnvironmentBlank:true},externalRequests:0,redisRequests:0,walletSeeds:0,secretReads:0,dpapiReads:0,browserRequests:0,automaticRetries:0,blockedOutboundAttempts:stats.blockedOutboundAttempts,dotenvReadsPrevented:stats.dotenvReadsPrevented,stderrBytes,staticAssets,publicAssets,faviconFiles,projections,completeHostedBrowserTraffic:false,limitations:['Local public HTML and asset inventory; not a hosted wire capture','Runtime marketEnabled:false differs from hosted true only in checking-state Flight props; 8x HTML margin is a proposed bound','Four asset sets are uncompressed file bodies; HTTP/platform headers and redirects require separate budget','No favicon asset exists; automatic favicon 404 must be accounted separately if requested','No bodies, requests or private tokens from an authenticated browser are measured']};
 await writeFile('docs/evidence/sprint-marketplace/usdc-public-history-html-local.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,staticAssets:{fileCount:staticAssets.fileCount,totalBytes:staticAssets.totalBytes,inventorySha256:staticAssets.inventorySha256},publicAssets:{fileCount:publicAssets.fileCount,totalBytes:publicAssets.totalBytes,inventorySha256:publicAssets.inventorySha256},faviconFiles:undefined}));
}finally{
 const running=child;child=undefined;if(running&&running.exitCode===null&&running.signalCode===null){running.kill();await new Promise(done=>running.once('exit',done));}
 assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert.ok(basename(temporary).startsWith('bazaar-usdc-public-html-'));await rm(temporary,{recursive:true,force:true});
}
