// Public offline package only. No environment reads, credentials, cloud client or installation.
import {readFile,writeFile,mkdir,lstat,readdir} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const RECOVERY_PROVIDER_SOURCE='.vercel/recovery-example-provider-v5-source';
export const RECOVERY_PROVIDER_MANIFEST='docs/evidence/recovery-example-provider-v5-source-2026-10-13.json';
const BASE_MANIFEST='docs/evidence/continuous-on-demand-provider-preview-source-2026-10-11.json';
const BASE_MANIFEST_SHA='c49d70ba78636b0ca9dc65c3247bab76f65a599460b03ab2a398003caa561bf5';
const BASE_DIGEST='9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function contained(root,path){const rel=relative(root,path);if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('OWNED_PUBLIC_SOURCE_REQUIRED');return path;}
async function plainRead(root,path){contained(root,path);let at=root;for(const part of relative(root,path).split(sep)){at=resolve(at,part);if((await lstat(at)).isSymbolicLink())throw Error('PLAIN_PUBLIC_SOURCE_REQUIRED');}if(!(await lstat(path)).isFile())throw Error('PUBLIC_FILE_REQUIRED');return readFile(path);}
const declaration=Buffer.from('export function createRecoveryExampleTickHandler(environment?:Readonly<Record<string,string|undefined>>): (request:Request)=>Promise<Response>;\nexport function createRecoveryExampleRuntimeHandler(environment?:Readonly<Record<string,string|undefined>>): (request:Request)=>Promise<Response>;\n');
export const RECOVERY_PROVIDER_SERVER=`import express from 'express';
import {Readable} from 'node:stream';
import {createRecoveryExampleTickHandler,createRecoveryExampleRuntimeHandler} from './seller/recovery-example-hosted-provider.mjs';
export const app=express();
app.disable('x-powered-by');
const worker=createRecoveryExampleTickHandler();
const runtime=createRecoveryExampleRuntimeHandler();
app.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');next();});
// These routes precede all parsers. The private handlers bound bytes and time,
// and only the fixed isolated service can run. There is no cron or signer.
function bridge(handler:(request:Request)=>Promise<Response>){
 return async(req:express.Request,res:express.Response)=>{
  try{
   const host=process.env.VERCEL_URL||'localhost';
   const headers=new Headers();for(const [name,value]of Object.entries(req.headers)){if(Array.isArray(value))for(const item of value)headers.append(name,item);else if(value!==undefined)headers.set(name,value);}
   const init:RequestInit&{duplex?:'half'}={method:req.method,headers};
   if(req.method==='POST'){init.body=Readable.toWeb(req) as ReadableStream<Uint8Array>;init.duplex='half';}
   const result=await handler(new Request('https://'+host+req.originalUrl,init));
   res.status(result.status);result.headers.forEach((value,name)=>res.setHeader(name,value));res.send(await result.text());
  }catch{res.status(503).json({error:'EXAMPLE_UNAVAILABLE',paymentSubmissions:0});}
 };
}
app.all('/api/bazaar/example/tick',bridge(worker));
app.all('/v1/bazaar-recovery-example',bridge(runtime));
app.all('/v1/bazaar-recovery-example/availability',bridge(runtime));
app.get('/.well-known/stellar-bazaar-provider.txt',(req,res)=>{
 if(req.method!=='GET'||req.originalUrl!=='/.well-known/stellar-bazaar-provider.txt'){res.status(400).end();return;}
 const proof=process.env.BAZAAR_EXAMPLE_CONTROL_RECORD;
 if(!/^stellar-bazaar-verification=[A-Za-z0-9_-]{24}$/.test(proof??'')){res.status(404).end();return;}
 res.type('text/plain').status(200).send(proof);
});
app.get('/health',(req,res)=>{
 if(req.method!=='GET'||req.originalUrl!=='/health'){res.status(400).json({error:'INVALID_REQUEST'});return;}
 res.status(200).json({status:'ok',service:'bazaar-recovery-example-text-v1',mode:'on-demand',contentType:'text/plain',paymentSubmissions:0});
});
app.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
export default app;
`;
async function plan(root){
 root=resolve(root);const baseBytes=await plainRead(root,resolve(root,BASE_MANIFEST));
 if(sha(baseBytes)!==BASE_MANIFEST_SHA)throw Error('EXACT_PROVIDER_BASE_MANIFEST_REQUIRED');
 const base=JSON.parse(baseBytes);if(base.sourceDigest!==BASE_DIGEST||base.files.length!==22||base.cronSchedules.length!==0)throw Error('EXACT_PROVIDER_BASE_REQUIRED');
 const buffers=new Map(),baseVerified=[];
 for(const row of base.files){
  const bytes=await plainRead(root,resolve(root,base.sourceDirectory,row.path));
  if(bytes.length!==row.bytes||sha(bytes)!==row.sha256)throw Error('EXACT_PROVIDER_BASE_REQUIRED');baseVerified.push(row.path);
  if(['package.json','package-lock.json','.vercelignore','tsconfig.json','vercel.json'].includes(row.path)||row.path.startsWith('seller/'))buffers.set(row.path,bytes);
 }
 for(const path of ['recovery-example-text-service.mjs','recovery-example-hosted-provider.mjs','seller-runtime.mjs','recovery-example-provider-io.mjs','seller-mcp-transport.mjs'])buffers.set('seller/'+path,await plainRead(root,resolve(root,'examples',path)));
 buffers.set('seller/recovery-example-hosted-provider.d.mts',declaration);
 buffers.set('server.ts',Buffer.from(RECOVERY_PROVIDER_SERVER));
 const config=JSON.parse(buffers.get('vercel.json'));if(JSON.stringify(config)!==JSON.stringify({version:2,regions:['iad1'],crons:[],functions:{'server.ts':{maxDuration:60}}}))throw Error('EXACT_UNSCHEDULED_CONFIGURATION_REQUIRED');
 const files=[...buffers].map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes)})).sort((a,b)=>a.path.localeCompare(b.path));
 const sourceDigest=sha(JSON.stringify(files));
 return {buffers,manifest:{version:1,status:'FROZEN_RECOVERY_EXAMPLE_PROVIDER_PREPARED_NOT_DEPLOYED',environment:'preview',sourceDirectory:RECOVERY_PROVIDER_SOURCE,sourceDigest,candidate:'recovery-example-provider-'+sourceDigest.slice(0,16),files,
  base:{manifest:BASE_MANIFEST,manifestSha256:BASE_MANIFEST_SHA,sourceDigest:BASE_DIGEST,verifiedFiles:baseVerified.length},
  serviceId:'bazaar-recovery-example-text-v1',runtimeRoute:'/v1/bazaar-recovery-example',workerRoute:'/api/bazaar/example/tick',executionMode:'on-demand',cronSchedules:[],mcpTransport:{serialization:'per-connection HTTP FIFO',privateFlag:'BAZAAR_EXAMPLE_PROVIDER_IO_PROFILE=example-bounded-provider-v1',onlyBoundedExampleAutoOptIn:true,retainsSseGet:true,requestsSkipped:0,retriesAdded:0,stopsOnAbort:true},
  requiredEnvironment:['BAZAAR_HOSTED_SELLER_ENABLED','BAZAAR_SELLER_EXECUTION_MODE','BAZAAR_HOSTED_SELLER_CONFIG','BAZAAR_HOSTED_SELLER_PREFIX','BAZAAR_HOSTED_SELLER_BINDING_HASH','BAZAAR_HOSTED_SELLER_KEY','BAZAAR_HOSTED_SELLER_REDIS_REST_URL','BAZAAR_HOSTED_SELLER_REDIS_REST_TOKEN','BAZAAR_EXAMPLE_RUNTIME_PREFIX','CRON_SECRET'],
  optionalEnvironment:['BAZAAR_HOSTED_SELLER_MCP_PROTECTION','BAZAAR_HOSTED_SELLER_PROVIDER_PROTECTION','BAZAAR_EXAMPLE_CONTROL_RECORD','BAZAAR_EXAMPLE_PROVIDER_IO_PROFILE'],
  runtimeBindingDerivation:{algorithm:'sha256',canonicalProjection:{role:'recovery-example-runtime/v1',workerBinding:'BAZAAR_HOSTED_SELLER_BINDING_HASH'}},
  initializedLedgersRequired:['worker prefix + worker binding + :storage:v1','runtime prefix + derived runtime binding + :storage:v1'],
  runtimeJournal:{mapping:'runtime.{operationId} -> seller.{operationId}',namespace:'isolated runtime prefix',expiry:'copied from paid worker journal; fixed seven-day content expiry',technicalGuards:'no TTL; no retained text/input in guard'},
  endpointControlProof:'GET /.well-known/stellar-bazaar-provider.txt; exact public challenge only',
  unchangedProductionProvider:true,unchangedProductionLimits:true,credentialsCopied:false,privateFilesRead:false,networkRequests:0,deployments:0,productionPublished:false,cronActivated:false,payments:0,
  limitations:['Only a protected isolated Preview may use this package before review.','Both Redis storage ledgers must be initialized once in new namespaces.','Local paid-state dependencies validate recovery but do not prove a blockchain payment.']}};
}
export async function prepareRecoveryExampleProvider(root=process.cwd()){
 root=resolve(root);const {buffers,manifest}=await plan(root),source=resolve(root,RECOVERY_PROVIDER_SOURCE),output=resolve(root,RECOVERY_PROVIDER_MANIFEST);
 for(const path of [source,output])try{await lstat(path);throw Error('NEW_SOURCE_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}
 await mkdir(source);for(const row of manifest.files){const target=contained(source,resolve(source,row.path));await mkdir(dirname(target),{recursive:true});await writeFile(target,buffers.get(row.path),{flag:'wx'});}
 await mkdir(dirname(output),{recursive:true});const bytes=Buffer.from(JSON.stringify({...manifest,preparedAt:new Date().toISOString()},null,2)+'\n');await writeFile(output,bytes,{flag:'wx'});
 return {...manifest,files:manifest.files.length,manifest:RECOVERY_PROVIDER_MANIFEST,manifestSha256:sha(bytes)};
}
export async function verifyRecoveryExampleProvider(root=process.cwd()){
 root=resolve(root);const raw=await plainRead(root,resolve(root,RECOVERY_PROVIDER_MANIFEST)),actual=JSON.parse(raw),expected=(await plan(root)).manifest;
 for(const [key,value]of Object.entries(expected))if(JSON.stringify(actual[key])!==JSON.stringify(value))throw Error('FROZEN_MANIFEST_CHANGED');
 const source=resolve(root,RECOVERY_PROVIDER_SOURCE),paths=new Set(actual.files.map(row=>row.path));
 async function walk(directory,prefix=''){for(const row of await readdir(directory,{withFileTypes:true})){const path=prefix+row.name;if(row.isSymbolicLink())throw Error('PLAIN_SOURCE_REQUIRED');if(row.isDirectory())await walk(resolve(directory,row.name),path+'/');else if(!row.isFile()||!paths.delete(path))throw Error('UNMANIFESTED_SOURCE');}}
 await walk(source);if(paths.size)throw Error('SOURCE_MISSING');
 for(const row of actual.files){const bytes=await plainRead(root,resolve(source,row.path));if(bytes.length!==row.bytes||sha(bytes)!==row.sha256)throw Error('FROZEN_SOURCE_CHANGED');}
 return {...expected,status:'FROZEN_RECOVERY_EXAMPLE_PROVIDER_VERIFIED',files:actual.files.length,manifest:RECOVERY_PROVIDER_MANIFEST,manifestSha256:sha(raw)};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length!==3||!['prepare','verify'].includes(process.argv[2]))throw Error('OFFLINE_PREPARE_OR_VERIFY_REQUIRED');
 console.log(JSON.stringify(await(process.argv[2]==='prepare'?prepareRecoveryExampleProvider():verifyRecoveryExampleProvider())));
}
