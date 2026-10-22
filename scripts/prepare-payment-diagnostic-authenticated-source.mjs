// Freeze only the locally reviewed, authenticated operator diagnostic correction.
import {lstat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';
import {readPlainOnDemandSource} from './prepare-on-demand-v2-sources.mjs';
const root=process.cwd(),sha=b=>createHash('sha256').update(b).digest('hex');
const basePath='docs/evidence/payment-diagnostic-proxy-bazaar-production-source-2026-10-12.json',baseSha='296e9c6a48cbcaba4b3ab17fb795b6a1252436966e574009a73f7ba0098bd169';
const pins={'lib/market-operator-diagnostic-origin.ts':'4b7d170f6bf1392f0e0897d22658679255bb99429064830f719731bfff37293e','lib/marketplace-http.ts':'77374bc445ad4771aaf4dcf4f2b6de86ea2e7522e7d1ae52107363130fa359d5','lib/operational-route-gate.ts':'6b25796e2a9650d1a589ebd7a455aa0d0d5bb29b790066e34cc779f6b2f4f205'};
const paths=Object.keys(pins),directory='.vercel/payment-diagnostic-authenticated-bazaar-production-source',manifestPath='docs/evidence/payment-diagnostic-authenticated-bazaar-production-source-2026-10-12.json';
try{
 if(process.argv.length!==2)throw Error('OFFLINE_SOURCE_HAS_NO_PRIVATE_ARGUMENTS');
 const raw=await readPlainOnDemandSource(root,basePath);if(sha(raw)!==baseSha)throw Error('PREVIOUS_PROXY_SOURCE_CHANGED');
 const base=JSON.parse(raw),buffers=new Map();
 if(base.status!=='FROZEN_LOCAL_PAYMENT_DIAGNOSTIC_PROXY_NOT_DEPLOYED'||base.sourceDigest!=='842030bdaa7395668595c450fc3194adbbc403e46da81b0907acd69fc74d688e'||base.sourceDirectory!=='.vercel/payment-diagnostic-proxy-bazaar-production-source'||base.files.length!==344||sourceDigest(base.files)!==base.sourceDigest)throw Error('EXACT_PROXY_SOURCE_REQUIRED');
 for(const f of base.files){if(!safeSourcePath(f.path)||buffers.has(f.path))throw Error('PLAIN_REVIEWED_SOURCE_REQUIRED');const b=await readPlainOnDemandSource(root,base.sourceDirectory+'/'+f.path);if(b.length!==f.bytes||sha(b)!==f.sha256)throw Error('PREVIOUS_PROXY_BYTES_CHANGED');buffers.set(f.path,b);}
 for(const path of paths){if(!safeSourcePath(path)||!buffers.has(path))throw Error('PLAIN_AUTHENTICATED_CORRECTION_REQUIRED');const next=await readPlainOnDemandSource(root,path);if(sha(next)!==pins[path]||buffers.get(path).equals(next))throw Error('EXACT_REVIEWED_AUTHENTICATED_CORRECTION_REQUIRED');buffers.set(path,next);}
 for(const path of [directory,manifestPath])try{await lstat(resolve(root,path));throw Error('NEW_IMMUTABLE_AUTHENTICATED_SOURCE_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}
 const files=[...buffers].map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})).sort((a,b)=>a.path.localeCompare(b.path));
 if(files.length!==344)throw Error('EXACT_AUTHENTICATED_SOURCE_INVENTORY_REQUIRED');
 const manifest={version:1,status:'FROZEN_LOCAL_PAYMENT_DIAGNOSTIC_AUTHENTICATED_NOT_DEPLOYED',candidate:'payment-diagnostic-authenticated-bazaar-2026-10-12',sourceDirectory:directory,sourceDigest:sourceDigest(files),parentSourceDigest:base.sourceDigest,parentManifestSha256:baseSha,changedPaths:paths,reviewedRuntimePins:pins,files,providerUnchanged:true,productionPublished:false,newPayments:0,cronActivated:false,networkRequests:0,dpapiReads:0};
 for(const [p,b]of buffers){const out=resolve(root,directory,p);await mkdir(dirname(out),{recursive:true});await writeFile(out,b,{flag:'wx'});}
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await writeFile(resolve(root,manifestPath),bytes,{flag:'wx'});
 console.log(JSON.stringify({status:manifest.status,sourceDigest:manifest.sourceDigest,manifestSha256:sha(bytes),files:files.length,changedPaths:paths,manifestPath,newPayments:0,productionPublished:false,networkRequests:0,dpapiReads:0}));
}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED_OFFLINE_AUTHENTICATED_SOURCE',code:/^[A-Z_]{3,90}$/.test(e.message??'')?e.message:'OFFLINE_SOURCE_UNCONFIRMED',newPayments:0,productionPublished:false,networkRequests:0}));process.exitCode=1;}
